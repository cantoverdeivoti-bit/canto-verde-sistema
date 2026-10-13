import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoDaPagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { situacaoDoPrazo } from "@/lib/tarefas-labels";
import { papelEfetivo, podeNaTarefa } from "@/lib/tarefas-permissoes";

import { Quadro, type CartaoRow, type ColunaRow } from "./quadro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quadro — Tarefas" };

/** Iniciais para o cartão: "Joel da Silva" vira JS, "Aline" vira AL. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * O quadro. É a tela principal do módulo.
 *
 * Mostra a coluna CONCLUÍDO só dos últimos sete dias (RF-120), e faz o mesmo
 * com as canceladas. Uma coluna de concluídos que cresce para sempre empurra
 * para fora da tela justamente o que ainda não foi feito — e é o que produziu
 * as colunas "ESVAZIAR E APAGAR" do DELIVERY, que existiam porque não havia
 * outro jeito de limpar.
 *
 * Coluna oculta não aparece (RF-063): o FINANCEIRO não usa LAPIDAR, e mostrar
 * uma coluna vazia para sempre é ruído. Ela continua no banco, para o
 * relatório entre projetos continuar comparando as mesmas etapas.
 */
export default async function QuadroPage({ params }: PageProps<"/admin/tarefas/[projeto]">) {
  const user = await guardModule("tarefas");
  const { projeto: projetoParam } = await params;

  const projetoId = Number(projetoParam);
  if (!Number.isInteger(projetoId) || projetoId <= 0) notFound();

  const agora = new Date();
  const seteDias = new Date(agora.getTime() - 7 * 86_400_000);

  const [projeto, { capacity }] = await Promise.all([
    prisma.projeto.findUnique({
      where: { id: projetoId },
      include: {
        colunas: { where: { oculta: false }, orderBy: { ordem: "asc" } },
        membros: { where: { userId: user.id }, select: { papel: true } },
        setor: { select: { nome: true } },
      },
    }),
    getSettings(),
  ]);
  if (!projeto) notFound();

  const papel = papelEfetivo(user, projeto.membros[0]?.papel ?? null);
  // Privado só para membro (RF-054). Quem não é membro de um quadro aberto
  // entra como leitor: vê e comenta, não escreve.
  if (projeto.privado && papel === null) notFound();

  const tarefas = await prisma.tarefa.findMany({
    where: {
      projetoId,
      excluidoEm: null,
      // Subtarefa não é cartão: aparece dentro da tarefa pai, e o cartão do
      // pai diz quantas faltam. Uma tarefa de vinte passos não vira vinte
      // cartões espalhados pelas colunas.
      tarefaPaiId: null,
      OR: [
        { status: "ABERTA" },
        { status: "CONCLUIDA", concluidoEm: { gte: seteDias } },
        { status: "CANCELADA", atualizadoEm: { gte: seteDias } },
      ],
    },
    // Fixadas primeiro, a mais recente no topo; depois a ordem de sempre.
    orderBy: [{ fixadaEm: { sort: "desc", nulls: "last" } }, { ordem: "asc" }, { id: "asc" }],
    include: {
      responsavel: { select: { id: true, name: true, username: true } },
      _count: { select: { comentarios: true, anexos: true } },
      filhas: { where: { excluidoEm: null, status: { not: "CANCELADA" } }, select: { status: true } },
      etiquetas: {
        select: { etiqueta: { select: { nome: true } } },
        orderBy: { etiqueta: { nome: "asc" } },
      },
    },
  });

  /* Desde quando cada cartão está na coluna em que está (RF-116).
     Um groupBy para o quadro inteiro, e não uma consulta por cartão: a
     pergunta é sobre todos eles ao mesmo tempo, e um quadro cheio faria cem
     idas ao banco para desenhar uma tela. */
  const ultimoMovimento = await prisma.movimentoColuna.groupBy({
    by: ["tarefaId"],
    where: { tarefaId: { in: tarefas.map((t) => t.id) } },
    _max: { em: true },
  });
  const desdeQuando = new Map(
    ultimoMovimento.map((m) => [m.tarefaId, m._max.em] as const),
  );

  const timezone = capacity.timezone;

  const colunas: ColunaRow[] = projeto.colunas.map((c) => ({
    id: c.id,
    nome: c.nome,
    estado: c.estado,
    wipPorPessoa: c.wipPorPessoa,
    alertaLaranjaDias: c.alertaLaranjaDias,
    alertaVermelhoDias: c.alertaVermelhoDias,
  }));

  const cartoes: CartaoRow[] = tarefas.map((t) => {
    const nome = t.responsavel?.name ?? t.responsavel?.username ?? null;
    const desde = desdeQuando.get(t.id) ?? null;
    return {
      id: t.id,
      titulo: t.titulo,
      colunaId: t.colunaId,
      status: t.status,
      prioridade: t.prioridade,
      responsavel:
        t.responsavel && nome
          ? { id: t.responsavel.id, nome, iniciais: iniciais(nome) }
          : null,
      // Calculado aqui, no servidor, e não no cartão: "hoje" depende do
      // relógio de quem calcula, e no navegador o relógio é o do aparelho.
      prazo: situacaoDoPrazo(t.prazo, t.prazoDiaInteiro, timezone, agora),
      diasNaColuna:
        desde === null
          ? null
          : Math.floor((agora.getTime() - desde.getTime()) / 86_400_000),
      comentarios: t._count.comentarios,
      anexos: t._count.anexos,
      fixada: t.fixadaEm !== null,
      subtarefas:
        t.filhas.length === 0
          ? null
          : { feitas: t.filhas.filter((f) => f.status === "CONCLUIDA").length, total: t.filhas.length },
      etiquetas: t.etiquetas.map((e) => e.etiqueta.nome),
      aguardando: t.aguardandoDescricao,
      temResponsavel: t.responsavelId !== null,
      aguardandoPreenchido: Boolean(t.aguardandoDescricao && t.aguardandoPrevisao),
      temDocumento: Boolean(t.documentoUrl),
    };
  });

  const membros = await prisma.adminUser.findMany({
    where: { isActive: true, projetosMembro: { some: { projetoId } } },
    orderBy: [{ name: "asc" }, { username: "asc" }],
    select: { id: true, name: true, username: true },
  });

  return (
    <div>
      <CabecalhoDaPagina
        titulo={
          <>
            {projeto.nome}
            {projeto.setor && (
              <span className="ml-3 text-xs font-normal text-[var(--muted-foreground)]">
                {projeto.setor.nome}
              </span>
            )}
          </>
        }
        subtitulo={projeto.descricao && <p className="max-w-2xl">{projeto.descricao}</p>}
        acoes={
          <div className="flex flex-wrap gap-x-4 text-sm">
            <Link
              href={`/admin/tarefas/lista?projeto=${projeto.id}`}
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Ver em lista
            </Link>
            {podeNaTarefa(papel, "gerenciarMembros") && (
              <Link
                href={`/admin/tarefas/${projeto.id}/membros`}
                className="text-[var(--primary)] underline-offset-4 hover:underline"
              >
                Membros
              </Link>
            )}
            <Link
              href="/admin/tarefas"
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Todos os quadros
            </Link>
          </div>
        }
      />

      <Quadro
        projetoId={projeto.id}
        colunas={colunas}
        cartoes={cartoes}
        membros={membros.map((m) => ({ id: m.id, nome: m.name ?? m.username }))}
        papel={papel}
        souEu={user.id}
      />
    </div>
  );
}
