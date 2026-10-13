import { dateOnlyToString, getSettings, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { ETAPA_CARDAPIO, FORMATO_EVENTO, TIPO_EVENTO, noPlural, opcoes } from "@/lib/eventos";
import { resumoDoEvento, valorDoSinal } from "@/lib/eventos-calculo";
import { configuracaoEventos } from "@/lib/eventos-dados";
import { FUSO_DA_CASA, formatAmount, formatDateString, formatMoney, formatPhone } from "@/lib/format";

import { Folha, paraHelvetica } from "./folha";

const ddmmaaaa = (d: string) => d.split("-").reverse().join("/");

/**
 * A proposta que vai para o cliente em PDF, como `/imprimir/proposta/[id]`.
 * Mostra só preço: custo, margem, linha de custo interno e anotação da
 * casa nunca aparecem aqui. Nulo quando o evento não existe.
 */
export async function propostaEmPdf(id: number): Promise<Buffer | null> {
  const e = await prisma.evento.findUnique({
    where: { id },
    include: {
      cliente: { select: { nome: true } },
      linhas: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
      cardapio: {
        select: {
          nome: true,
          descricao: true,
          itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { etapa: true, ficha: { select: { nome: true } } } },
        },
      },
    },
  });
  if (!e) return null;
  const [{ rules, capacity }, config] = await Promise.all([getSettings(), configuracaoEventos()]);

  const linhas = e.linhas.map((l) => ({
    descricao: l.descricao,
    categoria: l.categoria,
    unidade: l.unidade,
    quantidade: l.quantidade.toNumber(),
    custoUnitario: 0,
    precoUnitario: l.precoUnitario.toNumber(),
  }));
  const resumo = resumoDoEvento(linhas, { convidados: e.convidados, taxaServicoPct: e.taxaServicoPct.toNumber(), impostoPct: 0 });
  const cobradas = linhas.filter((l) => l.precoUnitario > 0 && l.categoria !== "CUSTO_INTERNO");
  const taxa = e.taxaServicoPct.toNumber();
  const sinal = valorDoSinal(resumo.totalCliente, config.sinalPct);

  const folha = new Folha({ titulo: `Proposta de evento ${e.id}`, margem: 42 });
  const doc = folha.doc;
  folha.nome = `Proposta de evento nº ${e.id}`;

  // O alto: a casa à esquerda, o número e as datas da proposta à direita.
  const topo = folha.y;
  const metade = folha.largura / 2;
  const direita = [`Proposta de evento nº ${e.id}`, `Emitida em ${ddmmaaaa(todayInTimezone(FUSO_DA_CASA))}`, ...(e.validoAte ? [`Válida até ${ddmmaaaa(dateOnlyToString(e.validoAte))}`] : [])];
  doc.font("Helvetica-Bold").fontSize(10).text(paraHelvetica(direita[0]), folha.x + metade, topo, { width: metade, align: "right" });
  doc.font("Helvetica").fontSize(10).text(paraHelvetica(direita.slice(1).join("\n")), folha.x + metade, doc.y + 1, { width: metade, align: "right" });
  const fimDaDireita = doc.y;
  folha.texto(capacity.name, { tamanho: 16, negrito: true, largura: metade });
  if (rules.endereco) folha.texto(rules.endereco, { tamanho: 10, largura: metade });
  if (rules.whatsapp) folha.texto(`WhatsApp ${formatPhone(rules.whatsapp.startsWith("+") ? rules.whatsapp : `+${rules.whatsapp}`)}`, { tamanho: 10, largura: metade });
  folha.y = Math.max(folha.y, fimDaDireita) + 8;
  folha.linha();
  folha.y += 10;

  // Os dados do evento em duas colunas: rótulo em negrito, valor ao lado.
  const dados: [string, string][] = [
    ["Cliente", e.cliente.nome],
    ["Evento", e.titulo],
    ["Data", formatDateString(dateOnlyToString(e.data))],
    ["Horário", e.horaInicio ? `${e.horaInicio}${e.horaFim ? ` às ${e.horaFim}` : ""}` : "a combinar"],
    ["Convidados", String(e.convidados)],
    ["Formato", `${TIPO_EVENTO[e.tipo]}, ${FORMATO_EVENTO[e.formato].toLowerCase()}`],
  ];
  for (let i = 0; i < dados.length; i += 2) {
    const linha = folha.y;
    let fim = linha;
    dados.slice(i, i + 2).forEach(([rotulo, valor], j) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor("#000000")
        .text(`${rotulo}: `, folha.x + j * (metade + 10), linha, { width: metade - 10, continued: true })
        .font("Helvetica")
        .text(paraHelvetica(valor));
      fim = Math.max(fim, doc.y);
    });
    folha.y = fim + 3;
  }

  const secao = (titulo: string) => {
    folha.cabe(50);
    folha.y += 12;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(paraHelvetica(titulo).toUpperCase(), folha.x, folha.y, { width: folha.largura });
    folha.y = doc.y + 3;
    folha.linha({ cor: "#a3a3a3" });
    folha.y += 6;
  };

  if (e.cardapio) {
    secao(`Cardápio: ${e.cardapio.nome}`);
    if (e.cardapio.descricao) folha.texto(e.cardapio.descricao, { tamanho: 10.5 });
    for (const c of opcoes(ETAPA_CARDAPIO)) {
      const daEtapa = e.cardapio.itens.filter((p) => p.etapa === c.valor);
      if (daEtapa.length === 0) continue;
      folha.cabe(16);
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor("#000000")
        .text(`${paraHelvetica(c.texto)}: `, folha.x, folha.y + 3, { width: folha.largura, continued: true })
        .font("Helvetica")
        .text(paraHelvetica(daEtapa.map((p) => p.ficha.nome).join(", ")));
      folha.y = doc.y;
    }
  }

  secao("Valores");
  folha.tabela(
    [
      { titulo: "Item", peso: 5 },
      { titulo: "Quantidade", peso: 2, direita: true },
      { titulo: "Valor unitário", peso: 2, direita: true },
      { titulo: "Total", peso: 2, direita: true },
    ],
    cobradas.map((l) => [l.descricao, `${formatAmount(l.quantidade)} ${noPlural(l.unidade, l.quantidade)}`, formatMoney(l.precoUnitario), formatMoney(l.quantidade * l.precoUnitario)]),
    { tamanho: 9.5 },
  );
  const total = (rotulo: string, valor: string, forte = false) => {
    folha.cabe(18);
    doc.font(forte ? "Helvetica-Bold" : "Helvetica").fontSize(forte ? 12.5 : 10);
    doc.fillColor("#000000").text(paraHelvetica(rotulo), folha.x, folha.y + 4, { width: folha.largura - 110, align: "right" });
    doc.text(valor, folha.x + folha.largura - 100, folha.y + 4, { width: 100, align: "right" });
    folha.y = doc.y + 1;
  };
  folha.y += 4;
  if (taxa > 0) {
    total("Subtotal", formatMoney(resumo.subtotal));
    total(`Taxa de serviço (${taxa.toLocaleString("pt-BR")}%)`, formatMoney(resumo.taxaServico));
  }
  total("Total", formatMoney(resumo.totalCliente), true);
  if (resumo.precoPorConvidado !== null) total("por convidado", formatMoney(resumo.precoPorConvidado));

  if (e.observacoesCliente) {
    secao("Observações");
    folha.texto(e.observacoesCliente, { tamanho: 10.5 });
  }

  secao("Condições");
  if (config.sinalPct > 0) folha.texto(`Para reservar a data: sinal de ${config.sinalPct.toLocaleString("pt-BR")}% (${formatMoney(sinal)}).`, { tamanho: 10.5 });
  if (config.condicoes) folha.texto(config.condicoes, { tamanho: 10.5, antes: 4 });

  return folha.terminar();
}
