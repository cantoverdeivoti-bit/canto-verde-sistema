import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";

import { formatDayMonthTime, formatDiaCurtoString, formatDiaNumerico, nomeDaCotacao } from "@/lib/format";

import { FluxoCompra } from "../fluxo-compra";
import { ListaContagens } from "./lista-contagens";
import { RotinasDeHoje, rotinasDeHoje } from "../listas/rotinas-de-hoje";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contar estoque — Compras" };

/**
 * Onde a semana de compra começa.
 *
 * Contar era o primeiro passo dentro da Cotação, feito por quem compra, logado
 * no painel. Passou a ser trabalho do estoquista: ele recebe um link, percorre
 * a despensa com o celular e fecha a contagem. Só depois, e a partir de uma
 * contagem pronta, nasce a rodada de cotação.
 *
 * A separação não é organizacional, é prática — quem anda pela prateleira não
 * é quem decide a compra, e não deveria precisar de senha do painel para
 * anotar o que viu.
 */
export default async function ContagemPage() {
  // O quadro das rotinas de hoje começa a buscar assim que se sabe o fuso,
  // junto com o resto da tela, e não depois dela.
  const configuracoes = getSettings();
  configuracoes.then((s) => rotinasDeHoje(s.capacity.timezone)).catch(() => {});

  const [user, contagens, categorias, pessoas, settings, totais, faltamAbertas] = await Promise.all([
    guardModule("compras", { atalho: true }),
    prisma.contagem.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        token: true,
        expiresAt: true,
        concluida: true,
        canceladaEm: true,
        cotacaoId: true,
        cotacao: { select: { dataInicio: true } },
        processadaEm: true,
        listaCompra: { select: { nome: true, fornecedor: { select: { name: true, apelido: true } } } },
        createdAt: true,
        categoryIds: true,
        responsavel: { select: { name: true, username: true } },
        // Só os nomes do que ainda espera decisão. O cartão diz que existem e
        // quais são; quem decide é a tela de Produtos, que tem o formulário.
        produtosNovos: {
          where: { status: "PENDENTE" },
          orderBy: { createdAt: "asc" },
          select: { nome: true },
        },
        // Só o NÚMERO de pedidos diretos: os pedidos em si moram em
        // Recebimentos, e aqui eles só decidem se a contagem já virou compra.
        // Antes vinham inteiros — fornecedor, itens e produto de cada um, para
        // vinte contagens — só para a lista contar quantos eram.
        _count: { select: { pedidosCompraDiretos: true } },
      },
    }),
    // Só categorias com produto ativo: oferecer para contar uma gaveta vazia é
    // mandar o estoquista a uma prateleira que não existe.
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    }),
    // Quem pode receber o pedido de contagem. Só ativos: desligado não conta.
    prisma.adminUser.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { username: "asc" }],
      select: { id: true, name: true, username: true },
    }),
    configuracoes,
    // Quantos itens cada contagem tem e quantos já foram contados, somados no
    // banco. Antes vinham todas as linhas de item das vinte contagens (uns
    // seis mil) só para a tela contar quantas eram.
    prisma.$queryRaw<{ contagemId: number; total: bigint; contados: bigint }[]>`
      SELECT "contagemId",
             count(*) AS total,
             count(*) FILTER (WHERE "quantidadeContada" IS NOT NULL) AS contados
        FROM "contagem_itens"
       WHERE "contagemId" IN (SELECT id FROM "contagens" ORDER BY "createdAt" DESC LIMIT 20)
       GROUP BY "contagemId"`,
    // O que falta contar nas abertas entre as mesmas vinte, sem esperar a lista
    // acima. Só as vinte: contagem que venceu sem ninguém fechar fica aberta
    // para sempre, e todas elas trariam centenas de itens a cada visita.
    prisma.$queryRaw<{ contagemId: number; nome: string; categoria: string | null; ordem: number | null }[]>`
      SELECT ci."contagemId", p."name" AS nome, c."name" AS categoria, c."sortOrder" AS ordem
        FROM "contagem_itens" ci
        JOIN "contagens" k ON k.id = ci."contagemId"
        JOIN "products" p ON p.id = ci."produtoId"
        LEFT JOIN "categories" c ON c.id = p."categoryId"
       WHERE ci."quantidadeContada" IS NULL AND NOT k."concluida" AND k."canceladaEm" IS NULL
         AND ci."contagemId" IN (SELECT id FROM "contagens" ORDER BY "createdAt" DESC LIMIT 20)`,
  ]);
  const totalDe = new Map(totais.map((t) => [t.contagemId, { total: Number(t.total), contados: Number(t.contados) }]));

  const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c.name]));
  // As categorias que dá para contar: a contagem que pega todas diz "todas",
  // em vez de onze nomes empilhados no cartão.
  const contaveis = categorias.filter((c) => c._count.products > 0).map((c) => c.id);
  const agora = new Date();
  const timezone = settings.capacity.timezone;

  // O que falta contar nas que ainda não fecharam, por categoria: é o "ver o
  // que falta" do cartão, para saber se o que importa já foi contado.
  const naoFechadas = contagens.filter((c) => !c.concluida && c.canceladaEm === null).map((c) => c.id);
  const faltam = faltamAbertas.filter((f) => naoFechadas.includes(f.contagemId));
  const faltandoPor = new Map<number, Map<string, { ordem: number; nomes: string[] }>>();
  for (const f of faltam) {
    const porCategoria = faltandoPor.get(f.contagemId) ?? new Map();
    faltandoPor.set(f.contagemId, porCategoria);
    const cat = f.categoria ?? "Sem categoria";
    const g = porCategoria.get(cat) ?? { ordem: f.ordem ?? 999, nomes: [] };
    g.nomes.push(f.nome);
    porCategoria.set(cat, g);
  }
  const faltandoDe = (id: number) =>
    [...(faltandoPor.get(id) ?? new Map<string, { ordem: number; nomes: string[] }>())]
      .sort(([a, x], [b, y]) => x.ordem - y.ordem || a.localeCompare(b, "pt-BR"))
      .map(([categoria, g]) => ({ categoria, nomes: g.nomes.sort((a, b) => a.localeCompare(b, "pt-BR")) }));

  return (
    <Pagina>
      {/* Sem `contagemIds` aqui: nesta tela a escolha ainda não foi feita, e
          quem dá endereço ao passo do meio é a seleção — o botão "Conferir"
          da própria lista. O passo aparece cinza, dizendo o que vem. */}
      {/* No celular a trilha virava "1 Contar estoque › 2 › 3 › 4 › 5", que não
          diz nada: fica só no computador. */}
      <CabecalhoDaPagina titulo="Contar estoque" />
      <div className="hidden sm:block">
        <FluxoCompra etapa="contagem" />
      </div>
      <RotinasDeHoje timezone={timezone} />

      <ListaContagens
        peloLink={user.atalho}
        categorias={categorias
          .filter((c) => c._count.products > 0)
          .map((c) => ({ id: c.id, name: c.name, produtos: c._count.products }))}
        pessoas={pessoas.map((p) => ({
          id: p.id,
          nome: p.name ?? p.username,
        }))}
        contagens={contagens.map((c) => {
          const { total, contados } = totalDe.get(c.id) ?? { total: 0, contados: 0 };
          return {
            id: c.id,
            token: c.token,
            concluida: c.concluida,
            cotacaoId: c.cotacaoId,
            cotacaoNome: c.cotacao ? nomeDaCotacao(c.cotacao.dataInicio, timezone) : null,
            pedidosDiretos: c._count.pedidosCompraDiretos,
            processada: c.processadaEm !== null,
            vencida: c.expiresAt < agora,
            cancelada: c.canceladaEm !== null,
            // Venceu sem finalizar há menos de uma semana: fica no alto,
            // pedindo uma decisão (finalizar com o contado, mais prazo ou
            // descartar), em vez de sumir entre as anteriores.
            parada:
              !c.concluida &&
              c.canceladaEm === null &&
              c.expiresAt < agora &&
              c.expiresAt.getTime() > agora.getTime() - 7 * 24 * 60 * 60 * 1000,
            faltando: faltandoDe(c.id),
            // Formatado aqui, e não no card: o card é cliente, e o
            // relógio do navegador do dono não é o mesmo do servidor da
            // Vercel. Quem sabe o fuso da casa é esta página.
            expiraEmTexto: formatDayMonthTime(c.expiresAt, timezone),
            // Instante puro, para o relógio do cartão contar o que falta.
            expiraEmIso: c.expiresAt.toISOString(),
            // Com hora, e não só o dia: o card recolhido usa isto como
            // título, e três contagens do mesmo dia dariam três títulos
            // idênticos numa lista de linhas fechadas.
            // Mês em número e sem hora, a pedido do dono: "sexta-feira, 25/09".
            abertaEmTexto: formatDiaNumerico(c.createdAt, timezone),
            // Curto, para a linha das anteriores caber: "quinta, 01/10".
            abertaEmCurto: formatDiaCurtoString(formatInTimeZone(c.createdAt, timezone, "yyyy-MM-dd")),
            // Só o fornecedor: o dia da semana já está na data da linha.
            lista: c.listaCompra ? (c.listaCompra.fornecedor.apelido ?? c.listaCompra.fornecedor.name) : null,
            contados,
            total,
            produtosNovos: c.produtosNovos.map((p) => p.nome),
            responsavel:
              c.responsavel?.name ?? c.responsavel?.username ?? null,
            categorias:
              contaveis.length > 1 && contaveis.every((id) => c.categoryIds.includes(id))
                ? "Todas as categorias"
                : c.categoryIds.map((id) => nomeDaCategoria.get(id) ?? "categoria apagada").join(" · "),
          };
        })}
      />

      <p className="hint">
        O estoquista não precisa de senha: o link é a credencial, e ele vence
        na hora que você escolher. Item deixado em branco não vira zero: o
        estoque dele fica como estava, porque não contar não é dizer que acabou.
      </p>
    </Pagina>
  );
}
