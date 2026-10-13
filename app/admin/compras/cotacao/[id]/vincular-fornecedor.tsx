"use client";

import { useMemo, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { gerarLinkCotacao } from "@/lib/actions/cotacao";
import { chave } from "@/lib/format";

/** Um fornecedor do cadastro que esta cotação não alcançou sozinha. */
export type ForaDaLista = {
  id: number;
  /** A razão social. Escolher quem é pede o nome inteiro. */
  nome: string;
  /** Como a casa chama ele. Nulo = nunca foi apelidado. */
  apelido: string | null;
  categorias: string[];
};

/**
 * Chamar para esta rodada um fornecedor que a lista não trouxe.
 *
 * A lista sai de duas redes — quem atende as categorias dos itens e quem está
 * vinculado a um produto. Quem não cai em nenhuma das duas simplesmente não
 * aparece, e não havia como chamá-lo: a saída era ir ao cadastro marcar uma
 * gaveta que ele talvez nem atenda de verdade, só para ele surgir aqui.
 *
 * Acontece toda semana com o atacado, que vende de tudo um pouco, e com o
 * fornecedor novo que ainda não tem gaveta marcada.
 *
 * Vincular é diferente de cadastrar, e por isso são dois botões: "Cadastrar"
 * cria um fornecedor que não existe; este chama um que existe. Confundir os
 * dois é como se acaba com o mesmo fornecedor cadastrado duas vezes.
 *
 * Vale só para ESTA cotação: gera o link dele aqui e não mexe no cadastro. Se
 * ele passar a ser dessa gaveta toda semana, o lugar de dizer isso é o Editar.
 *
 * É só o painel: o quadrado "Vincular" da lista abre e fecha.
 */
export function VincularFornecedor({
  cotacaoId,
  disponiveis,
  aoFechar,
}: {
  cotacaoId: number;
  disponiveis: ForaDaLista[];
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const indice = useMemo(
    () =>
      new Map(
        // O apelido entra no índice: quem procura por "Himalaia" acha o
        // "Himalaia Com. de Prod. Alimentares Ltda".
        disponiveis.map((f) => [f.id, chave(`${f.nome} ${f.apelido ?? ""} ${f.categorias.join(" ")}`)]),
      ),
    [disponiveis],
  );

  const termo = chave(busca);
  const achados = useMemo(
    () => (termo === "" ? disponiveis : disponiveis.filter((f) => indice.get(f.id)?.includes(termo) ?? false)).slice(0, 8),
    [disponiveis, indice, termo],
  );

  function vincular(id: number) {
    setErro(null);
    startTransition(async () => {
      const r = await gerarLinkCotacao(cotacaoId, id);
      if (!r.ok) return setErro(r.message);
      // A ação já revalida: ele reaparece em "Chamados", com Copiar link e
      // WhatsApp, que é onde o trabalho continua.
      aoFechar();
    });
  }

  return (
    <div className="space-y-3">
      <p className="hint">Quem não atende nenhuma gaveta desta lista. Vale só para esta rodada: o cadastro dele não muda.</p>
      <Input
        autoFocus
        type="search"
        aria-label="Buscar o fornecedor a vincular"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Nome do fornecedor"
        className="h-11"
      />
      {achados.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhum fornecedor com esse nome fora da lista.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {achados.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={pendente}
                onClick={() => vincular(f.id)}
                className="w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--muted)] disabled:opacity-50"
              >
                <span className="block text-sm font-medium">{f.nome}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {f.categorias.length > 0 ? f.categorias.join(" · ") : "sem gaveta marcada"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
