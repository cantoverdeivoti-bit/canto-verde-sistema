import { diaDaSemana, segundaDaSemana, somarDias } from "@/lib/escala";

/**
 * As contas da Agenda, sem banco: o período que a tela mostra, a grade do mês
 * e as datas que voltam todo ano (aniversário, tempo de casa).
 */

/** Os assuntos da Agenda, com a cor e o ícone de cada um. A ordem é a do filtro. */
export const ASSUNTOS = {
  eventos: { nome: "Eventos", cor: "#7c3aed", icone: "eventos", modulo: "eventos" },
  reservas: { nome: "Reservas", cor: "#2563eb", icone: "agenda", modulo: "comercial" },
  pessoal: { nome: "Pessoal", cor: "#db2777", icone: "pessoal", modulo: "pessoal" },
  compras: { nome: "Compras", cor: "#16a34a", icone: "carrinho", modulo: "compras" },
  financeiro: { nome: "Financeiro", cor: "#d97706", icone: "financeiro", modulo: "financeiro" },
  tarefas: { nome: "Tarefas", cor: "#64748b", icone: "tarefas", modulo: "tarefas" },
} as const;
export type Assunto = keyof typeof ASSUNTOS;
export const ehAssunto = (v: unknown): v is Assunto => typeof v === "string" && v in ASSUNTOS;

/** Um compromisso na Agenda: o que acontece, em que dia, de que assunto, e para onde leva. */
export type ItemDaAgenda = {
  chave: string;
  data: string;
  hora: string | null;
  assunto: Assunto;
  titulo: string;
  detalhe: string | null;
  href: string;
  feito: boolean;
  atrasado: boolean;
};

/** Os dias de `de` a `ate`, inclusive. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/**
 * A grade do mês, de segunda a domingo (a semana da casa começa na segunda),
 * já com os dias do mês anterior e do seguinte que completam as semanas.
 */
export function gradeDoMes(mes: string): string[][] {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(`${proximoMes(mes)}-01`, -1);
  const fim = somarDias(segundaDaSemana(ultimo), 6);
  const semanas: string[][] = [];
  for (let d = segundaDaSemana(primeiro); d <= fim; d = somarDias(d, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(d, i)));
  }
  return semanas;
}

export function proximoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Os dias do período em que uma data que volta todo ano cai, com quantos anos
 * faz. 29/02 cai em 28/02 nos anos que não são bissextos. O próprio dia de
 * origem não conta (zero anos).
 */
export function aniversariosNoPeriodo(origem: string, de: string, ate: string): { data: string; anos: number }[] {
  const [anoOrigem, mm, dd] = [Number(origem.slice(0, 4)), origem.slice(5, 7), origem.slice(8, 10)];
  const achados: { data: string; anos: number }[] = [];
  for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    const data = mm === "02" && dd === "29" && !bissexto ? `${ano}-02-28` : `${ano}-${mm}-${dd}`;
    const anos = ano - anoOrigem;
    if (anos >= 1 && data >= de && data <= ate) achados.push({ data, anos });
  }
  return achados;
}

/** Os dias do período que caem num dia da semana (0 = domingo, como `ListaCompra.diaSemana`). */
export function diasNaSemana(diaSemana: number, de: string, ate: string): string[] {
  return diasDoPeriodo(de, ate).filter((d) => diaDaSemana(d) === diaSemana);
}

/** Os itens de cada dia, na ordem: com hora primeiro (pela hora), depois o resto pelo assunto. */
export function porDia(itens: ItemDaAgenda[]): Map<string, ItemDaAgenda[]> {
  const ordem = Object.keys(ASSUNTOS);
  const mapa = new Map<string, ItemDaAgenda[]>();
  for (const i of itens) mapa.set(i.data, [...(mapa.get(i.data) ?? []), i]);
  for (const lista of mapa.values()) {
    lista.sort(
      (a, b) =>
        Number(a.hora === null) - Number(b.hora === null) ||
        (a.hora ?? "").localeCompare(b.hora ?? "") ||
        ordem.indexOf(a.assunto) - ordem.indexOf(b.assunto) ||
        a.titulo.localeCompare(b.titulo, "pt-BR"),
    );
  }
  return mapa;
}
