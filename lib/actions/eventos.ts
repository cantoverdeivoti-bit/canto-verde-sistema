"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { CHECKLIST_PADRAO, ETAPA_CARDAPIO } from "@/lib/eventos";
import { somarDiasNaData } from "@/lib/eventos-calculo";
import { cardapiosComCusto, configuracaoEventos } from "@/lib/eventos-dados";
import { FUSO_DA_CASA } from "@/lib/format";
import {
  cardapioSchema,
  type CardapioInput,
  clienteEventoSchema,
  type ClienteEventoInput,
  configuracaoEventosSchema,
  type ConfiguracaoEventosInput,
  eventoSchema,
  type EventoInput,
  interacaoSchema,
  type InteracaoInput,
  itemDeModeloSchema,
  type ItemDeModeloInput,
  linhaDoEventoSchema,
  type LinhaDoEventoInput,
  novoEventoSchema,
  type NovoEventoInput,
  pagamentoSchema,
  type PagamentoInput,
  porcoesPorPessoa,
  tarefaDoEventoSchema,
  type TarefaDoEventoInput,
} from "@/lib/validations";
import { type EtapaCardapio, type MotivoPerda, Prisma, type StatusEvento } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

const MODULO = "eventos";

function feito() {
  revalidatePath("/admin/eventos", "layout");
}

function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

const dec = (n: number) => new Prisma.Decimal(n);
const dataOuNulo = (d: string | null) => (d ? toDateOnly(d) : null);
const hoje = () => todayInTimezone(FUSO_DA_CASA);

/** Falha de banco vira mensagem; o detalhe fica no log. */
async function tentar<T>(nome: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    feito();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return { ok: false, message: "Isso não existe mais. Recarregue a página." };
    console.error(`[${nome}] falha:`, error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Para a ação que só grava: o que o banco devolve não volta para a tela (Decimal não atravessa). */
async function gravar(nome: string, fn: () => Promise<unknown>): Promise<Simples> {
  const r = await tentar(nome, async () => {
    await fn();
    return null;
  });
  return r.ok ? { ok: true } : r;
}

// ---------------------------------------------------------------------------
// Clientes (CRM)
// ---------------------------------------------------------------------------

/**
 * Cria (id nulo) ou atualiza um cliente. Telefone repetido é recusado na
 * criação: é quase sempre a mesma pessoa cadastrada duas vezes, e o histórico
 * dela ficaria partido ao meio.
 */
export async function salvarCliente(id: number | null, raw: ClienteEventoInput): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const parsed = clienteEventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;

  if (v.telefone) {
    const mesmo = await prisma.clienteEvento.findFirst({
      where: { telefone: v.telefone, ...(id ? { id: { not: id } } : {}) },
      select: { nome: true },
    });
    if (mesmo) return { ok: false, message: `Esse telefone já é de ${mesmo.nome}. Abra o cadastro dele em vez de criar outro.` };
  }

  const dados = { ...v, proximoContato: dataOuNulo(v.proximoContato) };
  return tentar("salvarCliente", async () => {
    const r = id === null
      ? await prisma.clienteEvento.create({ data: dados, select: { id: true } })
      : await prisma.clienteEvento.update({ where: { id }, data: dados, select: { id: true } });
    return { id: r.id };
  });
}

/** Só sai quem nunca teve evento: quem já teve é histórico. */
export async function apagarCliente(id: number): Promise<Simples> {
  await requireModule(MODULO);
  if ((await prisma.evento.count({ where: { clienteId: id } })) > 0)
    return { ok: false, message: "Esse cliente tem eventos. Apague os eventos antes, ou deixe o cadastro." };
  return gravar("apagarCliente", () => prisma.clienteEvento.delete({ where: { id } }));
}

/** Anota uma conversa. Se ela marcou o próximo contato, a data vai para o cliente. */
export async function registrarInteracao(
  clienteId: number,
  eventoId: number | null,
  raw: InteracaoInput,
): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = interacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (eventoId !== null && (await prisma.evento.count({ where: { id: eventoId, clienteId } })) === 0)
    return { ok: false, message: "Esse evento não é deste cliente." };
  return gravar("registrarInteracao", () =>
    prisma.$transaction([
      prisma.interacaoCliente.create({ data: { clienteId, eventoId, tipo: v.tipo, texto: v.texto, autorId: user.id } }),
      ...(v.proximoContato
        ? [prisma.clienteEvento.update({ where: { id: clienteId }, data: { proximoContato: toDateOnly(v.proximoContato) } })]
        : []),
    ]),
  );
}

export async function apagarInteracao(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarInteracao", () => prisma.interacaoCliente.delete({ where: { id } }));
}

/** "Já falei": tira o cliente da lista de retorno. */
export async function limparProximoContato(clienteId: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("limparProximoContato", () =>
    prisma.clienteEvento.update({ where: { id: clienteId }, data: { proximoContato: null } }),
  );
}

// ---------------------------------------------------------------------------
// Cardápios
// ---------------------------------------------------------------------------

export async function salvarCardapio(id: number | null, raw: CardapioInput): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const parsed = cardapioSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const dados = { ...v, precoPorPessoa: v.precoPorPessoa === null ? null : dec(v.precoPorPessoa) };
  return tentar("salvarCardapio", async () => {
    const r = id === null
      ? await prisma.cardapio.create({ data: dados, select: { id: true } })
      : await prisma.cardapio.update({ where: { id }, data: dados, select: { id: true } });
    return { id: r.id };
  });
}

export async function ligarCardapio(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("ligarCardapio", () => prisma.cardapio.update({ where: { id }, data: { ativo } }));
}

/** Os eventos guardam a cópia dos números, então apagar o cardápio não mexe em orçamento nenhum. */
export async function apagarCardapio(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarCardapio", () => prisma.cardapio.delete({ where: { id } }));
}

/** Um cardápio novo com as mesmas fichas: o ponto de partida de uma variação. */
export async function duplicarCardapio(id: number): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const c = await prisma.cardapio.findUnique({ where: { id }, include: { itens: true } });
  if (!c) return { ok: false, message: "Esse cardápio não existe mais." };
  return tentar("duplicarCardapio", async () => {
    const novo = await prisma.cardapio.create({
      data: {
        nome: `${c.nome} (cópia)`.slice(0, 100),
        descricao: c.descricao,
        precoPorPessoa: c.precoPorPessoa,
        itens: {
          create: c.itens.map((i) => ({ fichaId: i.fichaId, etapa: i.etapa, porcoesPorPessoa: i.porcoesPorPessoa, ordem: i.ordem })),
        },
      },
      select: { id: true },
    });
    return { id: novo.id };
  });
}

const ehEtapa = (v: string): v is EtapaCardapio => Object.hasOwn(ETAPA_CARDAPIO, v);

/**
 * Põe uma ficha do Receituário no cardápio. A ficha ganha a operação Eventos,
 * para aparecer quando o Receituário filtra o que a casa serve em evento.
 */
export async function adicionarAoCardapio(cardapioId: number, fichaId: number, etapa: string, porcoes: string): Promise<Simples> {
  await requireModule(MODULO);
  const p = porcoesPorPessoa.safeParse(porcoes);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  if (!ehEtapa(etapa)) return { ok: false, message: "Escolha a etapa do menu." };
  const ficha = await prisma.fichaTecnica.findUnique({ where: { id: fichaId }, select: { operacoes: true } });
  if (!ficha) return { ok: false, message: "Essa ficha não existe mais. Recarregue a página." };
  const ultimo = await prisma.cardapioItem.aggregate({ where: { cardapioId }, _max: { ordem: true } });
  return gravar("adicionarAoCardapio", () =>
    prisma.$transaction([
      prisma.cardapioItem.create({
        data: { cardapioId, fichaId, etapa, porcoesPorPessoa: dec(p.data), ordem: (ultimo._max.ordem ?? 0) + 1 },
      }),
      ...(ficha.operacoes.includes("EVENTOS")
        ? []
        : [prisma.fichaTecnica.update({ where: { id: fichaId }, data: { operacoes: { push: "EVENTOS" } } })]),
    ]),
  );
}

export async function mudarEtapa(itemId: number, etapa: string): Promise<Simples> {
  await requireModule(MODULO);
  if (!ehEtapa(etapa)) return { ok: false, message: "Escolha a etapa do menu." };
  return gravar("mudarEtapa", () => prisma.cardapioItem.update({ where: { id: itemId }, data: { etapa } }));
}

export async function mudarPorcoes(itemId: number, porcoes: string): Promise<Simples> {
  await requireModule(MODULO);
  const p = porcoesPorPessoa.safeParse(porcoes);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  return gravar("mudarPorcoes", () =>
    prisma.cardapioItem.update({ where: { id: itemId }, data: { porcoesPorPessoa: dec(p.data) } }),
  );
}

export async function tirarDoCardapio(itemId: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("tirarDoCardapio", () => prisma.cardapioItem.delete({ where: { id: itemId } }));
}

// ---------------------------------------------------------------------------
// Eventos (orçamentos)
// ---------------------------------------------------------------------------

/**
 * As linhas que o cardápio põe no evento: uma só, por convidado, com o custo e
 * o preço por pessoa de hoje. O preço vazio no cardápio vira zero, e a tela
 * mostra a linha sem preço para alguém decidir.
 */
async function linhasDoCardapio(cardapioId: number, convidados: number) {
  const [c] = await cardapiosComCusto({ id: cardapioId });
  if (!c) return null;
  return [
    {
      categoria: "CARDAPIO" as const,
      descricao: `Cardápio: ${c.nome}`.slice(0, 160),
      quantidade: dec(convidados),
      unidade: "pessoa",
      custoUnitario: dec(c.custoPorPessoa),
      precoUnitario: dec(c.precoPorPessoa ?? 0),
      porConvidado: true,
      doCardapio: true,
    },
  ];
}

/**
 * O orçamento novo. Nasce em rascunho, com os percentuais da configuração, a
 * locação do espaço (se a casa tem um valor base) e o cardápio, se escolhido.
 */
export async function criarEvento(raw: NovoEventoInput): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const parsed = novoEventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const config = await configuracaoEventos();

  let clienteId = Number(v.clienteId) || null;
  if (clienteId !== null && (await prisma.clienteEvento.count({ where: { id: clienteId } })) === 0)
    return { ok: false, message: "Esse cliente não existe mais. Recarregue a página." };
  if (clienteId === null && v.clienteTelefone) {
    const mesmo = await prisma.clienteEvento.findFirst({ where: { telefone: v.clienteTelefone }, select: { id: true } });
    // O mesmo telefone já cadastrado: usa o cadastro em vez de duplicar a pessoa.
    if (mesmo) clienteId = mesmo.id;
  }

  const cardapioId = Number(v.cardapioId) || null;
  const comida = cardapioId ? await linhasDoCardapio(cardapioId, v.convidados) : [];
  if (comida === null) return { ok: false, message: "Esse cardápio não existe mais. Recarregue a página." };

  const linhas = [
    ...(config.valorLocacao
      ? [{ categoria: "ESPACO" as const, descricao: "Locação do espaço", quantidade: dec(1), unidade: "un", precoUnitario: dec(config.valorLocacao) }]
      : []),
    ...comida,
  ].map((l, i) => ({ ...l, ordem: i + 1 }));

  return tentar("criarEvento", async () => {
    const e = await prisma.evento.create({
      data: {
        ...(clienteId
          ? { cliente: { connect: { id: clienteId } } }
          : { cliente: { create: { nome: v.clienteNome, telefone: v.clienteTelefone } } }),
        titulo: v.titulo,
        tipo: v.tipo,
        data: toDateOnly(v.data),
        horaInicio: v.horaInicio,
        horaFim: v.horaFim,
        convidados: v.convidados,
        formato: v.formato,
        ...(cardapioId ? { cardapio: { connect: { id: cardapioId } } } : {}),
        taxaServicoPct: dec(config.taxaServicoPct),
        impostoPct: dec(config.impostoPct),
        linhas: { create: linhas },
      },
      select: { id: true },
    });
    return { id: e.id };
  });
}

/** Os dados do evento. Mudou o número de convidados, as linhas por convidado acompanham. */
export async function salvarEvento(id: number, raw: EventoInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = eventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  return gravar("salvarEvento", () =>
    prisma.$transaction([
      prisma.evento.update({
        where: { id },
        data: {
          ...v,
          data: toDateOnly(v.data),
          taxaServicoPct: dec(v.taxaServicoPct),
          impostoPct: dec(v.impostoPct),
        },
      }),
      prisma.eventoLinha.updateMany({ where: { eventoId: id, porConvidado: true }, data: { quantidade: dec(v.convidados) } }),
    ]),
  );
}

/** De onde para onde o status pode andar. Voltar um passo vale: clique errado se desfaz. */
const PROXIMOS: Record<StatusEvento, StatusEvento[]> = {
  RASCUNHO: ["ENVIADO", "CONFIRMADO", "PERDIDO"],
  ENVIADO: ["RASCUNHO", "CONFIRMADO", "PERDIDO"],
  CONFIRMADO: ["ENVIADO", "REALIZADO", "CANCELADO"],
  REALIZADO: ["CONFIRMADO"],
  PERDIDO: ["RASCUNHO"],
  CANCELADO: ["CONFIRMADO", "RASCUNHO"],
};

export async function mudarStatus(
  id: number,
  novo: StatusEvento,
  perda?: { motivo: MotivoPerda; texto: string },
): Promise<Simples> {
  await requireModule(MODULO);
  const e = await prisma.evento.findUnique({ where: { id }, select: { status: true, validoAte: true } });
  if (!e) return { ok: false, message: "Esse evento não existe mais." };
  if (!PROXIMOS[e.status].includes(novo)) return { ok: false, message: "A situação mudou. Recarregue a página." };
  if ((novo === "PERDIDO" || novo === "CANCELADO") && !perda)
    return { ok: false, message: "Diga o motivo: é o que mostra, com o tempo, por que a casa perde evento." };

  const agora = new Date();
  const datas: Prisma.EventoUpdateInput = {};
  if (novo === "ENVIADO") {
    datas.enviadoEm = agora;
    // A validade conta do envio. Quem já escreveu uma, fica com a dela.
    if (!e.validoAte) {
      const { validadeDias } = await configuracaoEventos();
      datas.validoAte = toDateOnly(somarDiasNaData(hoje(), validadeDias));
    }
  }
  if (novo === "CONFIRMADO") datas.confirmadoEm = agora;
  if (novo === "REALIZADO") datas.realizadoEm = agora;
  if (novo === "PERDIDO" || novo === "CANCELADO") {
    datas.encerradoEm = agora;
    datas.motivoPerda = perda!.motivo;
    datas.motivoPerdaTexto = perda!.texto.trim().slice(0, 500) || null;
  } else {
    datas.encerradoEm = null;
    datas.motivoPerda = null;
    datas.motivoPerdaTexto = null;
  }

  return gravar("mudarStatus", () => prisma.evento.update({ where: { id }, data: { status: novo, ...datas } }));
}

export async function mudarValidade(id: number, data: string): Promise<Simples> {
  await requireModule(MODULO);
  if (data !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, message: "Data inválida." };
  return gravar("mudarValidade", () => prisma.evento.update({ where: { id }, data: { validoAte: dataOuNulo(data) } }));
}

/**
 * Um orçamento novo com tudo deste (linhas, cliente, cardápio), em rascunho e
 * sem pagamento nem checklist. Para o cliente que volta no ano seguinte, ou
 * para mandar duas opções.
 */
export async function duplicarEvento(id: number): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const e = await prisma.evento.findUnique({ where: { id }, include: { linhas: true } });
  if (!e) return { ok: false, message: "Esse evento não existe mais." };
  return tentar("duplicarEvento", async () => {
    const novo = await prisma.evento.create({
      data: {
        clienteId: e.clienteId,
        titulo: `${e.titulo} (cópia)`.slice(0, 120),
        tipo: e.tipo,
        data: e.data,
        horaInicio: e.horaInicio,
        horaFim: e.horaFim,
        convidados: e.convidados,
        formato: e.formato,
        cardapioId: e.cardapioId,
        taxaServicoPct: e.taxaServicoPct,
        impostoPct: e.impostoPct,
        observacoesCliente: e.observacoesCliente,
        observacoesInternas: e.observacoesInternas,
        linhas: {
          create: e.linhas.map((l) => ({
            categoria: l.categoria,
            descricao: l.descricao,
            quantidade: l.quantidade,
            unidade: l.unidade,
            custoUnitario: l.custoUnitario,
            precoUnitario: l.precoUnitario,
            porConvidado: l.porConvidado,
            doCardapio: l.doCardapio,
            ordem: l.ordem,
          })),
        },
      },
      select: { id: true },
    });
    return { id: novo.id };
  });
}

/** Só sai o que não aconteceu: confirmado e realizado são histórico (e dinheiro). */
export async function apagarEvento(id: number): Promise<Simples> {
  await requireModule(MODULO);
  const e = await prisma.evento.findUnique({ where: { id }, select: { status: true } });
  if (!e) return { ok: false, message: "Esse evento não existe mais." };
  if (e.status === "CONFIRMADO" || e.status === "REALIZADO")
    return { ok: false, message: "Evento confirmado ou realizado não se apaga. Marque como cancelado." };
  return gravar("apagarEvento", () => prisma.evento.delete({ where: { id } }));
}

// --- linhas ----------------------------------------------------------------

function dadosDaLinha(v: z.output<typeof linhaDoEventoSchema>) {
  return {
    categoria: v.categoria,
    descricao: v.descricao,
    quantidade: dec(v.quantidade),
    unidade: v.unidade,
    custoUnitario: dec(v.custoUnitario),
    precoUnitario: dec(v.precoUnitario),
  };
}

export async function adicionarLinha(eventoId: number, raw: LinhaDoEventoInput, porConvidado: boolean): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = linhaDoEventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const e = await prisma.evento.findUnique({ where: { id: eventoId }, select: { convidados: true } });
  if (!e) return { ok: false, message: "Esse evento não existe mais." };
  const ultimo = await prisma.eventoLinha.aggregate({ where: { eventoId }, _max: { ordem: true } });
  const dados = dadosDaLinha(parsed.data);
  return gravar("adicionarLinha", () =>
    prisma.eventoLinha.create({
      data: {
        ...dados,
        ...(porConvidado ? { quantidade: dec(e.convidados), porConvidado: true } : {}),
        eventoId,
        ordem: (ultimo._max.ordem ?? 0) + 1,
      },
    }),
  );
}

export async function salvarLinha(linhaId: number, raw: LinhaDoEventoInput, porConvidado: boolean): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = linhaDoEventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const l = await prisma.eventoLinha.findUnique({ where: { id: linhaId }, select: { evento: { select: { convidados: true } } } });
  if (!l) return { ok: false, message: "Essa linha não existe mais." };
  const dados = dadosDaLinha(parsed.data);
  return gravar("salvarLinha", () =>
    prisma.eventoLinha.update({
      where: { id: linhaId },
      data: { ...dados, porConvidado, ...(porConvidado ? { quantidade: dec(l.evento.convidados) } : {}) },
    }),
  );
}

export async function removerLinha(linhaId: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("removerLinha", () => prisma.eventoLinha.delete({ where: { id: linhaId } }));
}

/**
 * Põe o cardápio no evento com os números de hoje. Troca só as linhas que
 * vieram de cardápio: comida lançada à mão fica.
 */
export async function aplicarCardapio(eventoId: number, cardapioId: number): Promise<Simples> {
  await requireModule(MODULO);
  const e = await prisma.evento.findUnique({ where: { id: eventoId }, select: { convidados: true } });
  if (!e) return { ok: false, message: "Esse evento não existe mais." };
  const linhas = await linhasDoCardapio(cardapioId, e.convidados);
  if (!linhas) return { ok: false, message: "Esse cardápio não existe mais." };
  const ultimo = await prisma.eventoLinha.aggregate({ where: { eventoId }, _max: { ordem: true } });
  return gravar("aplicarCardapio", () =>
    prisma.$transaction([
      prisma.eventoLinha.deleteMany({ where: { eventoId, doCardapio: true } }),
      prisma.eventoLinha.createMany({
        data: linhas.map((l, i) => ({ ...l, eventoId, ordem: (ultimo._max.ordem ?? 0) + i + 1 })),
      }),
      prisma.evento.update({ where: { id: eventoId }, data: { cardapioId } }),
    ]),
  );
}

// --- pagamentos ------------------------------------------------------------

export async function registrarPagamento(eventoId: number, raw: PagamentoInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = pagamentoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  return gravar("registrarPagamento", () =>
    prisma.eventoPagamento.create({ data: { ...v, eventoId, valor: dec(v.valor), data: toDateOnly(v.data) } }),
  );
}

export async function apagarPagamento(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarPagamento", () => prisma.eventoPagamento.delete({ where: { id } }));
}

// --- checklist do evento ---------------------------------------------------

/** Copia o modelo para o evento, com o prazo em data. Aplicar de novo soma, não troca. */
export async function aplicarModelo(eventoId: number, modeloId: number): Promise<Simples> {
  await requireModule(MODULO);
  const [e, modelo, ultimo] = await Promise.all([
    prisma.evento.findUnique({ where: { id: eventoId }, select: { data: true } }),
    prisma.modeloChecklist.findUnique({ where: { id: modeloId }, include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } } }),
    prisma.eventoChecklistItem.aggregate({ where: { eventoId }, _max: { ordem: true } }),
  ]);
  if (!e || !modelo) return { ok: false, message: "Recarregue a página: algo mudou." };
  const dia = dateOnlyToString(e.data);
  const base = ultimo._max.ordem ?? 0;
  return gravar("aplicarModelo", () =>
    prisma.eventoChecklistItem.createMany({
      data: modelo.itens.map((i, n) => ({
        eventoId,
        texto: i.texto,
        etapa: i.etapa,
        prazo: i.dias === null ? null : toDateOnly(somarDiasNaData(dia, i.dias)),
        ordem: base + n + 1,
      })),
    }),
  );
}

export async function adicionarTarefa(eventoId: number, raw: TarefaDoEventoInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = tarefaDoEventoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const ultimo = await prisma.eventoChecklistItem.aggregate({ where: { eventoId }, _max: { ordem: true } });
  return gravar("adicionarTarefa", () =>
    prisma.eventoChecklistItem.create({
      data: { ...v, eventoId, prazo: dataOuNulo(v.prazo), ordem: (ultimo._max.ordem ?? 0) + 1 },
    }),
  );
}

export async function marcarTarefa(id: number, feitoAgora: boolean): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("marcarTarefa", () =>
    prisma.eventoChecklistItem.update({ where: { id }, data: { feito: feitoAgora, feitoEm: feitoAgora ? new Date() : null } }),
  );
}

export async function apagarTarefa(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarTarefa", () => prisma.eventoChecklistItem.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Modelos de checklist
// ---------------------------------------------------------------------------

const nomeDeModelo = (nome: string) => {
  const n = nome.trim();
  return n.length < 2 || n.length > 80 ? null : n;
};

export async function criarModelo(nome: string): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  const n = nomeDeModelo(nome);
  if (!n) return { ok: false, message: "Dê um nome ao modelo, ex.: Jantar sentado." };
  return tentar("criarModelo", async () => ({ id: (await prisma.modeloChecklist.create({ data: { nome: n } })).id }));
}

/** O roteiro de `CHECKLIST_PADRAO`, para a casa não começar do zero. */
export async function criarModeloPadrao(): Promise<Result<{ id: number }>> {
  await requireModule(MODULO);
  return tentar("criarModeloPadrao", async () => {
    const m = await prisma.modeloChecklist.create({
      data: {
        nome: "Evento padrão",
        itens: { create: CHECKLIST_PADRAO.map((i, n) => ({ ...i, ordem: n + 1 })) },
      },
    });
    return { id: m.id };
  });
}

export async function renomearModelo(id: number, nome: string): Promise<Simples> {
  await requireModule(MODULO);
  const n = nomeDeModelo(nome);
  if (!n) return { ok: false, message: "O nome precisa ter de 2 a 80 letras." };
  return gravar("renomearModelo", () => prisma.modeloChecklist.update({ where: { id }, data: { nome: n } }));
}

/** O checklist já copiado para os eventos fica: o modelo é só a origem. */
export async function apagarModelo(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarModelo", () => prisma.modeloChecklist.delete({ where: { id } }));
}

export async function adicionarItemAoModelo(modeloId: number, raw: ItemDeModeloInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = itemDeModeloSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const ultimo = await prisma.modeloChecklistItem.aggregate({ where: { modeloId }, _max: { ordem: true } });
  return gravar("adicionarItemAoModelo", () =>
    prisma.modeloChecklistItem.create({ data: { ...parsed.data, modeloId, ordem: (ultimo._max.ordem ?? 0) + 1 } }),
  );
}

export async function salvarItemDoModelo(id: number, raw: ItemDeModeloInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = itemDeModeloSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  return gravar("salvarItemDoModelo", () => prisma.modeloChecklistItem.update({ where: { id }, data: parsed.data }));
}

export async function apagarItemDoModelo(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarItemDoModelo", () => prisma.modeloChecklistItem.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export async function salvarConfiguracaoEventos(raw: ConfiguracaoEventosInput): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  const parsed = configuracaoEventosSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (v.margemAlvoPct + v.impostoPct >= 100)
    return { ok: false, message: "Margem e imposto somam 100% ou mais: não existe preço que cubra isso." };
  const dados = {
    ...v,
    margemAlvoPct: dec(v.margemAlvoPct),
    impostoPct: dec(v.impostoPct),
    taxaServicoPct: dec(v.taxaServicoPct),
    sinalPct: dec(v.sinalPct),
    valorLocacao: v.valorLocacao === null ? null : dec(v.valorLocacao),
  };
  return gravar("salvarConfiguracaoEventos", () =>
    prisma.configuracaoEventos.upsert({ where: { id: 1 }, create: { id: 1, ...dados }, update: dados }),
  );
}
