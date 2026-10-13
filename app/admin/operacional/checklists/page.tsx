import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { folhasDeChecklist } from "@/lib/operacional-dados";
import { can } from "@/lib/roles";

import { EditorDeChecklists } from "./editor-de-checklists";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklists · Operacional" };

/**
 * As folhas de tarefas para imprimir e pendurar no lugar, por departamento
 * (Salão) e subdepartamento (Salão / Caixa), cada uma com abertura e
 * fechamento. Aqui se cria, edita e imprime; nada se marca no sistema.
 */
export default async function ChecklistsPage({ searchParams }: PageProps<"/admin/operacional/checklists">) {
  const [user, q] = await Promise.all([guardModule("operacional"), searchParams]);
  const departamentos = await prisma.checklistDepartamento.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      folhas: { orderBy: { nome: { sort: "asc", nulls: "first" } }, select: { id: true, nome: true, _count: { select: { tarefas: true } } } },
    },
  });
  const pedida = typeof q.folha === "string" ? Number(q.folha) : null;
  const atual = departamentos.flatMap((d) => d.folhas).find((f) => f.id === pedida) ?? departamentos[0]?.folhas[0] ?? null;
  const [folha] = atual ? await folhasDeChecklist({ folha: atual.id }) : [];

  return (
    <EditorDeChecklists
      departamentos={departamentos.map((d) => ({ id: d.id, nome: d.nome, folhas: d.folhas.map((f) => ({ id: f.id, nome: f.nome, tarefas: f._count.tarefas })) }))}
      folha={folha ?? null}
      podeMudar={can(user, "operacional", { configure: true })}
    />
  );
}
