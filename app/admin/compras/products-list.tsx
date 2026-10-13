"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronRight, History, ListChecks, Lock, LockOpen, Package, Plus, Search, Star, Truck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import { CaixaMestre } from "@/components/ui/caixa-mestre";
import { CartaoDeSecao } from "@/components/pagina";
import { Input } from "@/components/ui/input";
import { TextoQueCresce } from "@/components/ui/texto-que-cresce";
import {
  saveProduct,
  setExclusiveSupplier,
  setProductSuppliers,
  setProductsActive,
  setProductsCategory,
} from "@/lib/actions/compras";
import { ultimasComprasDoProduto, type CompraDoProduto } from "@/lib/actions/historico-preco";
import {
  SEM_CATEGORIA,
  UNIT_LABEL,
  chave,
  formatDateString,
  formatMoney,
  plural,
} from "@/lib/format";
import { chaveDaEspecificacao, type Especificacao } from "@/lib/especificacao";
import { useTelaGrande } from "@/lib/use-tela-grande";
import type { UltimoCusto } from "@/lib/historico";
import type { Media } from "@/lib/qualidade-regra";
import { MediaEstrelas } from "@/components/estrelas";
import { LINHAS_POR_VEZ, MaisAoRolar } from "@/components/mais-ao-rolar";
import { QualidadeDoProduto } from "./qualidade-do-produto";
import type { ProductUnit } from "@/generated/prisma/client";

export type CategoriaOpcao = { id: number; name: string };
export type FornecedorOpcao = { id: number; name: string };

export type ProductRow = {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  /** As marcas que servem. Vazio = tanto faz. */
  preferredBrands: string[];
  acceptsSimilarBrand: boolean;
  /** Recebe estrelas de qualidade no recebimento. */
  avaliarQualidade: boolean;
  /** A média das estrelas, quando já foi avaliado. */
  qualidade: Media | null;
  /** O que o produto tem que ser, e o que a casa prefere. */
  especificacoes: Especificacao[];
  categoryId: number | null;
  unit: ProductUnit;
  currentStock: number;
  minStock: number | null;
  idealStock: number | null;
  /** De quanto em quanto se compra. Nulo = qualquer número serve. */
  lotSize: number | null;
  isActive: boolean;
  /** Quem vende este item. Vazio significa "quem a categoria disser". */
  supplierIds: number[];
  /**
   * A quem este item pertence, e mais ninguém. Preenchido, a sugestão de
   * compra dele pula a cotação — vira pedido direto para ele.
   */
  exclusiveSupplierId: number | null;
  /** O que a casa pagou na última entrega conferida. Nulo = nunca comprou. */
  ultimoCusto: UltimoCusto | null;
};

/** A linha como o formulário a segura: tudo texto, porque campo é texto. */
type Draft = {
  code: string;
  name: string;
  /** O detalhe do produto. Mora no painel de Editar, não na grade. */
  description: string;
  preferredBrands: string[];
  acceptsSimilarBrand: boolean;
  avaliarQualidade: boolean;
  /** O que o produto tem que ser, e o que a casa prefere. */
  especificacoes: Especificacao[];
  /** Id como texto: é o que o `value` de um `<select>` devolve. */
  categoryId: string;
  unit: ProductUnit;
  currentStock: string;
  minStock: string;
  idealStock: string;
  lotSize: string;
  isActive: boolean;
};

type Status = "parado" | "salvando" | "salvo" | "erro";

const UNITS = Object.keys(UNIT_LABEL) as ProductUnit[];

/** Do banco para o campo, na vírgula de quem digita. */
const paraCampo = (v: number | null) =>
  v === null ? "" : String(v).replace(".", ",");

const paraDraft = (p: ProductRow): Draft => ({
  code: p.code ?? "",
  name: p.name,
  description: p.description ?? "",
  preferredBrands: p.preferredBrands,
  acceptsSimilarBrand: p.acceptsSimilarBrand,
  avaliarQualidade: p.avaliarQualidade,
  especificacoes: p.especificacoes,
  categoryId: p.categoryId === null ? "" : String(p.categoryId),
  unit: p.unit,
  currentStock: paraCampo(p.currentStock),
  minStock: paraCampo(p.minStock),
  idealStock: paraCampo(p.idealStock),
  lotSize: paraCampo(p.lotSize),
  isActive: p.isActive,
});

const VAZIO: Draft = {
  code: "",
  name: "",
  description: "",
  preferredBrands: [],
  acceptsSimilarBrand: false,
  avaliarQualidade: false,
  especificacoes: [],
  categoryId: "",
  unit: "UN",
  currentStock: "0",
  minStock: "",
  idealStock: "",
  lotSize: "",
  isActive: true,
};

/**
 * Uma régua só para o cabeçalho e as linhas não saírem de esquadro.
 *
 * O nome do produto é a única coluna elástica, então ele fica com a SOBRA — e
 * a sobra é pequena: o painel é `max-w-4xl px-5` (app/admin/layout.tsx) e, no
 * desktop, a barra lateral ainda come uns 64px. Sobram 792px de grade por mais
 * largo que seja o monitor.
 *
 * A grade já gastou 636px em colunas fixas e deixava 84px para o nome. Foram
 * saindo as que não se percorrem: fornecedor e ativo viraram o botão Editar,
 * e a categoria virou filtro. Sobram 316px.
 *
 * Mexeu aqui, refaça a conta: 792 − (soma das fixas) − (7 vãos × 8px). E meça
 * na tela: a barra lateral entra e sai conforme a largura, e é ela que
 * derruba a conta de quem calcula só pelo `max-w`.
 *
 * A ORDEM É A DO HTML, não a da tela. Com `lg:contents` os embrulhos somem e
 * cada campo cai na coluna seguinte, na sequência em que foi escrito — trocar
 * dois campos de lugar no JSX troca as larguras deles aqui. A sequência é:
 * marcar · código · nome · unidade · atual · mínimo · ideal · custo · editar.
 *
 * O custo vem no HTML logo depois do nome (é onde o celular o quer, abrindo a
 * linha dos números), mas na tabela ele vai para perto do Editar, a pedido do
 * dono: `lg:order-1` nele e `lg:order-2` no Editar os levam para o fim, e a
 * régua abaixo segue a ORDEM DA TELA.
 */
const COLUNAS =
  "lg:grid-cols-[1.75rem_4.5rem_1fr_3.5rem_4rem_4rem_4rem_4.5rem_7rem]";

/**
 * Uma linha da grade.
 *
 * Fica no escopo do módulo, não dentro de ProductsList: definida lá dentro,
 * ela seria uma função nova a cada render, o React trataria como outro tipo
 * de componente e remontaria os campos a cada tecla, perdendo o foco.
 */
function Linha({
  d,
  set,
  marca,
  selecao,
  editar,
  custo,
  qualidade,
  identidade,
  exclusivo,
}: {
  d: Draft;
  set: (campo: keyof Draft, valor: string | boolean, imediato?: boolean) => void;
  marca?: React.ReactNode;
  /** A caixa de marcar da primeira coluna. Ausente na linha de cadastro. */
  selecao?: React.ReactNode;
  /**
   * O botão que abre o painel de ativar/desativar e vincular fornecedor.
   * Ausente na linha de cadastro: o produto precisa existir para ter vínculo.
   */
  editar?: React.ReactNode;
  /** O custo da última entrega. Só leitura, e ausente na linha de cadastro. */
  custo?: UltimoCusto | null;
  /** A média das estrelas de qualidade, quando o produto já foi avaliado. */
  qualidade?: Media | null;
  /** O nome de quem tem a exclusividade do produto. Nulo = ninguém. */
  exclusivo?: string | null;
  /**
   * Nome e código não gravam sozinhos: são os campos que dizem O QUE a coisa
   * é, e um toque sem querer neles renomeia o item em toda a cotação.
   *
   * Ausente na linha de cadastro, onde não há o que confirmar — nada foi
   * gravado ainda, e ali os dois voltam a usar o `set` comum.
   */
  identidade?: {
    valor: (campo: "name" | "code") => string;
    aoDigitar: (campo: "name" | "code", valor: string) => void;
    aoSair: (campo: "name" | "code") => void;
    /** Enter faz o mesmo que sair do campo; Esc descarta o que foi digitado. */
    aoTecla: (campo: "name" | "code", tecla: string) => void;
  };
}) {
  const num = "text-right tabular-nums";
  // `px-1.5` no lugar do `px-3` que o Input e o `.field` trazem: é o aperto
  // entre o texto e a borda que permite as colunas estreitas da régua acima.
  // Fica aqui, e não nos componentes, porque eles servem todas as telas do
  // sistema.
  //
  // 30px, o mesmo número no celular e no monitor. A altura desceu de 44 em
  // três rodadas, a pedido do dono, porque as caixas sobravam altura em volta
  // de um texto de uma linha só.
  //
  // O sufixo de desktop saiu junto: ele valia 32px, e manter os dois faria o
  // monitor ter a caixa MAIOR que o celular — o contrário do que faz sentido,
  // já que é no celular que se toca com o dedo.
  //
  // Fica abaixo dos 44px que as diretrizes de toque recomendam. É decisão do
  // dono, que opera a tela e conhece os dedos que a usam.
  //
  // `min-h-[30px]!` porque o globals.css dá 44px de altura mínima a todo
  // campo do painel; sem passar por cima, unidade, atual e ideal ficavam
  // mais altos que a moldura do custo, a pedido do dono todas iguais a ela.
  const campo = "h-[30px] min-h-[30px]! w-full px-1.5";

  /**
   * Enter e Esc no nome e no código.
   *
   * Enter faz o mesmo que sair do campo — é o que a mão espera depois de
   * digitar, e sem isto a pergunta de confirmação só aparecia clicando fora,
   * o que parecia que nada tinha sido gravado. `preventDefault` porque um
   * dia esta linha pode viver dentro de um formulário, e ali Enter recarrega
   * a página.
   */
  const tecla =
    (nome: "name" | "code") => (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!identidade) return;
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      identidade.aoTecla(nome, e.key);
    };

  return (
    <div
      className={`grid grid-cols-12 items-end gap-x-1.5 gap-y-1 rounded-lg border border-[var(--border)] p-2.5 lg:items-center lg:gap-y-2 lg:rounded-none lg:border-0 lg:p-0 ${COLUNAS}`}
    >
      {/* Rótulo, não div: o contêiner tem 44px de altura mas a caixa tem 20,
          e sem a associação implícita só os 20 seriam clicáveis. */}
      {/* No celular a caixa de marcar desce para a última linha, junto do
          Editar (`order-1`): em cima fica o nome, no meio os quatro números
          — custo, unidade, atual e ideal — numa linha só. Na tabela, a ordem
          do HTML volta a valer (`lg:order-none`). */}
      <label className="order-1 col-span-2 flex min-h-[30px] cursor-pointer items-center justify-center lg:order-none lg:col-auto lg:min-h-0">
        {selecao}
      </label>

      {/* Três colunas de seis, e um teto de largura por cima disso.

          O código da casa é "HF-001", não um parágrafo. Ocupando a linha
          quase inteira ao lado da caixa de marcar, ele parecia o campo mais
          importante do cadastro — quando o que a pessoa lê para achar a linha
          é o nome do produto, logo abaixo.

          Só a coluna não resolvia: metade de uma tela de tablet ainda são
          350px de caixa para seis caracteres. O `max-w` cai no `lg`, onde
          quem manda na largura é a régua de colunas da grade. */}
      {/* No celular o código mora no painel de Editar; aqui, só na tabela. */}
      <Campo rotulo="Código" span="hidden">
        <Input
          aria-label="Código"
          value={identidade ? identidade.valor("code") : d.code}
          onChange={(e) =>
            identidade
              ? identidade.aoDigitar("code", e.target.value)
              : set("code", e.target.value)
          }
          onBlur={identidade ? () => identidade.aoSair("code") : undefined}
          onKeyDown={tecla("code")}
          className={`${campo} max-w-32 lg:max-w-none`}
        />
      </Campo>

      {/* `order-first` só no celular, e não uma troca de lugar no JSX.

          No cartão o nome vem primeiro: é o que identifica a linha, e código,
          marcar e unidade são detalhes dele. Na tabela a ordem é outra — a
          caixa de marcar abre a linha, como em toda tabela com seleção.

          Mexer na ordem do JSX resolveria o celular e embaralharia a tabela,
          porque `lg:contents` faz cada campo cair na coluna seguinte na
          sequência do HTML. `order` muda só o desenho, e some no `lg`. */}
      {/* Sem o rótulo "Produto" no cartão, a pedido do dono: o nome em
          negrito no topo já diz o que é. A estrela à esquerda marca o
          exclusivo, a mesma do painel de Editar. */}
      <Campo rotulo="" span="col-span-12 order-first lg:order-none">
        <div className="flex items-center gap-1.5">
          {exclusivo && (
            <Star
              role="img"
              aria-label={`Exclusivo de ${exclusivo}`}
              className="size-4 shrink-0 fill-[var(--warn)] text-[var(--warn)]"
            >
              <title>{`Exclusivo de ${exclusivo}`}</title>
            </Star>
          )}
          {/* Caixa que cresce: nome comprido quebra linha em vez de sumir no
              fim da caixa — dois refrigerantes quase iguais eram iguais na tela. */}
          <TextoQueCresce
            aria-label="Nome do produto"
            value={identidade ? identidade.valor("name") : d.name}
            onChange={(e) =>
              identidade
                ? identidade.aoDigitar("name", e.target.value)
                : set("name", e.target.value)
            }
            onBlur={identidade ? () => identidade.aoSair("name") : undefined}
            onKeyDown={tecla("name")}
            // Maior e em negrito: é o que o olho procura ao descer a lista.
            // A mesma altura da moldura do custo (30px), a pedido do dono.
            className="min-h-[30px] w-full px-1.5 py-[3px] text-[17px] leading-[22px] font-bold lg:py-1 lg:text-[15px] lg:leading-tight"
            required
          />
        </div>
        {/* A nota do produto avaliado, logo embaixo do nome. */}
        {qualidade && (
          <span className="mt-0.5 block px-1.5">
            <MediaEstrelas media={qualidade.media} n={qualidade.n} />
          </span>
        )}
      </Campo>

      {/* Custo é leitura, não campo: sai do histórico de entregas conferidas,
          e digitá-lo aqui seria inventar um preço que ninguém pagou.

          Mesmo assim ganha moldura, a pedido do dono: sem ela o número
          flutuava solto entre caixas, e o buraco na fileira lia como erro de
          desenho, não como "isto não se edita". Quem diz que não se edita é o
          fundo branco parado, sem cursor e sem foco — as caixas de digitar
          têm o creme do resto da tela.

          Nunca comprado mostra travessão, não "R$ 0,00": zero é um preço, e
          "ainda não compramos" não é preço nenhum.

          Escrito DEPOIS do nome, o que na tabela o põe à direita dele. No
          cartão do celular o nome pula para o topo pelo `order-first`, e o
          custo volta a encostar no código, que é onde ele foi pedido lá. */}
      <Campo rotulo="Custo" span="col-span-3">
        <p
          className={`num-display flex h-[30px] items-center justify-end rounded-lg lg:order-1 border border-[var(--border)] bg-[var(--background)] px-1.5 text-sm ${
            custo ? "" : "text-[var(--muted-foreground)]"
          }`}
          title={
            custo
              ? `${formatMoney(custo.valor)} por ${UNIT_LABEL[d.unit]} — última entrega conferida em ${formatDateString(custo.em.slice(0, 10))}`
              : "Nenhuma entrega conferida ainda para este produto"
          }
        >
          {custo ? formatMoney(custo.valor) : "—"}
        </p>
      </Campo>

      {/* Unidade encosta no Atual: os dois se leem juntos — "8,25 kg" — e
          separá-los obrigava a olhar duas partes do cartão para entender um
          número só. */}
      <Campo rotulo="Unidade" span="col-span-3">
        <select
          aria-label="Unidade"
          value={d.unit}
          onChange={(e) => {
            set("unit", e.target.value, true);
          }}
          className={`field py-0 ${campo}`}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </Campo>

      {/* A categoria saiu daqui e foi para o painel de Editar: escolhe-se uma
          vez, e as 6,5rem que ela ocupava eram tiradas do nome do produto, que
          é o que se lê para achar a linha. Achar por categoria agora é o
          filtro ao lado da busca. */}

      {/* Cada número com o nome em cima. Sem rótulo eles são "8,25", "5" e
          "12,5" em sequência, e trocar mínimo por ideal é um erro que só
          aparece semanas depois, como sugestão de compra errada — a grade
          grava sozinha e ninguém confirma nada. */}
      <Campo rotulo="Atual" span="col-span-3">
        <Input
          aria-label="Estoque atual"
          value={d.currentStock}
          onChange={(e) => set("currentStock", e.target.value)}
          inputMode="decimal"
          className={`${campo} ${num}`}
        />
      </Campo>

      {/* O mínimo não aparece no celular, a pedido do dono; na tabela, sim. */}
      <Campo rotulo="Mínimo" span="hidden">
        <Input
          aria-label="Estoque mínimo"
          value={d.minStock}
          onChange={(e) => set("minStock", e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className={`${campo} ${num}`}
        />
      </Campo>

      <Campo rotulo="Ideal" span="col-span-3">
        <Input
          aria-label="Estoque ideal"
          value={d.idealStock}
          onChange={(e) => set("idealStock", e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className={`${campo} ${num}`}
        />
      </Campo>

      {/* Uma coluna no lugar de duas.

          Aqui moravam a caixa "Ativo" e o botão de vincular fornecedor: dois
          controles que quase nunca se mexem, ocupando 7,5rem de uma grade que
          nunca passa de 856px — espaço tirado do nome do produto, que é o que
          a pessoa lê para achar a linha. Os dois foram para dentro do painel
          de Editar, e as 3rem devolvidas foram para a descrição. */}
      <div className="order-1 col-span-10 flex min-h-[30px] items-center gap-2 lg:order-2 lg:col-auto lg:min-h-0">
        {editar}
        {marca}
      </div>
    </div>
  );
}

/**
 * Um campo com o nome em cima, até a grade de dez colunas assumir.
 *
 * `lg:contents` é o que permite os dois desenhos no mesmo HTML: a partir de
 * `lg` o embrulho some do layout e o campo passa a ser filho direto da grade,
 * caindo na coluna certa. O rótulo some junto, porque lá em cima quem nomeia
 * a coluna é o cabeçalho.
 *
 * Abaixo disso não havia desenho nenhum: a grade caía para duas colunas e o
 * cabeçalho ficava escondido, então cada campo virava uma caixa sem nome.
 */
function Campo({
  rotulo,
  span,
  children,
}: {
  rotulo: string;
  span: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${span} lg:contents`}>
      {rotulo && (
        <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] lg:hidden">
          {rotulo}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Cadastro de produto como planilha: toda linha é editável no lugar, sem
 * passar por um botão de editar. Cadastro é tela de digitar, e um clique a
 * mais por campo, vezes duzentos itens, é o que faz ninguém manter a lista.
 *
 * Grava pouco depois de parar de digitar, não a cada tecla — uma ida ao
 * servidor por edição, não por letra. Seleção e caixa gravam na hora, porque
 * ali não existe "meio preenchido".
 *
 * A primeira coluna marca linhas para agir em várias de uma vez. É outra
 * caixa que a de Ativo, no fim: aquela é o estado do produto, esta é só o que
 * está na mão. Deixá-las nas pontas opostas é o que impede confundir "escolhi
 * este" com "liguei este".
 */
export function ProductsList({
  telaGrandeNoServidor,
  items,
  categorias,
  fornecedores,
  planilha,
}: {
  items: ProductRow[];
  categorias: CategoriaOpcao[];
  fornecedores: FornecedorOpcao[];
  /**
   * Os botões de planilha, ao lado do "Novo produto".
   *
   * Slot em vez de import: o ImportPanel tem estado próprio (o painel abre e
   * fecha), e trazer esse estado para cá só para os botões ficarem lado a lado
   * seria pagar acoplamento por alinhamento. A página monta os dois.
   */
  planilha?: React.ReactNode;
  /** Computador (true) ou celular, pelo navegador — ver `useTelaGrande`. */
  telaGrandeNoServidor: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(items.map((p) => [p.id, paraDraft(p)])),
  );
  // O estoque de cada linha como a tela o recebeu, para `saveProduct` saber se
  // alguém mexeu no número ou se ele só está indo junto com o resto.
  const estoqueLido = useRef<Record<number, string>>(
    Object.fromEntries(items.map((p) => [p.id, paraCampo(p.currentStock)])),
  );
  const [vinculos, setVinculos] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.supplierIds])),
  );
  const [exclusivos, setExclusivos] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(items.map((p) => [p.id, p.exclusiveSupplierId])),
  );
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [erros, setErros] = useState<Record<number, string>>({});
  const [novo, setNovo] = useState<Draft | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Abre em "ativos", que é como a lista sempre se comportou: o desativado
  // existe para sair da frente, e vê-lo é que precisa ser um pedido.
  // Vindo da lupa do topo (`?q=`), abre já buscando o produto, desativado
  // ou não: quem procurou por ele quer achá-lo.
  const qDaLupa = useSearchParams().get("q") ?? "";
  const [filtroStatus, setFiltroStatus] = useState<
    "ativos" | "desativados" | "todos"
  >(qDaLupa ? "todos" : "ativos");
  const [busca, setBusca] = useState(qDaLupa);
  const [qAnterior, setQAnterior] = useState(qDaLupa);
  if (qDaLupa !== qAnterior) {
    setQAnterior(qDaLupa);
    if (qDaLupa) {
      setBusca(qDaLupa);
      setFiltroStatus("todos");
    }
  }
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set());
  const [aberto, setAberto] = useState<number | null>(null);
  // O histórico de preço aberto (um produto por vez) e o que já foi buscado.
  // Buscado só no toque: são 340 produtos, e quase ninguém abre mais que três.
  const [precoAberto, setPrecoAberto] = useState<number | null>(null);
  const [compras, setCompras] = useState<Record<number, CompraDoProduto[] | "erro">>({});

  function alternarPreco(id: number) {
    if (precoAberto === id) return setPrecoAberto(null);
    setPrecoAberto(id);
    if (compras[id] === undefined || compras[id] === "erro") {
      ultimasComprasDoProduto(id)
        .then((linhas) => setCompras((c) => ({ ...c, [id]: linhas })))
        .catch(() => setCompras((c) => ({ ...c, [id]: "erro" })));
    }
  }
  // A marca sendo digitada, ainda fora da lista. Uma só basta: um painel
  // aberto por vez.
  const [marcaNova, setMarcaNova] = useState("");
  const [especNova, setEspecNova] = useState("");
  const [especTrava, setEspecTrava] = useState(false);
  /**
   * O nome ou código que está sendo digitado, fora do `drafts`.
   *
   * Um por vez basta: sair do campo já força a decisão, então não há como
   * acumular dois pendentes. `confirmar` liga quando o campo perde o foco com
   * o valor mudado — é o que faz a caixa de confirmação aparecer.
   */
  const [pendente, setPendente] = useState<{
    id: number;
    campo: "name" | "code";
    valor: string;
    confirmar: boolean;
  } | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  /**
   * O "Confirmar" da caixa de aviso, e se ele deve receber o foco.
   *
   * Só Enter pede o foco. Clicar fora também abre a caixa, mas ali roubar o
   * foco seria desfazer o clique de quem foi digitar no campo ao lado.
   */
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const focarConfirmar = useRef(false);

  // Sair da tela com gravação pendente deixaria um temporizador chamando
  // setState em componente desmontado.
  useEffect(() => {
    const atuais = timers.current;
    return () => Object.values(atuais).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!pendente?.confirmar) {
      focarConfirmar.current = false;
      return;
    }
    if (!focarConfirmar.current) return;
    focarConfirmar.current = false;
    confirmarRef.current?.focus();
  }, [pendente?.confirmar, pendente?.id, pendente?.campo]);

  /**
   * Um texto por produto, já sem acento, para procurar dentro.
   *
   * Montado uma vez por lista, não a cada tecla: normalizar duzentas linhas a
   * cada letra digitada é trabalho jogado fora, e a lista só muda quando o
   * servidor devolve outra.
   *
   * "sem categoria" entra no texto de propósito — é o termo que a pessoa
   * digita quando quer justamente achar o que ficou sem guardar.
   */
  const indiceDeBusca = useMemo(() => {
    const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c.name]));
    return new Map(
      items.map((p) => [
        p.id,
        chave(
          [
            p.code ?? "",
            p.name,
            p.categoryId === null
              ? SEM_CATEGORIA
              : (nomeDaCategoria.get(p.categoryId) ?? ""),
          ].join(" "),
        ),
      ]),
    );
  }, [items, categorias]);

  /* A busca adiada: a letra entra na caixa na hora, e a lista filtra logo em
     seguida, sem segurar a digitação. Com 340 produtos, filtrar e redesenhar
     junto com cada tecla travava o celular por segundos. */
  const buscaAdiada = useDeferredValue(busca);
  const termo = chave(buscaAdiada);

  /* Buscar pelo fornecedor (o caminhão ao lado da busca): o texto de cada
     produto passa a ser o nome de quem o vende — os vinculados e o exclusivo.
     Montado dos vínculos da tela, e não do servidor, para um fornecedor que
     acabou de ser vinculado já aparecer na busca. */
  const [porFornecedor, setPorFornecedor] = useState(false);
  const indicePorFornecedor = useMemo(() => {
    if (!porFornecedor) return null;
    const nome = new Map(fornecedores.map((f) => [f.id, f.name]));
    return new Map(
      items.map((p) => {
        const ids = new Set(vinculos[p.id] ?? p.supplierIds);
        const ex = p.id in exclusivos ? exclusivos[p.id] : p.exclusiveSupplierId;
        if (ex !== null && ex !== undefined) ids.add(ex);
        return [p.id, chave([...ids].map((id) => nome.get(id) ?? "").join(" | "))];
      }),
    );
  }, [porFornecedor, items, fornecedores, vinculos, exclusivos]);
  const indiceAtivo = indicePorFornecedor ?? indiceDeBusca;
  // Os dois filtros se somam: status e texto. A categoria não tem filtro
  // próprio: a lista já vem separada por ela, e a busca acha pelo nome dela.
  const visiveis = items
    .filter((p) =>
      filtroStatus === "todos" ? true : p.isActive === (filtroStatus === "ativos"),
    )
    .filter((p) => termo === "" || indiceAtivo.get(p.id)?.includes(termo));

  // Só conta o que está na tela: agir sobre linha escondida seria ação às
  // cegas, e a pessoa marcou o que ela estava vendo. Vale para desativado
  // escondido e agora também para o que a busca filtrou — quem marca três,
  // digita e vê um, age sobre aquele um. Os outros dois continuam marcados e
  // reaparecem quando a busca sai.
  const marcadosVisiveis = visiveis.filter((p) => marcados.has(p.id));

  /* A lista desenha aos poucos: as primeiras 40 e mais a cada
     rolada. Todas as 340 linhas de uma vez — cada uma com seis campos, uma
     lista de unidades e dois botões — eram 16 mil elementos e 2,5 MB de
     página, e o celular levava segundos para abrir a tela e para voltar da
     busca. Filtros, busca e "marcar todos" continuam valendo para a lista
     inteira; só o desenho é que vem em partes.

     Mudou o filtro, volta para o começo: a lista nova começa do topo. Ajuste
     durante a renderização, e não num efeito — o jeito que o React recomenda
     para estado que acompanha outro. */
  const [limite, setLimite] = useState(LINHAS_POR_VEZ);
  const filtroAtual = `${termo}|${porFornecedor}|${filtroStatus}`;
  const [filtroAnterior, setFiltroAnterior] = useState(filtroAtual);
  if (filtroAtual !== filtroAnterior) {
    setFiltroAnterior(filtroAtual);
    setLimite(LINHAS_POR_VEZ);
  }
  const naTela = visiveis.slice(0, limite);

  /* No celular, os produtos por categoria, cada uma abrindo e fechando. Só
     a categoria aberta é desenhada — o resto é uma linha com o nome e a
     quantidade —, então aqui não precisa do "mostrar mais". Buscando ou
     filtrando por categoria, tudo abre: o que se procura tem que aparecer.
     No computador continua a tabela corrida. */
  const telaGrande = useTelaGrande(telaGrandeNoServidor);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(() => new Set());
  const tudoAberto = termo !== "";
  const nomeDaCategoria = new Map(categorias.map((c) => [String(c.id), c.name]));
  type Entrada =
    | { tipo: "grupo"; chave: string; nome: string; total: number; aberto: boolean }
    | { tipo: "produto"; p: ProductRow };
  const entradas: Entrada[] = [];
  // Buscando no celular, tudo abre; sem limite, uma letra só desenhava a
  // lista inteira (cada linha com seis campos). Ali também vem em partes.
  let escondidosNoCelular = 0;
  if (telaGrande) {
    for (const p of naTela) entradas.push({ tipo: "produto", p });
  } else {
    const grupos = new Map<string, ProductRow[]>();
    for (const p of visiveis) {
      const k = p.categoryId === null ? "" : String(p.categoryId);
      const g = grupos.get(k) ?? [];
      g.push(p);
      grupos.set(k, g);
    }
    let desenhados = 0;
    for (const [k, lista] of grupos) {
      const aberto = tudoAberto || gruposAbertos.has(k);
      if (tudoAberto && desenhados >= limite) {
        escondidosNoCelular += lista.length;
        continue;
      }
      entradas.push({ tipo: "grupo", chave: k, nome: nomeDaCategoria.get(k) ?? "Sem categoria", total: lista.length, aberto });
      if (!aberto) continue;
      for (const p of lista) {
        if (tudoAberto && desenhados >= limite) {
          escondidosNoCelular += 1;
          continue;
        }
        entradas.push({ tipo: "produto", p });
        desenhados += 1;
      }
    }
  }
  function alternarGrupo(k: string) {
    setGruposAbertos((a) => {
      const n = new Set(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function payload(d: Draft) {
    return {
      ...d,
      currentStock: d.currentStock.replace(",", ".") || "0",
      minStock: d.minStock.replace(",", "."),
      idealStock: d.idealStock.replace(",", "."),
      lotSize: d.lotSize.replace(",", "."),
    };
  }

  // -------------------------------------------------------------------------
  // Nome e código: confirmar antes de gravar
  // -------------------------------------------------------------------------

  /**
   * O rascunho de uma linha, com o produto de verdade como rede.
   *
   * `drafts` nasce uma vez, com os produtos que existiam quando a tela montou.
   * Produto que chega depois — criado no formulário acima, ou autorizado a
   * partir de uma sugestão da contagem — não tem entrada ali, e cair no
   * `VAZIO` fazia duas coisas: a linha aparecia sem nome nem código, e
   * renomeá-la gravava por cima do resto com os campos em branco, apagando
   * unidade e estoque de um produto recém-criado.
   *
   * A grade já tinha essa rede na hora de desenhar a linha; faltava aqui, que
   * é justamente onde ela também escreve.
   */
  function rascunho(id: number): Draft {
    return drafts[id] ?? doServidor(id);
  }

  /* O produto como o servidor mandou. Os rascunhos nascem com a tela, então o
     produto criado depois dela (o "Adicionar" abre o cadastro dele na hora)
     ainda não tem: sem esta base, mexer nele espalhava um rascunho vazio e o
     `payload` quebrava no primeiro `replace`. */
  function doServidor(id: number): Draft {
    const p = items.find((x) => x.id === id);
    return p ? paraDraft(p) : VAZIO;
  }

  /** O que está sendo digitado no nome ou no código, à espera de decisão. */
  function valorDeIdentidade(id: number, campo: "name" | "code") {
    if (pendente && pendente.id === id && pendente.campo === campo) {
      return pendente.valor;
    }
    return rascunho(id)[campo];
  }

  function aoDigitarIdentidade(
    id: number,
    campo: "name" | "code",
    valor: string,
  ) {
    // Só o pendente muda. O `drafts` fica intocado de propósito: é dele que
    // sai a gravação automática do estoque, e deixar o nome não confirmado
    // entrar ali faria a próxima mexida no número levar o nome junto — a
    // confirmação viraria enfeite.
    setPendente({ id, campo, valor, confirmar: false });
  }

  function aoSairIdentidade(id: number, campo: "name" | "code") {
    if (!pendente || pendente.id !== id || pendente.campo !== campo) return;
    const gravado = rascunho(id)[campo];
    // Voltou ao que já era: não há o que confirmar, e perguntar seria pedir
    // decisão sobre nada.
    if (pendente.valor === gravado) return setPendente(null);
    setPendente({ ...pendente, confirmar: true });
  }

  /**
   * Enter decide, Esc desiste.
   *
   * Sem isto, a única forma de fazer a pergunta aparecer era clicar fora do
   * campo — quem digitava o nome e apertava Enter não via nada acontecer e
   * ficava sem saber se tinha gravado. Enter faz o mesmo que sair do campo;
   * o foco então pula para o "Confirmar", e o segundo Enter conclui.
   */
  function aoTeclaIdentidade(id: number, campo: "name" | "code", tecla: string) {
    if (tecla === "Escape") return cancelarIdentidade();
    focarConfirmar.current = true;
    aoSairIdentidade(id, campo);
  }

  function confirmarIdentidade() {
    if (!pendente) return;
    const { id, campo, valor } = pendente;
    const linha = { ...rascunho(id), [campo]: valor } as Draft;
    setDrafts((a) => ({ ...a, [id]: linha }));
    clearTimeout(timers.current[id]);
    gravar(id, linha);
    // O pendente sai mesmo se a gravação falhar (código duplicado, por
    // exemplo): o valor já está no `drafts`, então o campo continua mostrando
    // o que foi digitado, e a mensagem de erro aparece na linha para
    // corrigir — em vez de o texto sumir junto com a confirmação.
    setPendente(null);
  }

  /** Descarta o que foi digitado. O campo volta sozinho ao valor do `drafts`. */
  function cancelarIdentidade() {
    setPendente(null);
  }

  /**
   * Grava agora, sem esperar a pausa de digitação.
   *
   * A grade já grava sozinha, e este botão não existe porque falta gravação —
   * existe porque o painel de Editar é onde se escrevem os textos longos, e
   * quem acabou de escrever um parágrafo quer ver confirmado que ele foi,
   * em vez de confiar num aviso que já apagou.
   *
   * Cancela o cronômetro pendente antes de gravar: sem isso, o auto-save
   * dispararia logo depois com o mesmo conteúdo, e seriam duas idas ao banco
   * para uma edição só.
   */
  /** O botão Salvar: grava já e, dando certo, fecha o painel de edição. Com
      erro o painel fica aberto — é lá que a mensagem aparece. */
  function salvarAgora(id: number) {
    clearTimeout(timers.current[id]);
    const d = drafts[id];
    const fechar = () => setAberto((a) => (a === id ? null : a));
    if (d) gravar(id, d, fechar);
    else fechar();
  }

  /** Grava uma linha existente. Chamado ao parar de digitar ou ao trocar seleção. */
  function gravar(id: number, d: Draft, depois?: () => void) {
    setStatus((s) => ({ ...s, [id]: "salvando" }));
    startTransition(async () => {
      const lido = estoqueLido.current[id] ?? paraCampo(items.find((x) => x.id === id)?.currentStock ?? null);
      const r = await saveProduct(id, payload(d), lido, false);
      if (r.ok) {
        // Gravado, o número da tela passa a ser o lido: a próxima mexida no
        // nome não regrava o estoque que acabou de ser corrigido.
        estoqueLido.current[id] = d.currentStock;
        // Ganhou categoria sem fornecedor: o servidor vinculou os dela.
        if (r.vinculados) setVinculos((v) => ({ ...v, [id]: r.vinculados! }));
        setStatus((s) => ({ ...s, [id]: "salvo" }));
        setErros((e) => ({ ...e, [id]: "" }));
        setTimeout(() => setStatus((s) => ({ ...s, [id]: "parado" })), 2000);
        depois?.();
      } else {
        setStatus((s) => ({ ...s, [id]: "erro" }));
        setErros((e) => ({ ...e, [id]: r.message ?? "Falhou." }));
      }
    });
  }

  /**
   * Digitar agenda a gravação; parar de digitar é que grava.
   *
   * Antes isto dependia de sair do campo. Trocar por espera curta cobre o
   * caso de fechar a aba logo depois de editar, e é o comportamento que
   * planilha e bloco de notas ensinaram a esperar. Seleção e caixa não
   * esperam: ali não existe "meio preenchido".
   */
  function editar(
    id: number,
    campo: keyof Draft,
    valor: string | boolean | string[] | Especificacao[],
    imediato = false,
  ) {
    setDrafts((atual) => {
      const linha = { ...(atual[id] ?? doServidor(id)), [campo]: valor } as Draft;
      const espera = imediato ? 0 : 700;
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => gravar(id, linha), espera);
      return { ...atual, [id]: linha };
    });
  }

  function criar(event: React.FormEvent) {
    event.preventDefault();
    if (!novo) return;
    setErroNovo(null);
    startTransition(async () => {
      const r = await saveProduct(null, payload(novo));
      if (!r.ok) return setErroNovo(r.message ?? "Falhou.");
      /* Criado, o cadastro completo abre na hora: categoria, fornecedores,
         marcas, especificações, lote e exclusivo moram no painel de Editar,
         e a busca pelo nome põe a linha nova à vista com ele aberto. */
      setNovo(null);
      if (r.id !== undefined) {
        setPorFornecedor(false);
        setFiltroStatus((f) => (f === "desativados" ? "ativos" : f));
        setBusca(novo.name.trim());
        setAberto(r.id);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Seleção e ações em massa
  // -------------------------------------------------------------------------

  function alternarMarca(id: number) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function marcarTodos(marcar: boolean) {
    setMarcados(marcar ? new Set(visiveis.map((p) => p.id)) : new Set());
  }

  const ids = () => marcadosVisiveis.map((p) => p.id);

  function ativarMarcados(isActive: boolean) {
    const alvo = ids();
    startTransition(async () => {
      const r = await setProductsActive(alvo, isActive);
      if (!r.ok) return;
      // A tela já sabe o resultado; espelhar aqui evita a lista piscar entre
      // o clique e a volta do servidor.
      setDrafts((atual) => {
        const proximo = { ...atual };
        for (const id of alvo) proximo[id] = { ...(proximo[id] ?? doServidor(id)), isActive };
        return proximo;
      });
      setMarcados(new Set());
    });
  }

  /**
   * `valor` vem do comando de mover, onde "sem categoria" precisa de um
   * rótulo próprio: o vazio já é do item desabilitado que segura o
   * "Mover para…", e duas opções com o mesmo valor deixariam a lista sem
   * saber qual está escolhida.
   */
  function categorizarMarcados(valor: string) {
    if (valor === "") return;
    const alvo = ids();
    const categoryId = valor === "nenhuma" ? null : Number(valor);
    const comoDraft = categoryId === null ? "" : valor;
    startTransition(async () => {
      const r = await setProductsCategory(alvo, categoryId);
      if (!r.ok) return;
      setDrafts((atual) => {
        const proximo = { ...atual };
        for (const id of alvo) {
          proximo[id] = { ...(proximo[id] ?? doServidor(id)), categoryId: comoDraft };
        }
        return proximo;
      });
      setMarcados(new Set());
    });
  }

  // -------------------------------------------------------------------------
  // Quem vende cada item
  // -------------------------------------------------------------------------

  function alternarFornecedor(productId: number, supplierId: number) {
    const atuais = vinculos[productId] ?? items.find((x) => x.id === productId)?.supplierIds ?? [];
    const proximos = atuais.includes(supplierId)
      ? atuais.filter((x) => x !== supplierId)
      : [...atuais, supplierId];

    setVinculos((v) => ({ ...v, [productId]: proximos }));
    startTransition(async () => {
      await setProductSuppliers(productId, proximos);
    });
  }

  // -------------------------------------------------------------------------
  // Marcas de preferência
  // -------------------------------------------------------------------------

  /**
   * Uma marca por vez, e sem repetir.
   *
   * Grava na hora (`imediato`), como as fichas de fornecedor: adicionar não é
   * digitação pela metade, é uma decisão inteira. A comparação ignora caixa
   * para "Sadia" e "sadia" não virarem duas opções na tela do fornecedor.
   */
  function adicionarMarca(id: number, d: Draft) {
    const nova = marcaNova.trim();
    setMarcaNova("");
    if (!nova) return;
    const chaveNova = chave(nova);
    if (d.preferredBrands.some((m) => chave(m) === chaveNova)) return;
    if (d.preferredBrands.length >= 10) return;
    editar(id, "preferredBrands", [...d.preferredBrands, nova], true);
  }

  /**
   * Uma especificação por vez. Escrever já basta, e ela entra como
   * preferência; o cadeado ao lado do campo, fechado antes de adicionar, a
   * faz entrar obrigatória. Depois de adicionar ele volta a abrir: a próxima
   * começa do jeito mais comum. Grava na hora, como as marcas.
   */
  function adicionarEspec(id: number, d: Draft, obrigatoria: boolean) {
    const texto = especNova.trim();
    if (!texto) return;
    setEspecNova("");
    setEspecTrava(false);
    const chaveNova = chaveDaEspecificacao(texto);
    if (d.especificacoes.some((e) => chaveDaEspecificacao(e.texto) === chaveNova)) return;
    if (d.especificacoes.length >= 8) return;
    editar(id, "especificacoes", [...d.especificacoes, { texto, obrigatoria }], true);
  }

  /** Tocar na etiqueta troca entre obrigatória e preferência. */
  function alternarObrigatoria(id: number, d: Draft, texto: string) {
    editar(
      id,
      "especificacoes",
      d.especificacoes.map((e) => (e.texto === texto ? { ...e, obrigatoria: !e.obrigatoria } : e)),
      true,
    );
  }

  function removerEspec(id: number, d: Draft, texto: string) {
    editar(
      id,
      "especificacoes",
      d.especificacoes.filter((e) => e.texto !== texto),
      true,
    );
  }

  function removerMarca(id: number, d: Draft, marca: string) {
    editar(
      id,
      "preferredBrands",
      d.preferredBrands.filter((m) => m !== marca),
      true,
    );
  }

  /**
   * Marcar (ou desmarcar) de quem este produto é exclusivo.
   *
   * Só pode haver um: marcar substitui o vínculo largo, que some da tela
   * junto — é o servidor quem apaga (`setExclusiveSupplier`), aqui só
   * refletimos.
   */
  function alternarExclusivo(productId: number, supplierId: number | null) {
    setExclusivos((e) => ({ ...e, [productId]: supplierId }));
    if (supplierId !== null) setVinculos((v) => ({ ...v, [productId]: [] }));
    startTransition(async () => {
      await setExclusiveSupplier(productId, supplierId);
    });
  }

  // `gap-x-1.5`, igual ao das linhas, e não `gap-2`: o vão do cabeçalho era
  // 2px mais largo que o das linhas, e oito vãos depois a coluna de Ideal já
  // estava 16px fora do prumo do rótulo que a nomeia.
  const cabecalho = (
    <div
      className={`hidden gap-x-1.5 border-b border-[var(--border)] pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] lg:grid ${COLUNAS}`}
    >
      <span className="flex items-center justify-center">
        <CaixaMestre
          marcados={marcadosVisiveis.length}
          total={visiveis.length}
          onChange={marcarTodos}
        />
      </span>
      <span>Código</span>
      <span>Produto</span>
      <span>Unidade</span>
      <span>Estoque</span>
      <span>Mínimo</span>
      <span>Ideal</span>
      <span>Custo</span>
      <span />
    </div>
  );

  return (
    <>
      {/* As três ações numa fileira, a busca na de baixo.

          "Novo produto" ficava aqui e "Exportar/Importar planilha" no
          ImportPanel, uma fileira acima, com o campo de busca separando os dois
          grupos. Os três abrem uma ação; a busca filtra o que já está na tela.
          Agrupar por papel é o que junta os botões e desce o campo. */}
      {/* "Novo produto" em destaque, é a ação da tela. Fica na fileira com o
          formulário aberto, verde-claro, e um toque nele fecha. */}
      <div className="mt-6">
        <CartaoDeBotoes>
          <BotaoQuadrado
            icone={Plus}
            texto="Novo produto"
            tom="primario"
            ativo={novo !== null}
            onClick={() => setNovo(novo === null ? VAZIO : null)}
          />
          {planilha}
        </CartaoDeBotoes>
      </div>

      {/* A busca num cartão branco: o campo com a lupa em cima e, embaixo,
          o que ela procura (produto ou fornecedor) e o status. A categoria
          não tem filtro: a lista já vem separada por ela, e a busca acha pelo
          nome dela. */}
      <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          />
          <Input
            type="search"
            aria-label={porFornecedor ? "Buscar pelo fornecedor" : "Buscar produto"}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={porFornecedor ? "Nome do fornecedor" : "Código, nome ou categoria"}
            // O espaço do "limpar" só é reservado quando ele existe, senão a
            // dica sai cortada.
            className={`h-11 w-full pl-9 ${busca !== "" ? "pr-16" : ""}`}
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
        <div className="flex items-center gap-1.5">
          {/* O que a busca procura. Por fornecedor, a lista mostra os
              produtos vinculados a ele (e os exclusivos dele). Era um
              caminhão sem nome ao lado do campo, e ninguém sabia o que fazia. */}
          <div role="group" aria-label="Buscar por" className="flex shrink-0 gap-1.5">
            <button
              type="button"
              aria-pressed={!porFornecedor}
              onClick={() => setPorFornecedor(false)}
              className="chip inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm"
            >
              <Package aria-hidden className="size-4" />
              Produto
            </button>
            <button
              type="button"
              aria-pressed={porFornecedor}
              onClick={() => setPorFornecedor(true)}
              className="chip inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm"
            >
              <Truck aria-hidden className="size-4" />
              Fornecedor
            </button>
          </div>
          <select
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
            className="field h-9 min-w-0 flex-1 py-0 text-sm sm:ml-auto sm:w-40 sm:flex-none"
          >
            <option value="ativos">Ativos</option>
            <option value="desativados">Desativados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      {/* A contagem é o resultado da busca: ler "3 produtos" depois de
          digitar responde sem contar linha na tela. */}
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">{plural(visiveis.length, "produto")}</p>

      {novo && (
        <form onSubmit={criar} className="card mt-4 space-y-3 p-4">
          <Linha
            d={novo}
            set={(campo, valor) =>
              setNovo((n) => (n ? ({ ...n, [campo]: valor } as Draft) : n))
            }
          />
          {/* No celular o código não está na grade; no cadastro ele vem aqui. */}
          <label className="flex items-center gap-2 text-xs lg:hidden">
            <span className="font-medium">Código</span>
            <Input
              aria-label="Código"
              value={novo.code}
              onChange={(e) => setNovo((n) => (n ? { ...n, code: e.target.value } : n))}
              placeholder="opcional"
              className="h-[30px] w-32 px-1.5"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm">
              Adicionar
            </Button>
            <button
              type="button"
              onClick={() => {
                setNovo(null);
                setErroNovo(null);
              }}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              cancelar
            </button>
            {erroNovo && (
              <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
                {erroNovo}
              </p>
            )}
          </div>
          <p className="hint">
            Ao adicionar, o cadastro completo abre logo abaixo: categoria,
            fornecedores, marcas, especificações, lote e exclusivo.
          </p>
        </form>
      )}

      {marcadosVisiveis.length > 0 && (
        <div className="card mt-4 flex flex-wrap items-center gap-3 p-3">
          <p className="text-sm font-medium">
            {plural(marcadosVisiveis.length, "produto")} marcado
            {marcadosVisiveis.length === 1 ? "" : "s"}
          </p>

          <Button type="button" size="sm" onClick={() => ativarMarcados(true)}>
            Ativar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => ativarMarcados(false)}
          >
            Desativar
          </Button>

          <label className="text-xs">
            <span className="sr-only">Mover para a categoria</span>
            <select
              // Volta sempre para o vazio: é um comando, não o estado de nada.
              // Deixar a última escolha fixada leria como "estes estão nesta
              // categoria", que não é o que aconteceu.
              value=""
              onChange={(e) => categorizarMarcados(e.target.value)}
              className="field h-8 py-0 text-sm"
            >
              <option value="" disabled>
                Mover para…
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="nenhuma">{SEM_CATEGORIA}</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setMarcados(new Set())}
            className="ml-auto text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            limpar seleção
          </button>
        </div>
      )}

      {visiveis.length === 0 ? (
        // Vazio por filtro é outra coisa que vazio por cadastro. Dizer "nenhum
        // produto ainda" a quem filtrou faria parecer que o catálogo sumiu — e
        // agora são três filtros que podem estar escondendo a linha, então o
        // aviso diz quais estão ligados em vez de adivinhar um culpado.
        termo !== "" || filtroStatus !== "todos" ? (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]">
            Nada encontrado
            {termo !== "" && (porFornecedor ? ` vinculado ao fornecedor “${busca}”` : ` para “${busca}”`)}
            {filtroStatus !== "todos" && ` entre os ${filtroStatus}`}
.{" "}
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setFiltroStatus("todos");
              }}
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Limpar os filtros
            </button>
            .
          </p>
        ) : (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]">
            Nenhum produto ainda. Cadastre o que você compra toda semana — é
            essa lista que a cotação vai usar.
          </p>
        )
      ) : (
        <div className="mt-6">
          {cabecalho}
          {/* Contêiner próprio, separado do cabeçalho: o cabeçalho já tem
              borda sólida embaixo, e um `divide-y` no mesmo nível repetiria
              uma segunda linha colada nela. `space-y-3` (o espaçamento dos
              cartões no celular) mora aqui, e não lá em cima, porque o
              cabeçalho é `hidden` no celular e não deve contar como cartão. */}
          <div className="mt-3 space-y-3 lg:mt-0 lg:space-y-0 lg:divide-y lg:divide-dotted lg:divide-[var(--border)]">
            {entradas.map((e) => {
            if (e.tipo === "grupo") {
              return (
                <button
                  key={`grupo-${e.chave}`}
                  type="button"
                  aria-expanded={e.aberto}
                  onClick={() => alternarGrupo(e.chave)}
                  disabled={tudoAberto}
                  className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left active:bg-[var(--muted)]"
                >
                  <span className="min-w-0 flex-1 font-semibold">{e.nome}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{plural(e.total, "item", "itens")}</span>
                  <ChevronRight
                    aria-hidden
                    className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${e.aberto ? "rotate-90" : ""}`}
                  />
                </button>
              );
            }
            const p = e.p;
            const d = drafts[p.id] ?? paraDraft(p);
            const st = status[p.id] ?? "parado";
            const meus = vinculos[p.id] ?? p.supplierIds;
            const vinculados = fornecedores.filter((f) => meus.includes(f.id));
            const disponiveis = fornecedores.filter((f) => !meus.includes(f.id));
            const meuExclusivo = p.id in exclusivos ? exclusivos[p.id] : p.exclusiveSupplierId;
            const nomeExclusivo = fornecedores.find((f) => f.id === meuExclusivo)?.name ?? null;
            return (
              <div key={p.id} className={d.isActive ? "" : "opacity-40"}>
                <Linha
                  d={d}
                  exclusivo={meuExclusivo !== null ? (nomeExclusivo ?? "um fornecedor") : null}
                  custo={p.ultimoCusto}
                  qualidade={p.qualidade}
                  identidade={{
                    valor: (campo) => valorDeIdentidade(p.id, campo),
                    aoDigitar: (campo, valor) =>
                      aoDigitarIdentidade(p.id, campo, valor),
                    aoSair: (campo) => aoSairIdentidade(p.id, campo),
                    aoTecla: (campo, t) => aoTeclaIdentidade(p.id, campo, t),
                  }}
                  set={(campo, valor, imediato) =>
                    editar(p.id, campo, valor, imediato)
                  }
                  selecao={
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${p.name}`}
                      checked={marcados.has(p.id)}
                      onChange={() => alternarMarca(p.id)}
                      className="h-5 w-5 lg:h-4 lg:w-4"
                    />
                  }
                  editar={
                    // O histórico ao lado do Editar: contagens, recebimentos e
                    // quanto saiu entre eles, na aba de estoque dos relatórios.
                    <span className="flex w-full items-center gap-2 lg:w-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAberto((atual) => (atual === p.id ? null : p.id));
                      }}
                      aria-expanded={aberto === p.id}
                      className="min-h-[30px] flex-1 gap-1.5 lg:min-h-0 lg:flex-none"
                    >
                      {/* O rótulo não muda mais para "Fechar": quem diz se o
                          painel está aberto é a seta, que gira, e o
                          `aria-expanded`, que é o que o leitor de tela ouve.
                          Botão que troca de nome ao ser clicado obriga a ler
                          duas vezes para saber o que ele faz. */}
                      Editar
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`size-3.5 transition-transform ${
                          aberto === p.id ? "rotate-180" : ""
                        }`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      <span className="sr-only">
                        {" "}
                        {p.name}: ativar, desativar e vincular fornecedores
                      </span>
                    </Button>
                    <button
                      type="button"
                      onClick={() => alternarPreco(p.id)}
                      aria-expanded={precoAberto === p.id}
                      aria-label={`Histórico de preço de ${p.name}`}
                      title="Histórico de preço de compra"
                      className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg border bg-[var(--surface)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                        precoAberto === p.id
                          ? "border-[var(--primary)] text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--muted-foreground)]"
                      }`}
                    >
                      <History aria-hidden className="size-4" />
                    </button>
                    </span>
                  }
                  marca={
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {st === "salvando" && "…"}
                      {st === "salvo" && "salvo"}
                    </span>
                  }
                />

                {/* Confirmação embutida na linha, no molde do resto do
                    projeto — nada de `confirm()` do navegador, nada de modal.
                    Mostra os dois valores lado a lado porque o que se confere
                    aqui é a troca, não o texto novo sozinho. */}
                {pendente?.confirmar && pendente.id === p.id && (
                  <div role="alert" className="card-alerta mt-2 space-y-2 p-2.5">
                    <p className="text-sm">
                      Mudar {pendente.campo === "name" ? "o nome" : "o código"}{" "}
                      de{" "}
                      <strong>
                        {rascunho(p.id)[pendente.campo] || "vazio"}
                      </strong>{" "}
                      para <strong>{pendente.valor || "vazio"}</strong>?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        ref={confirmarRef}
                        type="button"
                        size="sm"
                        disabled={st === "salvando"}
                        onClick={confirmarIdentidade}
                      >
                        Confirmar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={st === "salvando"}
                        onClick={cancelarIdentidade}
                      >
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}

                {precoAberto === p.id && (
                  <PainelDePreco
                    compras={compras[p.id]}
                    unidade={UNIT_LABEL[d.unit]}
                    produtoId={p.id}
                  />
                )}

                {aberto === p.id && (
                  // Um cartão branco por assunto, como o formulário do
                  // fornecedor: cadastro, o que pedir, qualidade e quem vende.
                  // Rótulo sempre em cima do campo, para todos alinharem.
                  <div className="mt-2 space-y-2 text-xs">
                    <CartaoDeSecao icone={Package} titulo="Cadastro">
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {/* Grava na hora (`imediato`): ligar e desligar é
                            decisão, não digitação. O rótulo é o estado. */}
                        <div>
                          <span className="mb-1 block font-medium">Situação</span>
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3">
                            <input
                              type="checkbox"
                              checked={d.isActive}
                              onChange={(e) => editar(p.id, "isActive", e.target.checked, true)}
                              className="size-5 accent-[var(--primary)]"
                            />
                            <span className="text-sm font-medium">{d.isActive ? "Ativo" : "Desativado"}</span>
                          </label>
                        </div>

                        {/* No celular o código mora aqui, e não na linha. Pede
                            confirmação como na tabela: ele identifica o produto
                            na cotação e na planilha. */}
                        <label className="block lg:hidden">
                          <span className="mb-1 block font-medium">Código</span>
                          <Input
                            aria-label="Código"
                            value={valorDeIdentidade(p.id, "code")}
                            onChange={(e) => aoDigitarIdentidade(p.id, "code", e.target.value)}
                            onBlur={() => aoSairIdentidade(p.id, "code")}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== "Escape") return;
                              e.preventDefault();
                              aoTeclaIdentidade(p.id, "code", e.key);
                            }}
                            placeholder="sem código"
                            className="w-full bg-[var(--background)]"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block font-medium">Categoria</span>
                          <select
                            value={d.categoryId}
                            onChange={(e) => editar(p.id, "categoryId", e.target.value, true)}
                            className="field w-full bg-[var(--background)] py-0"
                          >
                            <option value="">{SEM_CATEGORIA}</option>
                            {categorias.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {/* Lote é campo de decidir uma vez, como categoria e
                            fornecedor: fica aqui, e não como mais um número na
                            linha, onde se confundiria com mínimo e ideal. */}
                        <label className="block">
                          <span className="mb-1 block font-medium">Lote de compra</span>
                          <span className="flex items-center gap-2">
                            <Input
                              inputMode="decimal"
                              aria-label={`Lote de compra de ${p.name}, em ${UNIT_LABEL[d.unit]}`}
                              value={d.lotSize}
                              onChange={(e) => editar(p.id, "lotSize", e.target.value)}
                              placeholder="sem lote"
                              className="num-display min-w-0 flex-1 bg-[var(--background)] text-right"
                            />
                            <span className="font-medium">{UNIT_LABEL[d.unit]}</span>
                          </span>
                        </label>
                      </div>
                      {/* Avisa e não barra. A falta nunca passa do ideal,
                          então lote maior que o ideal faz o item quase nunca
                          chegar a meio lote e entrar na compra. */}
                      {(() => {
                        const lote = Number(d.lotSize.replace(",", "."));
                        const ideal = Number(d.idealStock.replace(",", "."));
                        return d.lotSize !== "" &&
                          d.idealStock !== "" &&
                          Number.isFinite(lote) &&
                          Number.isFinite(ideal) &&
                          lote > 0 &&
                          ideal > 0 &&
                          lote > ideal ? (
                          <p className="hint" style={{ color: "var(--warn)" }}>
                            Lote maior que o estoque ideal: este item só entra na compra quando faltar pelo menos{" "}
                            {String(lote / 2).replace(".", ",")} {UNIT_LABEL[d.unit]}.
                          </p>
                        ) : null;
                      })()}
                    </CartaoDeSecao>

                    <CartaoDeSecao
                      icone={ListChecks}
                      titulo="O que pedir ao fornecedor"
                      frase="Cadeado fechado: obrigatório. Aberto: preferência."
                    >
                      {/* Cada especificação vira pergunta de sim ou não no link
                          do fornecedor. Obrigatória sem "sim" não deixa o preço
                          salvar. */}
                      <div>
                        <label className="block">
                          <span className="mb-1 block font-medium">Especificações</span>
                          <span className="flex items-center gap-2">
                            <Input
                              value={especNova}
                              onChange={(e) => setEspecNova(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                adicionarEspec(p.id, d, especTrava);
                              }}
                              // Sem botão de adicionar: Enter ou sair do campo
                              // adicionam.
                              onBlur={() => adicionarEspec(p.id, d, especTrava)}
                              placeholder="ex: resfriado, sem osso"
                              maxLength={80}
                              className="min-w-0 flex-1 bg-[var(--background)]"
                            />
                            <BotaoCadeado
                              fechado={especTrava}
                              aoTrocar={() => setEspecTrava((t) => !t)}
                              dicaFechado="A próxima especificação entra obrigatória. Tocar para virar preferência"
                              dicaAberto="A próxima especificação entra como preferência. Tocar para tornar obrigatória"
                            />
                          </span>
                        </label>

                        {d.especificacoes.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {d.especificacoes.map((e) => (
                              <li
                                key={e.texto}
                                className={`inline-flex items-center overflow-hidden rounded-lg border text-[13px] ${
                                  e.obrigatoria
                                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                                    : "border-[var(--border)] bg-[var(--surface)]"
                                }`}
                              >
                                <span className="py-1.5 pl-2.5">{e.texto}</span>
                                <BotaoCadeado
                                  fechado={e.obrigatoria}
                                  aoTrocar={() => alternarObrigatoria(p.id, d, e.texto)}
                                  dicaFechado={`${e.texto}: obrigatória. Tocar para virar preferência`}
                                  dicaAberto={`${e.texto}: preferência. Tocar para tornar obrigatória`}
                                  embutido
                                />
                                <button
                                  type="button"
                                  onClick={() => removerEspec(p.id, d, e.texto)}
                                  aria-label={`Tirar ${e.texto} das especificações de ${p.name}`}
                                  className="px-2 py-1.5 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* As marcas e o "aceita similar" com a mesma gramática
                          das especificações: cadeado fechado diz "só estas
                          marcas", aberto diz "serve similar". */}
                      <div>
                        <label className="block">
                          <span className="mb-1 block font-medium">Marcas de preferência</span>
                          <span className="flex items-center gap-2">
                            {/* Uma por vez, Enter adiciona e o campo fica
                                pronto para a próxima. O + faz o mesmo para
                                quem usa o dedo. */}
                            <Input
                              value={marcaNova}
                              onChange={(e) => setMarcaNova(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                adicionarMarca(p.id, d);
                              }}
                              onBlur={() => adicionarMarca(p.id, d)}
                              placeholder="tanto faz"
                              maxLength={120}
                              className="min-w-0 flex-1 bg-[var(--background)]"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => adicionarMarca(p.id, d)}
                              aria-label={`Adicionar a marca às preferências de ${p.name}`}
                              title="Adicionar marca"
                              className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                              <Plus aria-hidden className="size-4" />
                            </button>
                            <BotaoCadeado
                              fechado={!d.acceptsSimilarBrand}
                              aoTrocar={() => editar(p.id, "acceptsSimilarBrand", !d.acceptsSimilarBrand, true)}
                              dicaFechado={`${p.name}: só estas marcas. Tocar para aceitar similar`}
                              dicaAberto={`${p.name}: aceita marca similar. Tocar para aceitar só estas`}
                            />
                          </span>
                        </label>

                        {d.preferredBrands.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {d.preferredBrands.map((m) => (
                              <li key={m}>
                                <button
                                  type="button"
                                  onClick={() => removerMarca(p.id, d, m)}
                                  className="chip inline-flex items-center gap-2"
                                >
                                  {m}
                                  <span aria-hidden className="text-[var(--muted-foreground)]">
                                    ×
                                  </span>
                                  <span className="sr-only">, tirar {m} das marcas de {p.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </CartaoDeSecao>

                    {/* Qualidade: liga as estrelas no recebimento. Ligado, dá
                        para ver as médias por marca e fornecedor e dar a nota
                        do dono em cada entrega. */}
                    <CartaoDeSecao icone={Star} titulo="Qualidade" frase="Estrelas de 1 a 5 no recebimento.">
                      <label className="flex cursor-pointer flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.avaliarQualidade}
                          onChange={() => editar(p.id, "avaliarQualidade", !d.avaliarQualidade, true)}
                          className="size-5 accent-[var(--primary)]"
                        />
                        <span className="text-sm font-medium">Avaliar qualidade</span>
                        {p.qualidade && <MediaEstrelas media={p.qualidade.media} n={p.qualidade.n} />}
                      </label>
                      {(d.avaliarQualidade || p.qualidade) && <QualidadeDoProduto produtoId={p.id} nome={p.name} />}
                    </CartaoDeSecao>

                    {/* Vínculos e exclusivo respondem a mesma pergunta, quem
                        vende este item, de dois jeitos. Com exclusivo
                        escolhido, os vínculos somem, porque só ele vende. */}
                    <CartaoDeSecao icone={Truck} titulo="Quem vende">
                      <div className="grid gap-4 lg:grid-cols-2">
                        {meuExclusivo === null && (
                          <div className="min-w-0 space-y-2">
                            {/* Escolheu, vinculou, e a caixa volta para o
                                começo, pronta para o próximo. Os vinculados
                                ficam embaixo, com o × para tirar. */}
                            <label className="block">
                              <span className="mb-1 block font-medium">Fornecedores vinculados</span>
                              <select
                                value=""
                                disabled={disponiveis.length === 0}
                                onChange={(e) => {
                                  if (e.target.value !== "") alternarFornecedor(p.id, Number(e.target.value));
                                }}
                                className="field w-full bg-[var(--background)] py-0"
                              >
                                <option value="">
                                  {fornecedores.length === 0
                                    ? "Nenhum fornecedor cadastrado"
                                    : disponiveis.length === 0
                                      ? "Todos já estão vinculados"
                                      : "+ Vincular fornecedor…"}
                                </option>
                                {disponiveis.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {vinculados.length > 0 && (
                              <ul className="flex flex-wrap gap-2">
                                {vinculados.map((f) => (
                                  <li key={f.id}>
                                    <button
                                      type="button"
                                      onClick={() => alternarFornecedor(p.id, f.id)}
                                      className="chip inline-flex items-center gap-2"
                                    >
                                      {f.name}
                                      <span aria-hidden className="text-[var(--muted-foreground)]">
                                        ×
                                      </span>
                                      <span className="sr-only">, desvincular de {p.name}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        <label className="block min-w-0">
                          {/* A estrela marca o exclusivo aqui e onde mais ele
                              aparece; cheia quando há um escolhido. */}
                          <span className="mb-1 flex items-center gap-1 font-medium">
                            <Star
                              aria-hidden
                              className={`size-3.5 ${meuExclusivo !== null ? "fill-[var(--warn)] text-[var(--warn)]" : "text-[var(--muted-foreground)]"}`}
                            />
                            Exclusivo de
                          </span>
                          <select
                            value={meuExclusivo ?? ""}
                            onChange={(e) =>
                              alternarExclusivo(p.id, e.target.value === "" ? null : Number(e.target.value))
                            }
                            className="field w-full bg-[var(--background)] py-0"
                          >
                            <option value="">Ninguém, comparar preços</option>
                            {fornecedores.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          {meuExclusivo !== null && (
                            <span className="hint flex items-start gap-1">
                              <Star aria-hidden className="mt-0.5 size-3 shrink-0 fill-[var(--warn)] text-[var(--warn)]" />
                              <span>
                                Só {nomeExclusivo ?? "este fornecedor"} vende este item. Os vínculos com outros
                                fornecedores foram removidos.
                              </span>
                            </span>
                          )}
                        </label>
                      </div>
                    </CartaoDeSecao>

                    {/* Salvar por descargo de consciência: tudo aqui já gravou
                        sozinho. O aviso ao lado fica no lugar em vez de piscar
                        e sumir. */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button
                        type="button"
                        disabled={st === "salvando"}
                        onClick={() => salvarAgora(p.id)}
                        className="border-transparent bg-[var(--botao)] px-6 font-semibold text-[var(--botao-texto)] hover:border-transparent hover:opacity-90"
                      >
                        {st === "salvando" ? "Salvando…" : "Salvar"}
                      </Button>
                      {st !== "parado" && st !== "salvando" && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {st === "salvo" ? "Salvo." : "Não gravou. Confira os campos acima."}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {erros[p.id] && (
                  <p role="alert" className="mt-1 text-xs font-medium" style={{ color: "var(--destructive)" }}>
                    {erros[p.id]}
                  </p>
                )}
              </div>
            );
            })}
          </div>
          {telaGrande && naTela.length < visiveis.length && (
            <MaisAoRolar
              restam={visiveis.length - naTela.length}
              aoChegar={() => setLimite((l) => l + LINHAS_POR_VEZ)}
            />
          )}
          {!telaGrande && escondidosNoCelular > 0 && (
            <MaisAoRolar restam={escondidosNoCelular} aoChegar={() => setLimite((l) => l + LINHAS_POR_VEZ)} />
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-[var(--muted-foreground)]">
        Grava sozinho pouco depois de você parar de digitar. Mínimo e ideal são
        opcionais: juntos, a diferença entre os dois vira a sugestão de quanto
        comprar. Em <strong>Editar</strong> você liga e desliga o produto e
        escolhe quem o vende.
      </p>

      {marcadosVisiveis.length === 0 && visiveis.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Marque as caixas da primeira coluna para ativar, desativar ou trocar
          a categoria de vários de uma vez.
        </p>
      )}
    </>
  );
}

/**
 * O cadeado: aberto deixa passar, fechado exige. Nas especificações, aberto é
 * preferência e fechado é obrigatória; nas marcas, aberto aceita similar e
 * fechado aceita só as da lista.
 *
 * Sem as palavras "preferência" e "obrigatória" na tela — o dono pediu o
 * símbolo no lugar delas. O cadeado fechado leva a cor da casa, para as
 * obrigatórias se destacarem das outras na mesma fileira de etiquetas; o
 * nome completo fica para o leitor de tela e para a dica do mouse.
 */
function BotaoCadeado({
  fechado,
  aoTrocar,
  dicaFechado,
  dicaAberto,
  embutido = false,
}: {
  fechado: boolean;
  aoTrocar: () => void;
  /** O que o cadeado quer dizer em cada estado, para leitor de tela e mouse. */
  dicaFechado: string;
  dicaAberto: string;
  /** Dentro da etiqueta: sem borda própria, a da etiqueta basta. */
  embutido?: boolean;
}) {
  const Icone = fechado ? Lock : LockOpen;
  const texto = fechado ? dicaFechado : dicaAberto;
  return (
    <button
      type="button"
      // Não rouba o foco do campo. Sair do campo adiciona a especificação, e
      // quem escreveu "resfriado" e foi fechar o cadeado a veria entrar como
      // preferência antes de o cadeado fechar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={aoTrocar}
      aria-pressed={fechado}
      aria-label={texto}
      title={texto}
      className={`inline-flex items-center justify-center ${
        embutido ? "px-1.5 py-1.5" : "size-[30px] rounded-md border border-[var(--border)]"
      } ${fechado ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"} ${
        !embutido && fechado ? "border-[var(--primary)] bg-[var(--primary-soft)]" : ""
      }`}
    >
      <Icone aria-hidden className="size-4" />
    </button>
  );
}

/**
 * As últimas compras de um produto, abertas pelo símbolo de histórico: data,
 * fornecedor, preço e quanto mudou sobre a compra anterior. O gráfico e o
 * resto ficam na aba Preços dos relatórios.
 */
function PainelDePreco({
  compras,
  unidade,
  produtoId,
}: {
  compras: CompraDoProduto[] | "erro" | undefined;
  unidade: string;
  produtoId: number;
}) {
  return (
    <div className="card mt-2 space-y-2 p-3 text-sm">
      <p className="text-xs font-semibold">Histórico de preço de compra</p>
      {compras === undefined ? (
        <p className="text-xs text-[var(--muted-foreground)]">Buscando…</p>
      ) : compras === "erro" ? (
        <p className="text-xs text-[var(--destructive)]">Não consegui buscar. Toque no símbolo de novo.</p>
      ) : compras.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">Nenhuma compra registrada deste produto ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {compras.map((c, i) => {
            const anterior = compras[i + 1];
            const v = anterior && anterior.preco > 0 ? ((c.preco - anterior.preco) / anterior.preco) * 100 : null;
            return (
              <li key={i} className="flex items-baseline gap-2 py-1.5">
                <span className="num-display w-16 shrink-0 text-xs">{c.dia}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted-foreground)]">
                  {c.fornecedor ?? "compra antiga"}
                </span>
                <span className="num-display whitespace-nowrap">
                  {formatMoney(c.preco)}
                  <span className="text-xs text-[var(--muted-foreground)]">/{unidade}</span>
                </span>
                <span className="num-display w-14 shrink-0 text-right text-xs">
                  {v === null || Math.abs(v) < 0.05 ? "" : `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={`/admin/compras/relatorios/precos?produto=${produtoId}`}
        className="inline-block text-xs text-[var(--primary)] underline-offset-4 hover:underline"
      >
        Ver o gráfico e todas as compras
      </Link>
    </div>
  );
}
