import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";

import { GradeDeAtalhos } from "@/components/cartoes-de-atalho";
import { IconeNav } from "@/components/icone-nav";
import { IndicadorDeLink } from "@/components/indicador-de-link";
import { getSettings, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDayAndMonth } from "@/lib/format";
import { agruparSecoes, MODULES, type EcosystemModule, type NomeDoIcone } from "@/lib/modules";
import { lerPreferencia, montarPagina, type ChaveDeNumero } from "@/lib/pagina-inicial";
import { contadoresDaCasa } from "@/lib/contadores";
import { BLOCOS_DE_AVISO } from "@/lib/blocos-de-aviso";
import { cadastrosIncompletos } from "@/lib/cadastro-incompleto";
import { avisosNaoLidosPorBloco } from "@/lib/pendencias";
import { paraFazerHoje } from "@/lib/para-fazer";
import { CabecalhoDaPagina } from "@/components/pagina";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";

import { ParaFazerHoje } from "./para-fazer-hoje";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início — Painel" };

type Numero = {
  chave: ChaveDeNumero;
  href: string;
  valor: number;
  rotulo: string;
  nota: string | null;
  /** Linhas tocáveis dentro do cartão: as pendências de Compras e Pessoal, os blocos das notificações. */
  partes?: { href: string; nome: string; valor: number; cor?: string }[];
};
type Atalho = { href: string; titulo: string; icone: NomeDoIcone };

/**
 * A home em três andares, do mais urgente ao mais raro: os números de hoje,
 * os atalhos do dia a dia em cartões grandes de tocar, e o mapa completo de
 * cada módulo fechado numa linha que abre. Antes eram dezessete links
 * pequenos em fila, e o dono procurava a tela em vez de tocar nela.
 *
 * Que números e atalhos aparecem, e em que ordem, cada pessoa escolhe em
 * Configurações gerais → Página inicial (`lib/pagina-inicial.ts`).
 */
export default async function EcosystemHome() {
  const [user, { capacity }] = await Promise.all([getCurrentUser(), getSettings()]);
  const today = todayInTimezone(capacity.timezone);
  const hoje = toDateOnly(today);
  const amanha = new Date(hoje.getTime() + 86_400_000);

  const veReservas = can(user, "comercial");
  const veCompras = can(user, "compras");
  const vePessoal = can(user, "pessoal");

  // A escolha da pessoa já vem com o usuário (`getCurrentUser`).
  const pagina = montarPagina(lerPreferencia(user && !user.atalho ? user.paginaInicial : null), (m) => can(user, m));
  const mostra = (c: ChaveDeNumero) => pagina.numeros.some((n) => n.chave === c);

  // Só conta o que a pessoa pode abrir: o número é dado vivo do módulo, e
  // mostrá-lo a quem não entra nele seria contar o que tem lá dentro.
  // Só conta o que vai aparecer: número escondido não custa consulta.
  const contaReservas = veReservas && mostra("reservas");
  const contaReceber = veCompras && mostra("receber");
  const contaPendencias = mostra("pendencias");
  const contaAvisos = veCompras && mostra("notificacoes");
  // O cartão "Para fazer hoje" aparece para quem entra em algum módulo que tem o que fazer no dia.
  const temParaFazer = user !== null && ["tarefas", "compras", "financeiro", "eventos"].some((m) => can(user, m));
  const [reservasHoje, paraAprovar, contadores, aReceber, chegamHoje, naoLidosPorBloco, incompletos, paraFazer] = await Promise.all([
    contaReservas
      ? prisma.reservation.count({
          where: { serviceDate: hoje, status: { in: ["CONFIRMED", "PENDING"] } },
        })
      : 0,
    contaReservas ? prisma.reservation.count({ where: { status: "PENDING" } }) : 0,
    // Os mesmos números do menu, guardados por alguns segundos
    // (`lib/contadores.ts`): o layout já pediu, e aqui não vai ao banco.
    contaPendencias || contaAvisos ? contadoresDaCasa() : null,
    // O mesmo critério da tela de Recebimentos, para os dois números baterem.
    contaReceber
      ? prisma.pedidoCompra.count({ where: { estatus: { not: "CANCELADO" }, entregaConfirmada: false } })
      : 0,
    contaReceber
      ? prisma.pedidoCompra.count({
          where: {
            estatus: { not: "CANCELADO" },
            entregaConfirmada: false,
            dataEntregaPrevista: { gte: hoje, lt: amanha },
          },
        })
      : 0,
    contaAvisos ? avisosNaoLidosPorBloco() : { divergencia: 0, recebido: 0, outros: 0 },
    // Colaboradores ativos com o cadastro pela metade: entram nas pendências da casa.
    contaPendencias && vePessoal ? cadastrosIncompletos().then((l) => l.length) : 0,
    temParaFazer ? paraFazerHoje(user, capacity.timezone) : null,
  ]);
  const naoLidos = naoLidosPorBloco.divergencia + naoLidosPorBloco.recebido + naoLidosPorBloco.outros;
  const pendCompras = contaPendencias && veCompras ? (contadores?.decisoes ?? 0) : 0;
  // Cadastros que chegaram pelo link e esperam aprovação.
  const pendPessoal = contaPendencias && vePessoal ? (contadores?.cadastrosPendentes ?? 0) : 0;
  const pedemAcao = contaAvisos ? (contadores?.pedemAcao ?? 0) : 0;

  const todos: Record<ChaveDeNumero, Numero> = {
    reservas: {
      chave: "reservas",
      href: "/admin/comercial",
      valor: reservasHoje,
      rotulo: reservasHoje === 1 ? "reserva hoje" : "reservas hoje",
      nota: paraAprovar > 0 ? `${paraAprovar} para aprovar` : null,
    },
    pendencias: {
      chave: "pendencias",
      // Quem só vê um dos dois módulos vai direto para o dele.
      href: veCompras ? "/admin/compras/pendencias" : "/admin/pessoal/pendencias",
      valor: pendCompras + pendPessoal + incompletos,
      rotulo: pendCompras + pendPessoal + incompletos === 1 ? "pendência" : "pendências",
      nota: null,
      // Uma linha para cada tipo de pendência que a pessoa pode ver.
      partes: [
        ...(veCompras ? [{ href: "/admin/compras/pendencias", nome: "Compras", valor: pendCompras }] : []),
        ...(vePessoal
          ? [
              { href: "/admin/pessoal/pendencias", nome: "Pessoal", valor: pendPessoal },
              { href: "/admin/pessoal/pendencias#incompletos", nome: "Cadastros incompletos", valor: incompletos },
            ]
          : []),
      ],
    },
    receber: {
      chave: "receber",
      href: "/admin/compras/recebimentos",
      valor: aReceber,
      rotulo: "a receber",
      nota: chegamHoje > 0 ? `${chegamHoje} ${chegamHoje === 1 ? "chega" : "chegam"} hoje` : null,
    },
    notificacoes: {
      chave: "notificacoes",
      href: "/admin/compras/pendencias?aba=avisos",
      valor: naoLidos,
      rotulo: naoLidos === 1 ? "notificação" : "notificações",
      nota: pedemAcao > 0 ? `${pedemAcao} ${pedemAcao === 1 ? "pede" : "pedem"} ação` : null,
      // Separadas como na aba Avisos: com divergência, recebidos e outros, cada uma abrindo o seu bloco.
      partes: BLOCOS_DE_AVISO.map((b) => ({
        href: `/admin/compras/pendencias?aba=avisos&bloco=${b.chave}`,
        nome: b.nome,
        valor: naoLidosPorBloco[b.chave],
        cor: b.cor,
      })),
    },
  };
  const numeros = pagina.numeros.map((n) => todos[n.chave]);
  const atalhos: Atalho[] = pagina.atalhos.map((a) => ({ href: a.href, titulo: a.nome, icone: a.icone }));

  // Módulo pronto e sem permissão some: mostrá-lo contaria que existe
  // trabalho ali dentro. Os desligados ficam numa linha só, no pé.
  const prontos = MODULES.filter((m) => m.enabled && can(user, m.slug));
  const emPreparacao = MODULES.filter((m) => !m.enabled);

  return (
    <>
      {/* Como no app do banco: o "Olá" com o nome de quem entrou, e o dia e a casa embaixo. */}
      <CabecalhoDaPagina
        titulo={user && !user.atalho ? `Olá, ${(user.name || user.username).trim().split(/\s+/)[0]}` : capacity.name}
        subtitulo={`${capitalizeFirst(formatDayAndMonth(hoje, "UTC"))} · ${capacity.name}`}
      />

      {numeros.length > 0 && (
        <section aria-labelledby="titulo-hoje" className="mt-8">
          <h2 id="titulo-hoje" className="sr-only">
            Hoje
          </h2>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {numeros.map((n) => (
              <li key={n.chave} className="min-w-0">
                {n.partes ? (
                  // Pendências (Compras e Pessoal) e notificações (os três blocos):
                  // o cartão não é um link só, cada linha leva à sua tela (link
                  // dentro de link não existe).
                  <div className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <span className={ROTULO}>{n.rotulo}</span>
                    <span className="num-display mt-1 text-3xl leading-none">{n.valor}</span>
                    {n.nota && (
                      <span className="mt-1 text-xs leading-tight font-semibold" style={{ color: "var(--warn)" }}>
                        {n.nota}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-col">
                      {n.partes.map((p) => (
                        <Link
                          key={p.href}
                          href={p.href}
                          className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold hover:bg-[var(--muted)]"
                          // A cor da prioridade (as notificações) ou o amarelo de sempre; zerada fica cinza.
                          style={{ color: p.valor > 0 ? (p.cor ?? "var(--warn)") : "var(--muted-foreground)" }}
                        >
                          <span className="flex-1">{p.nome}</span>
                          <span className="tabular-nums">{p.valor}</span>
                          <ChevronRight aria-hidden className="size-3.5" />
                        </Link>
                      ))}
                    </span>
                  </div>
                ) : (
                  <Link
                    href={n.href}
                    className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 hover:border-[var(--primary)] active:bg-[var(--muted)]"
                  >
                    <span className={ROTULO}>{n.rotulo}</span>
                    <span className="num-display mt-1 text-3xl leading-none">{n.valor}</span>
                    {n.nota && (
                      <span className="mt-1 text-xs leading-tight font-semibold" style={{ color: "var(--warn)" }}>
                        {n.nota}
                      </span>
                    )}
                    <IndicadorDeLink />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {paraFazer && <ParaFazerHoje itens={paraFazer} />}

      {atalhos.length > 0 && (
        <section aria-labelledby="titulo-atalhos" className="mt-8">
          <h2 id="titulo-atalhos" className="section-label">
            Atalhos
          </h2>
          <div className="mt-3">
            <GradeDeAtalhos itens={atalhos} colunas="sm:grid-cols-6" />
          </div>
        </section>
      )}

      {prontos.length > 0 && (
        <section aria-labelledby="titulo-tudo" className="mt-10">
          <h2 id="titulo-tudo" className="section-label">
            Todas as telas
          </h2>
          <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {prontos.map((m) => (
              <Modulo key={m.slug} modulo={m} />
            ))}
          </div>
        </section>
      )}

      {emPreparacao.length > 0 && (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          Em preparação: {emPreparacao.map((m) => m.name).join(", ")}.
        </p>
      )}

      {/* Para todos, inclusive quem não entra em Configurações gerais: a
          página inicial é de cada um. */}
      {user && !user.atalho && (
        <Link
          href="/admin/sistema/pagina-inicial"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--primary)] underline underline-offset-4"
        >
          <Pencil aria-hidden className="size-3.5" />
          Editar a página inicial
        </Link>
      )}
    </>
  );
}

/**
 * Um módulo numa linha que abre, com as seções nos mesmos grupos da lateral.
 * `<details>` e não estado no cliente: abre sem JavaScript e o leitor de tela
 * já anuncia aberto e fechado.
 */
function Modulo({ modulo }: { modulo: EcosystemModule }) {
  // Na ordem do menu: seções soltas seguidas viram um bloco, e cada grupo,
  // o seu. Antes as soltas subiam todas para o topo, e a lista ficava
  // diferente da lateral.
  const blocos: { nome: string | null; secoes: EcosystemModule["sections"] }[] = [];
  for (const i of agruparSecoes(modulo.sections)) {
    const ultimo = blocos[blocos.length - 1];
    if (i.tipo === "grupo") blocos.push({ nome: i.nome, secoes: i.secoes });
    else if (ultimo && ultimo.nome === null) ultimo.secoes.push(i.secao);
    else blocos.push({ nome: null, secoes: [i.secao] });
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <IconeNav nome={modulo.icone} className="size-5 shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{modulo.name}</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 px-4 pb-4">
        {blocos.map((b) => (
          <div key={b.nome ?? b.secoes[0].href}>
            {b.nome && <h3 className="section-label mb-1.5">{b.nome}</h3>}
            <Secoes secoes={b.secoes} />
          </div>
        ))}
      </div>
    </details>
  );
}

function Secoes({ secoes }: { secoes: EcosystemModule["sections"] }) {
  return (
    <ul className="grid gap-x-4 sm:grid-cols-2">
      {secoes.map((s) => (
        <li key={s.href}>
          <Link
            href={s.href}
            className="flex items-center gap-2 rounded-lg py-2 text-sm font-medium text-[var(--primary)] hover:underline underline-offset-4"
          >
            <IconeNav nome={s.icone} className="size-4 shrink-0" />
            {s.label}
            <IndicadorDeLink />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "sábado, 29 de agosto" -> "Sábado, 29 de agosto". */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** O nome de cada número do alto ("Pendências"), em cima dele e em verde, para se achar de relance. */
const ROTULO = "block text-sm leading-tight font-semibold text-[var(--primary)] first-letter:uppercase";
