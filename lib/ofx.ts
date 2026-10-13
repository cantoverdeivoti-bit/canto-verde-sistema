/**
 * Leitor de extrato OFX, sem dependência e sem servidor: roda no navegador,
 * que lê o arquivo e manda só as transações para a ação que grava.
 *
 * OFX vem em dois sabores. O antigo (SGML, o que a maioria dos bancos
 * brasileiros ainda exporta) não fecha as tags de valor:
 *
 *   <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-450.30<FITID>123</STMTTRN>
 *
 * O novo é XML e fecha tudo. Ler o valor como "o que vem depois da tag até o
 * próximo < ou fim de linha" serve aos dois.
 */

export type TransacaoOfx = {
  /** A identidade da transação neste extrato, estável entre importações do mesmo arquivo. */
  chave: string;
  /** "YYYY-MM-DD". */
  data: string;
  /** Com sinal: entrada positiva, saída negativa. */
  valor: number;
  descricao: string;
};

export type ExtratoOfx = {
  /** A conta no banco ("12345-6"), para lembrar qual conta da casa é esta. */
  conta: string | null;
  de: string | null;
  ate: string | null;
  saldoFinal: number | null;
  saldoEm: string | null;
  transacoes: TransacaoOfx[];
};

/** Decodifica pelo charset que o cabeçalho declara: os bancos daqui mandam 1252 (latin1). */
export function decodificarOfx(bytes: Uint8Array): string {
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  const latin = /CHARSET:\s*(1252|ISO-?8859-?1|WINDOWS-?1252)/i.test(cabeca) || /encoding="(ISO-8859-1|windows-1252)"/i.test(cabeca);
  if (latin) return new TextDecoder("windows-1252").decode(bytes);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Sem charset declarado e com caractere inválido em UTF-8: é latin1 que não avisou.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

function valorDa(bloco: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i").exec(bloco);
  const v = m?.[1].trim();
  return v ? v : null;
}

/** "20261006120000[-3:BRT]" vira "2026-10-06". */
function dataDo(texto: string | null): string | null {
  const m = texto ? /^(\d{4})(\d{2})(\d{2})/.exec(texto) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "-450.30", "-450,30", "1.234,56": o número, ou nulo. */
function numeroDo(texto: string | null): number | null {
  if (!texto) return null;
  let t = texto.replace(/\s/g, "");
  // Com os dois separadores, o que vem por último é o decimal: "1.234,56"
  // (daqui) e "1,234.56" (o padrão OFX com milhar) dão o mesmo número.
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Entidades que o XML usa e o SGML às vezes também. */
function limpar(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As transações de um OFX. Lança erro com mensagem para a tela quando o
 * arquivo não é um extrato.
 */
export function lerOfx(texto: string): ExtratoOfx {
  if (!/<OFX>/i.test(texto)) throw new Error("Este arquivo não é um extrato OFX. No banco, procure exportar o extrato em OFX (às vezes chamado Money).");

  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const vistas = new Map<string, number>();
  const transacoes: TransacaoOfx[] = [];
  for (const bloco of blocos) {
    const data = dataDo(valorDa(bloco, "DTPOSTED"));
    const valor = numeroDo(valorDa(bloco, "TRNAMT"));
    if (!data || valor === null || valor === 0) continue;
    const memo = valorDa(bloco, "MEMO");
    const nome = valorDa(bloco, "NAME");
    const descricao = limpar([nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")) || "(sem descrição)";
    // Há banco que repete o FITID em transações diferentes; a chave leva a data
    // e o valor junto, e a repetição exata dentro do arquivo ganha um número.
    const base = `${valorDa(bloco, "FITID") ?? descricao}|${data}|${Math.round(valor * 100)}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    transacoes.push({ chave: (n === 1 ? base : `${base}#${n}`).slice(0, 200), data, valor, descricao: descricao.slice(0, 200) });
  }

  const saldo = /<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i.exec(texto)?.[0] ?? "";
  return {
    conta: valorDa(texto, "ACCTID"),
    de: dataDo(valorDa(texto, "DTSTART")),
    ate: dataDo(valorDa(texto, "DTEND")),
    saldoFinal: numeroDo(valorDa(saldo, "BALAMT")),
    saldoEm: dataDo(valorDa(saldo, "DTASOF")),
    transacoes: transacoes.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)),
  };
}
