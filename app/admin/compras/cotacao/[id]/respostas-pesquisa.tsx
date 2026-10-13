import { formatMoney, plural } from "@/lib/format";

export type PerguntaRespondida = {
  id: number;
  descricao: string;
  observacoes: string | null;
  respostas: {
    id: number;
    fornecedor: string;
    tem: boolean;
    preco: number | null;
    embalagem: string | null;
    marca: string | null;
    observacoes: string | null;
  }[];
  /** Quantos foram chamados e ainda não disseram nada sobre esta pergunta. */
  calados: number;
};

/**
 * O que os fornecedores responderam sobre o que a casa não compra.
 *
 * Fica no fim da cotação, depois do comparativo. O comparativo decide a
 * compra da semana; isto é informação para uma decisão que vem depois — se
 * vale cadastrar o produto e passar a comprá-lo. Trocar a ordem seria pôr a
 * curiosidade na frente do trabalho.
 *
 * Quem tem aparece primeiro, e não na ordem em que respondeu: a pergunta que
 * a tela responde é "dá para comprar, e por quanto?", e quem não tem só
 * importa para ele saber a quem não perguntar de novo.
 *
 * De servidor: é leitura pura, sem um botão sequer. O que se faz com a
 * resposta — cadastrar o produto — acontece em Produtos, que tem o formulário.
 */
export function RespostasDaPesquisa({ perguntas }: { perguntas: PerguntaRespondida[] }) {
  if (perguntas.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-6">
      <h2 className="section-label">Pesquisa de preço</h2>
      <p className="hint mt-1">
        O que você perguntou sobre produtos que ainda não compra. Não entra
        nesta compra — se valer a pena, cadastre o produto e ele passa a
        aparecer nas próximas contagens.
      </p>

      <div className="mt-4 space-y-5">
        {perguntas.map((p) => {
          // Quem tem primeiro, e o mais barato na frente entre eles. Quem não
          // sabe o preço vai para o fim dos que têm: ele respondeu, mas ainda
          // não respondeu a parte que decide.
          const ordenadas = [...p.respostas].sort((a, b) => {
            if (a.tem !== b.tem) return a.tem ? -1 : 1;
            if (a.preco === b.preco) return a.fornecedor.localeCompare(b.fornecedor, "pt-BR");
            if (a.preco === null) return 1;
            if (b.preco === null) return -1;
            return a.preco - b.preco;
          });

          const temAlguem = ordenadas.some((r) => r.tem);

          return (
            <div key={p.id}>
              <p className="font-medium">{p.descricao}</p>
              {p.observacoes && (
                <p className="text-xs text-[var(--muted-foreground)]">{p.observacoes}</p>
              )}

              {ordenadas.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Ninguém respondeu ainda.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {ordenadas.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--border)] pb-1 text-sm last:border-0"
                    >
                      <span className={r.tem ? "font-medium" : "text-[var(--muted-foreground)]"}>
                        {r.fornecedor}
                      </span>

                      {r.tem ? (
                        <>
                          {/* "tem, preço a ver" é resposta, e é dita assim.
                              Um traço no lugar do preço seria lido como
                              "não respondeu", que é outra coisa. */}
                          <span className="num-display">
                            {r.preco === null ? "preço a ver" : formatMoney(r.preco)}
                          </span>
                          {r.embalagem && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {r.embalagem}
                            </span>
                          )}
                          {r.marca && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {r.marca}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          não trabalha com isso
                        </span>
                      )}

                      {r.observacoes && (
                        <span className="w-full text-xs text-[var(--muted-foreground)]">
                          {r.observacoes}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Os dois números que faltam para ele saber se já pode decidir:
                  quantos ainda não disseram nada, e se alguém tem. */}
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {p.calados > 0 &&
                  `${plural(p.calados, "fornecedor ainda não respondeu", "fornecedores ainda não responderam")}. `}
                {ordenadas.length > 0 &&
                  (temAlguem ? "" : "Ninguém dos que responderam trabalha com isso.")}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
