import { formatInTimeZone } from "date-fns-tz";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { notificacoesConfiguradas } from "@/lib/celular";
import { prisma } from "@/lib/db";
import { emailConfigurado } from "@/lib/email";
import { diaDaSemana, periodoDoRelatorio, somarDias } from "@/lib/periodo";
import { configDoRelatorio } from "@/lib/relatorio-envio";
import { DIAS_DA_SEMANA } from "@/lib/relatorio-regras";

import { CotacaoForm } from "./cotacao-form";
import { RelatorioForm } from "./relatorio-form";

/** "22/09" */
const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações — Compras" };

/**
 * O que configura o módulo, numa tela só.
 *
 * Hoje é uma seção; a estrutura já é a de várias. Quando prazo de resposta ou
 * critério de aprovação virarem decisão de verdade, entram como `<section>`
 * separada por linha, e nada acima se mexe.
 */
export default async function ComprasSettingsPage() {
  // `configure: true` aqui, e não no layout do módulo: o layout cobre todas
  // as telas de Compras por prefixo, e exigir permissão de configuração nele
  // trancaria Produtos, Categorias, Fornecedores e Cotação para quem só opera.
  await guardModule("compras", { configure: true });

  const [config, relatorio, { capacity }] = await Promise.all([
    prisma.cotacaoSettings.findUnique({ where: { id: 1 } }),
    configDoRelatorio(),
    getSettings(),
  ]);
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  // O próximo dia do envio, contando hoje se ainda não saiu.
  let proximo = hoje;
  while (diaDaSemana(proximo) !== relatorio.diaSemana || relatorio.ultimoEnvioDia === proximo) {
    proximo = somarDias(proximo, 1);
  }
  const cobre = periodoDoRelatorio(relatorio.periodo, proximo);
  const faltas = [
    !emailConfigurado() && "o envio de e-mail (RESEND_API_KEY na Vercel)",
    !process.env.CRON_SECRET && "o agendamento (CRON_SECRET na Vercel)",
    relatorio.celular && !notificacoesConfiguradas() && "as notificações do celular (chaves VAPID na Vercel)",
  ].filter(Boolean) as string[];

  return (
    <Pagina largura="estreita" className="space-y-8">
      <CabecalhoDaPagina titulo="Configurações" />
      <section>
        <h2 className="text-base font-semibold">Cotação</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
          O que o fornecedor lê quando abre o link e vê a lista de itens.
        </p>

        <div className="mt-8 max-w-2xl">
          <CotacaoForm
            initial={{ mensagemFornecedor: config?.mensagemFornecedor ?? "" }}
          />
        </div>
      </section>
      <section className="border-t border-[var(--border)] pt-8">
        <h2 className="text-base font-semibold">Relatório por e-mail</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
          Um resumo dos relatórios de Compras que chega sozinho, uma vez por semana: o que pede
          decisão, as maiores altas de preço, os produtos mais comprados, os fornecedores e o
          orçamento. O detalhe completo vai num PDF anexo.
        </p>

        <div className="mt-4 max-w-2xl space-y-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
          {relatorio.ativo ? (
            <p>
              <span className="font-semibold">Próximo envio:</span> {DIAS_DA_SEMANA[relatorio.diaSemana].toLowerCase()},{" "}
              {diaMes(proximo)}, às 8h, cobrindo de {diaMes(cobre.de)} a {diaMes(cobre.ate)}.
            </p>
          ) : (
            <p className="text-[var(--muted-foreground)]">Desligado: nada sai sozinho.</p>
          )}
          <p className="text-[var(--muted-foreground)]">
            Último envio:{" "}
            {relatorio.ultimoEnvioEm ? formatInTimeZone(relatorio.ultimoEnvioEm, tz, "dd/MM/yyyy 'às' HH:mm") : "nenhum ainda"}.
          </p>
          {faltas.length > 0 && (
            <p className="font-medium text-[var(--warn)]">Falta configurar {faltas.join("; ")}.</p>
          )}
        </div>

        <div className="mt-6 max-w-2xl">
          <RelatorioForm
            initial={{
              ativo: relatorio.ativo,
              diaSemana: relatorio.diaSemana,
              periodo: relatorio.periodo,
              emails: relatorio.emails,
              celular: relatorio.celular,
            }}
          />
        </div>
      </section>
    </Pagina>
  );
}
