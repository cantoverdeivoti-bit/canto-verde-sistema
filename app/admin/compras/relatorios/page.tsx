import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { dadosDoPainel } from "@/lib/painel-compras";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { bonificacoesRecebidas, economiaNegociada, instantesDoPeriodo } from "@/lib/relatorios-compras";

import { AcoesDoPainel } from "./acoes-do-painel";
import { TelaDoPainel } from "./painel";
import { FiltroDePeriodo } from "./periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel — Relatórios" };

/**
 * O painel executivo: o que pede decisão, os quatro números, a evolução e a
 * curva ABC. As contas moram em `lib/painel-compras`; o desenho, em
 * `./painel`.
 */
export default async function PainelPage({ searchParams }: PageProps<"/admin/compras/relatorios">) {
  await guardModule("compras");
  const [{ capacity }, q] = await Promise.all([getSettings(), searchParams]);
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios", q, hoje);
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);
  const [dados, economia, bonificacao] = await Promise.all([
    dadosDoPainel(de, ate, tz, hoje),
    economiaNegociada(inicio, fim),
    bonificacoesRecebidas(inicio, fim),
  ]);

  return (
    <TelaDoPainel
      dados={dados}
      economia={economia}
      bonificacao={{ valor: bonificacao.valor, itens: bonificacao.itens }}
      topo={
        // Na ordem do padrão das telas: os quadrados de ação (o PDF), depois
        // o cartão do filtro.
        <>
          <AcoesDoPainel de={de} ate={ate} />
          <FiltroDePeriodo caminho="/admin/compras/relatorios" de={de} ate={ate} hoje={hoje} />
        </>
      }
    />
  );
}
