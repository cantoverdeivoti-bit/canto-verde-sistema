"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { ChevronRight, Pencil, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEM_CATEGORIA, UNIT_LABEL, chave, formatAmount, lerNumeroBR, plural } from "@/lib/format";
import {
  finalizarContagem,
  lancarContagem,
  reativarNaContagem,
  registrarProdutoNovo,
  removerProdutoNovo,
  sugerirCorrecao,
  sugerirIdealNaRequisicao,
  type ProdutoNovoLancado,
} from "@/lib/actions/contagem";
import type { ProductUnit } from "@/generated/prisma/client";

type Item = {
  produtoId: number;
  nome: string;
  codigo: string | null;
  /** O rótulo: "un", "kg". É o que a linha mostra. */
  unidade: string;
  /** O valor do banco. É o que o formulário de correção manda de volta. */
  unit: ProductUnit;
  categoriaId: number | null;
  detalhe: string | null;
  categoria: string;
  /** A embalagem de compra, quando há (fardo de 12): dá para contar por ela. */
  lote: number | null;
  contado: string;
  /** As Requisições ativas em que o produto entra, com o ideal de hoje. */
  requisicoes?: Requisicao[];
  /** Na contagem de uma compra de rotina: o ideal do dia, mostrado ao lado. */
  ideal?: number | null;
};

/** Uma Requisição do produto: "Hortifruti — quinta", ideal 25. */
type Requisicao = { listaId: number; nome: string; ideal: number | null };

type SugerirIdeal = (dados: { listaId: number; produtoId: number; ideal: string; motivo: string }) => Promise<string | null>;

/** Uma gaveta, como o seletor do lançamento precisa dela. */
type Categoria = { id: number; name: string };

/**
 * Um produto do cadastro que NÃO está nesta contagem.
 *
 * Existe para a busca poder distinguir três coisas que na tela pareciam uma
 * só: não existe, existe em outra gaveta, e existe mas está desativado.
 */
type DoCatalogo = {
  /** Só no desativado: é o que o "Reativar" precisa. Ativo não traz id. */
  id: number | null;
  nome: string;
  categoria: string;
  ativo: boolean;
};

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/**
 * Em que pé está cada item.
 *
 * "salvando" cobre os dois tempos em que o número ainda não está no banco: o
 * meio segundo de espera e a viagem. Para quem está no corredor é o mesmo
 * estado — "ainda não é seu" — e separá-los daria dois símbolos para uma
 * informação só. Chave ausente é "não contei este".
 *
 * O anterior era um booleano que só sabia dizer "sim": falha ficava
 * indistinguível de "ainda não digitou", e o contador somava o que estava na
 * tela em vez do que estava no banco.
 */
type Estado = "salvando" | "salvo" | "erro";

/** Onde o rodapé está no caminho entre contar e fechar. */
type Fase = "contando" | "gravando" | "problema" | "confirmar";

/**
 * Altura da barra de busca.
 *
 * O nome da gaveta gruda exatamente embaixo dela, então as duas medidas têm
 * de bater. O número mora aqui, uma vez só: dois valores em lugares
 * diferentes se desencontram na primeira vez que a barra mudar de tamanho, e
 * o desencontro aparece como uma fresta por onde a lista passa por trás do
 * rótulo.
 */
const ALTURA_DA_BARRA = "5.5rem";

const ATALHO = "text-[var(--primary)] underline-offset-4 hover:underline";

/**
 * Contar andando.
 *
 * Grava item a item, com pausa de meio segundo depois da última tecla — e não
 * tudo num botão no fim. Ele conta com o celular numa mão, no meio do
 * corredor; uma aba fechada sem querer não pode custar a despensa inteira.
 *
 * Uma contagem de verdade são 331 itens em 14 categorias numa rolagem só, o
 * que faz duas coisas serem obrigatórias e não enfeite: achar um item pelo
 * nome, e enxergar o que ainda falta. A terceira é a rede: no wifi da
 * despensa, gravação que falha em silêncio deixa o estoque daquele item com o
 * número velho, que depois vira sugestão de compra errada.
 */
export function ContagemForm({
  token,
  itens,
  categorias,
  catalogo,
  novosIniciais,
  gavetasAbertas = false,
}: {
  token: string;
  itens: Item[];
  categorias: Categoria[];
  catalogo: DoCatalogo[];
  novosIniciais: ProdutoNovoLancado[];
  /** A contagem da compra de rotina, com poucos itens, já nasce com tudo aberto. */
  gavetasAbertas?: boolean;
}) {
  const [valores, setValores] = useState<Record<number, string>>(
    () => Object.fromEntries(itens.map((i) => [i.produtoId, i.contado])),
  );
  // Semeado com o que veio do banco: ele fecha a aba, volta pelo mesmo link e
  // vê duzentos números preenchidos. Sem isto, nenhum tem visto, e a tela diz
  // "nada disso está gravado" sobre coisas que estão.
  const [estados, setEstados] = useState<Record<number, Estado>>(() =>
    Object.fromEntries(
      itens
        .filter((i) => i.contado !== "")
        .map((i) => [i.produtoId, "salvo" as const]),
    ),
  );
  const [busca, setBusca] = useState("");
  // null = filtro desligado. Ligado, é uma FOTO de quem faltava no instante em
  // que ele ligou, e não uma pergunta refeita a cada tecla. Viva, a linha
  // sumiria debaixo do dedo meio segundo depois de ele digitar o número, com
  // a lista inteira pulando para cima e o teclado apontando para outro item.
  const [faltando, setFaltando] = useState<Set<number> | null>(null);
  /* Quais prateleiras estão recolhidas. Nascem TODAS fechadas, por regra do
     dono: quem abre o link vê primeiro a lista das gavetas, com o progresso de
     cada uma, e abre a que está na frente dele. A busca e o "falta contar"
     continuam mostrando tudo que acham, fechado ou não. A contagem da compra
     de rotina é a exceção: poucos itens, todos na frente dele de uma vez. */
  const [fechados, setFechados] = useState<Set<string>>(
    () => new Set(gavetasAbertas ? [] : itens.map((i) => i.categoria)),
  );
  /* De quais itens ele já avisou nesta volta, só para o lápis acender. O que
     vale mesmo está no banco; isto é o retorno visual de quem acabou de
     mandar e quer saber que foi. */
  const [avisados, setAvisados] = useState<Set<number>>(() => new Set());
  const [fase, setFase] = useState<Fase>("contando");
  const [jaTentou, setJaTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fechando, startFechar] = useTransition();
  const [pronto, setPronto] = useState(false);
  // A frase do pedido que nasceu, quando a contagem é de uma lista fixa.
  const [recado, setRecado] = useState<string | null>(null);
  // Os produtos novos que ele lançou nesta volta, e se o formulário está
  // aberto. `null` fechado; string aberta, com o nome já preenchido pelo que
  // ele acabou de procurar.
  const [novos, setNovos] = useState<ProdutoNovoLancado[]>(novosIniciais);
  const [lancando, setLancando] = useState<string | null>(null);

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Espelhos para o código assíncrono ler o valor de agora, e não o da
  // renderização em que ele nasceu.
  const valoresRef = useRef(valores);
  const estadosRef = useRef(estados);
  const emVoo = useRef<Record<number, Promise<void> | undefined>>({});

  const mexerEstados = useCallback(
    (f: (atual: Record<number, Estado>) => Record<number, Estado>) => {
      estadosRef.current = f(estadosRef.current);
      setEstados(estadosRef.current);
    },
    [],
  );

  /**
   * Uma gravação por item de cada vez, e ela mesma se repete se o número
   * mudou no meio do caminho.
   *
   * Duas viagens simultâneas para o mesmo produto podem voltar fora de ordem
   * numa rede de despensa, e quem chega por último é quem fica no banco — o
   * "5" atrasado sobrescreveria o "50" que ele corrigiu, sem ninguém ver.
   *
   * Devolve a promessa da viagem em curso, e é por isso que finalizar consegue
   * esperar por ela.
   */
  const gravar = useCallback(
    (produtoId: number): Promise<void> => {
      const jaVai = emVoo.current[produtoId];
      if (jaVai) return jaVai;

      mexerEstados((e) =>
        e[produtoId] === "salvando" ? e : { ...e, [produtoId]: "salvando" },
      );

      const p = (async () => {
        let enviado = valoresRef.current[produtoId] ?? "";
        for (;;) {
          const r = await lancarContagem(token, produtoId, enviado);
          const agora = valoresRef.current[produtoId] ?? "";

          if (r.ok && agora !== enviado) {
            enviado = agora;
            continue;
          }

          mexerEstados((e) => {
            const n = { ...e };
            if (!r.ok) n[produtoId] = "erro";
            // Apagar o número é um "me enganei, não contei este": o item volta
            // a não ter estado, não ganha visto de contado.
            else if (enviado.trim() === "") delete n[produtoId];
            else n[produtoId] = "salvo";
            return n;
          });
          if (!r.ok) setErro(r.message ?? "Não gravou.");
          break;
        }
      })();

      emVoo.current[produtoId] = p;
      void p.finally(() => {
        emVoo.current[produtoId] = undefined;
      });
      return p;
    },
    [token, mexerEstados],
  );

  const digitar = useCallback(
    (produtoId: number, valor: string) => {
      valoresRef.current = { ...valoresRef.current, [produtoId]: valor };
      setValores(valoresRef.current);
      // Só escreve o estado quando ele muda de verdade. Marcar "salvando" a
      // cada tecla era um segundo redesenho das 331 linhas por algarismo
      // digitado, para dizer o que já estava dito.
      mexerEstados((e) =>
        e[produtoId] === "salvando" ? e : { ...e, [produtoId]: "salvando" },
      );
      clearTimeout(timers.current[produtoId]);
      timers.current[produtoId] = setTimeout(() => void gravar(produtoId), 500);
    },
    [gravar, mexerEstados],
  );

  const regravar = useCallback(
    (produtoId: number) => {
      setErro(null);
      void gravar(produtoId);
    },
    [gravar],
  );

  /**
   * Ele avisa que o cadastro está errado.
   *
   * Devolve a mensagem de falha ou nulo, em vez de guardar erro aqui: o erro
   * pertence ao cartão que está aberto, e um erro no rodapé da tela sobre um
   * item que está a trezentas linhas de distância não se lê.
   */
  const corrigir = useCallback(
    async (dados: {
      produtoId: number;
      nome: string;
      unit: ProductUnit;
      categoryId: number | null;
      observacoes: string;
    desativar: boolean;
    }) => {
      const r = await sugerirCorrecao(token, dados);
      if (!r.ok) return r.message ?? "Não gravou. Tente de novo.";
      setAvisados((atual) => new Set(atual).add(dados.produtoId));
      return null;
    },
    [token],
  );

  /** Ele sugere outro ideal numa Requisição. Mesma conversa de `corrigir`. */
  const sugerirIdeal = useCallback<SugerirIdeal>(
    async (dados) => {
      const r = await sugerirIdealNaRequisicao(token, dados);
      if (!r.ok) return r.message ?? "Não gravou. Tente de novo.";
      setAvisados((atual) => new Set(atual).add(dados.produtoId));
      return null;
    },
    [token],
  );

  // Sair da tela com temporizador pendente deixa um setState em componente
  // desmontado. `products-list.tsx` já limpa os seus; este não limpava.
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  /**
   * Um texto por item, já sem acento, para procurar dentro.
   *
   * Montado uma vez por lista e não a cada tecla: normalizar 331 nomes por
   * letra digitada é trabalho jogado fora numa tela que roda em celular de
   * corredor. Mesma régua de `products-list.tsx`.
   *
   * O código entra no texto e não na tela: ele está na etiqueta da prateleira,
   * então serve para procurar; mostrá-lo em 331 linhas seria poluir a lista
   * com um dado que ele já tem na mão. A categoria entra pelo mesmo motivo —
   * digitar "hortifruti" leva à gaveta inteira, e isso dispensa um segundo
   * filtro de categoria na barra.
   */
  const indiceDeBusca = useMemo(
    () =>
      new Map(
        itens.map((i) => [
          i.produtoId,
          chave([i.codigo ?? "", i.nome, i.detalhe ?? "", i.categoria].join(" ")),
        ]),
      ),
    [itens],
  );

  /** O mesmo para o catálogo que ficou de fora desta contagem. */
  const indiceDoCatalogo = useMemo(
    () => catalogo.map((p) => ({ ...p, busca: chave(`${p.nome} ${p.categoria}`) })),
    [catalogo],
  );

  const termo = chave(busca);
  const visiveis = useMemo(
    () =>
      itens.filter(
        (i) =>
          (termo === "" || (indiceDeBusca.get(i.produtoId)?.includes(termo) ?? false)) &&
          (faltando === null || faltando.has(i.produtoId)),
      ),
    [itens, indiceDeBusca, termo, faltando],
  );

  /**
   * O termo bate com algum item DESTA contagem, ignorando o "falta contar".
   *
   * Sem ignorar o filtro, `visiveis.length === 0` também quer dizer "está bem
   * aí na sua lista, você já contou e o filtro escondeu" — e oferecer lançar
   * produto novo nesse momento criaria uma sugestão de algo que ele tem na
   * tela.
   */
  const naContagem = useMemo(
    () =>
      termo !== "" &&
      itens.some((i) => indiceDeBusca.get(i.produtoId)?.includes(termo) ?? false),
    [itens, indiceDeBusca, termo],
  );

  /** O que a busca acha no cadastro, fora desta contagem. No máximo três. */
  const foraDaContagem = useMemo(
    () =>
      termo.length < 3
        ? []
        : indiceDoCatalogo.filter((p) => p.busca.includes(termo)).slice(0, 3),
    [indiceDoCatalogo, termo],
  );

  /** Os desativados do cadastro, em ordem de gaveta e nome, para a seção deles. */
  const desativados = useMemo(
    () =>
      catalogo
        .filter((p) => !p.ativo && p.id !== null)
        .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR")),
    [catalogo],
  );

  // Três letras é o piso para a busca dizer alguma coisa: com duas, "to" casa
  // com meia despensa, e tanto o aviso do catálogo quanto a oferta de lançar
  // apareceriam em cima de uma pergunta que ainda não foi feita.

  async function lancar(dados: {
    nome: string;
    unit: string;
    categoryId: string;
    quantidade: string;
  }): Promise<string | null> {
    const r = await registrarProdutoNovo(token, dados);
    if (!r.ok) return r.message;
    setNovos((n) => [...n, r.data]);
    setLancando(null);
    setBusca("");
    return null;
  }

  function tirar(id: number) {
    setErro(null);
    startFechar(async () => {
      const r = await removerProdutoNovo(token, id);
      if (r.ok) setNovos((n) => n.filter((p) => p.id !== id));
      else setErro(r.message ?? "Não deu para tirar.");
    });
  }

  /**
   * Agrupado por categoria: é como a despensa é percorrida, e ver o nome da
   * gaveta mudando é o que diz "acabou esta prateleira, vá para a próxima".
   *
   * Agrupa DEPOIS de filtrar. Gaveta sem item visível deixa de existir, e o
   * rótulo dela some junto — um "CARNES" seguido de nada seria pior que ruído,
   * leria como "não achei nada em carnes", que é outra afirmação.
   */
  const grupos = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of visiveis) {
      if (!m.has(i.categoria)) m.set(i.categoria, []);
      m.get(i.categoria)!.push(i);
    }
    return m;
  }, [visiveis]);

  /**
   * A busca e o "falta contar" mandam mais que a gaveta fechada.
   *
   * Quem procura um nome espera ver o item, não a prateleira onde ele estaria.
   * Se a gaveta fechada vencesse, a busca acharia e não mostraria — e a tela
   * responderia "achei nada" sobre algo que está ali.
   *
   * A escolha de fechar não se perde: ela volta assim que a lista deixa de
   * estar estreitada.
   */
  const estreitando = termo !== "" || faltando !== null;

  function alternarGrupo(categoria: string) {
    setFechados((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else {
        novo.add(categoria);
        /* Fechar uma gaveta alta debaixo de você encurta a página e joga a
           rolagem em outro lugar. Trazer a barra de volta para o topo é o que
           mantém o lugar — sem isto, fechar Bebidas no meio de Secos deixa a
           pessoa sem saber onde foi parar. */
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-grupo="${CSS.escape(categoria)}"]`)
            ?.scrollIntoView({ block: "center" });
        });
      }
      return novo;
    });
  }

  const contados = itens.filter((i) => estados[i.produtoId] === "salvo").length;
  const falhados = itens.filter((i) => estados[i.produtoId] === "erro").length;
  const emBranco = itens.length - contados;

  function alternarFalta() {
    setFaltando(
      faltando !== null
        ? null
        : new Set(
            itens
              .filter((i) => estados[i.produtoId] !== "salvo")
              .map((i) => i.produtoId),
          ),
    );
  }

  /**
   * Esvazia o que ainda espera, e só então deixa fechar.
   *
   * Meio segundo entre a última tecla e a gravação é tempo de sobra para ele
   * digitar o último número e já apertar Finalizar. Esse número morreria
   * dentro do temporizador: o servidor leria null, fecharia a contagem sem
   * ele, e o aviso de erro cairia numa tela que já teria virado "obrigado".
   */
  async function prepararFechamento() {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setErro(null);
    setFase("gravando");

    await Promise.all(
      itens
        .filter((i) => {
          const e = estadosRef.current[i.produtoId];
          return e === "salvando" || e === "erro";
        })
        .map((i) => gravar(i.produtoId)),
    );

    const aindaFalha = itens.some((i) => estadosRef.current[i.produtoId] === "erro");
    setFase(aindaFalha ? "problema" : "confirmar");
  }

  function fecharDeVez() {
    setErro(null);
    startFechar(async () => {
      const r = await finalizarContagem(token);
      if (r.ok) {
        setRecado(r.message ?? null);
        setPronto(true);
      }
      else {
        setErro(r.message ?? "Não foi possível finalizar.");
        setFase("contando");
      }
    });
  }

  if (pronto) {
    return (
      <div className="msg-warn mt-8" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
        <p className="font-semibold">Contagem finalizada. Obrigado!</p>
        <p className="mt-1">
          O estoque foi atualizado com o que você contou. Pode fechar esta
          página.
        </p>
        {recado && <p className="mt-1 font-semibold">{recado}</p>}
        {/* Sem esta linha a de cima vira mentira: produto novo não virou
            estoque, porque ainda não é produto. */}
        {novos.length > 0 && (
          <p className="mt-1">
            {plural(novos.length, "produto novo foi", "produtos novos foram")}{" "}
            para quem cuida das compras autorizar — {novos.length === 1 ? "ele" : "eles"}{" "}
            só {novos.length === 1 ? "entra" : "entram"} no estoque depois disso.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ "--barra": ALTURA_DA_BARRA } as React.CSSProperties}>
      {/* Sangra a margem da página para o fundo cobrir a largura toda: sem
          isso as linhas passam por baixo nas beiradas ao rolar. */}
      <div
        className="sticky top-0 z-20 -mx-5 flex flex-col justify-center border-b border-[var(--border)] bg-[var(--background)] px-5"
        style={{ height: "var(--barra)" }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="search"
              autoComplete="off"
              aria-label="Buscar item pelo nome, código ou categoria"
              placeholder="Buscar item"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              // Menor, a pedido do dono. Atenção: abaixo de 16px o Safari do
              // iPhone dá zoom sozinho ao focar o campo; se isso incomodar,
              // voltar para text-base. O espaço do "limpar" só é reservado
              // quando ele existe.
              className={`h-9 text-sm ${busca !== "" ? "pr-14" : ""}`}
            />
            {busca !== "" && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]"
              >
                limpar
              </button>
            )}
          </div>
        </div>

        {/* A frase do progresso mudou de lugar, não nasceu: era o rodapé que a
            carregava. Aqui ela é lida enquanto ele anda, e não só quando chega
            ao fim da lista. Está sempre presente e sempre com uma linha — se
            aparecesse e sumisse, a barra mudaria de altura e o nome da gaveta,
            que gruda logo abaixo dela, dançaria junto. */}
        <div className="mt-2 flex h-7 items-center gap-2 text-sm">
          {termo !== "" ? (
            <span className="truncate text-[var(--muted-foreground)]">
              {plural(visiveis.length, "item", "itens")} para “{busca}”
            </span>
          ) : (
            <>
              {/* O número que diz quanto do trabalho já foi: grande, na cor
                  da casa, e a barra ao lado mostrando o caminho. */}
              <span className="shrink-0 whitespace-nowrap">
                <strong className="num-display text-lg text-[var(--primary)]">{contados}</strong>
                <span className="text-[var(--muted-foreground)]"> de {itens.length} contados</span>
              </span>
              <span
                aria-hidden
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--muted)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${itens.length ? (contados / itens.length) * 100 : 0}%` }}
                />
              </span>
              <span className="num-display shrink-0 text-xs text-[var(--muted-foreground)]">
                {itens.length ? Math.floor((contados / itens.length) * 100) : 0}%
              </span>
            </>
          )}
          {falhados > 0 && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => itens.forEach((i) => {
                  if (estados[i.produtoId] === "erro") regravar(i.produtoId);
                })}
                className="whitespace-nowrap font-medium underline underline-offset-4"
                style={{ color: "var(--destructive)" }}
              >
                {plural(falhados, "não gravou", "não gravaram")} — tentar de novo
              </button>
            </>
          )}
          {/* Embaixo da busca, na linha do progresso: é o outro jeito de
              estreitar a lista. */}
          <button
            type="button"
            aria-pressed={faltando !== null}
            onClick={alternarFalta}
            className="chip inline-flex h-7 shrink-0 items-center px-2.5 py-0 text-xs whitespace-nowrap"
          >
            falta contar
          </button>
        </div>
      </div>

      {/* Logo abaixo da barra, e não no fim da lista: o botão "+ Produto" está
          lá em cima, e o formulário tem que aparecer onde ele tocou. */}
      {lancando !== null && (
        <div className="mt-4">
          <LancarProduto
            nomeInicial={lancando}
            categorias={categorias}
            aoLancar={lancar}
            aoCancelar={() => setLancando(null)}
          />
        </div>
      )}

      {/* A lista num cartão branco sobre o fundo cinza: a prateleira se
          separa do resto da tela. */}
      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {[...grupos].map(([categoria, doGrupo], n) => {
          const prontos = doGrupo.filter(
            (i) => estados[i.produtoId] === "salvo",
          ).length;
          const fechado = !estreitando && fechados.has(categoria);
          return (
            <section key={categoria}>
              {/* Gruda logo abaixo da barra de busca: no meio de uma gaveta de
                  setenta itens o nome dela some da tela, e ninguém sabe mais em
                  que prateleira está. `z-10` contra o `z-20` da barra, para
                  passar por baixo dela e não por cima. */}
              <h2
                className={`sticky top-[var(--barra)] z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[15px] font-semibold ${
                  n === 0 ? "rounded-t-xl" : ""
                } ${n === grupos.size - 1 && fechado ? "rounded-b-xl border-b-0" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={!fechado}
                  onClick={() => alternarGrupo(categoria)}
                  data-grupo={categoria}
                  className="flex w-full items-center gap-2 text-left"
                >
                  {/* A seta gira em vez de trocar de glifo: dois caracteres
                      diferentes saltam de largura e a linha inteira treme. */}
                  <ChevronRight
                    aria-hidden
                    className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                      fechado ? "" : "rotate-90"
                    }`}
                  />
                  <span className="min-w-0 truncate">{categoria}</span>
                  {/* O progresso da gaveta, que é o que faz uma gaveta fechada
                      ainda dizer alguma coisa. Sem ele, fechar seria esconder
                      sem informar, e ninguém fecharia nada. */}
                  {/* Verde com o visto quando a gaveta está completa: de
                      longe se vê o que ainda falta. */}
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                      prontos === doGrupo.length
                        ? "bg-[var(--ok-soft)] text-[var(--ok-strong)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {prontos === doGrupo.length ? "✓ " : ""}
                    {prontos} de {doGrupo.length}
                  </span>
                </button>
              </h2>
              {/* Fechada, a gaveta some do DOM em vez de ficar escondida.
                  Duas razões: trezentos e trinta campos que ninguém vê custam
                  memória de celular, e o Enter anda pelo DOM — um campo
                  invisível na fila levaria o foco para dentro de uma
                  prateleira fechada. */}
              {!fechado && (
                <ul className="mt-1 divide-y divide-[var(--border)] px-3">
                  {doGrupo.map((i) => (
                    <Linha
                      key={i.produtoId}
                      produtoId={i.produtoId}
                      nome={i.nome}
                      detalhe={i.detalhe}
                      unidade={i.unidade}
                      lote={i.lote}
                      unit={i.unit}
                      categoriaId={i.categoriaId}
                      categorias={categorias}
                      valor={valores[i.produtoId] ?? ""}
                      estado={estados[i.produtoId]}
                      avisado={avisados.has(i.produtoId)}
                      aoDigitar={digitar}
                      aoRegravar={regravar}
                      aoCorrigir={corrigir}
                      requisicoes={i.requisicoes}
                      ideal={i.ideal ?? null}
                      aoSugerirIdeal={sugerirIdeal}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {visiveis.length === 0 && (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]">
            {faltando !== null && faltando.size === 0 ? (
              <span className="font-medium text-[var(--foreground)]">
                Não falta nenhum item — tudo tem número. Pode finalizar.
              </span>
            ) : (
              <>
                Nada encontrado
                {termo !== "" && <> para “{busca}”</>}
                {faltando !== null && " entre os que faltavam"}.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setFaltando(null);
                  }}
                  className={ATALHO}
                >
                  Mostrar a lista inteira
                </button>
                .
              </>
            )}
          </p>
        )}

        {/* O que a busca respondeu sobre o resto do cadastro.

            Bloco separado, e não mais um ramo dentro do parágrafo acima:
            aquele já tem três, e um quarto aninhado ninguém lê nem mantém.
            Aparece só quando ele procurou algo que a contagem não tem — se o
            item está na lista dele, isto não tem o que dizer. */}
        {termo.length >= 3 && !naContagem && (
          <div className="mt-6">
            {foraDaContagem.length > 0 ? (
              <div className="card p-3">
                <p className="text-sm">
                  Não está nesta contagem, mas está no cadastro:
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {foraDaContagem.map((p) => (
                    <li key={p.nome} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.nome}</span>{" "}
                        <span className="text-[var(--muted-foreground)]">
                          ({p.categoria}
                          {!p.ativo && ", desativado"})
                        </span>
                      </span>
                      {!p.ativo && p.id !== null && (
                        <ReativarProduto token={token} id={p.id} nome={p.nome} aoReativar={setBusca} />
                      )}
                    </li>
                  ))}
                </ul>
                {/* O desativado é o caso que mais engana: ele nunca entra em
                    contagem nenhuma, então some da lista mesmo existindo, e é
                    exatamente o item que reaparece na prateleira. */}
                <p className="hint">
                  {foraDaContagem.some((p) => !p.ativo)
                    ? "Item desativado não entra em contagem. Achou ele na prateleira? Toque em Reativar e conte."
                    : "Esta contagem cobre só algumas categorias — este ficou de fora dela."}
                </p>
              </div>
            ) : lancando === null ? (
              <Button type="button" size="sm" onClick={() => setLancando(busca.trim())}>
                Lançar “{busca.trim()}” como produto novo
              </Button>
            ) : null}
          </div>
        )}

        {/* Os desativados, para quem conta ver e trazer de volta o que achou
            na prateleira. Recolhido: são dezenas, e o trabalho do dia é a
            lista de cima. Some enquanto ele busca — a busca já responde. */}
        {termo === "" && desativados.length > 0 && (
          <details className="border-t border-[var(--border)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Produtos desativados</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  Achou algum na prateleira? Reative e conte.
                </span>
              </span>
              <span className="num-display rounded-full bg-[var(--muted)] px-2 py-0.5 text-sm">
                {desativados.length}
              </span>
            </summary>
            <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {desativados.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.nome}</span>{" "}
                    <span className="text-[var(--muted-foreground)]">({p.categoria})</span>
                  </span>
                  <ReativarProduto token={token} id={p.id!} nome={p.nome} aoReativar={setBusca} />
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* O que ele lançou fica logo aqui, onde ele acabou de lançar — e não
            numa seção no fim de trezentas linhas, que ninguém rola até. É o
            momento em que ele quer conferir e, se errou, desfazer. */}
        {novos.length > 0 && (
          <div className="mt-6">
            <h2 className="section-label">produtos novos que você lançou</h2>
            <ul className="mt-1 divide-y divide-[var(--border)]">
              {novos.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.nome}</span>{" "}
                    <span className="text-[var(--muted-foreground)]">
                      {p.quantidade.toLocaleString("pt-BR")}{" "}
                      {UNIT_LABEL[p.unit as ProductUnit]}
                      {p.categoria && ` · ${p.categoria}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => tirar(p.id)}
                    aria-label={`Tirar ${p.nome} da lista`}
                    className="shrink-0 text-xs text-[var(--muted-foreground)] underline underline-offset-4"
                  >
                    tirar
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">
              Vão para quem cuida das compras autorizar. Só viram produto
              depois disso, então não entram nesta contagem.
            </p>
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className="msg-error mt-6">
          {erro}
        </p>
      )}

      {/* Rodapé enxuto: uma pergunta de cada vez.

          A frase permanente sobre o que fica em branco saiu daqui. Eram duas
          linhas grudadas em toda tela de uma rolagem de 331 itens, dizendo
          algo que só importa num instante — e nesse instante ela agora aparece
          com os números de verdade dentro. */}
      <div className="sticky bottom-0 z-20 mt-8 border-t border-[var(--border)] bg-[var(--background)] pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Os três numa fileira, no rodapé que fica sempre à vista: fechar a
            contagem, ver o que falta e lançar o produto que não está no
            cadastro — este vai para quem cuida das compras aprovar ou não. */}
        {fase === "contando" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="lg"
              disabled={contados === 0}
              onClick={prepararFechamento}
              className="min-w-0 flex-1 px-3 text-sm"
            >
              Finalizar contagem
            </Button>
            <button
              type="button"
              onClick={() => {
                setLancando(termo.length >= 3 && !naContagem ? busca.trim() : "");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-expanded={lancando !== null}
              aria-label="Cadastrar produto que falta"
              title="Cadastrar produto que falta"
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-[var(--primary)] px-2.5 text-xs font-semibold whitespace-nowrap text-[var(--primary)]"
            >
              <span aria-hidden className="text-base leading-none">+</span>
              Produto
            </button>
          </div>
        )}

        {/* Um botão apagado sem explicação parece defeito. Ele pode ter
            lançado produto novo e não contado nada — e nesse caso o trabalho
            dele já foi embora, não depende de finalizar. */}
        {fase === "contando" && contados === 0 && (
          <p className="hint">
            Conte ao menos um item para poder finalizar.
            {novos.length > 0 &&
              " O que você lançou como produto novo já foi mandado."}
          </p>
        )}

        {fase === "gravando" && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Gravando o que faltava…
          </p>
        )}

        {fase === "problema" && (
          <div className="card-alerta p-3">
            <p className="text-sm font-medium">
              {plural(falhados, "item não gravou", "itens não gravaram")}.
            </p>
            <p className="mt-1 text-xs">
              Sem {falhados === 1 ? "ele" : "eles"}, o estoque{" "}
              {falhados === 1 ? "desse item fecha" : "desses itens fecha"} com o
              número velho.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setJaTentou(true);
                  void prepararFechamento();
                }}
              >
                Tentar de novo
              </Button>
              {/* A saída só aparece depois de uma tentativa que também falhou.
                  Bloquear de vez prenderia ele numa tela sem saída se a
                  gravação nunca voltar — um produto apagado no meio da
                  contagem falha para sempre. */}
              {jaTentou && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFase("confirmar")}
                >
                  Finalizar sem {falhados === 1 ? "ele" : `esses ${falhados}`}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFase("contando");
                  setFaltando(new Set(itens.filter((i) => estados[i.produtoId] !== "salvo").map((i) => i.produtoId)));
                }}
              >
                Ver quais são
              </Button>
            </div>
          </div>
        )}

        {fase === "confirmar" && (
          <div>
            <p className="text-sm font-medium">
              Finalizar com {contados} de {itens.length} contados?
            </p>
            {emBranco > 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {plural(emBranco, "item ficou", "itens ficaram")} em branco.
                Branco não vira zero — o estoque{" "}
                {emBranco === 1 ? "dele fica" : "deles fica"} como estava.
              </p>
            )}
            {/* A conferência do que ele lançou fica aqui, e não numa seção lá
                embaixo: esta é a única tela que ele lê inteira antes de
                fechar. */}
            {novos.length > 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                E {plural(novos.length, "produto novo vai", "produtos novos vão")}{" "}
                para autorizar: {novos.map((p) => p.nome).join(", ")}.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="lg" disabled={fechando} onClick={fecharDeVez}>
                {fechando ? "Finalizando…" : "Sim, finalizar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={fechando}
                onClick={() => setFase("contando")}
              >
                Voltar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O sinal de cada estado na coluna estreita.
 *
 * "salvo" não tem glifo: quem diz que gravou é a caixa verde, e um visto ao
 * lado dela seria a mesma notícia duas vezes. Os outros dois ficam porque
 * dizem o contrário — "ainda não é seu" e "não foi" — e nenhum dos dois pode
 * depender de cor sozinha.
 */
const GLIFO: Record<Estado, string> = { salvando: "…", salvo: "", erro: "!" };

/**
 * Uma linha da contagem.
 *
 * Grade de colunas fixas, e não `flex-wrap` — mesma razão de `preco-form.tsx`,
 * resultado diferente. Lá a grade vira uma coluna só no celular, porque são
 * três campos largos. Aqui é um campo estreito, e virar coluna repetiria o
 * defeito: com `flex-wrap` as larguras mínimas somavam 348px contra os 335 que
 * um telefone de 375 oferece, então TODA linha quebrava — o número descia para
 * debaixo do nome, e quem lança 331 quantidades procurava o campo em 331
 * lugares diferentes.
 *
 * Sem `.card`: dez cartões são uma lista, 331 são um muro. A divisória fina do
 * `divide-y` é o que separa aqui.
 *
 * `memo` porque todas as linhas dividem o mesmo objeto de valores: sem ele,
 * cada tecla digitada reconciliaria as outras 330, cerca de 2.300 elementos
 * por algarismo. As props são primitivas de propósito — é o que faz a
 * comparação rasa valer alguma coisa.
 */
/**
 * Enter pula para o próximo item que ainda não tem número.
 *
 * Quem conta uma prateleira não tira a mão do teclado numérico para procurar
 * o campo de baixo: digita, confirma, digita. Sem isto, cada item custava um
 * toque de navegação — trezentos e trinta itens, trezentos e trinta toques
 * que não são contagem.
 *
 * Pula o que já tem número, e não só anda uma casa. No começo dá no mesmo,
 * porque tudo está vazio; no fim é a diferença entre cair na única lacuna que
 * sobrou e atravessar quarenta campos preenchidos até achá-la.
 *
 * Volta ao início quando não há lacuna adiante, porque "o próximo a preencher"
 * pode estar atrás — é o item que ele pulou na primeira passada. Sem lacuna
 * nenhuma, tira o foco: o teclado fecha, e essa é a resposta de que acabou.
 *
 * Pelo DOM, e não por uma lista de refs atravessando três componentes: a
 * ordem que interessa é a que está na tela, já filtrada pela busca e pelo
 * "falta contar", e é justamente essa que o DOM tem.
 */
function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
  if (evento.key !== "Enter") return;
  evento.preventDefault();

  const campos = [
    ...document.querySelectorAll<HTMLInputElement>('input[data-campo="contagem"]'),
  ];
  const daqui = campos.indexOf(evento.currentTarget);
  if (daqui === -1) return;

  const vazio = (c: HTMLInputElement) => c.value.trim() === "";
  const alvo =
    campos.slice(daqui + 1).find(vazio) ?? campos.slice(0, daqui).find(vazio);

  if (!alvo) {
    evento.currentTarget.blur();
    return;
  }

  // `center` porque o cabeçalho da gaveta gruda no topo e a barra de busca
  // também: alinhado ao topo, o campo nasceria embaixo dos dois.
  alvo.scrollIntoView({ block: "center" });
  alvo.focus();
  alvo.select();
}

const Linha = memo(function Linha({
  produtoId,
  nome,
  detalhe,
  unidade,
  lote,
  unit,
  categoriaId,
  categorias,
  valor,
  estado,
  avisado,
  aoDigitar,
  aoRegravar,
  aoCorrigir,
  requisicoes,
  aoSugerirIdeal,
  ideal = null,
}: {
  produtoId: number;
  nome: string;
  detalhe: string | null;
  unidade: string;
  lote: number | null;
  unit: ProductUnit;
  categoriaId: number | null;
  categorias: Categoria[];
  valor: string;
  estado: Estado | undefined;
  /** Já mandou uma correção deste item nesta volta. */
  avisado: boolean;
  aoDigitar: (produtoId: number, valor: string) => void;
  aoRegravar: (produtoId: number) => void;
  aoCorrigir: (dados: {
    produtoId: number;
    nome: string;
    unit: ProductUnit;
    categoryId: number | null;
    observacoes: string;
    desativar: boolean;
  }) => Promise<string | null>;
  requisicoes?: Requisicao[];
  aoSugerirIdeal: SugerirIdeal;
  /** O ideal do dia na compra de rotina: quanto deveria ter na prateleira. */
  ideal?: number | null;
}) {
  const [corrigindo, setCorrigindo] = useState(false);
  const falhou = estado === "erro";
  /* Contar por embalagem: com a chave em "cx", o estoquista digita quantas
     caixas (fardos) vê, e o que vai para a contagem é caixas × lote, na
     unidade da casa. Era fazer 7 × 12 de cabeça na frente da prateleira. */
  const [caixas, setCaixas] = useState<string | null>(null);
  const emCaixas = lote !== null && caixas !== null;
  const nCaixas = emCaixas ? lerNumeroBR(caixas) : null;
  function digitarCaixas(texto: string) {
    setCaixas(texto);
    const n = lerNumeroBR(texto);
    aoDigitar(produtoId, n === null || texto.trim() === "" ? "" : formatAmount(n * lote!).replace(/\./g, ""));
  }

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_4.5rem_2.5rem_0.75rem_auto] items-center gap-x-1.5 py-2 ${
        falhou ? "-mx-2 rounded-md bg-[var(--danger-soft)] px-2" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="font-medium leading-tight">{nome}</p>
        {ideal !== null && (
          <p className="text-xs font-semibold text-[var(--primary)]">
            ideal {formatAmount(ideal)} {unidade}
          </p>
        )}
        {detalhe && (
          <p className="text-xs text-[var(--muted-foreground)]">{detalhe}</p>
        )}
        {emCaixas && nCaixas !== null && (
          <p className="text-xs font-semibold text-[var(--primary)]">
            {formatAmount(nCaixas)} cx = {valor} {unidade}
          </p>
        )}
      </div>

      {/* `aria-label` em vez de um `<label>` em volta: o rótulo teria de
          envolver o campo e a unidade, e viraria uma célula só onde precisam
          ser duas. O `text-base` é contra o zoom automático do iPhone.

          `enterKeyHint` troca o rótulo da tecla de retorno para "próximo" no
          teclado do celular, que é o que ela passa a fazer. */}
      {/* A caixa é o sinal, e ela tem três cores.
          Vermelho claro é o que falta, verde claro é o que já está gravado, e
          o meio do caminho — digitando, viajando — fica neutro. Era um visto
          de doze pixels na quinta coluna, e com trezentas e trinta linhas na
          tela e o celular a um braço de distância ninguém enxerga doze
          pixels. Assim a lacuna salta de longe, que é o que faz não sobrar
          item esquecido no fim da prateleira.

          O vermelho é o mesmo `--danger-soft` do erro, e isso é deliberado:
          os dois dizem "não está no banco". O que separa é a linha inteira
          tingida, a mensagem por extenso e a borda forte que a falha ganha
          abaixo — sem a borda, o campo com erro sumiria dentro do fundo da
          própria linha.

          `aria-label` não muda com a cor: leitor de tela não lê cor, e quem
          ouve precisa da mesma informação por outro caminho. */}
      <Input
        inputMode="decimal"
        enterKeyHint="next"
        data-campo="contagem"
        aria-label={emCaixas ? `Quantas caixas de ${lote} tem de ${nome}` : `Quanto tem de ${nome} (em ${unidade})`}
        placeholder="—"
        value={emCaixas ? caixas! : valor}
        onChange={(e) => (emCaixas ? digitarCaixas(e.target.value) : aoDigitar(produtoId, e.target.value))}
        onKeyDown={aoTeclar}
        className={`h-11 w-full px-2 text-right text-base tabular-nums ${
          falhou
            ? "border-[var(--destructive)]"
            : estado === "salvo"
              ? "border-transparent bg-[var(--ok-soft)]"
              : estado === undefined
                ? "border-transparent bg-[var(--danger-soft)]"
                : ""
        }`}
      />

      {/* A unidade sai de cinza-12 para o corpo do texto.
          Contar em quilo o que se mede em unidade é o erro que a contagem não
          consegue desmentir sozinha: 10 vira 10 dos dois jeitos, e só a
          próxima prateleira vazia conta a verdade. O rótulo que evita isso
          estava do tamanho de uma nota de rodapé. */}
      {lote === null ? (
        <span className="text-sm font-medium text-[var(--foreground)]">{unidade}</span>
      ) : (
        /* A chave da embalagem: toca e alterna entre a unidade da casa e a
           caixa do lote. Trocar de volta para a unidade mostra o total já
           convertido, que é o que ficou gravado. */
        <button
          type="button"
          onClick={() => setCaixas((c) => (c === null ? "" : null))}
          aria-pressed={emCaixas}
          aria-label={emCaixas ? `Contando em caixas de ${lote}. Tocar para contar em ${unidade}` : `Contar em caixas de ${lote}`}
          title={emCaixas ? `caixa de ${lote} ${unidade}` : `contar por caixa de ${lote}`}
          className={`h-11 rounded-md border px-1 text-xs leading-tight font-semibold ${
            emCaixas
              ? "border-[var(--primary)] bg-[var(--accent)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--foreground)]"
          }`}
        >
          {emCaixas ? `cx ${formatAmount(lote)}` : unidade}
        </button>
      )}

      {/* Marca só o que gravou. Um visto que aparece antes da gravação seria
          mentira útil por meio segundo e mentira perigosa se a rede caísse —
          por isso a espera tem sinal próprio. */}
      <span
        aria-hidden
        className={`text-xs ${
          estado === "salvo"
            ? "text-[var(--primary)]"
            : falhou
              ? "font-bold"
              : "text-[var(--muted-foreground)]"
        }`}
        style={falhou ? { color: "var(--destructive)" } : undefined}
      >
        {estado ? GLIFO[estado] : ""}
      </span>

      {/* Quem conta é quem vê a embalagem. O lápis é a saída de "este cadastro
          está errado" sem ter que sair da contagem e avisar por fora — que na
          prática quer dizer não avisar.

          Ao lado do visto e não dentro do nome: tocar no nome para editar é o
          gesto que a casa já usou e trocou por um lápis noutra tela, porque
          ninguém descobre o que não parece botão. */}
      <button
        type="button"
        onClick={() => setCorrigindo((v) => !v)}
        aria-expanded={corrigindo}
        aria-label={
          requisicoes && requisicoes.length > 0
            ? `Avisar que o cadastro ou o ideal de ${nome} está errado`
            : `Avisar que o cadastro de ${nome} está errado`
        }
        title={
          requisicoes && requisicoes.length > 0
            ? "Avisar que o cadastro ou o ideal está errado"
            : "Avisar que o cadastro está errado"
        }
        className={`inline-flex size-8 items-center justify-center rounded-md border ${
          corrigindo || avisado
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-[var(--border)] text-[var(--muted-foreground)]"
        }`}
      >
        <Pencil aria-hidden className="size-4" />
      </button>

      {corrigindo && (
        <CorrigirCadastro
          produtoId={produtoId}
          nome={nome}
          unit={unit}
          categoriaId={categoriaId}
          categorias={categorias}
          aoCorrigir={aoCorrigir}
          aoFechar={() => setCorrigindo(false)}
        />
      )}
      {corrigindo && requisicoes && requisicoes.length > 0 && (
        <IdealNasRequisicoes
          produtoId={produtoId}
          unidade={unidade}
          requisicoes={requisicoes}
          aoSugerir={aoSugerirIdeal}
        />
      )}

      {/* A falha ocupa a linha inteira, e não um glifo de 16px: erro que só
          existe numa coluna estreita passa despercebido numa rolagem longa, e
          sem uma saída ali do lado não há como consertar. */}
      {falhou && (
        <p
          className="col-span-full flex items-center gap-2 pb-1 text-xs"
          style={{ color: "var(--destructive)" }}
        >
          Não gravou.
          <button
            type="button"
            onClick={() => aoRegravar(produtoId)}
            aria-label={`Tentar gravar ${nome} de novo`}
            className="font-medium underline underline-offset-4"
          >
            tentar de novo
          </button>
        </p>
      )}
    </li>
  );
});

/**
 * Lançar um produto que não está no cadastro.
 *
 * Quatro campos, e nenhum a menos. Tentei cortar dois e os dois voltaram: a
 * quantidade é o que prova que o item é real e não erro de digitação, e a
 * unidade é a única coisa que só quem está com a coisa na mão sabe — "3" de
 * caixa e "3" de quilo são compras diferentes, e `Product.unit` não aceita
 * nulo para o dono resolver depois.
 *
 * Estado próprio, e não no pai: enquanto ele preenche, isto não é assunto de
 * mais ninguém, e cada tecla aqui não precisa redesenhar as 331 linhas.
 */
/**
 * O que ele acha que o cadastro deveria dizer.
 *
 * Nasce preenchido com o que está lá hoje, e não em branco. Em branco ele
 * teria que redigitar o que já está certo para corrigir uma letra, e no
 * celular, no corredor, isso quer dizer desistir.
 *
 * Nada muda no cadastro por aqui. A correção vira pendência para o dono
 * aprovar, do mesmo jeito que o produto novo que ele lança — e por isso o
 * botão diz "avisar", não "salvar": salvar promete que mudou.
 *
 * A observação existe para quem sabe que está errado e não sabe o certo: "a
 * embalagem mudou de tamanho", "tem dois iguais no cadastro". Sem ela, os três
 * campos obrigariam a inventar um valor para poder avisar.
 */
function CorrigirCadastro({
  produtoId,
  nome,
  unit,
  categoriaId,
  categorias,
  aoCorrigir,
  aoFechar,
}: {
  produtoId: number;
  nome: string;
  unit: ProductUnit;
  categoriaId: number | null;
  categorias: Categoria[];
  aoCorrigir: (dados: {
    produtoId: number;
    nome: string;
    unit: ProductUnit;
    categoryId: number | null;
    observacoes: string;
    desativar: boolean;
  }) => Promise<string | null>;
  aoFechar: () => void;
}) {
  const [novoNome, setNovoNome] = useState(nome);
  const [novaUnidade, setNovaUnidade] = useState<ProductUnit>(unit);
  const [novaGaveta, setNovaGaveta] = useState(
    categoriaId === null ? "" : String(categoriaId),
  );
  const [observacoes, setObservacoes] = useState("");
  const [desativar, setDesativar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, startTransition] = useTransition();

  function avisar() {
    setErro(null);
    startTransition(async () => {
      const falha = await aoCorrigir({
        produtoId,
        nome: novoNome,
        unit: novaUnidade,
        categoryId: novaGaveta === "" ? null : Number(novaGaveta),
        observacoes,
        desativar,
      });
      if (falha !== null) {
        setErro(falha);
        return;
      }
      // Confirma no lugar e fecha sozinho. Ele está no meio de uma prateleira;
      // um cartão aberto esperando um "ok" é mais um toque entre ele e o
      // próximo item.
      setPronto(true);
      setTimeout(aoFechar, 1200);
    });
  }

  return (
    <div className="col-span-full mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      {pronto ? (
        <p className="text-sm font-medium text-[var(--primary)]">
          Avisado. Quem cuida das compras decide.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted-foreground)]">
            O que está errado no cadastro? Mude só o que precisa.
          </p>

          <label className="mt-2 block text-xs">
            <span className="mb-1 block font-medium">Nome</span>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              maxLength={120}
              className="h-11 w-full text-base"
            />
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Unidade</span>
              <select
                value={novaUnidade}
                onChange={(e) => setNovaUnidade(e.target.value as ProductUnit)}
                className="field h-11 w-full bg-[var(--background)] py-0 text-base"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-1 block font-medium">Gaveta</span>
              <select
                value={novaGaveta}
                onChange={(e) => setNovaGaveta(e.target.value)}
                className="field h-11 w-full bg-[var(--background)] py-0 text-base"
              >
                <option value="">{SEM_CATEGORIA}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-2 block text-xs">
            <span className="mb-1 block font-medium">
              Alguma coisa a dizer?
            </span>
            <Input
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={desativar ? "ex: trocamos pelo da outra marca" : "ex: a embalagem mudou de tamanho"}
              maxLength={500}
              className="h-11 w-full text-base"
            />
          </label>

          {/* "Não usamos mais": o produto sai do cadastro ativo e das
              próximas contagens, mas só quando quem cuida das compras
              aceitar. Até lá ele continua aqui. */}
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-sm">
            <input
              type="checkbox"
              checked={desativar}
              onChange={(e) => setDesativar(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span>
              <span className="font-medium">Não usamos mais: pedir para desativar</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                Sai das próximas contagens quando for aprovado.
              </span>
            </span>
          </label>

          {erro && (
            <p role="alert" className="msg-error mt-2 text-xs">
              {erro}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={pendente} onClick={avisar}>
              {pendente ? "Avisando…" : desativar ? "Pedir para desativar" : "Avisar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={aoFechar}
            >
              cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * O ideal deste produto em cada Requisição em que ele entra: o estoquista vê
 * a prateleira esvaziar antes do dia do pedido e sabe que o ideal está baixo.
 * Ele sugere; quem cuida das compras aprova em Pendências.
 */
function IdealNasRequisicoes({
  produtoId,
  unidade,
  requisicoes,
  aoSugerir,
}: {
  produtoId: number;
  unidade: string;
  requisicoes: Requisicao[];
  aoSugerir: SugerirIdeal;
}) {
  return (
    <div className="col-span-full mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-medium">Ideal nas compras de rotina</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Achou pouco ou muito? Sugira outro. Quem cuida das compras aprova.
      </p>
      <ul className="mt-2 space-y-2">
        {requisicoes.map((r) => (
          <IdealDaRequisicao key={r.listaId} produtoId={produtoId} unidade={unidade} requisicao={r} aoSugerir={aoSugerir} />
        ))}
      </ul>
    </div>
  );
}

function IdealDaRequisicao({
  produtoId,
  unidade,
  requisicao,
  aoSugerir,
}: {
  produtoId: number;
  unidade: string;
  requisicao: Requisicao;
  aoSugerir: SugerirIdeal;
}) {
  const [ideal, setIdeal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, startTransition] = useTransition();

  function sugerir() {
    setErro(null);
    startTransition(async () => {
      const falha = await aoSugerir({ listaId: requisicao.listaId, produtoId, ideal, motivo });
      if (falha !== null) return setErro(falha);
      setPronto(true);
    });
  }

  return (
    <li className="text-sm">
      <p>
        <span className="font-medium">{requisicao.nome}</span>
        <span className="text-[var(--muted-foreground)]">
          {" · ideal atual "}
          {requisicao.ideal === null ? "nenhum" : `${String(requisicao.ideal).replace(".", ",")} ${unidade}`}
        </span>
      </p>
      {pronto ? (
        <p className="mt-1 text-sm font-medium text-[var(--primary)]">Sugerido. Quem cuida das compras decide.</p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            inputMode="decimal"
            value={ideal}
            onChange={(e) => setIdeal(e.target.value)}
            placeholder="novo ideal"
            aria-label={`Novo ideal em ${requisicao.nome}`}
            className="num-display h-10 w-28 text-right text-base"
          />
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="por quê? (opcional)"
            maxLength={300}
            aria-label={`Motivo do novo ideal em ${requisicao.nome}`}
            className="h-10 min-w-0 flex-1 basis-40 text-base"
          />
          <Button type="button" size="sm" disabled={pendente || ideal.trim() === ""} onClick={sugerir}>
            {pendente ? "…" : "Sugerir"}
          </Button>
        </div>
      )}
      {erro && (
        <p role="alert" className="msg-error mt-1 text-xs">
          {erro}
        </p>
      )}
    </li>
  );
}

function LancarProduto({
  nomeInicial,
  categorias,
  aoLancar,
  aoCancelar,
}: {
  nomeInicial: string;
  categorias: Categoria[];
  aoLancar: (dados: {
    nome: string;
    unit: string;
    categoryId: string;
    quantidade: string;
  }) => Promise<string | null>;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [quantidade, setQuantidade] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("UN");
  const [categoryId, setCategoryId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const falha = await aoLancar({ nome, unit, categoryId, quantidade });
    setEnviando(false);
    if (falha) setErro(falha);
  }

  return (
    <form onSubmit={enviar} className="card mt-4 space-y-3 p-3">
      <p className="text-sm font-medium">Produto novo</p>

      <label className="block text-xs">
        <span className="mb-1 block font-medium">Nome</span>
        {/* text-base nos quatro, como no resto da tela: abaixo de 16px o
            Safari do iPhone dá zoom sozinho ao focar. */}
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-11 w-full text-base"
          autoFocus
        />
      </label>

      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Quanto tem</span>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="h-11 w-full text-right text-base tabular-nums"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium">Unidade</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as ProductUnit)}
            className="field h-11 py-0 text-base"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="mb-1 block font-medium">Em que categoria você achou</span>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="field h-11 py-0 text-base"
        >
          {/* Todas as gavetas, e não só as desta contagem: ele pode ter achado
              o item numa prateleira que ninguém pediu para contar. */}
          <option value="">não sei</option>
          {categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {erro && (
        <p role="alert" className="error">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? "Mandando…" : "Mandar para autorizar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * "Reativar e contar": o produto desativado volta ao cadastro e entra nesta
 * contagem. Depois, a busca vai para ele — é o próximo número que a pessoa
 * vai digitar.
 */
function ReativarProduto({
  token,
  id,
  nome,
  aoReativar,
}: {
  token: string;
  id: number;
  nome: string;
  aoReativar: (nome: string) => void;
}) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        className="gap-1.5"
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await reativarNaContagem(token, id);
            // Sem `router.refresh()`: a ação já revalida esta tela.
            if (!r.ok) return setErro(r.message ?? "Não deu.");
            aoReativar(nome);
          })
        }
      >
        <RotateCcw aria-hidden className="size-3.5" />
        {pendente ? "Reativando…" : "Reativar e contar"}
      </Button>
      {erro && (
        <span role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </span>
      )}
    </span>
  );
}
