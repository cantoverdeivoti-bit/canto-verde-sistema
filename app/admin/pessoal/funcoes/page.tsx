import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { can } from "@/lib/roles";

import { ListaDeFuncoes } from "./lista-de-funcoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funções · Departamento pessoal" };

/**
 * O cadastro das funções da casa. É a lista que aparece no colaborador e na
 * aprovação do cadastro pelo link, no lugar de cada um escrever de um jeito.
 */
export default async function FuncoesPage() {
  const user = await guardModule("pessoal");
  const podeConfigurar = can(user, "pessoal", { configure: true });

  const funcoes = await prisma.funcao.findMany({
    select: {
      id: true,
      nome: true,
      ativo: true,
      _count: { select: { colaboradores: { where: { ativo: true, pendente: false } } } },
    },
  });
  const itens = funcoes
    .map((f) => ({ id: f.id, nome: f.nome, ativo: f.ativo, pessoas: f._count.colaboradores }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Funções"
        subtitulo={
          <>
            {plural(itens.filter((f) => f.ativo).length, "função ligada", "funções ligadas")}. É a lista que aparece no cadastro do
            colaborador.
          </>
        }
      />
      {can(user, "operacional") && (
        <p className="text-sm">
          As tarefas, os processos e o treinamento de cada função ficam no{" "}
          <Link href="/admin/operacional" className="text-[var(--primary)] underline underline-offset-4">
            Operacional
          </Link>
          .
        </p>
      )}
      <ListaDeFuncoes itens={itens} podeConfigurar={podeConfigurar} />
    </Pagina>
  );
}
