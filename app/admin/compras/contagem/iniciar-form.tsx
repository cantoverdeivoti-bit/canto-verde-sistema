"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CaixaMestre } from "@/components/ui/caixa-mestre";
import { Input } from "@/components/ui/input";
import { abrirContagem } from "@/lib/actions/contagem";
import { plural } from "@/lib/format";

type CategoriaOpcao = { id: number; name: string; produtos: number };
type PessoaOpcao = { id: number; nome: string };

/**
 * A cor da ação que leva adiante.
 *
 * O tamanho `sm` do `Button` traz `bg-[var(--surface)]` no próprio tamanho
 * (components/ui/button.tsx), e o `cn` resolve conflito pelo último — então
 * ele apaga a cor da variante, e "Próxima etapa", "Voltar" e "Cancelar"
 * saem os três iguais. A `className` da chamada entra depois de tudo, e é
 * por aqui que a ação principal recupera o vinho.
 */
const ADIANTE =
  "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)] hover:opacity-90 hover:border-[var(--botao)]";

/**
 * A ficha do assistente: menor que a `.chip` da casa, e mais fraca quando
 * marcada.
 *
 * O tamanho base da `.chip` é grande porque ela nasceu na tela pública de
 * reserva, onde o alvo é o dedo. Aqui é painel, e catorze fichas grandes
 * viravam três fileiras. Reduzir na classe global encolheria a reserva
 * junto, então reduz-se aqui — como `new-reservation.tsx` e
 * `suppliers-list.tsx` já fazem.
 *
 * Marcada, a `.chip` fica vinho sólido com texto claro, e o número de
 * produtos que vem dentro dela (em cinza de apoio) sumia no fundo escuro.
 * O tingido claro do `--accent` resolve as duas coisas: destaca menos e
 * deixa o número legível. As utilitárias `aria-pressed:` vencem a regra da
 * `.chip` porque a camada de utilitários do Tailwind vem depois da de
 * componentes.
 */
const FICHA =
  "chip px-2.5 py-1.5 text-sm aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--primary)]";

/** Os atalhos que resolvem o caso comum sem ninguém abrir calendário. */
const ATALHOS = [
  { horas: 6, rotulo: "6 horas" },
  { horas: 12, rotulo: "12 horas" },
  { horas: 24, rotulo: "24 horas" },
];

/** Data-hora local no formato que o `<input type="datetime-local">` entende. */
function paraCampoLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function quandoEm(horas: number) {
  return paraCampoLocal(new Date(Date.now() + horas * 60 * 60 * 1000));
}

/** "amanhã 18:00" — como se fala, e não "08/09/2026 18:00". */
function comoSeFala(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia(d, hoje)) return `hoje ${hora}`;
  if (mesmoDia(d, amanha)) return `amanhã ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/**
 * Um trecho da frase: escrito quando decidido, lacuna quando não.
 *
 * No escopo do módulo, e não dentro de IniciarContagem. Definido lá dentro,
 * seria uma função nova a cada render — o React trataria como outro tipo de
 * componente e remontaria o botão a cada tecla. É a mesma razão pela qual a
 * linha da grade de produtos mora fora do componente que a lista.
 */
function Trecho({
  valor,
  vazio,
  vaiPara,
  etapa,
  ir,
}: {
  valor: string | null;
  vazio: string;
  vaiPara: number;
  etapa: number;
  ir: (n: number) => void;
}) {
  // Etapa futura não é atalho: quem não escolheu quem conta não pula para o
  // prazo. Só o que já foi decidido leva de volta.
  if (vaiPara > etapa && valor === null) {
    return <span className="text-[var(--muted-foreground)]">{vazio}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => ir(vaiPara)}
      className={
        valor
          ? "font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
          : "text-[var(--muted-foreground)] underline-offset-4 hover:underline"
      }
    >
      {valor ?? vazio}
    </button>
  );
}

/**
 * Pedir a contagem em três decisões: quem conta, o que conta, até quando.
 *
 * O indicador de progresso é uma FRASE, não bolinhas 01-02-03 — mesmo padrão
 * do formulário público de reserva (app/reservation-form.tsx). O que já foi
 * decidido aparece escrito e tocável; o que falta aparece como lacuna. O mesmo
 * objeto é formulário, resumo e mapa de onde se está.
 *
 * Duas gramáticas de "onde estou" no mesmo sistema fariam cada tela parecer de
 * um produto diferente, então esta segue a que já existe.
 */
export function IniciarContagem({
  categorias,
  pessoas,
  abertas = [],
}: {
  categorias: CategoriaOpcao[];
  pessoas: PessoaOpcao[];
  /** As contagens ainda abertas: pedir outra por cima costuma ser engano. */
  abertas?: { responsavel: string | null; abertaEm: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState(1);

  const [responsavelId, setResponsavelId] = useState<number | null>(null);
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [expiraEm, setExpiraEm] = useState(() => quandoEm(12));
  const [dataAberta, setDataAberta] = useState(false);
  // Se a pessoa já chegou na etapa do prazo.
  //
  // O prazo sempre TEM valor (nasce em 12h), mas antes de ela ver a etapa
  // esse valor é um padrão, não uma decisão — e escrevê-lo na frase seria a
  // tela afirmando algo que ninguém escolheu. Depois de vista, vira decisão e
  // fica escrita: voltar para trocar quem conta não pode apagar da frase o
  // que já estava resolvido.
  const [prazoVisto, setPrazoVisto] = useState(false);

  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Qualquer caminho até a etapa 3 marca o prazo como decidido — o botão
  // "Próxima etapa", a frase, ou o "Voltar" vindo de fora.
  //
  // Ajuste de estado durante o render, e não num efeito, de propósito: é o
  // padrão que o React documenta para estado derivado, e a guarda faz ele
  // rodar uma vez só. Num efeito seria um render a mais e cairia na regra de
  // lint que este projeto já viola noutros arquivos — não vale acrescentar
  // mais um caso dela para resolver o que o render resolve.
  if (etapa === 3 && !prazoVisto) setPrazoVisto(true);

  const quemConta = pessoas.find((p) => p.id === responsavelId);
  const escolhidas = categorias.filter((c) => marcadas.includes(c.id));
  const itens = escolhidas.reduce((s, c) => s + c.produtos, 0);

  /**
   * A frase diz os nomes enquanto são poucos, e a conta quando são muitos.
   *
   * Com as catorze categorias marcadas, recitar todas virava um parágrafo de
   * três linhas em vinho carregado no topo da tela — a frase deixava de ser
   * resumo e virava a maior coisa ali. Três é o limite: acima disso ninguém
   * lê a lista, lê quantas são.
   */
  const resumoDasCategorias =
    escolhidas.length === 0
      ? null
      : escolhidas.length <= 3
        ? escolhidas.map((c) => c.name).join(", ")
        : `${escolhidas.length} categorias`;

  function reiniciar() {
    setEtapa(1);
    setResponsavelId(null);
    setMarcadas([]);
    setExpiraEm(quandoEm(12));
    setDataAberta(false);
    setPrazoVisto(false);
    setErro(null);
  }

  function gerar() {
    setErro(null);
    startTransition(async () => {
      const r = await abrirContagem(
        responsavelId!,
        marcadas,
        new Date(expiraEm).toISOString(),
      );
      if (!r.ok) return setErro(r.message);
      setLink(`${window.location.origin}/estoquista/contagem/${r.data.token}`);
      setAberto(false);
      reiniciar();
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o endereço e copie à mão.");
    }
  }

  // O link recém-criado fica na tela até a pessoa sair dela. Ele é o produto
  // desta ação — sumir depois de um aviso rápido obrigaria a caçá-lo na lista.
  if (link) {
    return (
      <div className="card space-y-3 p-2.5">
        <p className="text-sm font-medium">Link da contagem</p>
        <p className="break-all rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs">
          {link}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={copiar}>
            {copiado ? "Copiado" : "Copiar link"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Contagem de estoque: ${link}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            Mandar no WhatsApp
          </a>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLink(null)}>
            Fechar
          </Button>
        </div>
        <p className="hint m-0">
          Mande para quem vai contar. Ele não precisa de senha — quem tem o
          endereço, conta.
        </p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button type="button" onClick={() => setAberto(true)}>
        Solicitar contagem
      </Button>
    );
  }

  return (
    <div className="card space-y-4 p-2.5">
      {abertas.length > 0 && (
        <p role="note" className="rounded-lg px-2.5 py-2 text-sm" style={{ background: "var(--warn-soft)" }}>
          {abertas.length === 1
            ? `Já tem uma contagem aberta${abertas[0].responsavel ? ` com ${abertas[0].responsavel}` : ""} (${abertas[0].abertaEm}).`
            : `Já tem ${abertas.length} contagens abertas.`}{" "}
          Se for para continuar aquela, use o link dela em vez de pedir outra.
        </p>
      )}
      {/* A frase é o indicador de progresso e o resumo, ao mesmo tempo. */}
      <p className="text-sm">
        Contar{" "}
        <Trecho
          valor={resumoDasCategorias}
          vazio="o quê?"
          vaiPara={2}
          etapa={etapa}
          ir={setEtapa}
        />{" "}
        com{" "}
        <Trecho valor={quemConta?.nome ?? null} vazio="quem?" vaiPara={1} etapa={etapa} ir={setEtapa} />, até{" "}
        <Trecho
          valor={prazoVisto ? comoSeFala(expiraEm) : null}
          vazio="quando?"
          vaiPara={3}
          etapa={etapa}
          ir={setEtapa}
        />
      </p>

      <div className="border-t border-[var(--border)] pt-4">
        {etapa === 1 && (
          <>
            <p className="text-sm font-medium">Quem vai contar?</p>
            {pessoas.length === 0 ? (
              <p className="hint">
                Nenhuma conta ativa além da sua — cadastre a equipe em
                Configurações gerais.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {pessoas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setResponsavelId(p.id);
                        setEtapa(2);
                      }}
                      aria-pressed={responsavelId === p.id}
                      className={FICHA}
                    >
                      {p.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {etapa === 2 && (
          <>
            <p className="text-sm font-medium">O que vai ser contado?</p>
            {categorias.length === 0 ? (
              <p className="hint">
                Nenhuma categoria tem produto ativo — cadastre produtos antes de
                mandar alguém contar.
              </p>
            ) : (
              <>
                {/* Encostado nas fichas, à esquerda, e não jogado na outra
                    ponta do título: ele manda nelas, e comando longe do que
                    comanda fica parecendo enfeite. */}
                <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                  <CaixaMestre
                    marcados={marcadas.length}
                    total={categorias.length}
                    rotulo="Marcar todas as categorias"
                    onChange={(marcar) =>
                      setMarcadas(marcar ? categorias.map((c) => c.id) : [])
                    }
                  />
                  marcar tudo
                </label>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {categorias.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setMarcadas((a) =>
                          a.includes(c.id)
                            ? a.filter((x) => x !== c.id)
                            : [...a, c.id],
                        )
                      }
                      aria-pressed={marcadas.includes(c.id)}
                      className={FICHA}
                    >
                      {c.name}
                      <span className="ml-1.5 text-[var(--muted-foreground)]">
                        {c.produtos}
                      </span>
                    </button>
                  </li>
                ))}
                </ul>
              </>
            )}
          </>
        )}

        {etapa === 3 && (
          <>
            <p className="text-sm font-medium">Até quando o link fica aberto?</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {ATALHOS.map((a) => (
                <li key={a.horas}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpiraEm(quandoEm(a.horas));
                      setDataAberta(false);
                    }}
                    aria-pressed={!dataAberta && expiraEm === quandoEm(a.horas)}
                    className={FICHA}
                  >
                    {a.rotulo}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setDataAberta(true)}
                  aria-pressed={dataAberta}
                  className={FICHA}
                >
                  outra data
                </button>
              </li>
            </ul>

            {dataAberta && (
              <label className="mt-3 block text-xs">
                <span className="mb-0.5 block font-medium">Data e hora</span>
                <Input
                  type="datetime-local"
                  value={expiraEm}
                  min={paraCampoLocal(new Date())}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  className="h-[30px] w-auto px-1.5"
                />
              </label>
            )}

            <p className="hint">
              Depois disso ele para de abrir, mesmo sem a contagem ter sido
              finalizada. Finalizar também vence o link, antes da hora.
            </p>
          </>
        )}
      </div>

      {erro && (
        <p role="alert" className="msg-error m-0">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        {etapa < 3 ? (
          <Button
            type="button"
            size="sm"
            className={ADIANTE}
            disabled={
              (etapa === 1 && responsavelId === null) ||
              (etapa === 2 && marcadas.length === 0)
            }
            onClick={() => setEtapa(etapa + 1)}
          >
            Próxima etapa
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className={ADIANTE}
            disabled={pendente || !responsavelId || marcadas.length === 0}
            onClick={gerar}
          >
            {pendente ? "Gerando…" : "Gerar link"}
          </Button>
        )}

        {/* "Voltar" existe em toda etapa. Na primeira não há etapa anterior —
            o que há antes é a tela fechada — então lá ele fecha o assistente,
            e o "Cancelar" some para não virar botão gêmeo dizendo o mesmo. */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            if (etapa > 1) return setEtapa(etapa - 1);
            setAberto(false);
            reiniciar();
          }}
        >
          Voltar
        </Button>

        {etapa > 1 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAberto(false);
              reiniciar();
            }}
          >
            Cancelar
          </Button>
        )}

        {marcadas.length > 0 && (
          <p className="ml-auto text-xs text-[var(--muted-foreground)]">
            {plural(itens, "item", "itens")} para contar
          </p>
        )}
      </div>
    </div>
  );
}
