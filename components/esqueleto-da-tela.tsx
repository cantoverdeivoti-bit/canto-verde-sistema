/**
 * O que aparece no instante do toque, enquanto a tela nova vem do servidor.
 *
 * Sem isto, tocar num link do painel deixava a tela velha parada até o
 * servidor terminar tudo — no celular, um segundo ou mais sem sinal de que o
 * toque pegou, e a pessoa tocava de novo. Com um `loading.tsx` usando este
 * esqueleto, o Next já traz o esqueleto junto com o link e troca de tela na
 * hora.
 *
 * Genérico de propósito: um título e uma lista, que é o formato de quase toda
 * tela do painel. Nada de desenhar cada tela — o esqueleto só precisa dizer
 * "já vai".
 */
export function EsqueletoDaTela() {
  const barra = "rounded bg-[var(--muted)] motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Carregando" className="max-w-3xl">
      {/* A mesma faixa verde do cabeçalho de verdade, para a tela não piscar. */}
      <div className="cabecalho-verde faixa-escura">
        <div className={`h-6 w-44 ${barra}`} />
        <div className={`mt-2 h-3.5 w-28 ${barra}`} />
      </div>
      <ul className="mt-5 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
        {[0.7, 0.5, 0.62, 0.45, 0.56].map((largura, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3.5">
            <div className="min-w-0 flex-1">
              <div className={`h-4 ${barra}`} style={{ width: `${largura * 100}%` }} />
              <div className={`mt-2 h-3 w-20 ${barra}`} />
            </div>
            <div className={`h-4 w-16 shrink-0 ${barra}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
