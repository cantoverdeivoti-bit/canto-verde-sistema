import { UNIT_LABEL, formatAmount, formatMoney, lerNumeroBR } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

/**
 * Do jeito que o fornecedor fala ao jeito que a casa compara.
 *
 * Numa cotação, um manda o preço do kg, outro o do pacote e outro o da caixa
 * fechada, e os três números não se comparam. O link pergunta na ordem da
 * cabeça dele: qual o valor, esse valor é de quê, e o que vem dentro. A conta
 * sai daqui.
 *
 * O banco não mudou. `Preco` já guardava as três coisas que esta conta produz
 * — `embalagem` (texto), `conteudo` (quantas unidades DA CASA cabem) e
 * `precoEmbalagem` —, e o servidor já dividia um pelo outro. O que mudou foi
 * quem monta: antes o fornecedor digitava os três crus, com a embalagem em
 * texto livre e o conteúdo já convertido de cabeça.
 */

export type Familia = "peso" | "volume" | "contagem";

/**
 * O que o fornecedor marcou, ainda como texto de campo.
 *
 * `chip` vazio quer dizer "o valor é de 1 unidade da casa" — 1 kg, 1 un —, que
 * é o caso mais comum e por isso o que vem marcado. Aí nada mais é perguntado.
 */
export type Embalagem = {
  chip: string;
  /** Quantas peças: o 10 de "caixa com 10 de 1 kg". Na contagem, é tudo. */
  quantidade: string;
  /** O tamanho de cada peça: o 1 kg de "caixa com 10 de 1 kg". */
  tamanho: string;
  /** Em que o tamanho foi dito: kg ou g, L ou ml. */
  medida: string;
};

export function familiaDe(unit: ProductUnit): Familia {
  if (unit === "KG" || unit === "G") return "peso";
  if (unit === "L" || unit === "ML") return "volume";
  return "contagem";
}

/* Sem "Outro" em texto livre: é o texto livre que fazia cada fornecedor
   escrever a embalagem de um jeito. O caso raro vai para a observação. */
const CHIPS: Record<Familia, string[]> = {
  peso: ["Pacote", "Caixa", "Fardo"],
  volume: ["Garrafa", "Galão", "Caixa", "Fardo"],
  contagem: ["Pacote", "Caixa", "Fardo"],
};

/** Em gramas e mililitros, para kg e g (e L e ml) caírem na mesma conta. */
const FATOR: Record<string, number> = { KG: 1000, G: 1, L: 1000, ML: 1 };

export const MEDIDAS: Record<Familia, string[]> = {
  peso: ["KG", "G"],
  volume: ["L", "ML"],
  contagem: [],
};

/**
 * Os chips deste produto. Uma embalagem que veio de antes e não está na lista
 * — "bombona", de quando era texto livre — entra junto, marcada, em vez de
 * ser trocada em silêncio por uma das nossas.
 */
export function chipsDe(unit: ProductUnit, atual: string): string[] {
  const lista = CHIPS[familiaDe(unit)];
  return atual !== "" && !lista.includes(atual) ? [...lista, atual] : lista;
}

/**
 * Caixa e fardo juntam várias unidades; pacote, garrafa e galão são uma
 * coisa só. Decide se o link pergunta "quantas vêm" além de "quanto tem".
 */
export function agrupa(chip: string): boolean {
  return chip === "Caixa" || chip === "Fardo";
}

/**
 * Um exemplo escrito da embalagem marcada, com o nome do produto: "pacote de
 * 5 kg de arroz". É o que tira a dúvida de "o que é pacote aqui" sem ninguém
 * ter de explicar — ele lê o exemplo e troca os números pelos dele.
 */
export function exemploDaEmbalagem(chip: string, unit: ProductUnit, nome: string): string {
  // Só a primeira palavra do nome — "arroz", e não "arroz branco tipo 1":
  // o exemplo tem de caber numa linha do celular, e a primeira palavra já
  // diz de que produto se fala.
  const produto = nome.trim().split(/\s+/)[0]?.toLowerCase() || "produto";
  const casa = UNIT_LABEL[unit];
  const familia = familiaDe(unit);
  const embalagem = chip.toLowerCase();

  if (chip === "") return `1 ${casa} de ${produto}`;
  if (familia === "contagem") return `${embalagem} com 12 ${casa} de ${produto}`;

  const medida = familia === "peso" ? "KG" : "L";
  if (agrupa(chip)) {
    const peca = familia === "peso" ? "pacotes" : "garrafas";
    return `${embalagem} com 10 ${peca} de 1 ${medida} de ${produto}`;
  }
  return `${embalagem} de 5 ${medida} de ${produto}`;
}

/**
 * A quantidade ao trocar de chip. Embalagem de uma coisa só é sempre 1 — e
 * precisa voltar a 1, senão "caixa com 10" trocada para pacote viraria um
 * pacote de dez vezes o tamanho, com o 10 escondido. Ao entrar numa que
 * junta várias, o campo começa vazio para ele dizer quantas.
 */
export function quantidadeAoTrocar(de: Embalagem, para: string, unit: ProductUnit): string {
  if (familiaDe(unit) === "contagem") return de.chip === "" ? "" : de.quantidade;
  if (!agrupa(para)) return "1";
  return agrupa(de.chip) ? de.quantidade : "";
}

/* Sem separador de milhar, de propósito: "1.000 g" relido por `lerNumeroBR`
   daria 1. O texto gravado precisa voltar como o mesmo número. */
const numero = (n: number | null) =>
  n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

export function embalagemVazia(unit: ProductUnit): Embalagem {
  return { chip: "", quantidade: "1", tamanho: "", medida: UNIT_LABEL[unit] };
}

/**
 * Quantas unidades da casa cabem no que ele cotou. Null enquanto falta
 * número — e é esse null que faz a linha não valer como resposta.
 *
 * Três casas porque é o que `Preco.conteudo` guarda: 12,5 g num produto em kg
 * gravaria 0,0125 e o banco cortaria. Arredondar aqui faz a conta da tela ser
 * a mesma do servidor.
 */
export function conteudoNaCasa(e: Embalagem, unit: ProductUnit): number | null {
  if (e.chip === "") return 1;

  const q = lerNumeroBR(e.quantidade);
  if (q === null || q <= 0) return null;

  let bruto = q;
  if (familiaDe(unit) !== "contagem") {
    const t = lerNumeroBR(e.tamanho);
    const de = FATOR[e.medida.toUpperCase()];
    const para = FATOR[UNIT_LABEL[unit]];
    if (t === null || t <= 0 || de === undefined || para === undefined) return null;
    bruto = (q * t * de) / para;
  }

  const n = Math.round(bruto * 1000) / 1000;
  return n > 0 ? n : null;
}

/**
 * O texto que vai para `Preco.embalagem` — e é o que a casa lê no
 * comparativo: "kg", "Pacote 5 kg", "Caixa 10 × 1 kg", "Fardo 12 un".
 */
export function descreverEmbalagem(e: Embalagem, unit: ProductUnit): string {
  const casa = UNIT_LABEL[unit];
  if (e.chip === "") return casa;

  const q = lerNumeroBR(e.quantidade);
  if (familiaDe(unit) === "contagem") return `${e.chip} ${numero(q)} ${casa}`;

  const t = numero(lerNumeroBR(e.tamanho));
  return q === 1 ? `${e.chip} ${t} ${e.medida}` : `${e.chip} ${numero(q)} × ${t} ${e.medida}`;
}

/**
 * Em que o preço foi dito, no plural: "kg", "un", "caixas", "galões".
 * É a medida da quantidade do preço por volume — "acima de 10 caixas".
 */
export function medidaNoPlural(chip: string, unit: ProductUnit): string {
  if (chip === "") return UNIT_LABEL[unit];
  const nome = chip.toLowerCase();
  return nome.endsWith("ão") ? `${nome.slice(0, -2)}ões` : `${nome}s`;
}

/**
 * O preço por volume como a casa lê: "acima de 10 caixas: R$ 11,50/kg".
 *
 * O valor já convertido para a unidade da casa, que é como o comparativo
 * inteiro fala — "R$ 115 a caixa" ao lado de "R$ 12,49/kg" obrigaria a fazer
 * a conta de cabeça, que é o que o link veio tirar de todo mundo.
 */
export function rotuloDoDesconto(
  embalagem: string,
  conteudo: number,
  acima: number,
  precoEmbalagem: number,
  unit: ProductUnit,
): string {
  const casa = UNIT_LABEL[unit];
  const primeira = embalagem.trim().split(" ")[0] ?? "";
  const medida =
    embalagem.trim().toLowerCase() === casa.toLowerCase() || primeira === ""
      ? casa
      : medidaNoPlural(primeira, unit);
  return `acima de ${formatAmount(acima)} ${medida}: ${formatMoney(precoEmbalagem / conteudo)}/${casa}`;
}

/**
 * A embalagem como a casa lê no comparativo.
 *
 * O texto novo já traz a medida ("Pacote 5 kg"), e repetir o conteúdo atrás
 * daria "Pacote 5 kg 5 kg". O total em unidade da casa só aparece quando
 * acrescenta alguma coisa: "Caixa 10 × 1 kg (10 kg)", "Pacote 500 g (0,5 kg)".
 * Resposta antiga, em texto livre, continua como era: "fardo com 12 un".
 */
export function rotuloDaEmbalagem(embalagem: string, conteudo: number, unit: ProductUnit): string {
  const casa = UNIT_LABEL[unit];
  const total = `${formatAmount(conteudo)} ${casa}`;
  if (embalagem.trim().toLowerCase() === casa.toLowerCase()) return `1 ${casa}`;

  const m = /^\p{L}+ (?:([\d.,]+) × )?[\d.,]+ (\S+)$/u.exec(embalagem.trim());
  if (m === null) return `${embalagem} com ${total}`;
  const [, quantidade, medida] = m;
  return quantidade === undefined && medida.toUpperCase() === casa.toUpperCase()
    ? embalagem
    : `${embalagem} (${total})`;
}

/**
 * Quem reabre o link encontra os chips como deixou.
 *
 * O texto que `descreverEmbalagem` escreveu é lido de volta. Resposta de antes
 * disto, em texto livre, vira o próprio texto como chip e o conteúdo como
 * tamanho — a conta dá o mesmo número, porque `conteudo` é o mesmo.
 */
export function lerEmbalagemAnterior(
  embalagem: string | null,
  conteudo: number | null,
  unit: ProductUnit,
): Embalagem {
  const vazia = embalagemVazia(unit);
  if (embalagem === null || conteudo === null) return vazia;

  const casa = UNIT_LABEL[unit];
  if (conteudo === 1 && embalagem.trim().toLowerCase() === casa.toLowerCase()) return vazia;

  const contagem = familiaDe(unit) === "contagem";
  const medidas = MEDIDAS[familiaDe(unit)];
  // "fardo" escrito à mão numa resposta antiga cai no botão "Fardo", e não
  // num botão a mais, igual, ao lado dele.
  const canonico = (c: string) =>
    CHIPS[familiaDe(unit)].find((x) => x.toLowerCase() === c.toLowerCase()) ?? c;

  const m = /^(\p{L}+) (?:([\d.,]+) × )?([\d.,]+) (\S+)$/u.exec(embalagem.trim());
  if (m) {
    const [, escrito, quantidade, tamanho, escrita] = m;
    const chip = canonico(escrito);
    // Sem diferenciar maiúscula: o que foi gravado antes de as unidades irem
    // para maiúscula ("Pacote 5 kg") continua sendo lido.
    const medida = escrita.toUpperCase();
    if (contagem && medida === casa) {
      return { ...vazia, chip, quantidade: tamanho };
    }
    if (!contagem && medidas.includes(medida)) {
      return { chip, quantidade: quantidade ?? "1", tamanho, medida };
    }
  }

  const chip = canonico(embalagem.trim().slice(0, 30)) || CHIPS[familiaDe(unit)][0];
  return contagem
    ? { ...vazia, chip, quantidade: numero(conteudo) }
    : { chip, quantidade: "1", tamanho: numero(conteudo), medida: casa };
}
