import { Printer } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, LinhaComLink, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funções · Operacional" };

/**
 * As funções da casa (o cadastro é do Departamento pessoal), cada uma com
 * os processos que precisa saber e quantas pessoas tem.
 * Tocar abre a função, onde tudo isso se monta.
 */
export default async function FuncoesOperacionalPage() {
  const funcoes = await prisma.funcao.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      descricao: true,
      _count: {
        select: {
          processosObrigatorios: { where: { processo: { ativo: true } } },
          colaboradores: { where: { ativo: true, pendente: false } },
        },
      },
    },
  });

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Funções"
        acoes={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/admin/operacional/checklists">
              <Printer aria-hidden className="size-4" />
              Checklists
            </Link>
          </Button>
        }
        subtitulo={
          <>
            O que cada função faz e o que precisa saber. As funções se cadastram em{" "}
            <Link href="/admin/pessoal/funcoes" className="text-[var(--primary)] underline underline-offset-4">
              Departamento pessoal → Funções
            </Link>
            .
          </>
        }
      />
      {funcoes.length === 0 ? (
        <Vazio>Nenhuma função cadastrada ainda.</Vazio>
      ) : (
        <Lista>
          {funcoes.map((f) => (
            <LinhaComLink key={f.id} href={`/admin/operacional/funcao/${f.id}`}>
              <span className="block font-semibold">{f.nome}</span>
              <span className="block truncate text-xs text-[var(--muted-foreground)]">
                {[
                  plural(f._count.processosObrigatorios, "processo obrigatório", "processos obrigatórios"),
                  plural(f._count.colaboradores, "pessoa", "pessoas"),
                ].join(" · ")}
              </span>
              {!f.descricao && <span className="block text-xs" style={{ color: "var(--warn)" }}>sem descrição das responsabilidades</span>}
            </LinhaComLink>
          ))}
        </Lista>
      )}
    </Pagina>
  );
}
