"use server";

import { revalidatePath } from "next/cache";

import { registrarChegadaSemPedido } from "@/lib/actions/pedido";
import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { chave as normalizar } from "@/lib/format";
import { buscarNota, linkDaNota, type ItemDaNota, type NotaDoMercado } from "@/lib/nfce";
import { Prisma } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * A compra de mercado pelo QR Code da nota: ler, vincular e dar entrada.
 *
 * O dono achava trabalho demais digitar item por item a compra do mercado
 * no pedido manual. Agora ele aponta a câmera para o QR do cupom, a nota vem
 * com os itens, e ele só diz qual produto da casa é cada um. O vínculo fica
 * lembrado (`VinculoNota`), e na próxima nota do mesmo mercado os itens já
 * vêm ligados. A entrada é uma "compra no balcão" (decisão do dono): o
 * estoque sobe na hora, pelo preço da nota.
 */

/** O que identifica o item no mesmo mercado: o código, ou a descrição sem acento. */
function chaveDoItem(i: Pick<ItemDaNota, "codigo" | "descricao">): string {
  return (i.codigo ?? `d:${normalizar(i.descricao).replace(/\s+/g, " ")}`).slice(0, 160);
}

/** Código que parece código de barras (EAN): vale em qualquer mercado. */
const pareceEan = (codigo: string | null) => codigo !== null && /^(\d{8}|\d{12,14})$/.test(codigo);

export type VinculoSugerido = {
  /** Nulo: "não é da casa", lembrado. */
  produtoId: number | null;
  fator: number;
  /** De onde veio: deste mercado, ou do mesmo código de barras em outro. */
  origem: "este-mercado" | "codigo-de-barras";
};

export type NotaLida = {
  nota: NotaDoMercado;
  /** O fornecedor com o CNPJ da nota, se já existe. */
  fornecedor: { id: number; nome: string } | null;
  /** Esta nota já deu entrada: o número da entrada. */
  jaLancada: number | null;
  /** Por linha da nota. */
  vinculos: Record<number, VinculoSugerido>;
};

/** Lê o QR, busca a nota no site da Receita e junta o que a casa já sabe dela. */
export async function lerNotaDoMercado(textoDoQr: string): Promise<Result<NotaLida>> {
  await requireModule("compras", { atalho: true });

  const link = linkDaNota(String(textoDoQr ?? ""));
  if (!link) {
    return { ok: false, message: "Este QR não é de nota fiscal de consumidor (NFC-e). Aponte para o QR do cupom." };
  }

  let nota: NotaDoMercado | null;
  try {
    nota = await buscarNota(link.link, link.chave);
  } catch (err) {
    console.error("[lerNotaDoMercado] falha ao buscar:", err);
    return { ok: false, message: "O site da Receita não respondeu. Tente de novo em instantes." };
  }
  if (!nota) {
    return {
      ok: false,
      message: "O site da Receita abriu, mas sem os itens desta nota. Notas muito recentes às vezes demoram alguns minutos para aparecer.",
    };
  }

  const cnpj = nota.emitente.cnpj;
  const chaves = nota.itens.map(chaveDoItem);
  const eans = nota.itens.filter((i) => pareceEan(i.codigo)).map((i) => i.codigo!);
  const [lancada, fornecedores, deste, porEan] = await Promise.all([
    prisma.pedidoCompra.findUnique({ where: { notaChave: link.chave }, select: { id: true } }),
    // Poucos fornecedores, e o CNPJ pode estar gravado com ou sem pontuação.
    cnpj === ""
      ? Promise.resolve([])
      : prisma.supplier.findMany({
          where: { taxId: { not: null }, isActive: true },
          select: { id: true, name: true, apelido: true, taxId: true },
        }),
    cnpj === ""
      ? Promise.resolve([])
      : prisma.vinculoNota.findMany({
          where: { emitenteCnpj: cnpj, chave: { in: chaves } },
          select: { chave: true, produtoId: true, fator: true, produto: { select: { isActive: true } } },
        }),
    eans.length === 0
      ? Promise.resolve([])
      : prisma.vinculoNota.findMany({
          where: { chave: { in: eans }, produtoId: { not: null }, produto: { isActive: true } },
          orderBy: { updatedAt: "desc" },
          select: { chave: true, produtoId: true, fator: true },
        }),
  ]);

  const fornecedor = fornecedores.find((f) => (f.taxId ?? "").replace(/\D/g, "") === cnpj) ?? null;
  const desteMercado = new Map(deste.map((v) => [v.chave, v]));
  const outroMercado = new Map<string, (typeof porEan)[number]>();
  for (const v of porEan) if (!outroMercado.has(v.chave)) outroMercado.set(v.chave, v);

  const vinculos: Record<number, VinculoSugerido> = {};
  for (const item of nota.itens) {
    const v = desteMercado.get(chaveDoItem(item));
    // Vínculo de produto que foi desativado não vale mais: volta a pedir.
    if (v && (v.produtoId === null || v.produto?.isActive)) {
      vinculos[item.linha] = { produtoId: v.produtoId, fator: v.fator.toNumber(), origem: "este-mercado" };
      continue;
    }
    const e = item.codigo ? outroMercado.get(item.codigo) : undefined;
    if (e) vinculos[item.linha] = { produtoId: e.produtoId, fator: e.fator.toNumber(), origem: "codigo-de-barras" };
  }

  return {
    ok: true,
    data: {
      nota,
      fornecedor: fornecedor ? { id: fornecedor.id, nome: fornecedor.apelido ?? fornecedor.name } : null,
      jaLancada: lancada?.id ?? null,
      vinculos,
    },
  };
}

export type LancamentoDaNota = {
  chave: string;
  emitente: { nome: string; cnpj: string };
  /** Nulo: cadastra o mercado como fornecedor, pelo nome e CNPJ da nota. */
  fornecedorId: number | null;
  itens: {
    codigo: string | null;
    descricao: string;
    quantidade: number;
    valorTotal: number;
    /** Nulo: "não é da casa". */
    produtoId: number | null;
    /** Quantas unidades da casa em uma unidade da nota. */
    fator: number;
  }[];
};

/**
 * Guarda os vínculos e dá entrada no que é da casa, como compra no balcão.
 *
 * O preço de cada produto sai do total da linha (já com desconto) dividido
 * pelo que entrou na unidade da casa. Duas linhas da nota no mesmo produto
 * (duas bandejas de tomate) viram uma linha só, pela soma.
 */
export async function lancarNotaDoMercado(dados: LancamentoDaNota): Promise<Result<{ id: number }>> {
  await requireModule("compras", { atalho: true });

  const chave = String(dados?.chave ?? "");
  const cnpj = String(dados?.emitente?.cnpj ?? "").replace(/\D/g, "");
  const nome = String(dados?.emitente?.nome ?? "").trim().slice(0, 120);
  if (!/^\d{44}$/.test(chave)) return { ok: false, message: "Nota fiscal inválida." };
  if (!/^\d{14}$/.test(cnpj)) return { ok: false, message: "A nota veio sem o CNPJ do mercado." };
  if (!Array.isArray(dados.itens) || dados.itens.length === 0 || dados.itens.length > 300) {
    return { ok: false, message: "A nota veio sem itens." };
  }

  const porProduto = new Map<number, { quantidade: number; valor: number }>();
  for (const i of dados.itens) {
    const fator = Number(i.fator);
    if (i.produtoId !== null && (!Number.isInteger(i.produtoId) || !(fator > 0) || fator > 100000)) {
      return { ok: false, message: `Confira o vínculo de "${i.descricao}".` };
    }
    if (!(Number(i.quantidade) > 0) || !(Number(i.valorTotal) >= 0)) {
      return { ok: false, message: `A linha "${i.descricao}" veio sem quantidade ou valor.` };
    }
    if (i.produtoId === null) continue;
    const antes = porProduto.get(i.produtoId) ?? { quantidade: 0, valor: 0 };
    porProduto.set(i.produtoId, {
      quantidade: antes.quantidade + Number(i.quantidade) * fator,
      valor: antes.valor + Number(i.valorTotal),
    });
  }
  if (porProduto.size === 0) {
    return { ok: false, message: "Nenhum item desta nota é da casa: não há o que dar entrada." };
  }
  for (const [, v] of porProduto) {
    if (!(v.valor > 0)) return { ok: false, message: "Um item da casa veio com valor zero na nota." };
  }

  try {
    // O mercado como fornecedor: o que já tem este CNPJ, ou um novo.
    let fornecedorId = dados.fornecedorId;
    if (fornecedorId === null) {
      const existentes = await prisma.supplier.findMany({
        where: { taxId: { not: null } },
        select: { id: true, taxId: true },
      });
      fornecedorId =
        existentes.find((f) => (f.taxId ?? "").replace(/\D/g, "") === cnpj)?.id ??
        (
          await prisma.supplier.create({
            data: { name: nome || `Mercado ${cnpj}`, taxId: cnpj, isActive: true },
            select: { id: true },
          })
        ).id;
    }

    // Os vínculos primeiro: mesmo se a entrada falhar, o trabalho de vincular
    // fica guardado para a próxima tentativa.
    await prisma.$transaction(
      dados.itens.map((i) => {
        const k = chaveDoItem(i);
        const valores = {
          descricao: String(i.descricao).slice(0, 160),
          produtoId: i.produtoId,
          fator: new Prisma.Decimal(i.produtoId === null ? 1 : Number(i.fator)),
        };
        return prisma.vinculoNota.upsert({
          where: { emitenteCnpj_chave: { emitenteCnpj: cnpj, chave: k } },
          create: { emitenteCnpj: cnpj, chave: k, ...valores },
          update: valores,
        });
      }),
    );

    const r = await registrarChegadaSemPedido(
      fornecedorId,
      "BALCAO",
      [...porProduto].map(([produtoId, v]) => ({
        produtoId,
        quantidade: Math.round(v.quantidade * 1000) / 1000,
        precoUnitario: Math.round((v.valor / v.quantidade) * 10000) / 10000,
      })),
      null,
      chave,
    );
    if (r.ok) revalidatePath("/admin/compras", "layout");
    return r;
  } catch (err) {
    console.error("[lancarNotaDoMercado] falha:", err);
    return { ok: false, message: "Não foi possível dar entrada na nota." };
  }
}
