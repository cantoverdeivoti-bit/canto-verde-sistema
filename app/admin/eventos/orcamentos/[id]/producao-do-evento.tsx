import { medida, receitas } from "@/lib/eventos-calculo";
import type { ProducaoDoEvento } from "@/lib/eventos-dados";

/**
 * O que fazer e o que comprar para o evento, em três listas: os pratos (em
 * receitas), os pré-preparos (somados entre os pratos) e os insumos em peso
 * bruto, que é o de comprar. Serve à tela do evento e à folha impressa.
 */
export function ListasDaProducao({ producao: p, impressa = false }: { producao: ProducaoDoEvento; impressa?: boolean }) {
  const linha = impressa ? "flex items-baseline justify-between gap-4 border-b border-gray-300 py-1" : "flex items-baseline justify-between gap-3 py-2";
  const lista = impressa ? "" : "divide-y divide-[var(--border)]";
  const titulo = impressa ? "mt-4 mb-1 text-base font-bold" : "text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase";
  const fraco = impressa ? "text-[11px]" : "text-xs text-[var(--muted-foreground)]";
  return (
    <div className={impressa ? "text-[13px]" : "space-y-4 text-sm"}>
      <section>
        <h3 className={titulo}>Pratos</h3>
        <ul className={lista}>
          {p.pratos.map((x) => (
            <li key={x.fichaId} className={linha}>
              <span className="min-w-0">
                <span className="font-medium">{x.nome}</span>
                <span className={`block ${fraco}`}>
                  {x.codigo} · {x.porcoes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} porções · {receitas(x.receitas)}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{x.pronto === null ? "—" : medida(x.pronto, x.unidade)}</span>
            </li>
          ))}
        </ul>
      </section>

      {p.preparos.length > 0 && (
        <section>
          <h3 className={titulo}>Pré-preparos</h3>
          <ul className={lista}>
            {p.preparos.map((x) => (
              <li key={x.fichaId} className={linha}>
                <span className="min-w-0">
                  <span className="font-medium">{x.nome}</span>
                  <span className={`block ${fraco}`}>{x.receitas > 0 ? receitas(x.receitas) : "sem peso pronto na ficha"}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{medida(x.quantidade, x.unidade)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.insumos.length > 0 && (
        <section>
          <h3 className={titulo}>Insumos para comprar</h3>
          <ul className={lista}>
            {p.insumos.map((x) => (
              <li key={`${x.insumoId}|${x.unidade}`} className={linha}>
                <span className="min-w-0 font-medium">{x.nome}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-semibold">{medida(x.bruto, x.unidade)}</span>
                  {Math.abs(x.bruto - x.limpo) > 0.5 && <span className={`block ${fraco}`}>limpo {medida(x.limpo, x.unidade)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.semIngredientes.length > 0 && (
        <p className={impressa ? "mt-3 text-[12px]" : "msg-warn text-sm"}>
          Sem ingredientes lançados na ficha: {p.semIngredientes.join(", ")}. A lista de compra sai sem os insumos delas.
        </p>
      )}

      {p.semRendimento.length > 0 && (
        <p className={impressa ? "mt-3 text-[12px]" : "msg-warn text-sm"}>
          Sem peso pronto na ficha, não dá para abrir: {p.semRendimento.join(", ")}. Os insumos deles ficam fora da lista.
        </p>
      )}
    </div>
  );
}
