import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { cardapiosComCusto, configuracaoEventos } from "@/lib/eventos-dados";
import { cmvPct, formatPct, precoSugerido } from "@/lib/eventos-calculo";
import { formatMoney, plural } from "@/lib/format";

import { NovoCardapio } from "./novo-cardapio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cardápios · Eventos" };

/** Os menus de evento, cada um com o custo por pessoa tirado das fichas do Receituário de hoje. */
export default async function CardapiosPage() {
  const [cardapios, config] = await Promise.all([cardapiosComCusto(), configuracaoEventos()]);

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Cardápios"
        subtitulo="O custo por pessoa vem das fichas do Receituário."
        ajuda="O custo por pessoa soma as fichas que estão no cardápio. Mudou o custo de uma ficha, o cardápio acompanha; os orçamentos já feitos, não."
      />
      <NovoCardapio />
      {cardapios.length === 0 ? (
        <Vazio>Nenhum cardápio ainda.</Vazio>
      ) : (
        <Lista>
          {cardapios.map((c) => {
            const cmv = cmvPct(c.custoPorPessoa, c.precoPorPessoa);
            const sugerido = precoSugerido(c.custoPorPessoa, config.margemAlvoPct, config.impostoPct);
            return (
              <li key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <Link href={`/admin/eventos/cardapios/${c.id}`} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-[var(--muted)] sm:flex-nowrap">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                    <p className="truncate font-semibold">{c.nome}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {plural(c.itens.length, "prato")}
                      {!c.ativo && " · desligado"}
                      {c.precoPorPessoa === null && sugerido !== null && ` · sugerido ${formatMoney(sugerido)}`}
                    </p>
                  </div>
                  <dl className="grid shrink-0 grid-cols-3 gap-3 text-xs sm:text-right">
                    <div>
                      <dt className="text-[var(--muted-foreground)]">custo</dt>
                      <dd className="num-display text-sm">{formatMoney(c.custoPorPessoa)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted-foreground)]">preço</dt>
                      <dd className="num-display text-sm">{c.precoPorPessoa === null ? "—" : formatMoney(c.precoPorPessoa)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted-foreground)]">CMV</dt>
                      <dd className="num-display text-sm">{formatPct(cmv)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </Lista>
      )}
      <p className="hint">Valores por pessoa. CMV é a parte do preço que vai em comida.</p>
    </Pagina>
  );
}
