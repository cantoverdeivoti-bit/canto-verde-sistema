import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { can } from "@/lib/roles";

import { FormDoProcesso } from "../form-do-processo";
import { AcoesDoProcesso } from "./acoes-do-processo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Processo · Operacional" };

const dataBR = (d: Date) => dateOnlyToString(d).split("-").reverse().join("/");

/** Um processo: o passo a passo para ler (e imprimir), quem precisa saber e quem já foi treinado. */
export default async function ProcessoPage({ params, searchParams }: PageProps<"/admin/operacional/processos/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [user, p, q] = await Promise.all([
    guardModule("operacional"),
    prisma.processo.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        objetivo: true,
        passos: true,
        observacoes: true,
        ativo: true,
        revisadoEm: true,
        obrigatorio: { select: { funcao: { select: { id: true, nome: true } } } },
        _count: { select: { treinamentos: true } },
        treinamentos: { distinct: ["colaboradorId"], select: { colaboradorId: true } },
      },
    }),
    searchParams,
  ]);
  if (!p) notFound();
  const podeMudar = can(user, "operacional", { configure: true });

  if (podeMudar && q.editar === "1") {
    return (
      <Pagina largura="estreita">
        <CabecalhoDaPagina titulo="Editar processo" voltar={{ href: `/admin/operacional/processos/${p.id}`, texto: p.titulo }} />
        <FormDoProcesso id={p.id} inicial={{ titulo: p.titulo, objetivo: p.objetivo ?? "", passos: p.passos, observacoes: p.observacoes ?? "" }} />
      </Pagina>
    );
  }

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo={p.titulo}
        voltar={{ href: "/admin/operacional/processos", texto: "Processos" }}
        subtitulo={
          <>
            {p.revisadoEm ? `revisado em ${dataBR(p.revisadoEm)}` : "nunca revisado"}
            {" · "}
            {plural(p.treinamentos.length, "pessoa treinada", "pessoas treinadas")}
            {!p.ativo && " · desligado"}
          </>
        }
      />

      <AcoesDoProcesso id={p.id} ativo={p.ativo} temTreinamento={p._count.treinamentos > 0} podeMudar={podeMudar} />

      {p.objetivo && (
        <section>
          <h2 className="section-label mb-1">Objetivo</h2>
          <p className="text-sm whitespace-pre-line">{p.objetivo}</p>
        </section>
      )}
      <section>
        <h2 className="section-label mb-2">Passo a passo</h2>
        <ol className="space-y-2">
          {p.passos.map((passo, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{i + 1}</span>
              <span className="text-sm whitespace-pre-line">{passo}</span>
            </li>
          ))}
        </ol>
      </section>
      {p.observacoes && (
        <section>
          <h2 className="section-label mb-1">Observações</h2>
          <p className="text-sm whitespace-pre-line">{p.observacoes}</p>
        </section>
      )}
      <section>
        <h2 className="section-label mb-1">Quem precisa saber</h2>
        <p className="text-sm">
          {p.obrigatorio.length === 0
            ? "Nenhuma função marcou este processo como obrigatório."
            : p.obrigatorio.map((o, i) => (
                <span key={o.funcao.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/operacional/funcao/${o.funcao.id}`} className="text-[var(--primary)] underline-offset-4 hover:underline">
                    {o.funcao.nome}
                  </Link>
                </span>
              ))}
        </p>
      </section>
    </Pagina>
  );
}
