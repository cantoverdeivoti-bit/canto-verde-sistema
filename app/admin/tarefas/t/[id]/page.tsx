import Link from "next/link";
import { notFound } from "next/navigation";

import { Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { diaISO, formatDateTime } from "@/lib/format";
import { situacaoDoPrazo } from "@/lib/tarefas-labels";
import { papelEfetivo, podeNaTarefa } from "@/lib/tarefas-permissoes";
import { podeTerFilha, podeVincular } from "@/lib/tarefas-subtarefas";

import { AnexosDaTarefa } from "./anexos-da-tarefa";
import { Detalhe, type LinhaDoTempo } from "./detalhe";
import { EtiquetasDaTarefa } from "./etiquetas-da-tarefa";
import { Subtarefas } from "./subtarefas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarefa — Tarefas" };

/** O que cada verbo do log vira em português na linha do tempo. */
const ACAO_TEXTO: Record<string, string> = {
  criou: "criou a tarefa",
  moveu: "moveu",
  concluiu: "concluiu",
  reabriu: "reabriu",
  cancelou: "cancelou",
  excluiu: "mandou para a lixeira",
  restaurou: "tirou da lixeira",
  comentou: "comentou",
  alterou: "alterou",
  fixou: "fixou no topo da coluna",
  desafixou: "tirou do topo da coluna",
  duplicou: "criou esta tarefa como cópia de",
  subtarefa: "adicionou a subtarefa",
  vinculou: "pendurou esta tarefa embaixo de",
  desvinculou: "soltou esta tarefa da tarefa pai",
  etiquetou: "pôs a etiqueta",
  desetiquetou: "tirou a etiqueta",
  anexou: "anexou",
  desanexou: "tirou o anexo",
};

/** Os verbos do menu da tarefa que só se entendem com o valor junto. */
const COM_VALOR = new Set([
  "duplicou",
  "subtarefa",
  "vinculou",
  "etiquetou",
  "desetiquetou",
  "anexou",
  "desanexou",
]);

const CAMPO_TEXTO: Record<string, string> = {
  titulo: "o título",
  descricao: "a descrição",
  prioridade: "a prioridade",
  responsavel: "o responsável",
  prazo: "o prazo",
  documento: "o documento",
  coluna: "de coluna",
  motivo: "o motivo",
};

/**
 * A tarefa por inteiro — a tela que o número curto abre.
 *
 * Conversa e histórico aparecem na MESMA linha do tempo, em ordem, e não em
 * duas listas. A pergunta de quem abre um cartão dias depois é "o que
 * aconteceu aqui", e a resposta é feita das duas coisas juntas: o comentário
 * do Joel dizendo que o fornecedor ligou faz sentido ao lado da linha que
 * mostra o cartão indo para AGUARDANDO no mesmo minuto.
 */
export default async function TarefaPage({ params }: PageProps<"/admin/tarefas/t/[id]">) {
  const user = await guardModule("tarefas");
  const { id } = await params;

  const tarefaId = Number(id);
  if (!Number.isInteger(tarefaId) || tarefaId <= 0) notFound();

  const [tarefa, { capacity }] = await Promise.all([
    prisma.tarefa.findFirst({
      where: { id: tarefaId, excluidoEm: null },
      include: {
        coluna: true,
        responsavel: { select: { id: true, name: true, username: true } },
        criadoPor: { select: { name: true, username: true } },
        projeto: {
          include: {
            colunas: { where: { oculta: false }, orderBy: { ordem: "asc" } },
            membros: { where: { userId: user.id }, select: { papel: true } },
          },
        },
        comentarios: {
          orderBy: { criadoEm: "asc" },
          include: { autor: { select: { name: true, username: true } } },
        },
        tarefaPai: { select: { id: true, titulo: true, excluidoEm: true } },
        filhas: {
          where: { excluidoEm: null },
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            titulo: true,
            status: true,
            responsavelId: true,
            responsavel: { select: { name: true, username: true } },
          },
        },
        etiquetas: {
          select: { etiqueta: { select: { id: true, nome: true } } },
          orderBy: { etiqueta: { nome: "asc" } },
        },
        // Nunca `dados`: a tela só precisa saber que o arquivo existe. Os
        // bytes saem pela rota de download, um de cada vez.
        anexos: {
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            nome: true,
            mime: true,
            tamanho: true,
            criadoPorId: true,
            criadoPor: { select: { name: true, username: true } },
          },
        },
      },
    }),
    getSettings(),
  ]);
  if (!tarefa) notFound();

  const papel = papelEfetivo(user, tarefa.projeto.membros[0]?.papel ?? null);
  if (tarefa.projeto.privado && papel === null) notFound();

  const timezone = capacity.timezone;

  /* "comentou" fica de fora DESTA tela, e só dela.
     A linha continua gravada, porque o histórico por pessoa (RF-172) precisa
     saber que alguém comentou às 8h05. Mas aqui embaixo o próprio comentário
     já está na lista, e mostrar os dois faz a mesma coisa aparecer duas vezes
     seguidas — uma vez com o que foi dito, outra dizendo que algo foi dito. */
  const log = await prisma.logAtividade.findMany({
    where: { entidade: "tarefa", entidadeId: tarefa.id, acao: { not: "comentou" } },
    orderBy: { em: "asc" },
    include: { usuario: { select: { name: true, username: true } } },
  });

  const quem = (u: { name: string | null; username: string } | null) =>
    u === null ? "o sistema" : (u.name ?? u.username);

  /* Comentário e log viram a mesma coisa aqui, e são ordenados juntos.
     O log entra como linha de sistema, em cinza; o comentário, como fala. */
  const linhas: LinhaDoTempo[] = [
    ...tarefa.comentarios.map((c) => ({
      chave: `c${c.id}`,
      em: c.criadoEm.toISOString(),
      quando: formatDateTime(c.criadoEm, timezone),
      quem: quem(c.autor),
      tipo: "fala" as const,
      texto: c.excluidoEm ? "comentário removido" : c.texto,
      removido: c.excluidoEm !== null,
    })),
    ...log.map((l) => {
      const verbo = ACAO_TEXTO[l.acao] ?? l.acao;
      const campo = l.campo ? (CAMPO_TEXTO[l.campo] ?? l.campo) : null;
      const de = l.valorAntes === null ? null : String(l.valorAntes);
      const para = l.valorDepois === null ? null : String(l.valorDepois);

      let texto = verbo;
      if (l.acao === "moveu" && de && para) texto = `moveu de ${de} para ${para}`;
      else if (l.acao === "alterou" && campo)
        texto = para ? `alterou ${campo} para "${para}"` : `apagou ${campo}`;
      // Concluir e reabrir gravam a coluna de destino, porque são movimentos
      // (RF-175). Mas escrever "concluiu: CONCLUÍDO" é dizer a mesma coisa
      // duas vezes — a coluna de destino é a definição do verbo.
      else if (l.acao === "concluiu" || l.acao === "reabriu") texto = verbo;
      else if (COM_VALOR.has(l.acao) && para) texto = `${verbo} ${para}`;
      else if (campo && para) texto = `${verbo}: ${para}`;

      return {
        chave: `l${l.id}`,
        em: l.em.toISOString(),
        quando: formatDateTime(l.em, timezone),
        quem: quem(l.usuario),
        tipo: "sistema" as const,
        texto,
        removido: false,
      };
    }),
  ].sort((a, b) => a.em.localeCompare(b.em));

  const membros = await prisma.adminUser.findMany({
    where: { isActive: true, projetosMembro: { some: { projetoId: tarefa.projetoId } } },
    orderBy: [{ name: "asc" }, { username: "asc" }],
    select: { id: true, name: true, username: true },
  });

  // O que esta pessoa pode fazer com o menu e as seções novas. Decidido aqui,
  // com a mesma matriz que as ações cobram, para a tela não oferecer o que a
  // ação vai recusar.
  const ehMinha = tarefa.responsavelId === user.id;
  const aberta = tarefa.status === "ABERTA";
  const podeEditar = podeNaTarefa(papel, "editar", ehMinha);
  const podeAnexar = podeNaTarefa(papel, "anexar", ehMinha);
  const podeSubtarefa =
    aberta && podeTerFilha(tarefa.nivel) && podeNaTarefa(papel, "criarSubtarefa", true);
  const podeDuplicar = podeNaTarefa(papel, tarefa.tarefaPaiId ? "criarSubtarefa" : "criarTarefa", true);

  const etiquetasDoQuadro = await prisma.etiqueta.findMany({
    where: { projetoId: tarefa.projetoId },
    orderBy: { nome: "asc" },
    select: { nome: true },
  });
  const minhasEtiquetas = tarefa.etiquetas.map((e) => e.etiqueta);

  /* Os candidatos a tarefa pai já passam por `podeVincular` aqui, com a
     árvore desta tarefa (filhas e netas, até as que estão na lixeira): a
     lista do bloco só mostra o que a ação vai aceitar. */
  let candidatosAPai: { id: number; titulo: string }[] = [];
  if (podeEditar) {
    const filhasTodas = await prisma.tarefa.findMany({
      where: { tarefaPaiId: tarefa.id },
      select: { id: true },
    });
    const netas = filhasTodas.length
      ? await prisma.tarefa.findMany({
          where: { tarefaPaiId: { in: filhasTodas.map((f) => f.id) } },
          select: { id: true },
        })
      : [];
    const abaixo = new Set([...filhasTodas, ...netas].map((d) => d.id));
    const altura = netas.length > 0 ? 3 : filhasTodas.length > 0 ? 2 : 1;
    const abertas = await prisma.tarefa.findMany({
      where: {
        projetoId: tarefa.projetoId,
        excluidoEm: null,
        status: "ABERTA",
        id: { not: tarefa.id },
      },
      orderBy: { id: "desc" },
      take: 300,
      select: { id: true, titulo: true, nivel: true },
    });
    candidatosAPai = abertas
      .filter(
        (c) =>
          c.id !== tarefa.tarefaPaiId &&
          podeVincular({
            mesmaTarefa: false,
            mesmoProjeto: true,
            paiEhDescendente: abaixo.has(c.id),
            paiAberto: true,
            nivelDoPai: c.nivel,
            alturaDaTarefa: altura,
          }).ok,
      )
      .map((c) => ({ id: c.id, titulo: c.titulo }));
  }

  const paiAtual =
    tarefa.tarefaPai && tarefa.tarefaPai.excluidoEm === null
      ? { id: tarefa.tarefaPai.id, titulo: tarefa.tarefaPai.titulo }
      : null;

  return (
    <Pagina largura="estreita">
      <Detalhe
        voltar={{ href: `/admin/tarefas/${tarefa.projetoId}`, texto: tarefa.projeto.nome }}
        contexto={
          <>
            <span className="num-display">T-{tarefa.id}</span> · criada por {quem(tarefa.criadoPor)}
            {paiAtual && (
              <span className="block">
                subtarefa de{" "}
                <Link
                  href={`/admin/tarefas/t/${paiAtual.id}`}
                  className="text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  T-{paiAtual.id} {paiAtual.titulo}
                </Link>
              </span>
            )}
          </>
        }
        tarefa={{
          id: tarefa.id,
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          status: tarefa.status,
          prioridade: tarefa.prioridade,
          colunaNome: tarefa.coluna.nome,
          responsavelId: tarefa.responsavelId,
          prazo: tarefa.prazo === null ? null : diaISO(tarefa.prazo),
          situacaoPrazo: situacaoDoPrazo(tarefa.prazo, tarefa.prazoDiaInteiro, timezone),
          documentoUrl: tarefa.documentoUrl,
          // Só enquanto a tarefa REALMENTE espera alguém. O texto fica gravado
          // depois que ela sai do AGUARDANDO — é dele que sai a contagem de
          // previsões adiadas —, mas continuar mostrando "esperando: entrega do
          // gás" numa tarefa já concluída é apresentar o passado como presente.
          aguardandoDescricao:
            tarefa.coluna.estado === "EXECUCAO_BLOQUEADA"
              ? tarefa.aguardandoDescricao
              : null,
          qtdAdiamentos: tarefa.qtdAdiamentos,
          motivoCancelamento: tarefa.motivoCancelamento,
          textoCancelamento: tarefa.textoCancelamento,
          fixada: tarefa.fixadaEm !== null,
          subtarefasAbertas: tarefa.filhas.filter((f) => f.status === "ABERTA").length,
        }}
        membros={membros.map((m) => ({ id: m.id, nome: m.name ?? m.username }))}
        linhas={linhas}
        papel={papel}
        souEu={user.id}
        criadaPorMim={tarefa.criadoPorId === user.id}
        menu={{
          itens: {
            subtarefa: podeSubtarefa,
            vincularPai: podeEditar && (candidatosAPai.length > 0 || paiAtual !== null),
            fixar: podeEditar,
            etiquetas: podeEditar,
            anexo: podeAnexar,
            duplicar: podeDuplicar,
          },
          paiAtual,
          candidatosAPai,
        }}
        secoes={
          <>
            <Subtarefas
              tarefaId={tarefa.id}
              podeCriar={podeSubtarefa}
              filhas={tarefa.filhas.map((f) => ({
                id: f.id,
                titulo: f.titulo,
                status: f.status,
                responsavel: f.responsavel ? quem(f.responsavel) : null,
                podeMarcar: podeNaTarefa(papel, "concluir", f.responsavelId === user.id),
              }))}
            />
            <EtiquetasDaTarefa
              tarefaId={tarefa.id}
              etiquetas={minhasEtiquetas}
              podeEditar={podeEditar}
              sugestoes={etiquetasDoQuadro
                .map((e) => e.nome)
                .filter((n) => !minhasEtiquetas.some((m) => m.nome === n))}
            />
            <AnexosDaTarefa
              tarefaId={tarefa.id}
              podeAnexar={podeAnexar}
              anexos={tarefa.anexos.map((a) => ({
                id: a.id,
                nome: a.nome,
                mime: a.mime,
                tamanho: a.tamanho,
                quem: quem(a.criadoPor),
                podeRemover: podeAnexar && (a.criadoPorId === user.id || papel === "GESTOR"),
              }))}
            />
          </>
        }
      />
    </Pagina>
  );
}
