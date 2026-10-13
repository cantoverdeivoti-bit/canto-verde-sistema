"use server";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { colunasParaProjetoNovo } from "@/lib/tarefas-colunas";
import {
  podeMover,
  podeNascerEm,
  statusDaEtapa,
  type ExigenciaMovimento,
  type TarefaEmMovimento,
} from "@/lib/tarefas-fluxo";
import { quadrosVisiveis } from "@/lib/tarefas-consulta";
import { etiquetaComNomeDePessoa, mesmaEtiqueta, normalizarEtiqueta } from "@/lib/tarefas-etiquetas";
import { papelEfetivo, podeNaTarefa, type AcaoTarefa } from "@/lib/tarefas-permissoes";
import { colunaParaNascer, nivelDaFilha, podeTerFilha, podeVincular } from "@/lib/tarefas-subtarefas";
import {
  atualizarTarefaSchema,
  cancelarTarefaSchema,
  comentarioSchema,
  criarProjetoSchema,
  criarTarefaSchema,
  etiquetaSchema,
  membroProjetoSchema,
  moverTarefaSchema,
  subtarefaSchema,
  vincularPaiSchema,
} from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

/**
 * O quadro: criar, mover, concluir e registrar tudo isso.
 *
 * Duas coisas valem para toda ação deste arquivo.
 *
 * A PRIMEIRA é que nenhuma escrita acontece fora de uma transação que grava,
 * junto, a linha de `log_atividade`. O log ser subproduto da mesma transação —
 * e não uma chamada depois, que pode falhar sozinha — é o que torna o RN-037
 * verdade em vez de intenção. Movimento de coluna grava ainda um terceiro
 * registro, em `movimentos_coluna`, que é o que alimenta o relatório de tempo
 * por coluna lá na frente.
 *
 * A SEGUNDA é que a regra é conferida aqui de novo, mesmo a tela já tendo
 * conferido. Ação de servidor é endpoint HTTP: chega POST sem passar por tela
 * nenhuma, e `lib/tarefas-fluxo.ts` existe justamente para as duas pontas
 * cobrarem a mesma coisa sem duplicar a tabela de decisão.
 */

/**
 * O resultado das ações, com um campo a mais que o `Result<T>` das outras.
 *
 * `exige` diz QUAL campo faltou quando a máquina de estados recusou. É o que
 * permite a linha abrir o campo certo ali mesmo — "quem vai fazer?", "esperando
 * o quê?" — em vez de mostrar um erro e deixar a pessoa adivinhar. Nulo quer
 * dizer que não há campo que resolva: o caminho não existe.
 */
type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; exige?: ExigenciaMovimento | null };

type Tx = Prisma.TransactionClient;

/** Meio-dia UTC, a convenção de `diaISO` — data de calendário não tem hora. */
function comoDia(dia: string | null | undefined): Date | null | undefined {
  if (dia === undefined) return undefined;
  if (dia === null) return null;
  return new Date(`${dia}T12:00:00Z`);
}

/**
 * Uma linha no histórico. Sempre dentro da transação de quem chamou.
 *
 * `valorAntes` e `valorDepois` são Json para caber data, número, texto e nulo
 * sem uma coluna por tipo. `undefined` não grava nada; `null` grava o nulo de
 * verdade, que é diferente — "o prazo foi apagado" é uma informação.
 */
async function registrar(
  tx: Tx,
  dados: {
    entidade: string;
    entidadeId: number;
    acao: string;
    campo?: string;
    valorAntes?: Prisma.InputJsonValue | null;
    valorDepois?: Prisma.InputJsonValue | null;
    usuarioId: number | null;
  },
) {
  await tx.logAtividade.create({
    data: {
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      acao: dados.acao,
      campo: dados.campo ?? null,
      valorAntes: dados.valorAntes === null ? Prisma.JsonNull : dados.valorAntes,
      valorDepois: dados.valorDepois === null ? Prisma.JsonNull : dados.valorDepois,
      usuarioId: dados.usuarioId,
      origem: "APP",
    },
  });
}

/**
 * A tarefa com tudo que decidir sobre ela exige: o quadro, as colunas e o
 * papel de quem está pedindo.
 *
 * Uma consulta só. Fazer em três — tarefa, depois projeto, depois papel —
 * deixaria a permissão ser lida de um estado do banco e a regra, de outro.
 */
async function abrirTarefa(tarefaId: number) {
  const user = await requireModule("tarefas");

  const tarefa = await prisma.tarefa.findFirst({
    where: { id: tarefaId, excluidoEm: null },
    include: {
      coluna: true,
      projeto: {
        include: {
          colunas: { orderBy: { ordem: "asc" } },
          membros: { where: { userId: user.id }, select: { papel: true } },
        },
      },
    },
  });
  if (!tarefa) return null;

  return {
    user,
    tarefa,
    papel: papelEfetivo(user, tarefa.projeto.membros[0]?.papel ?? null),
    ehMinha: tarefa.responsavelId === user.id,
  };
}

/** Quantas abertas esta pessoa já tem nesta coluna, sem contar a que se move. */
async function wipDaPessoa(colunaId: number, responsavelId: number, exceto: number) {
  return prisma.tarefa.count({
    where: {
      colunaId,
      responsavelId,
      status: "ABERTA",
      excluidoEm: null,
      id: { not: exceto },
    },
  });
}

/** A última posição da coluna. O menu "Mover" sempre põe no fim. */
async function fimDaColuna(tx: Tx, colunaId: number): Promise<Prisma.Decimal> {
  const ultima = await tx.tarefa.findFirst({
    where: { colunaId, excluidoEm: null },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  return (ultima?.ordem ?? new Prisma.Decimal(0)).plus(100);
}

const naoAutorizado = (acao: AcaoTarefa): { ok: false; message: string } => ({
  ok: false,
  message:
    acao === "cancelar"
      ? "Só o gestor ou um editor cancela tarefa. Peça a quem responde pelo quadro."
      : "Você não tem permissão para isto neste quadro.",
});

/**
 * Um quadro novo, já com as oito colunas.
 *
 * As colunas não são escolhidas na criação: vêm do modelo da empresa, em
 * `lib/tarefas-colunas.ts`. É o RF-060, e é o que impede o quadro novo de
 * nascer com o oitavo conjunto diferente de etapas — que é como a conta do
 * TickTick chegou onde chegou.
 *
 * Quem cria entra como GESTOR na mesma transação. O papel global já daria isso
 * ao Dono e ao Gerente, mas a linha em `membros_projeto` é o que faz o quadro
 * ter um responsável visível na tela de membros, em vez de um dono implícito
 * que só o código conhece.
 */
export async function criarProjeto(
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const user = await requireModule("tarefas", { configure: true });

  const parsed = criarProjetoSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  try {
    const projeto = await prisma.$transaction(async (tx) => {
      const criado = await tx.projeto.create({
        data: {
          nome: dados.nome,
          descricao: dados.descricao ?? null,
          setorId: dados.setorId ?? null,
          privado: dados.privado,
          donoId: user.id,
          colunas: { create: colunasParaProjetoNovo() },
          membros: { create: { userId: user.id, papel: "GESTOR" } },
        },
        select: { id: true, nome: true },
      });

      await registrar(tx, {
        entidade: "projeto",
        entidadeId: criado.id,
        acao: "criou",
        valorDepois: criado.nome,
        usuarioId: user.id,
      });

      return criado;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: projeto.id } };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "Já existe um quadro com esse nome." };
    }
    console.error("[criarProjeto] falha:", err);
    return { ok: false, message: "Não foi possível criar o quadro." };
  }
}

/**
 * Uma tarefa nova, na coluna em que o "+" foi apertado (RF-003).
 *
 * Nascer não é mover: não há caminho a validar, porque a tarefa não vinha de
 * lugar nenhum. O que continua valendo é o que a etapa cobra de quem está
 * nela — dono fora do BACKLOG, motivo e previsão no AGUARDANDO. Quem sabe
 * disso é `podeNascerEm`, e não este arquivo.
 *
 * O executor só cria tarefa para si mesmo (matriz 14.2), e em vez de recusar
 * quando ele escolhe outra pessoa, a ação corrige para ele: o botão dele nem
 * mostra o campo, então um `responsavelId` diferente chegando aqui veio de
 * fora da tela.
 */
export async function criarTarefa(
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const user = await requireModule("tarefas");

  const parsed = criarTarefaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  const projeto = await prisma.projeto.findFirst({
    where: { id: dados.projetoId, arquivadoEm: null },
    include: {
      colunas: true,
      membros: { where: { userId: user.id }, select: { papel: true } },
    },
  });
  if (!projeto) return { ok: false, message: "Quadro não encontrado." };

  const papel = papelEfetivo(user, projeto.membros[0]?.papel ?? null);
  if (!podeNaTarefa(papel, "criarTarefa", true)) return naoAutorizado("criarTarefa");

  const coluna = projeto.colunas.find((c) => c.id === dados.colunaId);
  if (!coluna) return { ok: false, message: "Coluna não encontrada neste quadro." };

  const responsavelId =
    papel === "EXECUTOR" ? user.id : (dados.responsavelId ?? null);

  const cartao: TarefaEmMovimento = {
    temResponsavel: responsavelId !== null,
    // Motivo e previsão do AGUARDANDO não cabem no formulário de uma linha; o
    // cartão nasce em outra coluna e é movido para lá, que é quando a tela
    // pergunta. Documento e recorrência, idem.
    aguardandoPreenchido: false,
    temRecorrencia: false,
    temDocumento: false,
    checklistPendente: 0,
    ehGestor: papel === "GESTOR",
    wip: null,
  };

  const veredito = podeNascerEm(coluna.estado, cartao);
  if (!veredito.ok) {
    return { ok: false, message: veredito.motivo, exige: veredito.exige };
  }

  try {
    const criada = await prisma.$transaction(async (tx) => {
      const tarefa = await tx.tarefa.create({
        data: {
          projetoId: projeto.id,
          colunaId: coluna.id,
          titulo: dados.titulo,
          prioridade: dados.prioridade,
          responsavelId,
          setorId: projeto.setorId,
          prazo: comoDia(dados.prazo) ?? null,
          prazoDiaInteiro: true,
          status: statusDaEtapa(coluna.estado),
          ordem: await fimDaColuna(tx, coluna.id),
          criadoPorId: user.id,
          atualizadoPorId: user.id,
        },
        select: { id: true, titulo: true },
      });

      // O nascimento é o primeiro movimento. Sem esta linha, o tempo que o
      // cartão passa na coluna em que nasceu não existiria no relatório — e é
      // justamente o BACKLOG, onde as coisas mais ficam paradas.
      await tx.movimentoColuna.create({
        data: {
          tarefaId: tarefa.id,
          colunaOrigemId: null,
          estadoOrigem: null,
          colunaDestinoId: coluna.id,
          estadoDestino: coluna.estado,
          usuarioId: user.id,
        },
      });

      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "criou",
        valorDepois: tarefa.titulo,
        usuarioId: user.id,
      });

      return tarefa;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: criada.id } };
  } catch (err) {
    console.error("[criarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível criar a tarefa." };
  }
}

/** Um quadro como o "+" do canto o oferece: só as colunas onde dá para nascer. */
export type QuadroParaNovaTarefa = {
  id: number;
  nome: string;
  colunas: { id: number; nome: string }[];
};

/**
 * Onde esta pessoa pode criar tarefa agora — o que o "+" do canto pergunta ao
 * abrir.
 *
 * É ação, e não dado que o layout carrega, de propósito: o botão está em toda
 * tela do módulo e quase nunca é tocado. Carregar quadros e colunas a cada
 * navegação seria uma ida ao banco por tela para servir um toque de vez em
 * quando; aqui ela acontece só quando alguém abre o painel.
 *
 * As colunas já vêm filtradas pela mesma regra que `criarTarefa` cobra
 * (`podeNascerEm`), com o cartão que o "+" monta: dono é quem digita, sem
 * motivo de espera, sem documento, sem recorrência. Assim a lista não oferece
 * AGUARDANDO, DOCUMENTADO ou ROTINA para depois recusar com erro — o caminho
 * que não existe nem aparece. Coluna oculta (RF-063) também fica de fora,
 * como no quadro.
 */
export async function quadrosParaNovaTarefa(): Promise<
  Resultado<{ quadros: QuadroParaNovaTarefa[]; souEu: number }>
> {
  const user = await requireModule("tarefas");

  try {
    const projetos = await prisma.projeto.findMany({
      where: { arquivadoEm: null, ...quadrosVisiveis(user) },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        membros: { where: { userId: user.id }, select: { papel: true } },
        colunas: {
          where: { oculta: false },
          orderBy: { ordem: "asc" },
          select: { id: true, nome: true, estado: true },
        },
      },
    });

    const quadros: QuadroParaNovaTarefa[] = [];
    for (const p of projetos) {
      const papel = papelEfetivo(user, p.membros[0]?.papel ?? null);
      if (!podeNaTarefa(papel, "criarTarefa", true)) continue;
      const cartao: TarefaEmMovimento = {
        temResponsavel: true,
        aguardandoPreenchido: false,
        temRecorrencia: false,
        temDocumento: false,
        checklistPendente: 0,
        ehGestor: papel === "GESTOR",
        wip: null,
      };
      const colunas = p.colunas
        .filter((c) => podeNascerEm(c.estado, cartao).ok)
        .map((c) => ({ id: c.id, nome: c.nome }));
      if (colunas.length > 0) quadros.push({ id: p.id, nome: p.nome, colunas });
    }

    return { ok: true, data: { quadros, souEu: user.id } };
  } catch (err) {
    console.error("[quadrosParaNovaTarefa] falha:", err);
    return { ok: false, message: "Não foi possível carregar os quadros." };
  }
}

/**
 * Mover o cartão — e, quando o destino é CONCLUÍDO, concluir a tarefa.
 *
 * As duas coisas são uma só (RF-175). No TickTick são duas, e é por isso que
 * lá existe cartão parado na coluna CONCLUÍDO ainda aberto, e cartão marcado
 * como concluído no meio do quadro. Aqui o status sai de `statusDaEtapa` e de
 * lugar nenhum mais.
 *
 * Os campos que a máquina de estados exige chegam JUNTO com o movimento, e não
 * numa gravação anterior. Se fossem duas ações, o cartão poderia ficar com a
 * previsão preenchida sem ter se movido — ou movido para AGUARDANDO com a
 * segunda ação falhando, que é exatamente o buraco que o N07 fecha.
 *
 * A trava contra dois movimentos ao mesmo tempo é a condição do próprio
 * UPDATE, como em `receberPedido`: entre ler "o cartão está em A FAZER" e
 * gravar existe uma janela, e dois celulares no mesmo cartão é o caso normal
 * numa cozinha, não a exceção. Quem chegar segundo atualiza zero linhas e a
 * transação volta atrás inteira.
 */
export async function moverTarefa(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;

  if (!podeNaTarefa(papel, "mover", ehMinha)) return naoAutorizado("mover");

  const parsed = moverTarefaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  const destino = tarefa.projeto.colunas.find((c) => c.id === dados.colunaDestinoId);
  if (!destino) return { ok: false, message: "Coluna não encontrada neste quadro." };
  if (destino.id === tarefa.colunaId) return { ok: true, data: { id: tarefa.id } };

  // O que vale é o campo novo, quando veio; o que já estava gravado, quando
  // não veio. É isso que deixa mover um cartão que JÁ tem dono sem a tela
  // perguntar de novo quem é.
  const responsavelId =
    dados.responsavelId !== undefined ? dados.responsavelId : tarefa.responsavelId;
  const aguardandoDescricao =
    dados.aguardandoDescricao !== undefined
      ? dados.aguardandoDescricao
      : tarefa.aguardandoDescricao;
  const aguardandoPrevisao =
    dados.aguardandoPrevisao !== undefined
      ? (comoDia(dados.aguardandoPrevisao) ?? null)
      : tarefa.aguardandoPrevisao;
  const documentoUrl =
    dados.documentoUrl !== undefined ? dados.documentoUrl : tarefa.documentoUrl;

  const wip =
    destino.wipPorPessoa !== null && responsavelId !== null
      ? {
          limite: destino.wipPorPessoa,
          jaTem: await wipDaPessoa(destino.id, responsavelId, tarefa.id),
          bloquear: tarefa.projeto.wipBloqueia,
        }
      : null;

  const veredito = podeMover(tarefa.coluna.estado, destino.estado, {
    temResponsavel: responsavelId !== null,
    aguardandoPreenchido: Boolean(aguardandoDescricao && aguardandoPrevisao),
    temRecorrencia: false,
    temDocumento: Boolean(documentoUrl),
    checklistPendente: 0,
    ehGestor: papel === "GESTOR",
    wip,
  });
  if (!veredito.ok) {
    return { ok: false, message: veredito.motivo, exige: veredito.exige };
  }

  const status = statusDaEtapa(destino.estado);
  const concluindo = status === "CONCLUIDA" && tarefa.status !== "CONCLUIDA";
  const reabrindo = status === "ABERTA" && tarefa.status === "CONCLUIDA";

  try {
    const passou = await prisma
      .$transaction(async (tx) => {
        const trava = await tx.tarefa.updateMany({
          where: { id: tarefa.id, colunaId: tarefa.colunaId, excluidoEm: null },
          data: {
            colunaId: destino.id,
            status,
            ordem: await fimDaColuna(tx, destino.id),
            responsavelId,
            aguardandoDescricao,
            aguardandoPrevisao,
            documentoUrl,
            atualizadoPorId: user.id,
            // Guardado na conclusão, e não deduzido do log: é por ele que
            // `reabrirTarefa` devolve o cartão à coluna exata de antes (K6).
            colunaAnteriorId: concluindo ? tarefa.colunaId : tarefa.colunaAnteriorId,
            concluidoPorId: concluindo ? user.id : reabrindo ? null : undefined,
            concluidoEm: concluindo ? new Date() : reabrindo ? null : undefined,
          },
        });
        if (trava.count === 0) throw new Error("JA_FOI_MOVIDA");

        await tx.movimentoColuna.create({
          data: {
            tarefaId: tarefa.id,
            colunaOrigemId: tarefa.colunaId,
            estadoOrigem: tarefa.coluna.estado,
            colunaDestinoId: destino.id,
            estadoDestino: destino.estado,
            usuarioId: user.id,
          },
        });

        await registrar(tx, {
          entidade: "tarefa",
          entidadeId: tarefa.id,
          acao: concluindo ? "concluiu" : reabrindo ? "reabriu" : "moveu",
          campo: "coluna",
          valorAntes: tarefa.coluna.nome,
          valorDepois: destino.nome,
          usuarioId: user.id,
        });

        return true;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "JA_FOI_MOVIDA") return false;
        throw err;
      });

    if (!passou) {
      return {
        ok: false,
        message:
          "Alguém moveu este cartão enquanto você decidia. Recarregue para ver onde ele está.",
      };
    }

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[moverTarefa] falha:", err);
    return { ok: false, message: "Não foi possível mover o cartão." };
  }
}

/**
 * O check do cartão. É `moverTarefa` para a coluna de concluído, e nada mais.
 *
 * Existe como ação própria porque a tela tem um check, não porque a regra seja
 * outra: marcar e arrastar para CONCLUÍDO precisam cobrar o mesmo checklist e
 * gravar o mesmo movimento. Uma segunda implementação divergiria no primeiro
 * dia em que alguém mexesse numa só.
 */
export async function concluirTarefa(
  tarefaId: number,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };

  if (!podeNaTarefa(ctx.papel, "concluir", ctx.ehMinha)) return naoAutorizado("concluir");

  const conclusao = ctx.tarefa.projeto.colunas.find(
    (c) => c.estado === "CONCLUIDO" && !c.oculta,
  );
  if (!conclusao) {
    return { ok: false, message: "Este quadro não tem coluna de concluído." };
  }

  return moverTarefa(tarefaId, { colunaDestinoId: conclusao.id });
}

/**
 * Reabrir: o cartão volta para a coluna exata de onde saiu (K6).
 *
 * `colunaAnteriorId` foi gravado na conclusão justamente para isto. Deduzir do
 * histórico funcionaria hoje e deixaria de funcionar no dia em que o log for
 * arquivado — e o caminho de volta não pode depender de um registro que existe
 * para ser lido, não para ser usado como estado.
 */
export async function reabrirTarefa(
  tarefaId: number,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { tarefa, papel, ehMinha } = ctx;

  if (!podeNaTarefa(papel, "mover", ehMinha)) return naoAutorizado("mover");
  if (tarefa.status === "ABERTA") return { ok: true, data: { id: tarefa.id } };

  const volta =
    tarefa.projeto.colunas.find((c) => c.id === tarefa.colunaAnteriorId && !c.oculta) ??
    // A coluna de onde ela saiu pode ter sido ocultada desde então. EM
    // ANDAMENTO é a volta honesta: a tarefa está sendo retomada.
    tarefa.projeto.colunas.find((c) => c.estado === "EXECUCAO" && !c.oculta);
  if (!volta) return { ok: false, message: "Não há coluna para onde voltar." };

  return moverTarefa(tarefaId, { colunaDestinoId: volta.id });
}

/**
 * Editar a ficha da tarefa.
 *
 * A permissão é conferida POR CAMPO, e não pela ação inteira, porque a matriz
 * 14.2 separa três coisas que caem todas neste formulário: editar o texto,
 * mudar o prazo e atribuir a outra pessoa. O executor faz as duas primeiras
 * nas tarefas dele e não faz a terceira em nenhuma — juntar tudo sob "editar"
 * daria a ele o poder de se livrar de uma tarefa passando para o colega.
 *
 * Cada campo alterado vira uma linha do histórico, com o valor de antes e o de
 * depois. É o que permite responder "quem mudou este prazo, e para quando
 * estava?" um mês depois.
 */
export async function atualizarTarefa(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;

  const parsed = atualizarTarefaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  const mudouTexto =
    dados.titulo !== undefined ||
    dados.descricao !== undefined ||
    dados.prioridade !== undefined ||
    dados.documentoUrl !== undefined;
  const mudouPrazo = dados.prazo !== undefined;
  const mudouDono =
    dados.responsavelId !== undefined && dados.responsavelId !== tarefa.responsavelId;

  if (mudouTexto && !podeNaTarefa(papel, "editar", ehMinha)) return naoAutorizado("editar");
  if (mudouPrazo && !podeNaTarefa(papel, "mudarPrazo", ehMinha))
    return naoAutorizado("mudarPrazo");
  if (mudouDono && !podeNaTarefa(papel, "atribuir", ehMinha)) return naoAutorizado("atribuir");

  // Tirar o dono de uma tarefa que já saiu do BACKLOG deixaria o cartão fora
  // da regra que o fez sair de lá (RN-010) — e sem ninguém para cobrar.
  if (
    dados.responsavelId === null &&
    tarefa.responsavelId !== null &&
    tarefa.coluna.estado !== "ENTRADA"
  ) {
    return {
      ok: false,
      message: "Fora do BACKLOG a tarefa precisa de um dono. Escolha outra pessoa.",
      exige: "responsavel",
    };
  }

  const prazoNovo = comoDia(dados.prazo);
  // Adiar é empurrar para a frente. Antecipar não conta, e tirar o prazo
  // também não: RN-024 quer marcar quem foge do compromisso, não quem o muda.
  const adiou =
    prazoNovo != null &&
    tarefa.prazo != null &&
    prazoNovo.getTime() > tarefa.prazo.getTime();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tarefa.update({
        where: { id: tarefa.id },
        data: {
          titulo: dados.titulo,
          descricao: dados.descricao,
          prioridade: dados.prioridade,
          responsavelId: dados.responsavelId,
          documentoUrl: dados.documentoUrl,
          prazo: prazoNovo,
          atualizadoPorId: user.id,
          qtdAdiamentos: adiou ? { increment: 1 } : undefined,
        },
      });

      const campos: Array<[string, unknown, unknown]> = [];
      if (dados.titulo !== undefined && dados.titulo !== tarefa.titulo)
        campos.push(["titulo", tarefa.titulo, dados.titulo]);
      if (dados.descricao !== undefined && dados.descricao !== tarefa.descricao)
        campos.push(["descricao", tarefa.descricao, dados.descricao]);
      if (dados.prioridade !== undefined && dados.prioridade !== tarefa.prioridade)
        campos.push(["prioridade", tarefa.prioridade, dados.prioridade]);
      if (mudouDono)
        campos.push(["responsavel", tarefa.responsavelId, dados.responsavelId ?? null]);
      if (dados.documentoUrl !== undefined && dados.documentoUrl !== tarefa.documentoUrl)
        campos.push(["documento", tarefa.documentoUrl, dados.documentoUrl]);
      if (mudouPrazo)
        campos.push([
          "prazo",
          tarefa.prazo?.toISOString() ?? null,
          prazoNovo?.toISOString() ?? null,
        ]);

      for (const [campo, antes, depois] of campos) {
        await registrar(tx, {
          entidade: "tarefa",
          entidadeId: tarefa.id,
          acao: "alterou",
          campo,
          valorAntes: (antes ?? null) as Prisma.InputJsonValue | null,
          valorDepois: (depois ?? null) as Prisma.InputJsonValue | null,
          usuarioId: user.id,
        });
      }
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[atualizarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível salvar." };
  }
}

/**
 * Cancelar com motivo obrigatório (RF-176).
 *
 * O "Não farei" do TickTick não pergunta nada, e um ano depois ninguém sabe se
 * as tarefas morreram por falta de gente, de dinheiro ou porque alguém as
 * duplicou. A lista fechada é o que faz o relatório de cancelamentos ter o que
 * agrupar.
 *
 * Cancelada NÃO vai para a coluna de concluído: ela não foi feita, e misturar
 * as duas na mesma coluna estragaria a única métrica que interessa ali. O
 * cartão fica onde está, marcado.
 */
export async function cancelarTarefa(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;

  if (!podeNaTarefa(papel, "cancelar", ehMinha)) return naoAutorizado("cancelar");

  const parsed = cancelarTarefaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Escolha um motivo" };
  }
  const dados = parsed.data;
  if (dados.motivo === "OUTRO" && !dados.texto) {
    return { ok: false, message: "Diga em uma linha por que esta tarefa não vai acontecer." };
  }

  try {
    const feito = await prisma.tarefa.updateMany({
      where: { id: tarefa.id, status: { not: "CANCELADA" }, excluidoEm: null },
      data: {
        status: "CANCELADA",
        motivoCancelamento: dados.motivo,
        textoCancelamento: dados.texto ?? null,
        atualizadoPorId: user.id,
      },
    });
    if (feito.count === 0) return { ok: false, message: "Esta tarefa já estava cancelada." };

    await prisma.$transaction(async (tx) => {
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "cancelou",
        campo: "motivo",
        valorDepois: dados.motivo,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[cancelarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível cancelar." };
  }
}

/**
 * Para a lixeira, de onde volta por 30 dias (RF-179).
 *
 * Exclusão reversível porque a alternativa, num celular usado com a mão suja
 * no meio do serviço, é perder trabalho por toque errado. O que some da tela
 * continua no banco, e o histórico registra quem mandou sumir.
 */
export async function excluirTarefa(tarefaId: number): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel } = ctx;

  // "Própria", aqui, é a que a pessoa criou — não a que ela executa. É o que a
  // linha do editor na matriz 14.2 diz: "as que criou".
  if (!podeNaTarefa(papel, "excluir", tarefa.criadoPorId === user.id)) {
    return naoAutorizado("excluir");
  }

  // Tarefa com subtarefa não vai sozinha para a lixeira. As filhas sairiam do
  // quadro junto (subtarefa não é cartão) sem ninguém ter decidido isso, e
  // voltariam penduradas num pai que ninguém enxerga. Melhor dizer o que fazer.
  const filhas = await prisma.tarefa.count({
    where: { tarefaPaiId: tarefa.id, excluidoEm: null },
  });
  if (filhas > 0) {
    return {
      ok: false,
      message: `Tem ${plural(filhas, "subtarefa")}. Exclua ou desvincule antes.`,
    };
  }

  try {
    const feito = await prisma.tarefa.updateMany({
      where: { id: tarefa.id, excluidoEm: null },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    if (feito.count === 0) return { ok: false, message: "Esta tarefa já estava na lixeira." };

    await prisma.$transaction(async (tx) => {
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "excluiu",
        valorAntes: tarefa.titulo,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[excluirTarefa] falha:", err);
    return { ok: false, message: "Não foi possível excluir." };
  }
}

/** De volta da lixeira, para a coluna em que estava. */
export async function restaurarTarefa(
  tarefaId: number,
): Promise<Resultado<{ id: number }>> {
  const user = await requireModule("tarefas");

  const tarefa = await prisma.tarefa.findFirst({
    where: { id: tarefaId, excluidoEm: { not: null } },
    include: {
      projeto: { include: { membros: { where: { userId: user.id }, select: { papel: true } } } },
    },
  });
  if (!tarefa) return { ok: false, message: "Tarefa não encontrada na lixeira." };

  const papel = papelEfetivo(user, tarefa.projeto.membros[0]?.papel ?? null);
  // "Própria", em restaurar, é a que a pessoa mesma excluiu.
  if (!podeNaTarefa(papel, "restaurar", tarefa.excluidoPorId === user.id)) {
    return naoAutorizado("restaurar");
  }

  // Subtarefa não é cartão: voltar embaixo de um pai que está na lixeira a
  // deixaria sem lugar nenhum para aparecer.
  if (tarefa.tarefaPaiId !== null) {
    const pai = await prisma.tarefa.findUnique({
      where: { id: tarefa.tarefaPaiId },
      select: { id: true, excluidoEm: true },
    });
    if (pai?.excluidoEm) {
      return {
        ok: false,
        message: `A tarefa pai (T-${pai.id}) está na lixeira. Restaure ela antes.`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tarefa.update({
        where: { id: tarefa.id },
        data: { excluidoEm: null, excluidoPorId: null, atualizadoPorId: user.id },
      });
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "restaurou",
        valorDepois: tarefa.titulo,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[restaurarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível restaurar." };
  }
}

/**
 * Comentar.
 *
 * O leitor comenta — é a única coisa que ele faz, e está na matriz 14.2. Faz
 * sentido: quem acompanha sem executar ainda precisa poder dizer "o fornecedor
 * ligou, vem na terça".
 *
 * O comentário entra no histórico como qualquer outra ação, e não numa lista
 * separada: a tela da tarefa mostra conversa e movimento na mesma linha do
 * tempo, porque a pergunta de quem abre é "o que aconteceu aqui", não "o que
 * foi dito aqui".
 */
export async function comentar(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel } = ctx;

  if (!podeNaTarefa(papel, "comentar")) return naoAutorizado("comentar");

  const parsed = comentarioSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Escreva alguma coisa" };
  }

  try {
    const comentario = await prisma.$transaction(async (tx) => {
      const criado = await tx.comentario.create({
        data: { tarefaId: tarefa.id, autorId: user.id, texto: parsed.data.texto },
        select: { id: true },
      });
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "comentou",
        usuarioId: user.id,
      });
      return criado;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: comentario.id } };
  } catch (err) {
    console.error("[comentar] falha:", err);
    return { ok: false, message: "Não foi possível comentar." };
  }
}

/**
 * Pôr alguém no quadro, ou mudar o papel de quem já está.
 *
 * Uma ação só para as duas coisas: a tela de membros é uma lista com um
 * seletor de papel por linha, e separar "adicionar" de "mudar papel" criaria
 * dois caminhos para o mesmo gesto.
 */
export async function salvarMembro(
  projetoId: number,
  entrada: unknown,
): Promise<Resultado<{ userId: number }>> {
  const user = await requireModule("tarefas");

  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: { membros: { where: { userId: user.id }, select: { papel: true } } },
  });
  if (!projeto) return { ok: false, message: "Quadro não encontrado." };

  const papel = papelEfetivo(user, projeto.membros[0]?.papel ?? null);
  if (!podeNaTarefa(papel, "gerenciarMembros")) return naoAutorizado("gerenciarMembros");

  const parsed = membroProjetoSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const dados = parsed.data;

  const pessoa = await prisma.adminUser.findFirst({
    where: { id: dados.userId, isActive: true },
    select: { id: true, name: true, username: true },
  });
  // Desligado não aparece na escolha (RN-034), e continua visível no histórico
  // das tarefas que fez — que é por onde o nome dele deve aparecer.
  if (!pessoa) return { ok: false, message: "Pessoa não encontrada ou desligada." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.membroProjeto.upsert({
        where: { projetoId_userId: { projetoId, userId: dados.userId } },
        create: { projetoId, userId: dados.userId, papel: dados.papel },
        update: { papel: dados.papel },
      });
      await registrar(tx, {
        entidade: "projeto",
        entidadeId: projetoId,
        acao: "alterou",
        campo: "membro",
        valorDepois: `${pessoa.name ?? pessoa.username}: ${dados.papel}`,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { userId: dados.userId } };
  } catch (err) {
    console.error("[salvarMembro] falha:", err);
    return { ok: false, message: "Não foi possível salvar o membro." };
  }
}

/**
 * Tirar alguém do quadro.
 *
 * Não pode sair quem ainda tem tarefa aberta ali: a tarefa ficaria com um dono
 * que não enxerga mais o quadro, e ninguém saberia disso até o prazo passar.
 * Redistribua primeiro — a recusa diz quantas são.
 *
 * O dono do projeto também não sai (RN-017): quadro sem dono é quadro sem
 * quem responda por ele.
 */
export async function removerMembro(
  projetoId: number,
  userId: number,
): Promise<Resultado<null>> {
  const user = await requireModule("tarefas");

  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: { membros: { where: { userId: user.id }, select: { papel: true } } },
  });
  if (!projeto) return { ok: false, message: "Quadro não encontrado." };

  const papel = papelEfetivo(user, projeto.membros[0]?.papel ?? null);
  if (!podeNaTarefa(papel, "gerenciarMembros")) return naoAutorizado("gerenciarMembros");

  if (projeto.donoId === userId) {
    return { ok: false, message: "Quem é dono do quadro não pode sair dele." };
  }

  const abertas = await prisma.tarefa.count({
    where: { projetoId, responsavelId: userId, status: "ABERTA", excluidoEm: null },
  });
  if (abertas > 0) {
    return {
      ok: false,
      message:
        abertas === 1
          ? "Tem 1 tarefa aberta com esta pessoa. Passe para outra antes de tirá-la do quadro."
          : `Tem ${abertas} tarefas abertas com esta pessoa. Passe para outra antes de tirá-la do quadro.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.membroProjeto.deleteMany({ where: { projetoId, userId } });
      await registrar(tx, {
        entidade: "projeto",
        entidadeId: projetoId,
        acao: "alterou",
        campo: "membro",
        valorAntes: String(userId),
        valorDepois: null,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: null };
  } catch (err) {
    console.error("[removerMembro] falha:", err);
    return { ok: false, message: "Não foi possível remover." };
  }
}

// ---------------------------------------------------------------------------
// O menu da tarefa: fixar, duplicar, subtarefa, tarefa pai, etiqueta, anexo
// ---------------------------------------------------------------------------

/**
 * O cartão de quem nasce de outra tarefa (cópia ou subtarefa), para a
 * máquina de estados decidir a coluna. Sem espera, sem documento e sem
 * recorrência: isso é da tarefa de origem, e copiar seria mentir sobre a nova.
 */
function cartaoQueNasce(temResponsavel: boolean, ehGestor: boolean): TarefaEmMovimento {
  return {
    temResponsavel,
    aguardandoPreenchido: false,
    temRecorrencia: false,
    temDocumento: false,
    checklistPendente: 0,
    ehGestor,
    wip: null,
  };
}

/**
 * Fixar no topo da coluna, ou soltar.
 *
 * É arrumação do quadro, não da tarefa, mas quem pode mexer na tarefa pode
 * fixá-la: a mesma permissão de editar. Guardado como data para a fixada
 * mais recente vir primeiro.
 */
export async function fixarTarefa(
  tarefaId: number,
  fixar: boolean,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;
  if (!podeNaTarefa(papel, "editar", ehMinha)) return naoAutorizado("editar");

  try {
    await prisma.$transaction(async (tx) => {
      // A condição no próprio UPDATE: dois toques seguidos não gravam duas
      // linhas de log para um fixar só.
      const feito = await tx.tarefa.updateMany({
        where: { id: tarefa.id, fixadaEm: fixar ? null : { not: null } },
        data: { fixadaEm: fixar ? new Date() : null, atualizadoPorId: user.id },
      });
      if (feito.count === 0) return;
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: fixar ? "fixou" : "desafixou",
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[fixarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível fixar." };
  }
}

/**
 * Outra tarefa igual a esta.
 *
 * Vem junto o que descreve o trabalho: título, descrição, prioridade, quem
 * faz, prazo, etiquetas e o pai (a cópia de uma subtarefa é irmã dela). Não
 * vem o que é história desta tarefa: comentários, anexos, histórico, espera,
 * documento. Nem as subtarefas: copiar uma árvore inteira por um toque é o
 * tipo de coisa que enche o quadro sem ninguém perceber.
 *
 * A coluna sai de `colunaParaNascer`: a mesma da original quando dá, a
 * entrada quando a original está numa coluna que pede o que a cópia não tem.
 */
export async function duplicarTarefa(tarefaId: number): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel } = ctx;

  const acao: AcaoTarefa = tarefa.tarefaPaiId ? "criarSubtarefa" : "criarTarefa";
  // `true` como em `criarTarefa`: para o executor, "própria" é a que nasce
  // dele, e logo abaixo a cópia passa a ser dele.
  if (!podeNaTarefa(papel, acao, true)) return naoAutorizado(acao);

  const responsavelId = papel === "EXECUTOR" ? user.id : tarefa.responsavelId;
  const visiveis = tarefa.projeto.colunas.filter((c) => !c.oculta);
  const coluna = colunaParaNascer(
    tarefa.coluna,
    visiveis,
    cartaoQueNasce(responsavelId !== null, papel === "GESTOR"),
  );
  if (!coluna) return { ok: false, message: "Este quadro não tem coluna onde a cópia possa nascer." };

  const etiquetas = await prisma.tarefaEtiqueta.findMany({
    where: { tarefaId: tarefa.id },
    select: { etiquetaId: true },
  });

  try {
    const copia = await prisma.$transaction(async (tx) => {
      const nova = await tx.tarefa.create({
        data: {
          projetoId: tarefa.projetoId,
          colunaId: coluna.id,
          tarefaPaiId: tarefa.tarefaPaiId,
          nivel: tarefa.nivel,
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prioridade: tarefa.prioridade,
          responsavelId,
          setorId: tarefa.setorId,
          setorResponsavelId: tarefa.setorResponsavelId,
          prazo: tarefa.prazo,
          prazoDiaInteiro: tarefa.prazoDiaInteiro,
          status: statusDaEtapa(coluna.estado),
          ordem: await fimDaColuna(tx, coluna.id),
          criadoPorId: user.id,
          atualizadoPorId: user.id,
        },
        select: { id: true },
      });

      if (etiquetas.length > 0) {
        await tx.tarefaEtiqueta.createMany({
          data: etiquetas.map((e) => ({ tarefaId: nova.id, etiquetaId: e.etiquetaId })),
        });
      }

      await tx.movimentoColuna.create({
        data: {
          tarefaId: nova.id,
          colunaOrigemId: null,
          estadoOrigem: null,
          colunaDestinoId: coluna.id,
          estadoDestino: coluna.estado,
          usuarioId: user.id,
        },
      });

      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: nova.id,
        acao: "duplicou",
        valorAntes: tarefa.id,
        valorDepois: `T-${tarefa.id}`,
        usuarioId: user.id,
      });

      return nova;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: copia.id } };
  } catch (err) {
    console.error("[duplicarTarefa] falha:", err);
    return { ok: false, message: "Não foi possível duplicar." };
  }
}

/**
 * Uma subtarefa embaixo desta.
 *
 * Nasce na coluna do pai quando dá (`colunaParaNascer`), com o mesmo dono do
 * pai, ou com quem cria se o pai está sem dono. O executor, como em
 * `criarTarefa`, só cria para si.
 *
 * Subtarefa não é cartão do quadro: aparece dentro da tarefa pai, e o cartão
 * do pai diz quantas faltam. É o que mantém o kanban legível com uma tarefa
 * de vinte passos.
 */
export async function criarSubtarefa(
  paiId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(paiId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa: pai, papel } = ctx;

  if (!podeNaTarefa(papel, "criarSubtarefa", true)) return naoAutorizado("criarSubtarefa");

  const parsed = subtarefaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  if (pai.status !== "ABERTA") {
    return { ok: false, message: "A tarefa está fechada. Reabra antes de dividir em subtarefas." };
  }
  if (!podeTerFilha(pai.nivel)) {
    return { ok: false, message: "Esta já é uma subtarefa de terceiro nível. Abaixo dela não cabe outra." };
  }

  const responsavelId = papel === "EXECUTOR" ? user.id : (pai.responsavelId ?? user.id);
  const visiveis = pai.projeto.colunas.filter((c) => !c.oculta);
  const coluna = colunaParaNascer(pai.coluna, visiveis, cartaoQueNasce(true, papel === "GESTOR"));
  if (!coluna) return { ok: false, message: "Este quadro não tem coluna onde a subtarefa possa nascer." };

  try {
    const filha = await prisma.$transaction(async (tx) => {
      const nova = await tx.tarefa.create({
        data: {
          projetoId: pai.projetoId,
          colunaId: coluna.id,
          tarefaPaiId: pai.id,
          nivel: nivelDaFilha(pai.nivel),
          titulo: parsed.data.titulo,
          responsavelId,
          setorId: pai.setorId,
          status: statusDaEtapa(coluna.estado),
          ordem: await fimDaColuna(tx, coluna.id),
          criadoPorId: user.id,
          atualizadoPorId: user.id,
        },
        select: { id: true, titulo: true },
      });

      await tx.movimentoColuna.create({
        data: {
          tarefaId: nova.id,
          colunaOrigemId: null,
          estadoOrigem: null,
          colunaDestinoId: coluna.id,
          estadoDestino: coluna.estado,
          usuarioId: user.id,
        },
      });

      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: nova.id,
        acao: "criou",
        valorDepois: nova.titulo,
        usuarioId: user.id,
      });
      // E na tarefa pai, que é onde alguém vai procurar quando perguntar
      // "de onde saiu essa subtarefa?".
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: pai.id,
        acao: "subtarefa",
        valorDepois: `T-${nova.id} ${nova.titulo}`,
        usuarioId: user.id,
      });

      return nova;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: filha.id } };
  } catch (err) {
    console.error("[criarSubtarefa] falha:", err);
    return { ok: false, message: "Não foi possível criar a subtarefa." };
  }
}

/**
 * Pendurar esta tarefa embaixo de outra, ou soltá-la (`paiId` nulo).
 *
 * A árvore inteira vai junto: as filhas e netas desta tarefa mudam de nível
 * no mesmo tanto. A regra (sem ciclo, mesmo quadro, até três níveis) é de
 * `podeVincular`; aqui só se busca o que ela precisa saber. Duas consultas
 * bastam para achar os descendentes, porque abaixo da tarefa cabem no
 * máximo dois níveis.
 */
export async function vincularPai(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;
  if (!podeNaTarefa(papel, "editar", ehMinha)) return naoAutorizado("editar");

  const parsed = vincularPaiSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { paiId } = parsed.data;
  if (paiId === tarefa.tarefaPaiId) return { ok: true, data: { id: tarefa.id } };

  // Os descendentes contam mesmo na lixeira: restaurados, voltam para o
  // nível que a árvore tiver.
  const filhas = await prisma.tarefa.findMany({
    where: { tarefaPaiId: tarefa.id },
    select: { id: true },
  });
  const netas = filhas.length
    ? await prisma.tarefa.findMany({
        where: { tarefaPaiId: { in: filhas.map((f) => f.id) } },
        select: { id: true },
      })
    : [];
  const altura = netas.length > 0 ? 3 : filhas.length > 0 ? 2 : 1;

  let pai: { id: number; titulo: string; nivel: number } | null = null;
  if (paiId !== null) {
    const candidato = await prisma.tarefa.findFirst({
      where: { id: paiId, excluidoEm: null },
      select: { id: true, titulo: true, nivel: true, projetoId: true, status: true },
    });
    if (!candidato) return { ok: false, message: "A tarefa pai não existe mais." };
    const veredito = podeVincular({
      mesmaTarefa: candidato.id === tarefa.id,
      mesmoProjeto: candidato.projetoId === tarefa.projetoId,
      paiEhDescendente: [...filhas, ...netas].some((d) => d.id === candidato.id),
      paiAberto: candidato.status === "ABERTA",
      nivelDoPai: candidato.nivel,
      alturaDaTarefa: altura,
    });
    if (!veredito.ok) return { ok: false, message: veredito.motivo };
    pai = candidato;
  }

  const nivelNovo = pai ? nivelDaFilha(pai.nivel) : 1;
  const delta = nivelNovo - tarefa.nivel;

  try {
    await prisma.$transaction(async (tx) => {
      // A guarda no próprio UPDATE: se outra pessoa mudou o pai desta tarefa
      // entre a leitura e aqui, a árvore lida acima já não vale.
      const feito = await tx.tarefa.updateMany({
        where: { id: tarefa.id, tarefaPaiId: tarefa.tarefaPaiId },
        data: { tarefaPaiId: pai?.id ?? null, nivel: nivelNovo, atualizadoPorId: user.id },
      });
      if (feito.count === 0) throw new Error("concorrencia");
      if (delta !== 0) {
        const descendentes = [...filhas, ...netas].map((d) => d.id);
        if (descendentes.length > 0) {
          await tx.tarefa.updateMany({
            where: { id: { in: descendentes } },
            data: { nivel: { increment: delta } },
          });
        }
      }
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: pai ? "vinculou" : "desvinculou",
        valorAntes: tarefa.tarefaPaiId,
        valorDepois: pai ? `T-${pai.id} ${pai.titulo}` : null,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    if (err instanceof Error && err.message === "concorrencia") {
      return { ok: false, message: "Alguém mudou esta tarefa agora há pouco. Recarregue a página." };
    }
    console.error("[vincularPai] falha:", err);
    return { ok: false, message: "Não foi possível mudar a tarefa pai." };
  }
}

/**
 * Pôr uma etiqueta na tarefa, criando-a no quadro se ainda não existe.
 *
 * "Elétrica" e "eletrica" são a mesma etiqueta (`mesmaEtiqueta`): a que já
 * existe ganha, para o quadro não juntar três grafias da mesma coisa.
 * Etiqueta nova passa antes pela RN-020 contra quem está ativo na casa.
 */
export async function etiquetar(
  tarefaId: number,
  entrada: unknown,
): Promise<Resultado<{ etiquetaId: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;
  if (!podeNaTarefa(papel, "editar", ehMinha)) return naoAutorizado("editar");

  const parsed = etiquetaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const nome = normalizarEtiqueta(parsed.data.nome);

  const doQuadro = await prisma.etiqueta.findMany({
    where: { projetoId: tarefa.projetoId },
    select: { id: true, nome: true },
  });
  let etiqueta = doQuadro.find((e) => mesmaEtiqueta(e.nome, nome)) ?? null;

  if (!etiqueta) {
    const pessoas = await prisma.adminUser.findMany({
      where: { isActive: true },
      select: { name: true, username: true },
    });
    const motivo = etiquetaComNomeDePessoa(nome, pessoas);
    if (motivo) return { ok: false, message: motivo };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      if (!etiqueta) {
        etiqueta = await tx.etiqueta.create({
          data: { projetoId: tarefa.projetoId, nome, criadoPorId: user.id },
          select: { id: true, nome: true },
        });
      }
      const ligou = await tx.tarefaEtiqueta.createMany({
        data: [{ tarefaId: tarefa.id, etiquetaId: etiqueta.id }],
        skipDuplicates: true,
      });
      if (ligou.count > 0) {
        await registrar(tx, {
          entidade: "tarefa",
          entidadeId: tarefa.id,
          acao: "etiquetou",
          valorDepois: etiqueta.nome,
          usuarioId: user.id,
        });
      }
      return etiqueta.id;
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { etiquetaId: id } };
  } catch (err) {
    // Duas pessoas criando a mesma etiqueta no mesmo instante: a segunda
    // esbarra no UNIQUE. Tentar de novo acha a que acabou de nascer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "Essa etiqueta acabou de ser criada. Tente de novo." };
    }
    console.error("[etiquetar] falha:", err);
    return { ok: false, message: "Não foi possível pôr a etiqueta." };
  }
}

/**
 * Tirar a etiqueta desta tarefa. A etiqueta continua no quadro, como
 * sugestão para a próxima; o quadro é que é dono dela.
 */
export async function tirarEtiqueta(
  tarefaId: number,
  etiquetaId: number,
): Promise<Resultado<{ id: number }>> {
  const ctx = await abrirTarefa(tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { user, tarefa, papel, ehMinha } = ctx;
  if (!podeNaTarefa(papel, "editar", ehMinha)) return naoAutorizado("editar");

  try {
    await prisma.$transaction(async (tx) => {
      const ligacao = await tx.tarefaEtiqueta.findUnique({
        where: { tarefaId_etiquetaId: { tarefaId: tarefa.id, etiquetaId } },
        select: { etiqueta: { select: { nome: true } } },
      });
      if (!ligacao) return;
      await tx.tarefaEtiqueta.delete({
        where: { tarefaId_etiquetaId: { tarefaId: tarefa.id, etiquetaId } },
      });
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: tarefa.id,
        acao: "desetiquetou",
        valorAntes: ligacao.etiqueta.nome,
        valorDepois: ligacao.etiqueta.nome,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: tarefa.id } };
  } catch (err) {
    console.error("[tirarEtiqueta] falha:", err);
    return { ok: false, message: "Não foi possível tirar a etiqueta." };
  }
}

/**
 * Tirar um anexo da tarefa.
 *
 * Quem anexou tira o que anexou; o gestor tira qualquer um. Um editor apagar
 * a foto de serviço feito por outra pessoa seria apagar a prova de outra
 * pessoa, e é exatamente o que o anexo existe para guardar.
 */
export async function removerAnexo(anexoId: number): Promise<Resultado<{ id: number }>> {
  const user = await requireModule("tarefas");
  const anexo = await prisma.anexoTarefa.findUnique({
    where: { id: anexoId },
    select: { id: true, nome: true, tarefaId: true, criadoPorId: true },
  });
  if (!anexo) return { ok: false, message: "Esse anexo não existe mais. Recarregue a página." };

  const ctx = await abrirTarefa(anexo.tarefaId);
  if (!ctx) return { ok: false, message: "Tarefa não encontrada." };
  const { papel, ehMinha } = ctx;
  if (!podeNaTarefa(papel, "anexar", ehMinha)) return naoAutorizado("anexar");
  if (anexo.criadoPorId !== user.id && papel !== "GESTOR") {
    return { ok: false, message: "Só quem anexou, ou o gestor do quadro, tira este anexo." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.anexoTarefa.delete({ where: { id: anexo.id } });
      await registrar(tx, {
        entidade: "tarefa",
        entidadeId: anexo.tarefaId,
        acao: "desanexou",
        valorAntes: anexo.nome,
        valorDepois: anexo.nome,
        usuarioId: user.id,
      });
    });

    revalidatePath("/admin/tarefas", "layout");
    return { ok: true, data: { id: anexo.tarefaId } };
  } catch (err) {
    console.error("[removerAnexo] falha:", err);
    return { ok: false, message: "Não foi possível tirar o anexo." };
  }
}
