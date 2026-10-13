/**
 * O tom de um estado, e a cor que o tom escolhe.
 *
 * Saiu de `lib/cotacao-labels.ts`, onde nasceu, quando o módulo Tarefas
 * precisou da mesma decisão. Continua sendo reexportado de lá, então nenhum
 * dos arquivos que já o importavam mudou — é o mesmo arranjo de `lib/roles.ts`
 * saindo de `lib/permissions.ts`.
 *
 * A regra que isto protege é a dos quatro papéis, do DESIGN.md: vinho é o que
 * está escolhido, ocre é o que está pendente, alarme é o que destrói, preto é
 * texto. Uma cor fora desses quatro papéis é erro, não variação. Quem escreve
 * rótulo declara o PAPEL do estado; a cor é consequência, e ninguém escolhe
 * hex em componente nenhum.
 */

export type Tom = "pendente" | "neutro" | "feito" | "destrutivo";

/**
 * A cor do tom.
 *
 * Pendente é ocre porque é o papel que o resto do painel já deu a ele —
 * inclusive para "atrasada", que o DESIGN.md nomeia explicitamente.
 * Destrutivo é o alarme, e cabe a bem pouca coisa: cancelado, recusado, erro.
 * Feito e neutro ficam no texto de apoio: o que já aconteceu não precisa
 * gritar, e dar cor a tudo é o mesmo que não dar cor a nada.
 */
export function corDoTom(tom: Tom): string {
  if (tom === "pendente") return "var(--warn)";
  if (tom === "destrutivo") return "var(--destructive)";
  return "var(--muted-foreground)";
}
