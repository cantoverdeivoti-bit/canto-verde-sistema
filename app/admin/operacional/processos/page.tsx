import { Plus, Search } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, LinhaComLink, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { chave, plural } from "@/lib/format";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Processos · Operacional" };

/** Os processos da casa (o passo a passo de cada trabalho), com busca. */
export default async function ProcessosPage({ searchParams }: PageProps<"/admin/operacional/processos">) {
  const q = await searchParams;
  const busca = typeof q.q === "string" ? q.q.trim() : "";
  const [user, processos] = await Promise.all([
    guardModule("operacional"),
    prisma.processo.findMany({
      orderBy: [{ ativo: "desc" }, { titulo: "asc" }],
      select: {
        id: true,
        titulo: true,
        objetivo: true,
        ativo: true,
        passos: true,
        obrigatorio: { select: { funcao: { select: { nome: true } } } },
      },
    }),
  ]);
  const lista = busca ? processos.filter((p) => chave(`${p.titulo} ${p.objetivo ?? ""}`).includes(chave(busca))) : processos;

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Processos"
        acoes={
          can(user, "operacional", { configure: true }) && (
            <Button asChild className="h-10 gap-1.5">
              <Link href="/admin/operacional/processos/novo">
                <Plus aria-hidden className="size-4" />
                Novo processo
              </Link>
            </Button>
          )
        }
      />
      <form method="get" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input name="q" type="search" defaultValue={busca} placeholder="Buscar processo" className="w-full pl-9" aria-label="Buscar processo" />
        </div>
        <Button type="submit" variant="outline" className="h-11 shrink-0">
          Buscar
        </Button>
      </form>
      {lista.length === 0 ? (
        <Vazio>
          {processos.length === 0 ? "Nenhum processo ainda. Comece pelo que mais se ensina: abrir a cozinha, fechar o caixa, montar o buffet." : `Nenhum processo com "${busca}".`}
        </Vazio>
      ) : (
        <Lista>
          {lista.map((p) => (
            <LinhaComLink key={p.id} href={`/admin/operacional/processos/${p.id}`} className={p.ativo ? undefined : "opacity-60"}>
              <span className="block font-semibold">{p.titulo}</span>
              <span className="block truncate text-xs text-[var(--muted-foreground)]">
                {plural(p.passos.length, "passo", "passos")}
                {p.obrigatorio.length > 0 && ` · obrigatório para ${p.obrigatorio.map((o) => o.funcao.nome).join(", ")}`}
                {!p.ativo && " · desligado"}
              </span>
            </LinhaComLink>
          ))}
        </Lista>
      )}
    </Pagina>
  );
}
