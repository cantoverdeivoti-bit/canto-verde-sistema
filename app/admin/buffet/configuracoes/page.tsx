import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { configuracaoDoBuffet, gruposDoBuffet } from "@/lib/buffet-dados";

import { ConfiguracoesDoBuffet } from "./configuracoes-do-buffet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações · Cardápio buffet" };

/**
 * Os grupos do buffet (posições, meta de custo/kg e cor), os limites da
 * Classe A/B/C e os parâmetros da operação do forno, como a 1. CONFIG e a
 * 4. FLUXO da planilha. Os temas de cada dia ficam no próprio cardápio.
 */
export default async function ConfiguracoesDoBuffetPage() {
  await guardModule("buffet", { configure: true });
  const [grupos, config] = await Promise.all([gruposDoBuffet(), configuracaoDoBuffet()]);
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Configurações do buffet" />
      <ConfiguracoesDoBuffet
        grupos={grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, posicoes: g.posicoes, metaCustoKg: g.metaCustoKg }))}
        config={{
          limiteClasseA: config.limiteClasseA,
          limiteClasseB: config.limiteClasseB,
          inicioTurno: config.inicioTurno,
          aberturaBuffet: config.aberturaBuffet,
          encerramentoBuffet: config.encerramentoBuffet,
          fimTurno: config.fimTurno,
          inicioVespera: config.inicioVespera,
          fornos: config.fornos,
          gnPorForno: config.gnPorForno,
          cozinheiros: config.cozinheiros,
          cicloDefumacaoHoras: config.cicloDefumacaoHoras,
          cicloLimpezaMin: config.cicloLimpezaMin,
        }}
      />
    </Pagina>
  );
}
