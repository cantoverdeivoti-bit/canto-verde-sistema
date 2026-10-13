import { prisma } from "@/lib/db";
import { emOrdem, MOMENTOS, nomeDaFolha } from "@/lib/operacional-regras";

/**
 * As folhas de checklist com as tarefas de cada momento, na ordem. Uma folha
 * (pelo id), um departamento inteiro ou todas: por departamento, a folha do
 * departamento todo primeiro e os subdepartamentos por nome.
 */
export async function folhasDeChecklist(filtro: { folha?: number; departamento?: number } = {}) {
  const folhas = await prisma.checklistLista.findMany({
    where: { ...(filtro.folha ? { id: filtro.folha } : {}), ...(filtro.departamento ? { departamentoId: filtro.departamento } : {}) },
    orderBy: [{ departamento: { nome: "asc" } }, { nome: { sort: "asc", nulls: "first" } }],
    select: {
      id: true,
      nome: true,
      departamento: { select: { id: true, nome: true } },
      tarefas: { select: { id: true, momento: true, texto: true, ordem: true } },
    },
  });
  return folhas.map((f) => ({
    id: f.id,
    sub: f.nome,
    departamento: f.departamento,
    titulo: nomeDaFolha(f.departamento.nome, f.nome),
    momentos: MOMENTOS.map((m) => ({ ...m, tarefas: emOrdem(f.tarefas.filter((t) => t.momento === m.chave)) })),
  }));
}

export type FolhaDeChecklist = Awaited<ReturnType<typeof folhasDeChecklist>>[number];
