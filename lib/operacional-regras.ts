/**
 * As contas do módulo Operacional, sem banco: a ordem das folhas de
 * checklist, e quem já foi treinado no que a função pede.
 */

export type Momento = "ABERTURA" | "FECHAMENTO";

export const MOMENTOS: { chave: Momento; nome: string }[] = [
  { chave: "ABERTURA", nome: "Abertura" },
  { chave: "FECHAMENTO", nome: "Fechamento" },
];

/** Os dias da folha semanal, na ordem da casa (a semana começa na segunda). */
export const DIAS_DA_FOLHA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/** "Salão / Caixa"; a folha do departamento todo leva só o nome dele. */
export function nomeDaFolha(departamento: string, sub: string | null): string {
  return sub === null ? departamento : `${departamento} / ${sub}`;
}

type Linha = { id: number; ordem: number };

/** As tarefas na ordem da folha; ordem empatada desempata pelo id. */
export function emOrdem<T extends Linha>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/**
 * Sobe ou desce uma tarefa: troca de lugar com a vizinha. Devolve o momento
 * inteiro na ordem nova; quem grava numera de 1 em diante. Na ponta, não mexe.
 */
export function moverNaLista<T extends Linha>(tarefas: T[], id: number, sentido: -1 | 1): T[] {
  const lista = emOrdem(tarefas);
  const i = lista.findIndex((t) => t.id === id);
  const j = i + sentido;
  if (i >= 0 && j >= 0 && j < lista.length) [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

export type SituacaoDoProcesso = { processoId: number; treinadoEm: string | null };

/**
 * Por pessoa, cada processo obrigatório da função dela: treinado (com a data
 * mais recente, que é a que vale na reciclagem) ou pendente. Quem não tem
 * função não tem obrigatório.
 */
export function situacaoDoTreinamento(
  pessoas: { id: number; funcaoId: number | null }[],
  obrigatorios: { funcaoId: number; processoId: number }[],
  treinamentos: { colaboradorId: number; processoId: number; data: string }[],
): Map<number, { processos: SituacaoDoProcesso[]; pendentes: number }> {
  const ultimo = new Map<string, string>();
  for (const t of treinamentos) {
    const chave = `${t.colaboradorId}:${t.processoId}`;
    const antes = ultimo.get(chave);
    if (!antes || t.data > antes) ultimo.set(chave, t.data);
  }
  const resultado = new Map<number, { processos: SituacaoDoProcesso[]; pendentes: number }>();
  for (const p of pessoas) {
    const processos = obrigatorios
      .filter((o) => p.funcaoId !== null && o.funcaoId === p.funcaoId)
      .map((o) => ({ processoId: o.processoId, treinadoEm: ultimo.get(`${p.id}:${o.processoId}`) ?? null }));
    resultado.set(p.id, { processos, pendentes: processos.filter((x) => x.treinadoEm === null).length });
  }
  return resultado;
}
