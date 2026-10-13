import { formatMoney } from "@/lib/format";
import { fichasParaImprimir, type FichaParaImprimir, type TipoDeFicha } from "@/lib/receituario-impressao";
import { corDaCategoria, OPERACOES, precosSugeridos, type CustoDaFicha } from "@/lib/receituario-regras";

const numero = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export { fichasParaImprimir, type TipoDeFicha };

/**
 * Uma ficha em A4 em pé, como a pasta da cozinha: a faixa da cor da
 * categoria na borda direita (com o nome dela, para achar folheando) e o que
 * se vê de relance no alto.
 *
 * A operacional segue com os ingredientes, o modo de preparo, o forno, os
 * utensílios, o ponto de controle e a montagem, e não mostra valor nenhum: é
 * a folha que fica na cozinha. A técnica traz os ingredientes com preço e
 * custo, o custo da receita e o preço sugerido.
 */
export function FichaImpressa({ ficha: f, custo, config, precos: precoDaLinha, tipo }: FichaParaImprimir & { tipo: TipoDeFicha; custo: CustoDaFicha }) {
  const tecnica = tipo === "tecnica";
  const cor = corDaCategoria(f.categoria, config.cores);
  const rend = f.rendimentoTotal === null ? null : Number(f.rendimentoTotal);
  const porcao = rend !== null && f.porcoes > 0 ? rend / f.porcoes : null;
  const precos = precosSugeridos(custo.porPorcao, config.metaFoodCost, config.markup);
  const forno = (
    [
      ["Viabilidade", f.viabilidade],
      ["Modo", f.modoForno],
      ["Temperatura", f.temperatura],
      ["Umidade", f.umidade],
      ["Tempo", f.tempoForno],
      ["Sonda", f.sonda],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => Boolean(x[1]));
  const blocos = (
    [
      ["Utensílios e equipamentos", f.utensilios],
      ["Ponto de controle", f.pontoDeControle],
      ["Montagem e porcionamento", f.montagem],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => Boolean(x[1]));

  return (
    <section className="folha relative mb-8 flex flex-col pr-[13mm] text-[11.5px] leading-snug">
      {/* A faixa da categoria, na borda direita, de cima a baixo. */}
      <div
        className="absolute top-0 right-0 bottom-0 flex w-[9mm] items-center justify-center rounded-sm text-[11px] font-bold tracking-[0.2em] text-white uppercase"
        style={{ background: cor, writingMode: "vertical-rl" }}
      >
        {f.categoria}
      </div>

      <header className="mb-3 flex items-start gap-3 border-b-2 pb-2" style={{ borderColor: cor }}>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-wider text-neutral-600 uppercase">
            {tecnica ? "Ficha técnica" : "Ficha operacional"} · {f.codigo}
            {f.tipo === "PRE_PREPARO" && " · pré-preparo"}
          </p>
          <h1 className="text-[22px] leading-tight font-bold">
            {f.nome}
            {f.etiquetas.map((e) => (
              <span key={e} className="ml-2 inline-block rounded-full border px-2 align-middle text-[10px] font-semibold uppercase" style={{ borderColor: cor, color: cor }}>
                {e}
              </span>
            ))}
          </h1>
          {f.operacoes.length > 0 && <p className="text-[10.5px] text-neutral-600">Usada em: {f.operacoes.map((o) => OPERACOES.find((x) => x.chave === o)?.nome ?? o).join(" · ")}</p>}
        </div>
        {f.foto && (
          // eslint-disable-next-line @next/next/no-img-element -- a foto vem da rota do módulo, com a sessão.
          <img
            src={`/admin/receituario/foto/${encodeURIComponent(f.codigo)}?v=${f.foto.updatedAt.getTime()}`}
            alt=""
            className="h-[30mm] w-[40mm] shrink-0 rounded object-cover"
          />
        )}
      </header>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {[
          ["Peso pronto", rend === null ? "—" : `${numero(rend)} ${f.unidadeRendimento}`],
          ["Porções", porcao === null ? String(f.porcoes) : `${f.porcoes} de ${numero(porcao)} ${f.unidadeRendimento}`],
          ["Tempo de preparo", f.tempoPreparo ?? "—"],
          ["Validade", f.armazenamento ?? "—"],
        ].map(([r, v]) => (
          <div key={r} className="rounded border border-neutral-400 px-2 py-1">
            <p className="text-[9px] font-semibold text-neutral-600 uppercase">{r}</p>
            <p className={r === "Validade" ? "text-[10px] leading-tight font-medium" : "text-[13px] font-bold"}>{v}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-1 text-[11px] font-bold tracking-wide uppercase">Ingredientes</h2>
      <table className="mb-3 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-200 text-left text-[10px] uppercase">
            <th className="border border-neutral-400 px-1.5 py-0.5">Ingrediente</th>
            <th className="w-[18mm] border border-neutral-400 px-1.5 py-0.5 text-right">Qtd</th>
            {tecnica ? (
              <>
                <th className="w-[24mm] border border-neutral-400 px-1.5 py-0.5 text-right">Preço</th>
                <th className="w-[18mm] border border-neutral-400 px-1.5 py-0.5 text-right">Custo</th>
              </>
            ) : (
              <th className="border border-neutral-400 px-1.5 py-0.5">Preparo do item</th>
            )}
          </tr>
        </thead>
        <tbody>
          {f.ingredientes.map((l, i) => {
            const c = custo.linhas[i];
            return (
              <tr key={l.id}>
                <td className="border border-neutral-400 px-1.5 py-[3px]">
                  {l.subFicha ? `${l.subFicha.nome} (ficha ${l.subFicha.codigo})` : (l.insumo?.nome ?? l.nomeLivre)}
                </td>
                <td className="border border-neutral-400 px-1.5 py-[3px] text-right whitespace-nowrap">
                  {numero(Number(l.quantidade), 1)} {l.unidade ?? ""}
                </td>
                {tecnica ? (
                  <>
                    <td className="border border-neutral-400 px-1.5 py-[3px] text-right whitespace-nowrap">
                      {precoDaLinha[i] ? `${formatMoney(precoDaLinha[i]!.valor)}/${precoDaLinha[i]!.por}` : "—"}
                    </td>
                    <td className="border border-neutral-400 px-1.5 py-[3px] text-right whitespace-nowrap">{c === null ? "s/ preço" : l.nomeLivre ? "—" : formatMoney(c)}</td>
                  </>
                ) : (
                  <td className="border border-neutral-400 px-1.5 py-[3px] text-neutral-700">{l.preparo}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!tecnica && (
        <>
          <h2 className="mb-1 text-[11px] font-bold tracking-wide uppercase">Modo de preparo</h2>
          <ol className="mb-3 space-y-1">
            {f.passos.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: cor }}>
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>

          {(forno.length > 0 || blocos.length > 0) && (
            <>
              <h2 className="mb-1 text-[11px] font-bold tracking-wide uppercase">Ficha operacional</h2>
              <div className="mb-3 space-y-2 rounded border border-neutral-400 p-2">
                {forno.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase">Forno combinado</p>
                    <p>{forno.map(([r, v]) => `${r}: ${v}`).join(" · ")}</p>
                    {f.ajusteForno && <p className="text-[10.5px] text-neutral-700">{f.ajusteForno}</p>}
                  </div>
                )}
                {blocos.map(([r, v]) => (
                  <div key={r}>
                    <p className="text-[10px] font-semibold uppercase">{r}</p>
                    <p className="whitespace-pre-line">{v}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {(f.alergenicos.length > 0 || f.observacoes) && (
            <div className="mb-3">
              {f.alergenicos.length > 0 && (
                <p>
                  <span className="font-bold">Alergênicos:</span> {f.alergenicos.join(", ")}
                </p>
              )}
              {f.observacoes && <p className="whitespace-pre-line">{f.observacoes}</p>}
            </div>
          )}
        </>
      )}

      {tecnica && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded border border-neutral-400 p-2 text-[10.5px]">
          <p>
            Total: <b>{formatMoney(custo.total)}</b>
          </p>
          <p>
            Por porção: <b>{custo.porPorcao === null ? "—" : formatMoney(custo.porPorcao)}</b>
          </p>
          <p>
            Por kg pronto: <b>{custo.porKg === null ? "—" : formatMoney(custo.porKg)}</b>
          </p>
          <p>Perda: {custo.perda === null ? "—" : `${numero(custo.perda * 100, 1)}%`}</p>
          <p>Preço mínimo: {precos.minimo === null ? "—" : formatMoney(precos.minimo)}</p>
          <p>Pelo markup {numero(config.markup, 2)}: {precos.markup === null ? "—" : formatMoney(precos.markup)}</p>
        </div>
      )}

      {/* No pé da folha: na impressão a folha tem a altura do papel, e as
          assinaturas descem até o fim dela. */}
      <footer className="mt-auto grid grid-cols-3 gap-6 pt-6 text-[10px]">
        <p className="border-t border-black pt-0.5">{f.conferida ? "☑ Conferida na cozinha" : "☐ Conferida na cozinha"}</p>
        <p className="border-t border-black pt-0.5">Responsável</p>
        <p className="border-t border-black pt-0.5">Revisada em ___/___/______</p>
      </footer>
    </section>
  );
}
