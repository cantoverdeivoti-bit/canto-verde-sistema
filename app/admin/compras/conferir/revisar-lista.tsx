"use client";

import { Check, Pencil, Scale, Send, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { OrcamentoSemana } from "@/components/orcamento-semana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveProduct,
  setExclusiveSupplier,
  setProductSuppliers,
} from "@/lib/actions/compras";
import { corrigirContado, produtoParaCorrigir } from "@/lib/actions/contagem";
import {
  atualizarCotacao,
  confirmarPedidoDireto,
  montarCotacao,
  salvarRascunhoConferencia,
} from "@/lib/actions/cotacao";
import {
  SEM_CATEGORIA,
  UNIT_LABEL,
  chave,
  formatAmount,
  formatMoney,
  lerNumeroBR,
  plural,
} from "@/lib/format";
import { faltaParaOLote, lotesDe, serveNoLote } from "@/lib/lote";
import type { OrcamentoDaSemana } from "@/lib/orcamento";
import type { LinhaParaRevisar } from "@/lib/sugestao";
import type { ProductUnit } from "@/generated/prisma/client";

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/** O produto como o painel o segura: tudo texto, porque campo é texto. */
type ProdutoParaCorrigir = {
  code: string;
  name: string;
  description: string;
  preferredBrands: string[];
  acceptsSimilarBrand: boolean;
  categoryId: string;
  unit: string;
  currentStock: string;
  minStock: string;
  idealStock: string;
  lotSize: string;
  isActive: boolean;
  fornecedorIds: number[];
  /** Id como texto, que é o que o `value` de um `<select>` devolve. */
  exclusivoId: string;
};

/**
 * Uma régua só, para o cabeçalho e as linhas não saírem de esquadro.
 *
 * O painel é `max-w-4xl px-5` e as barras laterais comem o resto: sobram 792px
 * de grade por mais largo que seja o monitor. Fixas: lote 5 + tem hoje 3.5 +
 * sugestão 6 + última 5.5 + estimado 5.5 + os dois botões 3.5 = 29rem = 464px.
 * Seis vãos de 8px = 48. Sobram 280px para o nome.
 *
 * Mexeu aqui, refaça a conta — e meça na tela, porque a lateral entra e sai
 * conforme a largura e é ela que derruba quem calcula só pelo `max-w`.
 *
 * As larguras saíram de medir o texto de verdade nesta fonte, e não de chute.
 * O nome mais comprido do cadastro — "Refri schweppes citrus zero lata 350ml"
 * — dá 242px e cabe nos 280 com folga. Nas colunas estreitas quem manda é o
 * CABEÇALHO e não o valor: "Última compra" tem 78px e o "R$ 14,33" embaixo
 * dele tem 56. Foi por isso que quatro colunas encolheram para pagar a do
 * lote: tem hoje 5→3.5, sugestão 7→6, última 6→5.5, estimado 6.5→5.5.
 *
 * ATENÇÃO ao recalcular: a coluna do nome carrega um passageiro. O produto de
 * fornecedor exclusivo leva "· só Fulano" grudado no nome, e a soma dos dois
 * passa dos 280px com facilidade. É aceito de propósito — a célula é
 * `min-w-0` e o excedente vira segunda linha, não desalinhamento, e só nos
 * exclusivos, que são minoria. Os 280px continuam sendo a régua do nome
 * sozinho, não do nome mais a marca.
 *
 * A unidade não tem coluna: ela é o fim da sugestão, "204 un". Longe do número
 * que mede, ela obrigava a varrer a linha para saber se aquilo eram duzentas e
 * quatro unidades ou duzentos e quatro quilos.
 *
 * A ORDEM É A DO HTML: cada célula é filha direta da grade e cai na coluna
 * seguinte, na sequência em que foi escrita. (O comentário antigo aqui falava
 * em `@3xl:contents`; este arquivo nunca usou isso.)
 */
const COLUNAS =
  "@3xl:grid-cols-[1fr_5rem_3.5rem_6rem_5.5rem_5.5rem_3.5rem]";

/** A unidade colada no número, em tom de apoio: "204 un" se lê de uma vez. */
function Un({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-normal text-[var(--muted-foreground)]">{children}</span>
  );
}

/**
 * O que a coluna Lote escreve, em três estados.
 *
 * Vazio quando o produto não tem lote, que é a maioria — a célula continua
 * existindo para não desalinhar as colunas seguintes, mas não diz nada.
 *
 * "18 × 12 un" quando o número fecha: de onde ele vem, ao vivo.
 *
 * "12 ou 24 un" quando não fecha: as duas saídas, e não a acusação. Só a de
 * cima dentro do primeiro lote, onde não existe compra menor.
 *
 * Fora do componente porque é texto puro, e porque o `title` e o corpo da
 * célula precisam da mesma frase — escrevê-la duas vezes seria deixar uma
 * delas envelhecer sozinha.
 */
function textoDoLote(
  l: LinhaParaRevisar,
  valor: number | null,
  serve: boolean,
): string {
  if (l.lote === null) return "";
  const un = UNIT_LABEL[l.unidade];

  if (serve) {
    return valor === null ? "" : `${lotesDe(valor, l.lote)} × ${formatAmount(l.lote)} ${un}`;
  }

  const f = valor === null ? null : faltaParaOLote(valor, l.lote);
  if (f === null) return `de ${formatAmount(l.lote)} em ${formatAmount(l.lote)} ${un}`;

  return `${f.abaixo === null ? "" : `${formatAmount(f.abaixo)} ou `}${formatAmount(f.acima)} ${un}`;
}

/**
 * Uma célula: rótulo à esquerda e valor à direita no celular, coluna alinhada
 * à direita no monitor.
 *
 * O desenho antigo era uma grade de duas colunas alinhada pela base, e ela
 * quebrava: rótulo e valor caíam lado a lado em pares desencontrados, e a linha
 * virava um xadrez. Um par por linha nunca desalinha, por mais comprido que
 * seja o nome do produto ou o número.
 *
 * `no-underline` no rótulo porque a linha tirada da compra recebe
 * `line-through`, e o risco não pode atravessar a palavra "Estimado".
 *
 * Fora do componente da linha de propósito: definida dentro, ela seria uma
 * função nova a cada render e o React remontaria a célula toda vez.
 */
function Celula({
  rotulo,
  fora,
  forte,
  ordem,
  children,
}: {
  rotulo: string;
  fora: boolean;
  forte?: boolean;
  /** Onde a célula cai no celular. Some no monitor, que usa a ordem do HTML. */
  ordem?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex items-baseline justify-between gap-2 text-sm @3xl:order-none @3xl:block @3xl:text-right ${
        ordem ?? ""
      } ${forte ? "font-medium" : "text-[var(--muted-foreground)]"} ${
        fora ? "line-through" : ""
      }`}
    >
      <span className="text-xs font-normal text-[var(--muted-foreground)] no-underline @3xl:hidden">
        {rotulo}
      </span>
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

export type Opcao = { id: number; name: string };

export function RevisarLista({
  contagemIds,
  orcamentoSemana,
  cotacaoId,
  linhas: todasAsLinhas,
  semIdeal,
  menosDeMeioLote,
  repetidos,
  pelasRequisicoes = 0,
  categorias,
  fornecedores,
  confirmados = [],
  rascunho,
}: {
  /** As contagens escolhidas, que viram uma rodada de compra só. */
  contagemIds: number[];
  /** O orçamento de compra da semana. Só na montagem, não na correção. */
  orcamentoSemana?: OrcamentoDaSemana;
  /** Preenchido, a tela CORRIGE esta cotação em vez de criar uma. É o único
      interruptor entre os dois modos: muda de onde vieram as linhas (quem
      chama já resolveu isso) e o que o botão do rodapé faz. */
  cotacaoId?: number;
  linhas: LinhaParaRevisar[];
  semIdeal: number;
  /** Estavam abaixo do ideal, mas faltando menos de meio lote. */
  menosDeMeioLote: number;
  /** Nomes dos produtos contados em mais de uma das contagens escolhidas. */
  repetidos: string[];
  /** Contados que ficam fora porque só as Requisições pedem eles. */
  pelasRequisicoes?: number;
  categorias: Opcao[];
  fornecedores: Opcao[];
  /** Pedidos diretos já confirmados nesta rodada, fornecedor a fornecedor. */
  confirmados?: { id: number; fornecedorId: number; atacado: boolean }[];
  /** O que foi salvo desta conferência, para a tela voltar como estava. */
  rascunho?: { quantidades: Record<string, string>; fora: number[]; salvoEmTexto: string };
}) {
  /* O fornecedor exclusivo já confirmado sai da conferência: o pedido dele
     existe, e os itens não entram de novo na conta nem no botão do fim (que
     também os pula no servidor). Ficam num cartão de "confirmado", com o
     caminho para o pedido. */
  const pedidoConfirmado = new Map(confirmados.map((c) => [c.fornecedorId, c.id]));
  const linhas = todasAsLinhas.filter((l) => l.exclusivoId === null || !pedidoConfirmado.has(l.exclusivoId));
  const nomeDoFornecedor = new Map(
    todasAsLinhas.flatMap((l) => (l.exclusivoId !== null && l.exclusivoDe ? [[l.exclusivoId, l.exclusivoDe] as const] : [])),
  );
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [erroDoGrupo, setErroDoGrupo] = useState<Record<number, string>>({});
  /**
   * Qual linha está com o painel de correção aberto. Um por vez.
   *
   * Um só porque o painel carrega o produto do servidor ao abrir: dois abertos
   * seriam dois rascunhos vivos, e rascunho vivo nesta tela é a armadilha que
   * `sugestoes-list.tsx` documenta — o servidor atualiza e a tela continua
   * mostrando o número velho.
   */
  const [corrigindo, setCorrigindo] = useState<number | null>(null);
  const router = useRouter();
  /**
   * Os produtos tirados da compra, por id.
   *
   * Por `produtoId`, nunca por posição na lista: se alguém mexer no estoque
   * ideal enquanto ele confere, a lista se refaz e um índice apontaria para
   * outro produto.
   *
   * Salvo sozinho no rascunho da rodada (ver o efeito de `salvarSozinho`):
   * sair da tela e voltar, ou abrir noutro aparelho, traz tudo como estava.
   */
  const [tirados, setFora] = useState<Set<number>>(() => new Set(rascunho?.fora ?? []));
  /**
   * A quantidade que ele digitou no lugar da que a conta sugeriu.
   *
   * Só o que ele mexeu entra aqui: linha intocada continua desenhando o número
   * do servidor, e é isso que faz corrigir o estoque ideal no painel
   * atravessar até a lista. Quem digitou, mandou — o número dele fica por
   * cima até ele mesmo trocar.
   *
   * Texto, e não número: o campo é texto, e guardar "12," no meio da digitação
   * como número seria perder o que ele está escrevendo.
   */
  const [quantidades, setQuantidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(Object.entries(rascunho?.quantidades ?? {}).map(([k, v]) => [Number(k), v])),
  );
  /**
   * O que sai da compra: o que ele tirou no ✕ e o que ele zerou.
   *
   * Zero é "desisti de comprar este", a pedido do dono — é o jeito natural de
   * dizer isso num campo de quantidade. Antes zero era quantidade inválida e
   * travava o botão, e quem zerava para tirar achava que a tela tinha dado
   * erro. Tudo que decide o que vai (a lista, os totais, o que segue para o
   * servidor) lê daqui.
   */
  const fora = useMemo(() => {
    const s = new Set(tirados);
    for (const [id, texto] of Object.entries(quantidades)) {
      if (lerNumeroBR(texto) === 0) s.add(Number(id));
    }
    return s;
  }, [tirados, quantidades]);
  /** Quando a conferência foi salva por último, ou por que não salvou. */
  const [salvoEm, setSalvoEm] = useState<string | null>(rascunho?.salvoEmTexto ?? null);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function mexer(f: (atual: Set<number>) => Set<number>) {
    setFora(f);
  }

  const indice = useMemo(
    () =>
      new Map(
        linhas.map((l) => [l.produtoId, chave(`${l.nome} ${l.categoria ?? SEM_CATEGORIA}`)]),
      ),
    [linhas],
  );

  const termo = chave(busca);
  const visiveis = useMemo(() => {
    const porTermo =
      termo === ""
        ? linhas
        : linhas.filter((l) => indice.get(l.produtoId)?.includes(termo) ?? false);
    return porTermo;
  }, [linhas, indice, termo]);

  /**
   * Quanto vai ser pedido de uma linha: o que ele digitou, ou a sugestão.
   *
   * Devolve `null` quando o que está no campo não é número que se possa pedir
   * — vazio no meio da digitação. Zero não chega aqui como quantidade: a
   * linha zerada já está em `fora` (desisti de comprar).
   */
  function quantidadeDe(l: LinhaParaRevisar): number | null {
    const texto = quantidades[l.produtoId];
    if (texto === undefined) return l.sugestao;
    const n = lerNumeroBR(texto);
    return n !== null && n > 0 ? n : null;
  }

  const dentro = linhas.filter((l) => !fora.has(l.produtoId));
  const diretos = dentro.filter((l) => l.exclusivoDe !== null);
  const paraCotacao = dentro.length - diretos.length;
  const semPreco = dentro.filter((l) => l.ultimoCusto === null).length;
  const invalidas = dentro.filter((l) => quantidadeDe(l) === null).length;

  /**
   * Quantas quantidades não fecham o lote do produto.
   *
   * Separado de `invalidas` porque são dois erros diferentes: lá é "isso não é
   * um número", aqui é "esse número não existe como compra". Duas mensagens
   * diferentes, e o botão trava nos dois.
   *
   * `quantidadeDe` continua devolvendo o número mesmo fora do lote, de
   * propósito: se devolvesse nulo, `montar()` trataria como "não mandar
   * override" e o servidor usaria a sugestão — o número errado passaria calado.
   */
  const foraDoLote = dentro.filter((l) => {
    const q = quantidadeDe(l);
    return q !== null && !serveNoLote(q, l.lote);
  }).length;
  const estimado = dentro.reduce((soma, l) => {
    const q = quantidadeDe(l);
    return soma + (l.ultimoCusto === null || q === null ? 0 : q * l.ultimoCusto.valor);
  }, 0);

  const fornecedoresDiretos = [...new Set(diretos.map((l) => l.exclusivoDe!))];

  // A primeira compra da semana pede o faturamento; as outras não.
  const semOrcamento = !orcamentoSemana || orcamentoSemana.orcamento === null;

  const editando = cotacaoId !== undefined;

  /* Quantas linhas ele de fato mexeu — tiradas mais as com número novo.
     Digitar 216 por cima de 216 não conta: o campo ficaria "mexido" para a
     tela, mas para a cotação nada mudaria, e o botão prometeria uma gravação
     que não existe. Quem compara é `formatAmount` dos dois lados, e não o
     texto cru, para "216" e "216,0" serem a mesma coisa. */
  const mudancas =
    fora.size +
    dentro.filter((l) => {
      const q = quantidadeDe(l);
      return q !== null && formatAmount(q) !== formatAmount(l.sugestao);
    }).length;

  /* Só o que ele digitou por cima, e só do que sobrou na compra.
     As duas ações querem exatamente isto, então a lista se monta uma vez. */
  function digitadas() {
    return dentro.flatMap((l) => {
      const q = quantidadeDe(l);
      return q === null || quantidades[l.produtoId] === undefined
        ? []
        : [{ produtoId: l.produtoId, quantidade: q }];
    });
  }

  function montar() {
    setErro(null);
    if (semOrcamento) return setErro("Salve o faturamento da semana anterior e a meta de CMV.");
    // A rodada vira compra: o rascunho acabou, e gravá-lo agora só daria erro.
    encerrado.current = true;
    aGravar.current = null;
    startTransition(async () => {
      const r = await montarCotacao(contagemIds, [...fora], digitadas());
      if (!r.ok) {
        encerrado.current = false;
        return setErro(r.message);
      }
      /* O próximo passo é Enviar: os pedidos dos exclusivos, o atacado e o
         link da cotação, na ordem de mandar — com ou sem cotação. */
      router.push(`/admin/compras/enviar?c=${contagemIds.join(",")}`);
    });
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await atualizarCotacao(cotacaoId!, [...fora], digitadas());
      if (!r.ok) return setErro(r.message);
      // Volta para a cotação, que é onde ele vê o resultado do que mudou —
      // ficar na tela de edição depois de salvar deixaria a pergunta "salvou?"
      // no ar, com a mesma lista à frente.
      router.push(`/admin/compras/cotacao/${r.data.id}`);
    });
  }

  /**
   * Confirma o pedido direto de um fornecedor só, com as quantidades que
   * estão na tela para ele. O grupo sai da conferência (vira um cartão de
   * "confirmado") e o resto continua para o botão do fim.
   */
  function confirmarFornecedor(fornecedorId: number, doGrupo: LinhaParaRevisar[]) {
    setErroDoGrupo((e) => ({ ...e, [fornecedorId]: "" }));
    if (semOrcamento) {
      return setErroDoGrupo((e) => ({ ...e, [fornecedorId]: "Salve o faturamento da semana anterior e a meta de CMV." }));
    }
    const itens = doGrupo
      .filter((l) => !fora.has(l.produtoId))
      .map((l) => ({ produtoId: l.produtoId, quantidade: quantidadeDe(l) }));
    if (itens.length === 0) {
      return setErroDoGrupo((e) => ({ ...e, [fornecedorId]: "Todos os itens deste fornecedor foram tirados." }));
    }
    if (itens.some((i) => i.quantidade === null)) {
      return setErroDoGrupo((e) => ({ ...e, [fornecedorId]: "Tem quantidade em branco neste fornecedor." }));
    }
    setConfirmando(fornecedorId);
    startTransition(async () => {
      const r = await confirmarPedidoDireto(
        contagemIds,
        fornecedorId,
        itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade! })),
      );
      setConfirmando(null);
      // Sem `router.refresh()`: a ação já revalida a tela, e os dois juntos
      // montavam a página duas vezes seguidas.
      if (!r.ok) return setErroDoGrupo((e) => ({ ...e, [fornecedorId]: r.message }));
    });
  }

  /**
   * Salva sozinho o que foi tirado e digitado, 0,8 s depois do último toque.
   *
   * Antes só o "Salvar" embaixo dos fornecedores exclusivos gravava, e os
   * itens da cotação não tinham botão: o ✕ sumia ao trocar de página. A ação
   * não recarrega a tela, então salvar a cada pausa não pesa.
   *
   * Sair da tela com gravação pendente manda na hora (a limpeza do efeito),
   * para o ✕ tocado um instante antes de sair não se perder. Abrir a tela não
   * grava nada: o primeiro disparo é pulado. Montar a cotação encerra o
   * rascunho, e nada mais é salvo depois disso.
   */
  const primeiraVez = useRef(true);
  const encerrado = useRef(false);
  const aGravar = useRef<{ quantidades: Record<number, string>; fora: number[] } | null>(null);
  function gravar(d: { quantidades: Record<number, string>; fora: number[] }) {
    if (encerrado.current) return;
    void salvarRascunhoConferencia(contagemIds, d.quantidades, d.fora).then((r) => {
      if (!r.ok) return setErroAoSalvar(r.message);
      setErroAoSalvar(null);
      setSalvoEm(new Date(r.data.salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    });
  }
  useEffect(() => {
    if (editando || encerrado.current) return;
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    aGravar.current = { quantidades, fora: [...tirados] };
    const timer = setTimeout(() => {
      const d = aGravar.current;
      aGravar.current = null;
      if (d) gravar(d);
    }, 800);
    return () => clearTimeout(timer);
    // `gravar` só lê o que não muda com a tela aberta (as contagens e os setters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantidades, tirados, editando]);
  // Saindo da tela com gravação pendente: manda já.
  useEffect(
    () => () => {
      const d = aGravar.current;
      aGravar.current = null;
      if (d) gravar(d);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Os fornecedores já confirmados, com o caminho para o pedido de cada um. */
  const cartoesConfirmados = !editando && confirmados.length > 0 && (
    <div className="mt-4 space-y-2">
      {confirmados.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-x-2 rounded-lg border py-1.5 pr-1.5 pl-3"
          style={{
            borderColor: "color-mix(in srgb, var(--ok-strong) 45%, transparent)",
            background: "color-mix(in srgb, var(--ok-strong) 7%, var(--background))",
          }}
        >
          <Check aria-hidden className="size-4 shrink-0" style={{ color: "var(--ok-strong)" }} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">
              {nomeDoFornecedor.get(c.fornecedorId) ?? fornecedores.find((f) => f.id === c.fornecedorId)?.name ?? "Fornecedor"}
            </span>
            <span className="block text-xs text-[var(--muted-foreground)]">
              {c.atacado ? `lista #${c.id} confirmada` : `pedido #${c.id} confirmado`}
            </span>
          </span>
          {/* Errou antes de mandar: o lápis abre o pedido, que se edita até
              ser enviado, e a volta de lá é para esta conferência. */}
          <Link
            href={`/admin/compras/pedidos/${c.id}?volta=${contagemIds.join(",")}`}
            aria-label={c.atacado ? `Editar lista #${c.id}` : `Editar pedido #${c.id}`}
            title="Editar"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--muted)]"
          >
            <Pencil aria-hidden className="size-[18px]" />
          </Link>
          {/* O atacado vai direto à lista de compra: é ela que se leva à loja. */}
          <Link
            href={
              c.atacado
                ? `/admin/compras/pedidos/${c.id}/lista`
                : `/admin/compras/enviar?c=${contagemIds.join(",")}`
            }
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--muted)]"
          >
            {c.atacado ? (
              <>
                <ShoppingCart aria-hidden className="size-4" />
                Ver lista
              </>
            ) : (
              <>
                <Send aria-hidden className="size-4" />
                Enviar
              </>
            )}
          </Link>
        </div>
      ))}
    </div>
  );

  // Tudo o que sobrou já foi confirmado fornecedor a fornecedor: falta só
  // fechar a rodada (o botão do fim marca as contagens e não cria mais nada).
  if (linhas.length === 0 && confirmados.length > 0 && !editando) {
    return (
      <div className="max-w-xl">
        {cartoesConfirmados}
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Todos os pedidos desta rodada foram confirmados.
        </p>
        {erro && (
          <p role="alert" className="msg-error mt-3">
            {erro}
          </p>
        )}
        <Button type="button" size="lg" className="mt-4" disabled={pendente} onClick={montar}>
          {pendente ? "Concluindo…" : "Concluir a rodada"}
        </Button>
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="mt-8 max-w-xl">
        <p className="text-sm font-medium">
          Nada abaixo do ideal{" "}
          {contagemIds.length > 1 ? "nestas contagens" : "nesta contagem"}.
        </p>
        {/* Os dois motivos podem valer ao mesmo tempo, então são parágrafos
            independentes e não um ternário. */}
        {semIdeal > 0 && (
          // O motivo, e não só o fato. Sem estoque ideal cadastrado não há
          // alvo, e sem alvo não há como saber quanto falta — o produto sai da
          // conta em silêncio, e a tela pareceria defeito.
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {plural(semIdeal, "item contado está", "itens contados estão")} sem
            estoque ideal cadastrado, então {semIdeal === 1 ? "ele não entra" : "eles não entram"}{" "}
            na conta.{" "}
            <Link href="/admin/compras" className="text-[var(--primary)] underline-offset-4 hover:underline">
              Preencher em Produtos
            </Link>
            .
          </p>
        )}
        {menosDeMeioLote > 0 && (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {plural(menosDeMeioLote, "item está", "itens estão")} abaixo do
            ideal, mas faltando menos de meio lote — comprar um lote inteiro
            colocaria na prateleira mais do que a casa quer ter.
          </p>
        )}
        {pelasRequisicoes > 0 && (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {plural(pelasRequisicoes, "produto contado é pedido", "produtos contados são pedidos")} pelas{" "}
            <Link href="/admin/compras/listas" className="text-[var(--primary)] underline-offset-4 hover:underline">
              Compras de rotina
            </Link>{" "}
            e não {pelasRequisicoes === 1 ? "entra" : "entram"} na cotação.
          </p>
        )}
        {semIdeal === 0 && menosDeMeioLote === 0 && pelasRequisicoes === 0 && (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Tudo que foi contado está no ideal ou acima. Não há o que comprar.
          </p>
        )}
      </div>
    );
  }

  /* Três blocos, na ordem em que ele resolve: o que vai direto para o
     fornecedor exclusivo, agrupado por fornecedor; o que a casa vai buscar no
     atacado, também por fornecedor (cada atacado é uma lista); e o que vai
     para a cotação, agrupado por categoria, como sempre. */
  const porFornecedor = new Map<string, LinhaParaRevisar[]>();
  const porAtacado = new Map<string, LinhaParaRevisar[]>();
  const porCategoria = new Map<string, LinhaParaRevisar[]>();
  for (const l of visiveis) {
    const [mapa, g] =
      l.exclusivoDe !== null
        ? [l.exclusivoAtacado ? porAtacado : porFornecedor, l.exclusivoDe]
        : [porCategoria, l.categoria ?? SEM_CATEGORIA];
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(l);
  }
  const blocos = [
    {
      titulo: "Compra direta",
      dica: "Vai direto ao fornecedor exclusivo — confirme o pedido de cada um." as string | null,
      cartao: true,
      atacado: false,
      grupos: [...porFornecedor].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    },
    {
      titulo: "Compra no atacado",
      dica: "Você vai buscar — o valor é estimado pela última compra." as string | null,
      cartao: true,
      atacado: true,
      grupos: [...porAtacado].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    },
    {
      titulo: "Para cotação",
      dica: "Os fornecedores da categoria recebem o link e mandam preço." as string | null,
      cartao: false,
      atacado: false,
      grupos: [...porCategoria],
    },
  ].filter((b) => b.grupos.length > 0);

  /**
   * Um cabeçalho só, no alto, grudado.
   *
   * Era um por categoria — catorze deles numa contagem de verdade, cada um
   * brigando com a barra da gaveta logo acima. Sozinho no alto ele precisa
   * grudar: "Tem hoje" e "Sugestão" são dois números crus na mesma linha, e
   * sem os rótulos à vista não dá para saber qual é qual no meio de 126 itens.
   *
   * `z-10` contra o `z-20` do rodapé, para os dois não disputarem a camada.
   */
  const cabecalho = (
    <div
      className={`sticky top-0 z-10 hidden ${COLUNAS} items-end gap-x-2 border-b border-[var(--border)] bg-[var(--background)] px-2 pb-1 pt-2 text-xs text-[var(--muted-foreground)] @3xl:grid`}
    >
      <span>Produto</span>
      <span>Lote</span>
      <span className="text-right">Tem hoje</span>
      <span className="text-right">Sugestão</span>
      <span className="text-right">Última compra</span>
      <span className="text-right">Estimado</span>
      <span />
    </div>
  );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Input
            type="search"
            aria-label="Buscar item da compra"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou categoria"
            className={`h-9 w-72 ${busca !== "" ? "pr-16" : ""}`}
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

        {/* Tudo salva sozinho: o aviso diz quando foi, ou por que não foi. */}
        {!editando && (erroAoSalvar || salvoEm) && (
          <p
            role={erroAoSalvar ? "alert" : undefined}
            className="w-full text-xs"
            style={{ color: erroAoSalvar ? "var(--destructive)" : "var(--muted-foreground)" }}
          >
            {erroAoSalvar ? `Não salvou: ${erroAoSalvar}` : `Salvo · ${salvoEm}`}
          </p>
        )}

        <p className="text-sm text-[var(--muted-foreground)]">
          {plural(dentro.length, "item na compra", "itens na compra")}
          {fora.size > 0 && (
            <>
              {" · "}
              {fora.size} fora{" "}
              <button
                type="button"
                onClick={() => {
                  // Devolve também os zerados: volta a sugestão da conta.
                  mexer(() => new Set());
                  setQuantidades((q) =>
                    Object.fromEntries(Object.entries(q).filter(([, v]) => lerNumeroBR(v) !== 0)),
                  );
                }}
                className="text-[var(--primary)] underline-offset-4 hover:underline"
              >
                devolver todos
              </button>
            </>
          )}
        </p>
      </div>

      {/* O item que a regra do meio lote tirou, dito aqui.
          Ele está abaixo do ideal e o estoquista acabou de contá-lo — some da
          lista sem uma palavra e a tela parece ter perdido a linha. É a mesma
          dívida que `semIdeal` já paga, e maior. */}
      {menosDeMeioLote > 0 && (
        <p className="hint mt-2">
          {plural(menosDeMeioLote, "item ficou", "itens ficaram")} de fora:
          faltava menos de meio lote para completar o ideal.
        </p>
      )}

      {/* O produto que apareceu em duas contagens, nomeado.
          Vale o número da contagem mais nova — somar dobraria o estoque de
          quem passou pela mesma prateleira duas vezes, e a casa deixaria de
          comprar o que precisa. Mas a escolha é do sistema, e quem confere
          precisa poder conferir justamente estes: são os únicos em que o
          número da tela não é o da contagem que ele tem na cabeça. */}
      {repetidos.length > 0 && (
        <p className="hint mt-2">
          {plural(repetidos.length, "produto foi contado", "produtos foram contados")}{" "}
          em mais de uma das contagens escolhidas — vale o número da mais nova:{" "}
          {repetidos.join(" · ")}.
        </p>
      )}
      {pelasRequisicoes > 0 && (
        <p className="hint mt-2">
          {plural(pelasRequisicoes, "produto contado é pedido", "produtos contados são pedidos")} pelas{" "}
          <Link href="/admin/compras/listas" className="text-[var(--primary)] underline-offset-4 hover:underline">
            Compras de rotina
          </Link>{" "}
          e não {pelasRequisicoes === 1 ? "entra" : "entram"} na cotação.
        </p>
      )}

      {cartoesConfirmados}

      {cabecalho}

      <div className="mt-4 space-y-5 @3xl:mt-0">
        {blocos.map((b) => (
          <div key={b.titulo} className="space-y-4">
            {/* A faixa de cada parte, cheia na cor da casa: é onde a compra
                muda de caminho — direto ao fornecedor, ou para a cotação. */}
            <div className="flex items-center gap-3 rounded-xl bg-[var(--botao)] px-4 py-3 text-[var(--botao-texto)] @3xl:mt-4">
              {b.atacado ? (
                <ShoppingCart aria-hidden className="size-6 shrink-0" />
              ) : b.cartao ? (
                <Truck aria-hidden className="size-6 shrink-0" />
              ) : (
                <Scale aria-hidden className="size-6 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight">{b.titulo}</h2>
                {b.dica && <p className="text-xs opacity-85">{b.dica}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[var(--botao-texto)] px-2.5 py-0.5 text-sm font-semibold text-[var(--botao)]">
                {plural(b.grupos.reduce((n, [, g]) => n + g.length, 0), "item", "itens")}
              </span>
            </div>
        {b.grupos.map(([categoria, doGrupo]) => (
          <section
            key={categoria}
            className={b.cartao ? "overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]" : ""}
          >
            {/* Traço vinho à esquerda. Sem fundo: a faixa alternada das linhas
                já carrega cor, e uma tarja cheia por cima disputaria com ela
                em vez de separar. */}
            {b.cartao ? (
              /* O pedido de um fornecedor: nome, quantos itens e quanto deve
                 dar, pelo último preço pago. */
              <h3
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-[var(--border)] px-3 py-3"
                style={{ background: "color-mix(in srgb, var(--primary) 11%, var(--background))" }}
              >
                {/* O fornecedor em destaque: é o pedido que se confirma embaixo. */}
                {b.atacado ? (
                  <ShoppingCart aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
                ) : (
                  <Truck aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
                )}
                <span className="text-lg font-bold leading-tight text-[var(--primary)]">{categoria}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {plural(doGrupo.length, "item", "itens")}
                </span>
                <span className="num-display ml-auto text-sm font-semibold">
                  {(() => {
                    const total = doGrupo
                      .filter((l) => !fora.has(l.produtoId))
                      .reduce((soma, l) => {
                        const q = quantidadeDe(l);
                        return soma + (l.ultimoCusto === null || q === null ? 0 : q * l.ultimoCusto.valor);
                      }, 0);
                    return total > 0 ? `≈ ${formatMoney(total)}${b.atacado ? " estimado" : ""}` : "";
                  })()}
                </span>
              </h3>
            ) : (
              <h3 className="section-label border-l-[3px] border-[var(--primary)] py-0.5 pl-2 @3xl:mt-2">
                {categoria} · {doGrupo.length}
              </h3>
            )}
            <div className={b.cartao ? "space-y-1.5 p-2 @3xl:space-y-0 @3xl:p-1" : "mt-1.5 space-y-1.5 @3xl:space-y-0"}>
              {doGrupo.map((l, i) => (
                <Linha
                  key={l.produtoId}
                  l={l}
                  categorias={categorias}
                  fornecedores={fornecedores}
                  quantidade={quantidades[l.produtoId] ?? formatAmount(l.sugestao)}
                  valor={quantidadeDe(l)}
                  serve={(() => {
                    const q = quantidadeDe(l);
                    return q === null || serveNoLote(q, l.lote);
                  })()}
                  mexida={quantidades[l.produtoId] !== undefined}
                  aoQuantidade={(v) =>
                    setQuantidades((a) => ({ ...a, [l.produtoId]: v }))
                  }
                  aberto={corrigindo === l.produtoId}
                  aoCorrigir={() =>
                    setCorrigindo((a) => (a === l.produtoId ? null : l.produtoId))
                  }
                  fora={fora.has(l.produtoId)}
                  // Índice do que está na gaveta, e não `even:` do CSS: a
                  // paridade do CSS conta irmãos, e qualquer coisa a mais no
                  // contêiner desloca a faixa inteira.
                  listrada={i % 2 === 1}
                  aoMexer={() => {
                    // Devolver uma linha zerada é tirar o zero: volta a sugestão.
                    if (fora.has(l.produtoId) && lerNumeroBR(quantidades[l.produtoId] ?? "") === 0) {
                      setQuantidades((q) => {
                        const novo = { ...q };
                        delete novo[l.produtoId];
                        return novo;
                      });
                    }
                    mexer((atual) => {
                      const novo = new Set(atual);
                      if (fora.has(l.produtoId)) novo.delete(l.produtoId);
                      else novo.add(l.produtoId);
                      return novo;
                    });
                  }}
                />
              ))}
            </div>
            {/* Embaixo de cada fornecedor da compra direta: confirmar o pedido
                dele agora, sem esperar o resto da conferência. */}
            {b.cartao && !editando && doGrupo[0]?.exclusivoId != null && (() => {
              const fornecedorId = doGrupo[0].exclusivoId!;
              const noPedido = doGrupo.filter((l) => !fora.has(l.produtoId));
              const travado =
                noPedido.length === 0 ||
                noPedido.some((l) => {
                  const q = quantidadeDe(l);
                  return q === null || !serveNoLote(q, l.lote);
                });
              return (
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-[var(--border)] px-3 py-2.5">
                  {erroDoGrupo[fornecedorId] && (
                    <p role="alert" className="mr-auto text-xs font-medium" style={{ color: "var(--destructive)" }}>
                      {erroDoGrupo[fornecedorId]}
                    </p>
                  )}
                  <Button
                    type="button"
                    disabled={pendente || travado}
                    onClick={() => confirmarFornecedor(fornecedorId, doGrupo)}
                    className="flex-1 sm:flex-none"
                  >
                    {confirmando === fornecedorId
                      ? "Confirmando…"
                      : `${b.atacado ? "Confirmar lista" : "Confirmar pedido"} · ${plural(noPedido.length, "item", "itens")}`}
                  </Button>
                </div>
              );
            })()}
          </section>
        ))}
          </div>
        ))}

        {/* Duas peneiras agora, e a mensagem precisa dizer QUAL esvaziou a
            lista — "nada encontrado para ''" com a busca vazia é a tela
            culpando uma busca que ninguém fez. */}
        {visiveis.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            <>Nada encontrado para “{busca}”.</>{" "}
            <button
              type="button"
              onClick={() => setBusca("")}
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Ver a lista inteira
            </button>
            .
          </p>
        )}
      </div>

      {erro && (
        <p role="alert" className="msg-error mt-6">
          {erro}
        </p>
      )}

      <div className="sticky bottom-[var(--barra-de-baixo)] z-20 mt-8 border-t border-[var(--border)] bg-[var(--background)] pt-4 pb-4">
        {/* No celular: os campos lado a lado, a conta, e o botão por último na
            largura toda — onde o polegar alcança. Do sm para cima, uma linha. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            size="lg"
            className="order-last w-full py-2.5 sm:order-none sm:w-auto sm:py-3.5"
            disabled={
              pendente ||
              dentro.length === 0 ||
              invalidas > 0 ||
              foraDoLote > 0 ||
              (editando && mudancas === 0) ||
              (!editando && semOrcamento)
            }
            onClick={editando ? salvar : montar}
          >
            {/* Corrigindo, o botão diz o que MUDOU, e não o tamanho da lista:
                "Salvar cotação com 12 itens" faria pensar que os 12 são o que
                vai ser gravado, quando o que ele fez foi tirar um e mexer em
                dois. Sem nada mexido ele fica em "Nada para salvar", que é a
                resposta honesta a um clique que não faria nada. */}
            {editando
              ? pendente
                ? "Salvando…"
                : mudancas === 0
                  ? "Nada para salvar"
                  : `Salvar ${plural(mudancas, "mudança", "mudanças")}`
              : pendente
                ? "Montando…"
                : paraCotacao === 0
                  ? `Gerar ${plural(fornecedoresDiretos.length, "pedido direto", "pedidos diretos")}`
                  : diretos.length === 0
                    ? `Montar cotação com ${plural(paraCotacao, "item", "itens")}`
                    : `Montar a compra — ${plural(dentro.length, "item", "itens")}`}
          </Button>

          {/* Uma saída que não salva, e só no modo de correção. Montar é um
              caminho de ida — quem chegou aqui veio para montar. Corrigir é
              uma visita: ele pode ter aberto só para conferir um número e
              querer sair sem mexer em nada. */}
          {editando && (
            <Button asChild type="button" size="lg" variant="ghost">
              <Link href={`/admin/compras/cotacao/${cotacaoId}`}>
                {mudancas === 0 ? "Voltar" : "Descartar"}
              </Link>
            </Button>
          )}

          {/* O orçamento da semana ao lado do botão: o que já foi pedido nela
              mais esta compra, contra faturamento × meta de CMV. Passar só
              avisa — quem decide cortar é ele. Na correção, só o estimado. */}
          {!editando && orcamentoSemana ? (
            <OrcamentoSemana
              dados={orcamentoSemana}
              estaCompra={estimado}
              semPreco={semPreco}
              className="w-full sm:w-auto sm:flex-1"
            />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              ≈ <strong className="font-semibold tabular-nums text-[var(--foreground)]">{formatMoney(estimado)}</strong>
              {semPreco > 0 && ` · ${semPreco} sem preço`}
            </p>
          )}
        </div>

        {invalidas > 0 ? (
          <p className="hint" style={{ color: "var(--destructive)" }}>
            {plural(invalidas, "quantidade está", "quantidades estão")} em branco.
            Para não comprar um item, digite 0 ou use o ✕.
          </p>
        ) : foraDoLote > 0 ? (
          /* Aviso próprio, e não junto do de cima: "isso não é um número" e
             "esse número não existe como compra" são dois erros diferentes, e
             a saída de cada um é outra. */
          <p className="hint" style={{ color: "var(--destructive)" }}>
            {plural(foraDoLote, "quantidade não fecha", "quantidades não fecham")}{" "}
            o lote do produto. A casa compra por lote fechado — ajuste para um
            múltiplo, ou tire o item com o ✕.
          </p>
        ) : dentro.length === 0 ? (
          <p className="hint">
            Você tirou todos os itens. Não há compra a montar.
          </p>
        ) : (
          diretos.length > 0 &&
          /* A mesma contagem, duas frases — e a diferença é que uma delas é
             uma promessa e a outra era mentira.

             Montando, o pedido direto vai nascer mesmo: é o que `montarCotacao`
             faz com quem tem fornecedor exclusivo.

             Corrigindo uma cotação já montada, NÃO. Estes itens só aparecem
             aqui porque alguém marcou o produto como exclusivo DEPOIS de a
             compra ter sido montada — `linhasDaCotacao` lê o cadastro de hoje.
             E `atualizarCotacao` não cria pedido direto nenhum: não há resposta
             honesta para "de qual contagem este pedido nasceu", e tirar o item
             da cotação apagaria por cascata os preços que já chegaram.

             A tela dizia "viram pedido direto" nos dois casos. Aqui ela passa a
             dizer o que de fato acontece, que é nada, e o que fazer a respeito. */
          (editando ? (
            <p className="hint" style={{ color: "var(--warn)" }}>
              {plural(diretos.length, "item passou", "itens passaram")} a ser
              exclusivo de {fornecedoresDiretos.join(", ")} depois que esta
              compra foi montada, e continua{diretos.length > 1 ? "m" : ""} nesta
              cotação — tirar daqui sozinho apagaria os preços que já chegaram.
              Para comprar direto, use o ✕ e faça o pedido à parte.
            </p>
          ) : null)
        )}
      </div>
    </>
  );
}

/**
 * Uma linha da compra.
 *
 * Tirar NÃO some com a linha: ela apaga e o número fica riscado, e o botão
 * vira "devolver". Sumir de vez não tem como desfazer sem uma máquina de
 * desfazer, e deixa a pergunta "onde foi parar aquilo que eu tirei". Apagada,
 * a conferência vira o que ela é de verdade — ir riscando o que não vai.
 */
function Linha({
  l,
  categorias,
  fornecedores,
  quantidade,
  valor,
  serve,
  mexida,
  aoQuantidade,
  aberto,
  aoCorrigir,
  fora,
  listrada,
  aoMexer,
}: {
  l: LinhaParaRevisar;
  categorias: Opcao[];
  fornecedores: Opcao[];
  /** O que está no campo agora: o que ele digitou, ou a sugestão. */
  quantidade: string;
  /** O número que o campo vale, já lido pelo pai. Nulo = não dá para pedir. */
  valor: number | null;
  /** O número fecha o lote do produto? */
  serve: boolean;
  /** Se ele já digitou por cima. Muda o tom do campo, não o valor. */
  mexida: boolean;
  aoQuantidade: (v: string) => void;
  aberto: boolean;
  aoCorrigir: () => void;
  fora: boolean;
  listrada: boolean;
  aoMexer: () => void;
}) {
  // A conta mora no pai, num lugar só. Aqui ela era refeita com outra
  // régua, e com o lote seriam três escritas da mesma regra.
  const invalida = valor === null;
  return (
    <div className={listrada ? "@3xl:bg-[var(--muted)]" : ""}>
    <div
      /* A faixa mudou de lugar: foi para o embrulho, para pegar a linha E o
         painel de correção quando ele abre. Só no monitor — no celular cada
         linha já é um cartão com moldura, e a cor ali seria enfeite sobre
         separação que já existe. Utilitário e não classe de componente:
         variante do Tailwind não prefixa classe própria. */
      className={`relative grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] p-3 transition @3xl:items-center @3xl:gap-x-2 @3xl:gap-y-0 @3xl:rounded-none @3xl:border-0 @3xl:px-2 @3xl:py-1.5 ${COLUNAS} ${
        fora ? "opacity-40" : ""
      }`}
    >
      <p
        className={`col-span-2 min-w-0 pr-16 font-medium @3xl:col-span-1 @3xl:pr-0 ${
          fora ? "line-through" : ""
        }`}
      >
        {l.nome}

        {/* De quem é o item, quando é de um só.
            Sem isto, a linha do produto exclusivo era idêntica a qualquer
            outra: o rodapé dizia quantos eram, nunca quais — e a tela vai
            separar as duas listas em dois botões, o que não funciona se
            ninguém sabe qual linha vai para onde.

            O nome na linha, e não só num `title`: `title` não existe no
            celular, e a pergunta é "de quem é este item", não "este item é
            especial". Nome comprido mais fornecedor comprido quebra para a
            segunda linha — só nos exclusivos, que são minoria. */}
      </p>

      {/* O lote, em coluna própria, logo depois do nome.
          Solto ao lado do nome ele começava num x diferente em cada linha —
          um nome de 242px e outro de 90 —, e a lista ficava com a informação
          espalhada. Numa coluna, os "× 12 un" caem todos na mesma vertical e
          o olho desce a lista sem procurar.

          Depois do NOME e não no fim da linha: o lote é do produto, como a
          unidade. As colunas da direita são dinheiro e quantidade.

          Célula sempre presente, mesmo vazia, senão a linha sem lote
          desalinharia todas as colunas seguintes — no grid, célula que não
          existe não guarda lugar.

          No celular ela vira uma linha inteira embaixo do nome: lá a linha do
          nome já é a largura da tela, e mais texto ao lado espremeria os
          dois. `order` não precisa — a célula fica entre o nome e a primeira
          `Celula`, que é `order-1`, e isso já a põe no lugar certo.

          O número de lotes é ao vivo: 216 vira "18 × 12 un", 24 vira
          "2 × 12 un".

          Fora do lote, vermelha, com as QUANTIDADES QUE VALEM — "12 ou 24 un"
          —, e não só a acusação de que o número está errado. Sem a saída,
          quem confere 126 linhas divide de cabeça item por item, que é o
          trabalho que esta tela existe para tirar. O "pode ser" que abria a
          frase saiu na mudança para coluna: com "Lote" no cabeçalho em cima,
          ele estava dizendo de novo o que a coluna já diz, e custava os 40px
          que faziam a frase não caber. Ele sobrevive inteiro no `title`.

          Dentro do primeiro lote só existe o de cima: "12 un". Abaixo de 12
          não há compra menor, e oferecer zero seria oferecer "não comprar" no
          lugar onde ele está tentando comprar — para isso a tela tem o ✕. */}
      <span
        className={`col-span-2 text-[11px] leading-tight @3xl:col-span-1 @3xl:whitespace-nowrap ${
          fora ? "line-through" : ""
        }`}
        style={{
          color: serve ? "var(--muted-foreground)" : "var(--destructive)",
        }}
        title={
          l.lote === null
            ? undefined
            : serve
              ? `Comprado de ${formatAmount(l.lote)} em ${formatAmount(l.lote)} ${UNIT_LABEL[l.unidade]}`
              : `Comprado de ${formatAmount(l.lote)} em ${formatAmount(l.lote)} ${UNIT_LABEL[l.unidade]} — pode ser ${textoDoLote(l, valor, serve)}`
        }
      >
        {textoDoLote(l, valor, serve)}
      </span>

      {/* A unidade acompanha os DOIS números. Sem ela no "tem hoje", comparar
          12 com 204 pede que a pessoa lembre de qual unidade se fala — e é
          essa comparação que decide se a sugestão faz sentido.

          `order` só no celular: lá os pares são quantidade à esquerda e
          dinheiro à direita, e no monitor a ordem é a das colunas. Mexer na
          ordem do JSX consertaria um e embaralharia o outro. */}
      <Celula rotulo="Tem hoje" fora={fora} ordem="order-1">
        {formatAmount(l.contado)} <Un>{UNIT_LABEL[l.unidade]}</Un>
      </Celula>

      {/* A sugestão é campo, e não texto.
          Para ele é sugestão; para o fornecedor é a quantidade que a casa quer
          comprar, e entre uma e outra cabe o julgamento de quem compra. Na
          linha, e não no painel de corrigir: mudar quantidade é o gesto mais
          comum desta tela, e não pode custar dois cliques e uma espera. */}
      <span className="order-3 flex items-baseline justify-between gap-2 @3xl:order-none @3xl:justify-end">
        <span className="text-xs text-[var(--muted-foreground)] @3xl:hidden">
          Sugestão
        </span>
        <span className="flex items-baseline gap-1">
          <Input
              inputMode="decimal"
              /* O lote entra aqui e não numa coluna: coluna custaria largura do
                 nome, e quem ouve a tela precisa saber em que múltiplos o
                 número tem de cair antes de digitar. */
              aria-label={`Quanto comprar de ${l.nome}${
                l.lote === null
                  ? ""
                  : `, em lotes de ${formatAmount(l.lote)} ${UNIT_LABEL[l.unidade]}`
              }`}
              value={quantidade}
              onChange={(e) => aoQuantidade(e.target.value)}
              disabled={fora}
              aria-invalid={invalida || !serve}
              /* O vermelho do erro depois do tom de "mexida": as duas pintam
                 a borda, e a que avisa de erro tem de vencer.

                 Borda MAIS fundo claro, e não só borda. Numa lista de 126
                 linhas de corpo 14, uma borda de um pixel trocando de cor é
                 pouco: quem corre o olho pelo rodapé — "1 quantidade não
                 fecha o lote" — precisa achar QUAL, e o fundo é o que se
                 enxerga sem ler.

                 Os dois erros pintam igual, e é de propósito: "isso não é um
                 número" e "esse número não existe como compra" travam o mesmo
                 botão e se consertam no mesmo campo. Quem separa os dois é o
                 rodapé, que tem espaço para a frase inteira. */
              className={`h-7 w-16 px-1.5 text-right text-sm tabular-nums ${
                mexida && !invalida && serve
                  ? "border-[var(--primary)] font-medium"
                  : ""
              } ${
                invalida || !serve
                  ? "border-[var(--destructive)] bg-[var(--danger-soft)]"
                  : ""
              }`}
            />
            <Un>{UNIT_LABEL[l.unidade]}</Un>
        </span>
      </span>

      {/* Sem entrega conferida é traço, nunca zero. Zero seria "de graça", e
          esta casa já escreve essa diferença em todo lugar que a encontra. */}
      <Celula rotulo="Última compra" fora={fora} ordem="order-2">
        {l.ultimoCusto === null ? "—" : formatMoney(l.ultimoCusto.valor)}
      </Celula>

      {/* Segue a quantidade digitada, não a sugerida: o estimado existe para
          ele decidir, e decidir sobre um número que ele acabou de trocar. */}
      <Celula rotulo="Estimado" forte fora={fora} ordem="order-4">
        {l.ultimoCusto === null || valor === null
          ? "—"
          : formatMoney(valor * l.ultimoCusto.valor)}
      </Celula>

      {/* Os dois controles juntos, no canto de cima do cartão no celular e na
          última coluna no monitor. Como `absolute`, eles saem do empilhamento
          e não empurram o nome.

          Lápis de texto, e não ícone: o ✕ ao lado é glifo, e este projeto só
          usa a biblioteca de ícones dentro dos componentes de formulário. Dois
          pesos diferentes lado a lado apareceriam como defeito. */}
      <span className="absolute right-2 top-2 flex items-center gap-2 @3xl:static @3xl:justify-self-end">
        <button
          type="button"
          onClick={aoCorrigir}
          aria-label={`Corrigir o cadastro de ${l.nome}`}
          aria-expanded={aberto}
          className={`text-sm hover:text-[var(--foreground)] ${
            aberto ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
          }`}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={aoMexer}
          aria-label={
            fora ? `Devolver ${l.nome} para a compra` : `Tirar ${l.nome} da compra`
          }
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {fora ? "↩" : "✕"}
        </button>
      </span>
    </div>

      {aberto && (
        <PainelCorrigir
          produtoId={l.produtoId}
          contagemId={l.contagemId}
          contado={l.contado}
          categorias={categorias}
          fornecedores={fornecedores}
          aoFechar={aoCorrigir}
        />
      )}
    </div>
  );
}

/**
 * Corrigir o cadastro sem sair da conferência.
 *
 * É aqui que os erros aparecem — olhando nome, prateleira, sugestão e preço
 * lado a lado é que "90 un de batata frita" salta aos olhos. Sair para
 * Produtos, achar o item, voltar e perder a conferência de 126 linhas era o
 * suficiente para não corrigir.
 *
 * Carrega o produto ao abrir, e não da lista: `saveProduct` grava o produto
 * INTEIRO, então mandar campo faltando não o deixa em paz, apaga ele. Um
 * painel por vez, recém-carregado, é o que torna isso seguro sem escrever uma
 * ação de gravação nova.
 */
function PainelCorrigir({
  produtoId,
  contagemId,
  contado,
  categorias,
  fornecedores,
  aoFechar,
}: {
  produtoId: number;
  contagemId: number;
  contado: number;
  categorias: Opcao[];
  fornecedores: Opcao[];
  aoFechar: () => void;
}) {
  const [p, setP] = useState<ProdutoParaCorrigir | null>(null);
  const [nomeOriginal, setNomeOriginal] = useState("");
  /** O exclusivo como veio do banco, para só chamar a ação se ele mudou. */
  const [exclusivoOriginal, setExclusivoOriginal] = useState("");
  const [contadoTexto, setContadoTexto] = useState(
    String(contado).replace(".", ","),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarNome, setConfirmarNome] = useState(false);
  const [marcaNova, setMarcaNova] = useState("");
  const [buscaForn, setBuscaForn] = useState("");
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    void produtoParaCorrigir(produtoId).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setP(r.data);
        setNomeOriginal(r.data.name);
        setExclusivoOriginal(r.data.exclusivoId);
      } else setErro(r.message);
    });
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  if (erro && p === null) {
    return (
      <p role="alert" className="msg-error my-2">
        {erro}
      </p>
    );
  }

  if (p === null) {
    return (
      <p className="px-2 py-3 text-sm text-[var(--muted-foreground)]">
        Carregando o cadastro…
      </p>
    );
  }

  const mudouNome = p.name.trim() !== nomeOriginal;

  const escolhidos = fornecedores.filter((f) => p.fornecedorIds.includes(f.id));
  const termoForn = chave(buscaForn);
  const achados =
    termoForn.length < 2
      ? []
      : fornecedores
          .filter(
            (f) =>
              !p.fornecedorIds.includes(f.id) && chave(f.name).includes(termoForn),
          )
          .slice(0, 8);

  function salvar() {
    if (!p) return;
    // Renomear atravessa toda cotação e pedido que citam o produto, e o nome é
    // a chave do casamento com o relatório do sistema antigo. A grade de
    // Produtos pergunta antes; aqui também.
    if (mudouNome && !confirmarNome) return setConfirmarNome(true);

    setErro(null);
    setConfirmarNome(false);
    startTransition(async () => {
      // O estoque não se edita neste painel: vai o lido, e `saveProduct`
      // não o regrava por cima do que um recebimento tenha mudado.
      const r = await saveProduct(produtoId, {
        ...p,
        currentStock: p.currentStock.replace(",", "."),
        minStock: p.minStock.replace(",", "."),
        idealStock: p.idealStock.replace(",", "."),
        // Sem esta linha, salvar aqui APAGA o lote: `saveProduct` manda o
        // produto inteiro ao banco, e campo ausente no schema vira nulo. E
        // apagaria justo nesta tela, onde ele está tentando entender por que a
        // linha pede 204.
        lotSize: p.lotSize.replace(",", "."),
      }, p.currentStock);
      if (!r.ok) return setErro(r.message ?? "Não salvou.");

      /* Exclusivo e lista larga não convivem, e por isso não são gravados
         juntos: `setExclusiveSupplier` apaga os vínculos largos ao marcar um
         exclusivo — só um pode vender, e a lista de "quem mais vende isso"
         perde o sentido ao lado disso. Mandar as duas faria uma desfazer a
         outra, e qual venceria dependeria da ordem das linhas aqui. */
      if (p.exclusivoId !== exclusivoOriginal) {
        const e = await setExclusiveSupplier(
          produtoId,
          p.exclusivoId === "" ? null : Number(p.exclusivoId),
        );
        if (!e.ok) return setErro(e.message ?? "Não salvou a compra direta.");
      }

      if (p.exclusivoId === "") {
        const f = await setProductSuppliers(produtoId, p.fornecedorIds);
        if (!f.ok) return setErro(f.message ?? "Não salvou os fornecedores.");
      }

      const novoContado = Number(contadoTexto.replace(",", "."));
      if (Number.isFinite(novoContado) && novoContado !== contado) {
        const c = await corrigirContado(contagemId, produtoId, novoContado);
        if (!c.ok) return setErro(c.message ?? "Não corrigiu a contagem.");
      }

      aoFechar();
    });
  }

  const campo = "field h-8 py-0 text-sm";

  return (
    <div className="card-alerta my-2 space-y-3 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block font-medium">Nome</span>
          <Input
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            className="h-8 text-sm"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Unidade</span>
          <select
            value={p.unit}
            onChange={(e) => setP({ ...p, unit: e.target.value })}
            className={campo}
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Categoria</span>
          <select
            value={p.categoryId}
            onChange={(e) => setP({ ...p, categoryId: e.target.value })}
            className={campo}
          >
            <option value="">{SEM_CATEGORIA}</option>
            {categorias.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Estoque ideal</span>
          <Input
            inputMode="decimal"
            value={p.idealStock}
            onChange={(e) => setP({ ...p, idealStock: e.target.value })}
            className="h-8 text-right text-sm tabular-nums"
          />
        </label>

        {/* O lote aqui, e não só no cadastro: é desta tela que ele está
            olhando quando estranha a sugestão de 204, e mandá-lo a outra aba
            para corrigir o motivo é perder a conferência inteira. */}
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Lote de compra</span>
          <Input
            inputMode="decimal"
            value={p.lotSize}
            onChange={(e) => setP({ ...p, lotSize: e.target.value })}
            placeholder="sem lote"
            className="h-8 text-right text-sm tabular-nums"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Tem hoje</span>
          <Input
            inputMode="decimal"
            value={contadoTexto}
            onChange={(e) => setContadoTexto(e.target.value)}
            className="h-8 text-right text-sm tabular-nums"
          />
          {/* Dito na hora, e não escondido: esta contagem já foi finalizada, e
              o número dela virou o estoque do produto. Mexer aqui muda os
              dois, e a contagem deixa de ser o registro do que o estoquista
              viu na prateleira. */}
          <span className="hint">
            Muda a contagem e o estoque do produto juntos.
          </span>
        </label>

        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block font-medium">Situação</span>
          <select
            value={p.isActive ? "ativo" : "desativado"}
            onChange={(e) =>
              setP({ ...p, isActive: e.target.value === "ativo" })
            }
            className={campo}
          >
            <option value="ativo">Ativo</option>
            <option value="desativado">Desativado</option>
          </select>
          {/* Desativar aqui faz a linha sumir ao salvar, porque a conta da
              sugestão só olha produto ativo. É certo e é surpreendente, então
              é dito antes e não descoberto depois. */}
          {!p.isActive && (
            <span className="hint">
              Ao salvar, este item sai desta lista e para de entrar em contagem
              e em cotação. O cadastro fica, com o histórico.
            </span>
          )}
        </label>
      </div>

      {/* Marcas e "aceita similar" andam juntos: a lista diz o que serve, e o
          similar diz o que fazer quando nenhuma delas tem. Separados, o
          fornecedor lê a lista como exigência que ela talvez não seja. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div className="text-xs">
          <span className="mb-1 block font-medium">Marcas que servem</span>
          {p.preferredBrands.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {p.preferredBrands.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() =>
                      setP({
                        ...p,
                        preferredBrands: p.preferredBrands.filter((x) => x !== m),
                      })
                    }
                    aria-label={`Tirar a marca ${m}`}
                    className="chip px-2.5 py-1 text-xs"
                  >
                    {m} ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Input
            value={marcaNova}
            onChange={(e) => setMarcaNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter aqui não pode enviar nada: adicionar marca é uma decisão,
              // salvar o produto é outra.
              e.preventDefault();
              const nova = marcaNova.trim();
              setMarcaNova("");
              if (!nova || p.preferredBrands.length >= 10) return;
              // Ignora caixa, senão "Sadia" e "sadia" viram duas opções na tela
              // do fornecedor.
              if (p.preferredBrands.some((m) => chave(m) === chave(nova))) return;
              setP({ ...p, preferredBrands: [...p.preferredBrands, nova] });
            }}
            placeholder="Digite e tecle Enter"
            aria-label="Acrescentar marca"
            className="h-8 text-sm"
          />
        </div>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Aceita similar?</span>
          <select
            value={p.acceptsSimilarBrand ? "sim" : "nao"}
            onChange={(e) =>
              setP({ ...p, acceptsSimilarBrand: e.target.value === "sim" })
            }
            className={campo}
          >
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="mb-1 block font-medium">Observação</span>
        <Textarea
          rows={2}
          value={p.description}
          onChange={(e) => setP({ ...p, description: e.target.value })}
          placeholder="Calibre, o corte exato, como a casa usa o item"
          className="text-sm"
        />
      </label>

      <label className="block text-xs">
        <span className="mb-1 block font-medium">Compra direta de</span>
        <select
          value={p.exclusivoId}
          onChange={(e) => setP({ ...p, exclusivoId: e.target.value })}
          className={campo}
        >
          <option value="">ninguém — vai para cotação</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={String(f.id)}>
              {f.name}
            </option>
          ))}
        </select>
        <span className="hint">
          Marcado, este item pula a cotação e vira pedido direto, com o
          fornecedor confirmando o preço pelo link.
        </span>
      </label>

      {/* A lista larga some quando há compra direta, em vez de ficar
          desabilitada: `setExclusiveSupplier` apaga esses vínculos ao marcar o
          exclusivo, e mostrar fichas que serão apagadas ao salvar seria
          desenhar uma escolha que não existe. */}
      {p.exclusivoId === "" ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium">
            Fornecedores que vendem isto
          </legend>

          {/* Os marcados sempre à vista; os outros só pela busca.
              Despejar a lista inteira de fornecedores em fichas enchia o painel
              de nomes que ele não está procurando — e escondê-los atrás da
              busca sem mostrar os marcados faria a escolha atual sumir. */}
          {escolhidos.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {escolhidos.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed
                    onClick={() =>
                      setP({
                        ...p,
                        fornecedorIds: p.fornecedorIds.filter((i) => i !== f.id),
                      })
                    }
                    className="chip px-2.5 py-1 text-xs"
                  >
                    {f.name} ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Input
            type="search"
            value={buscaForn}
            onChange={(e) => setBuscaForn(e.target.value)}
            placeholder={`Buscar entre ${fornecedores.length} fornecedores`}
            aria-label="Buscar fornecedor"
            className="h-8 text-sm"
          />

          {achados.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {achados.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={false}
                    onClick={() => {
                      setP({ ...p, fornecedorIds: [...p.fornecedorIds, f.id] });
                      setBuscaForn("");
                    }}
                    className="chip px-2.5 py-1 text-xs"
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Com compra direta, a lista de quem mais vende este item não se aplica
          — e os vínculos que existirem são apagados ao salvar.
        </p>
      )}

      {confirmarNome && (
        <p role="alert" className="text-sm">
          Mudar o nome de <strong>{nomeOriginal}</strong> para{" "}
          <strong>{p.name.trim() || "vazio"}</strong>? Ele aparece assim em toda
          cotação e pedido que já citam este produto.
        </p>
      )}

      {erro && (
        <p role="alert" className="error">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pendente} onClick={salvar}>
          {pendente
            ? "Salvando…"
            : confirmarNome
              ? "Sim, mudar o nome"
              : "Salvar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={() => (confirmarNome ? setConfirmarNome(false) : aoFechar())}
        >
          {confirmarNome ? "Voltar" : "Cancelar"}
        </Button>
      </div>
    </div>
  );
}
