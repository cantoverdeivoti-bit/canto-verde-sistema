"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { toDateOnly } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { ENCARGOS_PADRAO_DO_CLT } from "@/lib/cmo";
import { hojeDaCasa, registrarCmoDoMes } from "@/lib/cmo-do-banco";
import { diaDaSemana } from "@/lib/escala";
import { fimDe } from "@/lib/ferias";
import { lerNumeroBR } from "@/lib/format";
import { notificar } from "@/lib/notificar";
import { can } from "@/lib/roles";
import { ehTipo, type TipoContrato } from "@/lib/tipos-de-contrato";
import { novoToken } from "@/lib/token";
import {
  aprovacaoSchema,
  atualizacaoPeloLinkSchema,
  cadastroPeloLinkSchema,
  colaboradorSchema,
  dateString,
  type AprovacaoInput,
  type CadastroPeloLinkInput,
  type ColaboradorInput,
  itemDeCustoSchema,
  type ItemDeCustoInput,
  nomeDeFuncao,
  terceirizadoSchema,
  type TerceirizadoInput,
} from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

const MODULO = "pessoal";

function feito() {
  revalidatePath("/admin/pessoal", "layout");
  limparContadores();
}

/** Para o que mexe no custo (equipe, valores, escala fixa, postos, encargos): o registro do CMO do mês acompanha. */
async function feitoComCusto() {
  await registrarCmoDoMes();
  feito();
}

function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

const dataValida = (d: string) => dateString.safeParse(d).success;

/** Nulo vale (sem função). Um id que veio do navegador vale o que o banco confirmar. */
async function funcaoExiste(id: number | null): Promise<boolean> {
  if (id === null) return true;
  return (await prisma.funcao.count({ where: { id } })) === 1;
}

// ---------------------------------------------------------------------------
// Colaboradores
// ---------------------------------------------------------------------------

/**
 * Cria (id nulo) ou atualiza um colaborador.
 *
 * O salário só é gravado por quem configura o módulo. Quem só opera manda o
 * formulário sem o campo, e o salário que estava no banco fica como estava,
 * em vez de virar nulo.
 */
export async function salvarColaborador(id: number | null, raw: ColaboradorInput): Promise<Result<{ id: number }>> {
  const user = await requireModule(MODULO);
  const podeValores = can(user, MODULO, { configure: true });

  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (!(await funcaoExiste(v.funcaoId))) return { ok: false, message: "Essa função não existe mais. Recarregue a página." };

  const dados = {
    nome: v.nome,
    apelido: v.apelido,
    telefone: v.telefone,
    tipo: v.tipo,
    area: v.area,
    funcaoId: v.funcaoId,
    ativo: v.ativo,
    comecouEm: v.comecouEm ? toDateOnly(v.comecouEm) : null,
    admissao: v.admissao ? toDateOnly(v.admissao) : null,
    diaria: v.diaria === null ? null : new Prisma.Decimal(v.diaria),
    observacoes: v.observacoes,
    nascimento: v.nascimento ? toDateOnly(v.nascimento) : null,
    endereco: v.endereco,
    emergenciaNome: v.emergenciaNome,
    emergenciaTelefone: v.emergenciaTelefone,
    ...(v.diasDeTrabalho !== undefined ? { diasDeTrabalho: v.diasDeTrabalho } : {}),
    // A experiência só existe no CLT; nos outros tipos, sai.
    ...(v.experienciaAte !== undefined || v.tipo !== "CLT"
      ? { experienciaAte: v.tipo === "CLT" && v.experienciaAte ? toDateOnly(v.experienciaAte) : null }
      : {}),
    ...(v.asoFeitoEm !== undefined ? { asoFeitoEm: v.asoFeitoEm ? toDateOnly(v.asoFeitoEm) : null } : {}),
    ...(v.asoValidoAte !== undefined ? { asoValidoAte: v.asoValidoAte ? toDateOnly(v.asoValidoAte) : null } : {}),
    ...(v.manipulaAlimentos !== undefined ? { manipulaAlimentos: v.manipulaAlimentos } : {}),
    // Aprendiz e o fim do contrato dele só existem no CLT.
    ...(v.aprendiz !== undefined || v.tipo !== "CLT" ? { aprendiz: v.tipo === "CLT" && (v.aprendiz ?? false) } : {}),
    ...(v.contratoAte !== undefined || v.tipo !== "CLT"
      ? { contratoAte: v.tipo === "CLT" && v.aprendiz && v.contratoAte ? toDateOnly(v.contratoAte) : null }
      : {}),
    // O CPF segue a mesma trava do salário: sem acesso, o campo nem vem.
    ...(podeValores && v.cpf !== undefined ? { cpf: v.cpf } : {}),
    ...(podeValores
      ? { salario: v.salario === null ? null : new Prisma.Decimal(v.salario) }
      : // Sem acesso aos valores: virou free, o salário sai; senão fica intocado.
        v.tipo === "FREELANCER"
        ? { salario: null }
        : {}),
  };

  // Desligado: a data escolhida, ou hoje. Religado: a data sai.
  // Religado, o motivo do desligamento sai junto com a data.
  const desligamento = v.ativo
    ? { desligadoEm: null, motivoDesligamento: null, razaoDesligamento: null, detalheDesligamento: null }
    : {
        desligadoEm: toDateOnly(v.desligadoEm ?? (await hojeDaCasa())),
        ...(v.motivoDesligamento !== undefined ? { motivoDesligamento: v.motivoDesligamento } : {}),
        ...(v.razaoDesligamento !== undefined ? { razaoDesligamento: v.razaoDesligamento } : {}),
        ...(v.detalheDesligamento !== undefined ? { detalheDesligamento: v.detalheDesligamento } : {}),
      };

  // A diária de cada dia: só no free, e só os dias com valor diferente da de sempre.
  const diariasDoDia =
    v.tipo !== "FREELANCER"
      ? []
      : (v.diariasPorDia ?? [])
          .map((valor, diaSemana) => ({ diaSemana, valor }))
          .filter((d): d is { diaSemana: number; valor: number } => d.valor !== null && d.valor !== v.diaria);
  const mexeNasDiarias = v.tipo !== "FREELANCER" || v.diariasPorDia !== undefined;

  try {
    const r = await prisma.$transaction(async (tx) => {
      const salvo = id === null
        ? await tx.colaborador.create({ data: dados, select: { id: true } })
        : // Pendente se aprova em Pendências, não por aqui.
          await tx.colaborador.update({ where: { id, pendente: false }, data: { ...dados, ...desligamento }, select: { id: true } });
      if (mexeNasDiarias) {
        await tx.diariaDoDia.deleteMany({ where: { colaboradorId: salvo.id } });
        if (diariasDoDia.length > 0) {
          await tx.diariaDoDia.createMany({
            data: diariasDoDia.map((d) => ({ colaboradorId: salvo.id, diaSemana: d.diaSemana, valor: new Prisma.Decimal(d.valor) })),
          });
        }
      }
      return salvo;
    });
    await feitoComCusto();
    return { ok: true, data: { id: r.id } };
  } catch (error) {
    console.error("[salvarColaborador] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Escala
// ---------------------------------------------------------------------------

/** Quem fica no posto: um colaborador, a empresa terceirizada, ou ninguém (null). */
export type QuemNoPosto = { colaboradorId: number } | { terceirizadoId: number } | null;

/**
 * Põe alguém (ou ninguém) num posto.
 *
 * "fixa": vale para todo dia da semana da data escolhida, e a exceção que
 * houvesse naquela data sai, para a mudança aparecer na hora. "dia": vale só
 * naquela data, por cima da fixa.
 */
export async function definirPosto(
  postoId: number,
  data: string,
  quem: QuemNoPosto,
  escopo: "fixa" | "dia",
): Promise<Simples> {
  await requireModule(MODULO);
  if (!dataValida(data)) return { ok: false, message: "Data inválida." };
  const colaboradorId = quem && "colaboradorId" in quem ? quem.colaboradorId : null;
  const terceirizadoId = quem && "terceirizadoId" in quem ? quem.terceirizadoId : null;

  const [posto, pessoa, empresa] = await Promise.all([
    prisma.postoDaEscala.findUnique({ where: { id: postoId }, select: { id: true, diasFechados: true } }),
    colaboradorId === null
      ? null
      : prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { ativo: true } }),
    terceirizadoId === null
      ? null
      : prisma.terceirizado.findUnique({ where: { id: terceirizadoId }, select: { ativo: true } }),
  ]);
  if (!posto) return { ok: false, message: "Posto não encontrado." };
  if (colaboradorId !== null && !pessoa?.ativo) return { ok: false, message: "Colaborador desligado ou inexistente." };
  if (terceirizadoId !== null && !empresa?.ativo) return { ok: false, message: "Empresa desativada ou inexistente." };

  const dia = toDateOnly(data);
  if (escopo === "dia") {
    await prisma.escalaDoDia.upsert({
      where: { data_postoId: { data: dia, postoId } },
      // Escolher alguém (ou deixar vazio) num dia fechado abre o posto naquele dia.
      create: { data: dia, postoId, colaboradorId, terceirizadoId, fechado: false },
      update: { colaboradorId, terceirizadoId, fechado: false },
    });
  } else {
    const diaSemana = diaDaSemana(data);
    await prisma.$transaction([
      // Toda semana: o posto volta a existir naquele dia da semana.
      prisma.postoDaEscala.update({
        where: { id: postoId },
        data: { diasFechados: posto.diasFechados.filter((d) => d !== diaSemana) },
      }),
      quem === null
        ? prisma.escalaFixa.deleteMany({ where: { postoId, diaSemana } })
        : prisma.escalaFixa.upsert({
            where: { postoId_diaSemana: { postoId, diaSemana } },
            create: { postoId, diaSemana, colaboradorId, terceirizadoId },
            update: { colaboradorId, terceirizadoId },
          }),
      prisma.escalaDoDia.deleteMany({ where: { postoId, data: dia } }),
    ]);
  }
  if (escopo === "fixa") await feitoComCusto();
  else feito();
  return { ok: true };
}

/**
 * Fecha (ou abre) um posto: um posto que não existe naquele dia, como o bar
 * de segunda a sexta. Fechado não pede ninguém e não vira aviso.
 *
 * "fixa": vale para todo dia da semana da data. Fechar tira da escala fixa
 * quem estava ali naquele dia (para o custo e o CMO não contarem), e a
 * exceção daquela data sai, para a mudança aparecer na hora. "dia": vale só
 * naquela data, por cima da semana.
 */
export async function fecharPosto(postoId: number, data: string, fechar: boolean, escopo: "fixa" | "dia"): Promise<Simples> {
  await requireModule(MODULO);
  if (!dataValida(data)) return { ok: false, message: "Data inválida." };
  const posto = await prisma.postoDaEscala.findUnique({ where: { id: postoId }, select: { id: true, diasFechados: true } });
  if (!posto) return { ok: false, message: "Posto não encontrado." };
  const dia = toDateOnly(data);
  const diaSemana = diaDaSemana(data);

  if (escopo === "dia") {
    // Abrir só nesta data um dia que a semana fecha precisa da exceção; senão, basta tirar a de fechar.
    if (fechar || posto.diasFechados.includes(diaSemana)) {
      await prisma.escalaDoDia.upsert({
        where: { data_postoId: { data: dia, postoId } },
        create: { data: dia, postoId, colaboradorId: null, terceirizadoId: null, fechado: fechar },
        update: { colaboradorId: null, terceirizadoId: null, fechado: fechar },
      });
    } else {
      await prisma.escalaDoDia.deleteMany({ where: { postoId, data: dia } });
    }
    feito();
    return { ok: true };
  }

  const dias = new Set(posto.diasFechados);
  if (fechar) dias.add(diaSemana);
  else dias.delete(diaSemana);
  await prisma.$transaction([
    prisma.postoDaEscala.update({ where: { id: postoId }, data: { diasFechados: [...dias].sort() } }),
    ...(fechar ? [prisma.escalaFixa.deleteMany({ where: { postoId, diaSemana } })] : []),
    prisma.escalaDoDia.deleteMany({ where: { postoId, data: dia } }),
  ]);
  await feitoComCusto();
  return { ok: true };
}

/** Desfaz a exceção de uma data: o posto volta a seguir a semana fixa. */
export async function voltarAoFixo(postoId: number, data: string): Promise<Simples> {
  await requireModule(MODULO);
  if (!dataValida(data)) return { ok: false, message: "Data inválida." };
  await prisma.escalaDoDia.deleteMany({ where: { postoId, data: toDateOnly(data) } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Terceirizados
// ---------------------------------------------------------------------------

/** Cria (id nulo) ou atualiza a empresa terceirizada. O valor por pessoa mexe no custo da escala. */
export async function salvarTerceirizado(id: number | null, raw: TerceirizadoInput): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const parsed = terceirizadoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const dados = parsed.data;
  const salvo =
    id === null
      ? await prisma.terceirizado.create({ data: dados, select: { id: true } })
      : await prisma.terceirizado.update({ where: { id }, data: dados, select: { id: true } }).catch(() => null);
  if (!salvo) return { ok: false, message: "Empresa não encontrada." };
  feito();
  return { ok: true, data: { id: salvo.id } };
}

/**
 * Desativa (ou reativa) a empresa. Desativada, sai da lista de escolha e dos
 * postos da semana fixa; o que já passou fica no histórico.
 */
export async function ativarTerceirizado(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO);
  const existe = await prisma.terceirizado.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return { ok: false, message: "Empresa não encontrada." };
  await prisma.$transaction([
    prisma.terceirizado.update({ where: { id }, data: { ativo } }),
    ...(ativo ? [] : [prisma.escalaFixa.deleteMany({ where: { terceirizadoId: id } })]),
  ]);
  feito();
  return { ok: true };
}

/**
 * O colaborador que na verdade é uma empresa (a Serve bem cadastrada como
 * free): cria o terceirizado com o nome, o telefone e a diária, passa para ele
 * os postos da escala (a semana fixa e os dias) e desliga o colaborador.
 */
export async function virarTerceirizado(colaboradorId: number): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const c = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { nome: true, telefone: true, diaria: true, area: true, observacoes: true, tipo: true },
  });
  if (!c) return { ok: false, message: "Colaborador não encontrado." };
  if (c.tipo !== "FREELANCER") return { ok: false, message: "Só o free lancer pode virar empresa terceirizada." };
  const hoje = await hojeDaCasa();
  const empresa = await prisma.$transaction(async (tx) => {
    const t = await tx.terceirizado.create({
      data: { nome: c.nome, telefone: c.telefone, valorPorPessoa: c.diaria, area: c.area, observacoes: c.observacoes },
      select: { id: true },
    });
    await tx.escalaFixa.updateMany({ where: { colaboradorId }, data: { colaboradorId: null, terceirizadoId: t.id } });
    await tx.escalaDoDia.updateMany({ where: { colaboradorId }, data: { colaboradorId: null, terceirizadoId: t.id } });
    await tx.colaborador.update({
      where: { id: colaboradorId },
      data: { ativo: false, desligadoEm: toDateOnly(hoje), detalheDesligamento: "Passou para Terceirizados." },
    });
    return t;
  });
  await feitoComCusto();
  return { ok: true, data: { id: empresa.id } };
}

/** Quantos domingos seguidos alguém pode trabalhar antes de o seguinte ser folga (da convenção do sindicato). */
export async function salvarDomingosSeguidos(n: number): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  if (!Number.isInteger(n) || n < 0 || n > 10) return { ok: false, message: "Use um número de 0 a 10 (0 desliga o aviso)." };
  await prisma.configuracaoPessoal.upsert({ where: { id: 1 }, create: { id: 1, domingosSeguidos: n }, update: { domingosSeguidos: n } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Postos (configuração)
// ---------------------------------------------------------------------------

export async function criarPosto(area: "COZINHA" | "SALAO", nome: string): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  const limpo = nome.trim();
  if (limpo.length < 2 || limpo.length > 40) return { ok: false, message: "Nome do posto: de 2 a 40 letras." };
  if (area !== "COZINHA" && area !== "SALAO") return { ok: false, message: "Área inválida." };
  const ultimo = await prisma.postoDaEscala.aggregate({ where: { area }, _max: { ordem: true } });
  await prisma.postoDaEscala.create({ data: { area, nome: limpo, ordem: (ultimo._max.ordem ?? 0) + 1 } });
  await feitoComCusto();
  return { ok: true };
}

export async function renomearPosto(id: number, nome: string): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  const limpo = nome.trim();
  if (limpo.length < 2 || limpo.length > 40) return { ok: false, message: "Nome do posto: de 2 a 40 letras." };
  await prisma.postoDaEscala.update({ where: { id }, data: { nome: limpo } });
  feito();
  return { ok: true };
}

/** Liga ou desliga um posto. Desligado some da escala; a semana fixa dele fica guardada. */
export async function ligarPosto(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  await prisma.postoDaEscala.update({ where: { id }, data: { ativo } });
  await feitoComCusto();
  return { ok: true };
}

/** Sobe ou desce um posto dentro da área dele. */
export async function moverPosto(id: number, direcao: -1 | 1): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  const posto = await prisma.postoDaEscala.findUnique({ where: { id } });
  if (!posto) return { ok: false, message: "Posto não encontrado." };
  const irmaos = await prisma.postoDaEscala.findMany({
    where: { area: posto.area },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
  });
  const i = irmaos.findIndex((p) => p.id === id);
  const j = i + direcao;
  if (j < 0 || j >= irmaos.length) return { ok: true };
  [irmaos[i], irmaos[j]] = [irmaos[j], irmaos[i]];
  await prisma.$transaction(
    irmaos.map((p, ordem) => prisma.postoDaEscala.update({ where: { id: p.id }, data: { ordem: ordem + 1 } })),
  );
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Férias
// ---------------------------------------------------------------------------

/** Marca um pedaço de férias: começa em `inicio` e dura `dias` dias corridos. */
export async function marcarFerias(
  colaboradorId: number,
  inicio: string,
  dias: number,
  observacao: string,
): Promise<Simples> {
  await requireModule(MODULO);
  if (!dataValida(inicio)) return { ok: false, message: "Escolha o primeiro dia das férias." };
  if (!Number.isInteger(dias) || dias < 1 || dias > 30) return { ok: false, message: "As férias vão de 1 a 30 dias." };
  const pessoa = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { tipo: true } });
  if (!pessoa) return { ok: false, message: "Colaborador não encontrado." };
  if (pessoa.tipo === "FREELANCER") return { ok: false, message: "Free lancer não tem férias." };

  const fim = fimDe(inicio, dias);
  const cruza = await prisma.ferias.findFirst({
    where: { colaboradorId, inicio: { lte: toDateOnly(fim) }, fim: { gte: toDateOnly(inicio) } },
    select: { id: true },
  });
  if (cruza) return { ok: false, message: "Já há férias marcadas nesses dias para esta pessoa." };

  await prisma.ferias.create({
    data: {
      colaboradorId,
      inicio: toDateOnly(inicio),
      fim: toDateOnly(fim),
      observacao: observacao.trim().slice(0, 200) || null,
    },
  });
  feito();
  return { ok: true };
}

export async function apagarFerias(id: number): Promise<Simples> {
  await requireModule(MODULO);
  await prisma.ferias.deleteMany({ where: { id } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cadastro pelo link
// ---------------------------------------------------------------------------

/** Uma semana: o link vai por WhatsApp e a pessoa preenche no mesmo dia ou no seguinte. */
const DIAS_DO_LINK = 7;

/**
 * Cria o link para uma pessoa preencher o próprio cadastro. Quem escolhe se
 * ela entra como CLT ou free é a casa, não quem preenche.
 */
export async function gerarConviteColaborador(
  tipo: TipoContrato,
  paraQuem: string,
): Promise<Result<{ token: string }>> {
  await requireModule(MODULO);
  if (!ehTipo(tipo)) return { ok: false, message: "Escolha CLT, fixo ou free." };
  const rotulo = paraQuem.trim().slice(0, 80) || null;
  const expiraEm = new Date(Date.now() + DIAS_DO_LINK * 24 * 60 * 60 * 1000);
  try {
    const c = await prisma.conviteColaborador.create({
      data: { token: novoToken(), tipo, paraQuem: rotulo, expiraEm },
      select: { token: true },
    });
    feito();
    return { ok: true, data: { token: c.token } };
  } catch (error) {
    console.error("[gerarConviteColaborador] falha:", error);
    return { ok: false, message: "Não consegui criar o link. Tente de novo." };
  }
}

/** Cancela um link ainda não usado. O usado fica: ele aponta para o cadastro que gerou. */
export async function cancelarConviteColaborador(id: number): Promise<Simples> {
  await requireModule(MODULO);
  await prisma.conviteColaborador.deleteMany({ where: { id, usadoEm: null } });
  feito();
  return { ok: true };
}

/**
 * A pessoa enviando o próprio cadastro. SEM LOGIN: a porta é o token, que é
 * aleatório, serve uma vez e vence. A checagem do link mora na mesma
 * transação da escrita, para dois envios do mesmo link não criarem dois
 * cadastros.
 *
 * Sem revalidar, como no cadastro do fornecedor: revalidar renderizaria de
 * novo a página da pessoa, já com o link usado, e ela veria "já enviado" no
 * lugar do recebido. A tela de Pendências é dinâmica e nasce fresca.
 */
export async function enviarCadastroPeloLink(token: string, raw: CadastroPeloLinkInput): Promise<Simples> {
  const parsed = cadastroPeloLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (typeof token !== "string" || token.length !== 64) return { ok: false, message: "Este link não existe." };

  try {
    const r = await prisma.$transaction(async (tx) => {
      const convite = await tx.conviteColaborador.findUnique({ where: { token } });
      if (!convite) return { ok: false, message: "Este link não existe." };
      if (convite.usadoEm) return { ok: false, message: "Este cadastro já foi enviado." };
      if (convite.expiraEm < new Date()) return { ok: false, message: "Este link venceu. Peça um novo ao restaurante." };

      const c = await tx.colaborador.create({
        data: {
          nome: v.nome,
          telefone: v.telefone,
          cpf: v.cpf,
          nascimento: v.nascimento ? toDateOnly(v.nascimento) : null,
          endereco: v.endereco,
          emergenciaNome: v.emergenciaNome,
          emergenciaTelefone: v.emergenciaTelefone,
          tipo: convite.tipo,
          pendente: true,
          ativo: false,
        },
        select: { id: true },
      });
      // `usadoEm: null` no filtro: se outro envio passou na frente, este não acha nada e desfaz tudo.
      const marcado = await tx.conviteColaborador.updateMany({
        where: { id: convite.id, usadoEm: null },
        data: { usadoEm: new Date(), colaboradorId: c.id },
      });
      if (marcado.count !== 1) throw new Error("convite usado no meio do envio");
      return { ok: true };
    });
    // Quem aprova fica sabendo, depois da resposta, e o número do menu sobe.
    if (r.ok) {
      limparContadores();
      after(() =>
        notificar("pessoal-cadastro", {
          titulo: "Cadastro novo esperando aprovação",
          corpo: `${v.nome} se cadastrou pelo link.`,
          url: "/admin/pessoal/pendencias",
          etiqueta: "pessoal-cadastro",
        }),
      );
    }
    return r;
  } catch (error) {
    console.error("[enviarCadastroPeloLink] falha:", error);
    return { ok: false, message: "Não consegui registrar o cadastro. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Atualização do cadastro pelo link
// ---------------------------------------------------------------------------

/**
 * O link para quem já é da equipe atualizar o próprio cadastro. Se já há um
 * aberto para a pessoa, devolve o mesmo: dois links vivos para o mesmo
 * cadastro só confundem.
 */
export async function gerarLinkDeAtualizacao(colaboradorId: number): Promise<Result<{ token: string }>> {
  await requireModule(MODULO);
  const c = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, pendente: false },
    select: { id: true, nome: true, tipo: true },
  });
  if (!c) return { ok: false, message: "Colaborador não encontrado." };
  try {
    const aberto = await prisma.conviteColaborador.findFirst({
      where: { paraAtualizar: true, colaboradorId: c.id, usadoEm: null, expiraEm: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (aberto) return { ok: true, data: { token: aberto.token } };
    const novo = await prisma.conviteColaborador.create({
      data: {
        token: novoToken(),
        tipo: c.tipo,
        paraQuem: c.nome,
        colaboradorId: c.id,
        paraAtualizar: true,
        expiraEm: new Date(Date.now() + DIAS_DO_LINK * 24 * 60 * 60 * 1000),
      },
      select: { token: true },
    });
    return { ok: true, data: { token: novo.token } };
  } catch (error) {
    console.error("[gerarLinkDeAtualizacao] falha:", error);
    return { ok: false, message: "Não consegui criar o link. Tente de novo." };
  }
}

/**
 * A pessoa mandando os dados novos. SEM LOGIN, como o cadastro: a porta é o
 * token. Nada muda no cadastro aqui: os dados ficam guardados no link até a
 * casa aprovar em Pendências.
 */
export async function enviarAtualizacaoPeloLink(token: string, raw: CadastroPeloLinkInput): Promise<Simples> {
  const parsed = atualizacaoPeloLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (typeof token !== "string" || token.length !== 64) return { ok: false, message: "Este link não existe." };

  try {
    const r = await prisma.$transaction(async (tx) => {
      const convite = await tx.conviteColaborador.findUnique({ where: { token } });
      if (!convite || !convite.paraAtualizar || convite.colaboradorId === null) return { ok: false, message: "Este link não existe." };
      if (convite.usadoEm) return { ok: false, message: "Esta atualização já foi enviada." };
      if (convite.expiraEm < new Date()) return { ok: false, message: "Este link venceu. Peça um novo ao restaurante." };
      // `usadoEm: null` no filtro: dois envios do mesmo link, só um passa.
      const marcado = await tx.conviteColaborador.updateMany({
        where: { id: convite.id, usadoEm: null },
        data: { usadoEm: new Date(), dados: v },
      });
      if (marcado.count !== 1) return { ok: false, message: "Esta atualização já foi enviada." };
      return { ok: true };
    });
    if (r.ok) {
      limparContadores();
      after(() =>
        notificar("pessoal-cadastro", {
          titulo: "Atualização de cadastro esperando aprovação",
          corpo: `${v.nome} atualizou o cadastro pelo link.`,
          url: "/admin/pessoal/pendencias",
          etiqueta: "pessoal-cadastro",
        }),
      );
    }
    return r;
  } catch (error) {
    console.error("[enviarAtualizacaoPeloLink] falha:", error);
    return { ok: false, message: "Não consegui registrar a atualização. Tente de novo." };
  }
}

/**
 * Aprova (grava no cadastro) ou recusa (descarta) uma atualização que veio
 * pelo link. Só quem configura o módulo, a mesma trava da aprovação de
 * cadastro: a atualização mexe no CPF.
 */
export async function resolverAtualizacao(conviteId: number, aprovar: boolean): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal aprova atualizações." };
  const convite = await prisma.conviteColaborador.findFirst({
    where: { id: conviteId, paraAtualizar: true, usadoEm: { not: null }, resolvidoEm: null },
    select: { id: true, colaboradorId: true, dados: true },
  });
  if (!convite || convite.colaboradorId === null) return { ok: false, message: "Esta atualização já foi resolvida." };

  // Os dados passam de novo pela validação: o que está guardado veio de fora.
  const lido = aprovar ? atualizacaoPeloLinkSchema.safeParse(dadosParaForm(convite.dados)) : null;
  if (lido && !lido.success) return { ok: false, message: "Os dados desta atualização não conferem. Recuse e peça de novo." };

  const r = await prisma.$transaction(async (tx) => {
    const resolvido = await tx.conviteColaborador.updateMany({
      where: { id: convite.id, resolvidoEm: null },
      data: { resolvidoEm: new Date() },
    });
    if (resolvido.count !== 1) return false;
    if (lido?.success) {
      const v = lido.data;
      await tx.colaborador.update({
        where: { id: convite.colaboradorId! },
        data: {
          nome: v.nome,
          telefone: v.telefone,
          // CPF em branco: fica o que estava.
          ...(v.cpf ? { cpf: v.cpf } : {}),
          nascimento: v.nascimento ? toDateOnly(v.nascimento) : null,
          endereco: v.endereco,
          emergenciaNome: v.emergenciaNome,
          emergenciaTelefone: v.emergenciaTelefone,
        },
      });
    }
    return true;
  });
  if (!r) return { ok: false, message: "Esta atualização já foi resolvida." };
  feito();
  return { ok: true };
}

/**
 * O que ficou guardado (já validado, com o telefone em +55) de volta no
 * formato do formulário, para passar pela mesma validação ao aprovar.
 */
function dadosParaForm(dados: unknown): CadastroPeloLinkInput {
  const d = (dados ?? {}) as Partial<Record<keyof CadastroPeloLinkInput, string | null>>;
  const texto = (k: keyof CadastroPeloLinkInput) => (typeof d[k] === "string" ? (d[k] as string) : "");
  return {
    nome: texto("nome"),
    telefone: texto("telefone"),
    cpf: texto("cpf"),
    nascimento: texto("nascimento"),
    endereco: texto("endereco"),
    emergenciaNome: texto("emergenciaNome"),
    emergenciaTelefone: texto("emergenciaTelefone"),
  };
}

/**
 * Aprova um cadastro que veio pelo link: grava o que a casa completa (tipo,
 * equipe, função, admissão, valores) e liga a pessoa. Daqui ela já aparece na
 * escala. Só quem configura o módulo aprova, porque aprovar é dar o salário.
 */
/** Um benefício como o cartão de aprovação manda: recebe e o valor digitado. */
export type BeneficioDaAprovacao = { itemId: number; recebe: boolean; valor: string };

export async function aprovarCadastro(
  id: number,
  raw: AprovacaoInput,
  beneficios: BeneficioDaAprovacao[] = [],
): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal aprova cadastros." };
  const parsed = aprovacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (!(await funcaoExiste(v.funcaoId))) return { ok: false, message: "Essa função não existe mais. Recarregue a página." };

  // Os benefícios: o que ficou igual ao padrão (tipo e valor do cadastro) não vira exceção.
  const itens = await prisma.itemDeCusto.findMany({
    where: { id: { in: beneficios.map((b) => b.itemId) } },
    select: { id: true, valor: true, tipos: true },
  });
  const escolhas: { itemId: number; recebe: boolean | null; valor: number | null }[] = [];
  for (const b of beneficios) {
    const item = itens.find((i) => i.id === b.itemId);
    if (!item) continue;
    const valor = lerValorProprio(b.valor);
    if (valor === undefined) return { ok: false, message: "Benefício: digite o valor em reais, ex.: 300,00" };
    escolhas.push({
      itemId: item.id,
      recebe: b.recebe === item.tipos.includes(v.tipo) ? null : b.recebe,
      valor: valor === null || valor === item.valor.toNumber() ? null : valor,
    });
  }

  const r = await prisma.$transaction(async (tx) => {
    const aprovado = await tx.colaborador.updateMany({
      where: { id, pendente: true },
      data: {
        apelido: v.apelido,
        tipo: v.tipo,
        area: v.area,
        funcaoId: v.funcaoId,
        comecouEm: v.comecouEm ? toDateOnly(v.comecouEm) : null,
        admissao: v.admissao ? toDateOnly(v.admissao) : null,
        salario: v.salario === null ? null : new Prisma.Decimal(v.salario),
        diaria: v.diaria === null ? null : new Prisma.Decimal(v.diaria),
        pendente: false,
        ativo: true,
      },
    });
    if (aprovado.count === 1) {
      for (const e of escolhas) await gravarItemDoColaborador(tx, id, e.itemId, e.recebe, e.valor);
    }
    return aprovado;
  });
  await feitoComCusto();
  if (r.count === 0) return { ok: false, message: "Este cadastro já foi resolvido." };
  return { ok: true };
}

/** Recusa um cadastro do link: apaga. Ele nunca entrou na escala, então não há histórico a guardar. */
export async function recusarCadastro(id: number): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal recusa cadastros." };
  await prisma.colaborador.deleteMany({ where: { id, pendente: true } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Funções (cadastro)
// ---------------------------------------------------------------------------

/** Outra função com o mesmo nome, sem olhar maiúscula: "garçom" e "Garçom" são a mesma. */
async function nomeEmUso(nome: string, fora?: number): Promise<boolean> {
  const igual = await prisma.funcao.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" }, ...(fora ? { id: { not: fora } } : {}) },
    select: { id: true },
  });
  return igual !== null;
}

export async function criarFuncao(nome: string): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal mexe nas funções." };
  const parsed = nomeDeFuncao.safeParse(nome);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  if (await nomeEmUso(parsed.data)) return { ok: false, message: "Essa função já existe." };
  await prisma.funcao.create({ data: { nome: parsed.data } });
  feito();
  return { ok: true };
}

/** Renomear vale para todo mundo que tem a função: o colaborador aponta para ela, não guarda o nome. */
export async function renomearFuncao(id: number, nome: string): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal mexe nas funções." };
  const parsed = nomeDeFuncao.safeParse(nome);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  if (await nomeEmUso(parsed.data, id)) return { ok: false, message: "Já existe outra função com esse nome." };
  await prisma.funcao.updateMany({ where: { id }, data: { nome: parsed.data } });
  feito();
  return { ok: true };
}

/** Desligar tira das listas de escolha; quem já tem a função continua com ela. */
export async function ligarFuncao(id: number, ativo: boolean): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal mexe nas funções." };
  await prisma.funcao.updateMany({ where: { id }, data: { ativo } });
  feito();
  return { ok: true };
}

/** Apagar só a função que ninguém usa. Com gente nela, o caminho é desligar. */
export async function apagarFuncao(id: number): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal mexe nas funções." };
  const usando = await prisma.colaborador.count({ where: { funcaoId: id } });
  if (usando > 0) return { ok: false, message: "Tem gente com essa função. Desligue em vez de apagar." };
  await prisma.funcao.deleteMany({ where: { id } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CMO
// ---------------------------------------------------------------------------

/** O faturamento fechado de um mês ("2026-10"). Vazio apaga. */
export async function salvarFaturamentoDoMes(mes: string, texto: string): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal digita o faturamento." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, message: "Mês inválido." };
  const limpo = texto.replace(/^R\$\s*/i, "").trim();
  if (limpo === "") {
    await prisma.faturamentoDoMes.deleteMany({ where: { mes } });
  } else {
    const n = lerNumeroBR(limpo);
    if (n === null || n <= 0 || n > 99999999) return { ok: false, message: "Faturamento: digite um valor, ex.: 180.000,00" };
    const valor = new Prisma.Decimal(Math.round(n * 100) / 100);
    await prisma.faturamentoDoMes.upsert({ where: { mes }, create: { mes, valor }, update: { valor } });
  }
  // O faturamento entra na média da projeção: o registro do mês acompanha.
  await feitoComCusto();
  return { ok: true };
}

/** A meta do CMO em % do faturamento. Vazio tira a meta. */
export async function salvarMetaCmo(texto: string): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: "Só quem configura o Departamento pessoal muda a meta." };
  const limpo = texto.replace("%", "").trim();
  let metaCmo: Prisma.Decimal | null = null;
  if (limpo !== "") {
    const n = lerNumeroBR(limpo);
    if (n === null || n <= 0 || n > 100) return { ok: false, message: "Meta: digite um % entre 0 e 100, ex.: 30" };
    metaCmo = new Prisma.Decimal(Math.round(n * 100) / 100);
  }
  await prisma.configuracaoPessoal.upsert({ where: { id: 1 }, create: { id: 1, metaCmo }, update: { metaCmo } });
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Encargos e benefícios (cadastro)
// ---------------------------------------------------------------------------

const SO_CONFIGURA = "Só quem configura o Departamento pessoal mexe nos encargos e benefícios.";

/** Cria (id nulo) ou atualiza um encargo ou benefício. */
export async function salvarItemDeCusto(id: number | null, raw: ItemDeCustoInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  const parsed = itemDeCustoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const igual = await prisma.itemDeCusto.findFirst({
    where: { nome: { equals: v.nome, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (igual) return { ok: false, message: "Já existe um item com esse nome." };
  const dados = { nome: v.nome, natureza: v.natureza, forma: v.forma, valor: new Prisma.Decimal(v.valor), tipos: v.tipos };
  if (id === null) await prisma.itemDeCusto.create({ data: dados });
  else await prisma.itemDeCusto.updateMany({ where: { id }, data: dados });
  await feitoComCusto();
  return { ok: true };
}

/** Desligado sai da conta do CMO; as exceções das pessoas ficam guardadas. */
export async function ligarItemDeCusto(id: number, ativo: boolean): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  await prisma.itemDeCusto.updateMany({ where: { id }, data: { ativo } });
  await feitoComCusto();
  return { ok: true };
}

/** Apaga o item e as exceções dele (cascade). */
export async function apagarItemDeCusto(id: number): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  await prisma.itemDeCusto.deleteMany({ where: { id } });
  await feitoComCusto();
  return { ok: true };
}

/** Os encargos do CLT que formam os 29% (13º, férias com 1/3, FGTS), os que ainda não existem. */
export async function criarEncargosPadrao(): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  await prisma.itemDeCusto.createMany({
    data: ENCARGOS_PADRAO_DO_CLT.map((e) => ({
      nome: e.nome,
      natureza: "ENCARGO" as const,
      forma: "PERCENTUAL_SALARIO" as const,
      valor: new Prisma.Decimal(e.valor),
      tipos: ["CLT" as const],
    })),
    skipDuplicates: true,
  });
  await feitoComCusto();
  return { ok: true };
}

/** "300,00" → 300; vazio → null (o valor do cadastro). Inválido → undefined. */
function lerValorProprio(texto: string | null | undefined): number | null | undefined {
  const limpo = (texto ?? "").replace(/^R\$\s*/i, "").replace("%", "").trim();
  if (limpo === "") return null;
  const n = lerNumeroBR(limpo);
  return n === null || n < 0 || n > 99999 ? undefined : Math.round(n * 100) / 100;
}

/**
 * Grava a exceção de uma pessoa num item: se recebe (nulo = segue o tipo) e o
 * valor dela (nulo = o do cadastro). Sem nada diferente do padrão, a linha
 * sai. Usada pela ficha e pela aprovação.
 */
async function gravarItemDoColaborador(
  db: Prisma.TransactionClient | typeof prisma,
  colaboradorId: number,
  itemId: number,
  recebe: boolean | null,
  valor: number | null,
) {
  if (recebe === null && valor === null) {
    await db.itemDoColaborador.deleteMany({ where: { colaboradorId, itemId } });
    return;
  }
  // Só o valor mudou: a linha guarda o "recebe" do tipo, para a exceção não mudar quem recebe.
  let quem = recebe;
  if (quem === null) {
    const [item, pessoa] = await Promise.all([
      db.itemDeCusto.findUnique({ where: { id: itemId }, select: { tipos: true } }),
      db.colaborador.findUnique({ where: { id: colaboradorId }, select: { tipo: true } }),
    ]);
    quem = !!item && !!pessoa && item.tipos.includes(pessoa.tipo);
  }
  const dados = { recebe: quem, valor: valor === null ? null : new Prisma.Decimal(valor) };
  await db.itemDoColaborador.upsert({
    where: { colaboradorId_itemId: { colaboradorId, itemId } },
    create: { colaboradorId, itemId, ...dados },
    update: dados,
  });
}

/**
 * A exceção de uma pessoa num item: `recebe` true põe, false tira, nulo
 * segue o tipo; `valor` é o dela ("300,00"), vazio volta ao do cadastro.
 */
export async function definirItemDoColaborador(
  colaboradorId: number,
  itemId: number,
  recebe: boolean | null,
  valor: string | null = null,
): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  const v = lerValorProprio(valor);
  if (v === undefined) return { ok: false, message: "Valor: digite em reais, ex.: 300,00" };
  await gravarItemDoColaborador(prisma, colaboradorId, itemId, recebe, v);
  await feitoComCusto();
  return { ok: true };
}

/**
 * Um benefício criado na hora, na aprovação ou na ficha: por mês ou por dia,
 * sem tipo marcado (vale só para quem for marcado). Devolve o id.
 */
export async function criarBeneficioRapido(
  nome: string,
  forma: "POR_MES" | "POR_DIA",
  valor: string,
): Promise<Result<{ id: number; nome: string; valor: number }>> {
  const user = await requireModule(MODULO);
  if (!can(user, MODULO, { configure: true })) return { ok: false, message: SO_CONFIGURA };
  const parsed = itemDeCustoSchema.safeParse({ nome, natureza: "BENEFICIO", forma, valor, tipos: [] });
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const igual = await prisma.itemDeCusto.findFirst({
    where: { nome: { equals: v.nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (igual) return { ok: false, message: "Já existe um item com esse nome. Ligue ele na lista." };
  const item = await prisma.itemDeCusto.create({
    data: { nome: v.nome, natureza: "BENEFICIO", forma: v.forma, valor: new Prisma.Decimal(v.valor), tipos: [] },
    select: { id: true, nome: true },
  });
  feito();
  return { ok: true, data: { id: item.id, nome: item.nome, valor: v.valor } };
}
