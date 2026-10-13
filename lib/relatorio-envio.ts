import { formatInTimeZone } from "date-fns-tz";

import { getSettings, todayInTimezone } from "@/lib/availability";
import { notificacoesConfiguradas } from "@/lib/celular";
import { prisma } from "@/lib/db";
import { REMETENTE, enderecoDoSite, resend } from "@/lib/email";
import { notificar } from "@/lib/notificar";
import { periodoDoRelatorio } from "@/lib/periodo";
import { dadosDoRelatorio } from "@/lib/relatorio-agendado";
import { assuntoDoRelatorio, relatorioEmHtml, relatorioEmTexto } from "@/lib/relatorio-email";
import { relatorioEmPdf } from "@/lib/relatorio-pdf";
import { deveEnviar, emailValido, lerEmails } from "@/lib/relatorio-regras";

/**
 * O relatório de compras do começo ao fim: a configuração, o período, os
 * dados, o PDF, o e-mail e o aviso em Notificações (cada pessoa escolhe em
 * Minhas notificações se recebe no celular, no e-mail ou nada). Quem chama é o cron (todo dia,
 * e aqui se decide se hoje é o dia) ou o botão "Enviar agora".
 */

export const CONFIG_PADRAO = {
  ativo: false,
  diaSemana: 2,
  periodo: "semana-passada",
  emails: "",
  celular: true,
  ultimoEnvioEm: null as Date | null,
  ultimoEnvioDia: null as string | null,
};

export async function configDoRelatorio() {
  return (await prisma.relatorioAgendado.findUnique({ where: { id: 1 } })) ?? CONFIG_PADRAO;
}

/** O PDF do período escolhido (ou de um período dado), para baixar ou anexar. */
export async function gerarRelatorio(periodo: { de: string; ate: string } | string) {
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const { de, ate } = typeof periodo === "string" ? periodoDoRelatorio(periodo, hoje) : periodo;
  const dados = await dadosDoRelatorio(de, ate, tz, hoje);
  const pdf = await relatorioEmPdf(dados, formatInTimeZone(new Date(), tz, "dd/MM/yyyy HH:mm"));
  return { dados, pdf, nomeDoArquivo: `relatorio-compras-${de}-a-${ate}.pdf`, hoje };
}

export type ResultadoDoEnvio = {
  enviado: boolean;
  /** Por que não saiu, ou o resumo do que saiu — para mostrar na tela. */
  mensagem: string;
  emails: string[];
  celulares: number;
};

async function enviar(config: Awaited<ReturnType<typeof configDoRelatorio>>): Promise<ResultadoDoEnvio> {
  const emails = lerEmails(config.emails).filter(emailValido);
  // "celular" na configuração é a caixinha "Avisar nas Notificações".
  const querCelular = config.celular && (notificacoesConfiguradas() || Boolean(resend));
  if (emails.length === 0 && !querCelular) {
    return { enviado: false, mensagem: "Nenhum e-mail cadastrado e o aviso nas Notificações está desligado.", emails: [], celulares: 0 };
  }
  if (emails.length > 0 && !resend && !querCelular) {
    return { enviado: false, mensagem: "Falta configurar o envio de e-mail (RESEND_API_KEY na Vercel).", emails: [], celulares: 0 };
  }

  const { dados, pdf, nomeDoArquivo } = await gerarRelatorio(config.periodo);
  const site = enderecoDoSite();
  const caminho = `/admin/compras/relatorios?de=${dados.de}&ate=${dados.ate}`;
  const link = site ? `${site}${caminho}` : null;

  let enviadosPara: string[] = [];
  let erro: string | null =
    emails.length > 0 && !resend ? "O e-mail não saiu: falta configurar o envio (RESEND_API_KEY na Vercel)." : null;
  if (emails.length > 0 && resend) {
    const r = await resend.emails.send({
      from: REMETENTE,
      to: emails,
      subject: assuntoDoRelatorio(dados),
      html: relatorioEmHtml(dados, link),
      text: relatorioEmTexto(dados, link),
      // Em base64, e não o Buffer: o SDK manda o anexo como JSON, e um Buffer
      // vira {"type":"Buffer","data":[...]}, que a API recusa.
      attachments: [{ filename: nomeDoArquivo, content: pdf.toString("base64"), contentType: "application/pdf" }],
    });
    if (r.error) {
      console.error("[relatorio] Resend recusou:", r.error);
      erro = `O Resend recusou o envio: ${r.error.message}`;
    } else enviadosPara = emails;
  }

  let celulares = 0;
  let avisosPorEmail = 0;
  if (querCelular) {
    // O aviso leva direto ao PDF do período (a rota confere a permissão de Compras).
    const r = await notificar("compras-relatorio", {
      titulo: "Relatório de compras pronto",
      corpo: `${dados.de.slice(8, 10)}/${dados.de.slice(5, 7)} a ${dados.ate.slice(8, 10)}/${dados.ate.slice(5, 7)}: toque para baixar o PDF.`,
      url: `/admin/compras/relatorios/pdf?de=${dados.de}&ate=${dados.ate}`,
      etiqueta: "relatorio-de-compras",
    });
    celulares = r.celulares;
    avisosPorEmail = r.emails;
  }

  const partes = [
    enviadosPara.length > 0 && `e-mail com o PDF para ${enviadosPara.join(", ")}`,
    celulares > 0 && `aviso em ${celulares} celular(es)`,
    avisosPorEmail > 0 && `aviso por e-mail para ${avisosPorEmail} pessoa(s)`,
  ].filter(Boolean);
  if (partes.length === 0) {
    return {
      enviado: false,
      mensagem: erro ?? "Nada foi enviado: nenhum e-mail recebeu e ninguém ligou este aviso em Minhas notificações.",
      emails: [],
      celulares: 0,
    };
  }
  return { enviado: true, mensagem: `Enviado: ${partes.join(" e ")}.${erro ? ` ${erro}` : ""}`, emails: enviadosPara, celulares };
}

/** O botão "Enviar agora": manda já, com a configuração gravada, sem mexer no controle do cron. */
export async function enviarRelatorioAgora(): Promise<ResultadoDoEnvio> {
  return enviar(await configDoRelatorio());
}

/**
 * O cron. Marca o dia ANTES de mandar, num update condicionado: se a Vercel
 * chamar duas vezes ao mesmo tempo, só uma ganha a marca e manda. Se o envio
 * falhar por inteiro, a marca volta, para uma nova tentativa no mesmo dia
 * poder mandar.
 */
export async function enviarRelatorioDoDia(): Promise<ResultadoDoEnvio & { hoje: string }> {
  const { capacity } = await getSettings();
  const hoje = todayInTimezone(capacity.timezone);
  const config = await configDoRelatorio();
  if (!deveEnviar(config, hoje)) {
    const mensagem = !config.ativo
      ? "Relatório desligado."
      : config.ultimoEnvioDia === hoje
        ? "Já enviado hoje."
        : "Hoje não é dia de relatório.";
    return { enviado: false, mensagem, emails: [], celulares: 0, hoje };
  }

  const marcou = await prisma.relatorioAgendado.updateMany({
    where: { id: 1, OR: [{ ultimoEnvioDia: null }, { ultimoEnvioDia: { not: hoje } }] },
    data: { ultimoEnvioDia: hoje, ultimoEnvioEm: new Date() },
  });
  if (marcou.count === 0) return { enviado: false, mensagem: "Já enviado hoje.", emails: [], celulares: 0, hoje };

  try {
    const r = await enviar(config);
    if (!r.enviado) {
      await prisma.relatorioAgendado.update({
        where: { id: 1 },
        data: { ultimoEnvioDia: config.ultimoEnvioDia, ultimoEnvioEm: config.ultimoEnvioEm },
      });
    }
    return { ...r, hoje };
  } catch (err) {
    await prisma.relatorioAgendado.update({
      where: { id: 1 },
      data: { ultimoEnvioDia: config.ultimoEnvioDia, ultimoEnvioEm: config.ultimoEnvioEm },
    });
    throw err;
  }
}
