import { prisma } from "@/lib/db";
import { receituarioComCustos } from "@/lib/receituario-dados";

/**
 * A ponte entre o Receituário e o Cardápio buffet: o prato do buffet aponta
 * para a ficha pelo código ("264C", campo `codFicha`), e o custo por kg do
 * prato passa a ser o da ficha.
 *
 * O custo/kg continua guardado no prato (e não calculado na hora) porque o
 * peso do dia o congela e os relatórios o leem direto no banco. Quem o
 * atualiza é `recalcularCustosDoBuffet`, depois de mudar ficha ou insumo e
 * todo dia de manhã (a compra recebida muda o preço dos insumos).
 */

/** O custo por kg pronto de cada ficha, pelo código. */
export async function custoKgPorCodigo(): Promise<Map<string, { nome: string; porKg: number | null; semPreco: number }>> {
  const { fichas, custoDasFichas } = await receituarioComCustos();
  return new Map(
    fichas.map((f) => {
      const c = custoDasFichas.get(f.id)!;
      return [f.codigo, { nome: f.nome, porKg: c.porKg, semPreco: c.semPreco }];
    }),
  );
}

/** Põe em cada prato ligado o custo/kg de hoje da ficha. Devolve quantos mudaram. */
export async function recalcularCustosDoBuffet(): Promise<number> {
  const [custos, pratos] = await Promise.all([
    custoKgPorCodigo(),
    prisma.pratoBuffet.findMany({ where: { codFicha: { not: null } }, select: { id: true, codFicha: true, custoKg: true } }),
  ]);
  const mudar = pratos.flatMap((p) => {
    const c = custos.get(p.codFicha!.trim().toUpperCase());
    if (!c || c.porKg === null) return [];
    const novo = Math.round(c.porKg * 10000) / 10000;
    return p.custoKg !== null && Math.abs(Number(p.custoKg) - novo) < 0.0001 ? [] : [{ id: p.id, custoKg: novo }];
  });
  if (mudar.length > 0) {
    await prisma.$transaction(mudar.map((m) => prisma.pratoBuffet.update({ where: { id: m.id }, data: { custoKg: m.custoKg } })));
  }
  return mudar.length;
}

/** Depois de mudar ficha ou insumo: atualiza o buffet sem derrubar quem salvou. */
export async function atualizarBuffetSemFalhar() {
  try {
    await recalcularCustosDoBuffet();
  } catch (err) {
    console.error("[receituario] não atualizou o custo do buffet:", err);
  }
}
