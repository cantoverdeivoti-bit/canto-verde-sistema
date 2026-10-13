import { CabecalhoDaPagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { buscarTarefas, quadrosVisiveis } from "@/lib/tarefas-consulta";
import { situacaoDoPrazo } from "@/lib/tarefas-labels";
import { quadranteDe } from "@/lib/tarefas-matriz";

import { Matriz, type CartaoMatriz } from "./matriz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Matriz — Tarefas" };

/**
 * A matriz de Eisenhower: urgente contra importante.
 *
 * O TickTick monta os quadrantes só pela prioridade — alta vira "urgente e
 * importante", média vira "importante", e assim por diante. Isso não é uma
 * matriz: é a lista de prioridades desenhada em quatro caixas, e as duas
 * perguntas viram uma só.
 *
 * Aqui os dois eixos são coisas diferentes, porque a tarefa tem as duas:
 *
 *   IMPORTANTE  é a prioridade que alguém escolheu — alta ou média.
 *   URGENTE     é o relógio: atrasada, vence hoje ou vence amanhã.
 *
 * É o que faz o quadrante de cima à esquerda ser o que ele promete ser — o que
 * é grave E está estourando — em vez de "tudo que alguém marcou de vermelho".
 *
 * A regra fica escrita na tela. Um quadro que classifica o trabalho de alguém
 * sem dizer por quê é um quadro em que ninguém confia.
 */
export default async function MatrizPage({ searchParams }: PageProps<"/admin/tarefas/matriz">) {
  const user = await guardModule("tarefas");
  const { projeto, minhas } = await searchParams;

  const n = Number(Array.isArray(projeto) ? projeto[0] : projeto);
  const projetoId = Number.isInteger(n) && n > 0 ? n : null;
  const soMinhas = (Array.isArray(minhas) ? minhas[0] : minhas) === "1";

  const [tarefas, { capacity }, quadros] = await Promise.all([
    buscarTarefas(user, {
      projetoId,
      responsavelId: soMinhas ? user.id : null,
      limite: 500,
    }),
    getSettings(),
    prisma.projeto.findMany({
      where: { arquivadoEm: null, ...quadrosVisiveis(user) },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  const agora = new Date();
  const timezone = capacity.timezone;

  const cartoes: CartaoMatriz[] = tarefas.map((t) => {
    const prazo = situacaoDoPrazo(t.prazo, t.prazoDiaInteiro, timezone, agora);
    return {
      id: t.id,
      titulo: t.titulo,
      quadro: t.projeto.nome,
      coluna: t.coluna.nome,
      responsavel: t.responsavel?.name ?? t.responsavel?.username ?? null,
      prioridade: t.prioridade,
      prazo,
      quadrante: quadranteDe(t.prioridade, prazo),
    };
  });

  return (
    <div>
      <CabecalhoDaPagina
        titulo="Matriz"
        subtitulo="As tarefas abertas por urgência e importância."
        ajuda={
          <>
            São duas perguntas que não são a mesma: <strong className="font-semibold">está estourando?</strong> e{" "}
            <strong className="font-semibold">importa?</strong> Serve para achar o que está gritando sem ser grave, e o que é
            grave e ainda não gritou.
          </>
        }
      />

      <Matriz
        cartoes={cartoes}
        quadros={quadros}
        projetoId={projetoId}
        soMinhas={soMinhas}
      />
    </div>
  );
}
