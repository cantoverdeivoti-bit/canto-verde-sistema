import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { saldosDasContas } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA } from "@/lib/format";

import { Transferencias } from "./transferencias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transferências · Financeiro" };

/**
 * Dinheiro que muda de conta sem entrar nem sair da casa: a gaveta que vai
 * para o banco, o saldo da maquininha que é sacado. Sem isto, o caixa da
 * loja só cresceria e o banco nunca bateria com o extrato.
 */
export default async function TransferenciasPage() {
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const [saldos, recentes] = await Promise.all([
    saldosDasContas(),
    prisma.transferencia.findMany({
      orderBy: [{ data: "desc" }, { id: "desc" }],
      take: 50,
      include: { origem: { select: { nome: true } }, destino: { select: { nome: true } } },
    }),
  ]);

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Transferências entre contas" />
      <Transferencias
        hoje={hoje}
        contas={saldos.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome, saldo: c.saldo }))}
        recentes={recentes.map((t) => ({
          id: t.id,
          data: dateOnlyToString(t.data),
          origem: t.origem.nome,
          destino: t.destino.nome,
          valor: t.valor.toNumber(),
          observacao: t.observacao ?? "",
        }))}
      />
    </Pagina>
  );
}
