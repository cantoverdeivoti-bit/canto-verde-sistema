import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";

import { EditorDaFuncao } from "./editor-da-funcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Função · Operacional" };

/**
 * Uma função: as responsabilidades, os processos que ela precisa saber e
 * quem tem a função hoje. As tarefas para pendurar no lugar moram em
 * Checklists, em listas soltas.
 */
export default async function FuncaoOperacionalPage({ params }: PageProps<"/admin/operacional/funcao/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [user, funcao, processos] = await Promise.all([
    guardModule("operacional"),
    prisma.funcao.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        descricao: true,
        processosObrigatorios: { select: { processoId: true } },
        colaboradores: {
          where: { ativo: true, pendente: false },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, apelido: true },
        },
      },
    }),
    prisma.processo.findMany({ where: { ativo: true }, orderBy: { titulo: "asc" }, select: { id: true, titulo: true } }),
  ]);
  if (!funcao) notFound();

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo={funcao.nome} voltar={{ href: "/admin/operacional", texto: "Funções" }} />
      <EditorDaFuncao
        funcao={{ id: funcao.id, descricao: funcao.descricao ?? "" }}
        processos={processos}
        obrigatorios={funcao.processosObrigatorios.map((o) => o.processoId)}
        podeMudar={can(user, "operacional", { configure: true })}
      />
      <section>
        <h2 className="section-label mb-2">Quem tem esta função</h2>
        {funcao.colaboradores.length === 0 ? (
          <Vazio>Ninguém ativo com esta função.</Vazio>
        ) : (
          <p className="text-sm">{funcao.colaboradores.map((c) => c.apelido ?? c.nome).join(", ")}</p>
        )}
      </section>
    </Pagina>
  );
}
