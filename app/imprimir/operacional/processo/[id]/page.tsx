import { notFound } from "next/navigation";

import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";

import { FolhaDeImpressao } from "../../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Processo para imprimir" };

/** O processo numa folha A4: título, objetivo, os passos numerados e as observações. */
export default async function ImprimirProcessoPage({ params }: PageProps<"/imprimir/operacional/processo/[id]">) {
  await guardModule("operacional");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await prisma.processo.findUnique({
    where: { id },
    select: { titulo: true, objetivo: true, passos: true, observacoes: true, revisadoEm: true, obrigatorio: { select: { funcao: { select: { nome: true } } } } },
  });
  if (!p) notFound();

  return (
    <FolhaDeImpressao margem={12} css="@media print { li { break-inside: avoid; } }">
      <header className="mb-3 border-b-2 border-black pb-1">
        <h1 className="text-xl font-bold">{p.titulo}</h1>
        <p className="text-[11px]">
          {p.obrigatorio.length > 0 && <>Para: {p.obrigatorio.map((o) => o.funcao.nome).join(", ")} · </>}
          {p.revisadoEm ? `Revisado em ${dateOnlyToString(p.revisadoEm).split("-").reverse().join("/")}` : "Sem revisão"}
        </p>
      </header>
      {p.objetivo && (
        <section className="mb-3 text-[13px]">
          <h2 className="font-bold">Objetivo</h2>
          <p className="whitespace-pre-line">{p.objetivo}</p>
        </section>
      )}
      <section className="mb-3 text-[13px]">
        <h2 className="mb-1 font-bold">Passo a passo</h2>
        <ol className="space-y-1.5">
          {p.passos.map((passo, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-bold">{i + 1}.</span>
              <span className="whitespace-pre-line">{passo}</span>
            </li>
          ))}
        </ol>
      </section>
      {p.observacoes && (
        <section className="text-[13px]">
          <h2 className="font-bold">Observações</h2>
          <p className="whitespace-pre-line">{p.observacoes}</p>
        </section>
      )}
    </FolhaDeImpressao>
  );
}
