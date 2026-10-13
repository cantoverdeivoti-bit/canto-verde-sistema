import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatMoney, plural } from "@/lib/format";
import { receituarioComCustos } from "@/lib/receituario-dados";
import { corDaCategoria } from "@/lib/receituario-regras";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receitas · Eventos" };

/**
 * As receitas que a casa serve em evento. Moram no Receituário, com a ficha
 * técnica e a operacional; aqui ficam só a lista, o custo da porção e em que
 * cardápio cada uma está. Quem tem o Receituário abre a ficha pelo nome.
 */
export default async function ReceitasPage() {
  const [user, { fichas, custoDasFichas, config }, itens] = await Promise.all([
    guardModule("eventos"),
    receituarioComCustos(),
    prisma.cardapioItem.findMany({ select: { fichaId: true, cardapio: { select: { nome: true } } } }),
  ]);
  const verFicha = can(user, "receituario");

  const cardapiosDa = new Map<number, Set<string>>();
  for (const i of itens) cardapiosDa.set(i.fichaId, (cardapiosDa.get(i.fichaId) ?? new Set()).add(i.cardapio.nome));
  const deEventos = fichas
    .filter((f) => f.operacoes.includes("EVENTOS") || cardapiosDa.has(f.id))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Receitas"
        subtitulo={
          <>
            {plural(deEventos.filter((f) => f.ativo).length, "ficha", "fichas")} do Receituário servem em evento. O custo da porção vem
            da ficha e entra no custo dos cardápios.
          </>
        }
        acoes={
          verFicha && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/admin/receituario?operacao=EVENTOS">
                <ExternalLink aria-hidden className="size-4" />
                Abrir no Receituário
              </Link>
            </Button>
          )
        }
      />
      {deEventos.length === 0 ? (
        <Vazio>Nenhuma ficha marcada para Eventos. Ao pôr uma ficha num cardápio, ela aparece aqui.</Vazio>
      ) : (
        <Lista>
          {deEventos.map((f) => {
            const c = custoDasFichas.get(f.id)!;
            const cardapios = [...(cardapiosDa.get(f.id) ?? [])];
            const corpo = (
              <>
                <span aria-hidden className="w-1 self-stretch rounded-r" style={{ background: corDaCategoria(f.categoria, config.cores) }} />
                <span className="w-12 shrink-0 font-mono text-xs text-[var(--muted-foreground)]">{f.codigo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {f.nome}
                    {!f.ativo && <span className="ml-1 text-xs font-normal text-[var(--warn)]">(desligada)</span>}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {f.categoria}
                    {cardapios.length > 0 ? ` · ${cardapios.join(", ")}` : " · em nenhum cardápio"}
                    {c.semPreco > 0 && <span style={{ color: "var(--warn)" }}> · {plural(c.semPreco, "insumo sem preço", "insumos sem preço")}</span>}
                  </span>
                </span>
                {c.porPorcao !== null && (
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    {formatMoney(c.porPorcao)}
                    <span className="block text-[10px] text-[var(--muted-foreground)]">por porção</span>
                  </span>
                )}
              </>
            );
            return (
              <li key={f.id}>
                {verFicha ? (
                  <Link href={`/admin/receituario/${f.codigo}`} className="flex items-center gap-3 py-2 pr-4 hover:bg-[var(--muted)]">
                    {corpo}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2 pr-4">{corpo}</div>
                )}
              </li>
            );
          })}
        </Lista>
      )}
    </Pagina>
  );
}
