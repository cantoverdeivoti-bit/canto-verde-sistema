import { Plus } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { ABAS_DE_EVENTO, type ChaveDaAba } from "@/lib/eventos";
import { resumirEvento, RESUMO_DO_EVENTO } from "@/lib/eventos-dados";
import { todayInTimezone } from "@/lib/availability";
import { FUSO_DA_CASA } from "@/lib/format";

import { ListaDeEventos } from "./lista-de-eventos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamentos · Eventos" };

/**
 * O funil: orçamentos em aberto, eventos confirmados, realizados e perdidos.
 * É o mesmo registro em fases diferentes, e cada aba é um recorte do status.
 */
export default async function OrcamentosPage({ searchParams }: PageProps<"/admin/eventos/orcamentos">) {
  const q = await searchParams;
  const aba = ABAS_DE_EVENTO.find((a) => a.chave === q.aba) ?? ABAS_DE_EVENTO[0];

  const [eventos, contagem] = await Promise.all([
    prisma.evento.findMany({
      where: { status: { in: [...aba.status] } },
      // Em aberto e em andamento: o mais próximo primeiro. Os encerrados: o mais recente primeiro.
      orderBy: aba.chave === "orcamentos" || aba.chave === "andamento" ? { data: "asc" } : { data: "desc" },
      select: RESUMO_DO_EVENTO,
    }),
    prisma.evento.groupBy({ by: ["status"], _count: true }),
  ]);
  const quantos = (chave: ChaveDaAba) =>
    contagem
      .filter((c) => (ABAS_DE_EVENTO.find((a) => a.chave === chave)!.status as readonly string[]).includes(c.status))
      .reduce((s, c) => s + c._count, 0);

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Orçamentos e eventos"
        acoes={
          <Button asChild>
            <Link href="/admin/eventos/orcamentos/novo">
              <Plus aria-hidden className="size-4" />
              Novo orçamento
            </Link>
          </Button>
        }
      />
      <nav aria-label="Situação" className="flex flex-wrap gap-1.5">
        {ABAS_DE_EVENTO.map((a) => (
          <Link
            key={a.chave}
            href={a.chave === "orcamentos" ? "/admin/eventos/orcamentos" : `/admin/eventos/orcamentos?aba=${a.chave}`}
            aria-current={a.chave === aba.chave ? "page" : undefined}
            className={`chip text-sm ${a.chave === aba.chave ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)]" : ""}`}
          >
            {a.nome} <span className="ml-1 opacity-70">{quantos(a.chave)}</span>
          </Link>
        ))}
      </nav>
      <ListaDeEventos eventos={eventos.map(resumirEvento)} aba={aba.chave} hoje={todayInTimezone(FUSO_DA_CASA)} />
    </Pagina>
  );
}
