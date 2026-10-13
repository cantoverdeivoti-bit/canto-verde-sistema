import { Plus } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { nomeDoMes } from "@/lib/financeiro";
import { somar, somarDias, valorLiquido } from "@/lib/financeiro-calculo";
import { dreDoMes, gerarRecorrenciasDoDia, saldosDasContas } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA, formatDiaCurtoString, formatMoney, plural } from "@/lib/format";

import { Numero } from "./_comum/numero";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel · Financeiro" };

/**
 * O dinheiro de hoje: quanto há em cada conta, o que venceu, o que vence na
 * semana e como o mês está fechando. É a tela que se abre de manhã.
 */
export default async function PainelFinanceiroPage() {
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const mes = hoje.slice(0, 7);
  const emSete = toDateOnly(somarDias(hoje, 7));
  await gerarRecorrenciasDoDia(hoje);

  const [saldos, abertos, ultimoFechamento, dre] = await Promise.all([
    saldosDasContas(),
    prisma.lancamento.findMany({
      where: { status: "ABERTO", vencimento: { lte: emSete } },
      orderBy: [{ vencimento: "asc" }, { id: "asc" }],
      select: { id: true, tipo: true, descricao: true, valor: true, taxa: true, vencimento: true },
    }),
    prisma.fechamentoDoDia.findFirst({ orderBy: { data: "desc" }, select: { data: true } }),
    dreDoMes(mes),
  ]);

  const ativas = saldos.filter((c) => c.ativo);
  const total = somar(ativas.map((c) => c.saldo));
  const lista = abertos.map((l) => ({
    ...l,
    vencimento: dateOnlyToString(l.vencimento),
    liquido: valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber() }),
  }));
  const pagar = lista.filter((l) => l.tipo === "PAGAR");
  const receber = lista.filter((l) => l.tipo === "RECEBER");
  const vencidos = pagar.filter((l) => l.vencimento < hoje);
  const semana = pagar.filter((l) => l.vencimento >= hoje);
  const fechouEm = ultimoFechamento ? dateOnlyToString(ultimoFechamento.data) : null;
  const ontem = somarDias(hoje, -1);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Financeiro"
        acoes={
          <>
            <Button asChild size="sm">
              <Link href="/admin/financeiro/fechamento">Fechar o dia</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/financeiro/pagar?novo=1">
                <Plus aria-hidden className="size-4" />
                Conta a pagar
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Números" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Saldo nas contas" valor={formatMoney(total)} tom={total < 0 ? "alerta" : undefined} />
        <Numero
          rotulo="Vencido a pagar"
          valor={formatMoney(somar(vencidos.map((l) => l.valor.toNumber())))}
          detalhe={vencidos.length > 0 ? plural(vencidos.length, "conta") : "nada vencido"}
          tom={vencidos.length > 0 ? "alerta" : undefined}
        />
        <Numero
          rotulo="A pagar em 7 dias"
          valor={formatMoney(somar(semana.map((l) => l.valor.toNumber())))}
          detalhe={plural(semana.length, "conta")}
        />
        <Numero
          rotulo="A receber em 7 dias"
          valor={formatMoney(somar(receber.map((l) => l.liquido)))}
          detalhe="já sem a taxa do cartão"
        />
      </section>

      {fechouEm !== hoje && fechouEm !== ontem && (
        <p className="msg-warn">
          {fechouEm
            ? `O último fechamento do PDV é de ${formatDiaCurtoString(fechouEm)}. `
            : "Nenhum fechamento do PDV lançado ainda. "}
          <Link href="/admin/financeiro/fechamento" className="font-semibold underline">
            Lançar o fechamento
          </Link>
          {" "}para as vendas entrarem no caixa e na DRE.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="section-label">Contas</h2>
          <Link href="/admin/financeiro/transferencias" className="nav-link">
            transferir
          </Link>
        </div>
        <Lista>
          {ativas.map((c) => (
            <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm font-semibold">{c.nome}</span>
              <span className="num-display text-sm" style={c.saldo < 0 ? { color: "var(--destructive)" } : undefined}>
                {formatMoney(c.saldo)}
              </span>
            </li>
          ))}
        </Lista>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="section-label">A pagar: vencidas e próximos 7 dias</h2>
          <Link href="/admin/financeiro/pagar" className="nav-link">
            ver todas
          </Link>
        </div>
        {pagar.length === 0 ? (
          <Vazio>Nada vencendo nos próximos 7 dias.</Vazio>
        ) : (
          <Lista>
            {pagar.slice(0, 10).map((l) => (
              <li key={l.id}>
                <Link href={`/admin/financeiro/pagar?mes=${l.vencimento.slice(0, 7)}#l${l.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
                  <span
                    className="w-24 shrink-0 text-xs"
                    style={{ color: l.vencimento < hoje ? "var(--destructive)" : l.vencimento === hoje ? "var(--warn)" : "var(--muted-foreground)" }}
                  >
                    {l.vencimento === hoje ? "hoje" : formatDiaCurtoString(l.vencimento)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{l.descricao}</span>
                  <span className="num-display shrink-0 text-sm">{formatMoney(l.valor.toNumber())}</span>
                </Link>
              </li>
            ))}
          </Lista>
        )}
        {pagar.length > 10 && <p className="hint">E mais {plural(pagar.length - 10, "conta")}.</p>}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="section-label">O mês até agora ({nomeDoMes(mes)})</h2>
          <Link href="/admin/financeiro/dre" className="nav-link">
            ver a DRE
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero rotulo="Receita bruta" valor={formatMoney(dre.receitaBruta)} detalhe="sem a taxa de serviço" />
          <Numero
            rotulo="Resultado"
            valor={formatMoney(dre.resultado)}
            detalhe={dre.receitaBruta > 0 ? `${((dre.resultado / dre.receitaBruta) * 100).toFixed(1).replace(".", ",")}% da receita` : undefined}
            tom={dre.resultado < 0 ? "alerta" : undefined}
          />
        </div>
        <p className="hint">
          Pela competência: entra o que pertence ao mês, pago ou não. Conta que ainda não foi lançada não aparece aqui.
        </p>
      </section>
    </Pagina>
  );
}
