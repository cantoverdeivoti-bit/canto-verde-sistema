/**
 * As regras dos anexos do Financeiro, sem servidor: valem no navegador (para
 * recusar antes de subir) e na rota que grava.
 */

/** O teto de um anexo: o corpo de uma requisição na Vercel vai até 4,5 MB. */
export const TETO_DO_ANEXO = 4_000_000;

/** Foto maior que isto é reduzida no navegador antes de subir. */
export const LADO_MAXIMO_DA_FOTO = 1600;

export const TIPOS_ACEITOS = "application/pdf,image/jpeg,image/png,image/webp,text/xml,application/xml,.xml";

/** O que uma tarefa aceita: foto e PDF. XML é coisa de nota fiscal, do Financeiro. */
export const TIPOS_DA_TAREFA = "application/pdf,image/jpeg,image/png,image/webp";

export type TipoDoAnexo = { mime: string; extensao: string };

/**
 * O tipo do arquivo pelos primeiros bytes, e não pelo nome nem pelo que o
 * navegador disse: um .pdf que é uma página HTML não entra. Aceita PDF, JPEG,
 * PNG, WEBP e XML (a NF-e). Nulo = recusado.
 */
export function detectarTipo(bytes: Uint8Array): TipoDoAnexo | null {
  const comeca = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (comeca(0x25, 0x50, 0x44, 0x46)) return { mime: "application/pdf", extensao: ".pdf" };
  if (comeca(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", extensao: ".jpg" };
  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", extensao: ".png" };
  if (comeca(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return { mime: "image/webp", extensao: ".webp" };
  // XML: começa com "<?xml" ou "<", depois de um BOM ou espaços.
  const inicio = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 64)).replace(/^﻿/, "").trimStart();
  if (inicio.startsWith("<?xml") || /^<[A-Za-z]/.test(inicio)) {
    // HTML disfarçado de XML abriria como página: recusado.
    if (/^<(!doctype\s+html|html)/i.test(inicio)) return null;
    return { mime: "application/xml", extensao: ".xml" };
  }
  return null;
}

/** "nota fiscal 123.PDF" com o tipo detectado vira "nota fiscal 123.pdf". */
export function nomeDoAnexo(original: string, tipo: TipoDoAnexo): string {
  const base = original.replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "anexo";
  return base + tipo.extensao;
}
