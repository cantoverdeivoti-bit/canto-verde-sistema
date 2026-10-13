import type { Workbook, Worksheet } from "exceljs";

import { dateOnlyToString, toDateOnly } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { CHAVE_CATEGORIA, GRUPO_DRE, mesCurto, nomeDoMes, ORIGEM_LANCAMENTO, TIPO_LANCAMENTO } from "@/lib/financeiro";
import { diaDoMes, emLotes, partidasDoMes, somarMeses } from "@/lib/financeiro-calculo";
import { competenciaDo, dreDoMes } from "@/lib/financeiro-dados";

/**
 * Os arquivos que o Financeiro entrega: a DRE em xlsx, a planilha do mês e as
 * partidas para o contador, e os anexos em lotes.
 *
 * Moram aqui, e não nas rotas, porque a rota da DRE e a do pacote do contador
 * montam os mesmos arquivos.
 */

const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

/**
 * O teto de uma parte do pacote. A Vercel corta resposta de função acima de
 * 4,5 MB; 4 MB deixa folga para o cabeçalho do ZIP.
 */
export const TETO_DA_PARTE = 4_000_000;

/** "Conta de luz: setembro" vira "conta-de-luz-setembro", para nome de arquivo. */
export function paraArquivo(texto: string, max = 40): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, max) || "arquivo"
  );
}

async function novoLivro(): Promise<Workbook> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "Canto Verde";
  return wb;
}

async function bytesDo(wb: Workbook): Promise<Uint8Array> {
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** A aba oculta que explica a planilha. Título em caixa alta sai em negrito. */
function escreverSobre(wb: Workbook, linhas: string[]) {
  const sobre = wb.addWorksheet("Sobre esta planilha", { state: "hidden" });
  sobre.getColumn(1).width = 110;
  for (const t of linhas) {
    const r = sobre.addRow([t]);
    if (t.length > 0 && t === t.toUpperCase()) r.font = { bold: true };
    r.alignment = { wrapText: true };
  }
}

function cabecalho(aba: Worksheet) {
  aba.getRow(1).font = { bold: true };
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

/**
 * A DRE em xlsx: os três meses da tela e, numa aba à parte, os lançamentos do
 * mês que formam os números. `centro` recorta como a tela.
 */
export async function planilhaDaDre(mes: string, centro?: number | null): Promise<{ nome: string; bytes: Uint8Array }> {
  const meses = [somarMeses(mes, -2), somarMeses(mes, -1), mes];
  const nomeDoCentro =
    centro === undefined ? null : centro === null ? "sem centro" : ((await prisma.centroCusto.findUnique({ where: { id: centro } }))?.nome ?? null);
  const [dres, lancamentos] = await Promise.all([
    Promise.all(meses.map((m) => dreDoMes(m, centro))),
    prisma.lancamento.findMany({
      where: { competencia: competenciaDo(mes), ...(centro === undefined ? {} : { centroCustoId: centro }) },
      orderBy: [{ tipo: "asc" }, { vencimento: "asc" }],
      include: { categoria: { include: { subgrupo: true } }, conta: true, fornecedor: true, centroCusto: true },
    }),
  ]);

  const wb = await novoLivro();
  const dre = wb.addWorksheet("DRE", { views: [{ state: "frozen", ySplit: 1 }] });
  dre.columns = [{ header: "", width: 42 }, ...meses.map((m) => ({ header: mesCurto(m), width: 16 })), { header: "% da receita", width: 14 }];
  cabecalho(dre);
  const atual = dres[2];
  for (const linha of atual.linhas) {
    const doMes = (i: number) => dres[i].linhas.find((l) => l.chave === linha.chave);
    const r = dre.addRow([linha.rotulo, ...meses.map((_, i) => doMes(i)?.valor ?? 0), linha.pct === null ? null : linha.pct / 100]);
    if (linha.tipo === "total") {
      r.font = { bold: true };
      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EDE6" } };
    } else r.font = { bold: true, color: { argb: "FF555555" } };
    // Os subgrupos e as categorias dos três meses, cada um com o recuo do seu nível.
    const subDe = (i: number, sub: string) => doMes(i)?.subgrupos.find((s) => s.nome === sub);
    const subgrupos = [...new Set(dres.flatMap((d) => d.linhas.find((l) => l.chave === linha.chave)?.subgrupos.map((s) => s.nome) ?? []))];
    for (const sub of subgrupos) {
      const pctSub = subDe(2, sub)?.pct ?? null;
      dre.addRow([`    ${sub}`, subDe(0, sub)?.valor ?? 0, subDe(1, sub)?.valor ?? 0, subDe(2, sub)?.valor ?? 0, pctSub === null ? null : pctSub / 100]).font = {
        bold: true,
      };
      const nomes = [...new Set([0, 1, 2].flatMap((i) => subDe(i, sub)?.categorias.map((c) => c.nome) ?? []))];
      for (const nome of nomes) {
        const valorEm = (i: number) => subDe(i, sub)?.categorias.find((c) => c.nome === nome)?.valor ?? 0;
        const pct = subDe(2, sub)?.categorias.find((c) => c.nome === nome)?.pct ?? null;
        dre.addRow([`        ${nome}`, valorEm(0), valorEm(1), valorEm(2), pct === null ? null : pct / 100]);
      }
    }
  }
  if (atual.foraDoResultado.categorias.length > 0) {
    dre.addRow([]);
    dre.addRow(["Fora do resultado (mexe no caixa, não é lucro)"]).font = { bold: true };
    for (const c of atual.foraDoResultado.categorias) {
      const valorEm = (i: number) =>
        dres[i].foraDoResultado.categorias.find((x) => x.nome === c.nome && x.subgrupo === c.subgrupo)?.valor ?? 0;
      dre.addRow([`    ${c.subgrupo} · ${c.nome}`, valorEm(0), valorEm(1), valorEm(2), null]);
    }
  }
  for (const col of [2, 3, 4]) dre.getColumn(col).numFmt = MOEDA;
  dre.getColumn(5).numFmt = "0.0%";

  const lista = wb.addWorksheet(`Lançamentos ${mesCurto(mes).replace("/", "-")}`, { views: [{ state: "frozen", ySplit: 1 }] });
  lista.columns = [
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Grupo da DRE", key: "grupo", width: 24 },
    { header: "Subgrupo", key: "subgrupo", width: 22 },
    { header: "Categoria", key: "categoria", width: 28 },
    { header: "Fornecedor", key: "fornecedor", width: 24 },
    { header: "Centro de custo", key: "centro", width: 18 },
    { header: "Vencimento", key: "vencimento", width: 12 },
    { header: "Valor", key: "valor", width: 14 },
    { header: "Taxa", key: "taxa", width: 12 },
    { header: "Situação", key: "status", width: 12 },
    { header: "Baixa em", key: "pagoEm", width: 12 },
    { header: "Valor da baixa", key: "valorPago", width: 14 },
    { header: "Conta", key: "conta", width: 20 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Origem", key: "origem", width: 18 },
  ];
  cabecalho(lista);
  for (const l of lancamentos) {
    lista.addRow({
      tipo: TIPO_LANCAMENTO[l.tipo],
      descricao: l.descricao,
      categoria: l.categoria.nome,
      grupo: GRUPO_DRE[l.categoria.grupo],
      subgrupo: l.categoria.subgrupo.nome,
      fornecedor: l.fornecedor ? (l.fornecedor.apelido ?? l.fornecedor.name) : "",
      centro: l.centroCusto?.nome ?? "",
      vencimento: l.vencimento,
      valor: l.valor.toNumber(),
      taxa: l.taxa.toNumber(),
      status: l.status === "PAGO" ? "baixado" : l.status === "CANCELADO" ? "cancelado" : "em aberto",
      pagoEm: l.pagoEm,
      valorPago: l.valorPago?.toNumber() ?? null,
      conta: l.conta?.nome ?? "",
      documento: l.documento ?? "",
      origem: ORIGEM_LANCAMENTO[l.origem],
    });
  }
  for (const k of ["vencimento", "pagoEm"]) lista.getColumn(k).numFmt = "dd/mm/yyyy";
  for (const k of ["valor", "taxa", "valorPago"]) lista.getColumn(k).numFmt = MOEDA;
  lista.autoFilter = { from: "A1", to: "O1" };

  escreverSobre(wb, [
    `DRE de ${nomeDoMes(mes)}${nomeDoCentro ? ` (centro de custo: ${nomeDoCentro})` : ""}, exportada do módulo Financeiro do Canto Verde.`,
    "",
    "OBJETIVO",
    "Mostrar o resultado do mês (o que vendeu, o que custou e o que sobrou) e permitir que o contador ou o dono confira de onde vem cada número.",
    "",
    "ABA DRE",
    "Três meses lado a lado: os dois anteriores e o mês escolhido. A última coluna é o % de cada linha sobre a receita bruta do mês escolhido.",
    "Regime de competência: a despesa entra no mês a que pertence, mesmo que paga em outro (a luz de setembro paga em outubro conta em setembro).",
    "Receita bruta = vendas menos a taxa de serviço, que pela Lei 13.419 é da equipe e não da casa.",
    "Deduções = impostos sobre a venda (DAS) mais as taxas das maquininhas de cartão.",
    "Financeiro = rendimentos menos tarifas, juros e multas pagos no mês (juros e descontos entram pela data da baixa).",
    "Fora do resultado = retirada de sócio, investimento e empréstimo: mexem no caixa, mas não são lucro nem prejuízo.",
    "Lançamentos cancelados não entram.",
    "",
    "ABA LANÇAMENTOS",
    "Cada conta a pagar e a receber com competência no mês escolhido, inclusive as em aberto e as canceladas (marcadas na coluna Situação).",
    "Valor é o valor cheio; Taxa é o que a maquininha fica; Valor da baixa é o que de fato entrou ou saiu da conta.",
    "Centro de custo é a área da casa (salão, eventos, delivery, administrativo) a que o lançamento pertence.",
    "",
    "COMO USAR",
    "Os números saem do sistema: para corrigir, corrija o lançamento no Financeiro e exporte de novo. Editar aqui não muda nada lá.",
  ]);

  const sufixo = nomeDoCentro ? `-${paraArquivo(nomeDoCentro)}` : "";
  return { nome: `dre-${mes}${sufixo}.xlsx`, bytes: await bytesDo(wb) };
}

// ---------------------------------------------------------------------------
// Pacote do contador
// ---------------------------------------------------------------------------

const limitesDoMes = (mes: string) => ({ gte: toDateOnly(`${mes}-01`), lte: toDateOnly(diaDoMes(mes, 31)) });

/** Os códigos das contrapartidas de sistema (taxas, juros, descontos). */
async function codigosDoSistema() {
  const cats = await prisma.categoriaFinanceira.findMany({
    where: { chave: { in: [CHAVE_CATEGORIA.taxasDeCartao, CHAVE_CATEGORIA.jurosEMultas, CHAVE_CATEGORIA.descontos] } },
    select: { chave: true, codigoContabil: true },
  });
  const de = (chave: string) => cats.find((c) => c.chave === chave)?.codigoContabil ?? null;
  return { taxas: de(CHAVE_CATEGORIA.taxasDeCartao), juros: de(CHAVE_CATEGORIA.jurosEMultas), descontos: de(CHAVE_CATEGORIA.descontos) };
}

/** As baixas e transferências do mês (regime de caixa), como as partidas e a aba Caixa leem. */
async function movimentosDoMes(mes: string) {
  const [baixas, transferencias] = await Promise.all([
    prisma.lancamento.findMany({
      where: { status: "PAGO", pagoEm: limitesDoMes(mes) },
      orderBy: [{ pagoEm: "asc" }, { id: "asc" }],
      include: { categoria: { include: { subgrupo: true } }, conta: true, fornecedor: true, centroCusto: true, _count: { select: { anexos: true } } },
    }),
    prisma.transferencia.findMany({
      where: { data: limitesDoMes(mes) },
      orderBy: [{ data: "asc" }, { id: "asc" }],
      include: { origem: true, destino: true },
    }),
  ]);
  return { baixas, transferencias };
}

/** As partidas do mês, prontas para o CSV. */
export async function partidasDoMesNoBanco(mes: string) {
  const [{ baixas, transferencias }, codigos] = await Promise.all([movimentosDoMes(mes), codigosDoSistema()]);
  return partidasDoMes(
    baixas.map((b) => ({
      data: dateOnlyToString(b.pagoEm!),
      tipo: b.tipo,
      valor: b.valor.toNumber(),
      taxa: b.taxa.toNumber(),
      jurosMulta: b.jurosMulta.toNumber(),
      desconto: b.desconto.toNumber(),
      codigoCategoria: b.categoria.codigoContabil,
      codigoConta: b.conta?.codigoContabil ?? null,
      historico: [b.descricao, b.fornecedor ? (b.fornecedor.apelido ?? b.fornecedor.name) : null].filter(Boolean).join(" · "),
      documento: b.documento,
    })),
    transferencias.map((t) => ({
      data: dateOnlyToString(t.data),
      valor: t.valor.toNumber(),
      codigoOrigem: t.origem.codigoContabil,
      codigoDestino: t.destino.codigoContabil,
      historico: `Transferência ${t.origem.nome} para ${t.destino.nome}${t.observacao ? `: ${t.observacao}` : ""}`,
    })),
    codigos,
  );
}

/**
 * A planilha do mês para o contador: o mesmo mês visto pela competência (o
 * que pertence a ele) e pelo caixa (o que mexeu no banco), as transferências
 * e o resumo por categoria e centro.
 */
export async function planilhaDoMes(mes: string): Promise<{ nome: string; bytes: Uint8Array }> {
  const [competencia, { baixas, transferencias }] = await Promise.all([
    prisma.lancamento.findMany({
      where: { competencia: competenciaDo(mes), status: { not: "CANCELADO" } },
      orderBy: [{ tipo: "asc" }, { vencimento: "asc" }, { id: "asc" }],
      include: { categoria: { include: { subgrupo: true } }, conta: true, fornecedor: true, centroCusto: true, _count: { select: { anexos: true } } },
    }),
    movimentosDoMes(mes),
  ]);
  const wb = await novoLivro();

  const colunasDoLancamento = [
    { header: "Id", key: "id", width: 8 },
    { header: "Tipo", key: "tipo", width: 11 },
    { header: "Descrição", key: "descricao", width: 38 },
    { header: "Grupo da DRE", key: "grupo", width: 22 },
    { header: "Subgrupo", key: "subgrupo", width: 20 },
    { header: "Categoria", key: "categoria", width: 26 },
    { header: "Código contábil", key: "codigo", width: 15 },
    { header: "Centro de custo", key: "centro", width: 16 },
    { header: "Fornecedor", key: "fornecedor", width: 22 },
    { header: "Vencimento", key: "vencimento", width: 12 },
    { header: "Valor", key: "valor", width: 14 },
    { header: "Taxa", key: "taxa", width: 12 },
    { header: "Baixa em", key: "pagoEm", width: 12 },
    { header: "Juros/multa", key: "juros", width: 12 },
    { header: "Desconto", key: "desconto", width: 12 },
    { header: "Valor da baixa", key: "valorPago", width: 14 },
    { header: "Conta", key: "conta", width: 18 },
    { header: "Código da conta", key: "codigoConta", width: 15 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Anexos", key: "anexos", width: 8 },
  ];
  type Linha = (typeof competencia)[number];
  const linhaDo = (l: Linha) => ({
    id: l.id,
    tipo: TIPO_LANCAMENTO[l.tipo],
    descricao: l.descricao,
    grupo: GRUPO_DRE[l.categoria.grupo],
    subgrupo: l.categoria.subgrupo.nome,
    categoria: l.categoria.nome,
    codigo: l.categoria.codigoContabil ?? "",
    centro: l.centroCusto?.nome ?? "",
    fornecedor: l.fornecedor ? (l.fornecedor.apelido ?? l.fornecedor.name) : "",
    vencimento: l.vencimento,
    valor: l.valor.toNumber(),
    taxa: l.taxa.toNumber(),
    pagoEm: l.pagoEm,
    juros: l.jurosMulta.toNumber(),
    desconto: l.desconto.toNumber(),
    valorPago: l.valorPago?.toNumber() ?? null,
    conta: l.conta?.nome ?? "",
    codigoConta: l.conta?.codigoContabil ?? "",
    documento: l.documento ?? "",
    anexos: l._count.anexos,
  });
  const abaDeLancamentos = (nome: string, linhas: Linha[]) => {
    const aba = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
    aba.columns = colunasDoLancamento;
    cabecalho(aba);
    for (const l of linhas) aba.addRow(linhaDo(l));
    for (const k of ["vencimento", "pagoEm"]) aba.getColumn(k).numFmt = "dd/mm/yyyy";
    for (const k of ["valor", "taxa", "juros", "desconto", "valorPago"]) aba.getColumn(k).numFmt = MOEDA;
    aba.autoFilter = { from: "A1", to: "R1" };
  };
  abaDeLancamentos("Competência", competencia);
  abaDeLancamentos("Caixa", baixas);

  const trans = wb.addWorksheet("Transferências", { views: [{ state: "frozen", ySplit: 1 }] });
  trans.columns = [
    { header: "Data", key: "data", width: 12 },
    { header: "De", key: "de", width: 20 },
    { header: "Código", key: "codigoDe", width: 14 },
    { header: "Para", key: "para", width: 20 },
    { header: "Código", key: "codigoPara", width: 14 },
    { header: "Valor", key: "valor", width: 14 },
    { header: "Observação", key: "obs", width: 30 },
  ];
  cabecalho(trans);
  for (const t of transferencias)
    trans.addRow({
      data: t.data,
      de: t.origem.nome,
      codigoDe: t.origem.codigoContabil ?? "",
      para: t.destino.nome,
      codigoPara: t.destino.codigoContabil ?? "",
      valor: t.valor.toNumber(),
      obs: t.observacao ?? "",
    });
  trans.getColumn("data").numFmt = "dd/mm/yyyy";
  trans.getColumn("valor").numFmt = MOEDA;

  // Resumo pela competência: categoria nas linhas, centro nas colunas.
  const centros = [...new Set(competencia.map((l) => l.centroCusto?.nome ?? "Sem centro"))].sort();
  const resumo = wb.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 1 }] });
  resumo.columns = [
    { header: "Grupo da DRE", width: 24 },
    { header: "Subgrupo", width: 22 },
    { header: "Categoria", width: 30 },
    { header: "Código contábil", width: 15 },
    { header: "Natureza", width: 10 },
    ...centros.map((c) => ({ header: c, width: 15 })),
    { header: "Total", width: 15 },
  ];
  cabecalho(resumo);
  // Na ordem do plano de contas: grupo da DRE, subgrupo, categoria.
  const ordemDoGrupo = Object.keys(GRUPO_DRE);
  const categorias = [...new Map(competencia.map((l) => [l.categoria.id, l.categoria])).values()].sort(
    (a, b) =>
      ordemDoGrupo.indexOf(a.grupo) - ordemDoGrupo.indexOf(b.grupo) ||
      a.subgrupo.ordem - b.subgrupo.ordem ||
      a.subgrupo.nome.localeCompare(b.subgrupo.nome) ||
      a.ordem - b.ordem ||
      a.nome.localeCompare(b.nome),
  );
  for (const c of categorias) {
    const daCategoria = competencia.filter((l) => l.categoria.id === c.id);
    const noCentro = (centro: string) =>
      daCategoria.filter((l) => (l.centroCusto?.nome ?? "Sem centro") === centro).reduce((s, l) => s + l.valor.toNumber(), 0);
    resumo.addRow([
      GRUPO_DRE[c.grupo],
      c.subgrupo.nome,
      c.nome,
      c.codigoContabil ?? "",
      c.tipo === "RECEBER" ? "receita" : "despesa",
      ...centros.map(noCentro),
      daCategoria.reduce((s, l) => s + l.valor.toNumber(), 0),
    ]);
  }
  for (let i = 6; i <= centros.length + 6; i++) resumo.getColumn(i).numFmt = MOEDA;

  escreverSobre(wb, [
    `Lançamentos de ${nomeDoMes(mes)}, para o escritório de contabilidade. Exportado do módulo Financeiro do Canto Verde.`,
    "",
    "OBJETIVO",
    "Entregar ao contador tudo o que aconteceu no mês, com o código contábil de cada categoria e conta, para ele escriturar sem redigitar.",
    "",
    "ABA COMPETÊNCIA",
    "Cada conta a pagar e a receber que pertence ao mês, paga ou não (as canceladas ficam de fora). É a visão da DRE.",
    "ABA CAIXA",
    "Cada pagamento e recebimento feito no mês, pela data em que o dinheiro mexeu, de qualquer competência. É a visão do extrato.",
    "Valor da baixa = valor - taxa da maquininha + juros - desconto: é o que entrou ou saiu da conta.",
    "ABA TRANSFERÊNCIAS",
    "Dinheiro que mudou de conta sem entrar nem sair da casa (gaveta depositada no banco, por exemplo).",
    "ABA RESUMO",
    "Total de cada categoria pela competência, separado por centro de custo (a área da casa).",
    "",
    "ARQUIVO DE PARTIDAS (CSV)",
    "O mesmo mês pelo caixa, em partidas dobradas: data, conta de débito, conta de crédito, valor, histórico e documento.",
    "Código em branco quer dizer que a categoria ou a conta está sem código contábil no sistema: preencha lá e exporte de novo.",
    "",
    "ANEXOS",
    "Notas, boletos e comprovantes vêm em arquivos separados, com a data, a descrição, o valor e o Id do lançamento no nome.",
    "",
    "COMO USAR",
    "Os números saem do sistema: para corrigir, corrija no Financeiro e exporte de novo. Editar aqui não muda nada lá.",
  ]);
  return { nome: `lancamentos-${mes}.xlsx`, bytes: await bytesDo(wb) };
}

/**
 * Os anexos do mês, sem os bytes: dos lançamentos que pertencem ao mês ou
 * que foram pagos nele. Divididos em lotes que cabem numa resposta.
 */
export async function lotesDeAnexos(mes: string) {
  const anexos = await prisma.anexoFinanceiro.findMany({
    where: {
      lancamento: {
        status: { not: "CANCELADO" },
        OR: [{ competencia: competenciaDo(mes) }, { pagoEm: limitesDoMes(mes) }],
      },
    },
    orderBy: [{ lancamentoId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nome: true,
      tamanho: true,
      lancamento: { select: { id: true, descricao: true, valor: true, vencimento: true, pagoEm: true } },
    },
  });
  const comNome = anexos.map((a) => {
    const l = a.lancamento;
    const data = dateOnlyToString(l.pagoEm ?? l.vencimento);
    const ext = a.nome.includes(".") ? a.nome.slice(a.nome.lastIndexOf(".")).toLowerCase() : "";
    const valor = l.valor.toNumber().toFixed(2).replace(".", ",");
    return { id: a.id, tamanho: a.tamanho, arquivo: `anexos/${data}_${paraArquivo(l.descricao)}_${valor}_${l.id}-${a.id}${ext}` };
  });
  return emLotes(comNome, TETO_DA_PARTE);
}
