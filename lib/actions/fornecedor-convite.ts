"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { supplierSelfRegistrationSchema } from "@/lib/validations";

/** Convite vale um mês. Passado disso é link velho circulando por aí. */
const DIAS_DE_VALIDADE = 30;

export type ConviteResult =
  | { ok: true; token: string }
  | { ok: false; message: string };

/**
 * Cria um convite para um fornecedor preencher o próprio cadastro.
 *
 * Um convite por fornecedor, não um link aberto: quem recebe foi você quem
 * escolheu, então o cadastro pode entrar já valendo — a aprovação aconteceu
 * quando você mandou o link, não depois.
 */
export async function criarConvite(label: string): Promise<ConviteResult> {
  await requireModule("compras");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DIAS_DE_VALIDADE);

  try {
    const convite = await prisma.supplierInvite.create({
      data: { label: label.trim() || null, expiresAt },
      select: { token: true },
    });
    revalidatePath("/admin/compras", "layout");
    return { ok: true, token: convite.token };
  } catch (error) {
    console.error("[criarConvite] falha:", error);
    return { ok: false, message: "Não consegui criar o convite." };
  }
}

export async function cancelarConvite(id: number) {
  await requireModule("compras");
  // Apagar é certo aqui: convite não usado não é histórico de nada.
  await prisma.supplierInvite.delete({ where: { id } }).catch(() => null);
  revalidatePath("/admin/compras", "layout");
  return { ok: true };
}

export type CadastroResult =
  | { ok: true; nome: string }
  | { ok: false; message: string };

/**
 * O fornecedor preenchendo o próprio cadastro. SEM LOGIN — a porta é o token.
 *
 * Mesma escolha do cancelamento de reserva: o segredo no endereço é o que
 * autoriza, e ele é aleatório, serve uma vez e vence. Por isso a checagem de
 * validade acontece dentro da transação junto da escrita: entre conferir e
 * gravar, dois envios do mesmo link poderiam criar dois fornecedores.
 */
export async function enviarCadastro(
  token: string,
  raw: unknown,
): Promise<CadastroResult> {
  const parsed = supplierSelfRegistrationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Confira os dados.",
    };
  }

  const d = parsed.data;

  try {
    const nome = await prisma.$transaction(async (tx) => {
      const convite = await tx.supplierInvite.findUnique({ where: { token } });

      if (!convite) throw new ConviteInvalido("Este link não existe.");
      if (convite.usedAt) {
        throw new ConviteInvalido("Este link já foi usado.");
      }
      if (convite.expiresAt < new Date()) {
        throw new ConviteInvalido("Este link venceu. Peça um novo.");
      }

      // Porta pública: os ids de categoria vieram do navegador, então valem
      // o que o banco confirmar. Filtrar antes de gravar troca um erro de
      // chave estrangeira — que abortaria o cadastro inteiro — por ignorar
      // em silêncio o que não existe.
      const validas = await tx.category.findMany({
        where: { id: { in: d.categoryIds } },
        select: { id: true },
      });

      if (validas.length === 0) {
        throw new ConviteInvalido(
          "As categorias escolhidas não existem mais. Recarregue a página.",
        );
      }

      const supplier = await tx.supplier.create({
        data: {
          name: d.name,
          contactName: d.contactName,
          phone: d.phone,
          deliveryDays: d.deliveryDays,
          // Os três que o formulário pede e antes se perdiam aqui.
          deliveryWeekdays: d.deliveryWeekdays,
          paymentTerms: d.paymentTerms,
          minOrder: d.minOrder,
          notes: d.notes,
          selfRegistered: true,
          categories: {
            create: validas.map((c) => ({ categoryId: c.id })),
          },
        },
        select: { id: true, name: true },
      });

      await tx.supplierInvite.update({
        where: { id: convite.id },
        data: { usedAt: new Date(), supplierId: supplier.id },
      });

      return supplier.name;
    });

    // Sem revalidar, de propósito — as outras ações do módulo revalidam, esta
    // não pode. Quem chama aqui é o fornecedor, não o dono: revalidar limpa o
    // cache do navegador de quem enviou, e ninguém mais, então não adianta
    // nada para a lista do dono (que é `force-dynamic` e já nasce fresca a
    // cada visita). O preço, esse é real: revalidar faz o Next renderizar de
    // novo a página atual, o convite agora consta como usado, e o fornecedor
    // recebe "este cadastro já foi enviado" no lugar do agradecimento — como
    // se tivesse sido recusado logo depois de acertar.
    return { ok: true, nome };
  } catch (error) {
    if (error instanceof ConviteInvalido) {
      return { ok: false, message: error.message };
    }
    console.error("[enviarCadastro] falha:", error);
    return {
      ok: false,
      message: "Não consegui registrar o cadastro. Tente novamente.",
    };
  }
}

/** Erro de domínio, para separar "link ruim" de "deu problema no servidor". */
class ConviteInvalido extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConviteInvalido";
  }
}
