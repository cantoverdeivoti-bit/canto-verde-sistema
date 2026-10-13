import { enviarAosAparelhos, notificacoesConfiguradas, type Notificacao } from "@/lib/celular";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { REMETENTE, enderecoDoSite, resend } from "@/lib/email";
import { escolhaDe, lerPreferencias, moduloDo, soQuemConfigura, type ChaveDeEvento } from "@/lib/notificacoes";
import { inicioDeHoje } from "@/lib/requisicao";
import type { TipoAviso } from "@/generated/prisma/client";

type Aparelho = { endpoint: string; p256dh: string; auth: string };

/**
 * Quem recebe um evento, e por onde: as contas ativas que entram no módulo
 * dele (superusuário entra em tudo) e que deixaram o canal ligado. Evento
 * `soQuemConfigura` vai só a quem configura o módulo. O e-mail só vale para
 * quem cadastrou um.
 */
export async function destinatarios(evento: ChaveDeEvento): Promise<{ aparelhos: Aparelho[]; emails: string[] }> {
  const modulo = moduloDo(evento);
  const permissao = soQuemConfigura(evento) ? { moduleSlug: modulo, canConfigure: true } : { moduleSlug: modulo };
  const pessoas = await prisma.adminUser.findMany({
    where: { isActive: true, OR: [{ superusuario: true }, { permissions: { some: permissao } }] },
    select: {
      email: true,
      notificacoes: true,
      celulares: { select: { endpoint: true, p256dh: true, auth: true } },
    },
  });
  const aparelhos: Aparelho[] = [];
  const emails: string[] = [];
  for (const p of pessoas) {
    const escolha = escolhaDe(lerPreferencias(p.notificacoes), evento);
    if (escolha.celular) aparelhos.push(...p.celulares);
    if (escolha.email && p.email) emails.push(p.email);
  }
  return { aparelhos, emails: [...new Set(emails)] };
}

/** O e-mail de um aviso: o mesmo texto do celular, com o link inteiro. */
export async function enviarEmailDeAviso(para: string, n: Notificacao): Promise<boolean> {
  if (!resend) return false;
  const site = enderecoDoSite();
  const link = site ? `${site}${n.url}` : null;
  const r = await resend.emails.send({
    from: REMETENTE,
    to: para,
    subject: n.titulo,
    text: [n.corpo, link && `\nAbrir: ${link}`, "\nPara mudar o que você recebe: Configurações gerais → Minhas notificações."]
      .filter(Boolean)
      .join("\n"),
  });
  if (r.error) {
    console.error("[notificar] Resend recusou:", r.error);
    return false;
  }
  return true;
}

/**
 * Manda um aviso a quem escolheu receber, no celular e no e-mail. Um e-mail
 * por pessoa, para ninguém ver o endereço do outro. Devolve quantos
 * chegaram, para quem quiser dizer na tela (o relatório de compras).
 *
 * Nunca derruba quem chamou: aviso que falhou é um aviso a menos, e vai só
 * para o log. Quem chama de dentro de uma ação usa `after()`, para quem
 * clicou não esperar o envio.
 */
export async function notificar(evento: ChaveDeEvento, n: Notificacao): Promise<{ celulares: number; emails: number }> {
  const nada = { celulares: 0, emails: 0 };
  try {
    if (!notificacoesConfiguradas() && !resend) return nada;
    const { aparelhos, emails } = await destinatarios(evento);
    const [celulares, ...enviados] = await Promise.all([
      enviarAosAparelhos(aparelhos, n).catch(() => 0),
      ...emails.map((e) => enviarEmailDeAviso(e, n).catch(() => false)),
    ]);
    return { celulares: Number(celulares) || 0, emails: enviados.filter(Boolean).length };
  } catch (err) {
    console.error(`[notificar] ${evento} falhou:`, err);
    return nada;
  }
}

/** O evento de cada aviso de Compras. */
const EVENTO_DO_AVISO: Record<TipoAviso, ChaveDeEvento> = {
  PEDIDO_RESPONDIDO: "compras-fornecedor",
  ITEM_EM_FALTA: "compras-fornecedor",
  COTACAO_RESPONDIDA: "compras-fornecedor",
  COTACAO_RECUSADA: "compras-fornecedor",
  RECEBIDO_OK: "compras-recebimento",
  RECEBIDO_COM_DIFERENCA: "compras-divergencia",
};

/**
 * Leva um aviso de Compras a quem escolheu receber. Lido do banco pelo id, e
 * não recebido pronto, porque roda depois da resposta: se a transação que o
 * gravou desfez tudo, o aviso não existe e ninguém é avisado de algo que não
 * aconteceu.
 */
export async function avisarDoAviso(avisoId: number): Promise<void> {
  try {
    const aviso = await prisma.avisoCompra.findUnique({
      where: { id: avisoId },
      select: { tipo: true, titulo: true, detalhe: true, fornecedor: { select: { name: true } } },
    });
    if (!aviso) return;
    await notificar(EVENTO_DO_AVISO[aviso.tipo], {
      titulo: `${aviso.fornecedor?.name ?? "Fornecedor"} ${aviso.titulo}`,
      corpo: aviso.detalhe ?? "",
      url: "/admin/compras/pendencias?aba=avisos",
      etiqueta: `aviso-${avisoId}`,
    });
  } catch (err) {
    console.error("[avisarDoAviso] falha:", err);
  }
}

/**
 * Avisa que a contagem foi finalizada: quem contou e quanto. A contagem
 * geral leva à lista de itens para compra; a da compra de rotina diz o
 * pedido que saiu dela e leva a ele, pronto para mandar.
 */
export async function avisarContagemFinalizada(contagemId: number): Promise<void> {
  try {
    const c = await prisma.contagem.findUnique({
      where: { id: contagemId },
      select: {
        concluida: true,
        recado: true,
        responsavel: { select: { name: true, username: true } },
        _count: { select: { itens: true } },
        itens: { where: { quantidadeContada: { not: null } }, select: { id: true } },
        listaCompra: { select: { id: true, nome: true } },
      },
    });
    if (!c?.concluida) return;
    const quem = c.responsavel?.name ?? c.responsavel?.username ?? "O estoquista";
    if (c.listaCompra) {
      // O pedido da rotina de hoje: o que esta contagem criou, ou aquele em que ela juntou itens.
      const { capacity } = await getSettings();
      const pedido = await prisma.pedidoCompra.findFirst({
        where: {
          listaCompraId: c.listaCompra.id,
          createdAt: { gte: inicioDeHoje(capacity.timezone) },
          estatus: { not: "CANCELADO" },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, estatus: true },
      });
      // O estoquista não envia: o pedido espera quem compra, e é a ele que o aviso vai.
      const esperando = pedido && (pedido.estatus === "CRIADO" || pedido.estatus === "AGUARDANDO_FORNECEDOR");
      await notificar("compras-pedido-para-enviar", {
        titulo: esperando
          ? `Compra de rotina ${c.listaCompra.nome}: pedido #${pedido.id} para enviar`
          : `Compra de rotina ${c.listaCompra.nome} contada`,
        corpo: [`${quem} contou ${c.itens.length} de ${c._count.itens} itens.`, esperando && "Revise e mande ao fornecedor.", c.recado]
          .filter(Boolean)
          .join(" "),
        url: pedido ? `/admin/compras/pedidos/${pedido.id}` : "/admin/compras/listas",
        etiqueta: `contagem-${contagemId}`,
      });
      return;
    }
    await notificar("compras-contagem", {
      titulo: "Contagem finalizada",
      corpo: [`${quem} contou ${c.itens.length} de ${c._count.itens} itens.`, c.recado].filter(Boolean).join(" "),
      url: `/admin/compras/conferir?c=${contagemId}`,
      etiqueta: `contagem-${contagemId}`,
    });
  } catch (err) {
    console.error("[avisarContagemFinalizada] falha:", err);
  }
}
