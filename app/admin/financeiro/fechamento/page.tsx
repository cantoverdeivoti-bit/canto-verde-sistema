import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina } from "@/components/pagina";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { somar, travaDoFechamentoDoDia } from "@/lib/financeiro-calculo";
import { FUSO_DA_CASA, formatDiaCurtoString, formatMoney } from "@/lib/format";

import { FechamentoForm } from "./fechamento-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fechamento do dia · Financeiro" };

/**
 * O fim do dia: o que o PDV vendeu em cada forma de pagamento. É assim que a
 * venda do salão entra no Financeiro enquanto as comandas não moram aqui.
 */
export default async function FechamentoPage({ searchParams }: PageProps<"/admin/financeiro/fechamento">) {
  const q = await searchParams;
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const data = typeof q.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.data) && q.data <= hoje ? q.data : hoje;

  const [existente, recentes] = await Promise.all([
    prisma.fechamentoDoDia.findUnique({
      where: { data: toDateOnly(data) },
      include: {
        itens: { select: { formaId: true, valorBruto: true } },
        lancamentos: {
          select: { baixadoPorId: true, status: true, linhaExtratoId: true, _count: { select: { anexos: true } } },
        },
      },
    }),
    prisma.fechamentoDoDia.findMany({
      orderBy: { data: "desc" },
      take: 14,
      select: { id: true, data: true, taxaServico: true, itens: { select: { valorBruto: true } } },
    }),
  ]);
  const formas = await prisma.formaRecebimento.findMany({
    where: { OR: [{ ativo: true }, { id: { in: existente?.itens.map((i) => i.formaId) ?? [] } }] },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    select: { id: true, nome: true, taxaPct: true, prazoDias: true, conta: { select: { nome: true } } },
  });

  const trava = existente
    ? travaDoFechamentoDoDia(existente.lancamentos.map((l) => ({ ...l, anexos: l._count.anexos })))
    : null;

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Fechamento do dia"
        subtitulo="Os totais do PDV por forma de pagamento."
        ajuda="Dinheiro e Pix entram no caixa na hora; cartão vira conta a receber, já com a taxa e o dia em que cai."
      />

      {formas.length === 0 ? (
        <p className="msg-warn">
          Nenhuma forma de recebimento ligada.{" "}
          <Link href="/admin/financeiro/formas" className="font-semibold underline">
            Cadastre as formas
          </Link>{" "}
          antes de fechar o dia.
        </p>
      ) : (
        <FechamentoForm
          key={data}
          data={data}
          hoje={hoje}
          formas={formas.map((f) => ({ id: f.id, nome: f.nome, taxaPct: f.taxaPct.toNumber(), prazoDias: f.prazoDias, conta: f.conta.nome }))}
          existente={
            existente
              ? {
                  id: existente.id,
                  taxaServico: existente.taxaServico.toNumber(),
                  observacao: existente.observacao ?? "",
                  valores: Object.fromEntries(existente.itens.map((i) => [i.formaId, i.valorBruto.toNumber()])),
                }
              : null
          }
          trava={trava}
          apagado={q.apagado === "1" && !existente}
        />
      )}

      {recentes.length > 0 && (
        <section>
          <h2 className="section-label mb-2">Últimos fechamentos</h2>
          <Lista>
            {recentes.map((f) => {
              const dia = dateOnlyToString(f.data);
              const total = somar(f.itens.map((i) => i.valorBruto.toNumber()));
              return (
                <li key={f.id}>
                  <Link
                    href={`/admin/financeiro/fechamento?data=${dia}`}
                    aria-current={dia === data ? "page" : undefined}
                    className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)] aria-[current]:bg-[var(--muted)]"
                  >
                    <span className="w-32 shrink-0 text-sm">{formatDiaCurtoString(dia)}</span>
                    <span className="min-w-0 flex-1 text-xs text-[var(--muted-foreground)]">
                      {f.taxaServico.toNumber() > 0 && `serviço ${formatMoney(f.taxaServico.toNumber())}`}
                    </span>
                    <span className="num-display shrink-0 text-sm">{formatMoney(total)}</span>
                  </Link>
                </li>
              );
            })}
          </Lista>
        </section>
      )}
    </Pagina>
  );
}
