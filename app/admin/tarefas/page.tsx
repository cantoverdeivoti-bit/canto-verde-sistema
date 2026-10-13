import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { quadrosVisiveis } from "@/lib/tarefas-consulta";
import { papelEfetivo } from "@/lib/tarefas-permissoes";

import { NovoQuadro } from "./novo-quadro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quadros — Tarefas" };

/**
 * Os quadros da casa.
 *
 * É a porta do módulo, e o que ela responde é "onde está o trabalho". Cada
 * quadro é um setor ou um assunto — MANUTENÇÃO, DELIVERY, FINANCEIRO —, e o
 * que aparece ao lado do nome é o que faz alguém entrar nele: quantas estão
 * atrasadas e quantas esperam terceiro.
 *
 * Projeto privado some para quem não é membro (RF-054). Projeto aberto
 * aparece para todo mundo do módulo, e só membro escreve.
 */
export default async function QuadrosPage() {
  const user = await guardModule("tarefas");

  const agora = new Date();

  /* Os quadros, as contas de todos eles e os setores numa ida só: nenhum
     depende do outro, e cada `await` em fila era mais uma volta ao banco.
     As contas são uma consulta para todos os quadros, e não uma por quadro:
     pedir por projeto seria o N+1 clássico, e a tela é a primeira que abre. */
  const [projetos, abertasPorProjeto, atrasadasPorProjeto, setores] = await Promise.all([
    prisma.projeto.findMany({
      where: {
        arquivadoEm: null,
        ...quadrosVisiveis(user),
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: {
        setor: { select: { nome: true } },
        membros: { where: { userId: user.id }, select: { papel: true } },
        _count: { select: { membros: true } },
      },
    }),
    prisma.tarefa.groupBy({
      by: ["projetoId"],
      where: { status: "ABERTA", excluidoEm: null },
      _count: { _all: true },
    }),
    prisma.tarefa.groupBy({
      by: ["projetoId"],
      where: { status: "ABERTA", excluidoEm: null, prazo: { lt: agora } },
      _count: { _all: true },
    }),
    prisma.setor.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
  ]);

  const abertas = new Map(abertasPorProjeto.map((r) => [r.projetoId, r._count._all]));
  const atrasadas = new Map(atrasadasPorProjeto.map((r) => [r.projetoId, r._count._all]));

  // `guardModule` já devolveu a pessoa da requisição, com as permissões lidas
  // do banco. Perguntar de novo seria uma segunda consulta para a mesma
  // resposta.
  const podeCriar = can(user, "tarefas", { configure: true });

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Quadros"
        subtitulo="Um quadro por setor ou por assunto."
        ajuda="Dentro de cada um, o cartão anda pelas mesmas oito colunas. É isso que deixa comparar um quadro com o outro."
      />

      {projetos.length === 0 ? (
        <Vazio>
          {podeCriar
            ? "Nenhum quadro ainda. Crie o primeiro aqui embaixo — MANUTENÇÃO é um bom começo, porque já é o que a equipe usa hoje."
            : "Nenhum quadro para você ainda. Peça a quem administra o sistema para incluir você em um."}
        </Vazio>
      ) : (
        <ul className="space-y-2">
          {projetos.map((p) => {
            const papel = papelEfetivo(user, p.membros[0]?.papel ?? null);
            const emAtraso = atrasadas.get(p.id) ?? 0;
            return (
              <li key={p.id} className="card p-2.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/admin/tarefas/${p.id}`}
                    className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    {p.nome}
                  </Link>
                  {p.setor && <span className="text-xs text-[var(--muted-foreground)]">{p.setor.nome}</span>}
                  {papel === null && (
                    <span className="text-xs text-[var(--muted-foreground)]">só leitura — você não é membro</span>
                  )}
                  <p className="ml-auto text-sm text-[var(--muted-foreground)]">
                    {plural(abertas.get(p.id) ?? 0, "aberta", "abertas")}
                  </p>
                </div>

                {p.descricao && <p className="mt-1 text-sm">{p.descricao}</p>}

                {emAtraso > 0 && (
                  <p className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
                    {plural(emAtraso, "tarefa atrasada", "tarefas atrasadas")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {podeCriar && (
        <section>
          <h2 className="section-label">Novo quadro</h2>
          <div className="mt-3 max-w-xl">
            <NovoQuadro setores={setores} />
          </div>
        </section>
      )}
    </Pagina>
  );
}
