"use client";

import {
  Boxes,
  Check,
  CircleDollarSign,
  Crown,
  History,
  Link2,
  Pencil,
  Send,
  Split,
  SquarePen,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";

import { MediaEstrelas } from "@/components/estrelas";
import { LIMITE_DE_ALTA } from "@/lib/curva-abc";
import { ofertasSuspeitas } from "@/lib/preco-suspeito";
import { OrcamentoSemana } from "@/components/orcamento-semana";
import { useTelaGrande } from "@/lib/use-tela-grande";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  aprovarPreco,
  confirmarCompraDoFornecedor,
  corrigirOferta,
  sugerirCorrecaoNaCotacao,
  dividirCompra,
  gerarPedidosAprovados,
  mudarQuantidadeDoItem,
  negociarPreco,
  vincularFornecedorAoItem,
} from "@/lib/actions/cotacao";
import {
  FUSO_DA_CASA,
  UNIT_LABEL,
  chave,
  diaNoFuso,
  formatAmount,
  formatDateString,
  formatDiaCurtoString,
  formatMoney,
  lerNumeroBR,
  plural,
} from "@/lib/format";
import {
  MEDIDAS,
  agrupa,
  chipsDe,
  conteudoNaCasa,
  descreverEmbalagem,
  familiaDe,
  lerEmbalagemAnterior,
  quantidadeAoTrocar,
  rotuloDaEmbalagem,
  rotuloDoDesconto,
  type Embalagem as EmbalagemDigitada,
} from "@/lib/embalagem";
import type { RespostaEspecificacao } from "@/lib/especificacao";
import type { CompraDoHistorico, UltimoCusto } from "@/lib/historico";
import type { OrcamentoDaSemana } from "@/lib/orcamento";
import { gravarVisual, type VisualDaCotacao } from "@/lib/visual-cotacao";

import { EscolherMelhores } from "./escolher-melhores";
import { FornecedorPanel } from "./fornecedor-panel";
import type { ForaDaLista } from "./vincular-fornecedor";

import type {
  CotacaoFornecedorStatus,
  CotacaoStatus,
  PrecoStatus,
  ProductUnit,
} from "@/generated/prisma/client";

export type PrecoRow = {
  id: number;
  cotacaoFornecedorId: number;
  /**
   * Oferta ou recusa.
   *
   * Numa recusa, `precoUnitario` e `subtotal` são zero — e zero aqui não é
   * preço, é o lugar vazio de colunas que o banco exige. Quem não filtra por
   * `OFERTADO` antes de procurar o menor elege "não tenho estoque" como a
   * melhor oferta da linha.
   */
  estatus: PrecoStatus;
  precoUnitario: number;
  subtotal: number;
  /** Como ele vende: "caixa" com 12 kg por R$ 30. Nulo nas cotações antigas. */
  embalagem: string | null;
  conteudo: number | null;
  precoEmbalagem: number | null;
  /** Preço por volume, na medida de `precoEmbalagem`. Nulos = não ofereceu. */
  descontoAcimaDe: number | null;
  descontoPrecoEmbalagem: number | null;
  /** O que ele respondeu sobre as especificações do produto. */
  especificacoes: RespostaEspecificacao[];
  /** O que ele tinha cotado antes de a casa negociar. Nulo = não negociou. */
  precoNegociadoDe: number | null;
  prazoEntregaDias: number | null;
  /** A marca que ele disse que manda. Nulo quando o produto não pede marca. */
  marca: string | null;
  /** A média das estrelas desta marca neste produto, quando já foi avaliada. */
  qualidade?: { media: number; n: number } | null;
  observacoes: string | null;
  aprovado: boolean;
  /**
   * Quanto DESTE item sai deste fornecedor, quando a compra foi dividida.
   *
   * Nulo é o normal e quer dizer "leva o item inteiro" — quem responde é
   * `item.quantidadeSolicitada`. Só é diferente de nulo quando dois ou mais
   * fornecedores estão aprovados na mesma linha.
   */
  quantidadeAprovada: number | null;
};

export type ItemRow = {
  id: number;
  /** O produto do cadastro — é o que o "Editar produto" corrige. */
  produtoId: number;
  categoryId: number | null;
  /** O estoque ideal e o lote do cadastro, para o "Editar produto". */
  idealStock: number | null;
  lote: number | null;
  nome: string;
  unidade: ProductUnit;
  categoria: string;
  quantidadeContada: number;
  quantidadeSolicitada: number;
  /** Ninguém cadastrado alcança este item — nem por categoria, nem por vínculo. */
  semFornecedor: boolean;
  /**
   * O que a casa pagou na última entrega conferida deste produto.
   *
   * É a âncora contra a qual os preços da linha são lidos: sem ela, R$ 5,94 o
   * quilo é número solto. Nulo = nunca comprou, e na tela vira traço, nunca
   * zero.
   */
  ultimaCompra: UltimoCusto | null;
  /** A classe do produto na curva ABC dos últimos 90 dias; nula se não houve compra. */
  classe: "A" | "B" | "C" | null;
  /**
   * As três últimas compras conferidas deste produto, da mais nova para a
   * mais velha.
   *
   * É preço PAGO, não preço cotado: sai de `HistoricoPrecosCompra`, escrito
   * quando a entrega é conferida. Um fornecedor que prometeu e não entregou
   * não aparece aqui, e é esse o valor da lista.
   *
   * Vazia é "nunca comprou". A primeira linha é a mesma de `ultimaCompra`, de
   * propósito: aquela é a âncora que fica sempre à vista, esta é a conversa
   * inteira atrás de um botão.
   */
  historico: CompraDoHistorico[];
  precos: PrecoRow[];
};

export type FornecedorRow = {
  id: number;
  /** A razão social — é o que o cadastro guarda e a tela de cadastro mostra. */
  nome: string;
  /** Como a casa chama ele. Nulo = nunca foi apelidado. */
  apelido: string | null;
  wa: string | null;
  /** Abaixo disto ele não entrega. Nulo = nunca perguntamos. */
  minOrder: number | null;
  categorias: string[];
  chamado: {
    id: number;
    token: string;
    estatus: CotacaoFornecedorStatus;
  } | null;
  /**
   * O pedido que a compra dele nesta cotação já virou. Nulo = ainda não.
   *
   * Preenchido, a coluna dele está fechada: os preços foram copiados para
   * dentro do pedido, e o servidor recusa mexer neles.
   */
  pedidoId: number | null;
};

/**
 * Um fornecedor já chamado, do jeito que o comparativo precisa dele.
 *
 * Existe para responder de uma vez o que a tela perguntava a cada pintura:
 * `f.chamado!.id` aparecia em dez lugares, e `prazoDe` varria a lista inteira
 * de itens uma vez por coluna — com 124 itens e 22 fornecedores são 2728
 * varreduras por render, refeitas a cada toque num preço.
 */
type ColunaFornecedor = {
  id: number;
  /** `CotacaoFornecedor.id`, que é a chave dos preços. */
  chamadoId: number;
  nome: string;
  /** O prazo é por resposta, não por linha: vale para o fornecedor inteiro. */
  prazo: number | null;
  minOrder: number | null;
  /** Deixou ao menos um preço nesta cotação, seja oferta ou recusa. */
  respondeu: boolean;
  /** O pedido que a compra dele já virou. Nulo = a coluna ainda está aberta. */
  pedidoId: number | null;
};

/**
 * A régua do mapa.
 *
 * O painel é `max-w-4xl px-5` (app/admin/layout.tsx): sobram 856px de janela
 * por mais largo que seja o monitor, e o mapa rola dentro deles. A coluna do
 * item gruda à esquerda com 12rem e leva a quantidade e a última compra
 * embaixo do nome — as duas custam ZERO de largura, porque cabem na coluna que
 * já existe. Sobram 664px de janela para fornecedor.
 *
 * Cada coluna tem 7rem; menos o `px-2` dos dois lados, sobram 96px — a
 * mesma largura de quando a folga era `pr-4` de um lado só, mas repartida,
 * que é o que faz o conteúdo centralizado cair no meio de verdade em vez de
 * ficar dezesseis pixels à esquerda do centro. É o que
 * "R$ 1.234,56" mede em mono a 14px. Com 22 fornecedores o mapa mede 2656px e
 * rola três janelas e meia — por isso quem não respondeu nada não vira coluna,
 * e por isso a linha da embalagem saiu da célula e virou dica de cursor.
 *
 * Os 856px valem para a coluna de LEITURA. A tabela em si sai dela por margem
 * negativa a partir de 1536px — a conta está no comentário da `div` que rola,
 * lá embaixo — e chega a 1344px num monitor de 1920. São duas colunas de
 * fornecedor a mais à vista sem rolar.
 *
 * Mexeu aqui, refaça a conta — e meça na tela, porque a barra lateral entra e
 * sai conforme a largura e é ela que derruba quem calcula só pelo `max-w`.
 */
const COLUNA = "min-w-28";
const ITEM = "w-48";

/**
 * A oferta mais barata da linha, ou nada.
 *
 * Só oferta disputa. A recusa grava zero nas colunas de dinheiro — o banco
 * exige um número — e sem este filtro o "não tenho estoque" ganhava de todo
 * mundo por R$ 0,00, com selo de mais barato e tudo.
 *
 * O `<` estrito guarda o PRIMEIRO mínimo no empate. Quem ordenar preços em
 * outro lugar precisa empatar igual, senão o topo da lista e o rótulo "mais
 * barato" caem em linhas diferentes.
 */
function menorOfertaDe(item: ItemRow): PrecoRow | null {
  // A suspeita (preço do kg no campo da caixa) não ganha a coroa: ela seria
  // a menor justamente por causa do engano.
  const suspeitas = suspeitasDe(item);
  return item.precos.reduce<PrecoRow | null>(
    (m, p) =>
      p.estatus !== "OFERTADO" || suspeitas.has(p.id) ? m : m === null || p.subtotal < m.subtotal ? p : m,
    null,
  );
}

/** As ofertas do item que parecem o preço do kg digitado no campo da caixa (`lib/preco-suspeito.ts`). */
function suspeitasDe(item: ItemRow): Set<number> {
  return ofertasSuspeitas(
    item.precos
      .filter((p) => p.estatus === "OFERTADO")
      .map((p) => ({ id: p.id, precoUnitario: p.precoUnitario, conteudo: p.conteudo })),
    item.ultimaCompra?.valor ?? null,
  );
}

/**
 * A ordem em que as ofertas de um item aparecem no cartão do celular.
 *
 * Empata igual a `menorOfertaDe`: o `<` estrito de lá guarda o primeiro
 * mínimo, e uma ordenação que desempatasse por outro critério poria no topo
 * da lista uma linha e o rótulo "mais barato" em outra.
 */
function porPreco(a: PrecoRow, b: PrecoRow): number {
  return a.subtotal - b.subtotal;
}

/**
 * Quanto sai DESTE fornecedor: a fatia dele, ou o item inteiro.
 *
 * A mesma leitura que o servidor faz em `gerarPedidosAprovados` — nulo quer
 * dizer "leva tudo". Escrita aqui uma vez para a tela não ficar repetindo o
 * `??` em cada lugar que precisa da conta.
 */
function quantidadeDe(item: ItemRow, preco: PrecoRow): number {
  return preco.quantidadeAprovada ?? item.quantidadeSolicitada;
}

/**
 * O que a casa gasta com este fornecedor NESTA linha.
 *
 * Não é `preco.subtotal`: aquele é "quanto custaria comprar tudo dele", o
 * número que torna as colunas comparáveis e que a divisão não encolhe. Este é
 * o que vai virar pedido — a fatia vezes o preço.
 *
 * Arredonda ao centavo porque o banco guarda `Decimal(10, 2)`: sem o corte, a
 * soma do rodapé sairia com frações de centavo que o pedido não vai ter.
 */
function valorEscolhido(item: ItemRow, preco: PrecoRow): number {
  return Math.round(preco.precoUnitario * quantidadeDe(item, preco) * 100) / 100;
}

/** "sem estoque" / "não trabalha", que é o que a célula escreve no lugar do preço. */
function textoDaRecusa(preco: PrecoRow): string {
  return preco.estatus === "SEM_ESTOQUE" ? "sem estoque" : "não trabalha";
}

/**
 * O que o leitor de tela ouve ao chegar num preço.
 *
 * É uma frase inteira porque `aria-label` SUBSTITUI o conteúdo da célula: o
 * que não estiver aqui não é lido. Uma origem só para os dois desenhos — se
 * ela crescer, cresce nos dois.
 */
function frasePreco({
  preco,
  item,
  fornecedor,
  eMenor,
}: {
  preco: PrecoRow;
  item: ItemRow;
  fornecedor: string;
  eMenor: boolean;
}): string {
  /* Começa pelo preço por unidade, que é o que a célula mostra em destaque
     desde que o total saiu dela. O total da linha continua sendo dito, e aqui
     ele não custa largura nenhuma: quem ouve a tela não tem como somar de
     cabeça o que quem enxerga lê no rodapé. */
  /* "escolhido" e "mais barato" saíram do desenho e ficaram aqui de
     propósito: na tela quem diz isso são a coroa e o fundo azul, e quem ouve
     não tem nem uma coisa nem outra. Este rótulo é a única forma de a
     informação chegar, e é por isso que ele nunca encolhe junto com a
     célula. */
  return `${formatMoney(preco.precoUnitario)} por ${UNIT_LABEL[item.unidade]} de ${fornecedor} para ${item.nome}${preco.marca ? `, marca ${preco.marca}` : ""}, ${formatMoney(preco.subtotal)} no total${eMenor ? ", o mais barato" : ""}${preco.aprovado ? ", escolhido" : ""}${preco.quantidadeAprovada !== null ? `, com ${formatAmount(preco.quantidadeAprovada)} ${UNIT_LABEL[item.unidade]} desta divisão` : ""}${preco.observacoes ? `. Observação do fornecedor: ${preco.observacoes}` : ""}`;
}

/**
 * O único lugar do módulo que sabe escolher um preço.
 *
 * Fechada, a célula deixa de ser botão em vez de virar botão desabilitado.
 * Desabilitado ela guardava a forma toda — canto arredondado, altura de alvo
 * de toque, fundo sólido — e ficava só com opacidade menor: sessenta
 * retângulos que pedem para ser tocados e não respondem. O que não clica não
 * deve ter cara de quem clica.
 */
function AlvoDePreco({
  fechada,
  aprovado,
  salvando,
  rotulo,
  aoTocar,
  className,
  semRelevo = false,
  children,
}: {
  fechada: boolean;
  aprovado: boolean;
  salvando: boolean;
  rotulo: string;
  aoTocar: () => void;
  className: string;
  /** Linha de uma lista, e não botão solto: sem a sombra da seção da cotação. */
  semRelevo?: boolean;
  children: React.ReactNode;
}) {
  if (fechada) return <div className={className}>{children}</div>;

  return (
    <button
      type="button"
      data-sem-relevo={semRelevo ? "" : undefined}
      /* Só a célula em voo trava. Era `emVoo !== null`, que apagava a tabela
         inteira a cada clique. */
      disabled={salvando}
      onClick={aoTocar}
      aria-pressed={aprovado}
      aria-label={rotulo}
      className={`${className} transition ${
        aprovado ? "" : "hover:bg-[var(--surface)]"
      } disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

/**
 * "+18% vs última compra" num preço de item que pesa no bolso (curva A ou B)
 * e veio bem acima do que a casa pagou da última vez. Os itens C ficam de
 * fora de propósito: são muitos e pouco dinheiro, e marcar todos esconderia
 * os que importam.
 */
function AlertaDePreco({ preco, item }: { preco: PrecoRow; item: ItemRow }) {
  if (preco.estatus !== "OFERTADO") return null;
  /* O contrário da alta: barato demais, em embalagem. Quase sempre é o preço
     do kg digitado no campo da caixa. Corrige-se no lápis da oferta. */
  if (suspeitasDe(item).has(preco.id)) {
    return (
      <span
        className="mt-0.5 block text-xs font-semibold"
        style={{ color: "var(--warn)" }}
        title="Bem abaixo das outras ofertas: confira se o valor não é o do kg. Corrija no lápis da oferta."
      >
        preço do {UNIT_LABEL[item.unidade]}? confira
      </span>
    );
  }
  if (item.ultimaCompra === null) return null;
  if (item.classe !== "A" && item.classe !== "B") return null;
  const alta = preco.precoUnitario / item.ultimaCompra.valor - 1;
  if (!(alta > LIMITE_DE_ALTA)) return null;
  return (
    <span
      className="mt-0.5 block text-xs font-semibold"
      style={{ color: "var(--warn)" }}
      title={`Última compra: ${formatMoney(item.ultimaCompra.valor)}/${UNIT_LABEL[item.unidade]}`}
    >
      +{Math.round(alta * 100)}% vs última compra
    </span>
  );
}

/** `R$ 2,50 Sadia (3)`, a fatia quando a compra foi dividida, ou "salvando…". */
function Apoio({
  preco,
  item,
  salvando,
}: {
  preco: PrecoRow;
  item: ItemRow;
  salvando: boolean;
}) {
  return (
    <span
      className={`block text-xs ${
        preco.aprovado ? "opacity-80" : "text-[var(--muted-foreground)]"
      }`}
    >
      {/* O "…" morava colado no valor e empurrava o dinheiro para o lado a
          cada clique. Aqui embaixo ele avisa sem mexer na coluna que a pessoa
          está comparando. */}
      {salvando ? (
        "salvando…"
      ) : (
        <>
          {/* Marca e observação, e mais nada de dinheiro.

              O total da linha ficou aqui por um tempo, embaixo do preço por
              unidade. Saiu: a célula passava dois números de dinheiro
              empilhados, e o de baixo não era comparável com o de baixo da
              célula vizinha sem antes lembrar que as quantidades são iguais.
              O que a célula responde agora é uma pergunta só — quanto este
              fornecedor cobra pela unidade, de que marca, com que ressalva.

              O total por fornecedor não se perdeu: ele é a soma do que foi
              escolhido, e essa mora no rodapé, que é onde a decisão acontece. */}
          {/* O preço que ele pedia antes, riscado.

              É o rastro da conversa: sem ele, um preço negociado é
              indistinguível de um preço cotado, e some a única evidência de
              que pedir melhora com este fornecedor funciona. Fica aqui na
              linha de apoio porque é história, não é o número da decisão. */}
          {preco.precoNegociadoDe !== null && (
            <>
              <span className="line-through opacity-70">
                {formatMoney(preco.precoNegociadoDe)}
              </span>{" "}
            </>
          )}
          {preco.marca}
          {/* A média das estrelas desta marca, quando o produto é avaliado. */}
          {preco.qualidade && (
            <>
              {" "}
              <MediaEstrelas media={preco.qualidade.media} n={preco.qualidade.n} />
            </>
          )}
          {/* "mais barato" e "escolhido" saíram daqui.

              Eram duas palavras dizendo o que dois desenhos já diziam — a
              coroa e o fundo azul — em texto miúdo no meio de outro texto
              miúdo. Numa parede de nove colunas isso é ruído que empurra a
              marca e a nota para a segunda linha. Quem ouve a tela não perde
              nada: as duas continuam por extenso no `aria-label` da célula,
              que é onde elas sempre foram informação de verdade. */}
          {/* A fatia, e só quando a compra foi dividida.

              Aqui a quantidade não é a mesma para todos, e sem dizer quanto
              é de cada um a linha teria duas células azuis e nenhuma resposta
              para "quanto vem de qual". */}
          {preco.quantidadeAprovada !== null && (
            <span className="num-display block font-medium">
              {formatAmount(preco.quantidadeAprovada)} {UNIT_LABEL[item.unidade]}
            </span>
          )}
        </>
      )}
    </span>
  );
}

/**
 * Quanto a casa quer comprar deste item, mudado aqui mesmo.
 *
 * O outro lado da negociação: o fornecedor melhora o preço se levar mais, ou
 * só entrega a caixa fechada. Sem isto, a saída era sair da comparação, ir à
 * lista de itens, corrigir e voltar — perdendo de vista os preços que estavam
 * sendo comparados, que é justamente o que motivou a mudança.
 *
 * Mora ao lado do ícone de negociar, dentro da célula de cada fornecedor —
 * decisão do dono, e a razão dele é a prática: quem está negociando com o
 * fornecedor mexe nas duas coisas na mesma conversa, e ter de atravessar a
 * linha até a coluna do item para mudar a quantidade era sair de onde a
 * conversa está.
 *
 * O que ele muda é a quantidade DO ITEM, não "quanto comprar deste
 * fornecedor" — é a mesma pergunta feita a todo mundo, e mudá-la aqui muda
 * os nove preços da linha. Por isso a dica de cursor diz "deste item" e não
 * "deste fornecedor", e por isso a linha inteira se refaz depois de salvar.
 *
 * Para comprar quantidades diferentes de cada um existe a bifurcação, que é
 * outra pergunta e tem outro botão.
 */
function MudarQuantidade({
  item,
  pequeno = false,
  travado = false,
}: {
  item: ItemRow;
  /** Miúdo na célula do mapa, de dedo no cartão. */
  pequeno?: boolean;
  /** O item já está dentro de um pedido: o servidor recusa mudar. */
  travado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    const n = lerNumeroBR(valor);
    if (n === null) return setErro("Isso não é um número.");
    setErro(null);
    startTransition(async () => {
      const r = await mudarQuantidadeDoItem(item.id, n);
      if (!r.ok) return setErro(r.message);
      setAberto(false);
      // A ação revalida esta tela: o servidor refaz o subtotal de TODOS os
      // preços da linha. Recalcular isso no cliente seria escrever a mesma
      // regra duas vezes.
    });
  }

  if (!aberto) {
    return (
      <BotaoDoItem
        aoTocar={() => {
          setValor(formatAmount(item.quantidadeSolicitada));
          setErro(null);
          setAberto(true);
        }}
        pequeno={pequeno}
        noCartao
        desabilitado={travado}
        rotulo={`Mudar a quantidade de ${item.nome}`}
        titulo={
          travado
            ? "Este item já está num pedido confirmado"
            : "Mudar quanto comprar deste item"
        }
      >
        <Boxes aria-hidden className={pequeno ? "size-3" : "size-4"} />
      </BotaoDoItem>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-center gap-1">
      <Input
        autoFocus
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") setAberto(false);
        }}
        aria-label={`Quantidade de ${item.nome} em ${UNIT_LABEL[item.unidade]}`}
        className="h-7 w-20 px-1.5 text-right text-sm tabular-nums"
      />
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" disabled={pendente} onClick={salvar}>
          {pendente ? "…" : "ok"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={() => setAberto(false)}
        >
          sair
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Fechar a compra de UM fornecedor, no rodapé da coluna dele.
 *
 * É como a semana acontece: o da bebida respondeu e o preço está bom, manda
 * hoje; o do hortifrúti ainda está pensando e a conversa continua amanhã.
 * Esperar o último para poder mandar o primeiro é atraso que a cotação
 * inventou.
 *
 * Pede confirmação antes, e a confirmação diz o valor: pedido gasta dinheiro
 * e não tem desfazer nesta tela — depois dele, mexer no preço ou na
 * quantidade daquele fornecedor é recusado pelo servidor, e a saída é
 * cancelar o pedido.
 *
 * O aviso do mínimo vem junto quando é o caso, porque este é o último lugar
 * onde ainda dá para passar um item para outro fornecedor e fazer a conta
 * dele fechar.
 */
function ConfirmarCompra({
  cotacaoId,
  coluna,
  total,
  fechada,
  abaixoDoMinimo,
}: {
  cotacaoId: number;
  coluna: ColunaFornecedor;
  total: number;
  fechada: boolean;
  abaixoDoMinimo: boolean;
}) {
  const [perguntando, setPerguntando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = await confirmarCompraDoFornecedor(cotacaoId, coluna.id);
      if (!r.ok) return setErro(r.message);
      setPerguntando(false);
      /* O servidor é quem sabe se esta foi a última e a cotação fechou.
         Decidir isso aqui seria escrever pela segunda vez a regra de quando
         uma rodada acaba. */
    });
  }

  if (coluna.pedidoId !== null) {
    return (
      <Link
        href={`/admin/compras/enviar?cotacao=${cotacaoId}#da-cotacao`}
        title="Abrir os pedidos desta cotação"
        /* Pastilha verde e não texto verde: o estado final da coluna é a
           informação mais forte do rodapé, e um link miúdo se perdia no meio
           dos outros textos miúdos. */
        className="mt-1.5 block rounded px-1.5 py-1 text-center text-xs font-medium"
        style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
      >
        pedido #{coluna.pedidoId}
      </Link>
    );
  }

  // Fechada sem pedido é quem não teve nada escolhido: não há o que oferecer.
  if (fechada || total <= 0) return null;

  if (!perguntando) {
    return (
      <Button
        type="button"
        variant="outline"
        /* `h-auto` para escapar da altura fixa do `size`: no rodapé ela
           reservava o dobro do espaço que o texto precisa, e são nove
           colunas dela. */
        size="xs"
        className="mt-1.5 w-full font-medium"
        onClick={() => {
          setErro(null);
          setPerguntando(true);
        }}
      >
        Confirmar compra
      </Button>
    );
  }

  return (
    /* Aberta, a caixa muda de cor — é a resposta ao clique.
       Sem isso o botão sumia e no lugar dele aparecia texto, e num rodapé de
       nove colunas não ficava claro qual delas tinha respondido. */
    <div
      className="mt-1.5 space-y-1 rounded p-1.5 text-left"
      style={{ background: "var(--botao)", color: "var(--botao-texto)" }}
    >
      <p className="text-xs font-medium">Fechar {formatMoney(total)}?</p>
      {abaixoDoMinimo && (
        <p className="text-xs font-normal opacity-90">
          Abaixo do mínimo de {formatMoney(coluna.minOrder!)} — ele pode cobrar
          entrega ou recusar.
        </p>
      )}
      <p className="text-xs font-normal opacity-80">
        Vira pedido, e os preços dele param de mudar.
      </p>
      <div className="flex flex-wrap gap-1">
        {/* Botões claros sobre o fundo escuro da caixa: o `variant` padrão é
            que some aqui, por ser a mesma cor do fundo. */}
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={pendente}
          onClick={confirmar}
        >
          {pendente ? "…" : "confirmar"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={pendente}
          onClick={() => setPerguntando(false)}
        >
          voltar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-xs font-normal">
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Os botõezinhos de ferramenta da linha: negociar, quantidade, dividir,
 * vincular.
 *
 * Eram ícones nus, de 12px, que só apareciam com o cursor parado em cima da
 * linha. Três problemas de uma vez: não se viam, não pareciam clicáveis, e
 * no celular — onde `hover` não existe — simplesmente não existiam.
 *
 * Agora têm borda, altura de alvo de toque e ficam sempre à vista. O custo é
 * altura de linha no mapa, e ele vale: ferramenta que ninguém acha é
 * ferramenta que não foi escrita.
 *
 * Ativo fica na cor do primário, e não com fundo cheio: fundo cheio é o que
 * marca o fornecedor ESCOLHIDO na célula ao lado, e repetir a mesma tinta
 * para "painel aberto" faria as duas coisas se confundirem.
 */
function BotaoDoItem({
  aoTocar,
  ativo = false,
  aberto,
  desabilitado = false,
  pequeno = false,
  noCartao = false,
  rotulo,
  titulo,
  children,
}: {
  aoTocar: () => void;
  /** O estado que ele representa já vale — "esta linha está dividida". */
  ativo?: boolean;
  aberto?: boolean;
  /** Desligado com o motivo no `title`, e não escondido: some, a pergunta
      "por que este item não tem?" fica sem resposta nenhuma. */
  desabilitado?: boolean;
  /**
   * Miúdo, para o mapa.
   *
   * Na célula do mapa são dois destes ao lado de cada preço, numa coluna de
   * 96px, vezes o número de fornecedores — a mesma roda de 28px que separa
   * bem no cartão vira uma parede de círculos ali. No cartão eles têm faixa
   * própria e sobra espaço, e é lá que o tamanho de dedo vale.
   */
  pequeno?: boolean;
  /**
   * A faixa de ferramentas do cartão: quadrado, só o ícone, e os seis
   * dividem a largura numa linha só (decisão do dono). Com o nome escrito
   * ao lado eles quebravam em três linhas no celular. O nome continua no
   * `aria-label` e no `title`.
   */
  noCartao?: boolean;
  rotulo: string;
  titulo: string;
  children: React.ReactNode;
}) {
  if (noCartao && !pequeno) {
    return (
      <button
        type="button"
        onClick={aoTocar}
        disabled={desabilitado}
        aria-expanded={aberto}
        aria-label={rotulo}
        title={titulo}
        className={`inline-flex h-11 min-w-9 flex-1 items-center justify-center rounded-lg border bg-[var(--background)] transition disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:size-5 ${
          ativo || aberto
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={aoTocar}
      disabled={desabilitado}
      aria-expanded={aberto}
      aria-label={rotulo}
      title={titulo}
      /* Redondo, com fundo próprio e uma sombra leve: é o que separa um
         botão do texto ao redor sem precisar de rótulo.

         Dois tamanhos, e cada um tem uma razão. `pequeno` é o mapa: dois
         destes ao lado de cada preço, numa coluna de 96px, vezes nove
         fornecedores — lá quem aponta é o cursor, e 20px bastam. O normal é
         o cartão, que é a tela do celular: 40px, perto dos 44 que o dedo
         pede. Já foi 28, e na medição eram 147 alvos abaixo de 32px na tela
         da cotação — os cinco da moldura de cada item. */
      className={`inline-flex shrink-0 items-center justify-center rounded-full border bg-[var(--background)] shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${pequeno ? "size-5" : "size-10"} ${
        ativo
          ? "border-[var(--primary)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * As últimas compras deste item: quanto, de quem, quando.
 *
 * A linha do item já mostra a última compra, e ela responde "este preço está
 * bom?". Três respondem outra coisa: se o preço vem subindo, e se ele sobe
 * com todo mundo ou só com um. Uma cotação inteira pode parecer cara sem
 * isso — e às vezes o caro é o fornecedor, não o mercado.
 *
 * É preço PAGO e não preço cotado: sai do que foi conferido no recebimento.
 * Fornecedor que prometeu barato e entregou outra coisa não aparece aqui,
 * e é justamente isso que torna a lista confiável.
 *
 * Sem rolagem e sem "ver tudo": três é o que cabe na cabeça de quem está
 * decidindo, e o histórico completo é assunto da tela de Produtos.
 */
/** "qui, 30/07": o dia da entrega no calendário da casa, e não no de Greenwich. */
const diaDaCompra = (em: string) => formatDiaCurtoString(diaNoFuso(new Date(em), FUSO_DA_CASA));

function HistoricoDoItem({ item }: { item: ItemRow }) {
  return (
    <div className="sticky left-0 max-w-[32rem] rounded border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-medium">
        Últimas compras de {item.nome}
      </p>

      {item.historico.length === 0 ? (
        /* Vazio explicado, e não uma lista em branco: "nunca comprou" é
           informação de compra — é o item que entrou no cardápio esta
           semana, ou o que a casa sempre pegou no mercado da esquina. */
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Nenhuma entrega conferida ainda. O histórico nasce quando a
          mercadoria chega e alguém confere o que veio.
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs">
          {item.historico.map((h, i) => (
            /* A data é a chave junto do índice: duas entregas do mesmo
               produto no mesmo dia existem, e a data sozinha repetiria. */
            <li key={`${h.em}-${i}`}>
              {/* Duas linhas: preço e marca, que é o que se procura aqui, em
                  cima; quem mandou e quando, embaixo. Numa linha só, a data
                  por extenso espremia o fornecedor até virar "fornece…". */}
              <p className="flex items-baseline gap-2">
                <span className="num-display shrink-0 font-medium">
                  {formatMoney(h.valor)}
                  <span className="font-normal opacity-70">/{UNIT_LABEL[item.unidade]}</span>
                </span>
                {h.marca ? (
                  <span className="min-w-0 truncate font-semibold">{h.marca}</span>
                ) : (
                  <span className="min-w-0 truncate text-[var(--muted-foreground)]">marca não informada</span>
                )}
              </p>
              <p className="truncate text-[var(--muted-foreground)]">
                {/* Nulo é fornecedor apagado do cadastro depois da compra. O
                    preço continua valendo; o nome é que se perdeu. */}
                {h.fornecedor ?? "fornecedor removido"} · {diaDaCompra(h.em)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Onde a compra de um fornecedor está em relação ao mínimo dele.
 *
 * "Abaixo do mínimo" sozinho não era resposta. A tela dizia "mínimo
 * R$ 400,00" e deixava a subtração para a cabeça de quem lê — e quando o
 * aviso NÃO aparecia sobravam duas leituras possíveis: já bateu, ou este
 * fornecedor não tem mínimo nenhum. Eram justamente as duas perguntas que se
 * faz neste rodapé.
 *
 * `total <= 0` é "sem", e não "falta tudo": quem não teve nada escolhido não
 * está devendo mínimo a ninguém — não vai virar pedido.
 */
type EstadoDoMinimo =
  | { tipo: "sem" }
  | { tipo: "atingido"; minimo: number }
  | { tipo: "falta"; minimo: number; falta: number };

function minimoDe(minOrder: number | null, total: number): EstadoDoMinimo {
  if (minOrder === null || total <= 0) return { tipo: "sem" };
  if (total >= minOrder) return { tipo: "atingido", minimo: minOrder };
  /* Ao centavo, como o dinheiro da tela: a diferença entre dois valores de
     duas casas pode sair com cauda binária, e "faltam R$ 155,6199999" seria
     a conta certa escrita errado. */
  return {
    tipo: "falta",
    minimo: minOrder,
    falta: Math.round((minOrder - total) * 100) / 100,
  };
}

/**
 * A linha do mínimo, do tamanho que o lugar comporta.
 *
 * `curto` é a coluna do mapa, que tem 96px: lá cabe "faltam R$ 155,62", e a
 * frase inteira vai no `title`. No cartão da lista sobra largura e ela sai
 * escrita, que é onde a decisão de fato acontece.
 */
function LinhaDoMinimo({
  estado,
  curto = false,
}: {
  estado: EstadoDoMinimo;
  curto?: boolean;
}) {
  if (estado.tipo === "sem") return null;

  if (estado.tipo === "atingido") {
    return (
      <span
        className="block text-xs font-normal"
        style={{ color: "var(--ok)" }}
        title={`O pedido mínimo deste fornecedor é ${formatMoney(estado.minimo)}, e a compra já passou dele`}
      >
        ✓ mínimo de {formatMoney(estado.minimo)}
      </span>
    );
  }

  return (
    <span
      className="block text-xs font-medium"
      style={{ color: "var(--warn)" }}
      title={`Faltam ${formatMoney(estado.falta)} para o pedido mínimo de ${formatMoney(estado.minimo)}`}
    >
      {curto ? (
        <>faltam {formatMoney(estado.falta)}</>
      ) : (
        <>
          faltam {formatMoney(estado.falta)} para o mínimo de{" "}
          {formatMoney(estado.minimo)}
        </>
      )}
    </span>
  );
}

/**
 * O que este fornecedor tem nesta rodada, recolhido no rodapé.
 *
 * O total dele sempre foi um número sem prestação de contas: "R$ 546,41 da
 * Marmitt" não diz de quais itens, e conferir isso custava varrer as 109
 * linhas procurando a coluna dela. É justamente o que se quer olhar antes de
 * apertar "Confirmar compra", porque depois dali o preço não muda mais.
 *
 * Dois grupos, e os dois importam:
 *
 * - ESCOLHIDOS é a prestação de contas do total, linha a linha.
 * - COM PREÇO é a margem de manobra: onde mais ele poderia entrar, que é o
 *   que se olha quando falta para o mínimo dele.
 *
 * Cada item leva para o cartão dele lá em cima, aberto. Ver e corrigir são
 * o mesmo gesto — e repetir aqui os botões de negociar, dividir e quantidade
 * seria manter dois lugares para a mesma edição.
 *
 * Só na lista. No mapa a coluna do fornecedor JÁ é esta lista, de cima a
 * baixo, e uma gaveta repetindo-a seria a mesma informação duas vezes na
 * mesma tela.
 */
function ItensDoFornecedor({
  coluna,
  itens,
  aoEscolherItem,
}: {
  coluna: ColunaFornecedor;
  itens: ItemRow[];
  aoEscolherItem: (itemId: number) => void;
}) {
  const linhas = itens.flatMap((item) => {
    const dele = item.precos.find(
      (p) => p.cotacaoFornecedorId === coluna.chamadoId && p.estatus === "OFERTADO",
    );
    if (dele === undefined) return [];
    const outro = item.precos.find((p) => p.aprovado && p.id !== dele.id);
    return [{ item, preco: dele, outro }];
  });

  const escolhidos = linhas.filter((l) => l.preco.aprovado);
  const comPreco = linhas.filter((l) => !l.preco.aprovado);

  if (linhas.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-[var(--muted-foreground)]">
        {plural(escolhidos.length, "item escolhido", "itens escolhidos")}
        {comPreco.length > 0 && ` · ${comPreco.length} com preço dele`}
      </summary>

      {escolhidos.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {escolhidos.map((l) => (
            <li key={l.item.id}>
              <button
                type="button"
                onClick={() => aoEscolherItem(l.item.id)}
                className="flex w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-left text-sm transition hover:bg-[var(--surface)]"
              >
                <span className="min-w-0 flex-1 truncate">{l.item.nome}</span>
                <span className="num-display shrink-0 text-xs text-[var(--muted-foreground)]">
                  {formatAmount(quantidadeDe(l.item, l.preco))}{" "}
                  {UNIT_LABEL[l.item.unidade]} ×{" "}
                  {formatMoney(l.preco.precoUnitario)}
                </span>
                <span className="num-display w-20 shrink-0 text-right font-medium">
                  {formatMoney(valorEscolhido(l.item, l.preco))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {comPreco.length > 0 && (
        <>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Também tem preço, e hoje não é dele:
          </p>
          <ul className="mt-1 space-y-0.5">
            {comPreco.map((l) => (
              <li key={l.item.id}>
                <button
                  type="button"
                  onClick={() => aoEscolherItem(l.item.id)}
                  className="flex w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-left text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--surface)]"
                >
                  <span className="min-w-0 flex-1 truncate">{l.item.nome}</span>
                  {/* O preço dele e o de quem está levando, lado a lado: é a
                      comparação que decide se vale a pena mudar, e sem o
                      segundo número o primeiro não quer dizer nada. */}
                  <span className="num-display shrink-0 text-xs">
                    ele {formatMoney(l.preco.precoUnitario)}
                    {l.outro !== undefined &&
                      ` · hoje ${formatMoney(l.outro.precoUnitario)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

/** Um fornecedor do cadastro, do jeito que o painel de vincular precisa. */
export type FornecedorParaVincular = {
  id: number;
  nome: string;
  /** Já foi chamado nesta rodada. Muda o que o clique faz, e o painel diz. */
  naCotacao: boolean;
};

/**
 * "Quem mais vende ISTO?", respondido na linha do item.
 *
 * Substituiu o botão de vincular que ficava na barra, e a diferença é onde a
 * pergunta nasce: ela nasce olhando uma linha com dois preços só, e não no
 * alto da tela em abstrato.
 *
 * O clique faz duas coisas: vincula o fornecedor ao PRODUTO, que é o vínculo
 * que dura, e o chama para esta cotação, que é o que resolve o problema de
 * agora. O botão antigo só fazia a segunda — e na semana seguinte o mesmo
 * item voltava com os mesmos dois preços e o mesmo trabalho.
 *
 * Quem já está na rodada aparece na lista assim mesmo, marcado: vinculá-lo
 * ao produto continua valendo, e é justamente o que faz ele vir sozinho da
 * próxima vez.
 */
function VincularAoItem({
  item,
  fornecedores,
  aoFechar,
}: {
  item: ItemRow;
  fornecedores: FornecedorParaVincular[];
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const indice = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, chave(f.nome)])),
    [fornecedores],
  );
  const termo = chave(busca);
  /* Oito, e não a lista toda: com trinta fornecedores o painel viraria uma
     rolagem dentro de uma rolagem. Quem não está nos oito primeiros digita
     mais uma letra. */
  const achados = (
    termo === ""
      ? fornecedores
      : fornecedores.filter((f) => indice.get(f.id)?.includes(termo) ?? false)
  ).slice(0, 8);

  function vincular(f: FornecedorParaVincular) {
    setErro(null);
    setFeito(null);
    startTransition(async () => {
      const r = await vincularFornecedorAoItem(item.id, f.id);
      if (!r.ok) return setErro(r.message);
      setFeito(
        r.data.convidado
          ? `${f.nome} passou a vender ${item.nome} e foi chamado para esta cotação.`
          : `${f.nome} passou a vender ${item.nome}. Ele já estava nesta cotação.`,
      );
      setBusca("");
      // O servidor é quem sabe se nasceu coluna nova no mapa.
    });
  }

  return (
    <div className="sticky left-0 max-w-[36rem] rounded border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Quem mais vende <span className="font-medium">{item.nome}</span>? Ele
        passa a ser fornecedor deste produto para sempre, e já entra nesta
        cotação.
      </p>

      <Input
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") aoFechar();
        }}
        aria-label={`Buscar fornecedor para ${item.nome}`}
        placeholder="Buscar fornecedor"
        className="mt-2 h-8 w-64 text-sm"
      />

      {achados.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Nenhum fornecedor com esse nome. Cadastre-o na barra lá em cima.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {achados.map((f) => (
            <li key={f.id}>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={pendente}
                onClick={() => vincular(f)}
              >
                {f.nome}
                {/* Quem já está na rodada não some da lista: vinculá-lo ao
                    produto continua valendo. Mas dizer isso antes do clique
                    evita a pergunta "chamei de novo sem querer?". */}
                {f.naCotacao && (
                  <span className="ml-1 opacity-60">· já na cotação</span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {feito && (
        <p role="status" className="mt-2 text-xs" style={{ color: "var(--ok)" }}>
          {feito}
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}

      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="mt-2"
        disabled={pendente}
        onClick={aoFechar}
      >
        sair
      </Button>
    </div>
  );
}

/**
 * Comprar o mesmo item de mais de um fornecedor.
 *
 * O caso que a escolha única não cobre: o mais barato não tem a quantidade
 * toda, ou entrega metade hoje e metade na quinta. Sem isto a saída era pedir
 * 204 a quem só tem 120 e completar por fora, sem registro nenhum.
 *
 * Abre numa LINHA INTEIRA embaixo do item, e não dentro da coluna grudada. A
 * pergunta é sobre a linha toda — quanto de cada um dos nove —, e num espaço
 * de 200px ela viraria nove campos empilhados numa coluna de nome de produto.
 * O `sticky left-0` do miolo é o que mantém o painel visível quando o mapa
 * está rolado para a direita.
 *
 * Quem não entra na divisão fica EM BRANCO, e não com zero: zero é uma
 * quantidade que alguém digitou, branco é "este não". A diferença importa na
 * hora de ler o painel de volta.
 *
 * A soma tem de fechar a quantidade do item, e o servidor confere de novo.
 * Aqui a conta aparece enquanto se digita porque descobrir que faltavam 12 só
 * depois de clicar é o tipo de ida e volta que este painel existe para
 * evitar — mas quem decide continua sendo o servidor.
 */
function DivisaoDaCompra({
  item,
  colunas,
  aoFechar,
}: {
  item: ItemRow;
  colunas: ColunaFornecedor[];
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  /* As ofertas desta linha, na ordem das colunas do mapa — a mesma em que os
     preços estão desenhados logo acima. Recusa fica de fora: não se compra de
     quem disse que não tem. */
  const ofertas = colunas.flatMap((coluna) => {
    const preco = item.precos.find(
      (p) => p.cotacaoFornecedorId === coluna.chamadoId && p.estatus === "OFERTADO",
    );
    return preco === undefined ? [] : [{ coluna, preco }];
  });

  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      ofertas.map(({ preco }) => [
        preco.id,
        // Já escolhido entra com o que ele leva hoje; o resto nasce em branco.
        preco.aprovado ? formatAmount(quantidadeDe(item, preco)) : "",
      ]),
    ),
  );

  const partes = ofertas
    .map(({ preco }) => ({ precoId: preco.id, texto: (valores[preco.id] ?? "").trim() }))
    .filter((p) => p.texto !== "")
    .map((p) => ({ precoId: p.precoId, quantidade: lerNumeroBR(p.texto) }));

  const algumNaoENumero = partes.some((p) => p.quantidade === null);
  const soma = partes.reduce((acc, p) => acc + (p.quantidade ?? 0), 0);
  /* Em milésimos, como `lib/lote.ts`: em ponto flutuante direto, 68 + 68 + 68
     não fecha 204 e o painel acusaria falta de um bilionésimo. */
  const falta = (Math.round(item.quantidadeSolicitada * 1000) - Math.round(soma * 1000)) / 1000;

  function gravar(lista: { precoId: number; quantidade: number }[]) {
    setErro(null);
    startTransition(async () => {
      const r = await dividirCompra(item.id, lista);
      if (!r.ok) return setErro(r.message);
      aoFechar();
      /* O servidor é quem sabe o que a divisão fez com o rodapé, com o
         mínimo de cada fornecedor e com a contagem de "falta escolher".
         Refazer essas contas aqui seria escrevê-las pela segunda vez. */
    });
  }

  const dividido = item.precos.filter((p) => p.aprovado).length > 1;

  return (
    <div className="sticky left-0 max-w-[52rem] rounded border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Quanto sai de cada um. Deixe em branco quem não entra, e a soma precisa
        fechar os{" "}
        <span className="num-display">
          {formatAmount(item.quantidadeSolicitada)} {UNIT_LABEL[item.unidade]}
        </span>{" "}
        do item.
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
        {ofertas.map(({ coluna, preco }) => (
          <label key={preco.id} className="flex flex-col gap-0.5 text-xs">
            <span className="max-w-32 truncate" title={coluna.nome}>
              {coluna.nome}
            </span>
            <span className="flex items-baseline gap-1">
              <Input
                inputMode="decimal"
                value={valores[preco.id] ?? ""}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [preco.id]: e.target.value }))
                }
                aria-label={`Quantidade de ${item.nome} que sai de ${coluna.nome}, em ${UNIT_LABEL[item.unidade]}`}
                className="h-8 w-20 px-1.5 text-right text-sm tabular-nums"
              />
              <span className="text-[var(--muted-foreground)]">
                {UNIT_LABEL[item.unidade]}
              </span>
            </span>
            <span className="num-display text-[var(--muted-foreground)]">
              {formatMoney(preco.precoUnitario)}/{UNIT_LABEL[item.unidade]}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {/* O saldo, em vez de só a soma: "faltam 84" é a próxima ação, e
            "120 de 204" obriga a fazer a subtração de cabeça. */}
        <span
          className="num-display"
          style={{ color: falta === 0 ? "var(--ok)" : "var(--muted-foreground)" }}
        >
          {falta === 0
            ? `fecha os ${formatAmount(item.quantidadeSolicitada)} ${UNIT_LABEL[item.unidade]}`
            : falta > 0
              ? `faltam ${formatAmount(falta)} ${UNIT_LABEL[item.unidade]}`
              : `sobram ${formatAmount(-falta)} ${UNIT_LABEL[item.unidade]}`}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={pendente || algumNaoENumero || falta !== 0 || partes.length === 0}
          onClick={() =>
            gravar(
              partes.map((p) => ({ precoId: p.precoId, quantidade: p.quantidade! })),
            )
          }
        >
          {pendente ? "…" : "dividir"}
        </Button>
        {dividido && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() => gravar([])}
          >
            desfazer
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoFechar}>
          sair
        </Button>
        {algumNaoENumero && (
          <span role="alert" style={{ color: "var(--destructive)" }}>
            Uma das quantidades não é um número.
          </span>
        )}
      </div>

      {erro && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * O preço que saiu da conversa com o fornecedor.
 *
 * A cotação chega com o que ele digitou no link, e o preço de verdade sai de
 * depois disso: o dono manda mensagem, pede melhora, e fecha noutro número.
 * Até aqui esse número não tinha onde entrar, e a compra acontecia por um
 * preço que a tela nunca soube.
 *
 * Fechado por padrão, atrás de um ícone de dinheiro. Um campo aberto em cada
 * célula seriam novecentos campos numa cotação de cem itens por nove
 * fornecedores — e negociar é a exceção, não o caminho.
 *
 * O que ele tinha cotado antes fica guardado e aparece riscado ao lado do
 * novo: "R$ 1,09 → R$ 0,95" é o que diz se negociar com este rende, e é o que
 * se leva para a rodada seguinte.
 *
 * A tela volta refeita pela própria ação, e não por estado local: mudar o
 * preço muda quem é o mais
 * barato da linha, muda o total do rodapé e pode mudar se o fornecedor já
 * alcançou o pedido mínimo. Recalcular isso na mão no cliente seria escrever
 * pela segunda vez regras que o servidor já tem.
 */
function Negociar({
  preco,
  unidade,
  fornecedor,
  item,
  pequeno = false,
}: {
  preco: PrecoRow;
  unidade: ProductUnit;
  fornecedor: string;
  item: string;
  /** Miúdo na célula do mapa, de dedo no cartão. */
  pequeno?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function abrir() {
    setValor(formatAmount(preco.precoUnitario));
    setErro(null);
    setAberto(true);
  }

  function salvar() {
    const n = lerNumeroBR(valor);
    if (n === null) return setErro("Isso não é um número.");
    setErro(null);
    startTransition(async () => {
      const r = await negociarPreco(preco.id, n);
      if (!r.ok) return setErro(r.message);
      setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <BotaoDoItem
        aoTocar={abrir}
        /* Já negociado fica na cor do primário: o preço desta célula não é
           mais o que ele cotou, e isso é estado da linha, não um convite. */
        ativo={preco.precoNegociadoDe !== null}
        pequeno={pequeno}
        noCartao
        rotulo={`Negociar o preço de ${fornecedor} para ${item}`}
        titulo="Negociar este preço"
      >
        <CircleDollarSign aria-hidden className={pequeno ? "size-3" : "size-4"} />
      </BotaoDoItem>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-[var(--muted-foreground)]">R$</span>
        <Input
          autoFocus
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setAberto(false);
          }}
          aria-label={`Preço negociado com ${fornecedor} para ${item}, por ${UNIT_LABEL[unidade]}`}
          className="h-7 w-20 px-1.5 text-right text-sm tabular-nums"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" disabled={pendente} onClick={salvar}>
          {pendente ? "…" : "ok"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={() => setAberto(false)}
        >
          sair
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * De onde o preço por unidade saiu: `caixa 12 kg · R$ 30,00`.
 *
 * Sem isto, R$ 2,50/kg é número sem origem — e a divisão que o produziu é
 * exatamente a que cada fornecedor fazia de cabeça, de um jeito, sem dizer
 * qual. Nulo nas cotações respondidas antes de o link perguntar a embalagem.
 */
function Embalagem({ preco, unidade }: { preco: PrecoRow; unidade: ProductUnit }) {
  if (!preco.embalagem || preco.conteudo === null) return null;

  return (
    <span className="block text-xs opacity-70">
      {rotuloDaEmbalagem(preco.embalagem, preco.conteudo, unidade)}
      {preco.precoEmbalagem !== null && ` · ${formatMoney(preco.precoEmbalagem)}`}
      {/* O desconto por volume em verde e na linha dele: é o que diz "vale
          aumentar a compra aqui", e misturado ao texto da embalagem sumiria. */}
      {descontoDe(preco, unidade) && (
        <span className="block font-medium text-[var(--ok-strong)]">
          {descontoDe(preco, unidade)}
        </span>
      )}
      {preferenciasDe(preco) && <span className="block">{preferenciasDe(preco)}</span>}
    </span>
  );
}

/**
 * As preferências do produto e se ele atende: "✓ sem osso · ✗ sem sal".
 *
 * Só as preferências. As obrigatórias não aparecem porque não há o que ver:
 * preço sem "sim" em todas elas não chega a ser gravado (`salvarResposta`).
 * É o desempate entre dois preços parecidos.
 */
function preferenciasDe(preco: PrecoRow): string | null {
  const prefs = preco.especificacoes.filter((e) => !e.obrigatoria);
  if (prefs.length === 0) return null;
  return prefs.map((e) => `${e.atende ? "✓" : "✗"} ${e.texto.toLowerCase()}`).join(" · ");
}

/** O preço por volume em texto, ou null quando ele não ofereceu. */
function descontoDe(preco: PrecoRow, unidade: ProductUnit): string | null {
  if (
    !preco.embalagem ||
    preco.conteudo === null ||
    preco.descontoAcimaDe === null ||
    preco.descontoPrecoEmbalagem === null
  ) {
    return null;
  }
  return rotuloDoDesconto(
    preco.embalagem,
    preco.conteudo,
    preco.descontoAcimaDe,
    preco.descontoPrecoEmbalagem,
    unidade,
  );
}

/**
 * O comparativo: quem cobra quanto por cada item, e a escolha de quem comprar.
 *
 * Mora fora de `cotacao-detail.tsx` porque era metade daquele arquivo. Traz
 * junto o estado que só ele usa — a célula em voo, a confirmação de gerar
 * pedidos — e com isso o erro de aprovar um preço passa a aparecer perto do
 * preço tocado, e não oitocentos pixels acima.
 */
/** Nenhuma escolha feita só na tela, esperando a página voltar do servidor. */
const SEM_ESCOLHA_LOCAL = new Map<number, number | null>();

export function Comparativo({
  cotacaoId,
  estatus,
  itens: itensDoServidor,
  fornecedores,
  categorias,
  categoriasDaCotacao,
  foraDaLista,
  visualInicial,
  telaGrandeNoServidor,
  orcamento,
}: {
  cotacaoId: number;
  estatus: CotacaoStatus;
  itens: ItemRow[];
  fornecedores: FornecedorRow[];
  /** As gavetas para o painel de cadastro, que mora na barra de filtros. */
  categorias: { id: number; name: string }[];
  categoriasDaCotacao: number[];
  /** Ativos que nenhuma das duas redes trouxe — o que "Vincular" oferece. */
  foraDaLista: ForaDaLista[];
  /** Como ele deixou a tela da última vez. Vem do cookie, lido no servidor. */
  visualInicial: VisualDaCotacao;
  /** O palpite do servidor (pelo navegador): computador ou celular. */
  telaGrandeNoServidor: boolean;
  /** O orçamento de compra da semana. */
  orcamento: OrcamentoDaSemana;
}) {
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  /* Escolher um preço marca na tela na hora, e a página só volta do servidor
     uma vez, um pouco depois do último toque. Antes, cada toque baixava a
     cotação inteira de novo (centenas de KB no celular): aprovar vinte itens
     eram vinte downloads. A escolha local vale até a página nova chegar
     (`base` diferente), e aí quem manda é o servidor de novo. */
  const [escolhaLocal, setEscolhaLocal] = useState<{ base: ItemRow[]; porItem: Map<number, number | null> }>(() => ({
    base: itensDoServidor,
    porItem: SEM_ESCOLHA_LOCAL,
  }));
  const escolhidoNaTela = escolhaLocal.base === itensDoServidor ? escolhaLocal.porItem : SEM_ESCOLHA_LOCAL;
  const itens = useMemo(
    () =>
      escolhidoNaTela.size === 0
        ? itensDoServidor
        : itensDoServidor.map((i) =>
            escolhidoNaTela.has(i.id)
              ? {
                  ...i,
                  precos: i.precos.map((p) => ({
                    ...p,
                    aprovado: p.id === escolhidoNaTela.get(i.id),
                    quantidadeAprovada: null,
                  })),
                }
              : i,
          ),
    [itensDoServidor, escolhidoNaTela],
  );
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Qual célula está indo ao servidor. Antes era um booleano só, e um clique
  // desabilitava a tabela inteira — quem aprova vinte itens ficava esperando
  // vinte vezes por uma linha que não era a dele.
  const [emVoo, setEmVoo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  /* Olhar a cotação pelos olhos de UM fornecedor.
     É o que a pergunta "faltam R$ 155,62 da Dinâmica, o que eu faço?" pede:
     ver as linhas em que ela tem preço, com o que está escolhido hoje ao
     lado, e decidir ali — migrar um item tocando o preço dela, ou levar mais
     de algo que já é dela pelo botão de quantidade.

     Nulo é a cotação inteira, que é o normal. */
  const [soDoFornecedor, setSoDoFornecedor] = useState<number | null>(null);
  /* Qual item está com o painel de divisão aberto. Um por vez, e o estado
     mora aqui porque o painel é uma LINHA da tabela, irmã da linha do item —
     não cabe dentro do botão que o abre. */
  /* Qual item está com um painel aberto, e qual deles. Um por vez, e o
     estado mora aqui porque o painel é uma LINHA da tabela, irmã da linha
     do item — não cabe dentro do botão que o abre. */
  const [painel, setPainel] = useState<{
    id: number;
    tipo: "divisao" | "vinculo" | "historico";
  } | null>(null);
  /* O painel de cadastrar fornecedor, aberto pela barra de filtros. Mora
     aqui e não em `CotacaoDetail` porque o botão que o abre mora aqui. */
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  /* Lista ou mapa, no desktop. Começa com o que veio do cookie, lido no
     servidor: em `useState` sozinho ele se perderia a cada visita, e lido
     num efeito a primeira pintura mostraria o modo errado por um instante e
     custaria uma violação de `set-state-in-effect`. */
  const [visual, setVisual] = useState<VisualDaCotacao>(visualInicial);
  const telaGrande = useTelaGrande(telaGrandeNoServidor);

  /* A escolha vale agora pelo estado e depois pelo cookie.
     Estado para a troca ser instantânea, sem ida ao servidor; cookie para a
     próxima visita começar do jeito que ele deixou — é o que faz disto um
     ajuste e não um botão que esquece. */
  function escolherVisual(modo: VisualDaCotacao) {
    setVisual(modo);
    gravarVisual(modo);
  }

  const fechada = estatus === "APROVADA";

  const colunas = useMemo<ColunaFornecedor[]>(() => {
    const prazo = new Map<number, number>();
    const comPreco = new Set<number>();
    for (const i of itens) {
      for (const p of i.precos) {
        comPreco.add(p.cotacaoFornecedorId);
        // O primeiro prazo informado vence, que é o que a varredura antiga
        // fazia ao parar no primeiro achado.
        if (p.prazoEntregaDias !== null && !prazo.has(p.cotacaoFornecedorId)) {
          prazo.set(p.cotacaoFornecedorId, p.prazoEntregaDias);
        }
      }
    }
    return fornecedores
      .filter((f) => f.chamado !== null)
      .map((f) => ({
        id: f.id,
        chamadoId: f.chamado!.id,
        /* O APELIDO manda aqui, e a razão social é o reserva.
           Esta coluna tem 96px: "Himalaia Com. de Prod. Alimentares Ltda"
           vira reticências, e reconhecer de quem é a coluna passa a custar
           três segundos toda vez. Quem precisa do nome de verdade está no
           cadastro, não comparando preço. */
        nome: f.apelido ?? f.nome,
        prazo: prazo.get(f.chamado!.id) ?? null,
        minOrder: f.minOrder,
        respondeu: comPreco.has(f.chamado!.id),
        pedidoId: f.pedidoId,
      }));
  }, [itens, fornecedores]);

  /* Quem não deixou preço nenhum não vira coluna.
     O teste é ter linha de `Preco`, e não o estatus, porque quem recusou tudo
     RESPONDEU — com todas as letras — e a coluna de recusas é informação de
     compra. Coluna muda é 112px de nada, e com 22 fornecedores são duas
     janelas de rolagem para atravessar o que ninguém escreveu. */
  const visiveis = colunas.filter((c) => c.respondeu);
  const mudos = colunas.filter((c) => !c.respondeu);

  const comEscolha = itens.filter((i) => i.precos.some((p) => p.aprovado));

  /** O que a casa gasta com cada fornecedor, do jeito que o pedido vai sair. */
  function totalDe(chamadoId: number): number {
    return itens.reduce((acc, i) => {
      const p = i.precos.find(
        (x) => x.cotacaoFornecedorId === chamadoId && x.aprovado,
      );
      /* `valorEscolhido` e não `p.subtotal`: numa linha dividida o subtotal
         continua sendo "o item inteiro por este preço", e somá-lo aqui faria
         o rodapé cobrar de dois fornecedores a compra toda. */
      return acc + (p === undefined ? 0 : valorEscolhido(i, p));
    }, 0);
  }

  const totalAprovado = colunas.reduce((acc, c) => acc + totalDe(c.chamadoId), 0);
  /* Para o orçamento: só o escolhido que ainda não virou pedido. O que já
     virou pedido está no "já pedido" da semana, e contaria duas vezes. */
  const escolhidoSemPedido = colunas
    .filter((c) => c.pedidoId === null)
    .reduce((acc, c) => acc + totalDe(c.chamadoId), 0);
  const comPedido = colunas.filter((c) => totalDe(c.chamadoId) > 0);
  /** Quem já teve a compra fechada e virou pedido. */
  const comprados = colunas.filter((c) => c.pedidoId !== null);

  const porChamado = useMemo(
    () => new Map(colunas.map((c) => [c.chamadoId, c])),
    [colunas],
  );

  /**
   * Este item já está DENTRO de um pedido confirmado.
   *
   * Não é a coluna que trava, é a linha: o item foi copiado para o pedido de
   * quem o levou, e trocar de vencedor agora deixaria o pedido comprando uma
   * coisa que a cotação já não diz. O servidor recusa — e a tela precisa
   * recusar antes, porque um clique que não faz nada e devolve um erro no
   * topo da página, a quarenta linhas de distância, se lê como defeito.
   */
  function travadoPorPedido(item: ItemRow): boolean {
    return item.precos.some(
      (p) => p.aprovado && (porChamado.get(p.cotacaoFornecedorId)?.pedidoId ?? null) !== null,
    );
  }

  /* O cadastro inteiro, para o painel de vincular: quem já está na rodada
     mais quem as duas redes não alcançaram. Quem já está na rodada continua
     aparecendo, marcado — vinculá-lo ao PRODUTO é o que faz ele vir sozinho
     na semana que vem, e isso vale mesmo para quem já foi chamado hoje. */
  const paraVincular = useMemo<FornecedorParaVincular[]>(
    () =>
      [
        /* Aqui a razão social manda, ao contrário da coluna do mapa: esta
           lista é de ESCOLHER quem é, e dois atacados de nome parecido se
           distinguem pelo nome completo. O apelido vem junto, entre
           parênteses, para quem procura pelo nome de uso achar também. */
        ...fornecedores.map((f) => ({
          id: f.id,
          nome: f.apelido === null ? f.nome : `${f.nome} (${f.apelido})`,
          naCotacao: f.chamado !== null,
        })),
        ...foraDaLista.map((f) => ({
          id: f.id,
          nome: f.apelido === null ? f.nome : `${f.nome} (${f.apelido})`,
          naCotacao: false,
        })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [fornecedores, foraDaLista],
  );
  /* O que ainda não foi confirmado — é o que o botão de fechar tudo de uma
     vez vai criar, e é o que a frase ao lado dele precisa contar. Sem este
     recorte, confirmar a Dellys no rodapé e depois usar o botão grande
     prometeria gerar um pedido para ela pela segunda vez. */
  const aConfirmar = comPedido.filter((c) => c.pedidoId === null);

  /**
   * O pedido dele não alcança o que ele exige para entregar.
   *
   * Avisa e não bloqueia, por quatro razões. `minOrder` é cadastro, e cadastro
   * envelhece: travar a compra da semana por um número digitado há seis meses
   * é o sistema recusando trabalho por causa da própria memória. O fornecedor
   * costuma aceitar abaixo do mínimo cobrando entrega, e o sistema não modela
   * frete. A ressalva já tem lugar — a confirmação de gerar pedidos, que
   * existe porque gerar pedido gasta dinheiro e não tem desfazer. E o VMarket,
   * que é a referência do dono, também só avisa.
   */
  function abaixoDoMinimo(c: ColunaFornecedor): boolean {
    return minimoDe(c.minOrder, totalDe(c.chamadoId)).tipo === "falta";
  }

  /* Filtro é lente, não tesoura.
     `comEscolha`, `totalDe`, `totalAprovado` e `comPedido` saem
     de `itens` — sempre, e nunca do que sobrou do filtro. Um filtro que
     mudasse o "Gerar 3 pedidos, somando R$ 4.210,00" faria a confirmação
     mentir sobre o que vai ser criado, e o que vai ser criado não depende do
     que está na tela. */
  const indice = useMemo(
    () => new Map(itens.map((i) => [i.id, chave(`${i.nome} ${i.categoria}`)])),
    [itens],
  );
  const termo = chave(busca);
  const visiveisItens = itens.filter(
    (i) =>
      (filtroCategoria === "todas" || i.categoria === filtroCategoria) &&
      (termo === "" || (indice.get(i.id)?.includes(termo) ?? false)) &&
      /* Item em que ele OFERECEU. Recusa não entra: "não tenho" não é
         oportunidade de compra, e deixá-la na lista encheria a tela de
         linhas que não têm o que decidir. */
      (soDoFornecedor === null ||
        i.precos.some(
          (p) => p.cotacaoFornecedorId === soDoFornecedor && p.estatus === "OFERTADO",
        )),
  );
  const filtrando = termo !== "" || filtroCategoria !== "todas" || soDoFornecedor !== null;

  /** O fornecedor pelos olhos de quem a lista está sendo lida, se há um. */
  const lente = colunas.find((c) => c.chamadoId === soDoFornecedor) ?? null;

  /* Levar a tela para os itens dele.
     O rodapé vive no fim da página; olhar a lista filtrada começa lá em
     cima. Sem a subida, o clique parece não ter feito nada. */
  /**
   * Levar a tela até o cartão de um item, aberto.
   *
   * O item pode não estar desenhado: a lente de um fornecedor, uma busca ou
   * uma categoria podem tê-lo tirado da tela, e rolar até um elemento que
   * não existe não faz nada — o clique pareceria quebrado. Então limpa o que
   * estiver filtrando e espera a pintura seguinte para procurar de novo.
   *
   * `setTimeout` de zero, e não um efeito: isto sai de um clique, e o efeito
   * seria `set-state-in-effect`, que este projeto não acrescenta.
   */
  function irParaItem(itemId: number) {
    const abrir = () => {
      const alvo = document.getElementById(`item-${itemId}`);
      if (alvo === null) return false;
      alvo.querySelector("details")?.setAttribute("open", "");
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    };

    if (abrir()) return;

    setBusca("");
    setFiltroCategoria("todas");
    setSoDoFornecedor(null);
    setTimeout(abrir, 0);
  }

  function verOsItensDe(c: ColunaFornecedor) {
    setSoDoFornecedor(c.chamadoId);
    setBusca("");
    setFiltroCategoria("todas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* As gavetas do seletor são as DESTA cotação, e não o catálogo inteiro:
     escolher uma que não está aqui daria tela vazia sem explicação. A ordem
     vem pronta do servidor, que já ordena por `category.sortOrder`.

     Nome diferente do `categoriasDaCotacao` que chega por prop: aquele são
     IDs, para o painel de cadastro marcar quais gavetas importam; estas são
     NOMES, que é por onde a linha do item se agrupa. */
  const gavetasDoFiltro = [...new Set(itens.map((i) => i.categoria))];

  /* O rodapé numerado de observações SAIU.
     Ele nasceu para tirar as observações da dica de cursor, e cumpriu isso
     virando uma parede: vinte e cinco linhas de "Fulano sobre Tomate: frete
     por nossa conta acima de R$ 400,00" embaixo do mapa, quase todas
     repetindo a mesma frase de fornecedor para fornecedor. Para ler uma,
     era preciso achar o expoente na célula, descer o olho até o rodapé e
     contar. Ninguém faz isso.

     A observação não se perdeu — ela está na dica da própria célula, junto
     da embalagem, e por extenso no rótulo que o leitor de tela lê. No
     celular, onde dica não existe, o cartão a escreve inteira. */

  const grupos = new Map<string, ItemRow[]>();
  for (const i of visiveisItens) {
    if (!grupos.has(i.categoria)) grupos.set(i.categoria, []);
    grupos.get(i.categoria)!.push(i);
  }

  function aprovar(preco: PrecoRow) {
    const item = itens.find((i) => i.precos.some((p) => p.id === preco.id));
    if (!item) return;
    const novo = preco.aprovado ? null : preco.id;
    const marcar = (valor: number | null | undefined) =>
      setEscolhaLocal((atual) => {
        const porItem = new Map(atual.base === itensDoServidor ? atual.porItem : SEM_ESCOLHA_LOCAL);
        if (valor === undefined) porItem.delete(item.id);
        else porItem.set(item.id, valor);
        return { base: itensDoServidor, porItem };
      });
    setErro(null);
    setEmVoo(preco.id);
    marcar(novo);
    if (recarga.current) clearTimeout(recarga.current);
    startTransition(async () => {
      const r = await aprovarPreco(preco.id, !preco.aprovado, false);
      if (!r.ok) {
        setErro(r.message);
        marcar(undefined);
      }
      setEmVoo(null);
      // A página inteira volta uma vez só, quando os toques param: as
      // bonificações e os totais de fora do mapa dependem de quem foi escolhido.
      if (recarga.current) clearTimeout(recarga.current);
      recarga.current = setTimeout(() => router.refresh(), 1500);
    });
  }

  function gerarPedidos() {
    setErro(null);
    startTransition(async () => {
      const r = await gerarPedidosAprovados(cotacaoId);
      if (r.ok) setConfirmando(false);
      else setErro(r.message);
    });
  }

  return (
    <section className="mt-6">
      {/* O orçamento da semana preso no alto da tela, a pedido do dono: cada
          escolha mexe no "esta compra", e ele acompanha a conta enquanto
          desce a lista. Gruda logo abaixo da faixa do topo (`--topo-fixo`,
          definido no layout: a do ☰ no celular, a dos atalhos, ou nenhuma). */}
      <div className="sticky top-[var(--topo-fixo,0px)] z-20 -mx-1 mb-4 bg-[var(--background)] px-1 pb-2 pt-1">
        <OrcamentoSemana
          dados={orcamento}
          estaCompra={fechada ? undefined : escolhidoSemPedido}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 shadow-[0_4px_16px_rgb(0_0_0/0.08)]"
        />
      </div>
      {/* Sem título, sem selo de estado e sem instrução.

          "Comparativo" nomeava a única coisa que esta página tem desde que
          chamar fornecedor virou passo próprio — e a trilha lá em cima já diz
          "Cotação #12" em negrito. O selo repetia o estado que o cabeçalho da
          página mostra. E a instrução explicava, toda vez, algo que se aprende
          na primeira semana e depois é só ruído no alto de cada visita.

          O único que fica é o "Enviar pedidos", que é ação e não rótulo, e ele
          mudou para a barra de filtros junto com os dois botões de
          fornecedor. */}
      {erro && (
        <p role="alert" className="msg-error mt-3 max-w-2xl">
          {erro}
        </p>
      )}

      {colunas.length === 0 ? (
        /* Ninguém chamado ainda: o próximo passo é chamar, e a tela diz isso
           com um botão, e não com uma frase que manda procurar outra tela. */
        <div className="mt-6 max-w-xl space-y-3 rounded-lg border border-[var(--border)] p-4">
          <p className="font-semibold">Nenhum fornecedor foi chamado ainda.</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Mande o link para quem vai dar preço. O comparativo aparece aqui conforme eles respondem.
          </p>
          <Link
            href={`/admin/compras/enviar?cotacao=${cotacaoId}`}
            className="inline-flex h-11 items-center rounded-lg bg-[var(--botao)] px-5 font-semibold text-[var(--botao-texto)] hover:opacity-90"
          >
            Chamar fornecedores
          </Link>
        </div>
      ) : visiveis.length === 0 ? (
        /* Chamei e ninguém veio não é a mesma coisa que não chamei ninguém.
           Sem esta saída, a tela desenhava 124 linhas de uma coluna só e 124
           cartões dizendo "ninguém respondeu por este item" — cento e vinte e
           quatro vezes o mesmo recado. */
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          {plural(colunas.length, "fornecedor foi chamado", "fornecedores foram chamados")}{" "}
          e ninguém respondeu ainda. O comparativo aparece quando o primeiro
          preço chegar.
        </p>
      ) : (
        <>
          {/* Sempre nesta ordem, como em Produtos: as listas de filtro antes
              da busca, porque escolher entre opções prontas é decisão de um
              toque e digitar é a última saída. */}
          {/* No celular, filtro e busca um embaixo do outro, cada um com a
              largura inteira; no computador, numa linha só. */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              aria-label="Filtrar por categoria"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="field h-11 w-full py-0 sm:w-auto"
            >
              <option value="todas">Todas as categorias</option>
              {gavetasDoFiltro.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="relative sm:w-72">
              <Input
                type="search"
                aria-label="Buscar item"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar item ou categoria"
                className={`h-11 w-full ${busca !== "" ? "pr-16" : ""}`}
              />
              {busca !== "" && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  limpar
                </button>
              )}
            </div>

            {filtrando && (
              <p className="text-sm text-[var(--muted-foreground)]">
                {plural(visiveisItens.length, "item", "itens")} de {itens.length}
              </p>
            )}

            {/* O ajuste de como ver a cotação, só no desktop.

                No celular ele não existe de propósito: lá o mapa não é uma
                opção pior, é uma tela que não funciona — nove colunas de
                112px numa janela de 375. Oferecer a escolha seria oferecer
                uma delas quebrada. */}
            <div className="hidden lg:flex" role="group" aria-label="Como ver a cotação">
              {/* Dois botões grudados e não um `select`: são duas opções, e um
                  seletor esconde metade da resposta atrás de um clique para
                  economizar quarenta pixels. */}
              {(["lista", "mapa"] as const).map((modo) => (
                <button
                  key={modo}
                  type="button"
                  aria-pressed={visual === modo}
                  onClick={() => escolherVisual(modo)}
                  className={`h-11 border border-[var(--border)] px-4 text-sm font-semibold transition first:rounded-l-lg last:rounded-r-lg ${
                    visual === modo
                      ? "bg-[var(--botao)] text-[var(--botao-texto)]"
                      : "hover:bg-[var(--surface)]"
                  }`}
                >
                  {modo === "lista" ? "Lista" : "Mapa"}
                </button>
              ))}
            </div>

            {/* Cadastrar e vincular na barra, à direita.
                Eram um bloco próprio entre o aviso e a tabela, e ali
                empurravam o mapa uma linha para baixo em toda visita para
                oferecer o que se usa uma vez por rodada. Na barra eles moram
                com os outros comandos da tela, sem custar altura nenhuma.

                Somem com a cotação fechada: cadastrar fornecedor depois do
                pedido gerado não muda nada nesta rodada. */}
            {!fechada && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setNovoFornecedor(true)}
                >
                  Cadastrar fornecedor
                </Button>
                <EscolherMelhores cotacaoId={cotacaoId} />
                {/* "Vincular fornecedor" saiu daqui e virou o ícone de elo na
                    linha de cada item.

                    O botão daqui chamava para a rodada e não mexia no
                    cadastro: na semana seguinte o mesmo item voltava com os
                    mesmos dois preços e o mesmo trabalho. E a pergunta que
                    ele respondia nunca nasce no alto da tela em abstrato —
                    nasce olhando uma linha com dois preços só. Agora ela é
                    respondida ali, e o vínculo fica no produto. */}
                {/* O caminho para mandar o que já foi comprado. Só depois da
                    primeira compra confirmada: antes disso não há pedido
                    nenhum, e um botão que leva a uma tela vazia é uma promessa
                    que a tela seguinte desmente. */}
                {comprados.length > 0 && (
                  <Link
                    href={`/admin/compras/enviar?cotacao=${cotacaoId}#da-cotacao`}
                    /* `data-relevo` porque isto é um link vestido de botão, e
                       a regra da seção só alcança `button` de verdade. */
                    data-relevo
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface)]"
                  >
                    <Send aria-hidden className="size-3.5" />
                    Enviar {plural(comprados.length, "pedido", "pedidos")}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* A lente de um fornecedor, dita por extenso.

              Uma lista filtrada sem dizer por quê é uma lista que perdeu
              itens. Aqui a faixa diz de quem é a lente, quanto ainda falta
              para o mínimo dele, e como sair — e o número da falta fica à
              vista enquanto se decide, que é o único jeito de saber quando
              parar.

              O total do rodapé continua saindo da cotação INTEIRA: filtro é
              lente, não tesoura. Um filtro que mudasse o total faria a
              confirmação mentir sobre o que vai ser criado. */}
          {lente !== null && (
            <div
              className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded p-2.5 text-sm"
              style={{ background: "var(--primary-soft)" }}
            >
              <p>
                Vendo o que <span className="font-medium">{lente.nome}</span>{" "}
                vende: {plural(visiveisItens.length, "item", "itens")} de{" "}
                {itens.length}.
              </p>
              {(() => {
                const m = minimoDe(lente.minOrder, totalDe(lente.chamadoId));
                if (m.tipo === "falta") {
                  return (
                    <p className="num-display font-medium" style={{ color: "var(--warn)" }}>
                      faltam {formatMoney(m.falta)} para o mínimo dele
                    </p>
                  );
                }
                if (m.tipo === "atingido") {
                  return (
                    <p className="font-medium" style={{ color: "var(--ok)" }}>
                      ✓ o mínimo dele já foi atingido
                    </p>
                  );
                }
                return null;
              })()}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setSoDoFornecedor(null)}
              >
                ver a cotação inteira
              </Button>
            </div>
          )}

          {/* O painel abre embaixo da barra, em linha própria: ele é um
              formulário inteiro, e espremê-lo entre o filtro e a busca
              quebraria a barra em três linhas. */}
          {novoFornecedor && (
            <div className="mt-3">
              <FornecedorPanel
                supplierId={null}
                categorias={categorias}
                categoriasDaCotacao={categoriasDaCotacao}
                aoFechar={() => setNovoFornecedor(false)}
              />
            </div>
          )}

          {/* Duas árvores, e não uma que se contorce.

              `lg:contents` funciona onde o pai é uma grade; numa tabela não
              serve. Tirar o `display` de `table-*` mata a associação
              linha/coluna no leitor de tela — o `caption`, o `scope="row"` e
              o `colSpan` viram decoração — e `order` não existe em tabela.

              Mas o motivo maior é que o celular não é o mapa espremido: no
              cartão só aparecem os fornecedores que responderam AQUELE item,
              ordenados por preço. Isso é ordenação por dado, e uma árvore só
              não produz duas ordens diferentes das mesmas linhas.

              `hidden` é `display:none`, que tira do fluxo, da tabulação E da
              árvore de acessibilidade — é por isso que a duplicação não custa
              nada em leitor de tela. `sr-only`, `invisible` ou `opacity-0`
              dobrariam as paradas de Tab e fariam o mesmo preço ser lido
              duas vezes. */}
          {/* Vazio por filtro é diferente de vazio por cotação: aqui a saída
              é desfazer o que se pediu, e a frase precisa dizer o que foi
              pedido para a pessoa reconhecer. */}
          {visiveisItens.length === 0 && (
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              Nada encontrado
              {termo !== "" && ` para “${busca}”`}
              {filtroCategoria !== "todas" && ` em ${filtroCategoria}`}
.{" "}
              <button
                type="button"
                onClick={() => {
                  setBusca("");
                  setFiltroCategoria("todas");
                }}
                className="text-[var(--primary)] underline underline-offset-4"
              >
                limpar os filtros
              </button>
            </p>
          )}

          {/* No celular a lista é sempre esta — lá o mapa nem renderiza. No
              desktop ela obedece ao ajuste da barra. */}
          <ul className={`mt-4 space-y-3 ${visual === "mapa" ? "lg:hidden" : ""}`}>
            {[...grupos.entries()].map(([categoria, lista]) => (
              <li key={categoria}>
                <h3 className="section-label border-l-[3px] border-[var(--primary)] py-0.5 pl-2">
                  {categoria}
                </h3>
                {/* Uma coluna, a pedido do dono. Duas chegaram a existir para
                    o cartão não esticar a 1400px; quem resolve isso agora é
                    o recolhimento — fechado, o cartão é uma linha só. */}
                <ul className="mt-2 space-y-2">
                  {lista.map((item) => (
                    <CartaoDoItem
                      key={item.id}
                      item={item}
                      colunas={colunas}
                      paraVincular={paraVincular}
                      linhaComprada={travadoPorPedido(item)}
                      fechada={fechada}
                      emVoo={emVoo}
                      aoTocar={aprovar}
                      cotacaoId={cotacaoId}
                      categorias={categorias}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {/* O rodapé do mapa, em cartões — a lista não tinha nenhum.

              No mapa ele é a última linha da tabela, grudada embaixo, e é
              onde a compra se fecha: quanto dá com cada fornecedor e o botão
              que transforma isso em pedido. Sem ele, o modo lista mostrava
              todas as decisões e nenhuma saída — era preciso trocar para
              mapa só para apertar o botão.

              Aqui ele vem DEPOIS de tudo, e não grudado: no mapa a tabela
              rola dentro de uma caixa de 80vh e o rodapé precisa acompanhar;
              a lista rola a página inteira, e barra grudada no fim de 109
              cartões só tira altura útil.

              Só quem tem algo escolhido ou já comprado. No mapa as colunas
              mudas aparecem porque a coluna existe de qualquer jeito; aqui
              cada uma custaria um cartão dizendo "—". */}
          {comPedido.length + comprados.length > 0 && (
            <section
              className={`mt-6 ${visual === "mapa" ? "lg:hidden" : ""}`}
              aria-label="Total escolhido por fornecedor"
            >
              <h3 className="section-label">Total escolhido</h3>
              <ul className="mt-3 space-y-2">
                {colunas
                  .filter((c) => totalDe(c.chamadoId) > 0 || c.pedidoId !== null)
                  .map((c) => {
                    const t = totalDe(c.chamadoId);
                    const minimo = minimoDe(c.minOrder, t);
                    return (
                      <li key={c.id} className="card p-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <p className="min-w-0 flex-1 font-medium">{c.nome}</p>
                          <p className="num-display text-lg font-medium">
                            {t > 0 ? formatMoney(t) : "—"}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {c.prazo === null
                            ? "prazo não informado"
                            : c.prazo === 0
                              ? "entrega no mesmo dia"
                              : `entrega em ${plural(c.prazo, "dia")}`}
                        </p>
                        {/* Quanto falta, e não só "abaixo do mínimo": a
                            subtração era deixada para a cabeça de quem lê. */}
                        <LinhaDoMinimo estado={minimo} />

                        {/* A prestação de contas do total, recolhida.
                            "R$ 546,41 da Marmitt" não diz de quais itens, e
                            conferir isso custava varrer as 109 linhas
                            procurando a coluna dela — justamente o que se
                            quer olhar antes de confirmar, porque depois dali
                            o preço não muda mais. */}
                        <ItensDoFornecedor
                          coluna={c}
                          itens={itens}
                          aoEscolherItem={irParaItem}
                        />

                        {/* Faltando, a saída é olhar o que ELE vende — e o
                            botão leva a tela para lá em vez de tentar
                            decidir no lugar de quem compra. */}
                        {minimo.tipo === "falta" && !fechada && c.pedidoId === null && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => verOsItensDe(c)}
                          >
                            Ver o que ele vende
                          </Button>
                        )}

                        <ConfirmarCompra
                          cotacaoId={cotacaoId}
                          coluna={c}
                          total={t}
                          fechada={fechada}
                          abaixoDoMinimo={minimo.tipo === "falta"}
                        />
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          {/* O teto de altura não é enfeite.

              `overflow-x-auto` faz o eixo Y virar `auto` junto: a div passa a
              ser o contêiner de rolagem nos dois eixos, e um `sticky top-0` lá
              dentro gruda em relação A ELA. Sem altura limitada ela é do
              tamanho da tabela, não rola nunca, e o cabeçalho iria embora com
              a página. Com o teto, quem rola é a div — e aí grudam o
              cabeçalho, a coluna do item e o rodapé. */}
          {/* O mapa sai da coluna de leitura e ocupa o que houver.

              O painel é `max-w-4xl` porque texto em linha de 150 caracteres
              não se lê. Um mapa de preços não é texto: ele quer todas as
              colunas à vista, e 856px num monitor de 1920 deixava 300px
              parados de cada lado enquanto a tabela rolava.

              `cqw` é a largura da área de conteúdo, medida ao vivo — a div
              `@container` do layout. A conta:

                largura  = espaço da área  − uma calha de 2.5rem (o `px-5`
                           do `main` dos dois lados, para o mapa não encostar
                           na lateral nem na borda da janela)
                margem   = metade da diferença entre essa largura e a da
                           coluna de leitura, negativa, o que centraliza

              Antes eram margens negativas de número fixo por faixa de
              monitor, medidas com a lateral ABERTA porque era o pior caso. Só
              que a lateral recolhe: ela devolve duzentos e tantos pixels, e o
              número fixo deixava todos eles parados. Medir resolve os dois
              estados com uma conta só, e não precisa de faixa nenhuma.

              `lg:` porque abaixo disso o mapa nem renderiza — o celular usa
              os cartões logo acima.

              `max-h` de 80vh no lugar de 70: mais linhas por tela, que é a
              outra metade do mesmo pedido. */}
          {visual === "mapa" && telaGrande && (
          <div
            /* `hidden` sempre, e `lg:block` só no modo mapa: no celular ele
               nunca aparece, e no desktop quem manda é o ajuste da barra.
               Nem é montado fora disso — ver `useTelaGrande`. */
            className={`mt-4 hidden max-h-[80vh] overflow-auto overscroll-contain lg:ml-[calc((100%-(100cqw-2.5rem))/2)] lg:w-[calc(100cqw-2.5rem)] ${
              visual === "mapa" ? "lg:block" : ""
            }`}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">
                Preço de cada fornecedor por item desta cotação. O botão de
                valor escolhe de quem comprar aquele item.
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  {/* O canto gruda nos dois eixos, e por isso ganha a camada
                      mais alta: quem gruda em dois vence quem gruda em um. */}
                  <th
                    scope="col"
                    className={`sticky left-0 top-0 z-30 ${ITEM} bg-[var(--background)] py-1.5 pr-4 align-bottom font-medium`}
                  >
                    Item
                    <span className="block font-normal normal-case tracking-normal">
                      quantidade · última compra
                    </span>
                  </th>
                  {visiveis.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      className={`sticky top-0 z-20 ${COLUNA} bg-[var(--background)] px-2 py-1.5 text-center align-bottom font-medium`}
                    >
                      {/* Só o nome da empresa aqui em cima.

                          O prazo de entrega morava nesta mesma célula, e
                          empurrava o cabeçalho para três e quatro linhas de
                          altura — em nove colunas, uma faixa de cabeçalho que
                          come meia tela antes de o primeiro preço aparecer. O
                          prazo desceu para o rodapé, junto do total escolhido,
                          que é onde as duas informações são lidas juntas: na
                          hora de decidir de quem comprar.

                          Sem `nowrap`: com 22 colunas o nome inteiro numa
                          linha só arrastaria a tabela por metro. */}
                      <span className="block">{c.nome}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...grupos.entries()].map(([categoria, lista]) => (
                  <Grupo
                    key={categoria}
                    categoria={categoria}
                    colunas={1 + visiveis.length}
                  >
                    {lista.map((item) => {
                      const menor = menorOfertaDe(item);
                      /* Item já resolvido, dito na linha inteira.

                         A célula escolhida já era marcada, mas num mapa de
                         nove colunas ela é um retângulo pequeno no meio de
                         uma parede — descer a lista para saber o que ainda
                         falta decidir exigia varrer coluna por coluna. A
                         linha verde responde isso de uma passada de olho.

                         São dois verdes claros, um dentro do outro:
                         `--ok-soft` na linha diz "este item está resolvido",
                         e `--ok-mid`, um passo mais verde, na célula diz DE
                         QUEM se comprou. Com o mesmo tom a escolha sumiria
                         dentro da própria linha que ela resolveu. */
                      const resolvido = item.precos.some((p) => p.aprovado);
                      const dividido = item.precos.filter((p) => p.aprovado).length > 1;
                      const linhaComprada = travadoPorPedido(item);
                      return (
                        <Fragment key={item.id}>
                        <tr
                          /* `group/linha` para o ícone de negociar aparecer
                             só na linha sob o cursor. */
                          className="group/linha border-t border-dotted border-[var(--border)]"
                          style={resolvido ? { background: "var(--ok-soft)" } : undefined}
                        >
                          {/* A quantidade e a última compra moram DENTRO da
                              coluna grudada, e não em colunas próprias.

                              Custo zero de largura, porque a coluna do nome
                              é a larga — e as duas continuam visíveis ao
                              rolar para o lado, que é justamente quando elas
                              fazem falta. A quantidade some da tela era o
                              que tirava o sentido do subtotal.

                              De quebra, o `scope="row"` faz o leitor de tela
                              anunciar nome, quantidade e última compra antes
                              de cada preço. Por isso o `aria-label` do botão
                              não precisa crescer. */}
                          <th
                            scope="row"
                            /* A coluna grudada precisa de fundo OPACO para o
                               resto da tabela passar por baixo dela ao rolar.
                               Sendo opaco, ele tapava o verde da linha — então
                               ele acompanha, em vez de o item ficar sendo a
                               única célula branca de uma linha resolvida. */
                            className={`sticky left-0 z-10 ${ITEM} py-1.5 pr-4 text-left align-top font-normal`}
                            style={{
                              background: resolvido
                                ? "var(--ok-soft)"
                                : "var(--background)",
                            }}
                          >
                            {item.nome}
                            {item.semFornecedor && (
                              <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                                sem fornecedor
                              </span>
                            )}
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              {/* Só a quantidade a comprar. O estoque contado
                                  ficou na LISTA, e não aqui: são 192px de
                                  coluna carregando nome, última compra e os
                                  botões, e a linha do estoque custaria uma a
                                  mais em cada um dos 109 itens — no desenho
                                  que existe justamente para caber muita
                                  linha na tela. */}
                              <span className="num-display">
                                {formatAmount(item.quantidadeSolicitada)}{" "}
                                {UNIT_LABEL[item.unidade]}
                              </span>
                              {" · "}
                              {item.ultimaCompra === null ? (
                                "—"
                              ) : (
                                <span
                                  className="num-display"
                                  title={`na entrega de ${formatDateString(item.ultimaCompra.em.slice(0, 10))}`}
                                >
                                  {formatMoney(item.ultimaCompra.valor)}/
                                  {UNIT_LABEL[item.unidade]}
                                </span>
                              )}
                            </span>
                            {/* Bifurcar: comprar este mesmo item de mais de um
                                fornecedor.

                                Some com o cursor fora da linha, como os outros
                                ícones — mas FICA quando a linha já está
                                dividida, porque aí ele deixou de ser um convite
                                e virou o estado da linha. Sem isso, a única
                                pista de que a compra foi repartida sumiria
                                assim que o cursor saísse. */}
                            {!fechada && (
                              <span className="mt-1 flex items-center gap-1">
                                <BotaoDoItem
                                  aoTocar={() =>
                                    setPainel((a) =>
                                      a?.id === item.id && a.tipo === "divisao"
                                        ? null
                                        : { id: item.id, tipo: "divisao" },
                                    )
                                  }
                                  ativo={dividido}
                                  aberto={
                                    painel?.id === item.id && painel.tipo === "divisao"
                                  }
                                  pequeno
                                  desabilitado={linhaComprada}
                                  rotulo={`Dividir a compra de ${item.nome} entre fornecedores`}
                                  titulo={
                                    linhaComprada
                                      ? "Este item já está num pedido confirmado"
                                      : "Comprar este item de mais de um fornecedor"
                                  }
                                >
                                  <Split aria-hidden className="size-3" />
                                </BotaoDoItem>

                                {/* "Quem mais vende isto?" — a pergunta nasce
                                    olhando a linha com dois preços só, e por
                                    isso o botão mora nela. */}
                                <BotaoDoItem
                                  aoTocar={() =>
                                    setPainel((a) =>
                                      a?.id === item.id && a.tipo === "vinculo"
                                        ? null
                                        : { id: item.id, tipo: "vinculo" },
                                    )
                                  }
                                  aberto={
                                    painel?.id === item.id && painel.tipo === "vinculo"
                                  }
                                  pequeno
                                  rotulo={`Vincular um fornecedor a ${item.nome}`}
                                  titulo="Vincular um fornecedor a este produto"
                                >
                                  <Link2 aria-hidden className="size-3" />
                                </BotaoDoItem>

                                {/* O que a casa pagou nas últimas vezes.
                                    A linha já mostra a última compra, e ela
                                    responde "este preço está bom?". Três
                                    respondem outra coisa: se o preço vem
                                    subindo, e se sobe com todo mundo ou só
                                    com um. */}
                                <BotaoDoItem
                                  aoTocar={() =>
                                    setPainel((a) =>
                                      a?.id === item.id && a.tipo === "historico"
                                        ? null
                                        : { id: item.id, tipo: "historico" },
                                    )
                                  }
                                  aberto={
                                    painel?.id === item.id && painel.tipo === "historico"
                                  }
                                  pequeno
                                  rotulo={`Ver as últimas compras de ${item.nome}`}
                                  titulo="As últimas compras deste item"
                                >
                                  <History aria-hidden className="size-3" />
                                </BotaoDoItem>

                                {dividido && (
                                  <span className="text-xs text-[var(--primary)]">
                                    dividido
                                  </span>
                                )}
                              </span>
                            )}
                          </th>
                          {visiveis.map((c) => {
                            /* Três travas, e cada uma fecha um recorte:
                               a cotação inteira, a COLUNA de quem já comprou,
                               e a LINHA que já está dentro de um pedido.

                               A terceira faltava, e era um clique que não
                               fazia nada: numa linha comprada pela Dinâmica,
                               tocar a Marmitt ia ao servidor, voltava
                               recusado e o erro aparecia no topo da página —
                               a quarenta linhas de distância de onde o dedo
                               estava.

                               O que não responde a toque não deve ter cara de
                               quem responde. */
                            const travada =
                              fechada || c.pedidoId !== null || linhaComprada;
                            const preco = item.precos.find(
                              (p) => p.cotacaoFornecedorId === c.chamadoId,
                            );
                            if (!preco) {
                              /* Sempre "não vende", nunca traço: só entra no
                                 mapa quem respondeu, então célula vazia aqui
                                 é ele tendo pulado ESTE item, e não a coluna
                                 inteira estar esperando. */
                              return (
                                <td
                                  key={c.id}
                                  className="px-2 py-1.5 text-center text-[var(--muted-foreground)]"
                                >
                                  não vende
                                </td>
                              );
                            }
                            /* Recusa não é célula de escolher: é o motivo
                               escrito no lugar do preço. Antes vinha em
                               branco, e branco se lia como "não respondeu" —
                               que é justamente o que ele fez questão de
                               dizer que não era. */
                            if (preco.estatus !== "OFERTADO") {
                              return (
                                <td
                                  key={c.id}
                                  className="px-2 py-1.5 text-center text-xs text-[var(--muted-foreground)]"
                                >
                                  {textoDaRecusa(preco)}
                                  {preco.observacoes && (
                                    <span className="block">{preco.observacoes}</span>
                                  )}
                                </td>
                              );
                            }
                            const eMenor = menor?.id === preco.id;
                            const salvando = emVoo === preco.id;
                            /* Embalagem e observação na mesma dica.
                               A observação morava num rodapé numerado que
                               ninguém descia para ler; aqui ela está onde a
                               pergunta nasce. Quem ouve a tela recebe as duas
                               por extenso no rótulo do botão, e o celular as
                               escreve no cartão. */
                            const dica = [
                              preco.embalagem && preco.conteudo !== null
                                ? `${rotuloDaEmbalagem(preco.embalagem, preco.conteudo, item.unidade)}${
                                    preco.precoEmbalagem === null
                                      ? ""
                                      : ` por ${formatMoney(preco.precoEmbalagem)}`
                                  }`
                                : null,
                              descontoDe(preco, item.unidade),
                              preferenciasDe(preco),
                              preco.observacoes,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              /* A embalagem sai da célula e vira dica de
                                 cursor. Em 96px "bombona 12 un · R$ 30,60"
                                 quebra em duas linhas, e quarenta produtos
                                 vezes duas linhas a mais é uma tabela que
                                 não se lê. A exceção ao "sem dica de cursor"
                                 é legítima: esta árvore só existe no
                                 desktop, onde o cursor existe, e quem carrega
                                 a informação de verdade é o cartão do
                                 celular. */
                              <td
                                key={c.id}
                                className="px-2 py-1 text-center"
                                title={dica === "" ? undefined : dica}
                              >
                                <AlvoDePreco
                                  fechada={travada}
                                  aprovado={preco.aprovado}
                                  salvando={salvando}
                                  aoTocar={() => aprovar(preco)}
                                  rotulo={frasePreco({
                                    preco,
                                    item,
                                    fornecedor: c.nome,
                                    eMenor,
                                  })}
                                  className={`min-h-11 w-full rounded px-2 py-1 text-center ${
                                    preco.aprovado
                                      ? "bg-[var(--ok-mid)] font-medium"
                                      : ""
                                  }`}
                                >
                                  {/* O PREÇO POR UNIDADE em cima, e o total da
                                      linha como apoio embaixo.

                                      Era o contrário, e estava errado para o
                                      que esta tela faz: o número grande era o
                                      total — quantidade vezes preço —, que
                                      diz mais sobre quanto a casa vai comprar
                                      do que sobre quanto o fornecedor cobra.
                                      Quem compara fornecedor compara o preço
                                      da unidade; o total é consequência.

                                      A escolha do "mais barato" não muda: a
                                      quantidade é a mesma para todos na
                                      linha, então quem ganha por unidade
                                      ganha por total. */}
                                  <span
                                    className={`num-display flex items-baseline justify-center gap-1 ${
                                      eMenor && !preco.aprovado
                                        ? "font-semibold text-[var(--primary)]"
                                        : ""
                                    }`}
                                  >
                                    {/* A coroa do mais barato, à esquerda do
                                        valor.

                                        O "· mais barato" escrito embaixo se
                                        perdia: é texto miúdo no meio de outro
                                        texto miúdo, numa tabela de nove
                                        colunas, e para achar o vencedor de
                                        uma linha era preciso ler as nove. Um
                                        desenho o olho encontra sem ler.

                                        `aria-hidden` porque o `aria-label` do
                                        botão já diz "o mais barato" por
                                        extenso — o desenho é atalho para quem
                                        enxerga, não informação a mais. */}
                                    {eMenor && (
                                      <Crown
                                        aria-hidden
                                        className="size-3 shrink-0 self-center"
                                      />
                                    )}
                                    <span>
                                      {formatMoney(preco.precoUnitario)}
                                      <span className="text-xs font-normal opacity-70">
                                        /{UNIT_LABEL[item.unidade]}
                                      </span>
                                    </span>
                                  </span>
                                  <Apoio
                                    preco={preco}
                                    item={item}
                                    salvando={salvando}
                                  />
                                  <AlertaDePreco preco={preco} item={item} />
                                </AlvoDePreco>

                                {/* As duas ferramentas da conversa com o
                                    fornecedor, lado a lado: o preço e a
                                    quantidade.

                                    Ficam FORA do alvo de escolher. Dentro,
                                    seriam botões dentro de um botão — HTML
                                    inválido, e o clique de abrir o campo
                                    escolheria o fornecedor de passagem. */}
                                {!travada && preco.estatus === "OFERTADO" && (
                                  <div className="mt-0.5 flex items-center justify-center gap-2">
                                    <Negociar
                                      preco={preco}
                                      unidade={item.unidade}
                                      fornecedor={c.nome}
                                      item={item.nome}
                                      pequeno
                                    />
                                    <MudarQuantidade item={item} pequeno />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        {/* Os dois painéis do item, numa linha só para eles.
                            `colSpan` cobre a tabela inteira porque nenhum dos
                            dois cabe na coluna do item: um pergunta quanto sai
                            de cada um dos nove fornecedores, o outro é uma
                            busca com resultados. */}
                        {painel?.id === item.id && (
                          <tr style={resolvido ? { background: "var(--ok-soft)" } : undefined}>
                            <td colSpan={visiveis.length + 1} className="pb-3">
                              {painel.tipo === "divisao" ? (
                                <DivisaoDaCompra
                                  item={item}
                                  colunas={visiveis}
                                  aoFechar={() => setPainel(null)}
                                />
                              ) : painel.tipo === "vinculo" ? (
                                <VincularAoItem
                                  item={item}
                                  fornecedores={paraVincular}
                                  aoFechar={() => setPainel(null)}
                                />
                              ) : (
                                <HistoricoDoItem item={item} />
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </Grupo>
                ))}
              </tbody>
              {/* O rodapé gruda embaixo porque a pergunta que ele responde —
                  quanto já dá com o que escolhi — não deveria custar rolar
                  quarenta linhas para baixo e voltar. */}
              {/* O rodapé é o cartão de cada fornecedor: quem ele é, em
                  quanto tempo entrega, e quanto dá o que já foi escolhido
                  dele. As três coisas que decidem de quem comprar, juntas.

                  Gruda embaixo porque a pergunta que ele responde — quanto já
                  dá com o que escolhi — não deveria custar rolar quarenta
                  linhas para baixo e voltar.

                  Aparece SEMPRE, e não só com algo escolhido como antes: o
                  prazo de entrega mora aqui agora, e ele vale desde o primeiro
                  olhar. Sem escolha nenhuma o valor é um traço. */}
              <tfoot>
                {/* A linha vermelha que separa a cotação do total.

                    É SOMBRA e não borda, e a razão é a tabela: com
                    `border-collapse`, a borda de uma célula deixa de ser dela
                    e passa a ser da grade, desenhada pela tabela no lugar
                    onde a linha realmente está. A célula gruda embaixo e
                    flutua; a borda fica para trás, no fim da lista, e o
                    rodapé que a pessoa está lendo aparece sem traço nenhum.

                    `inset` para desenhar por dentro, por cima do fundo opaco,
                    sem ocupar altura e sem mexer no alinhamento das colunas.

                    Vai em cada célula, e não no `<tr>`: a linha da tabela não
                    gruda — quem gruda são as células. */}
                <tr className="h-px">
                  <th
                    scope="row"
                    className={`section-label sticky bottom-0 left-0 z-30 h-[inherit] ${ITEM} bg-[var(--background)] py-2 pr-4 text-left align-top shadow-[inset_0_2px_0_0_var(--destructive)]`}
                  >
                    Total escolhido
                    <span className="block font-normal normal-case tracking-normal">
                      prazo de entrega
                    </span>
                  </th>
                  {visiveis.map((c) => {
                    const t = totalDe(c.chamadoId);
                    return (
                      <td
                        key={c.id}
                        className="sticky bottom-0 z-20 h-[inherit] bg-[var(--background)] px-2 py-2 text-center align-top font-medium shadow-[inset_0_2px_0_0_var(--destructive)]"
                      >
                        {/* Coluna flexível de altura cheia, com o botão
                            empurrado para o fim por `mt-auto`.

                            É o que põe os nove botões na MESMA linha. Sem
                            isso cada um começa onde o texto de cima acabou —
                            e o texto de cima não tem a mesma altura em todas
                            as colunas: o aviso de mínimo aparece em algumas,
                            e "entrega no mesmo dia" quebra em duas linhas
                            onde "entrega em 2 dias" cabe numa. */}
                        <div className="flex h-full flex-col">
                          <span className="num-display block">
                            {t > 0 ? formatMoney(t) : "—"}
                          </span>
                          <span className="block text-xs font-normal text-[var(--muted-foreground)]">
                            {c.prazo === null
                              ? "prazo não informado"
                              : c.prazo === 0
                                ? "entrega no mesmo dia"
                                : `entrega em ${plural(c.prazo, "dia")}`}
                          </span>
                          {/* Quanto falta, em vez do número do mínimo.
                              "mínimo R$ 400,00" obrigava a subtrair de
                              cabeça, e a ausência do aviso tinha duas
                              leituras — já bateu, ou não tem mínimo. Agora
                              as duas se dizem, e curtas: são 96px.

                              Ocre é o papel "pendente", que a casa já usa. E
                              só com algo escolhido: quem não vai gerar pedido
                              não tem mínimo a violar, e sem essa guarda 22
                              fornecedores viram 22 avisos. */}
                          <LinhaDoMinimo estado={minimoDe(c.minOrder, t)} curto />
                          {/* Fechar a compra DELE, sem esperar os outros. Mora
                              aqui, colado no total, porque é este número que a
                              decisão olha — o botão que fechava tudo fica lá
                              embaixo. */}
                          <div className="mt-auto">
                            <ConfirmarCompra
                              cotacaoId={cotacaoId}
                              coluna={c}
                              total={t}
                              fechada={fechada}
                              abaixoDoMinimo={abaixoDoMinimo(c)}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          )}

          {/* Nomes por extenso, e não só a contagem: o que se faz com esta
              informação é mandar mensagem para eles, e para isso é preciso
              saber quem são. */}
          {mudos.length > 0 && (
            <p className="hint hidden lg:block">
              {mudos.length === 1 ? "Uma coluna escondida" : `${mudos.length} colunas escondidas`}
              : {mudos.map((c) => c.nome).join(", ")}
              {mudos.length === 1 ? " ainda não respondeu." : " ainda não responderam."}
            </p>
          )}

          {/* Fechada, todo o bloco de ações some — e o total da compra ia
              junto, deixando a tela sem o número que resume a rodada. O
              rodapé da tabela guarda o total por fornecedor; o total geral
              não morava em lugar nenhum. */}
          {fechada && comEscolha.length > 0 && (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-[var(--muted-foreground)]">Total da compra:</span>
              <span className="num-display text-lg font-medium">
                {formatMoney(totalAprovado)}
              </span>
              <span className="text-[var(--muted-foreground)]">
                em {plural(comPedido.length, "fornecedor", "fornecedores")}
              </span>
            </p>
          )}
        </>
      )}

      {/* Sem resposta nenhuma não há o que escolher nem o que gerar, e o
          botão desabilitado com a frase "escolha de quem comprar" seria a tela
          cobrando uma decisão que ainda não é possível. */}
      {visiveis.length > 0 && !fechada && (
        <div className="mt-6 space-y-3">
          {/* "Escolher o mais barato em tudo" saiu, a pedido do dono.
              Ele preenchia a resposta óbvia de uma vez, e a resposta óbvia
              não é a que esta tela existe para dar: o mais barato do mapa
              ignora prazo, pedido mínimo e quem entrega direito, e vinte
              escolhas feitas por fórmula num clique ficam parecendo
              decisões. A escolha volta a ser célula por célula. */}
          {/* Confirmação embutida na linha, com o que vai ser criado. Gerar
              pedido gasta dinheiro e não tem desfazer: a pessoa precisa ler
              o valor antes, não descobrir depois. */}
          {confirmando ? (
            <div className="card space-y-3 p-2.5">
              {/* A soma é a DOS QUE FALTAM, não a da cotação inteira: quem já
                  foi confirmado no rodapé não vai ser criado de novo, e
                  repetir o dinheiro dele aqui faria a confirmação prometer
                  gastar duas vezes o mesmo. */}
              <p className="font-medium">
                Fechar {plural(aConfirmar.length, "compra")}, somando{" "}
                <span className="num-display">
                  {formatMoney(
                    aConfirmar.reduce((acc, c) => acc + totalDe(c.chamadoId), 0),
                  )}
                </span>
                ?
              </p>
              <ul className="space-y-0.5 text-sm text-[var(--muted-foreground)]">
                {aConfirmar.map((c) => (
                  <li key={c.id}>
                    {c.nome}:{" "}
                    <span className="num-display">
                      {formatMoney(totalDe(c.chamadoId))}
                    </span>
                    {abaixoDoMinimo(c) && (
                      <span style={{ color: "var(--warn)" }}>
                        {" "}
                        — abaixo do mínimo de {formatMoney(c.minOrder!)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {/* Antes dos botões, e não depois: é o último lugar onde ainda
                  dá para tirar um item de um pedido e passar a compra para
                  outro fornecedor. */}
              {aConfirmar.some(abaixoDoMinimo) && (
                <p className="msg-warn">
                  {aConfirmar.filter(abaixoDoMinimo).length === 1
                    ? "Um fornecedor fica abaixo do pedido mínimo dele."
                    : `${aConfirmar.filter(abaixoDoMinimo).length} fornecedores ficam abaixo do pedido mínimo deles.`}{" "}
                  Ele pode cobrar entrega ou recusar o pedido. Você decide se
                  manda assim mesmo.
                </p>
              )}
              <p className="hint m-0">
                Depois disto a cotação fecha e os preços não mudam mais.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="lg" disabled={pendente} onClick={gerarPedidos}>
                  {pendente ? "Gerando…" : "Confirmar e gerar"}
                </Button>
                {/* `disabled` junto com o Confirmar: sem isto dava para
                    cancelar no meio do `gerarPedidos`, fechando a
                    confirmação enquanto os pedidos eram criados. */}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pendente}
                  onClick={() => setConfirmando(false)}
                >
                  voltar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {/* O atalho de quem não quer ir fornecedor por fornecedor. O
                  caminho normal virou o botão no rodapé de cada coluna, que
                  fica colado no total que a decisão olha — este aqui fecha
                  todos os que faltam de uma vez. */}
              <Button
                type="button"
                size="lg"
                disabled={pendente || aConfirmar.length === 0}
                onClick={() => setConfirmando(true)}
              >
                Confirmar todas as compras
              </Button>
              <p className="text-sm text-[var(--muted-foreground)]">
                {comEscolha.length === 0
                  ? "Escolha de quem comprar cada item para fechar a compra."
                  : aConfirmar.length === 0
                    ? `Todas as compras escolhidas já foram confirmadas, somando ${formatMoney(totalAprovado)}.`
                    : `${comEscolha.length} de ${plural(itens.length, "item", "itens")} com fornecedor escolhido, somando ${formatMoney(totalAprovado)}`}
              </p>
            </div>
          )}
        </div>
      )}

    </section>
  );
}

/**
 * Um item, com quem respondeu por ele embaixo.
 *
 * O desenho do celular. Aqui a comparação não é lado a lado: é uma pilha
 * ordenada do mais barato para o mais caro, e quem recusou fica no fim como
 * texto de apoio — sem fundo, sem canto arredondado, sem alvo de toque. O que
 * não clica não deve ter cara de quem clica, e no celular isso vale dobrado,
 * porque lá o dedo tenta tudo que parece botão.
 *
 * A ordem é dos DADOS, nunca de `order-*`: o que ordena é o preço, e fazer
 * isso no CSS faria o teclado tabular numa sequência e o leitor de tela ler
 * noutra.
 */
/**
 * Sugerir correção no cadastro do produto, de dentro da cotação: nome,
 * unidade, categoria e uma observação. Não muda nada na hora — vai para
 * Pendências, onde o dono aceita ou recusa, junto com as do estoquista.
 */
function EditarProdutoNaCotacao({
  item,
  cotacaoId,
  categorias,
  aoFechar,
}: {
  item: ItemRow;
  cotacaoId: number;
  categorias: { id: number; name: string }[];
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(item.nome);
  const [unit, setUnit] = useState<ProductUnit>(item.unidade);
  const [categoria, setCategoria] = useState(item.categoryId === null ? "" : String(item.categoryId));
  const [ideal, setIdeal] = useState(item.idealStock === null ? "" : formatAmount(item.idealStock));
  const [lote, setLote] = useState(item.lote === null ? "" : formatAmount(item.lote));
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pendente, startTransition] = useTransition();

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await sugerirCorrecaoNaCotacao(cotacaoId, {
        produtoId: item.produtoId,
        nome,
        unit,
        categoryId: categoria === "" ? null : Number(categoria),
        idealStock: ideal,
        lotSize: lote,
        observacoes,
      });
      if (!r.ok) return setErro(r.message);
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium" style={{ color: "var(--ok-strong)" }}>
          <Check aria-hidden className="size-4" /> Enviado para autorizar em Pendências.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          O cadastro muda quando a correção for aceita lá. Os preços já cotados continuam como estão.
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={aoFechar}>
          fechar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Corrigir o cadastro de {item.nome}
      </p>
      <label className="block">
        <span className="block text-xs text-[var(--muted-foreground)]">Nome</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className="h-9 w-full" />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="block">
          <span className="block text-xs text-[var(--muted-foreground)]">Unidade</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as ProductUnit)}
            className="field h-9 py-0"
          >
            {(Object.keys(UNIT_LABEL) as ProductUnit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="block text-xs text-[var(--muted-foreground)]">Categoria</span>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="field h-9 w-full py-0"
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* Os dois números do cadastro que decidem a sugestão de compra: quanto
          a casa quer ter, e de quanto em quanto se compra. */}
      <div className="flex flex-wrap gap-2">
        <label className="block">
          <span className="block text-xs text-[var(--muted-foreground)]">Estoque ideal ({UNIT_LABEL[unit]})</span>
          <Input
            inputMode="decimal"
            value={ideal}
            onChange={(e) => setIdeal(e.target.value)}
            placeholder="—"
            className="num-display h-9 w-28 text-right"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-[var(--muted-foreground)]">Lote de compra ({UNIT_LABEL[unit]})</span>
          <Input
            inputMode="decimal"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            placeholder="qualquer"
            className="num-display h-9 w-28 text-right"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs text-[var(--muted-foreground)]">O que está errado (opcional)</span>
        <Input
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          maxLength={500}
          placeholder="ex.: coco seco vem em pacote de 100 g, não em KG"
          className="h-9 w-full"
        />
      </label>
      {unit !== item.unidade && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          Trocar a unidade de {UNIT_LABEL[item.unidade]} para {UNIT_LABEL[unit]} muda o estoque e as próximas
          cotações. Os preços desta cotação continuam na unidade antiga.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pendente} onClick={enviar}>
          {pendente ? "Enviando…" : "Enviar para autorizar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoFechar}>
          cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * A linha de uma oferta com o "Corrigir" ao lado, e o formulário embaixo.
 *
 * O fornecedor erra a gramagem — escreve "500 gr" na marca e marca 1 kg, e
 * o preço por kg sai pela metade. A casa confere com ele e corrige aqui, com
 * as mesmas perguntas do link (como vende, quanto vem, quanto custa): o preço
 * por unidade sai da conta, não é digitado.
 */
function OfertaComCorrecao({
  preco,
  item,
  fornecedor,
  travada,
  children,
}: {
  preco: PrecoRow;
  item: ItemRow;
  fornecedor: string;
  travada: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <div className="flex items-stretch">
        {children}
        {!travada && (
          <button
            type="button"
            data-sem-relevo=""
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
            aria-label={`Corrigir a oferta de ${fornecedor} para ${item.nome}`}
            title="Corrigir embalagem, gramagem, preço ou marca"
            className={`flex w-10 shrink-0 items-center justify-center border-l border-[var(--border)] transition hover:bg-[var(--surface)] hover:text-[var(--primary)] ${
              aberto ? "bg-[var(--surface)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"
            }`}
          >
            <Pencil aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {aberto && (
        <CorrigirOferta preco={preco} item={item} fornecedor={fornecedor} aoFechar={() => setAberto(false)} />
      )}
    </>
  );
}

/** "36,5": o número no campo, com até quatro casas, sem zeros sobrando. */
function emTextoBR(n: number): string {
  return String(Math.round(n * 10000) / 10000).replace(".", ",");
}

function CorrigirOferta({
  preco,
  item,
  fornecedor,
  aoFechar,
}: {
  preco: PrecoRow;
  item: ItemRow;
  fornecedor: string;
  aoFechar: () => void;
}) {
  const unit = item.unidade;
  const casa = UNIT_LABEL[unit];
  const familia = familiaDe(unit);
  const [emb, setEmb] = useState<EmbalagemDigitada>(() =>
    lerEmbalagemAnterior(preco.embalagem, preco.conteudo, unit),
  );
  // O preço da unidade da casa, como o link pede ao fornecedor.
  const [valor, setValor] = useState(() => emTextoBR(preco.precoUnitario));
  const [marca, setMarca] = useState(preco.marca ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const conteudo = conteudoNaCasa(emb, unit);
  const precoDigitado = lerNumeroBR(valor);
  const porUnidade = conteudo !== null && precoDigitado !== null && precoDigitado > 0 ? precoDigitado : null;
  /* Oferta suspeita: o valor que ele mandou como da embalagem é, quase
     sempre, o do kg. Um toque põe ele no campo. */
  const suspeita = suspeitasDe(item).has(preco.id) && preco.precoEmbalagem !== null;

  function trocarChip(chip: string) {
    setEmb((e) => ({
      ...e,
      chip,
      quantidade: quantidadeAoTrocar(e, chip, unit),
      medida: chip === "" ? casa : e.medida === casa && familia !== "contagem" ? MEDIDAS[familia][0] : e.medida,
    }));
  }

  function salvar() {
    if (conteudo === null) return setErro("Diga quanto vem na embalagem.");
    if (precoDigitado === null || precoDigitado <= 0) return setErro("Digite o preço.");
    setErro(null);
    startTransition(async () => {
      const r = await corrigirOferta(preco.id, {
        embalagem: descreverEmbalagem(emb, unit),
        conteudo,
        precoUnitario: precoDigitado,
        marca,
      });
      if (!r.ok) return setErro(r.message);
      aoFechar();
    });
  }

  const chip = (c: string, rotulo: string) => (
    <button
      key={c || "casa"}
      type="button"
      data-sem-relevo=""
      aria-pressed={emb.chip === c}
      onClick={() => trocarChip(c)}
      className={`h-8 rounded-full border px-3 text-xs font-medium ${
        emb.chip === c
          ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
          : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-3 border-t border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Corrigir a oferta de {fornecedor}
      </p>

      <div className="space-y-1.5">
        <span className="block text-xs text-[var(--muted-foreground)]">Como ele vende</span>
        <div className="flex flex-wrap gap-1.5">
          {chip("", `1 ${casa}`)}
          {chipsDe(unit, emb.chip).map((c) => chip(c, c))}
        </div>
      </div>

      {emb.chip !== "" && (
        <div className="flex flex-wrap items-end gap-2">
          {(agrupa(emb.chip) || familia === "contagem") && (
            <label className="block">
              <span className="block text-xs text-[var(--muted-foreground)]">
                {familia === "contagem" ? `Quantos ${casa} vêm` : "Quantas peças"}
              </span>
              <Input
                inputMode="decimal"
                value={emb.quantidade}
                onChange={(e) => setEmb((x) => ({ ...x, quantidade: e.target.value }))}
                className="num-display h-9 w-24 text-right"
              />
            </label>
          )}
          {familia !== "contagem" && (
            <label className="block">
              <span className="block text-xs text-[var(--muted-foreground)]">
                {agrupa(emb.chip) ? "Cada peça tem" : "Quanto tem"}
              </span>
              <span className="flex gap-1">
                <Input
                  inputMode="decimal"
                  value={emb.tamanho}
                  onChange={(e) => setEmb((x) => ({ ...x, tamanho: e.target.value }))}
                  placeholder="500"
                  className="num-display h-9 w-24 text-right"
                />
                <select
                  value={emb.medida}
                  onChange={(e) => setEmb((x) => ({ ...x, medida: e.target.value }))}
                  className="field h-9 py-0"
                >
                  {MEDIDAS[familia].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="block text-xs text-[var(--muted-foreground)]">
            Preço do {casa}
          </span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
              R$
            </span>
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="num-display h-9 w-32 pl-7 text-right"
            />
          </span>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="block text-xs text-[var(--muted-foreground)]">Marca</span>
          <Input value={marca} onChange={(e) => setMarca(e.target.value)} className="h-9 w-full" />
        </label>
      </div>

      {suspeita && Math.abs((lerNumeroBR(valor) ?? 0) - preco.precoEmbalagem!) >= 0.005 && (
        <button
          type="button"
          onClick={() => setValor(emTextoBR(preco.precoEmbalagem!))}
          className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-semibold"
          style={{ borderColor: "var(--warn)", color: "var(--warn)" }}
        >
          {formatMoney(preco.precoEmbalagem!)} é o preço do {casa}
        </button>
      )}

      {/* A conta, à vista antes de salvar: o preço da embalagem sai do da
          unidade, e o da unidade é o número que vai para a comparação. */}
      <p className="text-sm">
        {porUnidade !== null ? (
          <>
            {conteudo !== null && emb.chip !== "" && (
              <span className="text-[var(--muted-foreground)]">
                {emb.chip} de {formatAmount(conteudo)} {casa} sai {formatMoney(porUnidade * conteudo)} ·{" "}
              </span>
            )}
            <strong className="num-display">{formatMoney(porUnidade)}/{casa}</strong>
            {Math.abs(porUnidade - preco.precoUnitario) >= 0.005 && (
              <span className="text-[var(--muted-foreground)]"> (era {formatMoney(preco.precoUnitario)})</span>
            )}
          </>
        ) : (
          <span className="text-[var(--muted-foreground)]">preencha o preço do {casa}</span>
        )}
      </p>

      {erro && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar correção"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoFechar}>
          cancelar
        </Button>
      </div>
    </div>
  );
}

/** Linha vazia da altura da marca, para as colunas do cartão não desalinharem. */
function EspacoDaMarca() {
  return (
    <span aria-hidden className="mt-0.5 block text-xs">
      &nbsp;
    </span>
  );
}

function CartaoDoItem({
  item,
  colunas,
  paraVincular,
  linhaComprada,
  fechada,
  emVoo,
  aoTocar,
  cotacaoId,
  categorias,
}: {
  cotacaoId: number;
  /** As gavetas, para o "Editar produto". */
  categorias: { id: number; name: string }[];
  item: ItemRow;
  colunas: ColunaFornecedor[];
  /** O cadastro inteiro, para o painel de vincular um fornecedor ao item. */
  paraVincular: FornecedorParaVincular[];
  /**
   * Este item já está dentro de um pedido confirmado.
   *
   * Trava a LINHA, e não a coluna: o item foi copiado para o pedido de quem
   * o levou, e trocar de vencedor agora deixaria o pedido comprando uma coisa
   * que a cotação já não diz. O servidor recusa — e a tela recusa antes,
   * porque um clique que não faz nada se lê como defeito.
   */
  linhaComprada: boolean;
  fechada: boolean;
  emVoo: number | null;
  aoTocar: (preco: PrecoRow) => void;
}) {
  /* O painel de dividir, aberto pelo ícone de bifurcar. Aqui o estado mora
     no cartão, e não no pai como no mapa: lá o painel é uma LINHA da tabela,
     irmã da linha do item; aqui ele cabe dentro da própria caixa. */
  /* A marca da última entrega, embaixo do preço em "Última compra". As
     outras duas colunas ganham um espaço da mesma altura, para os três
     números continuarem na mesma linha. */
  const marcaDaUltima = item.historico[0]?.marca ?? null;
  const [painel, setPainel] = useState<"divisao" | "vinculo" | "historico" | "produto" | null>(
    null,
  );
  const [aberto, setAberto] = useState(false);

  const menor = menorOfertaDe(item);
  const dividido = item.precos.filter((p) => p.aprovado).length > 1;
  const porChamado = new Map(colunas.map((c) => [c.chamadoId, c]));

  /* De quem a casa vai comprar este item, com o nome junto — é o que o botão
     de negociar precisa saber. Quase sempre um; zero enquanto ninguém
     decidiu, e mais de um quando a compra foi dividida. */
  const escolhidos = item.precos.flatMap((preco) => {
    const c = preco.aprovado ? porChamado.get(preco.cotacaoFornecedorId) : undefined;
    return c === undefined ? [] : [{ preco, nome: c.nome }];
  });

  /* Só o que veio por uma coluna que está na tela. Preço de fornecedor
     escondido não pode aparecer aqui — seria a lista dizendo uma coisa e o
     mapa outra sobre a mesma cotação. */
  const respostas = item.precos.filter((p) => porChamado.has(p.cotacaoFornecedorId));
  const ofertas = respostas
    .filter((p) => p.estatus === "OFERTADO")
    .slice()
    .sort(porPreco);
  const recusas = respostas.filter((p) => p.estatus !== "OFERTADO");
  const calaram = colunas.length - respostas.length;

  /* O que o cartão FECHADO responde sobre o preço.
     Escolhido, é de quem se compra; ninguém escolhido, é o mais barato da
     linha. Sem isto, fechar o cartão esconderia justamente a informação pela
     qual ele existe, e a lista viraria 109 nomes de produto — para saber
     qualquer coisa seria preciso abrir um por um. */
  const destaque = ofertas.find((p) => p.aprovado) ?? menor;

  return (
    <li id={`item-${item.id}`} className="card scroll-mt-4 p-3">
      {/* `details` nativo, como o resto do projeto escreve recolhimento
          (cotacao-detail.tsx, contagem-card.tsx): a seta é a do navegador, e
          teclado e leitor de tela vêm junto sem `aria-expanded` à mão.

          Nasce FECHADO. Com 109 itens, aberto ele é a lista de antes; o
          ganho todo está em a tela caber num rolar só, e o resumo da linha
          dizer o suficiente para não precisar abrir a maioria. */}
      <details className="group/item" onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary className="cursor-pointer">
          {/* O conteúdo vai dentro de um `span` de largura calculada, e não
              solto no `summary`: `summary` é `list-item`, e a seta ocupa a
              primeira caixa da linha. Sem o desconto dela, o `justify-between`
              empurraria o selo para fora da borda direita. */}
          {/* No celular o nome fica sozinho na primeira linha e o preço desce.
              Lado a lado, o preço mais o visto comem metade da faixa: medido,
              "Cerveja heineken garrafa 600ml" pede 228px e recebe 126 — e uma
              lista fechada de vinte e quatro itens vira "Cerveja heineken
              garr…" e "Refri limão sprite zer…", que só se distinguem pelo
              fim do nome que não está lá.

              De `sm` para cima volta a ser uma linha só: lá a largura sobra,
              e ler nome e preço no mesmo eixo é mais rápido. */}
          <span className="inline-flex w-[calc(100%-1.25rem)] flex-col gap-0.5 align-top sm:flex-row sm:items-baseline sm:gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">{item.nome}</span>

            {/* O preço que importa, com o cartão fechado.

                O número fica na cor do texto, sempre. Ele já esteve vinho e
                esteve verde, e as duas vezes a cor dizia "escolhido" pintando
                justamente o que a pessoa veio comparar — numa coluna de
                preços, o que muda de cor parece mudar de valor. Quem diz o
                estado é o desenho ao lado: a coroa para o mais barato, o
                visto para o escolhido. */}
            {destaque && (
              <span
                className={`num-display shrink-0 text-sm ${
                  destaque.aprovado ? "font-semibold" : ""
                }`}
              >
                {/* Pastilha redonda, e não o desenho solto.
                    Solto, o visto encostava no cifrão e virava parte do
                    número — de relance parecia um símbolo de moeda a mais. A
                    roda o separa do valor, e `-my-1` a faz caber sem esticar
                    a linha do cartão fechado.

                    O verde é o da escolha; a coroa fica em cinza de propósito
                    — ela informa, o visto decide, e dois destaques com a
                    mesma força deixariam de destacar. */}
                <span
                  className="mr-2 inline-flex size-5 -my-1 items-center justify-center rounded-full align-middle"
                  style={{
                    /* O visto vem no verde CHEIO, com o desenho branco por
                       cima. Verde claro com verde escuro dentro era discreto
                       demais para o papel dele: numa lista de cem linhas, o
                       que se procura de relance é o que já está decidido. */
                    background: destaque.aprovado
                      ? "var(--ok-strong)"
                      : "var(--muted)",
                    color: destaque.aprovado
                      ? "#ffffff"
                      : "var(--muted-foreground)",
                  }}
                >
                  {destaque.aprovado ? (
                    /* Traço mais grosso: num círculo de 20px o visto de
                       espessura normal some contra o fundo cheio. */
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                  ) : (
                    <Crown aria-hidden className="size-3" />
                  )}
                </span>
                {formatMoney(destaque.precoUnitario)}
                <span className="text-xs font-normal opacity-70">
                  /{UNIT_LABEL[item.unidade]}
                </span>
              </span>
            )}

            {/* O selo "2 de 9" saiu.
                Ele contava quantos fornecedores deram preço neste item, e a
                conta não muda decisão nenhuma: quem abre o cartão vê as
                ofertas e quem não abre não vai comprar por causa do
                denominador. Era um número por linha, cem linhas, dizendo
                respeito a nada. */}
          </span>
        </summary>
      {/* O corpo só existe aberto: com 109 cartões, montar preços, botões e
          painéis de todos (fechados) pesava no celular sem ninguém ver. */}
      {aberto && (
      <>

      {/* O painel do item: os números dele em cima, as ferramentas embaixo,
          na mesma moldura.

          Eram duas faixas soltas — o texto no fundo do cartão e os botões
          numa tarja colorida — e a divisão não correspondia a nada: estoque,
          quantidade a comprar, última compra e os cinco botões falam todos
          do ITEM, e o que vem depois da moldura são os fornecedores. Uma
          caixa só diz isso de uma vez.

          `--primary-soft` e não `--danger-soft`: aqui não há nada de errado,
          e o vermelho do erro pintando o painel faria a tela gritar sem
          motivo. */}
      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {/* Três dados, cada um com o rótulo em cima do número.

          Antes era uma frase corrida — "estoque 10 un · comprar 204 un" à
          esquerda e "última compra" empurrada para a direita por `ml-auto`.
          No celular ela quebrava e o último dado ficava sozinho numa linha,
          alinhado à direita de nada. E mesmo inteira era uma fila de
          palavras e números misturados, com pontos no meio, que se lia
          soletrando.

          Em colunas, cada número tem um lugar e o olho acha os três de uma
          vez. É o desenho que o rodapé da tabela já usa — rótulo miúdo,
          número embaixo.

          `div` e não `p`: os painéis abrem blocos aqui dentro, e bloco
          dentro de parágrafo faz o navegador fechar o `p` sozinho. */}
      {/* Centralizados, como os botões logo abaixo: as duas metades da
          moldura compartilham o mesmo eixo, e a caixa se lê como uma coisa
          só em vez de duas coladas. */}
      {/* Grade de três, e não linha que quebra.
          Com `flex-wrap`, a 375px o terceiro dado caía para a linha de baixo
          e a caixa ficava com dois em cima e um sozinho embaixo. Em grade os
          três dividem a largura igual e ficam lado a lado em qualquer tela —
          o que encolhe é a coluna, não o número de colunas.

          O rótulo quebra em duas linhas DE PROPÓSITO, escrito com `<br />` e
          não deixado à sorte da largura: assim os três blocos têm a mesma
          altura em todos os itens, e os números ficam na mesma linha de olho
          de um cartão para o outro. */}
      {/* Os três números do item, em colunas iguais separadas por fio:
          rótulo curto numa linha só, número embaixo — a mesma altura em todo
          cartão, para os números ficarem na mesma linha de olho. */}
      <div className="grid grid-cols-3 divide-x divide-[var(--border)] py-2.5 text-center">
        <span className="flex flex-col justify-between px-2">
          <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
            Contado
          </span>
          <span className="num-display mt-0.5 block text-sm">
            {formatAmount(item.quantidadeContada)} {UNIT_LABEL[item.unidade]}
          </span>
          {marcaDaUltima && <EspacoDaMarca />}
        </span>

        {/* O número da decisão, em negrito: é o que vai para o fornecedor. */}
        <span className="flex flex-col justify-between px-2">
          <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
            Comprar
          </span>
          <span className="num-display mt-0.5 block text-sm font-semibold">
            {formatAmount(item.quantidadeSolicitada)} {UNIT_LABEL[item.unidade]}
          </span>
          {marcaDaUltima && <EspacoDaMarca />}
        </span>

        <span className="flex flex-col justify-between px-2">
          <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-[var(--muted-foreground)]">
            Última compra
          </span>
          {/* Sem entrega conferida é traço, nunca zero: zero seria a casa
              dizendo que pagou nada, e o que houve foi nunca ter comprado. */}
          <span
            className="num-display mt-0.5 block text-sm"
            title={
              item.ultimaCompra === null
                ? undefined
                : `na entrega de ${formatDateString(item.ultimaCompra.em.slice(0, 10))}`
            }
          >
            {item.ultimaCompra === null
              ? "—"
              : `${formatMoney(item.ultimaCompra.valor)}/${UNIT_LABEL[item.unidade]}`}
          </span>
          {/* A marca que veio da última vez, sem abrir o Histórico. */}
          {marcaDaUltima && (
            <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{marcaDaUltima}</span>
          )}
        </span>
      </div>

      {/* As ressalvas em linha própria, embaixo dos três.
          São exceção — a maioria dos itens não tem nenhuma —, e no meio dos
          dados elas empurravam os números de lugar de um item para o outro,
          justamente o que a coluna veio consertar. */}
      {(dividido || item.semFornecedor || linhaComprada) && (
        <p className="border-t border-[var(--border)] px-3 py-1.5 text-center text-xs">
          {dividido && (
            <span className="text-[var(--primary)]">compra dividida</span>
          )}
          {dividido && (item.semFornecedor || linhaComprada) && " · "}
          {item.semFornecedor && (
            <span className="text-[var(--muted-foreground)]">sem fornecedor</span>
          )}
          {item.semFornecedor && linhaComprada && " · "}
          {/* Por que os preços deste item pararam de responder ao toque.
              Sem a frase a linha fica muda: o dedo bate e nada acontece, e
              "nada acontece" se lê como defeito. */}
          {linhaComprada && (
            <span style={{ color: "var(--warn)" }}>
              já está num pedido — para mudar, cancele o pedido
            </span>
          )}
        </p>
      )}

      {/* As ferramentas, embaixo dos números do item e dentro da mesma
          moldura. Uma linha pontilhada as separa: são a mesma família — tudo
          aqui é o item — mas uma metade informa e a outra age. */}
      {!fechada && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] px-2.5 py-2.5">
          <MudarQuantidade item={item} travado={linhaComprada} />

          {/* Negociar o preço DO ESCOLHIDO.
              Era um ícone por oferta, repetido em cada linha de fornecedor.
              Só que negociar acontece depois de decidir de quem comprar — é
              conversa com um fornecedor, não com os nove —, e nove ícones
              de dinheiro empilhados ofereciam oito conversas que ninguém vai
              ter.

              Sem escolha não há o que negociar, e com a compra dividida não
              há UM preço: nos dois casos o botão desliga e o `title` diz por
              quê. Dividido, quem negocia é o mapa, célula a célula. */}
          {escolhidos.length === 1 && !linhaComprada ? (
            <Negociar
              preco={escolhidos[0].preco}
              unidade={item.unidade}
              fornecedor={escolhidos[0].nome}
              item={item.nome}
            />
          ) : (
            <BotaoDoItem
              aoTocar={() => undefined}
              desabilitado
              noCartao
              rotulo={`Negociar o preço de ${item.nome}`}
              titulo={
                linhaComprada
                  ? "Este item já está num pedido confirmado"
                  : escolhidos.length === 0
                    ? "Escolha de quem comprar para negociar o preço"
                    : "A compra deste item está dividida — negocie cada preço no mapa"
              }
            >
              <CircleDollarSign aria-hidden className="size-4" />
            </BotaoDoItem>
          )}

          <BotaoDoItem
            aoTocar={() => setPainel((a) => (a === "divisao" ? null : "divisao"))}
            ativo={dividido}
            aberto={painel === "divisao"}
            desabilitado={linhaComprada}
            noCartao
            rotulo={`Dividir a compra de ${item.nome} entre fornecedores`}
            titulo={
              linhaComprada
                ? "Este item já está num pedido confirmado"
                : "Comprar este item de mais de um fornecedor"
            }
          >
            <Split aria-hidden className="size-4" />
          </BotaoDoItem>

          <BotaoDoItem
            aoTocar={() => setPainel((a) => (a === "vinculo" ? null : "vinculo"))}
            aberto={painel === "vinculo"}
            noCartao
            rotulo={`Vincular um fornecedor a ${item.nome}`}
            titulo="Vincular um fornecedor a este produto"
          >
            <Link2 aria-hidden className="size-4" />
          </BotaoDoItem>

          <BotaoDoItem
            aoTocar={() => setPainel((a) => (a === "historico" ? null : "historico"))}
            aberto={painel === "historico"}
            noCartao
            rotulo={`Ver as últimas compras de ${item.nome}`}
            titulo="As últimas compras deste item"
          >
            <History aria-hidden className="size-4" />
          </BotaoDoItem>

          {/* Corrigir o CADASTRO do produto (nome, unidade, categoria), e não a
              oferta: vai para Pendências esperar a autorização do dono. */}
          <BotaoDoItem
            aoTocar={() => setPainel((a) => (a === "produto" ? null : "produto"))}
            aberto={painel === "produto"}
            noCartao
            rotulo={`Sugerir correção no cadastro de ${item.nome}`}
            titulo="Corrigir nome, unidade ou categoria — vai para autorizar em Pendências"
          >
            <SquarePen aria-hidden className="size-4" />
          </BotaoDoItem>
        </div>
      )}

      {/* O painel aberto, em linha própria e ainda DENTRO da moldura: ele é
          do item, como o resto daqui, e nenhum dos três cabe encaixado ao
          lado dos botões — um é uma lista de campos, um por fornecedor; o
          outro é uma busca com resultados; o terceiro é um histórico. */}
      {painel !== null && (
        <div className="border-t border-[var(--border)] p-2.5">
          {painel === "divisao" ? (
            <DivisaoDaCompra
              item={item}
              colunas={colunas}
              aoFechar={() => setPainel(null)}
            />
          ) : painel === "vinculo" ? (
            <VincularAoItem
              item={item}
              fornecedores={paraVincular}
              aoFechar={() => setPainel(null)}
            />
          ) : painel === "produto" ? (
            <EditarProdutoNaCotacao
              item={item}
              cotacaoId={cotacaoId}
              categorias={categorias}
              aoFechar={() => setPainel(null)}
            />
          ) : (
            <HistoricoDoItem item={item} />
          )}
        </div>
      )}
      </div>

      {respostas.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-center text-sm text-[var(--muted-foreground)]">
          Ninguém respondeu por este item.
        </p>
      ) : (
        /* As ofertas numa tabela só: uma moldura, linhas separadas por fio,
           o fornecedor à esquerda e o preço numa coluna fixa à direita — o
           olho desce pelos preços sem pular. Eram botões soltos, cada um com
           sombra própria, e a lista parecia um monte de cartões. */
        <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {ofertas.map((preco) => {
            const c = porChamado.get(preco.cotacaoFornecedorId)!;
            const eMenor = menor?.id === preco.id;
            const salvando = emVoo === preco.id;
            return (
              /* O alvo de escolher e o ícone de negociar lado a lado, e não
                 um dentro do outro: botão dentro de botão é HTML inválido, e
                 o clique de abrir o campo escolheria o fornecedor de
                 passagem. */
              <li key={preco.id}>
                <OfertaComCorrecao
                  preco={preco}
                  item={item}
                  fornecedor={c.nome}
                  travada={
                    fechada ||
                    linhaComprada ||
                    (porChamado.get(preco.cotacaoFornecedorId)?.pedidoId ?? null) !== null
                  }
                >
                {/* Mesma trava do mapa: a cotação fechada, a coluna de quem
                    já comprou, e a linha que já está dentro de um pedido. A
                    terceira faltava aqui, e era o clique que não fazia nada
                    ao tocar outro fornecedor numa linha já comprada. */}
                <AlvoDePreco
                  fechada={
                    fechada ||
                    linhaComprada ||
                    (porChamado.get(preco.cotacaoFornecedorId)?.pedidoId ?? null) !== null
                  }
                  aprovado={preco.aprovado}
                  salvando={salvando}
                  aoTocar={() => aoTocar(preco)}
                  semRelevo
                  rotulo={frasePreco({
                    preco,
                    item,
                    fornecedor: c.nome,
                    eMenor,
                  })}
                  className={`flex min-h-12 w-full min-w-0 flex-1 items-center justify-between gap-3 border-l-[3px] px-3 py-2.5 text-left ${
                    preco.aprovado
                      ? "border-l-[var(--ok-strong)] bg-[var(--ok-soft)]"
                      : "border-l-transparent bg-[var(--background)]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium leading-snug">{c.nome}</span>
                      {preco.aprovado && (
                        <Check aria-hidden className="size-4 shrink-0 text-[var(--ok-strong)]" strokeWidth={3} />
                      )}
                    </span>
                    <Apoio
                      preco={preco}
                      item={item}
                      salvando={salvando}
                    />
                    <Embalagem preco={preco} unidade={item.unidade} />
                    <AlertaDePreco preco={preco} item={item} />
                    {/* A observação por extenso, e não um expoente.
                        No mapa ela é dica de cursor; aqui cursor não existe,
                        e o rodapé numerado que fazia esse papel saiu. Cabe:
                        o cartão tem a largura da tela e uma oferta por
                        linha. */}
                    {preco.observacoes && (
                      <span className="block text-xs opacity-70">
                        {preco.observacoes}
                      </span>
                    )}
                  </span>
                  {/* Também aqui o número grande é o PREÇO POR UNIDADE, pela
                      mesma razão do mapa: é o que compara fornecedores. O
                      total da linha desceu para a linha de apoio. */}
                  <span className="num-display flex min-w-[5.5rem] sm:min-w-[7.5rem] shrink-0 flex-col items-end">
                    {/* A coroa também aqui.
                        No mapa ela substituiu o "· mais barato" escrito; a
                        lista ficou sem nenhum dos dois, e com nove ofertas
                        empilhadas era preciso comparar os nove números para
                        achar o vencedor. A ordem já põe o mais barato em
                        cima, mas ordem se lê como lista e não como resposta.

                        `aria-hidden` porque o rótulo do botão já diz "o mais
                        barato" por extenso. */}
                    <span className={preco.aprovado ? "font-semibold" : ""}>
                      {formatMoney(preco.precoUnitario)}
                      <span className="text-xs font-normal opacity-70">
                        /{UNIT_LABEL[item.unidade]}
                      </span>
                    </span>
                    {eMenor && (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-1.5 py-px font-sans text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        <Crown aria-hidden className="size-2.5" />
                        menor
                      </span>
                    )}
                  </span>
                </AlvoDePreco>
                </OfertaComCorrecao>
              </li>
            );
          })}

          {recusas.map((preco) => (
            <li
              key={preco.id}
              className="flex items-center justify-between gap-3 border-l-[3px] border-l-transparent bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted-foreground)]"
            >
              <span className="min-w-0 leading-snug">
                {porChamado.get(preco.cotacaoFornecedorId)?.nome}
              </span>
              <span className="min-w-[5.5rem] sm:min-w-[7.5rem] shrink-0 text-right text-xs">
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
                  {textoDaRecusa(preco)}
                </span>
                {preco.observacoes && <span className="mt-0.5 block">{preco.observacoes}</span>}
              </span>
            </li>
          ))}

          {calaram > 0 && (
            <li className="bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
              {plural(calaram, "fornecedor", "fornecedores")}
              {calaram === 1 ? " não respondeu" : " não responderam"} este item
            </li>
          )}
        </ul>
      )}
      </>
      )}
      </details>
    </li>
  );
}

/**
 * O nome da gaveta atravessando a tabela.
 *
 * `colSpan` derivado de quem desenha as colunas, nunca escrito à mão: é a
 * única linha do arquivo que precisa saber a contagem, e ela muda com o
 * filtro.
 */
function Grupo({
  categoria,
  colunas,
  children,
}: {
  categoria: string;
  colunas: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={colunas}
          className="section-label bg-[var(--background)] pb-1 pt-5 text-left"
        >
          {/* O nome gruda à esquerda junto com a coluna do item: sem isto ele
              começava no canto da tabela e saía da tela na primeira rolagem
              lateral, deixando as gavetas sem nome justamente onde há mais
              linhas para se perder. */}
          <span className="sticky left-0 inline-block bg-[var(--background)] pr-3">
            {categoria}
          </span>
        </th>
      </tr>
      {children}
    </>
  );
}

