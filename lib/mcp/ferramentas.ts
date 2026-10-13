import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/server";

import { getSettings, toDateOnly } from "@/lib/availability";
import { projecaoDoMes, situacaoDaMeta } from "@/lib/cmo";
import { dadosDoCmo, hojeDaCasa } from "@/lib/cmo-do-banco";
import { ATUALIZACAO_ESPERANDO } from "@/lib/convites-colaborador";
import { prisma } from "@/lib/db";
import { segundaDaSemana, somarDias, textoDoWhatsApp } from "@/lib/escala";
import { carregarSemana } from "@/lib/escala-do-banco";
import { DIAS_DA_SEMANA, UNIT_LABEL, diaDaSemanaHoje, diaDaqui, diaISO } from "@/lib/format";
import {
  avisosNaoLidos,
  avisosParaAgir,
  bonificacoesQueNaoVieram,
  contarDecisoes,
  idealSugeridoPendente,
  pendenciasDeCompras,
} from "@/lib/pendencias";
import { situacaoDasRotinas } from "@/lib/rotina-de-hoje";
import { can, type CurrentUser, type OpcoesDaTrava } from "@/lib/roles";

/**
 * As ferramentas do MCP: só leitura, cada uma com a trava do módulo dela,
 * como a tela correspondente. Quem chama é a pessoa dona do token
 * (`lib/mcp/acesso.ts`), e ela vê aqui o mesmo que veria no painel.
 *
 * Fora de propósito, por cuidado com dados pessoais (LGPD): CPF, endereço,
 * telefone e e-mail de cliente e de colaborador, e salário de cada pessoa.
 * O CMO sai só em totais.
 */

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

/** A resposta de uma ferramenta: o dado em JSON, que o Claude lê bem. */
const resposta = (dado: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(dado, null, 2) }] });
const recusa = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], isError: true });

/** Quem está chamando, posto pelo `verifyToken` da rota. */
function quem(ctx: Ctx): CurrentUser | null {
  const u = ctx.http?.authInfo?.extra?.usuario;
  return u && typeof u === "object" ? (u as CurrentUser) : null;
}

/** Roda a ferramenta só para quem entra no módulo. */
function comTrava<A>(modulo: string, opcoes: OpcoesDaTrava, fazer: (args: A, user: CurrentUser) => Promise<unknown>) {
  return async (args: A, ctx: Ctx) => {
    const user = quem(ctx);
    if (!user) return recusa("Token inválido.");
    if (!can(user, modulo, opcoes)) return recusa("Você não tem acesso a este módulo no Canto Verde.");
    return resposta(await fazer(args, user));
  };
}

const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD.");

export function registrarFerramentas(server: McpServer) {
  server.registerTool(
    "resumo_de_hoje",
    {
      title: "Resumo de hoje",
      description:
        "Os números do dia no restaurante Canto Verde: reservas, pendências de Compras e do Departamento pessoal, pedidos a receber e atrasados, avisos não lidos. Só o que a pessoa pode ver.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    async (_args: Record<string, never>, ctx: Ctx) => {
      const user = quem(ctx);
      if (!user) return recusa("Token inválido.");
      const { capacity } = await getSettings();
      const tz = capacity.timezone;
      const hoje = diaISO(diaDaqui(0, tz));
      const dia = toDateOnly(hoje);
      const inicio = new Date(`${hoje}T00:00:00.000Z`);
      const out: Record<string, unknown> = { data: hoje, dia_da_semana: DIAS_DA_SEMANA[diaDaSemanaHoje(tz)] };
      if (can(user, "comercial")) {
        const [reservas, pessoas, paraAprovar] = await Promise.all([
          prisma.reservation.count({ where: { serviceDate: dia, status: { in: ["CONFIRMED", "PENDING"] } } }),
          prisma.reservation.aggregate({
            where: { serviceDate: dia, status: { in: ["CONFIRMED", "PENDING"] } },
            _sum: { partySize: true },
          }),
          prisma.reservation.count({ where: { status: "PENDING" } }),
        ]);
        out.reservas = { hoje: reservas, pessoas_hoje: pessoas._sum.partySize ?? 0, esperando_aprovacao: paraAprovar };
      }
      if (can(user, "compras")) {
        const aberto = { estatus: { not: "CANCELADO" as const }, entregaConfirmada: false };
        const [decisoes, aReceber, atrasados, naoLidos] = await Promise.all([
          contarDecisoes(),
          prisma.pedidoCompra.count({ where: aberto }),
          prisma.pedidoCompra.count({ where: { ...aberto, dataEntregaPrevista: { lt: inicio } } }),
          avisosNaoLidos(),
        ]);
        out.compras = {
          pendencias_para_decidir: decisoes,
          pedidos_a_receber: aReceber,
          pedidos_atrasados: atrasados,
          avisos_nao_lidos: naoLidos,
        };
      }
      if (can(user, "pessoal")) {
        const [cadastros, atualizacoes] = await Promise.all([
          prisma.colaborador.count({ where: { pendente: true } }),
          prisma.conviteColaborador.count({ where: ATUALIZACAO_ESPERANDO }),
        ]);
        out.pessoal = { cadastros_esperando_aprovacao: cadastros, atualizacoes_de_cadastro_esperando_aprovacao: atualizacoes };
      }
      return resposta(out);
    },
  );

  server.registerTool(
    "reservas",
    {
      title: "Reservas",
      description:
        "As reservas entre duas datas (AAAA-MM-DD), com dia, hora, nome do cliente, número de pessoas, situação e observação. Sem as datas, os próximos 7 dias. No máximo 31 dias por vez.",
      inputSchema: z.object({ de: DATA.optional(), ate: DATA.optional() }),
      annotations: SO_LEITURA,
    },
    comTrava<{ de?: string; ate?: string }>("comercial", {}, async ({ de, ate }) => {
      const { capacity } = await getSettings();
      const tz = capacity.timezone;
      const inicio = de ?? diaISO(diaDaqui(0, tz));
      const fimPedido = ate ?? somarDias(inicio, 6);
      const fim = fimPedido < inicio ? inicio : fimPedido > somarDias(inicio, 30) ? somarDias(inicio, 30) : fimPedido;
      const linhas = await prisma.reservation.findMany({
        where: { serviceDate: { gte: toDateOnly(inicio), lte: toDateOnly(fim) } },
        orderBy: [{ startTime: "asc" }],
        select: { serviceDate: true, startTime: true, customerName: true, partySize: true, status: true, source: true, notes: true },
      });
      return {
        de: inicio,
        ate: fim,
        total: linhas.length,
        reservas: linhas.map((r) => ({
          data: diaISO(r.serviceDate),
          hora: formatInTimeZone(r.startTime, tz, "HH:mm"),
          cliente: r.customerName,
          pessoas: r.partySize,
          situacao: r.status,
          origem: r.source,
          observacao: r.notes,
        })),
      };
    }),
  );

  server.registerTool(
    "pendencias_de_compras",
    {
      title: "Pendências de Compras",
      description:
        "O que espera decisão em Compras: produtos novos, ofertas de fornecedor, correções sugeridas, recebimentos com diferença, avisos que pedem ação, ideais sugeridos e bonificações que não vieram. Mais a contagem de cadastros incompletos.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    comTrava<Record<string, never>>("compras", {}, async () => {
      const [p, avisos, ideais, bonificacoes] = await Promise.all([
        pendenciasDeCompras(),
        avisosParaAgir(),
        idealSugeridoPendente(),
        bonificacoesQueNaoVieram(),
      ]);
      return {
        produtos_novos: p.produtosNovos.map((x) => ({ nome: x.nome, quantidade: x.quantidade?.toNumber?.() ?? x.quantidade })),
        ofertas_de_fornecedor: p.ofertas.map((o) => ({ nome: o.nome, fornecedor: o.fornecedor, cotacao: o.cotacaoData })),
        correcoes_sugeridas: p.correcoes.map((c) => ({ nome: c.nome, origem: c.origem, observacao: c.observacoes })),
        recebimentos_com_diferenca: p.divergencias.map((d) => ({ pedido: d.id, fornecedor: d.fornecedor, itens: d.itens.length })),
        avisos_que_pedem_acao: avisos.map((a) => ({ fornecedor: a.fornecedor, titulo: a.titulo, detalhe: a.detalhe })),
        ideais_sugeridos: ideais.map((i) => ({
          produto: i.produto,
          compra_de_rotina: i.requisicao,
          ideal_atual: i.idealAtual,
          ideal_sugerido: i.idealSugerido,
        })),
        bonificacoes_que_nao_vieram: bonificacoes.map((b) => ({ pedido: b.pedidoId, fornecedor: b.fornecedor, o_que: b.texto })),
        cadastros_incompletos: {
          produtos_sem_estoque_ideal: p.semIdeal.length,
          produtos_sem_codigo: p.semCodigo.length,
          produtos_sem_quem_cote: p.semQuemCote.length,
          fornecedores_sem_telefone: p.fornSemTelefone.length,
        },
      };
    }),
  );

  server.registerTool(
    "pedidos_em_aberto",
    {
      title: "Pedidos em aberto",
      description:
        "Os pedidos de compra que ainda não chegaram: fornecedor, situação, entrega prevista, se está atrasado e quantos itens. Os atrasados primeiro.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    comTrava<Record<string, never>>("compras", {}, async () => {
      const { capacity } = await getSettings();
      const hoje = diaISO(diaDaqui(0, capacity.timezone));
      const pedidos = await prisma.pedidoCompra.findMany({
        where: { estatus: { not: "CANCELADO" }, entregaConfirmada: false },
        orderBy: [{ dataEntregaPrevista: "asc" }, { id: "asc" }],
        select: {
          id: true,
          estatus: true,
          dataEntregaPrevista: true,
          precoTotal: true,
          createdAt: true,
          fornecedor: { select: { name: true, apelido: true } },
          _count: { select: { itens: true } },
        },
      });
      return pedidos.map((p) => {
        const entrega = p.dataEntregaPrevista ? diaISO(p.dataEntregaPrevista) : null;
        return {
          pedido: p.id,
          fornecedor: p.fornecedor.apelido ?? p.fornecedor.name,
          situacao: p.estatus,
          feito_em: diaISO(p.createdAt),
          entrega_prevista: entrega,
          atrasado: entrega !== null && entrega < hoje,
          itens: p._count.itens,
          total: p.precoTotal.toNumber(),
        };
      });
    }),
  );

  server.registerTool(
    "estoque_abaixo_do_minimo",
    {
      title: "Estoque abaixo do mínimo",
      description: "Os produtos ativos com o estoque da última contagem abaixo do mínimo cadastrado, com o ideal e a categoria.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    comTrava<Record<string, never>>("compras", {}, async () => {
      const produtos = await prisma.product.findMany({
        where: { isActive: true, minStock: { not: null } },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        select: { name: true, unit: true, currentStock: true, minStock: true, idealStock: true, category: { select: { name: true } } },
      });
      return produtos
        .filter((p) => p.currentStock.lessThan(p.minStock!))
        .map((p) => ({
          produto: p.name,
          categoria: p.category?.name ?? null,
          unidade: UNIT_LABEL[p.unit],
          estoque: p.currentStock.toNumber(),
          minimo: p.minStock!.toNumber(),
          ideal: p.idealStock?.toNumber() ?? null,
        }));
    }),
  );

  server.registerTool(
    "compras_de_rotina_de_hoje",
    {
      title: "Compras de rotina de hoje",
      description:
        "As compras de rotina do dia (fornecedor e dia da semana): a contagem da rotina em andamento (quantos produtos já contados) e se o pedido já saiu e foi enviado.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    comTrava<Record<string, never>>("compras", {}, async () => {
      const { capacity } = await getSettings();
      const tz = capacity.timezone;
      const listas = await prisma.listaCompra.findMany({
        where: { diaSemana: diaDaSemanaHoje(tz), ativa: true },
        select: { id: true, fornecedor: { select: { name: true, apelido: true } }, _count: { select: { itens: true } } },
      });
      const situacao = await situacaoDasRotinas(
        listas.map((l) => l.id),
        tz,
      );
      return {
        dia: DIAS_DA_SEMANA[diaDaSemanaHoje(tz)],
        compras: listas.map((l) => {
          const { contagem, pedido } = situacao.get(l.id)!;
          return {
            fornecedor: l.fornecedor.apelido ?? l.fornecedor.name,
            produtos: l._count.itens,
            contagem_em_andamento: contagem ? { contados: contagem.feitos, de: contagem.total } : null,
            pedido: pedido ? { numero: pedido.id, enviado: pedido.enviado, itens: pedido.itens } : null,
          };
        }),
      };
    }),
  );

  server.registerTool(
    "escala_da_semana",
    {
      title: "Escala da semana",
      description:
        "A escala do almoço de uma semana (segunda a domingo), por dia e posto, no mesmo texto que vai para o WhatsApp. Informe qualquer data da semana (AAAA-MM-DD); sem data, a semana atual.",
      inputSchema: z.object({ data: DATA.optional() }),
      annotations: SO_LEITURA,
    },
    comTrava<{ data?: string }>("pessoal", {}, async ({ data }) => {
      const segunda = segundaDaSemana(data ?? (await hojeDaCasa()));
      const { semana, postos, pessoas } = await carregarSemana(segunda);
      return { segunda, texto: textoDoWhatsApp(semana, postos, pessoas) };
    }),
  );

  server.registerTool(
    "cmo_do_mes",
    {
      title: "CMO do mês",
      description:
        "A projeção do custo de mão de obra de um mês padrão, só em totais (por tipo de contrato, encargos e benefícios), com o faturamento usado, o % e a meta. Só para quem configura o Departamento pessoal.",
      inputSchema: z.object({}),
      annotations: SO_LEITURA,
    },
    comTrava<Record<string, never>>("pessoal", { configure: true }, async () => {
      const { pessoas, itens, meta, faturamentoMensal, fonte } = await dadosDoCmo(await hojeDaCasa());
      const p = projecaoDoMes({ pessoas, itens, faturamentoMensal });
      return {
        total: p.total,
        clt: p.clt.total,
        fixo: p.fixo.total,
        free_lancer: p.free.total,
        encargos: p.encargos,
        beneficios: p.beneficios,
        pessoas_na_conta: p.linhas.length,
        faturamento_do_mes: p.faturamento,
        de_onde_vem_o_faturamento: fonte,
        percentual_do_faturamento: p.percentual,
        meta_percentual: meta,
        situacao: situacaoDaMeta(p.percentual, meta),
      };
    }),
  );
}
