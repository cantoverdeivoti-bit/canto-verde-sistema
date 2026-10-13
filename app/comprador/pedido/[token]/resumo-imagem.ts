import { UNIT_LABEL, formatAmount, formatMoney } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

export type LinhaDoResumo = {
  nome: string;
  unidade: ProductUnit;
  quantidade: number;
  preco: number;
  marca: string;
  obs: string;
};

export type Resumo = {
  casa: string;
  fornecedor: string;
  /** "25/09/2026 às 23:40" — quando ele confirmou. */
  quando: string;
  linhas: LinhaDoResumo[];
  /** O que ele marcou "Em falta": vai no fim, para quem separa não procurar. */
  faltas?: string[];
};

/*
 * As cores do tema, fixas: o canvas não lê variável de CSS, e a imagem sai
 * clara mesmo que o celular esteja no modo escuro — ela vai parar num
 * WhatsApp ou numa impressora.
 */
const COR = {
  fundo: "#ffffff",
  texto: "#1b1f1d",
  apagado: "#5c625f",
  linha: "#dfe3e1",
  // O verde do painel (paleta da Stone, ver app/globals.css).
  destaque: "#186618",
};

const LARGURA = 720;
const MARGEM = 36;

/** Corta com reticências o que não cabe na largura. */
function caber(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * O resumo do pedido confirmado, desenhado num canvas: a casa, o fornecedor,
 * cada item com quantidade × preço, e o total. É o comprovante que ele guarda
 * ou manda para quem separa a mercadoria.
 */
export function desenharResumo(r: Resumo): HTMLCanvasElement {
  const fonte = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const alturaLinha = 54;
  const faltas = r.faltas ?? [];
  const altura = 190 + r.linhas.length * alturaLinha + 80 + (faltas.length > 0 ? 40 + faltas.length * 24 : 0);
  const escala = 2;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA * escala;
  canvas.height = altura * escala;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(escala, escala);

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);
  ctx.fillStyle = COR.destaque;
  ctx.fillRect(0, 0, LARGURA, 8);

  let y = 52;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.apagado;
  ctx.font = `600 13px ${fonte}`;
  ctx.fillText(r.casa.toUpperCase(), MARGEM, y);

  y += 36;
  ctx.fillStyle = COR.texto;
  ctx.font = `700 26px ${fonte}`;
  ctx.fillText(caber(ctx, `Pedido de ${r.fornecedor}`, LARGURA - MARGEM * 2), MARGEM, y);

  y += 26;
  ctx.fillStyle = COR.apagado;
  ctx.font = `400 15px ${fonte}`;
  ctx.fillText(`Preço confirmado em ${r.quando}`, MARGEM, y);

  // Cabeçalho da tabela.
  y += 40;
  const colTotal = LARGURA - MARGEM;
  const colPreco = colTotal - 130;
  const colQtd = colPreco - 130;
  ctx.font = `600 12px ${fonte}`;
  ctx.fillText("ITEM", MARGEM, y);
  ctx.textAlign = "right";
  ctx.fillText("QTD.", colQtd, y);
  ctx.fillText("PREÇO", colPreco, y);
  ctx.fillText("SUBTOTAL", colTotal, y);
  ctx.textAlign = "left";
  y += 12;
  ctx.fillStyle = COR.linha;
  ctx.fillRect(MARGEM, y, LARGURA - MARGEM * 2, 1);

  let total = 0;
  for (const l of r.linhas) {
    const subtotal = l.quantidade * l.preco;
    total += subtotal;
    const unidade = UNIT_LABEL[l.unidade];
    const detalhe = [l.marca, l.obs].filter(Boolean).join(" · ");

    const topo = y + (detalhe ? 24 : 32);
    ctx.fillStyle = COR.texto;
    ctx.font = `600 16px ${fonte}`;
    ctx.fillText(caber(ctx, l.nome, colQtd - MARGEM - 90), MARGEM, topo);
    if (detalhe) {
      ctx.fillStyle = COR.apagado;
      ctx.font = `400 13px ${fonte}`;
      ctx.fillText(caber(ctx, detalhe, colQtd - MARGEM - 90), MARGEM, topo + 19);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = COR.texto;
    ctx.font = `400 16px ${fonte}`;
    ctx.fillText(`${formatAmount(l.quantidade)} ${unidade}`, colQtd, y + 32);
    ctx.fillText(`${formatMoney(l.preco)}/${unidade}`, colPreco, y + 32);
    ctx.font = `600 16px ${fonte}`;
    ctx.fillText(formatMoney(subtotal), colTotal, y + 32);
    ctx.textAlign = "left";

    y += alturaLinha;
    ctx.fillStyle = COR.linha;
    ctx.fillRect(MARGEM, y, LARGURA - MARGEM * 2, 1);
  }

  y += 44;
  ctx.fillStyle = COR.texto;
  ctx.font = `600 16px ${fonte}`;
  ctx.fillText(`${r.linhas.length} ${r.linhas.length === 1 ? "item" : "itens"}`, MARGEM, y);
  ctx.textAlign = "right";
  ctx.fillStyle = COR.destaque;
  ctx.font = `700 24px ${fonte}`;
  ctx.fillText(`Total ${formatMoney(total)}`, colTotal, y);
  ctx.textAlign = "left";

  if (faltas.length > 0) {
    y += 44;
    ctx.fillStyle = COR.destaque;
    ctx.font = `600 14px ${fonte}`;
    ctx.fillText("EM FALTA", MARGEM, y);
    ctx.fillStyle = COR.texto;
    ctx.font = `400 15px ${fonte}`;
    for (const nome of faltas) {
      y += 24;
      ctx.fillText(caber(ctx, `✕ ${nome}`, LARGURA - MARGEM * 2), MARGEM, y);
    }
  }

  return canvas;
}

/**
 * O mesmo resumo em texto, para copiar e colar no WhatsApp. Os asteriscos são
 * o negrito de lá. `segundaLinha` troca o "Preço confirmado em…" — o resumo
 * de antes de confirmar ainda não tem hora; vazia, a linha some.
 */
export function textoDoResumo(r: Resumo, segundaLinha = `Preço confirmado em ${r.quando}`): string {
  let total = 0;
  const linhas = r.linhas.map((l) => {
    const subtotal = l.quantidade * l.preco;
    total += subtotal;
    const unidade = UNIT_LABEL[l.unidade];
    const detalhe = [l.marca, l.obs].filter(Boolean).join(" · ");
    return (
      `• ${l.nome}: ${formatAmount(l.quantidade)} ${unidade} × ${formatMoney(l.preco)} = ${formatMoney(subtotal)}` +
      (detalhe ? ` (${detalhe})` : "")
    );
  });
  return [
    `*${r.casa}* · Pedido de ${r.fornecedor}`,
    ...(segundaLinha ? [segundaLinha] : []),
    "",
    ...linhas,
    "",
    `*Total: ${formatMoney(total)}*`,
    ...(r.faltas && r.faltas.length > 0 ? ["", "*Em falta:*", ...r.faltas.map((n) => `✕ ${n}`)] : []),
  ].join("\n");
}

/** Desenha e baixa como PNG. */
export function baixarResumo(r: Resumo) {
  const canvas = desenharResumo(r);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedido-${r.fornecedor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
