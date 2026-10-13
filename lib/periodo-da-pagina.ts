import { redirect } from "next/navigation";

import { resolverPeriodo } from "@/lib/periodo";

type Busca = Record<string, string | string[] | undefined>;

/**
 * O período de uma aba de relatório, sempre escrito no endereço.
 *
 * Quando o endereço não traz o período (ou traz um que não vale), a página
 * redireciona para o mesmo endereço com o período que ela de fato mostra.
 * Assim as abas, que leem o período do endereço, levam sempre o que está na
 * tela, e o link copiado abre o mesmo relatório. Os outros filtros do
 * endereço (produto, fornecedor…) seguem junto.
 */
export function periodoDaPagina(
  caminho: string,
  busca: Busca,
  hoje: string,
  padrao?: { de: string; ate: string },
): { de: string; ate: string } {
  const de = typeof busca.de === "string" ? busca.de : undefined;
  const ate = typeof busca.ate === "string" ? busca.ate : undefined;
  const periodo = resolverPeriodo(de, ate, hoje, padrao);
  if (periodo.de !== de || periodo.ate !== ate) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(busca)) if (typeof v === "string" && k !== "de" && k !== "ate") params.set(k, v);
    params.set("de", periodo.de);
    params.set("ate", periodo.ate);
    redirect(`${caminho}?${params.toString()}`);
  }
  return periodo;
}
