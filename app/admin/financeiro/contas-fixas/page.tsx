import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { opcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA } from "@/lib/format";

import { ListaDeContasFixas } from "./lista-de-contas-fixas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas fixas · Financeiro" };

/**
 * O que se repete todo mês: aluguel, contador, internet. Cadastrada uma vez,
 * a conta aparece sozinha em Contas a pagar, no mês corrente e no seguinte,
 * para ninguém depender da memória.
 */
export default async function ContasFixasPage() {
  const [recorrencias, opcoes] = await Promise.all([
    prisma.recorrencia.findMany({
      orderBy: [{ ativo: "desc" }, { diaVencimento: "asc" }, { descricao: "asc" }],
      include: {
        categoria: { select: { nome: true, ativo: true, subgrupo: { select: { ativo: true } } } },
        fornecedor: { select: { name: true, apelido: true } },
        conta: { select: { nome: true } },
        centroCusto: { select: { nome: true } },
      },
    }),
    opcoesDoFinanceiro(),
  ]);
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Contas fixas"
        subtitulo="O que se paga todo mês, lançado sozinho."
        ajuda="Valor que muda todo mês (luz, água) também entra aqui: o lançamento nasce com o valor de referência e se corrige quando a conta chegar."
      />
      <ListaDeContasFixas
        hoje={todayInTimezone(FUSO_DA_CASA)}
        opcoes={opcoes}
        itens={recorrencias.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          descricao: r.descricao,
          categoriaId: r.categoriaId,
          categoria: r.categoria.nome,
          categoriaDesligada: !r.categoria.ativo || !r.categoria.subgrupo.ativo,
          contaId: r.contaId,
          conta: r.conta?.nome ?? null,
          fornecedorId: r.fornecedorId,
          fornecedor: r.fornecedor ? (r.fornecedor.apelido ?? r.fornecedor.name) : null,
          centroCustoId: r.centroCustoId,
          centro: r.centroCusto?.nome ?? null,
          valor: r.valor.toNumber(),
          diaVencimento: r.diaVencimento,
          inicio: dateOnlyToString(r.inicio).slice(0, 7),
          fim: r.fim ? dateOnlyToString(r.fim).slice(0, 7) : null,
          ativo: r.ativo,
        }))}
      />
    </Pagina>
  );
}
