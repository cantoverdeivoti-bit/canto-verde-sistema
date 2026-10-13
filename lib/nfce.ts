/**
 * A nota fiscal do mercado (NFC-e, o cupom eletrônico), lida pelo QR Code.
 *
 * O QR do cupom é um link para a consulta pública da Receita do estado, e a
 * página dela lista cada item: descrição, código, quantidade, unidade e
 * valor. Daqui sai a nota já organizada; quem diz qual produto da casa é cada
 * item é a tela, com os vínculos que ela lembra (`VinculoNota`).
 *
 * A página segue o layout do portal nacional da NFC-e (o mesmo da SVRS, que
 * atende o RS): cada item numa linha `<tr id="Item + N">`, com os campos
 * marcados por classe (`txtTit`, `RCod`, `Rqtd`, `RUN`, `RvlUnit`, `valor`).
 * A leitura é pelos rótulos do texto ("Qtde.:", "UN:", "Vl. Unit.:"), e não
 * pela posição, para aguentar pequenas mudanças de HTML.
 */

import { lerNumeroBR } from "@/lib/format";

export type ItemDaNota = {
  /** A ordem na nota, a partir de 1. */
  linha: number;
  /** O código do item no mercado (muitas vezes o código de barras). Nulo quando não veio. */
  codigo: string | null;
  descricao: string;
  quantidade: number;
  /** "UN", "KG", "PCT": como o mercado vendeu. */
  unidade: string;
  valorUnitario: number;
  /** O que o item custou na nota, já com desconto de item quando houver. */
  valorTotal: number;
};

export type NotaDoMercado = {
  /** A chave de acesso, 44 dígitos. */
  chave: string;
  emitente: { nome: string; cnpj: string };
  /** "06/10/2026 14:20" como veio, quando veio. */
  emissao: string | null;
  itens: ItemDaNota[];
  /** O total pago, quando a página diz. */
  total: number | null;
};

/**
 * O link do QR Code, conferido. Só endereço do governo (`.gov.br`) com https:
 * o servidor vai buscar esta página, e aceitar qualquer endereço faria dele
 * um mensageiro para onde quem lê o QR quisesse.
 */
export function linkDaNota(texto: string): { link: string; chave: string } | null {
  const t = texto.trim();
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Só em desenvolvimento: uma página de nota servida na própria máquina,
  // para testar o fluxo sem o site da Receita. Em produção, só `.gov.br`.
  const deTeste = process.env.NODE_ENV === "development" && url.hostname === "localhost";
  if (!url.hostname.endsWith(".gov.br") && !deTeste) return null;
  // A chave são os primeiros 44 dígitos do parâmetro `p` (ou `chNFe`).
  const p = url.searchParams.get("p") ?? url.searchParams.get("chNFe") ?? url.search;
  const chave = p.replace(/\D/g, " ").trim().split(/\s+/).find((d) => d.length === 44) ?? null;
  if (!chave) return null;
  if (!deTeste) url.protocol = "https:";
  return { link: url.toString(), chave };
}

/** O texto sem tags, com as entidades comuns resolvidas e os espaços juntos. */
function texto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** O conteúdo do primeiro elemento com esta classe, em texto. */
function porClasse(html: string, classe: string): string | null {
  const m = html.match(new RegExp(`class="[^"]*\\b${classe}\\b[^"]*"[^>]*>([\\s\\S]*?)</(?:span|div|label|td)>`, "i"));
  return m ? texto(m[1]) : null;
}

/** Um número escrito à brasileira ("1.234,56") depois de um rótulo. */
function numeroDepois(t: string, rotulo: RegExp): number | null {
  const m = t.match(new RegExp(`${rotulo.source}\\s*([\\d.,]+)`, "i"));
  return m ? lerNumeroBR(m[1]) : null;
}

/** Se a página da Receita só embrulha outra (o RS usa um iframe), o endereço de dentro. */
export function quadroDaNota(html: string): string | null {
  const m = html.match(/<iframe[^>]+src="([^"]+)"/i);
  if (!m) return null;
  const src = m[1].replace(/&amp;/g, "&");
  try {
    const url = new URL(src);
    return url.hostname.endsWith(".gov.br") ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A página da consulta, organizada. Nulo quando não é uma página de nota. */
export function lerPaginaDaNota(html: string, chave: string): NotaDoMercado | null {
  const linhas = [...html.matchAll(/<tr[^>]*id="Item\s*\+\s*(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const itens: ItemDaNota[] = [];
  for (const [, n, corpo] of linhas) {
    const descricao = porClasse(corpo, "txtTit");
    const t = texto(corpo);
    const quantidade = numeroDepois(t, /Qtde\.?:/);
    const unidade = t.match(/UN:\s*([A-Za-zÀ-ú0-9]+)/i)?.[1] ?? "UN";
    const valorUnitario = numeroDepois(t, /Vl\.?\s*Unit\.?:/);
    const valorTotal = lerNumeroBR(porClasse(corpo, "valor") ?? "") ?? (quantidade !== null && valorUnitario !== null ? quantidade * valorUnitario : null);
    const codigo = t.match(/C[óo]digo:\s*([^)\s]+)/i)?.[1] ?? null;
    if (!descricao || quantidade === null || quantidade <= 0 || valorTotal === null) continue;
    itens.push({
      linha: Number(n),
      codigo: codigo && codigo !== "0" ? codigo : null,
      descricao,
      quantidade,
      unidade: unidade.toUpperCase(),
      valorUnitario: valorUnitario ?? valorTotal / quantidade,
      valorTotal: Math.round(valorTotal * 100) / 100,
    });
  }
  if (itens.length === 0) return null;

  const tudo = texto(html);
  const cnpj = tudo.match(/CNPJ:?\s*([\d./-]{14,18})/i)?.[1].replace(/\D/g, "") ?? "";
  const nome = porClasse(html, "txtTopo") ?? "";
  const emissao = tudo.match(/Emiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/i)?.[1] ?? null;
  const total =
    lerNumeroBR(porClasse(html, "totalNumb txtMax") ?? "") ??
    numeroDepois(tudo, /Valor a pagar R\$:?/);

  return { chave, emitente: { nome, cnpj }, emissao, itens, total };
}

/**
 * Busca e lê a nota do link do QR. Segue o quadro de dentro uma vez (a
 * página do RS embrulha a do portal). Sem resposta em 12 segundos, desiste:
 * o site da Receita às vezes cai, e a tela diz para tentar de novo.
 */
export async function buscarNota(link: string, chave: string): Promise<NotaDoMercado | null> {
  const pedir = async (url: string) => {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };
  let html = await pedir(link);
  let nota = lerPaginaDaNota(html, chave);
  if (nota) return nota;
  const quadro = quadroDaNota(html);
  if (!quadro) return null;
  html = await pedir(quadro);
  nota = lerPaginaDaNota(html, chave);
  return nota;
}
