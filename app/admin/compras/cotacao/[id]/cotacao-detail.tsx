"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";

import { CabecalhoDaPagina, CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { autorizarOfertaNova, recusarOfertaNova } from "@/lib/actions/compras";
import { COTACAO_LABEL, corDoTom } from "@/lib/cotacao-labels";
import { UNIT_LABEL, formatAmount, formatMoney } from "@/lib/format";
import type { VisualDaCotacao } from "@/lib/visual-cotacao";
import type { CotacaoStatus, ProductUnit } from "@/generated/prisma/client";

import { BonificacoesCombinadas } from "../../bonificacao-form";
import { PedidoCard, type PedidoRow } from "../../pedido-card";
import type { ProdutoParaPedido } from "../../pedidos/seletor-de-produto";
import type { BonificacaoParaMostrar } from "@/lib/bonificacoes";
import { AcoesDaCotacao } from "./acoes-da-cotacao";
import type { OrcamentoDaSemana } from "@/lib/orcamento";
import { Comparativo, type FornecedorRow, type ItemRow } from "./comparativo";
import type { ForaDaLista } from "./vincular-fornecedor";

export type CategoriaOpcao = { id: number; name: string };

/**
 * Uma oferta que o fornecedor fez por conta própria.
 *
 * Ela não é linha da cotação: nenhum `CotacaoItem` existe para ela, e por
 * isso ela não entra no comparativo. É uma proposta esperando o dono dizer
 * se aquilo vira produto da casa.
 */
type OfertaRow = {
  id: number;
  fornecedor: string;
  nome: string;
  unit: ProductUnit;
  embalagem: string;
  conteudo: number;
  precoEmbalagem: number;
  marca: string;
  observacoes: string | null;
};

export function CotacaoDetail({
  cotacao,
  itens,
  fornecedores,
  categorias,
  categoriasDaCotacao,
  foraDaLista,
  visualInicial,
  telaGrandeNoServidor,
  orcamento,
  ofertas,
  pedidos,
  bonificacoes,
  depoisDoTitulo,
}: {
  cotacao: {
    id: number;
    estatus: CotacaoStatus;
    dataInicio: string;
    /** "Cotação de 02/10". */
    nome: string;
    temPedido: boolean;
    convitesEmAberto: number;
    /** Chamados que não responderam a tempo: "Reabrir prazo" os chama de novo. */
    convitesExpirados: number;
    /** "quinta, 24/09 às 18:00", no fuso da casa; nulo sem prazo. */
    prazoTexto: string | null;
  };
  itens: ItemRow[];
  fornecedores: FornecedorRow[];
  categorias: CategoriaOpcao[];
  /** As gavetas dos itens desta rodada. É por elas que a lista de
      fornecedores é montada, e é o que o painel marca com • para ele saber
      quais importam aqui. */
  categoriasDaCotacao: number[];
  /** Fornecedores ativos que nenhuma das duas redes trouxe para esta rodada. */
  foraDaLista: ForaDaLista[];
  /** Lista ou mapa, como ele deixou da última vez. Vem do cookie. */
  visualInicial: VisualDaCotacao;
  /** O palpite do servidor: computador (true) ou celular. */
  telaGrandeNoServidor: boolean;
  /** O orçamento de compra da semana, para o comparativo mostrar. */
  orcamento: OrcamentoDaSemana;
  ofertas: OfertaRow[];
  pedidos: PedidoRow[];
  /** Por fornecedor com compra escolhida: o que foi combinado de bonificação. */
  bonificacoes: {
    fornecedores: {
      id: number;
      nome: string;
      produtos: ProdutoParaPedido[];
      lista: BonificacaoParaMostrar[];
      editavel: boolean;
    }[];
    todosOsProdutos: ProdutoParaPedido[];
  };
  /** A trilha das etapas da compra, entre o título e as ações. */
  depoisDoTitulo?: ReactNode;
}) {
  /* Esta tela não tem mais estado de fornecedor nenhum.
     Chamar, copiar link, mandar no WhatsApp, tirar o convite e editar o
     cadastro foram para o passo de Fornecedores; cadastrar e vincular foram
     para a barra do comparativo. O que sobrou aqui é o cabeçalho, o aviso de
     item órfão e as ofertas de fora da lista. */
  const orfaos = itens.filter((i) => i.semFornecedor);
  const fechada = cotacao.estatus === "APROVADA";
  const rotulo = COTACAO_LABEL[cotacao.estatus];

  const cabecalho = (
    <div className="space-y-2">
      <CabecalhoDaPagina
        titulo={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {cotacao.nome}
            <span className="selo" style={{ color: corDoTom(rotulo.tom) }}>
              {rotulo.texto}
            </span>
          </span>
        }
      />
      {depoisDoTitulo}
      {/* As ações à esquerda e a volta para a lista na mesma linha, à
          direita: eram três linhas soltas para três coisas pequenas. */}
      <div className="flex flex-wrap items-center gap-2">
        <AcoesDaCotacao
          cotacaoId={cotacao.id}
          estatus={cotacao.estatus}
          temPedido={cotacao.temPedido}
          convitesEmAberto={cotacao.convitesEmAberto}
          convitesExpirados={cotacao.convitesExpirados}
          prazoTexto={cotacao.prazoTexto}
        />
        <Link
          href="/admin/compras/cotacao"
          className="ml-auto text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Todas as cotações
        </Link>
      </div>
    </div>
  );

  // Descartada: não vira compra. A tela diz isso e não oferece mais nada.
  if (cotacao.estatus === "DESCARTADA") {
    return (
      <div>
        {cabecalho}
        <p className="msg-warn mt-6 max-w-2xl">
          Esta cotação foi descartada: não vira compra, e os links dos
          fornecedores não aceitam mais resposta.
        </p>
      </div>
    );
  }

  // A contagem não virou lista de compras: a rodada foi gravada e a sugestão
  // não chegou a rodar, ou nada estava abaixo do ideal. Sem itens não há
  // candidatos, e a tela renderizava "0 itens · 0 de 0 fornecedores" sobre
  // duas seções vazias que se contradiziam — sem nenhum caminho de volta.
  if (cotacao.estatus === "CONTANDO" && itens.length === 0) {
    return (
      <div>
        {cabecalho}
        <div className="msg-warn mt-6 max-w-2xl">
          <p className="font-semibold">Esta cotação parou na contagem</p>
          <p className="mt-1">
            Nenhum item entrou na lista de compras, então não há o que cotar
            nem a quem perguntar. Ou a contagem não chegou ao fim, ou tudo o
            que foi contado já estava no estoque ideal.
          </p>
        </div>
        <Button asChild size="lg" className="mt-4">
          <Link href="/admin/compras/contagem">Contar de novo</Link>
        </Button>
      </div>
    );
  }

  return (
    /* `data-secao` liga o relevo dos botões desta seção — a regra mora em
       `globals.css`, e é uma só para as trinta caixas clicáveis que esta
       tela tem. */
    <div data-secao="cotacao">
      {/* A linha "109 itens a comprar · 9 de 9 fornecedores responderam" saiu.
          Os dois números já estão na tela: o de itens é o tamanho da tabela
          logo abaixo, e quem respondeu é exatamente quem virou coluna nela. */}
      {cabecalho}

      {/* Dito aqui em cima, não na linha da tabela: quem abre a cotação
          precisa saber antes de mandar os links, enquanto ainda dá para
          cadastrar quem vende. Descobrir isso depois é esperar por uma
          resposta que nunca viria.

          Sai de `.hint` para `.msg-warn`: é o aviso mais consequente da tela
          — item que ninguém vende nunca recebe preço — e estava no estilo de
          MENOR ênfase do sistema, cinza e em corpo 12.

          Some com a cotação fechada: mandar cadastrar fornecedor "senão ele
          fica sem preço" não tem o que salvar depois do pedido gerado. */}
      {orfaos.length > 0 && !fechada && (
        <div className="msg-warn mt-3 max-w-2xl">
          <p className="font-semibold">
            {orfaos.length === 1
              ? "1 item não tem fornecedor que o venda"
              : `${orfaos.length} itens não têm fornecedor que os venda`}
          </p>
          <p className="mt-1">
            {/* O link aponta para o passo de Fornecedores, que é onde isto
                tem conserto desde que a lista saiu daqui. Antes mandava para
                Produtos, que resolve só metade — o vínculo item a item — e
                deixava de fora cadastrar quem vende. */}
            {orfaos.map((i) => i.nome).join(", ")}. Cadastre quem vende, ou
            vincule alguém que já existe, em{" "}
            <Link
              href={`/admin/compras/enviar?cotacao=${cotacao.id}`}
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Fornecedores
            </Link>
            .
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* O que os fornecedores ofereceram e a casa nunca pediu.

          Fora do comparativo de propósito: não existe CotacaoItem para
          nenhum destes, então não há com o que comparar. Aqui é decisão de
          cadastro, não de compra. */}
      {ofertas.length > 0 && (
        <section className="mt-8">
          <h2 className="section-label">
            Ofertas de fora da lista · {ofertas.length}
          </h2>
          <p className="hint">
            Produtos que o fornecedor disse ter e que não estão no seu cadastro.
            Aceitar cria o produto já vinculado a ele.
          </p>
          <ul className="mt-3 space-y-3">
            {ofertas.map((o) => (
              <OfertaCard key={o.id} o={o} categorias={categorias} />
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Cadastrar e vincular moraram aqui por um tempo, entre o aviso e a
          tabela. Foram para a barra de filtros do comparativo: lá eles ficam
          com os outros comandos da tela e não custam uma linha de altura em
          toda visita. O componente recebe as props deles justamente por
          isso. */}
      <Comparativo
        cotacaoId={cotacao.id}
        estatus={cotacao.estatus}
        itens={itens}
        fornecedores={fornecedores}
        categorias={categorias}
        categoriasDaCotacao={categoriasDaCotacao}
        foraDaLista={foraDaLista}
        visualInicial={visualInicial}
        telaGrandeNoServidor={telaGrandeNoServidor}
        orcamento={orcamento}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Bonificação: o que cada fornecedor escolhido dá de graça ou abate.
          Fora do rodapé das colunas porque lá não cabe um formulário; aqui,
          um bloco por fornecedor, e o que for combinado vai junto para o
          pedido quando a compra for confirmada. */}
      {bonificacoes.fornecedores.length > 0 && (
        <section className="mt-10">
          <h2 className="section-label">Bonificação negociada</h2>
          <p className="hint mt-1">
            Unidades a mais, brinde, desconto na nota ou crédito. O preço de tabela não muda: a
            bonificação vai no pedido, na mensagem ao fornecedor e é conferida no recebimento.
          </p>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {bonificacoes.fornecedores.map((f) => (
              <li key={f.id} className="card space-y-3 p-4">
                <p className="font-semibold">{f.nome}</p>
                <BonificacoesCombinadas
                  alvo={{ cotacaoId: cotacao.id, fornecedorId: f.id }}
                  existentes={f.lista}
                  produtosDoPedido={f.produtos}
                  todosOsProdutos={bonificacoes.todosOsProdutos}
                  editavel={f.editavel}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Os pedidos que saíram desta cotação, só para ler: a entrada é em
          Recebimentos, e cada pedido diz isso no fim. */}
      {pedidos.length > 0 && (
        <div className="mt-10">
          <CartaoDeSecao icone={FileText} titulo="Pedidos" frase="Os pedidos que saíram desta cotação.">
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
              {pedidos.map((p) => (
                <PedidoCard key={p.id} pedido={p} embutido />
              ))}
            </ul>
          </CartaoDeSecao>
        </div>
      )}
    </div>
  );
}

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/**
 * Uma oferta esperando decisão.
 *
 * O nome, a unidade e a gaveta são editáveis porque o que chegou é o nome do
 * catálogo DELE — "AZEITE EXTRA VIRGEM ANDORINHA 500ML CX" não é nome de
 * prateleira desta casa. O resto da oferta é dele e fica como texto: preço,
 * marca e embalagem descrevem o que ele vende, não o que a casa cadastra.
 *
 * O preço por unidade aparece calculado pelo mesmo motivo do link do
 * fornecedor: é o número que torna a oferta comparável com o que a casa já
 * paga, e ninguém deveria ter que fazer essa divisão de cabeça.
 */
function OfertaCard({
  o,
  categorias,
}: {
  o: OfertaRow;
  categorias: CategoriaOpcao[];
}) {
  const [nome, setNome] = useState(o.nome);
  const [unit, setUnit] = useState<ProductUnit>(o.unit);
  const [categoryId, setCategoryId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const porUnidade = o.conteudo > 0 ? o.precoEmbalagem / o.conteudo : null;

  function aceitar() {
    setErro(null);
    startTransition(async () => {
      const r = await autorizarOfertaNova(o.id, { nome, unit, categoryId });
      if (!r.ok) setErro(r.message ?? "Não foi possível cadastrar.");
    });
  }

  function dispensar() {
    setErro(null);
    startTransition(async () => {
      const r = await recusarOfertaNova(o.id);
      if (!r.ok) setErro(r.message ?? "Não foi possível dispensar.");
    });
  }

  return (
    <li className="card max-w-2xl p-4">
      <p className="text-xs text-[var(--muted-foreground)]">{o.fornecedor} ofereceu</p>
      <p className="mt-0.5 font-medium">{o.nome}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {o.embalagem} com {formatAmount(o.conteudo)} {UNIT_LABEL[o.unit]} ·{" "}
        {formatMoney(o.precoEmbalagem)}
        {porUnidade !== null && (
          <>
            {" · "}
            <strong className="num-display text-[var(--foreground)]">
              {formatMoney(porUnidade)}
            </strong>{" "}
            por {UNIT_LABEL[o.unit]}
          </>
        )}
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        marca {o.marca}
        {o.observacoes && ` · ${o.observacoes}`}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_1fr]">
        <label className="text-xs">
          <span className="mb-1 block font-medium">Cadastrar como</span>
          <Input
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            className="h-11 w-full"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Unidade</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as ProductUnit)}
            className="field h-11 w-full bg-[var(--surface)] py-0"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Categoria</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="field h-11 w-full bg-[var(--surface)] py-0"
          >
            <option value="">sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && (
        <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">
          {erro}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={aceitar} disabled={pendente}>
          Cadastrar produto
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={dispensar}
          disabled={pendente}
        >
          Dispensar
        </Button>
      </div>
    </li>
  );
}
