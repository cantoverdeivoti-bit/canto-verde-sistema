import { Plus } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { OrcamentoSemana, PorcentagemDoOrcamento } from "@/components/orcamento-semana";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { DIAS_DA_SEMANA, diaDaSemanaHoje, plural } from "@/lib/format";
import { orcamentoDaSemana } from "@/lib/orcamento";
import { SEM_SITUACAO, situacaoDasRotinas } from "@/lib/rotina-de-hoje";

import { RotinasDeHoje, rotinasDeHoje } from "./rotinas-de-hoje";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras de rotina — Compras" };

/** Segunda primeiro: é como a semana de compra é lida na casa. */
const naSemana = (d: number) => (d + 6) % 7;

/**
 * As compras de rotina: no alto, as de hoje com o próximo passo (contar ou
 * mandar o pedido); embaixo, cada fornecedor com os dias cadastrados. A
 * rotina tem a contagem dela: ao finalizar, o pedido direto sai sozinho.
 */
export default async function ListasPage() {
  const [user, { capacity }] = await Promise.all([guardModule("compras", { atalho: true }), getSettings()]);
  const tz = capacity.timezone;
  // O quadro das rotinas de hoje começa a buscar já, junto com o resto.
  void rotinasDeHoje(tz);
  const [listas, orcamento, situacao] = await Promise.all([
    prisma.listaCompra.findMany({
      select: {
        id: true,
        diaSemana: true,
        ativa: true,
        fornecedorId: true,
        fornecedor: { select: { name: true, apelido: true } },
        _count: { select: { itens: true } },
      },
    }),
    orcamentoDaSemana(tz),
    // Pelo filtro de todas as listas: sai junto, sem esperar a busca delas.
    situacaoDasRotinas({}, tz),
  ]);

  const hoje = diaDaSemanaHoje(tz);
  type Dia = (typeof listas)[number];
  const porFornecedor = new Map<number, { id: number; nome: string; dias: Dia[] }>();
  for (const l of listas) {
    const g = porFornecedor.get(l.fornecedorId) ?? {
      id: l.fornecedorId,
      nome: l.fornecedor.apelido ?? l.fornecedor.name,
      dias: [],
    };
    g.dias.push(l);
    porFornecedor.set(l.fornecedorId, g);
  }
  const grupos = [...porFornecedor.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  for (const g of grupos) g.dias.sort((a, b) => naSemana(a.diaSemana) - naSemana(b.diaSemana));

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Compras de rotina"
        subtitulo="Um fornecedor num dia da semana, com o estoque ideal de cada produto."
        ajuda="Conte os produtos da compra de rotina: ao finalizar a contagem, o pedido sai pronto, com o ideal menos o contado."
      />

      <RotinasDeHoje timezone={tz} />

      {/* O pedido de cada compra de rotina entra no "já pedido" da semana. */}
      {/* Pelo link de atalhos, só a porcentagem: os reais não saem do servidor. */}
      {user.atalho ? (
        <PorcentagemDoOrcamento
          pct={orcamento.orcamento ? Math.round((orcamento.gasto / orcamento.orcamento) * 1000) / 10 : null}
          className="rounded-lg border border-[var(--border)] px-3 py-2"
        />
      ) : (
        <OrcamentoSemana dados={orcamento} className="rounded-lg border border-[var(--border)] px-3 py-2" />
      )}

      <Button asChild>
        <Link href="/admin/compras/listas/nova">
          <Plus aria-hidden className="size-4" />
          Nova compra de rotina
        </Link>
      </Button>

      {grupos.length === 0 ? (
        <Vazio>Nenhuma compra de rotina ainda.</Vazio>
      ) : (
        <ul className="space-y-3">
          {grupos.map((g) => (
            <li key={g.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <p className="px-3 pt-3 font-semibold">{g.nome}</p>
              <ul className="mt-1 divide-y divide-[var(--border)]">
                {g.dias.map((d) => {
                  const ehHoje = d.ativa && d.diaSemana === hoje;
                  const { contagem, pedido } = situacao.get(d.id) ?? SEM_SITUACAO;
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/admin/compras/listas/${d.id}`}
                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--muted)]"
                      >
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-medium capitalize">{DIAS_DA_SEMANA[d.diaSemana]}</span>
                          <span className="text-[var(--muted-foreground)]">
                            {" "}
                            · {plural(d._count.itens, "produto", "produtos")}
                          </span>
                          {!d.ativa && <span className="text-[var(--warn)]"> · desligada</span>}
                          {(ehHoje || contagem || pedido) && (
                            <span
                              className="block text-xs font-medium"
                              style={{ color: pedido?.enviado ? "var(--ok-strong)" : "var(--warn)" }}
                            >
                              {pedido
                                ? pedido.enviado
                                  ? `Pedido #${pedido.id} enviado`
                                  : `Pedido #${pedido.id} pronto para mandar`
                                : contagem
                                  ? `Contagem em andamento · ${contagem.feitos} de ${contagem.total}`
                                  : "Hoje: falta contar"}
                            </span>
                          )}
                        </span>
                        <span aria-hidden className="text-[var(--muted-foreground)]">
                          ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {g.dias.length < 7 && (
                <Link
                  href={`/admin/compras/listas/nova?fornecedor=${g.id}`}
                  className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-2.5 text-sm text-[var(--primary)]"
                >
                  <Plus aria-hidden className="size-3.5" />
                  Outro dia para {g.nome}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}
