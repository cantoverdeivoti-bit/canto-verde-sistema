import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { configuracaoEventos } from "@/lib/eventos-dados";
import { precoNoCampo } from "@/lib/format";

import { ConfiguracaoForm } from "./configuracao-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações · Eventos" };

const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Os números que todo orçamento novo usa. Mudar aqui não reescreve orçamento antigo. */
export default async function ConfiguracoesEventosPage() {
  await guardModule("eventos", { configure: true });
  const c = await configuracaoEventos();
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Configurações de eventos"
        subtitulo="Valem para os orçamentos criados daqui para frente. Os que já existem guardam os números com que nasceram."
      />
      <ConfiguracaoForm
        inicial={{
          margemAlvoPct: pct(c.margemAlvoPct),
          impostoPct: pct(c.impostoPct),
          taxaServicoPct: pct(c.taxaServicoPct),
          sinalPct: pct(c.sinalPct),
          validadeDias: String(c.validadeDias),
          capacidadeSentados: String(c.capacidadeSentados),
          capacidadeEmPe: c.capacidadeEmPe === null ? "" : String(c.capacidadeEmPe),
          valorLocacao: precoNoCampo(c.valorLocacao),
          condicoes: c.condicoes ?? "",
        }}
      />
    </Pagina>
  );
}
