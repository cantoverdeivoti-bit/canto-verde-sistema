import { prisma } from "@/lib/db";
import { receituarioComCustos } from "@/lib/receituario-dados";
import { precoNaUnidade } from "@/lib/receituario-regras";

/**
 * As fichas como saem no papel: a folha de `/imprimir/receituario` e o PDF
 * (`lib/pdf/ficha-pdf.ts`) leem daqui, e por isso mostram o mesmo.
 */

/** As fichas para imprimir, com tudo o que a folha mostra, na ordem do código. */
export async function fichasParaImprimir(where: { codigo?: string; categoria?: string; operacao?: string }) {
  const fichas = await prisma.fichaTecnica.findMany({
    where: {
      ativo: true,
      ...(where.codigo ? { codigo: where.codigo } : {}),
      ...(where.categoria ? { categoria: where.categoria } : {}),
      ...(where.operacao ? { operacoes: { has: where.operacao } } : {}),
    },
    orderBy: { codigo: "asc" },
    include: {
      foto: { select: { updatedAt: true } },
      ingredientes: {
        orderBy: { ordem: "asc" },
        include: { insumo: { select: { nome: true } }, subFicha: { select: { codigo: true, nome: true } } },
      },
    },
  });
  const { custoDasFichas, custosDosInsumos, config } = await receituarioComCustos();
  return fichas.map((f) => ({
    ficha: f,
    custo: custoDasFichas.get(f.id)!,
    config,
    // O preço de cada ingrediente (R$/kg, /L ou /un), para a ficha técnica.
    precos: f.ingredientes.map((l) => {
      if (l.insumoId) {
        const c = custosDosInsumos.get(l.insumoId);
        return c ? precoNaUnidade(c.liquido, c.unidadeUso) : null;
      }
      if (l.subFichaId) return precoNaUnidade(custoDasFichas.get(l.subFichaId)?.porUnidade ?? null, l.unidade ?? "g");
      return null;
    }),
  }));
}

/** Operacional: a da cozinha, sem valor nenhum. Técnica: a da gestão, com os custos e sem o preparo. */
export type TipoDeFicha = "operacional" | "tecnica";

export type FichaParaImprimir = Awaited<ReturnType<typeof fichasParaImprimir>>[number];

