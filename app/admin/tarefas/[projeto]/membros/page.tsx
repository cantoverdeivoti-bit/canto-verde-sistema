import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { papelEfetivo, podeNaTarefa } from "@/lib/tarefas-permissoes";

import { MembrosLista, type MembroRow } from "./membros-lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membros — Tarefas" };

/**
 * Quem está no quadro, e o que cada um pode fazer nele.
 *
 * A tela que faltava: as ações de incluir e tirar membro existiam desde o
 * primeiro dia e não havia nada que as chamasse. Como só membro pode ser
 * responsável por uma tarefa (RN-033), o quadro nascia e morria com uma
 * pessoa só — a que o criou. Era a trava nº 1 do piloto.
 *
 * Quem não é gestor não chega aqui: a lista de membros é onde se decide quem
 * manda no quadro, e ler isso já é meio caminho para mexer.
 */
export default async function MembrosPage({
  params,
}: PageProps<"/admin/tarefas/[projeto]/membros">) {
  const user = await guardModule("tarefas");
  const { projeto: projetoParam } = await params;

  const projetoId = Number(projetoParam);
  if (!Number.isInteger(projetoId) || projetoId <= 0) notFound();

  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: {
      membros: {
        include: { user: { select: { id: true, name: true, username: true, role: true } } },
      },
    },
  });
  if (!projeto) notFound();

  const meuPapel = papelEfetivo(
    user,
    projeto.membros.find((m) => m.userId === user.id)?.papel ?? null,
  );
  if (!podeNaTarefa(meuPapel, "gerenciarMembros")) {
    redirect(`/admin/tarefas/${projetoId}`);
  }

  // Desligado não aparece na escolha (RN-034) — e continua no histórico das
  // tarefas que fez, que é por onde o nome dele deve reaparecer.
  const pessoas = await prisma.adminUser.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { username: "asc" }],
    select: { id: true, name: true, username: true },
  });

  /* Quantas tarefas abertas cada um tem AQUI. É o que impede tirar alguém do
     quadro sem redistribuir, e é também o número que o gestor precisa ver
     antes de pendurar mais trabalho na mesma pessoa (RF-157). */
  const carga = await prisma.tarefa.groupBy({
    by: ["responsavelId"],
    where: { projetoId, status: "ABERTA", excluidoEm: null },
    _count: { _all: true },
  });
  const abertas = new Map(
    carga
      .filter((c) => c.responsavelId !== null)
      .map((c) => [c.responsavelId as number, c._count._all]),
  );

  const membros: MembroRow[] = projeto.membros
    .map((m) => ({
      userId: m.userId,
      nome: m.user.name ?? m.user.username,
      papel: m.papel,
      ehDono: m.userId === projeto.donoId,
      abertas: abertas.get(m.userId) ?? 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const jaSao = new Set(membros.map((m) => m.userId));

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo={`Membros de ${projeto.nome}`}
        subtitulo="Só quem está nesta lista pode ser responsável por uma tarefa deste quadro. O papel decide o que a pessoa faz aqui dentro — e não muda nada nos outros quadros."
        acoes={
          <Link
            href={`/admin/tarefas/${projetoId}`}
            className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Voltar ao quadro
          </Link>
        }
      />

      <MembrosLista
        projetoId={projetoId}
        membros={membros}
        candidatos={pessoas
          .filter((p) => !jaSao.has(p.id))
          .map((p) => ({ id: p.id, nome: p.name ?? p.username }))}
      />
    </Pagina>
  );
}
