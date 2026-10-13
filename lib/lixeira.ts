import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * A lixeira do painel (`ItemNaLixeira`). Apagar um lançamento, um insumo ou
 * uma entrega de EPI tira a linha da tabela dela, como antes (os relatórios
 * não precisam saber de lixeira nenhuma), e guarda a linha inteira aqui por
 * 30 dias. Restaurar a põe de volta com o mesmo id.
 *
 * As tarefas têm a lixeira delas (`Tarefa.excluidoEm`).
 */

export type TipoNaLixeira = "lancamento" | "insumo" | "entregaDeEpi" | "vendaDaFicha";

/** De quem é cada tipo: quem pode ver e restaurar. O insumo pede quem configura o Receituário, como o apagar. */
export const DONO_DO_TIPO: Record<TipoNaLixeira, { modulo: string; configurar: boolean; nome: string; volta: string }> = {
  lancamento: { modulo: "financeiro", configurar: false, nome: "Lançamento", volta: "/admin/financeiro" },
  insumo: { modulo: "receituario", configurar: true, nome: "Insumo", volta: "/admin/receituario/insumos" },
  entregaDeEpi: { modulo: "pessoal", configurar: false, nome: "Entrega de EPI", volta: "/admin/pessoal/epi" },
  vendaDaFicha: { modulo: "receituario", configurar: true, nome: "Item da lista de preços", volta: "/admin/receituario/precos" },
};

export const DIAS_NA_LIXEIRA = 30;

/** Quantos dias faltam para o item sumir da lixeira (pelo menos 1). */
export function diasQueFaltam(apagadoEm: Date, agora = Date.now()): number {
  return Math.max(1, DIAS_NA_LIXEIRA - Math.floor((agora - apagadoEm.getTime()) / 86_400_000));
}

/**
 * A linha em JSON sem perder nada: data, número decimal e arquivo ganham uma
 * marca e voltam ao tipo certo em `decodificar`.
 */
export function codificar(valor: unknown): Prisma.InputJsonValue {
  if (valor === null || valor === undefined) return null as unknown as Prisma.InputJsonValue;
  if (valor instanceof Date) return { $d: valor.toISOString() };
  if (Prisma.Decimal.isDecimal(valor)) return { $n: (valor as Prisma.Decimal).toString() };
  if (valor instanceof Uint8Array) return { $b: Buffer.from(valor).toString("base64") };
  if (Array.isArray(valor)) return valor.map(codificar);
  if (typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, codificar(v)]));
  }
  return valor as Prisma.InputJsonValue;
}

export function decodificar(valor: unknown): unknown {
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(decodificar);
  const o = valor as Record<string, unknown>;
  if (typeof o.$d === "string" && Object.keys(o).length === 1) return new Date(o.$d);
  if (typeof o.$n === "string" && Object.keys(o).length === 1) return o.$n;
  if (typeof o.$b === "string" && Object.keys(o).length === 1) return Buffer.from(o.$b, "base64");
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decodificar(v)]));
}

/** Guarda na lixeira, dentro da mesma transação que apaga. Devolve o id para o Desfazer. */
export async function guardarNaLixeira(
  tx: Prisma.TransactionClient,
  item: { tipo: TipoNaLixeira; rotulo: string; dados: unknown; apagadoPor: string | null },
): Promise<number> {
  const { id } = await tx.itemNaLixeira.create({
    data: {
      tipo: item.tipo,
      modulo: DONO_DO_TIPO[item.tipo].modulo,
      rotulo: item.rotulo.slice(0, 200),
      dados: codificar(item.dados),
      apagadoPor: item.apagadoPor?.slice(0, 80) ?? null,
    },
    select: { id: true },
  });
  return id;
}

/** Esvazia o que passou de 30 dias. Chamada ao abrir a lixeira e a cada item novo. */
export async function esvaziarVencidos() {
  const limite = new Date(Date.now() - DIAS_NA_LIXEIRA * 24 * 60 * 60 * 1000);
  await prisma.itemNaLixeira.deleteMany({ where: { apagadoEm: { lt: limite } } });
}
