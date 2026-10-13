"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { mensagemDeMesFechado } from "@/lib/financeiro-dados";
import { DONO_DO_TIPO, decodificar, type TipoNaLixeira } from "@/lib/lixeira";

type Simples = { ok: boolean; message?: string };

/**
 * Tira da lixeira e põe de volta onde estava, com o mesmo id. Quem restaura
 * precisa da mesma permissão de quem apagou.
 */
export async function restaurarDaLixeira(id: number): Promise<Simples> {
  const item = await prisma.itemNaLixeira.findUnique({ where: { id } });
  if (!item) return { ok: false, message: "Isso já saiu da lixeira." };
  const tipo = item.tipo as TipoNaLixeira;
  const dono = DONO_DO_TIPO[tipo];
  if (!dono) return { ok: false, message: "Tipo desconhecido na lixeira." };
  await requireModule(dono.modulo, dono.configurar ? { configure: true } : undefined);
  const dados = decodificar(item.dados) as Record<string, unknown>;

  try {
    if (tipo === "lancamento") {
      const { anexos, ...l } = dados as { anexos: Record<string, unknown>[] } & Record<string, unknown>;
      // O mês pode ter sido fechado depois de apagar: aí não volta.
      const competencia = (l.competencia as Date).toISOString().slice(0, 10);
      const fechado = await mensagemDeMesFechado([competencia]);
      if (fechado) return { ok: false, message: fechado };
      await prisma.$transaction([
        prisma.lancamento.create({
          data: {
            ...(l as Prisma.LancamentoUncheckedCreateInput),
            // O lancamentoId sai: o Prisma liga cada anexo ao lançamento recriado.
            anexos: { create: anexos.map((a) => ({ ...a, lancamentoId: undefined }) as unknown as Prisma.AnexoFinanceiroUncheckedCreateWithoutLancamentoInput) },
          },
        }),
        prisma.itemNaLixeira.delete({ where: { id } }),
      ]);
    } else if (tipo === "vendaDaFicha") {
      const { venda, extras, derivadas } = dados as {
        venda: Prisma.VendaDaFichaUncheckedCreateInput;
        extras: Prisma.ExtraDaVendaUncheckedCreateInput[];
        derivadas: number[];
      };
      await prisma.$transaction([
        prisma.vendaDaFicha.create({ data: venda }),
        prisma.extraDaVenda.createMany({ data: extras }),
        // O delivery que partia dela volta a partir dela.
        prisma.vendaDaFicha.updateMany({ where: { id: { in: derivadas }, baseId: null }, data: { baseId: venda.id } }),
        prisma.itemNaLixeira.delete({ where: { id } }),
      ]);
    } else if (tipo === "insumo") {
      await prisma.$transaction([
        prisma.insumoReceita.create({ data: dados as Prisma.InsumoReceitaUncheckedCreateInput }),
        prisma.itemNaLixeira.delete({ where: { id } }),
      ]);
    } else {
      const { entrega, anterior } = dados as {
        entrega: Prisma.EntregaDeEpiUncheckedCreateInput;
        anterior: { id: number; substituidaEm: Date | null } | null;
      };
      await prisma.$transaction([
        prisma.entregaDeEpi.create({ data: entrega }),
        // A entrega anterior volta a estar substituída por esta.
        ...(anterior
          ? [prisma.entregaDeEpi.updateMany({ where: { id: anterior.id }, data: { substituidaEm: anterior.substituidaEm } })]
          : []),
        prisma.itemNaLixeira.delete({ where: { id } }),
      ]);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, message: "Já existe outro com o mesmo código. Mude o código dele antes de restaurar." };
      if (error.code === "P2003") return { ok: false, message: "Algo de que ele dependia (conta, categoria, pessoa, item) foi apagado. Não dá para restaurar." };
    }
    console.error("[restaurarDaLixeira] falha:", error);
    return { ok: false, message: "Não foi possível restaurar. Tente de novo." };
  }

  revalidatePath(dono.volta, "layout");
  revalidatePath("/admin/sistema/lixeira");
  return { ok: true };
}
