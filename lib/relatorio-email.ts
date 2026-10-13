import { UNIT_LABEL, formatAmount, formatMoney, plural } from "@/lib/format";
import type { DadosDoRelatorio } from "@/lib/relatorio-agendado";

/**
 * O e-mail do relatório de compras: o resumo, legível no celular, e o botão
 * para o painel. O detalhe completo vai no PDF anexo.
 *
 * HTML de e-mail é HTML de 2005: tabela para o desenho e estilo escrito em
 * cada tag. Gmail e Outlook ignoram `<style>` e quase todo CSS moderno.
 */

const COR = { faixa: "#00461E", verde: "#186618", texto: "#1d1d1b", apagado: "#5c625f", linha: "#dfe3e1", fundo: "#f3f5f4", vermelho: "#b42318", ocre: "#9a5b13" };

const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
const comSinal = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${pct(Math.abs(n))}`;

function esc(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function assuntoDoRelatorio(d: Pick<DadosDoRelatorio, "de" | "ate">) {
  return `Relatório de compras · ${diaMes(d.de)} a ${diaMes(d.ate)}`;
}

/** Texto puro, para quem lê e-mail sem HTML (e para o filtro de spam gostar mais). */
export function relatorioEmTexto(d: DadosDoRelatorio, link: string | null): string {
  const k = d.painel.kpis;
  return [
    assuntoDoRelatorio(d),
    "",
    `Gasto recebido: ${formatMoney(k.gasto)}`,
    `Uso do orçamento: ${k.orcamento.uso === null ? "—" : pct(k.orcamento.uso)}`,
    `Entregas no prazo: ${k.prazo.pct === null ? "—" : pct(k.prazo.pct)}`,
    `Economia negociada: ${formatMoney(d.economia.valor)}`,
    d.bonificacao.valor > 0 ? `Bonificações recebidas: ${formatMoney(d.bonificacao.valor)}` : null,
    "",
    ...d.painel.insights.map((i) => `• ${i.titulo}${i.impacto !== null ? ` (${formatMoney(i.impacto)})` : ""}`),
    "",
    "O relatório completo está no PDF anexo.",
    link ? `Abrir no painel: ${link}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function relatorioEmHtml(d: DadosDoRelatorio, link: string | null): string {
  const k = d.painel.kpis;
  const variacaoGasto = k.gastoAntes > 0 ? ((k.gasto - k.gastoAntes) / k.gastoAntes) * 100 : null;

  const cartao = (rotulo: string, valor: string, detalhe: string, alerta = false) => `
    <td width="50%" style="padding:4px;">
      <div style="background:${COR.fundo};border-radius:8px;padding:12px 14px;">
        <div style="font-size:12px;color:${COR.apagado};">${esc(rotulo)}</div>
        <div style="font-size:22px;font-weight:bold;color:${alerta ? COR.vermelho : COR.verde};margin-top:2px;">${esc(valor)}</div>
        <div style="font-size:11px;color:${COR.apagado};margin-top:2px;">${esc(detalhe)}</div>
      </div>
    </td>`;

  const titulo = (t: string) =>
    `<div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:${COR.apagado};text-transform:uppercase;margin:24px 0 8px;">${esc(t)}</div>`;

  const linhaDeTabela = (celulas: { t: string; direita?: boolean; cor?: string; negrito?: boolean }[]) =>
    `<tr>${celulas
      .map(
        (c) =>
          `<td style="padding:7px 6px;border-bottom:1px solid ${COR.linha};font-size:13px;${c.direita ? "text-align:right;white-space:nowrap;" : ""}${c.cor ? `color:${c.cor};` : ""}${c.negrito ? "font-weight:bold;" : ""}">${esc(c.t)}</td>`,
      )
      .join("")}</tr>`;

  const insights =
    d.painel.insights.length === 0
      ? `<p style="font-size:13px;color:${COR.apagado};margin:0;">${k.gasto === 0 ? "Sem compra recebida no período." : "Nada pedindo ação."}</p>`
      : d.painel.insights
          .map(
            (i) => `
      <div style="border-left:3px solid ${i.tom === "perda" ? COR.vermelho : COR.ocre};padding:4px 0 4px 10px;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:bold;color:${COR.texto};">${esc(i.titulo)}</div>
        ${i.texto ? `<div style="font-size:12px;color:${COR.apagado};">${esc(i.texto)}</div>` : ""}
        <div style="font-size:12px;font-weight:bold;color:${i.tom === "perda" ? COR.vermelho : COR.ocre};">${i.impacto !== null ? esc(formatMoney(i.impacto)) : "risco"}</div>
      </div>`,
          )
          .join("");

  const altas =
    d.altas.length === 0
      ? `<p style="font-size:13px;color:${COR.apagado};margin:0;">Nenhum produto ficou mais caro.</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${d.altas
          .map((v) =>
            linhaDeTabela([
              { t: v.nome, negrito: true },
              { t: `${formatMoney(v.antes)} → ${formatMoney(v.agora)}/${UNIT_LABEL[v.unidade]}`, direita: true },
              { t: comSinal(v.variacao), direita: true, cor: COR.vermelho, negrito: true },
            ]),
          )
          .join("")}</table>`;

  const produtos =
    d.painel.abc.length === 0
      ? `<p style="font-size:13px;color:${COR.apagado};margin:0;">Nenhuma compra recebida no período.</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${d.painel.abc
          .slice(0, 5)
          .map((p) =>
            linhaDeTabela([
              { t: p.nome, negrito: true },
              { t: `${formatAmount(p.quantidade)} ${UNIT_LABEL[p.unidade]}`, direita: true },
              { t: formatMoney(p.valor), direita: true },
            ]),
          )
          .join("")}</table>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#e7eae9;font-family:Helvetica,Arial,sans-serif;color:${COR.texto};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e7eae9;"><tr><td align="center" style="padding:16px 8px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:${COR.faixa};padding:22px 22px 18px;">
    <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#00d700;">CANTO VERDE</div>
    <div style="font-size:22px;font-weight:bold;color:#ffffff;margin-top:6px;">Relatório de compras</div>
    <div style="font-size:13px;color:#cfe8d2;margin-top:4px;">${diaMes(d.de)} a ${diaMes(d.ate)} · comparado com ${diaMes(d.antes.de)} a ${diaMes(d.antes.ate)}</div>
  </td></tr>
  <tr><td style="padding:12px 18px 22px;">
    ${titulo("Números")}
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${cartao("Gasto recebido", formatMoney(k.gasto), variacaoGasto === null ? "sem compra antes" : `${comSinal(variacaoGasto)} vs anterior`)}
      ${cartao("Uso do orçamento", k.orcamento.uso === null ? "—" : pct(k.orcamento.uso), k.orcamento.semanas === 0 ? "sem orçamento" : "pedido contra o orçamento", k.orcamento.uso !== null && k.orcamento.uso > 100)}
    </tr><tr>
      ${cartao("Entregas no prazo", k.prazo.pct === null ? "—" : pct(k.prazo.pct), k.prazo.semChegar > 0 ? plural(k.prazo.semChegar, "atrasado sem chegar", "atrasados sem chegar") : "das entregas com previsão", k.prazo.pct !== null && k.prazo.pct < 70)}
      ${cartao("Economia negociada", formatMoney(d.economia.valor), d.economia.itens > 0 ? `em ${plural(d.economia.itens, "item", "itens")}` : "sem negociação")}
    </tr>${
      // Só com bonificação no período: um cartão zerado só ocuparia espaço.
      d.bonificacao.valor > 0
        ? `<tr>
      ${cartao("Bonificações recebidas", formatMoney(d.bonificacao.valor), plural(d.bonificacao.itens, "bonificação", "bonificações"))}
      <td></td>
    </tr>`
        : ""
    }</table>
    ${titulo("O que pede decisão")}
    ${insights}
    ${titulo("Maiores altas de preço")}
    ${altas}
    ${titulo("Mais comprados")}
    ${produtos}
    <p style="font-size:13px;color:${COR.apagado};margin:22px 0 0;">O relatório completo, com fornecedores, categorias e orçamento semana a semana, está no PDF anexo.</p>
    ${
      link
        ? `<table cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr><td style="background:#00d700;border-radius:10px;">
      <a href="${esc(link)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:bold;color:#00461e;text-decoration:none;">Abrir no painel</a>
    </td></tr></table>`
        : ""
    }
  </td></tr>
</table>
<p style="font-size:11px;color:${COR.apagado};margin:14px 0 0;">Você recebe este e-mail porque ele está ligado em Compras → Configurações.</p>
</td></tr></table>
</body></html>`;
}
