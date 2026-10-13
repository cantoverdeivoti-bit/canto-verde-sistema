import { GRUPO_DRE } from "@/lib/financeiro";
import type { OpcoesDoFinanceiro } from "@/lib/financeiro-dados";

type Categoria = Pick<OpcoesDoFinanceiro["categorias"][number], "id" | "nome" | "grupo" | "subgrupo">;

/**
 * As opções de um select de categoria, agrupadas por "Grupo · Subgrupo" na
 * ordem do plano de contas (a lista já chega ordenada). `atual` é a categoria
 * de um lançamento antigo que foi desligada: aparece marcada, em vez de o
 * select voltar para "Escolha" e a pessoa salvar outra sem perceber.
 */
export function OpcoesDeCategoria({ categorias, atual }: { categorias: Categoria[]; atual?: { id: number; nome: string } | null }) {
  const blocos: { rotulo: string; itens: Categoria[] }[] = [];
  for (const c of categorias) {
    const rotulo = `${GRUPO_DRE[c.grupo]} · ${c.subgrupo}`;
    const ultimo = blocos[blocos.length - 1];
    if (ultimo?.rotulo === rotulo) ultimo.itens.push(c);
    else blocos.push({ rotulo, itens: [c] });
  }
  const desligada = atual && !categorias.some((c) => c.id === atual.id) ? atual : null;
  return (
    <>
      <option value="">Escolha</option>
      {desligada && <option value={desligada.id}>{desligada.nome} (desligada)</option>}
      {blocos.map((b) => (
        <optgroup key={b.rotulo} label={b.rotulo}>
          {b.itens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
