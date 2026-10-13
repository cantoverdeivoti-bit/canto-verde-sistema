"use server";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * A pesquisa de preço: perguntas que pegam carona na cotação.
 *
 * A rodada é a única hora da semana em que sete fornecedores estão olhando
 * para a mesma tela. A pergunta "você tem azeite trufado, e por quanto?"
 * ficava para um WhatsApp que nunca saía; aqui ela custa uma linha de texto e
 * vai junto do link que já ia ser mandado.
 *
 * Separado de `cotacao.ts` porque é outro assunto: aquele arquivo decide o
 * que a casa COMPRA, e cada linha dele vira pedido, estoque e histórico de
 * preço. Nada daqui vira compra — é informação para uma decisão que vem
 * depois, e misturar as duas coisas num arquivo só acabaria misturando-as
 * também nas telas.
 */

/** Um texto que o dono digitou. Vazio não é pergunta; enorme não é texto. */
function textoLimpo(v: unknown, maximo: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || t.length > maximo) return null;
  return t;
}

/**
 * Escrever uma pergunta nova na cotação.
 *
 * Limite de 20 por cotação. Não é medo do banco: são 20 perguntas a mais na
 * tela de CADA fornecedor, no fim de um formulário que ele já está
 * respondendo de má vontade. A curiosidade da casa não pode custar a resposta
 * de preço, que é o que paga a rodada.
 */
export async function adicionarPesquisa(
  cotacaoId: number,
  descricao: unknown,
  observacoes: unknown,
): Promise<Result<{ id: number }>> {
  await requireModule("compras");

  if (!Number.isInteger(cotacaoId) || cotacaoId <= 0) {
    return { ok: false, message: "Cotação inválida." };
  }

  const texto = textoLimpo(descricao, 200);
  if (texto === null) {
    return { ok: false, message: "Escreva o que você quer perguntar." };
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    select: {
      id: true,
      estatus: true,
      _count: { select: { pesquisaItens: true } },
    },
  });

  if (!cotacao) return { ok: false, message: "Cotação não encontrada." };

  /* Cotação aprovada não recebe pergunta nova: os links já se recusam a
     responder, e uma pergunta que ninguém pode responder é só uma linha
     morta esperando na tela. */
  if (cotacao.estatus === "APROVADA") {
    return {
      ok: false,
      message: "Esta cotação já foi fechada — os fornecedores não respondem mais.",
    };
  }

  if (cotacao._count.pesquisaItens >= 20) {
    return {
      ok: false,
      message:
        "São 20 perguntas no máximo por cotação. Cada uma aparece no fim da tela de todo fornecedor, e uma lista longa custa a resposta de preço.",
    };
  }

  try {
    const item = await prisma.pesquisaPreco.create({
      data: {
        cotacaoId,
        descricao: texto,
        observacoes: textoLimpo(observacoes, 500),
      },
      select: { id: true },
    });

    revalidatePath("/admin/compras", "layout");
    return { ok: true, data: item };
  } catch (err) {
    console.error("[adicionarPesquisa] falha:", err);
    return { ok: false, message: "Não foi possível gravar a pergunta." };
  }
}

/**
 * Apagar uma pergunta, com o que já foi respondido.
 *
 * As respostas vão junto, por `onDelete: Cascade`. É o certo: resposta sobre
 * uma pergunta que não existe mais não é histórico de nada, e nada aqui virou
 * compra. Quem quiser guardar o que descobriu cadastra o produto.
 */
export async function removerPesquisa(pesquisaId: number): Promise<Result<null>> {
  await requireModule("compras");

  if (!Number.isInteger(pesquisaId) || pesquisaId <= 0) {
    return { ok: false, message: "Pergunta inválida." };
  }

  try {
    await prisma.pesquisaPreco.delete({ where: { id: pesquisaId } });
    revalidatePath("/admin/compras", "layout");
    return { ok: true, data: null };
  } catch {
    // Apagar o que já não existe é o resultado que ele queria. Dois cliques
    // no mesmo botão não são um erro que valha uma tarja vermelha.
    return { ok: true, data: null };
  }
}

/** O que o fornecedor mandou sobre uma pergunta. */
export type RespostaPesquisa = {
  pesquisaId: number;
  temProduto: boolean;
  precoUnitario?: unknown;
  embalagem?: unknown;
  marca?: unknown;
  observacoes?: unknown;
};

/**
 * O fornecedor responde à pesquisa, pelo mesmo link da cotação.
 *
 * Sem login, como `salvarResposta` — o token é a credencial. E separada dela
 * de propósito: o preço dos itens é o que paga a rodada, e uma falha ao
 * gravar uma curiosidade não pode derrubar a resposta de preço que ele acabou
 * de digitar. São dois botões na tela dele pela mesma razão.
 *
 * Tudo ou nada dentro da pesquisa: todas as linhas são validadas antes de
 * qualquer escrita, como em toda resposta de fornecedor deste projeto.
 *
 * `upsert` e não `create`: ele volta ao link e corrige o que disse, e a chave
 * única (pergunta, fornecedor) existe justamente para não haver duas versões
 * e a dúvida de qual vale.
 */
export async function responderPesquisa(
  token: string,
  respostas: RespostaPesquisa[],
): Promise<Result<{ gravadas: number }>> {
  try {
    const chamado = await prisma.cotacaoFornecedor.findUnique({
      where: { token },
      select: {
        id: true,
        cotacao: {
          select: {
            estatus: true,
            pesquisaItens: { select: { id: true } },
          },
        },
      },
    });

    if (!chamado) return { ok: false, message: "Link expirado ou inválido" };
    if (chamado.cotacao.estatus === "APROVADA") {
      return {
        ok: false,
        message: "Esta cotação já foi fechada. Obrigado pela resposta!",
      };
    }

    const daCotacao = new Set(chamado.cotacao.pesquisaItens.map((p) => p.id));

    const entradas: Array<{
      pesquisaId: number;
      temProduto: boolean;
      precoUnitario: Prisma.Decimal | null;
      embalagem: string | null;
      marca: string | null;
      observacoes: string | null;
    }> = [];

    for (const r of Array.isArray(respostas) ? respostas.slice(0, 100) : []) {
      if (!daCotacao.has(r.pesquisaId)) {
        return { ok: false, message: "Uma das perguntas não é desta cotação." };
      }
      if (typeof r.temProduto !== "boolean") {
        return { ok: false, message: "Diga se você tem o produto." };
      }

      /* Preço opcional mesmo dizendo que tem: é o caso real de quem vende mas
         precisa consultar. Obrigá-lo a inventar um número para conseguir
         mandar a resposta trocaria "não sei" por um preço falso, que é a
         única coisa pior que não saber. */
      let preco: Prisma.Decimal | null = null;
      if (r.temProduto && r.precoUnitario !== undefined && r.precoUnitario !== null) {
        const bruto = String(r.precoUnitario).trim().replace(",", ".");
        if (bruto !== "") {
          const n = Number(bruto);
          if (!Number.isFinite(n) || n <= 0) {
            return { ok: false, message: "O preço precisa ser um número maior que zero." };
          }
          preco = new Prisma.Decimal(n.toFixed(2));
        }
      }

      entradas.push({
        pesquisaId: r.pesquisaId,
        temProduto: r.temProduto,
        // Quem não tem não descreve embalagem nem marca de coisa nenhuma.
        precoUnitario: r.temProduto ? preco : null,
        embalagem: r.temProduto ? textoLimpo(r.embalagem, 120) : null,
        marca: r.temProduto ? textoLimpo(r.marca, 120) : null,
        observacoes: textoLimpo(r.observacoes, 500),
      });
    }

    if (entradas.length === 0) {
      return { ok: false, message: "Responda ao menos uma pergunta." };
    }

    await prisma.$transaction(async (tx) => {
      for (const e of entradas) {
        const { pesquisaId, ...campos } = e;
        await tx.pesquisaResposta.upsert({
          where: {
            pesquisaId_cotacaoFornecedorId: {
              pesquisaId,
              cotacaoFornecedorId: chamado.id,
            },
          },
          create: { pesquisaId, cotacaoFornecedorId: chamado.id, ...campos },
          update: campos,
        });
      }
    });

    revalidatePath("/admin/compras", "layout");
    return { ok: true, data: { gravadas: entradas.length } };
  } catch (err) {
    console.error("[responderPesquisa] falha:", err);
    return { ok: false, message: "Não foi possível gravar a resposta." };
  }
}
