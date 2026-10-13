"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";

import { ContagemCard, type Contagem } from "./contagem-card";
import { IniciarContagem } from "./iniciar-form";

/** As anteriores são histórico: as últimas bastam, o resto a um toque. */
const ANTERIORES_VISIVEIS = 3;

/**
 * A lista de contagens, e a escolha de quais viram uma compra só.
 *
 * Existe por causa de uma dor que o dono trouxe do sistema anterior: quem
 * contava a despensa em duas voltas — bebidas na segunda, secos na quarta —
 * era obrigado a montar duas cotações, mandar as duas ao mesmo fornecedor na
 * mesma semana e comparar preço em duas telas.
 *
 * A seleção mora aqui, e não dentro de cada cartão, porque é uma só para a
 * página inteira: o botão precisa saber de todas as marcadas, e o cartão só
 * sabe de si. Por isso também a lista deixou de ser servidor — é a única parte
 * desta página que tem estado.
 *
 * Só contagem fechada e ainda não gasta entra na escolha. A que está sendo
 * contada não tem lista de compra para conferir, e a que já virou cotação ou
 * pedido direto tem dona.
 */
export function ListaContagens({
  contagens,
  categorias,
  pessoas,
  peloLink = false,
}: {
  contagens: Contagem[];
  /** Aberto pelo link de atalhos: conta-se, mas a compra se monta com login. */
  peloLink?: boolean;
  categorias: { id: number; name: string; produtos: number }[];
  pessoas: { id: number; nome: string }[];
}) {
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set());
  const [verTodas, setVerTodas] = useState(false);

  function alternar(id: number) {
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  // Pedido direto já confirmado (fornecedor a fornecedor, na conferência) não
  // tira a contagem daqui: o resto da rodada ainda falta montar. Quem a dá por
  // gasta é `processada`, que o botão do fim e a requisição sempre gravam.
  const disponiveis = contagens.filter((c) => c.concluida && !c.processada && c.cotacaoId === null);
  const podemEscolher = new Set(disponiveis.map((c) => c.id));

  /* A seleção pode ter ficado para trás: a página recarrega depois de montar
     uma compra, e o que era escolhido some da lista dos disponíveis. Filtrar
     na hora de montar o endereço é mais barato que sincronizar estado com a
     lista a cada render — e não precisa de efeito nenhum. */
  const marcadas = [...escolhidas].filter((id) => podemEscolher.has(id));
  // Uma pronta só: o botão já leva ela, sem precisar marcar a caixa.
  const levar = marcadas.length > 0 ? marcadas : disponiveis.length === 1 ? [disponiveis[0].id] : [];

  return (
    <>
      {/* `Solicitar contagem` vira um formulário inteiro quando ele clica; o
          `:has(>.card)` dá a linha inteira a ele nesse estado. O botão de
          montar a compra mora no bloco das prontas, lá embaixo. */}
      <div className="mt-6 flex flex-wrap items-start gap-3">
        <div className="[&:has(>.card)]:w-full">
          <IniciarContagem
            categorias={categorias}
            pessoas={pessoas}
            abertas={contagens
              .filter((c) => !c.concluida && !c.vencida)
              .map((c) => ({ responsavel: c.responsavel, abertaEm: c.abertaEmTexto }))}
          />
        </div>
      </div>

      {contagens.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">
          Nenhuma contagem ainda. Escolha as categorias acima e gere o link para
          quem vai percorrer a despensa.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Em blocos, pelo que cada uma pede: a que está sendo contada, as
              prontas para virar compra (só essas têm caixinha), e as que já
              viraram compra ou venceram — histórico, no fim. */}
          {[
            {
              titulo: "Em andamento",
              lista: contagens.filter((c) => (!c.concluida && !c.vencida) || c.parada),
              dica: null,
            },
            {
              titulo: "Prontas para virar compra",
              lista: disponiveis,
              dica:
                disponiveis.length > 1 && !peloLink
                  ? "Marque mais de uma para juntar tudo numa rodada de compra só: produto contado nas duas vale pelo número da mais nova."
                  : null,
            },
            {
              titulo: "Anteriores",
              lista: contagens.filter(
                (c) => !podemEscolher.has(c.id) && !c.parada && (c.concluida || c.vencida),
              ),
              dica: null,
            },
          ]
            .filter((b) => b.lista.length > 0)
            .map((b) => (
              <section key={b.titulo}>
                <h2 className="section-label mb-2">
                  {b.titulo} · {b.lista.length}
                </h2>
                {b.dica && <p className="hint mt-0 mb-2">{b.dica}</p>}
                {/* O botão mora no bloco que ele usa: as prontas. No alto da
                    tela ele ficava apagado, longe das caixas que o ligam. */}
                {b.titulo === "Prontas para virar compra" && !peloLink && (
                  <div className="mb-2">
                    {levar.length === 0 ? (
                      <Button type="button" disabled title="Marque ao menos uma contagem">
                        Lista de itens para compra
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link href={`/admin/compras/conferir?c=${levar.join(",")}`}>
                          Lista de itens para compra
                          {levar.length > 1 && ` · ${levar.length} contagens`}
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
                {/* As anteriores numa caixa só, uma por linha: histórico se
                    lê como lista, não como pilha de cartões soltos. */}
                <ul
                  className={
                    b.titulo === "Anteriores"
                      ? "card divide-y divide-[var(--border)] overflow-hidden p-0"
                      : "space-y-2"
                  }
                >
                  {(b.titulo === "Anteriores" && !verTodas ? b.lista.slice(0, ANTERIORES_VISIVEIS) : b.lista).map((c) => (
                    <ContagemCard
                      key={c.id}
                      contagem={c}
                      escolhivel={podemEscolher.has(c.id)}
                      escolhida={escolhidas.has(c.id)}
                      aoEscolher={() => alternar(c.id)}
                      peloLink={peloLink}
                    />
                  ))}
                </ul>
                {b.titulo === "Anteriores" && !verTodas && b.lista.length > ANTERIORES_VISIVEIS && (
                  <button
                    type="button"
                    onClick={() => setVerTodas(true)}
                    className="mt-2 text-sm text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    Ver mais {b.lista.length - ANTERIORES_VISIVEIS}
                  </button>
                )}
              </section>
            ))}
          {marcadas.length > 1 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {plural(marcadas.length, "contagem marcada", "contagens marcadas")}.
            </p>
          )}
        </div>
      )}
    </>
  );
}
