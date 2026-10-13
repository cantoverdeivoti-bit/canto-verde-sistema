/**
 * As regras do relatório por e-mail que não dependem de banco: quando ele
 * sai e para quem. Separadas para o teste rodar sem servidor.
 */
import { diaDaSemana } from "@/lib/periodo";

export const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Os e-mails da caixa de texto: um por linha (vírgula e ponto e vírgula também valem), sem repetir. */
export function lerEmails(texto: string): string[] {
  return [
    ...new Set(
      texto
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailValido(e: string) {
  return EMAIL.test(e);
}

/**
 * O cron roda todo dia; isto decide se hoje é dia de mandar. Ligado, no dia
 * da semana escolhido (no calendário da casa) e ainda sem envio hoje — o cron
 * da Vercel pode chamar mais de uma vez, e o dono não pode receber dois.
 */
export function deveEnviar(
  config: { ativo: boolean; diaSemana: number; ultimoEnvioDia: string | null },
  hoje: string,
): boolean {
  return config.ativo && diaDaSemana(hoje) === config.diaSemana && config.ultimoEnvioDia !== hoje;
}
