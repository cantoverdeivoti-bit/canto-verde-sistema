import { after } from "next/server";

import type { Prisma, TipoAviso } from "@/generated/prisma/client";
import { avisarDoAviso } from "@/lib/notificar";

/** Um item em falta, do jeito que o "Comprar de outro" precisa. */
export type ItemDoAviso = { produtoId: number; nome: string; quantidade: number };

type Dados = {
  tipo: TipoAviso;
  fornecedorId?: number | null;
  pedidoId?: number | null;
  cotacaoId?: number | null;
  titulo: string;
  detalhe?: string | null;
  itens?: ItemDoAviso[];
  pedeAcao?: boolean;
};

/**
 * Grava um aviso de Compras: um ato de fornecedor que a casa precisa saber.
 *
 * Recebe o `tx` da transação de quem chama quando há uma — o aviso nasce
 * junto com o que ele conta, ou não nasce. O texto vem pronto de quem chama,
 * congelado no momento do ato.
 *
 * Nunca derruba a ação: um aviso que falhou é um aviso a menos, e perder a
 * resposta do fornecedor por causa dele seria trocar o principal pelo
 * acessório. Por isso o erro é engolido e só vai para o log.
 */
export async function registrarAviso(
  db: Pick<Prisma.TransactionClient, "avisoCompra">,
  dados: Dados,
): Promise<void> {
  try {
    const criado = await db.avisoCompra.create({
      data: {
        tipo: dados.tipo,
        fornecedorId: dados.fornecedorId ?? null,
        pedidoId: dados.pedidoId ?? null,
        cotacaoId: dados.cotacaoId ?? null,
        titulo: dados.titulo,
        detalhe: dados.detalhe ?? null,
        itens: dados.itens ?? undefined,
        pedeAcao: dados.pedeAcao ?? false,
      },
      select: { id: true },
    });
    // O aviso no celular e no e-mail, depois da resposta: quem respondeu não espera o
    // envio, e a transação que gravou o aviso já terminou (ou desfez tudo,
    // e aí `avisarDoAviso` não acha o aviso e não manda nada). Fora de
    // uma requisição (scripts de teste) `after` não existe, e só se pula.
    try {
      after(() => avisarDoAviso(criado.id));
    } catch {}
  } catch (err) {
    console.error("[registrarAviso] falha:", err);
  }
}
