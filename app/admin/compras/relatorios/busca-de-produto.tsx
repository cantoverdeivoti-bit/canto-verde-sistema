"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { chave } from "@/lib/format";

/**
 * Buscar o produto pelo nome e abrir o relatório dele (preço, estoque). Enter
 * escolhe o primeiro achado, como nas outras buscas do sistema.
 *
 * Fica em cima, dentro do cartão do filtro (`busca` do FiltroDePeriodo), com a
 * lupa no campo como nas outras buscas do painel.
 */
export function BuscaDeProduto({
  produtos,
  caminho,
  de,
  ate,
  placeholder,
}: {
  produtos: { id: number; nome: string }[];
  caminho: string;
  de: string;
  ate: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const termo = chave(busca);
  const achados = termo.length < 2 ? [] : produtos.filter((p) => chave(p.nome).includes(termo)).slice(0, 8);

  function abrir(id: number) {
    router.push(`${caminho}?de=${de}&ate=${ate}&produto=${id}`);
  }

  return (
    <div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <Input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (achados.length > 0) abrir(achados[0].id);
          }}
          placeholder={placeholder}
          aria-label="Buscar produto pelo nome"
          className="h-11 w-full pl-9"
        />
      </div>
      {achados.length > 0 && (
        <ul className="mt-1 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--card)]">
          {achados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => abrir(p.id)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                {p.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      {termo.length >= 2 && achados.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Nenhum produto com esse nome.</p>
      )}
    </div>
  );
}
