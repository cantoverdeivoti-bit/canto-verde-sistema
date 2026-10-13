import { guardModule } from "@/lib/auth-guard";
import { formatMoney } from "@/lib/format";
import { CANAIS_DE_VENDA, UNIDADES_DE_VENDA } from "@/lib/receituario-regras";
import { vendasComCustos } from "@/lib/receituario-vendas";

import { FolhaDeImpressao } from "../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de preços" };

/**
 * A lista de preços do balcão, numa folha: só o nome e o preço, sem custo.
 * `?canal=ENCOMENDA` ou `?canal=DELIVERY` imprime um canal só.
 */
export default async function ImprimirListaDePrecosPage({ searchParams }: PageProps<"/imprimir/receituario/precos">) {
  await guardModule("receituario", { configure: true });
  const q = await searchParams;
  const canal = CANAIS_DE_VENDA.find((c) => c.chave === q.canal)?.chave;
  const { itens } = await vendasComCustos();
  const visiveis = itens.filter((i) => i.ativo && i.precoVenda !== null && (!canal || i.canal === canal));
  const canais = CANAIS_DE_VENDA.filter((c) => !canal || c.chave === canal);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <FolhaDeImpressao>
      <header className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-2xl font-bold">Lista de preços</h1>
        <span className="text-sm">{hoje}</span>
      </header>
      {visiveis.length === 0 && <p>Nenhum item com preço na lista.</p>}
      {canais.map((c) => {
        const doCanal = visiveis.filter((i) => i.canal === c.chave);
        if (doCanal.length === 0) return null;
        return (
          <section key={c.chave} className="mb-5 break-inside-avoid">
            <h2 className="mb-1 text-lg font-bold">{c.nome}</h2>
            <table className="w-full text-[13px]">
              <tbody>
                {doCanal.map((i) => (
                  <tr key={i.id} className="border-b border-gray-300">
                    <td className="py-1.5 pr-4">{i.nome}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-semibold">
                      {formatMoney(i.precoVenda!)}
                      <span className="font-normal">{UNIDADES_DE_VENDA.find((u) => u.chave === i.unidadeVenda)?.curto}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </FolhaDeImpressao>
  );
}
