import { diaDaSemana, periodoDoRelatorio } from "../lib/periodo";
import { deveEnviar, lerEmails } from "../lib/relatorio-regras";
import { relatorioAgendadoSchema } from "../lib/validations";

/**
 * As regras do relatório por e-mail, sem banco: o período que cada opção
 * cobre (com virada de mês e de ano), quando o cron decide mandar, e a lista
 * de e-mails.
 *
 *   npx tsx scripts/test-relatorio.ts
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}
const igual = (a: { de: string; ate: string }, de: string, ate: string) => a.de === de && a.ate === ate;

// --- Período ----------------------------------------------------------------
{
  // Terça, 06/10/2026.
  const terca = "2026-10-06";
  check("terça é dia 2", diaDaSemana(terca) === 2, diaDaSemana(terca));
  const p = (t: string, hoje = terca) => periodoDoRelatorio(t, hoje);
  check("semana passada: segunda 28/09 a domingo 04/10", igual(p("semana-passada"), "2026-09-28", "2026-10-04"), p("semana-passada"));
  check("semana passada vista do domingo: a semana anterior inteira", igual(p("semana-passada", "2026-10-04"), "2026-09-21", "2026-09-27"), p("semana-passada", "2026-10-04"));
  check("semana passada vista da segunda", igual(p("semana-passada", "2026-10-05"), "2026-09-28", "2026-10-04"), p("semana-passada", "2026-10-05"));
  check("7 dias: até ontem", igual(p("7"), "2026-09-29", "2026-10-05"), p("7"));
  check("14 dias", igual(p("14"), "2026-09-22", "2026-10-05"), p("14"));
  check("mês passado", igual(p("mes-passado"), "2026-09-01", "2026-09-30"), p("mes-passado"));
  check("mês até ontem", igual(p("mes"), "2026-10-01", "2026-10-05"), p("mes"));
  check("mês até ontem no dia 1 vira o mês passado", igual(p("mes", "2026-10-01"), "2026-09-01", "2026-09-30"), p("mes", "2026-10-01"));
  check("virada de ano: mês passado em janeiro", igual(p("mes-passado", "2027-01-12"), "2026-12-01", "2026-12-31"), p("mes-passado", "2027-01-12"));
  check("virada de ano: semana passada", igual(p("semana-passada", "2027-01-05"), "2026-12-28", "2027-01-03"), p("semana-passada", "2027-01-05"));
  check("fevereiro bissexto", igual(p("mes-passado", "2028-03-02"), "2028-02-01", "2028-02-29"), p("mes-passado", "2028-03-02"));
}

// --- Quando o cron manda -------------------------------------------------------
{
  const base = { ativo: true, diaSemana: 2, ultimoEnvioDia: null as string | null };
  check("ligado, terça, sem envio: manda", deveEnviar(base, "2026-10-06"));
  check("quarta: não manda", !deveEnviar(base, "2026-10-07"));
  check("já mandou hoje: não manda de novo", !deveEnviar({ ...base, ultimoEnvioDia: "2026-10-06" }, "2026-10-06"));
  check("mandou semana passada: manda", deveEnviar({ ...base, ultimoEnvioDia: "2026-09-29" }, "2026-10-06"));
  check("desligado: não manda", !deveEnviar({ ...base, ativo: false }, "2026-10-06"));
}

// --- E-mails ------------------------------------------------------------------
{
  const l = lerEmails("Dono@Casa.com\n\n gerente@casa.com ; dono@casa.com,cozinha@casa.com");
  check("e-mails: separa por linha, vírgula e ponto e vírgula, sem repetir", l.join() === "dono@casa.com,gerente@casa.com,cozinha@casa.com", l);
  const ok = relatorioAgendadoSchema.safeParse({ ativo: true, diaSemana: 2, periodo: "7", emails: "a@b.com\nc@d.com", celular: false });
  check("schema: válido passa e normaliza", ok.success && ok.data.emails === "a@b.com\nc@d.com", ok);
  const ruim = relatorioAgendadoSchema.safeParse({ ativo: true, diaSemana: 2, periodo: "7", emails: "a@b.com\nerrado", celular: false });
  check("schema: e-mail errado é recusado, com o endereço na mensagem", !ruim.success && JSON.stringify(ruim.error.issues).includes("errado"));
  const ninguem = relatorioAgendadoSchema.safeParse({ ativo: true, diaSemana: 2, periodo: "7", emails: "", celular: false });
  check("schema: ligado sem e-mail e sem celular é recusado", !ninguem.success);
  const periodo = relatorioAgendadoSchema.safeParse({ ativo: false, diaSemana: 2, periodo: "30", emails: "", celular: true });
  check("schema: período fora da lista é recusado", !periodo.success);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
