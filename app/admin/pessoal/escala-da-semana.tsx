"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Lock,
  LockOpen,
  MessageCircle,
  Printer,
  Building2,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { Gaveta } from "@/components/gaveta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  definirPosto,
  fecharPosto,
  salvarColaborador,
  voltarAoFixo,
  type QuemNoPosto,
} from "@/lib/actions/pessoal";
import { diaDaSemana, trabalhaNoDiaDaSemana, type Area } from "@/lib/escala";
import { chave, formatMoney, plural } from "@/lib/format";
import { TIPO, type TipoContrato } from "@/lib/tipos-de-contrato";
import { pdfDe } from "@/lib/pdf-da-pagina";

import { COLABORADOR_VAZIO } from "./colaboradores/colaborador-form";
import { EscolhaDeContrato } from "./escolha-de-contrato";

type CelulaNaTela = {
  colaboradorId: number | null;
  /** A empresa terceirizada no posto. */
  terceirizadoId: number | null;
  nome: string | null;
  origem: "fixa" | "dia" | "livre";
  /** "Valdete de férias": quem deveria estar e por que não está. */
  ausente: string | null;
  /** O posto não existe neste dia (o bar de segunda a sexta). */
  fechado: boolean;
};

/**
 * A caixa do posto vazio: amarela, para o buraco na escala saltar na grade
 * (pedido do dono). O posto fechado fica branco, só com o cadeado: não pede
 * ninguém. O amarelo é misturado ao fundo do cartão para funcionar no tema
 * claro e no escuro.
 */
const CAIXA_VAZIA: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, #facc15 45%, var(--card))",
};
const estiloDa = (c: CelulaNaTela) => (!c.fechado && !c.nome ? CAIXA_VAZIA : undefined);

export type DadosDaEscala = {
  titulo: string;
  anterior: string;
  seguinte: string;
  atual: boolean;
  dias: { data: string; sigla: string; extenso: string; ddmm: string; hoje: boolean }[];
  areas: { area: Area; nome: string; postos: { id: number; nome: string; celulas: CelulaNaTela[] }[] }[];
  folgas: string[][];
  /** Por dia, quem ganha por mês, está no dia de trabalho e ficou sem posto. */
  semPosto: string[][];
  ferias: string[][];
  avisos: string[];
  pessoas: { id: number; nome: string; tipo: TipoContrato; area: Area | null; diasDeTrabalho: number[] }[];
  /** As empresas terceirizadas ativas: entram no fim da lista de escolha. */
  terceirizados: { id: number; nome: string; area: Area | null }[];
  custo: {
    free: number;
    diarias: number;
    freeSemValor: number;
    clt: number;
    total: number;
    porDia: { free: number; diarias: number; clt: number; total: number }[];
    /** O orçamento de cada dia (meta do CMO × faturamento ÷ dias do mês). Nulo sem meta ou faturamento. */
    orcamentoPorDia: (number | null)[];
    orcamento: number | null;
    meta: number | null;
  } | null;
  textoWhatsApp: string;
  semColaboradores: boolean;
};

type Escolhendo = { postoId: number; postoNome: string; area: Area; dia: number };

/**
 * A semana na tela, como a planilha: a grade dos sete dias em todo tamanho de
 * tela. No celular ela rola para o lado, quatro dias por vez, com a coluna
 * dos postos presa e a de hoje à vista (o dono quer a semana inteira, e não
 * um dia por vez). Tocar num posto abre a lista de quem pode ficar nele, e a
 * escolha vale só naquele dia ou toda semana.
 */
export function EscalaDaSemana({ dados }: { dados: DadosDaEscala }) {
  const [escolhendo, setEscolhendo] = useState<Escolhendo | null>(null);
  const grade = useRef<HTMLDivElement>(null);

  // Abre com a coluna de hoje à vista quando a grade não cabe inteira na tela.
  useEffect(() => {
    const el = grade.current;
    const hoje = el?.querySelector<HTMLElement>("th[data-hoje]");
    const postos = el?.querySelector<HTMLElement>("thead th");
    if (el && hoje && postos && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, hoje.offsetLeft - postos.offsetWidth);
  }, [dados.titulo]);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(dados.textoWhatsApp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(dados.textoWhatsApp)}`, "_blank", "noopener");
    }
  }

  const abrir = (postoId: number, postoNome: string, area: Area, d: number) =>
    setEscolhendo({ postoId, postoNome, area, dia: d });

  return (
    <Pagina largura="larga">
      {/* Título e a semana, com as setas para trocar. */}
      <CabecalhoDaPagina
        titulo="Escala do almoço"
        subtitulo={
          <>
            Semana de {dados.titulo}
            {dados.atual && " · esta semana"}
          </>
        }
        acoes={
          <div className="flex items-center gap-1">
            <Link
              href={`/admin/pessoal?semana=${dados.anterior}`}
              aria-label="Semana anterior"
              className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </Link>
            {!dados.atual && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/admin/pessoal">Hoje</Link>
              </Button>
            )}
            <Link
              href={`/admin/pessoal?semana=${dados.seguinte}`}
              aria-label="Próxima semana"
              className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
            >
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          </div>
        }
      />

      {dados.semColaboradores && (
        <p className="msg-warn">
          Ninguém cadastrado ainda.{" "}
          <Link href="/admin/pessoal/colaboradores/novo" className="font-semibold underline underline-offset-4">
            Cadastre a equipe
          </Link>{" "}
          para montar a escala.
        </p>
      )}

      {/* Os avisos da semana, antes de tudo: é o que pede ação. */}
      {dados.avisos.length > 0 && (
        <section
          className="rounded-xl border p-3"
          style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)", background: "var(--warn-soft)" }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--warn)" }}>
            <AlertTriangle aria-hidden className="size-4" />
            {plural(dados.avisos.length, "aviso", "avisos")} nesta semana
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {dados.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <CartaoDeBotoes>
        <BotaoQuadrado
          icone={copiado ? Copy : MessageCircle}
          texto={copiado ? "Copiado, cole no grupo" : "Copiar para o WhatsApp"}
          onClick={copiar}
        />
        <BotaoQuadrado icone={Printer} texto="Imprimir" href={pdfDe(`/imprimir/escala?semana=${dados.dias[0].data}`)} baixar />
      </CartaoDeBotoes>

      {/* A grade da semana, como a planilha. No celular e no tablet ela rola
          para o lado, com a coluna dos postos presa à esquerda. */}
      <div ref={grade} className="snap-x snap-mandatory scroll-pl-20 overflow-x-auto sm:scroll-pl-24 lg:scroll-pl-28">
        {/* Largura medida em dias: 4 por tela no celular, 5 no tablet, os 7 no
            computador. Assim a rolagem para sempre na borda de um dia. */}
        <div className="w-[calc(5rem_+_(100%_-_5rem)_*_1.75)] space-y-6 sm:w-[calc(6rem_+_(100%_-_6rem)_*_1.4)] lg:w-full">
          {dados.areas.map((a) => (
            <section key={a.area}>
              <h2 className="section-label sticky left-0 mb-2 w-fit">{a.nome}</h2>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead className="bg-[var(--primary-soft)] text-xs text-[var(--foreground)]">
                    <tr>
                      <th className="sticky left-0 z-10 w-20 bg-[var(--primary-soft)] px-2 py-2 text-left font-semibold shadow-[1px_0_0_var(--border)] sm:w-24 sm:px-3 lg:w-28">
                        Posto
                      </th>
                      {dados.dias.map((d) => (
                        <th
                          key={d.data}
                          data-hoje={d.hoje || undefined}
                          className={`snap-start px-2 py-1.5 text-left font-semibold ${d.hoje ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : ""}`}
                        >
                          <span className="block">{d.sigla}</span>
                          <span className="block text-[11px] font-normal tabular-nums">{d.ddmm}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {a.postos.map((p) => (
                      <tr key={p.id}>
                        <th scope="row" className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] truncate bg-[var(--card)] px-2 py-1 text-left font-medium sm:px-3">
                          {p.nome}
                        </th>
                        {p.celulas.map((c, i) => (
                          <td key={i} className="px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => abrir(p.id, p.nome, a.area, i)}
                              aria-label={`${p.nome}, ${dados.dias[i].extenso}: ${c.fechado ? "fechado" : (c.nome ?? "vazio")}`}
                              className="flex h-7 w-full items-center rounded-md px-1.5 text-left hover:bg-[var(--muted)] sm:px-2"
                              style={estiloDa(c)}
                            >
                              <NomeNaCelula c={c} curto />
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <section>
            <h2 className="section-label sticky left-0 mb-2 w-fit">Folgas e férias</h2>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full table-fixed text-xs sm:text-sm">
                <tbody className="divide-y divide-[var(--border)]">
                  {LINHAS_DA_FOLGA.filter((l) => l.sempre || dados[l.chave].some((nomes) => nomes.length > 0)).map((l) => (
                    <tr key={l.chave}>
                      <th scope="row" className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] w-20 bg-[var(--card)] px-2 py-1.5 text-left align-top font-medium sm:w-24 sm:px-3 lg:w-28">
                        {l.titulo}
                      </th>
                      {dados[l.chave].map((nomes, i) => (
                        <td key={i} className="px-1 py-1.5 align-top">
                          {nomes.length === 0 ? (
                            <span className="px-1 text-[var(--muted-foreground)]">·</span>
                          ) : (
                            <ul className="flex flex-col items-start gap-px">
                              {nomes.map((n) => (
                                <li key={n} className="max-w-full truncate rounded px-1 text-[11px] leading-4 font-medium sm:text-xs sm:leading-5" style={l.estilo}>
                                  {n}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {dados.custo && <CustoDoDia custo={dados.custo} dias={dados.dias} />}
        </div>
      </div>

      {dados.custo && <CustoDaSemana custo={dados.custo} />}

      {escolhendo && (
        <Escolha
          e={escolhendo}
          dados={dados}
          aoFechar={() => setEscolhendo(null)}
        />
      )}
    </Pagina>
  );
}

/** O nome na célula: quem está, ou vazio, ou quem faltou e por quê. */
function NomeNaCelula({ c, curto = false }: { c: CelulaNaTela; curto?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {c.fechado ? (
        <Lock role="img" aria-label="fechado" className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      ) : c.nome ? (
        <span className="truncate font-medium">{c.nome}</span>
      ) : c.ausente ? (
        <span className="truncate text-xs font-medium" style={{ color: "var(--warn)" }}>
          vazio · {c.ausente}
        </span>
      ) : (
        <span className="truncate text-[var(--muted-foreground)]">{curto ? "·" : "vazio"}</span>
      )}
      {/* O ponto marca a troca só deste dia. */}
      {c.origem === "dia" && (
        <span
          aria-label="trocado só neste dia"
          title="Trocado só neste dia"
          className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]"
        />
      )}
    </span>
  );
}

/**
 * Quem não está num posto, em grupos: folga (o dia de descanso), sem posto
 * (era dia de trabalho, pelo cadastro, e ficou sem lugar) e férias. Cada
 * nome numa etiqueta, para não virar uma linha corrida de vírgulas.
 */
const LINHAS_DA_FOLGA: {
  chave: "folgas" | "semPosto" | "ferias";
  titulo: string;
  sempre: boolean;
  estilo: React.CSSProperties;
}[] = [
  { chave: "folgas", titulo: "Folga", sempre: true, estilo: { background: "var(--muted)" } },
  {
    chave: "semPosto",
    titulo: "Sem posto",
    sempre: false,
    estilo: { background: "var(--primary-soft)", color: "var(--primary)" },
  },
  { chave: "ferias", titulo: "Férias", sempre: false, estilo: { background: "var(--warn-soft)", color: "var(--warn)" } },
];

/** O custo de mão de obra de cada dia, na mesma coluna do dia da grade. */
/** Reais inteiros, para caber na coluna do dia: 1172,63 → "1.173". Os centavos ficam nos cartões da semana. */
const reais = (n: number) => Math.round(n).toLocaleString("pt-BR");

function CustoDoDia({ custo, dias }: { custo: NonNullable<DadosDaEscala["custo"]>; dias: DadosDaEscala["dias"] }) {
  return (
    <section>
      <h2 className="section-label sticky left-0 mb-2 w-fit">Custo do dia · em R$</h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <tbody className="divide-y divide-[var(--border)]">
            <tr>
              <th scope="row" className="sticky left-0 z-10 w-20 bg-[var(--card)] px-2 py-1.5 text-left font-medium shadow-[1px_0_0_var(--border)] sm:w-24 sm:px-3 lg:w-28">
                Total
              </th>
              {custo.porDia.map((d, i) => {
                const orc = custo.orcamentoPorDia[i];
                const passou = orc !== null && d.total > orc;
                return (
                  <td
                    key={dias[i].data}
                    className="px-2 py-1.5 font-semibold tabular-nums"
                    style={passou ? { color: "var(--destructive)" } : dias[i].hoje ? { color: "var(--primary)" } : undefined}
                  >
                    {reais(d.total)}
                  </td>
                );
              })}
            </tr>
            {custo.orcamentoPorDia.some((o) => o !== null) && (
              <tr className="text-xs text-[var(--muted-foreground)]">
                <th scope="row" className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] bg-[var(--card)] px-2 py-1.5 text-left font-medium sm:px-3">
                  Orçamento
                </th>
                {custo.orcamentoPorDia.map((o, i) => (
                  <td key={dias[i].data} className="px-2 py-1.5 tabular-nums">
                    {o === null ? "—" : reais(o)}
                  </td>
                ))}
              </tr>
            )}
            <tr className="text-xs text-[var(--muted-foreground)]">
              <th scope="row" className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] bg-[var(--card)] px-2 py-1.5 text-left font-medium sm:px-3">
                Free
              </th>
              {custo.porDia.map((d, i) => (
                <td key={dias[i].data} className="px-2 py-1.5 tabular-nums">
                  {reais(d.free)}
                  <span className="block text-[11px]">{plural(d.diarias, "diária", "diárias")}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustoDaSemana({ custo }: { custo: NonNullable<DadosDaEscala["custo"]> }) {
  const sobra = custo.orcamento === null ? null : Math.round((custo.orcamento - custo.total) * 100) / 100;
  return (
    <section>
      <h2 className="section-label sticky left-0 mb-2 w-fit">Custo da semana</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="text-xs text-[var(--muted-foreground)]">Free · {plural(custo.diarias, "diária", "diárias")}</p>
          <p className="font-semibold tabular-nums">{formatMoney(custo.free)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
          <p className="text-xs text-[var(--muted-foreground)]">CLT e fixo</p>
          <p className="font-semibold tabular-nums">{formatMoney(custo.clt)}</p>
        </div>
        <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] px-3 py-2.5">
          <p className="text-xs text-[var(--muted-foreground)]">Total</p>
          <p className="font-semibold tabular-nums text-[var(--primary)]">{formatMoney(custo.total)}</p>
        </div>
        <div
          className="rounded-xl border bg-[var(--card)] px-3 py-2.5"
          style={{ borderColor: sobra === null ? "var(--border)" : sobra >= 0 ? "var(--ok-strong)" : "var(--destructive)" }}
        >
          <p className="text-xs text-[var(--muted-foreground)]">
            Orçamento{custo.orcamento !== null && ` · ${formatMoney(custo.orcamento)}`}
          </p>
          {sobra === null ? (
            <Link href="/admin/pessoal/relatorios" className="text-sm font-medium text-[var(--primary)] underline underline-offset-4">
              {custo.meta === null ? "Definir a meta" : "Digitar o faturamento"}
            </Link>
          ) : (
            <p className="font-semibold tabular-nums" style={{ color: sobra >= 0 ? "var(--ok-strong)" : "var(--destructive)" }}>
              {sobra >= 0 ? `Sobra ${formatMoney(sobra)}` : `Passa ${formatMoney(-sobra)}`}
            </p>
          )}
        </div>
      </div>
      {custo.freeSemValor > 0 && (
        <p className="hint mt-1.5" style={{ color: "var(--warn)" }}>
          {plural(custo.freeSemValor, "free escalado está", "free escalados estão")} sem diária no cadastro.
        </p>
      )}
    </section>
  );
}

/** A lista de escolha de um posto num dia, presa embaixo no celular. */
function Escolha({ e, dados, aoFechar }: { e: Escolhendo; dados: DadosDaEscala; aoFechar: () => void }) {
  const [escopo, setEscopo] = useState<"fixa" | "dia">("fixa");
  const [cadastrando, setCadastrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pendente, startTransition] = useTransition();
  const d = dados.dias[e.dia];
  const celula = dados.areas.flatMap((a) => a.postos).find((p) => p.id === e.postoId)!.celulas[e.dia];

  // Onde cada um já está neste dia, para a lista avisar antes do toque.
  const ondeEsta = new Map<number, string>();
  for (const a of dados.areas) {
    for (const p of a.postos) {
      const quem = p.celulas[e.dia].colaboradorId;
      if (quem !== null && p.id !== e.postoId) ondeEsta.set(quem, p.nome);
    }
  }
  const deFerias = new Set(dados.ferias[e.dia]);
  // Primeiro quem trabalha neste dia (pelo cadastro); dentro disso, quem é da
  // equipe do posto, depois quem cobre as duas, depois o resto.
  const diaSemana = diaDaSemana(d.data);
  const foraDoDia = (p: DadosDaEscala["pessoas"][number]) => !trabalhaNoDiaDaSemana(p, diaSemana);
  const peso = (area: Area | null) => (area === e.area ? 0 : area === null ? 1 : 2);
  const pessoas = [...dados.pessoas].sort(
    (a, b) =>
      Number(foraDoDia(a)) - Number(foraDoDia(b)) || peso(a.area) - peso(b.area) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  // A busca ignora acento e maiúscula: "joao" acha João.
  const termo = chave(busca);
  const achadas = termo ? pessoas.filter((p) => chave(p.nome).includes(termo)) : pessoas;
  // As empresas terceirizadas: primeiro as da equipe do posto. Podem estar em
  // vários postos no mesmo dia (cada posto é uma pessoa que ela manda).
  const empresas = dados.terceirizados
    .filter((t) => !termo || chave(t.nome).includes(termo))
    .sort((a, b) => peso(a.area) - peso(b.area) || a.nome.localeCompare(b.nome, "pt-BR"));
  const postosDaEmpresa = (id: number) =>
    dados.areas.flatMap((a) => a.postos).filter((p) => p.id !== e.postoId && p.celulas[e.dia].terceirizadoId === id).length;

  function escolher(quem: QuemNoPosto) {
    setErro(null);
    startTransition(async () => {
      const r = await definirPosto(e.postoId, d.data, quem, escopo);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      aoFechar();
    });
  }

  function fechar(fecha: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await fecharPosto(e.postoId, d.data, fecha, escopo);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      aoFechar();
    });
  }

  function desfazer() {
    startTransition(async () => {
      const r = await voltarAoFixo(e.postoId, d.data);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      aoFechar();
    });
  }

  return (
    <Gaveta rotulo={`Quem fica em ${e.postoNome}`} aoFechar={aoFechar}>
        <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{e.postoNome}</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {d.extenso}, {d.ddmm} · agora: {celula.fechado ? "fechado" : (celula.nome ?? "vazio")}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-m-1 p-1 text-[var(--muted-foreground)]">
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {/* Vale toda semana ou só neste dia: decide antes de tocar no nome. */}
        <div className="grid grid-cols-2 gap-1 p-3">
          {(
            [
              ["fixa", `Toda ${d.extenso}`],
              ["dia", `Só ${d.ddmm}`],
            ] as const
          ).map(([k, texto]) => (
            <button
              key={k}
              type="button"
              aria-pressed={escopo === k}
              onClick={() => setEscopo(k)}
              className={`h-10 rounded-lg border text-sm font-semibold ${
                escopo === k
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        {cadastrando ? (
          <CadastroRapido
            postoId={e.postoId}
            postoNome={e.postoNome}
            area={e.area}
            data={d.data}
            escopo={escopo}
            aoVoltar={() => setCadastrando(false)}
            aoTerminar={aoFechar}
            aoFalharNoPosto={(msg) => {
              // A pessoa já ficou cadastrada: volta para a lista, onde ela aparece.
              setCadastrando(false);
              setErro(msg);
            }}
          />
        ) : (
          <>
            <div className="px-3 pb-3">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  type="search"
                  value={busca}
                  onChange={(ev) => setBusca(ev.target.value)}
                  placeholder="Buscar nome"
                  aria-label="Buscar nome"
                  className="h-10 pl-9"
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
              {achadas.length === 0 && empresas.length === 0 && (
                <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">Ninguém com esse nome.</li>
              )}
              {achadas.map((p) => {
                const atual = p.id === celula.colaboradorId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={pendente || atual}
                      onClick={() => escolher({ colaboradorId: p.id })}
                      className="flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.nome}</span>
                        {p.tipo !== "CLT" && (
                          <span className="selo ml-2" style={TIPO[p.tipo].selo}>
                            {TIPO[p.tipo].curto}
                          </span>
                        )}
                        {(ondeEsta.has(p.id) || deFerias.has(p.nome) || foraDoDia(p)) && (
                          <span className="block text-xs leading-4" style={{ color: "var(--warn)" }}>
                            {deFerias.has(p.nome)
                              ? "de férias neste dia"
                              : ondeEsta.has(p.id)
                                ? `já está em ${ondeEsta.get(p.id)}`
                                : `não trabalha ${d.extenso}`}
                          </span>
                        )}
                      </span>
                      {atual && <span className="text-xs text-[var(--muted-foreground)]">agora</span>}
                    </button>
                  </li>
                );
              })}
              {empresas.length > 0 && (
                <li className="bg-[var(--muted)] px-4 py-1.5 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                  Terceirizados
                </li>
              )}
              {empresas.map((t) => {
                const atual = t.id === celula.terceirizadoId;
                const outros = postosDaEmpresa(t.id);
                return (
                  <li key={`t${t.id}`}>
                    <button
                      type="button"
                      disabled={pendente || atual}
                      onClick={() => escolher({ terceirizadoId: t.id })}
                      className="flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-60"
                    >
                      <Building2 aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{t.nome}</span>
                        {outros > 0 && (
                          <span className="block text-xs leading-4 text-[var(--muted-foreground)]">
                            já manda {plural(outros, "pessoa", "pessoas")} neste dia
                          </span>
                        )}
                      </span>
                      {atual && <span className="text-xs text-[var(--muted-foreground)]">agora</span>}
                    </button>
                  </li>
                );
              })}
              {/* Quem ainda não está na equipe: cadastra aqui e já entra no posto. */}
              <li>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    setErro(null);
                    setCadastrando(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium text-[var(--primary)] hover:bg-[var(--muted)] disabled:opacity-60"
                >
                  <UserPlus aria-hidden className="size-4" />
                  Cadastrar alguém novo
                </button>
              </li>
            </ul>
          </>
        )}

        {!cadastrando && (
          <div className="space-y-2 border-t border-[var(--border)] p-3">
            {erro && (
              <p role="alert" className="msg-error">
                {erro}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10" disabled={pendente} onClick={() => escolher(null)}>
                Deixar vazio
              </Button>
              {/* Fechar: o posto não existe neste dia (o bar de segunda a sexta). Vale a escolha de cima. */}
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5"
                disabled={pendente}
                onClick={() => fechar(!celula.fechado)}
              >
                {celula.fechado ? <LockOpen aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
                {celula.fechado ? "Abrir posto" : "Fechar posto"}
              </Button>
              {celula.origem === "dia" && (
                <Button type="button" variant="ghost" className="h-10" disabled={pendente} onClick={desfazer}>
                  Voltar ao fixo
                </Button>
              )}
            </div>
          </div>
        )}
    </Gaveta>
  );
}

/**
 * Cadastro rápido de dentro da escala: só o que a escala precisa (nome,
 * apelido, contrato, equipe e a diária do free). Salva com as mesmas regras do
 * cadastro completo e já põe a pessoa no posto tocado; salário, admissão e o
 * resto se completam depois em Colaboradores.
 */
function CadastroRapido({
  postoId,
  postoNome,
  area,
  data,
  escopo,
  aoVoltar,
  aoTerminar,
  aoFalharNoPosto,
}: {
  postoId: number;
  postoNome: string;
  area: Area;
  data: string;
  escopo: "fixa" | "dia";
  aoVoltar: () => void;
  aoTerminar: () => void;
  aoFalharNoPosto: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [tipo, setTipo] = useState<TipoContrato>("CLT");
  const [equipe, setEquipe] = useState<Area | "">(area);
  const [diaria, setDiaria] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const rotulo = "mb-1 block text-sm font-medium";

  function cadastrar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await salvarColaborador(null, {
        ...COLABORADOR_VAZIO,
        nome,
        apelido,
        tipo,
        area: equipe,
        diaria: tipo === "FREELANCER" ? diaria : "",
      });
      if (!r.ok) return setErro(r.message);
      const posto = await definirPosto(postoId, data, { colaboradorId: r.data.id }, escopo);
      if (!posto.ok) return aoFalharNoPosto(`Cadastrado, mas não entrou no posto: ${posto.message ?? "escolha na lista"}`);
      aoTerminar();
    });
  }

  return (
    <form onSubmit={cadastrar} className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-[var(--border)] p-4">
      <label className="block">
        <span className={rotulo}>Nome</span>
        <Input value={nome} onChange={(ev) => setNome(ev.target.value)} required maxLength={80} autoFocus />
      </label>
      <label className="block">
        <span className={rotulo}>
          Apelido <span className="font-normal text-[var(--muted-foreground)]">(aparece na escala)</span>
        </span>
        <Input value={apelido} onChange={(ev) => setApelido(ev.target.value)} maxLength={40} />
      </label>
      <EscolhaDeContrato valor={tipo} onChange={setTipo} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={rotulo}>Equipe</span>
          <select value={equipe} onChange={(ev) => setEquipe(ev.target.value as Area | "")} className="field w-full">
            <option value="">Cozinha e salão</option>
            <option value="COZINHA">Cozinha</option>
            <option value="SALAO">Salão</option>
          </select>
        </label>
        {tipo === "FREELANCER" && (
          <label className="block">
            <span className={rotulo}>Diária</span>
            <Input
              value={diaria}
              onChange={(ev) => setDiaria(ev.target.value)}
              inputMode="decimal"
              placeholder="R$ 0,00"
            />
          </label>
        )}
      </div>
      <p className="hint">Salário, admissão e documentos você completa depois em Colaboradores.</p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10" disabled={pendente}>
          {pendente ? "Salvando…" : `Cadastrar e pôr em ${postoNome}`}
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={pendente} onClick={aoVoltar}>
          Voltar à lista
        </Button>
      </div>
    </form>
  );
}
