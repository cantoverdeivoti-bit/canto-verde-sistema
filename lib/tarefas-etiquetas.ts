import { chave } from "@/lib/format";

/**
 * Etiquetas, sem Prisma e sem banco.
 *
 * A regra que importa aqui é a RN-020: etiqueta nunca é pessoa. No TickTick,
 * ALINE, JOEL, Laura e LAUREN viraram etiqueta porque a lista não tinha campo
 * de responsável que servisse, e a equipe improvisou. O resultado foram 729
 * tarefas em que "de quem é" mora em dois lugares que discordam entre si.
 * Aqui quem faz é `Tarefa.responsavelId`, e a porta da etiqueta fica fechada.
 */

/** O tamanho da coluna no banco. Etiqueta é rótulo, não frase. */
export const ETIQUETA_MAXIMO = 30;

/**
 * O nome como ele é gravado: sem espaço sobrando nas pontas nem repetido no
 * meio, e cortado no tamanho da coluna. A caixa fica como a pessoa digitou —
 * "NF-e" e "Elétrica" são escolhas, e a comparação de igualdade é que ignora
 * caixa e acento, não a gravação.
 */
export function normalizarEtiqueta(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().slice(0, ETIQUETA_MAXIMO);
}

/** As duas etiquetas são a mesma? "Elétrica" e "eletrica" são. */
export function mesmaEtiqueta(a: string, b: string): boolean {
  return chave(normalizarEtiqueta(a)) === chave(normalizarEtiqueta(b));
}

/**
 * Esta etiqueta tem nome de alguém da equipe? Devolve o motivo, ou nulo.
 *
 * Compara contra o nome completo, o primeiro nome e o usuário de quem está
 * ATIVO — o primeiro nome é o que importa, porque é ele que a equipe digita
 * ("LAUREN", não "Lauren Souza"). Pela régua de `chave`, sem acento e sem
 * caixa: "joel" barra JOEL.
 *
 * Só quem está ativo: o nome de quem saiu da casa deixa de ser de alguém, e
 * barrar para sempre um nome comum ("Paulo") por causa de um ex-funcionário
 * seria proibir uma palavra.
 */
export function etiquetaComNomeDePessoa(
  nome: string,
  pessoasAtivas: { name: string | null; username: string }[],
): string | null {
  const alvo = chave(normalizarEtiqueta(nome));
  if (alvo === "") return null;
  for (const p of pessoasAtivas) {
    const completo = p.name ? chave(p.name.trim()) : "";
    const primeiro = completo.split(/\s+/)[0] ?? "";
    if (alvo === completo || alvo === primeiro || alvo === chave(p.username)) {
      const quem = p.name?.trim() || p.username;
      return `${normalizarEtiqueta(nome)} é ${quem}, uma pessoa da equipe. Quem faz a tarefa vai em "Quem faz", não em etiqueta.`;
    }
  }
  return null;
}
