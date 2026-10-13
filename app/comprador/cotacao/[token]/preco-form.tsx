"use client";

import { useRef, useState, useTransition } from "react";
import {
  Ban,
  Check,
  CircleCheck,
  CircleMinus,
  ClipboardList,
  PackageX,
  Lock,
  LockOpen,
  ShoppingCart,
  Tag,
  type LucideIcon,
} from "lucide-react";

import { enterAvanca } from "@/app/comprador/enter-avanca";
import { Obrigatorio, classeObrigatoria } from "@/app/comprador/obrigatorio";
import { SeletorDeMarca } from "@/app/comprador/seletor-de-marca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recusarCotacao, salvarResposta } from "@/lib/actions/cotacao";
import {
  MEDIDAS,
  agrupa,
  chipsDe,
  conteudoNaCasa,
  descreverEmbalagem,
  exemploDaEmbalagem,
  embalagemVazia,
  familiaDe,
  lerEmbalagemAnterior,
  medidaNoPlural,
  quantidadeAoTrocar,
  type Embalagem,
} from "@/lib/embalagem";
import {
  chaveDaEspecificacao,
  type Especificacao,
  type RespostaEspecificacao,
} from "@/lib/especificacao";
import { UNIT_LABEL, formatAmount, formatMoney, lerNumeroBR, plural } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

type Recusa = "SEM_ESTOQUE" | "NAO_TRABALHA";

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/** Um produto que ele tem e a casa nunca pediu. */
export type OfertaNova = {
  nome: string;
  unit: ProductUnit;
  /** A mesma gramática do produto pedido: "é de quê" e o que vem dentro. */
  emb: Embalagem;
  preco: string;
  marca: string;
  obs: string;
};

/** O preço da embalagem pelo da unidade: o que a oferta guarda. */
function precoDaEmbalagem(porUnidade: number | null, conteudo: number | null): number | null {
  return porUnidade === null || conteudo === null ? null : Math.round(porUnidade * conteudo * 100) / 100;
}

const OFERTA_VAZIA: OfertaNova = {
  nome: "",
  unit: "UN",
  emb: embalagemVazia("UN"),
  preco: "",
  marca: "",
  obs: "",
};

export type ItemParaCotar = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  /** O que a casa escreveu sobre o item: "resfriado", "calibre 60". */
  detalhe: string | null;
  categoria: string;
  quantidade: number;
  marcas: string[];
  aceitaSimilar: boolean;
  /** O que o produto tem que ser (obrigatória) ou a casa prefere. */
  especificacoes: Especificacao[];
  /** O que ele respondeu sobre elas da última vez. */
  especificacoesAnteriores: RespostaEspecificacao[];
  /** Se alguém já disse que ele vende isto. Decide a gaveta, e nada mais. */
  vinculado: boolean;
  embalagemAnterior: string | null;
  conteudoAnterior: number | null;
  precoAnterior: number | null;
  prazoAnterior: number | null;
  marcaAnterior: string | null;
  observacaoAnterior: string | null;
  descontoAcimaDeAnterior: number | null;
  descontoPrecoAnterior: number | null;
  recusaAnterior: Recusa | null;
  /**
   * O que ele respondeu da última vez por este produto, em outra cotação. O
   * preço entra na caixa quando ele abre o produto; a marca já vem escolhida
   * (`marcaAnterior`) — aqui ela só serve para dizer "é a da última vez".
   */
  ultimaVez: { preco: number; embalagem: string; marca: string | null } | null;
};

/** "Acima de 10, fica R$ 115", como texto de campo. Vazio = sem desconto. */
type Desconto = { acima: string; preco: string };

/**
 * Cada etapa do formulário de um produto — especificações, valor, marca,
 * preço por quantidade, salvar — separada por uma linha e mais ar. Juntas,
 * sem divisão, as perguntas pareciam um bloco só, e quem enxerga pouco não
 * via onde uma terminava e a outra começava.
 *
 * Tudo alinhado pela esquerda, em leitura de F: a pergunta em cima, a caixa
 * logo embaixo, sempre começando na mesma margem. O olho desce pela esquerda
 * e acha a próxima pergunta sem procurar — centralizado, cada linha começava
 * num lugar diferente e o formulário parecia bagunçado.
 */
const ETAPA = "mt-3 border-t border-[var(--muted-foreground)]/20 pt-3";

const emTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/**
 * O formulário do fornecedor.
 *
 * Três coisas mudaram e todas vêm do mesmo lugar: a casa conta em un e kg, e
 * ele vende em fardo, bombona, caixa. Antes o link pedia "preço unitário" e
 * deixava a divisão com ele, de cabeça, sem guardar quanto tinha dentro — e
 * três fornecedores respondiam três coisas que não se comparavam.
 *
 * Agora ele diz a embalagem dele e o que cabe nela, e a conta é do sistema.
 *
 * A lista deixou de ser plana: o que ele vende vem primeiro e aberto, o resto
 * da compra vem fechado logo abaixo. Quem trabalha com um item que ninguém
 * vinculou passa a poder se oferecer, em vez de olhar uma lista onde aquilo
 * não está.
 *
 * E dizer "não" deixou de ser deixar em branco. Branco era igual a "pulei sem
 * querer", e a casa lia célula vazia como silêncio.
 *
 * Reenviar continua permitido: quem errou um dígito corrige e manda de novo.
 *
 * Nenhuma contagem de itens na tela — "112 produtos em aberto", "0 de 12
 * respondidos". Os fornecedores reclamaram que parecia coisa demais para
 * preencher, e o número desanimava antes de começar. O que ele respondeu
 * continua à vista no resumo do fim.
 */
export function PrecoForm({
  token,
  itens,
  ofertasAnteriores,
  jaRespondeu,
  podeRecusar = false,
}: {
  token: string;
  itens: ItemParaCotar[];
  /** O que ele ofereceu antes e o dono ainda não decidiu. */
  ofertasAnteriores: OfertaNova[];
  jaRespondeu: boolean;
  /** Convite em aberto: dá para avisar "não vou cotar desta vez". */
  podeRecusar?: boolean;
}) {
  const [embalagens, setEmbalagens] = useState<Record<number, Embalagem>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        lerEmbalagemAnterior(i.embalagemAnterior, i.conteudoAnterior, i.unidade),
      ]),
    ),
  );
  const [precos, setPrecos] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        i.precoAnterior === null ? "" : String(i.precoAnterior).replace(".", ","),
      ]),
    ),
  );
  const [marcas, setMarcas] = useState<Record<number, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.marcaAnterior ?? ""])),
  );
  const [obs, setObs] = useState<Record<number, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.observacaoAnterior ?? ""])),
  );
  const [descontos, setDescontos] = useState<Record<number, Desconto>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        { acima: emTexto(i.descontoAcimaDeAnterior), preco: emTexto(i.descontoPrecoAnterior) },
      ]),
    ),
  );
  /* Sim ou não por especificação, pela chave do texto. Ausente = ainda não
     respondeu — e é diferente de "não". */
  const [atendeEspec, setAtendeEspec] = useState<Record<number, Record<string, boolean>>>(() =>
    Object.fromEntries(
      itens.map((i) => [
        i.id,
        Object.fromEntries(
          i.especificacoesAnteriores.map((r) => [chaveDaEspecificacao(r.texto), r.atende]),
        ),
      ]),
    ),
  );
  const [recusas, setRecusas] = useState<Record<number, Recusa | null>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.recusaAnterior])),
  );
  // Fechado quer dizer "já respondi este". Quem reabre o link encontra o que
  // mandou antes já fechado, e não quarenta cartões abertos para reler.
  const [prontos, setProntos] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.precoAnterior !== null])),
  );
  const [prazo, setPrazo] = useState(
    String(itens.find((i) => i.prazoAnterior !== null)?.prazoAnterior ?? ""),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  // A gaveta fechada não monta os cartões dela. Uma compra de 124 itens punha
  // 620 caixas de texto na página de quem só ia responder oito, e o celular
  // do fornecedor engasgava antes da primeira letra.
  const [ofertando, setOfertando] = useState(false);
  // Dentro dela, cada categoria também só monta os cartões quando é aberta.
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<string>>(() => new Set());
  const [ofertas, setOfertas] = useState<OfertaNova[]>(ofertasAnteriores);
  /* Quais produtos estão com o formulário aberto, e em qual o cursor vai
     para o valor. Moram aqui, e não em cada produto, porque salvar um abre
     o PRÓXIMO: quem responde a lista toca Salvar e já está digitando o preço
     do seguinte, sem rolar nem tocar em "Tenho" de novo. */
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const [focar, setFocar] = useState<number | null>(null);
  const [pendente, startTransition] = useTransition();
  const [recusando, setRecusando] = useState(false);

  /** "Não vou cotar desta vez": a casa para de esperar por ele. */
  function recusar() {
    setErro(null);
    startTransition(async () => {
      const r = await recusarCotacao(token);
      if (!r.ok) return setErro(r.message);
      window.location.reload();
    });
  }

  /**
   * Preço por unidade da casa: o que ele digitou, que já é o do kg (ou da
   * un). Nulo enquanto falta o valor ou o que vem na embalagem.
   *
   * Era o da embalagem dividido pelo conteúdo, e ele digitava o do kg no
   * campo da caixa: R$ 36,50 o kg num pacote de 20 kg virava R$ 1,83
   * (decisão do dono: o fornecedor digita sempre o da unidade).
   */
  function porUnidade(i: ItemParaCotar): number | null {
    const p = lerNumeroBR(precos[i.id] ?? "");
    const c = conteudoNaCasa(embalagens[i.id] ?? embalagemVazia(i.unidade), i.unidade);
    if (p === null || c === null || p <= 0 || c <= 0) return null;
    return p;
  }

  /* Só conta — e só vai no Enviar — o que ele SALVOU. O valor da última vez
     entra na caixa sozinho ao abrir o produto; sem esta regra, o preço da
     semana passada de um produto que ele abriu e largou iria junto sem ele
     ter conferido. */
  const salvo = (i: ItemParaCotar) =>
    recusas[i.id] !== null || (prontos[i.id] === true && porUnidade(i) !== null);
  const respondidos = itens.filter(salvo);
  const total = itens.reduce((acc, i) => {
    const u = porUnidade(i);
    return acc + (recusas[i.id] !== null || !prontos[i.id] || u === null ? 0 : u * i.quantidade);
  }, 0);

  /** Ao abrir um produto: o valor da última vez na caixa, se ela está vazia. */
  function sugerirPreco(i: ItemParaCotar) {
    if (!i.ultimaVez || (precos[i.id] ?? "").trim() !== "") return;
    setPrecos((a) => ({ ...a, [i.id]: emTexto(i.ultimaVez!.preco) }));
  }

  function enviar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    const prazoDias = lerNumeroBR(prazo);
    const resposta: Record<string, unknown> = {};

    for (const i of itens) {
      const recusa = recusas[i.id];
      if (recusa !== null) {
        resposta[String(i.id)] = {
          estatus: recusa,
          observacoes: obs[i.id] ?? "",
        };
        continue;
      }
      // Sem preço não é resposta: é linha que ele não olhou. Mandar faria o
      // servidor recusar o envio inteiro por causa de algo que nem era para ir.
      if (!prontos[i.id] || porUnidade(i) === null) continue;

      const emb = embalagens[i.id] ?? embalagemVazia(i.unidade);
      const conteudo = conteudoNaCasa(emb, i.unidade)!;
      const precoUnitario = lerNumeroBR(precos[i.id] ?? "")!;
      const descontoUnitario = lerNumeroBR(descontos[i.id]?.preco ?? "");
      resposta[String(i.id)] = {
        embalagem: descreverEmbalagem(emb, i.unidade),
        conteudo,
        // O servidor refaz a embalagem pelo da unidade; vai junto pela conta.
        precoUnitario,
        precoEmbalagem: Math.round(precoUnitario * conteudo * 100) / 100,
        quantidadeSolicitada: i.quantidade,
        prazoEntregaDias: prazoDias,
        marca: marcas[i.id] ?? "",
        observacoes: obs[i.id] ?? "",
        descontoAcimaDe: lerNumeroBR(descontos[i.id]?.acima ?? ""),
        descontoPrecoUnitario: descontoUnitario,
        descontoPrecoEmbalagem: descontoUnitario === null ? null : Math.round(descontoUnitario * conteudo * 100) / 100,
        especificacoes: i.especificacoes.flatMap((e) => {
          const atende = atendeEspec[i.id]?.[chaveDaEspecificacao(e.texto)];
          return atende === undefined ? [] : [{ texto: e.texto, atende }];
        }),
      };
    }

    /* Linha em branco não é oferta: é o cartão que ele abriu e desistiu de
       preencher. Mandar faria o servidor recusar a resposta inteira por causa
       de algo que ele nem quis dizer. */
    const novos = ofertas
      .filter((o) => [o.nome, o.preco, o.marca, o.obs].some((v) => v.trim() !== ""))
      .map((o) => ({
        nome: o.nome,
        unit: o.unit,
        embalagem: descreverEmbalagem(o.emb, o.unit),
        conteudo: conteudoNaCasa(o.emb, o.unit),
        // Ele digita o da unidade; a oferta guarda o da embalagem.
        precoEmbalagem: precoDaEmbalagem(lerNumeroBR(o.preco), conteudoNaCasa(o.emb, o.unit)),
        marca: o.marca,
        observacoes: o.obs,
      }));

    startTransition(async () => {
      const r = await salvarResposta(token, resposta, novos);
      if (r.ok) setEnviado(true);
      else setErro(r.message);
    });
  }

  if (enviado) {
    return (
      <div className="card p-5">
        <p className="font-medium">Recebemos sua resposta. Obrigado!</p>
        <p className="mt-2 text-base text-[var(--muted-foreground)]">
          Se precisar corrigir alguma coisa, é só abrir este mesmo link de novo
          e reenviar.
        </p>
      </div>
    );
  }

  const meus = itens.filter((i) => i.vinculado);
  const outros = itens.filter((i) => !i.vinculado);

  /** O próximo produto sem resposta da mesma lista, depois deste. */
  function proximo(i: ItemParaCotar): ItemParaCotar | undefined {
    const lista = i.vinculado ? meus : (porCategoria.get(i.categoria) ?? []);
    const aqui = lista.findIndex((x) => x.id === i.id);
    return lista.slice(aqui + 1).find((x) => recusas[x.id] === null && !prontos[x.id]);
  }

  /** Respondeu este: fecha e abre o seguinte, com o cursor no valor. */
  function avancar(i: ItemParaCotar) {
    const seguinte = proximo(i);
    setAbertos((a) => {
      const n = new Set(a);
      n.delete(i.id);
      if (seguinte) n.add(seguinte.id);
      return n;
    });
    if (seguinte) sugerirPreco(seguinte);
    setFocar(seguinte?.id ?? null);
  }

  const linha = (i: ItemParaCotar) => (
    <Item
      key={i.id}
      i={i}
      aberto={abertos.has(i.id)}
      focarValor={focar === i.id}
      aoResponder={() => avancar(i)}
      embalagem={embalagens[i.id] ?? embalagemVazia(i.unidade)}
      preco={precos[i.id] ?? ""}
      marca={marcas[i.id] ?? ""}
      desconto={descontos[i.id] ?? { acima: "", preco: "" }}
      atendeEspec={atendeEspec[i.id] ?? {}}
      obs={obs[i.id] ?? ""}
      recusa={recusas[i.id] ?? null}
      pronto={prontos[i.id] ?? false}
      porUnidade={porUnidade(i)}
      set={{
        embalagem: (v) =>
          setEmbalagens((a) => ({
            ...a,
            [i.id]: { ...(a[i.id] ?? embalagemVazia(i.unidade)), ...v },
          })),
        preco: (v) => setPrecos((a) => ({ ...a, [i.id]: v })),
        marca: (v) => setMarcas((a) => ({ ...a, [i.id]: v })),
        espec: (texto, atende) =>
          setAtendeEspec((a) => ({
            ...a,
            [i.id]: { ...(a[i.id] ?? {}), [chaveDaEspecificacao(texto)]: atende },
          })),
        desconto: (v) =>
          setDescontos((a) => ({
            ...a,
            [i.id]: { ...(a[i.id] ?? { acima: "", preco: "" }), ...v },
          })),
        obs: (v) => setObs((a) => ({ ...a, [i.id]: v })),
        recusa: (v) => setRecusas((a) => ({ ...a, [i.id]: v })),
        pronto: (v) => setProntos((a) => ({ ...a, [i.id]: v })),
        sugerirPreco: () => sugerirPreco(i),
        aberto: (v, comFoco = false) => {
          setAbertos((a) => {
            const n = new Set(a);
            if (v) n.add(i.id);
            else n.delete(i.id);
            return n;
          });
          setFocar(v && comFoco ? i.id : null);
        },
      }}
    />
  );

  // Os outros itens vêm agrupados por categoria: é uma lista que ele percorre
  // procurando o que reconhece, e o nome da prateleira é o que guia.
  const porCategoria = new Map<string, ItemParaCotar[]>();
  for (const i of outros) {
    if (!porCategoria.has(i.categoria)) porCategoria.set(i.categoria, []);
    porCategoria.get(i.categoria)!.push(i);
  }

  return (
    <form
      onSubmit={enviar}
      onKeyDown={enterAvanca}
      // Ver `data-secao="fornecedor"` em `globals.css`: a sombra dos campos.
      data-secao="fornecedor"
      className="space-y-3"
    >
      {jaRespondeu && (
        <p className="hint text-sm">
          Você já respondeu esta cotação. O que está abaixo é o que você mandou
          — pode corrigir e reenviar.
        </p>
      )}

      <p className="text-sm text-[var(--muted-foreground)]">
        Campos com <span className="text-[var(--primary)]">*</span> são obrigatórios.
      </p>

      {/* As três gavetas nascem fechadas — pedido do dono: quem abre o link
          vê as três de uma vez, sabe o que tem na página, e escolhe por onde
          começar. A primeira é a que ele veio responder, e é a que mais
          chama a atenção. */}
      {meus.length > 0 && (
        <Gaveta
          titulo="Produtos vinculados"
          subtitulo="Os itens desta lista que você vende para nós"
          botao="Preencher"
          icone={ClipboardList}
          progresso={
            meus.some(salvo) ? `${meus.filter(salvo).length} de ${meus.length} respondidos` : undefined
          }
        >
          <ul className="space-y-3">{meus.map(linha)}</ul>
        </Gaveta>
      )}

      {/* Oferta, não obrigação. A lista só é montada quando abre (ver
          `ofertando`). */}
      {outros.length > 0 && (
        <Gaveta
          titulo="Outros itens que precisamos"
          subtitulo="Se trabalhar com algum, envie seu preço!"
          botao="Ver e cotar"
          icone={ShoppingCart}
          aoAbrir={setOfertando}
          progresso={outros.some(salvo) ? `${outros.filter(salvo).length} respondidos` : undefined}
        >
          {/* Uma caixa que abre e fecha por categoria, todas fechadas: quem
              vende bebida vai direto em Bebidas, sem rolar por trinta itens
              de hortifrúti. Quantos ele já respondeu aparece na faixa, para
              achar de volta onde mexeu. */}
          {ofertando && (
            <div className="space-y-2">
              {[...porCategoria].map(([categoria, lista]) => {
                const aberta = categoriasAbertas.has(categoria);
                return (
                  <details
                    key={categoria}
                    className="group/categoria rounded-lg border border-[var(--muted-foreground)]/40 bg-[var(--surface)]"
                    onToggle={(e) => {
                      const abriu = e.currentTarget.open;
                      setCategoriasAbertas((atual) => {
                        const proximo = new Set(atual);
                        if (abriu) proximo.add(categoria);
                        else proximo.delete(categoria);
                        return proximo;
                      });
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 text-lg leading-snug font-semibold">{categoria}</span>
                      <span className="shrink-0 rounded-lg border border-[var(--primary)] px-3 py-1 text-base font-semibold text-[var(--primary)]">
                        <span className="group-open/categoria:hidden">visualizar</span>
                        <span className="hidden group-open/categoria:inline">fechar</span>
                      </span>
                    </summary>
                    {aberta && (
                      <ul className="space-y-3 border-t border-[var(--muted-foreground)]/40 p-2">
                        {lista.map(linha)}
                      </ul>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </Gaveta>
      )}

      {/* A terceira seção não se liga a item nenhum: é ele dizendo o que tem
          e a gente nunca pediu. Antes isso morria na ligação — "aproveita que
          esta semana eu tenho azeite bom".

          Não abre nem fecha, porque não há nada guardado dentro para mostrar:
          o botão já é a ação. Era "abrir" para achar lá dentro um segundo
          botão, "Oferecer um produto" — dois toques para chegar no primeiro
          campo. Cada toque no botão põe um cartão novo embaixo. */}
      <section className={CARTAO_DA_SECAO}>
        <div className={CABECA_DA_SECAO}>
          <h2 className="contents">
            <TituloDaSecao
              icone={Tag}
              titulo="Tem ofertas ou novidades?"
              subtitulo="Mostre promoções e lançamentos."
            />
          </h2>
          <button
            type="button"
            disabled={ofertas.length >= 20}
            onClick={() => setOfertas((a) => [...a, OFERTA_VAZIA])}
            className={BOTAO_DA_SECAO}
          >
            Adicionar
          </button>
        </div>

        {ofertas.length > 0 && (
          <ul className="space-y-3 border-t border-[var(--muted-foreground)]/25 p-2 sm:p-3">
            {ofertas.map((o, n) => (
              <Oferta
                // Índice como chave porque a lista só cresce no fim e encolhe
                // por remoção explícita: não há reordenação para embaralhar.
                key={n}
                o={o}
                aoMudar={(mudanca) =>
                  setOfertas((a) => a.map((x, i) => (i === n ? { ...x, ...mudanca } : x)))
                }
                aoRemover={() => setOfertas((a) => a.filter((_, i) => i !== n))}
              />
            ))}
          </ul>
        )}
      </section>

      <ResumoDaResposta
        itens={itens}
        recusas={recusas}
        prontos={prontos}
        porUnidade={porUnidade}
        ofertas={ofertas.filter((o) => o.nome.trim() !== "").length}
        total={total}
      />

      {/* Discreto, no fim: a saída de quem não vai cotar, para a casa não
          ficar esperando. Pede confirmação na própria linha. */}
      {podeRecusar && respondidos.length === 0 && (
        <div className="text-center text-sm">
          {recusando ? (
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
              <span>Avisar que não vai cotar desta vez?</span>
              <button
                type="button"
                disabled={pendente}
                onClick={recusar}
                className="rounded-md bg-[var(--botao)] px-3 py-1 font-semibold text-[var(--botao-texto)] disabled:opacity-60"
              >
                Sim, não vou cotar
              </button>
              <button type="button" onClick={() => setRecusando(false)} className="px-2 py-1 text-[var(--muted-foreground)]">
                voltar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setRecusando(true)}
              className="text-[var(--muted-foreground)] underline underline-offset-4 hover:text-[var(--foreground)]"
            >
              Não vou cotar desta vez
            </button>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Colado no rodapé da tela enquanto ele rola, e assentado aqui no fim,
          depois do resumo: um botão só, sempre à vista. Antes era preciso
          rolar a lista inteira até achar onde mandar.

          Quem não vende nada da lista mas tem outra coisa a oferecer também
          respondeu. Exigir um item preenchido deixaria essa pessoa sem botão. */}
      <div className="sticky bottom-0 -mx-5 border-t border-[var(--border)] bg-[var(--background)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* O prazo mora aqui, junto do envio: um prazo para o pedido inteiro
            — fornecedor entrega tudo junto, e perguntar por linha seria pedir
            vinte vezes a mesma resposta. Ao lado, quanto ele já respondeu. */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold">Entrega em</span>
            <Input
              inputMode="numeric"
              placeholder="?"
              aria-label="Prazo de entrega, em dias"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="num-display h-8 w-14 text-center"
            />
            <span>dias</span>
          </label>
          {respondidos.length > 0 && (
            <p className="text-right text-sm leading-tight">
              <span className="text-[var(--muted-foreground)]">
                {plural(respondidos.length, "item", "itens")}
              </span>
              {total > 0 && (
                <>
                  <span className="text-[var(--muted-foreground)]"> · </span>
                  <strong className="num-display text-base">{formatMoney(total)}</strong>
                </>
              )}
            </p>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full text-base"
          disabled={pendente || (respondidos.length === 0 && ofertas.length === 0)}
        >
          {pendente ? "Enviando…" : "Enviar resposta"}
        </Button>
      </div>
    </form>
  );
}

/**
 * O que vai no "Enviar resposta", conferido antes de tocar nele.
 *
 * Com as seções fechadas, o fornecedor não vê mais o que respondeu — e o
 * botão manda tudo de uma vez. Aqui está, numa lista curta: o que tem preço
 * (com o total de cada), o que ele disse que não tem, e quantos produtos
 * ofereceu. É exatamente o que `enviar()` manda: só o que ele salvou.
 */
function ResumoDaResposta({
  itens,
  recusas,
  prontos,
  porUnidade,
  ofertas,
  total,
}: {
  itens: ItemParaCotar[];
  recusas: Record<number, Recusa | null>;
  prontos: Record<number, boolean>;
  porUnidade: (i: ItemParaCotar) => number | null;
  ofertas: number;
  total: number;
}) {
  const comPreco = itens.flatMap((i) => {
    const u = recusas[i.id] === null && prontos[i.id] ? porUnidade(i) : null;
    return u === null ? [] : [{ i, u }];
  });
  const semEstoque = itens.filter((i) => recusas[i.id] === "SEM_ESTOQUE");
  const naoTrabalha = itens.filter((i) => recusas[i.id] === "NAO_TRABALHA");

  if (comPreco.length + semEstoque.length + naoTrabalha.length + ofertas === 0) return null;

  return (
    <div className="card p-4">
      <p className="text-lg font-semibold">Resumo da sua resposta</p>

      {comPreco.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--muted-foreground)]/30">
          {comPreco.map(({ i, u }) => {
            const unidade = UNIT_LABEL[i.unidade];
            return (
              <li key={i.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block text-base">{i.nome}</span>
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {formatMoney(u)}/{unidade} · {formatAmount(i.quantidade)} {unidade}
                  </span>
                </span>
                <span className="num-display shrink-0 text-base font-semibold">
                  {formatMoney(u * i.quantidade)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {semEstoque.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-[var(--warn)]">Sem estoque:</span>{" "}
          {semEstoque.map((i) => i.nome).join(", ")}
        </p>
      )}
      {naoTrabalha.length > 0 && (
        <p className="mt-1 text-sm">
          <span className="font-semibold text-[var(--warn)]">Não trabalho:</span>{" "}
          {naoTrabalha.map((i) => i.nome).join(", ")}
        </p>
      )}
      {ofertas > 0 && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Ofertas:</span> {plural(ofertas, "produto oferecido", "produtos oferecidos")}
        </p>
      )}

      {comPreco.length > 0 && (
        <p className="mt-3 flex items-baseline justify-between border-t-2 border-[var(--muted-foreground)]/45 pt-2">
          <span className="text-base font-semibold">Total</span>
          <span className="num-display text-xl font-semibold">{formatMoney(total)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Seção sem caixa nem fundo, a pedido do dono: uma linha em cima a separa
 * das outras. Leitura em F: título e frase na margem esquerda, onde o olho
 * desce; o botão vermelho na mesma linha, à direita, a pedido do dono.
 */
/** Tenho / Sem estoque / Não trabalho: neutros, ícone na cor, texto pode quebrar. */
const BOTAO_DA_RESPOSTA =
  // Ícone em cima e texto embaixo: com o ícone ao lado, "Sem estoque" e
  // "Não trabalho" não cabiam na coluna de um celular de 375px.
  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--muted-foreground)]/35 bg-[var(--background)] px-1 py-1.5 text-center text-[13px] leading-tight font-semibold text-[var(--foreground)] hover:border-[var(--primary)]";

const CARTAO_DA_SECAO = "rounded-xl border border-[var(--muted-foreground)]/35 bg-[var(--surface)]";
const CABECA_DA_SECAO = "flex items-center gap-3 p-3";
const BOTAO_DA_SECAO =
  // Largura fixa e pequena: cabe na mesma linha do título no celular, e os
  // três ficam do mesmo tamanho, na mesma coluna.
  "w-28 shrink-0 rounded-md bg-[var(--botao)] px-2 py-2 text-center text-sm font-bold whitespace-nowrap text-[var(--botao-texto)] disabled:opacity-50";

/** Ícone, título e a frase de cada bloco — o mesmo nos três. */
function TituloDaSecao({
  icone: Icone,
  titulo,
  subtitulo,
  progresso,
}: {
  icone: LucideIcon;
  titulo: string;
  subtitulo: string;
  progresso?: string;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-lg leading-snug font-bold">
        <Icone aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
        {titulo}
      </span>
      <span className="mt-0.5 block text-sm leading-snug text-[var(--muted-foreground)]">{subtitulo}</span>
      {progresso && (
        <span className="mt-1 inline-block rounded-full bg-[var(--ok-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ok-strong)]">
          {progresso}
        </span>
      )}
    </span>
  );
}

/**
 * Uma seção do link que abre e fecha: uma linha grossa em cima, título e uma
 * linha do que tem dentro, e o botão vermelho embaixo, no centro.
 *
 * Era um rótulo cinza de 12px em caixa alta com a setinha do navegador — o
 * fornecedor não via que dava para clicar, e não via que havia três. A faixa
 * inteira abre (é o `summary`); o botão é o sinal de que abre, e vira
 * "fechar" quando aberta.
 *
 * `principal` é a gaveta que ele veio responder: vinho cheio na borda, para
 * ser a primeira em que o olho para.
 */
function Gaveta({
  titulo,
  subtitulo,
  botao,
  icone,
  progresso,
  aoAbrir,
  children,
}: {
  titulo: string;
  subtitulo: string;
  /** "2 de 3 respondidos" — o que já foi feito, visível com o bloco fechado. */
  progresso?: string;
  /** O que o botão diz com a gaveta fechada: "Preencher", "Ver e cotar". */
  botao: string;
  /** O símbolo à esquerda do título. */
  icone: LucideIcon;
  aoAbrir?: (aberta: boolean) => void;
  children: React.ReactNode;
}) {
  const gaveta = useRef<HTMLDetailsElement>(null);
  /* Os itens só existem com a gaveta aberta. Fechada, ela era montada
     inteira (cada item com seus campos), e com dezenas de itens o celular do
     fornecedor pagava por grupos que ninguém abriu. O que ele digitou não se
     perde: mora no formulário, não no campo. */
  const [aberta, setAberta] = useState(false);

  /* "Salvar" no pé do grupo: fecha a gaveta e leva a tela de volta ao
     título dela. Quem terminou de responder a lista não precisa rolar para
     cima procurando o "fechar". O que ele respondeu já está guardado item a
     item — e só sai do celular dele no "Enviar resposta", que o texto ao
     lado lembra. */
  function fecharGrupo() {
    const d = gaveta.current;
    if (!d) return;
    d.open = false;
    d.querySelector("summary")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <details
      ref={gaveta}
      className={`group/gaveta ${CARTAO_DA_SECAO}`}
      onToggle={(e) => {
        setAberta(e.currentTarget.open);
        aoAbrir?.(e.currentTarget.open);
      }}
    >
      <summary
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${CABECA_DA_SECAO}`}
      >
        <TituloDaSecao icone={icone} titulo={titulo} subtitulo={subtitulo} progresso={progresso} />
        <span className={BOTAO_DA_SECAO}>
          <span className="group-open/gaveta:hidden">{botao}</span>
          <span className="hidden group-open/gaveta:inline">fechar</span>
        </span>
      </summary>
      <div className="border-t border-[var(--muted-foreground)]/25 p-2 sm:p-3">{aberta && children}</div>
      <div className="flex flex-col items-start gap-1 px-3 pb-3">
        <button
          type="button"
          onClick={fecharGrupo}
          className="rounded-lg bg-[var(--botao)] px-8 py-2 text-base font-semibold text-[var(--botao-texto)] hover:opacity-90"
        >
          Salvar
        </button>
        <span className="text-sm text-[var(--muted-foreground)]">
          Fecha o grupo. Para mandar para nós, toque em “Enviar resposta” no fim.
        </span>
      </div>
    </details>
  );
}

/**
 * Um item para o fornecedor responder.
 *
 * A quantidade que a casa quer é o número mais importante do cartão — é por
 * ele que o fornecedor decide se atende e por quanto. Fica grande, no topo, e
 * não como legenda cinza embaixo do nome.
 *
 * Fecha ao ser concluído porque a lista é longa e o celular é pequeno: sem
 * isto, quem responde vinte itens não enxerga onde parou.
 */
function Item({
  i,
  aberto,
  focarValor,
  aoResponder,
  embalagem,
  preco,
  marca,
  desconto,
  atendeEspec,
  obs,
  recusa,
  pronto,
  porUnidade,
  set,
}: {
  i: ItemParaCotar;
  aberto: boolean;
  focarValor: boolean;
  /** Respondeu (salvou ou disse que não tem): o formulário abre o próximo. */
  aoResponder: () => void;
  embalagem: Embalagem;
  preco: string;
  marca: string;
  desconto: Desconto;
  /** Sim ou não por especificação, pela chave do texto. */
  atendeEspec: Record<string, boolean>;
  obs: string;
  recusa: Recusa | null;
  pronto: boolean;
  porUnidade: number | null;
  set: {
    embalagem: (v: Partial<Embalagem>) => void;
    preco: (v: string) => void;
    marca: (v: string) => void;
    desconto: (v: Partial<Desconto>) => void;
    espec: (texto: string, atende: boolean) => void;
    obs: (v: string) => void;
    recusa: (v: Recusa | null) => void;
    pronto: (v: boolean) => void;
    aberto: (v: boolean, comFoco?: boolean) => void;
    sugerirPreco: () => void;
  };
}) {
  const [falta, setFalta] = useState<string | null>(null);
  /* O formulário só aparece depois de "Tenho". Quem tocou "alterar" quer ele
     à vista, e não o cartão fechado pedindo mais um toque. O estado sobrevive
     à troca entre o cartão compacto e o formulário porque é o mesmo
     componente — só o desenho muda. */
  /* Como o item estava quando o formulário abriu. "Cancelar" volta a isto —
     sem o retrato, fechar deixaria o preço meio digitado no estado, e ele
     iria junto no "Enviar resposta" sem ninguém ter salvo. */
  const [antes, setAntes] = useState<{
    embalagem: Embalagem;
    preco: string;
    marca: string;
    desconto: Desconto;
    obs: string;
    pronto: boolean;
  } | null>(null);

  function retratar(eraPronto: boolean) {
    setAntes({ embalagem, preco, marca, desconto, obs, pronto: eraPronto });
  }

  function cancelar() {
    if (antes) {
      set.embalagem(antes.embalagem);
      set.preco(antes.preco);
      set.marca(antes.marca);
      set.desconto(antes.desconto);
      set.obs(antes.obs);
      set.pronto(antes.pronto);
    }
    setFalta(null);
    set.aberto(false);
  }
  const unidade = UNIT_LABEL[i.unidade];
  const medidaDoPreco = medidaNoPlural(embalagem.chip, i.unidade);
  // Quanto da unidade da casa vem na embalagem: o preço dela sai daqui.
  const conteudo = conteudoNaCasa(embalagem, i.unidade);
  const valorNormal = lerNumeroBR(preco);
  const acimaDe = lerNumeroBR(desconto.acima);
  const valorComDesconto = lerNumeroBR(desconto.preco);

  /**
   * O que ainda falta para esta linha valer como oferta.
   *
   * Vale a pena conferir aqui e não só no envio: o servidor recusa a resposta
   * inteira por causa de uma marca em branco, e achar qual dos quarenta itens
   * era o furado, numa tela de celular, é o que faz o fornecedor desistir e
   * ligar.
   */
  function pendencia(): string | null {
    const semSim = i.especificacoes.find(
      (e) => e.obrigatoria && atendeEspec[chaveDaEspecificacao(e.texto)] !== true,
    );
    if (semSim) return `Confirme que o produto é "${semSim.texto}" — é obrigatório.`;

    const valor = lerNumeroBR(preco);
    if (valor === null || valor <= 0) return "Falta o valor.";
    if (porUnidade === null) return `Falta dizer quanto vem em cada ${embalagem.chip.toLowerCase()}.`;
    if (marca.trim() === "") return "A marca é obrigatória.";

    // As mesmas regras do servidor (`precoSchema`), ditas aqui no item em vez
    // de recusar a resposta inteira lá no fim.
    const acima = lerNumeroBR(desconto.acima);
    const comDesconto = lerNumeroBR(desconto.preco);
    if (acima !== null || comDesconto !== null) {
      if (acima === null || acima <= 0 || comDesconto === null || comDesconto <= 0) {
        return "No preço por quantidade, preencha a quantidade e o valor — ou deixe os dois em branco.";
      }
      if (comDesconto >= valor) {
        return `O valor com desconto é o preço do ${unidade}, e precisa ser menor que ${formatMoney(valor)}.`;
      }
    }
    return null;
  }

  function concluir() {
    const f = pendencia();
    setFalta(f);
    if (f === null) {
      set.pronto(true);
      aoResponder();
    }
  }

  if (recusa !== null || pronto) {
    return (
      /* Respondido tem que se ver de longe, rolando uma lista de cem itens:
         verde com o visto grande quando tem preço, amarelo com o traço
         quando ele disse que não tem. Os que faltam continuam no bege de
         sempre — o olho vai direto neles. */
      <li
        className="flex items-center gap-3 rounded-xl border border-l-4 border-[var(--muted-foreground)]/25 bg-[var(--background)] px-3 py-2.5"
        style={{ borderLeftColor: recusa === null ? "var(--ok-strong)" : "var(--warn)" }}
      >
        {recusa === null ? (
          <CircleCheck aria-label="Respondido" className="size-6 shrink-0 text-[var(--ok-strong)]" />
        ) : (
          <CircleMinus aria-label="Não tenho" className="size-6 shrink-0 text-[var(--warn)]" />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-lg leading-snug font-semibold">{i.nome}</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {recusa === "SEM_ESTOQUE"
              ? "sem estoque agora"
              : recusa === "NAO_TRABALHA"
                ? `não trabalho com isso${obs.trim() ? ` · ${obs.trim()}` : ""}`
                : `${formatMoney(lerNumeroBR(preco) ?? 0)} o ${unidade}${
                    embalagem.chip === ""
                      ? ""
                      : ` · ${embalagem.chip.toLowerCase()}${descreverEmbalagem(embalagem, i.unidade).slice(embalagem.chip.length)}`
                  } · ${marca}`}
          </p>
          {recusa === null && desconto.acima !== "" && desconto.preco !== "" && (
            <p className="text-base text-[var(--ok-strong)]">
              a partir de {desconto.acima} {medidaDoPreco}: R$ {desconto.preco} o {unidade}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {recusa === null && porUnidade !== null && (
            <p className="num-display font-semibold">
              {formatMoney(porUnidade * i.quantidade)}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setFalta(null);
              // Recusa desfeita volta aos três botões; preço desfeito volta
              // ao formulário, que é o que ele veio corrigir.
              set.aberto(recusa === null, false);
              retratar(recusa === null);
              set.pronto(false);
              set.recusa(null);
            }}
            className="text-sm text-[var(--primary)] underline underline-offset-4"
          >
            alterar
          </button>
        </div>
        </div>
      </li>
    );
  }

  return (
    <li className="card px-3 py-2.5">
      {/* Fechado, ele vê tudo o que pedimos de uma vez: nome, quantidade e
          as três respostas possíveis. Aberto, cada item era um formulário de
          cinco campos — doze itens viravam quatro telas de celular.

          As três respostas moram embaixo do nome, e não no pé do formulário:
          "sem estoque" e "não trabalho" se respondem num toque, sem abrir
          nada. Só "Tenho" pede o preço. */}
      <p className="text-lg leading-snug font-semibold">{i.nome}</p>
      {i.detalhe && (
        <p className="mt-0.5 text-base text-[var(--muted-foreground)]">{i.detalhe}</p>
      )}
      {/* À vista antes de tocar em "Tenho": quem só tem congelado já sabe,
          aqui, que a resposta dele é "Não trabalho". */}
      {i.especificacoes.length > 0 && (
        /* O mesmo cadeado do cadastro: fechado é exigência (vinho), aberto é
           preferência (ouro, a cor de "atenção" do link). Só a cor e o
           ícone, sem moldura — o dono achou a caixa pesada demais. */
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {i.especificacoes.map((e) => {
            const Icone = e.obrigatoria ? Lock : LockOpen;
            return (
              <li
                key={e.texto}
                className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                  e.obrigatoria ? "text-[var(--primary)]" : "text-[var(--warn)]"
                }`}
              >
                <Icone aria-hidden className="size-3.5 shrink-0" />
                <span>
                  <span className="font-normal">{e.obrigatoria ? "Exigido:" : "Preferência:"}</span>{" "}
                  {e.texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* A quantidade na linha dos botões: é por ela que ele escolhe qual
          tocar, e o nome ganha a largura inteira em cima. */}
      <div className="mt-2.5 grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-stretch gap-1.5 sm:grid-cols-[auto_repeat(3,minmax(0,7rem))] border-t border-[var(--muted-foreground)]/35 pt-2.5">
      {/* Três colunas do mesmo tamanho, e o texto pode quebrar: com letra de
          leitura (14px, e não os 12 de antes) "Não trabalho" não cabe numa
          linha ao lado da quantidade num celular de 360px. */}
      {/* A quantidade primeiro, à esquerda, com "precisamos" em cima: lida
          como frase — "precisamos 30 kg" — antes dos botões da resposta. É
          por ela que ele decide qual tocar. */}
      <div className="flex flex-col items-center justify-center px-1 text-center leading-tight">
        <span className="text-xs text-[var(--muted-foreground)]">precisamos</span>
        <span className="whitespace-nowrap">
          <span className="num-display text-xl font-semibold">
            {formatAmount(i.quantidade)}
          </span>{" "}
          <span className="text-base text-[var(--muted-foreground)]">{unidade}</span>
        </span>
      </div>
        <button
          type="button"
          aria-pressed={aberto}
          aria-expanded={aberto}
          onClick={() => {
            if (!aberto) {
              // O retrato antes da sugestão: Cancelar volta à caixa vazia.
              retratar(false);
              set.sugerirPreco();
            }
            set.aberto(!aberto, true);
          }}
          /* Neutros, com só o ícone na cor — três botões cheios por item viravam
             uma salada de cores na lista. Aberto, o Tenho fica verde cheio. */
          className={`${BOTAO_DA_RESPOSTA} aria-pressed:border-[var(--ok-strong)] aria-pressed:bg-[var(--ok-strong)] aria-pressed:text-white [&[aria-pressed=true]_svg]:text-white`}
        >
          <Check aria-hidden className="size-4 shrink-0 text-[var(--ok-strong)]" />
          Tenho
        </button>
        <button
          type="button"
          onClick={() => {
            set.recusa("SEM_ESTOQUE");
            aoResponder();
          }}
          className={BOTAO_DA_RESPOSTA}
        >
          <PackageX aria-hidden className="size-4 shrink-0 text-[var(--warn)]" />
          Sem estoque
        </button>
        <button
          type="button"
          onClick={() => {
            set.recusa("NAO_TRABALHA");
            aoResponder();
          }}
          className={BOTAO_DA_RESPOSTA}
        >
          <Ban aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          Não trabalho
        </button>
      </div>

      {aberto && (
      <>

      {/* Primeiro as especificações: se ele não atende uma obrigatória, não
          adianta digitar preço. "Não" numa obrigatória fecha o item como "não
          trabalho com isso", com o motivo na observação — a casa lê por que ele
          disse não, em vez de um preço que ela recusaria na entrega. */}
      {i.especificacoes.length > 0 && (
        /* Uma linha por especificação: o texto à esquerda, Sim/Não colados à
           direita. Era pergunta em cima e dois botões grandes embaixo — três
           linhas de altura por especificação, e o formulário parecia outro. */
        <div className={ETAPA}>
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {i.especificacoes.map((e) => {
            const atende = atendeEspec[chaveDaEspecificacao(e.texto)];
            const Icone = e.obrigatoria ? Lock : LockOpen;
            return (
              <div key={e.texto} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
                  <Icone
                    aria-hidden
                    className={`size-4 shrink-0 ${e.obrigatoria ? "text-[var(--primary)]" : "text-[var(--warn)]"}`}
                  />
                  <span className="min-w-0">
                    {e.texto}?{e.obrigatoria && <Obrigatorio />}
                    <span className="sr-only">{e.obrigatoria ? " (exigido)" : " (preferência)"}</span>
                  </span>
                </span>
                {/* Sim e Não colados, como um interruptor: é uma escolha só. */}
                <span
                  role="group"
                  data-sombra
                  aria-label={`O produto é ${e.texto.toLowerCase()}?`}
                  className={`inline-flex shrink-0 overflow-hidden rounded-lg border ${
                    e.obrigatoria && atende === undefined
                      ? "border-[var(--primary)]/50"
                      : "border-[var(--muted-foreground)]/60"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={atende === true}
                    onClick={() => set.espec(e.texto, true)}
                    className="min-h-8 px-4 text-base font-medium aria-pressed:bg-[var(--ok-strong)] aria-pressed:text-white"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    aria-pressed={atende === false}
                    onClick={() => {
                      set.espec(e.texto, false);
                      if (e.obrigatoria) {
                        set.obs(`Não atende: ${e.texto.toLowerCase()}`);
                        set.recusa("NAO_TRABALHA");
                        aoResponder();
                      }
                    }}
                    className="min-h-8 border-l border-[var(--muted-foreground)]/60 px-4 text-base font-medium aria-pressed:bg-[var(--warn)] aria-pressed:text-white"
                  >
                    Não
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        </div>
      )}

      <div className={ETAPA}>
        <ValorEEmbalagem
          unit={i.unidade}
          nome={i.nome}
          preco={preco}
          embalagem={embalagem}
          aoMudarPreco={set.preco}
          aoMudarEmbalagem={set.embalagem}
          autoFocus={focarValor}
          ultimaVez={i.ultimaVez}
        />
      </div>

      {/* A conta aparecendo é o que dá confiança nela: ele confere se o número
          que sai bate com o que tinha na cabeça. */}
      {/* A conta aparecendo é o que pega o engano: o preço da embalagem sai
          dele, e ele confere se bate com a tabela dele. */}
      {porUnidade !== null && (
        <p className="mt-3 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-base">
          {embalagem.chip !== "" && conteudo !== null && (
            <>
              {embalagem.chip} de {formatAmount(conteudo)} {unidade} sai{" "}
              <strong className="num-display text-base">{formatMoney(porUnidade * conteudo)}</strong>
              <br />
            </>
          )}
          <span className="text-[var(--muted-foreground)]">
            {formatAmount(i.quantidade)} {unidade} × {formatMoney(porUnidade)} ={" "}
          </span>
          <strong className="num-display text-base">{formatMoney(porUnidade * i.quantidade)}</strong>
        </p>
      )}

      <div className={ETAPA}>
        <SeletorDeMarca
          marcas={i.marcas}
          aceitaSimilar={i.aceitaSimilar}
          valor={marca}
          aoMudar={set.marca}
          obrigatoria
        />
        {/* A marca da última vez já vem escolhida; a frase diz de onde veio,
            enquanto for ela. Trocou, some. */}
        {i.ultimaVez?.marca && marca === i.ultimaVez.marca && (
          <span className="mt-1.5 block text-sm text-[var(--warn)]">
            Marca da última vez. Confira ou troque.
          </span>
        )}
      </div>

      {/* Preço por volume, no fim e opcional. Ele negociava isso por
          telefone depois da cotação, e a conversa não ficava em lugar
          nenhum. A quantidade e o valor na mesma medida do preço lá de cima
          — se cotou a caixa, é "acima de 10 caixas, a caixa fica R$ 115". */}
      {/* Escondido atrás de um link: é opcional e pouco usado, e aberto
          sempre fazia cada item ocupar uma tela inteira no celular. Já vem
          aberto quando a resposta anterior tinha desconto. `details` guarda
          o que foi digitado ao fechar. */}
      <details className={`${ETAPA} group/desconto`} open={desconto.acima !== "" || desconto.preco !== ""}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--primary)] [&::-webkit-details-marker]:hidden">
        <span className="group-open/desconto:hidden">+ Preço melhor por quantidade</span>
        <span className="hidden group-open/desconto:inline">− Preço melhor por quantidade</span>{" "}
        <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
      </summary>
      <div className="mt-2 rounded-lg bg-[var(--ok-soft)] p-3 text-left">

        <div className="space-y-3">
          <div>
          <label htmlFor={`acima-${i.id}`} className="mb-1.5 block text-base">
            A partir de quantos {medidaDoPreco}?
          </label>
          <span className="flex items-center gap-2">
            <Input
              id={`acima-${i.id}`}
              inputMode="decimal"
              enterKeyHint="next"
              value={desconto.acima}
              onChange={(e) => set.desconto({ acima: e.target.value })}
              className="num-display h-9 w-20 text-center text-lg"
            />
            <span className="text-base">{medidaDoPreco}</span>
          </span>
          </div>

          <div>
          <label htmlFor={`cada-${i.id}`} className="mb-1.5 block text-base">
            Quanto fica <strong>o {unidade}</strong>?
          </label>
          <span className="relative block w-56 max-w-full">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-[var(--muted-foreground)]">
              R$
            </span>
            <Input
              id={`cada-${i.id}`}
              inputMode="decimal"
              enterKeyHint="done"
              value={desconto.preco}
              onChange={(e) => set.desconto({ preco: e.target.value })}
              className="num-display h-9 w-full pl-9 text-right text-lg"
            />
          </span>
          </div>
        </div>

        {/* A conta, numa linha própria e separada. É o que pega o erro de
            digitar o total no lugar do preço de cada um: o número passa do
            preço normal, e o aviso diz o que fazer. */}
        {acimaDe !== null && acimaDe > 0 && valorComDesconto !== null && valorComDesconto > 0 && (
          valorNormal !== null && valorComDesconto >= valorNormal ? (
            <p className="mt-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm leading-relaxed font-semibold text-[var(--destructive)]">
              {formatMoney(valorComDesconto)} é mais que o preço normal do {unidade} (
              {formatMoney(valorNormal)}). Coloque o preço do {unidade.toUpperCase()}, não o total.
            </p>
          ) : (
            <p className="mt-4 border-t border-[var(--ok-strong)]/30 pt-3 text-sm leading-relaxed text-[var(--ok-strong)]">
              {conteudo !== null && (
                <>
                  {formatAmount(acimaDe)} {medidaDoPreco} = <strong>{formatMoney(acimaDe * conteudo * valorComDesconto)}</strong>
                  <br />
                </>
              )}
              {valorNormal !== null && (
                <>
                  em vez de {formatMoney(valorNormal)} o {unidade}, sai {formatMoney(valorComDesconto)}
                </>
              )}
            </p>
          )
        )}
      </div>
      </details>

      {falta && (
        <p role="alert" className="mt-2 text-sm text-[var(--destructive)]">
          {falta}
        </p>
      )}

      {/* Verde, e não o vinho dos outros botões: é o único que fecha o item
          com preço. As recusas ficaram lá em cima, junto do "Tenho". */}
      <div className={`${ETAPA} flex gap-2`}>
        <button
          type="button"
          onClick={concluir}
          className="rounded-lg bg-[var(--botao)] px-6 py-2 text-base font-semibold text-[var(--botao-texto)] hover:opacity-90"
        >
          Salvar
        </button>
        {/* Volta o item como estava antes de abrir: fechado e sem o que foi
            digitado agora, ou com a resposta de antes, se veio do "alterar". */}
        <button
          type="button"
          onClick={cancelar}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-2 text-base font-semibold hover:border-[var(--primary)]"
        >
          Cancelar
        </button>
      </div>
      </>
      )}
    </li>
  );
}

/**
 * Qual o valor, esse valor é de quê, e o que vem dentro — a mesma pergunta
 * no produto pedido e no produto que ele oferece por conta própria. Duas
 * grafias dela seriam duas regras para o mesmo fornecedor na mesma tela.
 */
function ValorEEmbalagem({
  unit,
  nome,
  preco,
  embalagem,
  aoMudarPreco,
  aoMudarEmbalagem,
  autoFocus = false,
  ultimaVez = null,
}: {
  unit: ProductUnit;
  /** O nome do produto, para o exemplo ("pacote de 5 kg de arroz"). */
  nome: string;
  preco: string;
  embalagem: Embalagem;
  aoMudarPreco: (v: string) => void;
  aoMudarEmbalagem: (v: Partial<Embalagem>) => void;
  autoFocus?: boolean;
  /** O que ele cobrou da última vez, em outra cotação. */
  ultimaVez?: { preco: number; embalagem: string; marca: string | null } | null;
}) {
  const unidade = UNIT_LABEL[unit];

  return (
    <>
    {/* Na ordem da cabeça dele: qual o valor, esse valor é de quê, e o que
        vem dentro. A conta para a unidade da casa é do sistema (ver
        `lib/embalagem.ts`) — era ela que fazia um fornecedor mandar o preço
        do kg, outro o do pacote e outro o da caixa, sem se comparar. */}
    <div className="space-y-3">
      <label className="block text-sm">
        {/* Sempre o da unidade da casa (decisão do dono): com "qual o valor"
            solto, ele digitava o do kg e marcava a caixa embaixo, e a conta
            dividia de novo. A embalagem é só como ele vende. */}
        <span className="mb-1.5 block text-base font-semibold">
          Qual o valor de 1 {unidade}?<Obrigatorio />
        </span>
        {/* O "R$" dentro da caixa e sem número de exemplo: um "0,00" cinza
            parecia valor já preenchido. */}
        <span className="relative block w-56 max-w-full shrink-0">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-[var(--muted-foreground)]">
            R$
          </span>
          <Input
            inputMode="decimal"
            enterKeyHint="next"
            /* Aberto pelo "Tenho", o teclado numérico já sobe: tocar no
               campo depois era um toque a mais em cada item. Pelo "alterar"
               não — o teclado cobriria o que ele veio conferir. */
            autoFocus={autoFocus}
            // Seleciona o número todo: se o preço mudou, ele digita por cima
            // do valor da última vez, sem ter de apagar.
            onFocus={(e) => e.currentTarget.select()}
            value={preco}
            onChange={(e) => aoMudarPreco(e.target.value)}
            aria-required
            className={`num-display h-11 w-full pl-10 text-right text-2xl ${classeObrigatoria(preco)}`}
          />
        </span>
        {/* O valor da última vez entra sozinho quando ele abre o produto. A
            frase diz de onde veio, enquanto for ele: mudou o número, some. */}
        {ultimaVez && lerNumeroBR(preco) === ultimaVez.preco && (
          <span className="mt-1.5 block text-sm text-[var(--warn)]">
            Valor do {unidade} da última vez. Confira ou digite o novo.
          </span>
        )}
      </label>

      {/* O "1 kg" já vem marcado porque é o caso mais comum: quem cota pela
          unidade da casa digita o valor e acabou, sem toque nenhum a mais. */}
      <div className="text-sm">
        <span className="mb-1.5 block text-base font-semibold">Como você vende?</span>
        <div className="flex flex-wrap gap-1.5">
          {["", ...chipsDe(unit, embalagem.chip)].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={embalagem.chip === c}
              onClick={() =>
                aoMudarEmbalagem({ chip: c, quantidade: quantidadeAoTrocar(embalagem, c, unit) })
              }
              className="chip min-h-8 border-[var(--muted-foreground)]/60 px-2.5 py-1.5 text-base"
            >
              {c === "" ? `1 ${unidade}` : c}
            </button>
          ))}
        </div>
      </div>

      {/* Só existe quando a resposta anterior foi uma embalagem.

          Pacote, garrafa e galão são UMA coisa: a pergunta é quanto
          ela tem, um número só. Caixa e fardo juntam várias: aí são duas
          perguntas, cada uma com o seu rótulo — quantas vêm e quanto tem
          cada uma. Antes era "[1] × [  ] kg" para todas, e o 1 sem rótulo
          fazia quem cotava pacote de 5 kg não saber onde pôr o 5.

          A medida é a dele: 500 g vira 0,5 kg aqui, e não na cabeça dele.
          Contagem (un, cx, dz…) é sempre um número só. */}
      {embalagem.chip !== "" && familiaDe(unit) === "contagem" && (
        <label className="block text-sm">
          <span className="mb-1.5 block text-base font-semibold">
            Quantas {unidade} vêm em cada {embalagem.chip.toLowerCase()}?<Obrigatorio />
          </span>
          {/* O exemplo mora junto da caixa que ele explica, e não embaixo dos
              botões de embalagem: é aqui que a dúvida aparece. */}
          <span className="mb-2 block text-sm text-[var(--muted-foreground)] italic">
                Ex.: {exemploDaEmbalagem(embalagem.chip, unit, nome)}
              </span>
          <span className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={embalagem.quantidade}
              enterKeyHint="next"
              onChange={(e) => aoMudarEmbalagem({ quantidade: e.target.value })}
              aria-required
              className={`num-display h-8 w-20 text-right text-lg ${classeObrigatoria(embalagem.quantidade)}`}
            />
            <span className="text-base">{unidade}</span>
          </span>
        </label>
      )}

      {embalagem.chip !== "" && familiaDe(unit) !== "contagem" && (
        <div className="space-y-3">
          {agrupa(embalagem.chip) && (
            <label className="block text-sm">
              <span className="mb-1.5 block text-base font-semibold">
                Quantas unidades vêm em cada {embalagem.chip.toLowerCase()}?<Obrigatorio />
              </span>
              <span className="mb-2 block text-sm text-[var(--muted-foreground)] italic">
                Ex.: {exemploDaEmbalagem(embalagem.chip, unit, nome)}
              </span>
              <Input
                inputMode="decimal"
                value={embalagem.quantidade}
                enterKeyHint="next"
                onChange={(e) => aoMudarEmbalagem({ quantidade: e.target.value })}
                aria-required
                className={`num-display h-8 w-20 text-right text-lg ${classeObrigatoria(embalagem.quantidade)}`}
              />
            </label>
          )}
          <div className="text-sm">
            <span className="mb-1.5 block text-base font-semibold">
              {agrupa(embalagem.chip)
                ? "E quanto tem cada unidade?"
                : `Quanto tem em cada ${embalagem.chip.toLowerCase()}?`}
              <Obrigatorio />
            </span>
            {!agrupa(embalagem.chip) && (
              <span className="mb-2 block text-sm text-[var(--muted-foreground)] italic">
                Ex.: {exemploDaEmbalagem(embalagem.chip, unit, nome)}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                aria-label={
                  agrupa(embalagem.chip)
                    ? "Quanto tem cada unidade"
                    : `Quanto tem em cada ${embalagem.chip.toLowerCase()}`
                }
                value={embalagem.tamanho}
                enterKeyHint="next"
                onChange={(e) => aoMudarEmbalagem({ tamanho: e.target.value })}
                aria-required
                className={`num-display h-8 w-20 text-right text-lg ${classeObrigatoria(embalagem.tamanho)}`}
              />
              {MEDIDAS[familiaDe(unit)].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={embalagem.medida === m}
                  onClick={() => aoMudarEmbalagem({ medida: m })}
                  className="chip min-h-8 border-[var(--muted-foreground)]/60 px-2.5 py-1.5 text-base"
                >
                  {m}
                </button>
              ))}
            </span>
          </div>
          {/* Em palavras, para ele conferir que o sistema entendeu:
              "caixa com 10 de 1 kg = 10 kg". */}
          {conteudoNaCasa(embalagem, unit) !== null && (
            <p className="text-base text-[var(--muted-foreground)]">
              {embalagem.chip} com{" "}
              {agrupa(embalagem.chip)
                ? `${embalagem.quantidade} de ${embalagem.tamanho} ${embalagem.medida}`
                : `${embalagem.tamanho} ${embalagem.medida}`}{" "}
              = {formatAmount(conteudoNaCasa(embalagem, unit))} {unidade}
            </p>
          )}
        </div>
      )}
    </div>
    </>
  );
}

/**
 * Um produto que ele tem e a casa nunca pediu.
 *
 * A unidade é pergunta dele porque é ela que dá sentido ao resto: "fardo com
 * 12" não quer dizer nada até saber 12 do quê. A casa é quem conta em un e
 * kg, então as opções são as da casa — não as do catálogo dele.
 *
 * Nada daqui vira cadastro sozinho. É uma oferta esperando resposta, e a
 * tela diz isso em vez de deixar ele achar que pediu.
 */
function Oferta({
  o,
  aoMudar,
  aoRemover,
}: {
  o: OfertaNova;
  aoMudar: (mudanca: Partial<OfertaNova>) => void;
  aoRemover: () => void;
}) {
  const unidade = UNIT_LABEL[o.unit];
  const valor = lerNumeroBR(o.preco);
  const conteudo = conteudoNaCasa(o.emb, o.unit);
  // Ele digita o da unidade; a embalagem sai multiplicada.
  const porUnidade = valor !== null && valor > 0 && conteudo !== null ? valor : null;

  return (
    <li className="card px-3 py-2.5">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1.5 block text-base font-semibold">
            Que produto é?<Obrigatorio />
          </span>
          <Input
            placeholder="ex: azeite extra virgem"
            enterKeyHint="next"
            maxLength={120}
            value={o.nome}
            onChange={(e) => aoMudar({ nome: e.target.value })}
            aria-required
            className={`h-8 w-full text-lg ${classeObrigatoria(o.nome)}`}
          />
        </label>
        <button
          type="button"
          onClick={aoRemover}
          aria-label={`Remover ${o.nome || "esta oferta"}`}
          className="mt-5 px-2 py-2 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
        >
          ✕
        </button>
      </div>

      {/* A unidade vem antes do preço porque é ela que decide os botões de
          baixo: produto em kg oferece pacote de kg ou g, em litro oferece
          garrafa e galão. Trocar a unidade zera a embalagem — um "pacote de
          500 g" não quer dizer nada num produto contado em un. */}
      <label className={`${ETAPA} block text-sm`}>
        <span className="mb-1.5 block text-base font-semibold">Como a gente mede?</span>
        <select
          value={o.unit}
          onChange={(e) => {
            const unit = e.target.value as ProductUnit;
            aoMudar({ unit, emb: embalagemVazia(unit) });
          }}
          className="field h-8 w-32 bg-[var(--surface)] py-0 text-lg"
        >
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </label>

      <div className={ETAPA}>
        <ValorEEmbalagem
          unit={o.unit}
          nome={o.nome}
          preco={o.preco}
          embalagem={o.emb}
          aoMudarPreco={(preco) => aoMudar({ preco })}
          aoMudarEmbalagem={(v) => aoMudar({ emb: { ...o.emb, ...v } })}
        />
      </div>

      {porUnidade !== null && o.emb.chip !== "" && conteudo !== null && (
        <p className="mt-3 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-base">
          {o.emb.chip} de {formatAmount(conteudo)} {unidade} sai{" "}
          <strong className="num-display text-base">{formatMoney(porUnidade * conteudo)}</strong>
        </p>
      )}

      <div className={ETAPA}>
        <label className="text-sm">
          <span className="mb-1.5 block text-base font-semibold">
            Marca do produto<Obrigatorio />
          </span>
          <Input
            placeholder="qual marca?"
            enterKeyHint="next"
            maxLength={120}
            value={o.marca}
            onChange={(e) => aoMudar({ marca: e.target.value })}
            aria-required
            className={`h-8 w-full text-lg ${classeObrigatoria(o.marca)}`}
          />
        </label>
      </div>
    </li>
  );
}
