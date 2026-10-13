"use client";

import { CalendarRange, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { apagarCardapio, definirItemDoCardapio } from "@/lib/actions/buffet";
import { COR_FORNO, custoKgTexto, ddmm } from "@/lib/buffet";
import type { PratoParaEscolher, SemanaDoCardapio, SugestaoPendente } from "@/lib/buffet-dados";
import { custoMedio, DIAS_DA_SEMANA } from "@/lib/buffet-regras";

import { CorDoForno, EscolherPrato } from "../escolher-prato";
import { useAcao } from "@/lib/use-acao";
import { CardapioForm } from "./cardapio-form";

type Grupo = { id: number; nome: string; cor: string; posicoes: number };
type PratoNaPosicao = SemanaDoCardapio["itens"][number]["prato"];
type Vaga = { dia: number; grupo: Grupo; posicao: number };

const lugar = (dia: number, grupoId: number, posicao: number) => `${dia}:${grupoId}:${posicao}`;

/**
 * O cardápio-modelo para editar. No celular, um dia de cada vez; no
 * computador, também a semana inteira lado a lado. Tocar numa posição abre a
 * escolha do prato, só entre os pratos daquele grupo.
 */
export function EditorDoCardapio({
  semana,
  grupos,
  pratos,
  outros,
  diaInicial,
  podeApagar,
  sugeridas,
}: {
  semana: SemanaDoCardapio;
  grupos: Grupo[];
  pratos: PratoParaEscolher[];
  outros: { id: number; nome: string }[];
  diaInicial: number;
  /** Quem configura: cria cardápio, muda período e temas, apaga. As outras mudanças dele valem na hora. */
  podeApagar: boolean;
  /** As sugestões de troca esperando aprovação, para marcar a posição. */
  sugeridas: SugestaoPendente[];
}) {
  const router = useRouter();
  const [dia, setDia] = useState(diaInicial);
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [vaga, setVaga] = useState<Vaga | null>(null);
  const [form, setForm] = useState<"editar" | "novo" | null>(null);
  // Os grupos começam fechados (decisão do dono): a página abre curta, e cada
  // um abre com um toque no título, que já mostra quantos pratos e a média.
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const alternar = (id: number) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const { erro, aviso, pendente, rodar } = useAcao();
  const sugeridaEm = new Map(sugeridas.map((x) => [lugar(x.diaSemana ?? 0, x.grupoId ?? 0, x.posicao ?? 0), x]));

  const porLugar = useMemo(() => new Map(semana.itens.map((i) => [lugar(i.diaSemana, i.grupoId, i.posicao), i.prato])), [semana.itens]);
  const temas = DIAS_DA_SEMANA.map((_, i) => semana.temas[i + 1] ?? "");

  return (
    <div className="space-y-4">
      {/* O cardápio aberto num cartão: o nome e o período em cima, as ações
          em símbolos embaixo, e o formulário que elas abrem logo abaixo. */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
          <CalendarRange aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            <h2 className="font-bold">{semana.nome}</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Vale de {ddmm(semana.inicio)} a {ddmm(semana.fim)}.
            </p>
          </div>
        </div>
        {podeApagar && (
          <div className="p-1">
            <FileiraDeBotoes>
              <BotaoQuadrado
                icone={Pencil}
                texto="Nome, período e temas"
                ativo={form === "editar"}
                onClick={() => setForm(form === "editar" ? null : "editar")}
              />
              <BotaoQuadrado icone={Plus} texto="Novo cardápio" ativo={form === "novo"} onClick={() => setForm(form === "novo" ? null : "novo")} />
              <ConfirmarNaLinha
                pergunta={`Apagar ${semana.nome} e todos os pratos dele? Não dá para desfazer.`}
                pendente={pendente}
                aoConfirmar={() => rodar(() => apagarCardapio(semana.id), () => router.push("/admin/buffet/cardapio"))}
              >
                {(abrir) => <BotaoQuadrado icone={Trash2} texto="Apagar" tom="perigo" onClick={abrir} />}
              </ConfirmarNaLinha>
            </FileiraDeBotoes>
          </div>
        )}
        {form && (
          <div className="border-t border-[var(--border)] p-3">
            {form === "editar" ? (
              <CardapioForm
                id={semana.id}
                inicial={{ nome: semana.nome, inicio: semana.inicio, fim: semana.fim, temas }}
                outros={[]}
                fechar={() => setForm(null)}
              />
            ) : (
              <CardapioForm id={null} outros={outros} copiarDeInicial={semana.id} fechar={() => setForm(null)} />
            )}
          </div>
        )}
      </section>

      {aviso && <p className="msg-warn">{aviso}</p>}
      {!podeApagar && <p className="text-xs text-[var(--muted-foreground)]">As trocas que você fizer vão para aprovação antes de valer.</p>}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Os dias, e no computador a semana inteira. */}
      <div className="flex gap-2">
        <nav aria-label="Dia da semana" className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {DIAS_DA_SEMANA.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={vista === "dia" && dia === i + 1}
              onClick={() => {
                setDia(i + 1);
                setVista("dia");
              }}
              className="chip shrink-0 px-3 py-1.5 text-left text-sm"
            >
              {d.slice(0, 3)}
              {temas[i] && <span className="block text-[11px] font-normal opacity-75">{temas[i]}</span>}
            </button>
          ))}
        </nav>
        <button type="button" aria-pressed={vista === "semana"} onClick={() => setVista("semana")} className="chip hidden shrink-0 px-3 py-1.5 text-sm lg:block">
          Semana inteira
        </button>
      </div>

      {vista === "dia" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {grupos.map((g) => {
            const doDia = Array.from({ length: g.posicoes }, (_, i) => porLugar.get(lugar(dia, g.id, i + 1)) ?? null);
            const media = custoMedio(doDia.filter((p): p is PratoNaPosicao => p !== null));
            return (
              <section key={g.id} className="card self-start overflow-hidden">
                <h2 style={{ borderTop: `3px solid ${g.cor}` }}>
                  <button
                    type="button"
                    onClick={() => alternar(g.id)}
                    aria-expanded={abertos.has(g.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left ${abertos.has(g.id) ? "border-b border-[var(--border)]" : ""}`}
                  >
                    <span className="min-w-0 flex-1 font-semibold">{g.nome}</span>
                    <span className="text-xs font-normal tabular-nums text-[var(--muted-foreground)]">
                      {doDia.filter(Boolean).length}/{g.posicoes} · {media === null ? "sem custo" : `média ${custoKgTexto(media)}`}
                    </span>
                    <ChevronDown aria-hidden className={`size-4 shrink-0 text-[var(--muted-foreground)] transition ${abertos.has(g.id) ? "rotate-180" : ""}`} />
                  </button>
                </h2>
                {abertos.has(g.id) && (
                <ul className="divide-y divide-[var(--border)]">
                  {doDia.map((p, i) => (
                    <li key={i} style={sugeridaEm.has(lugar(dia, g.id, i + 1)) ? { background: "var(--warn-soft)" } : undefined}>
                      <button
                        type="button"
                        onClick={() => setVaga({ dia, grupo: g, posicao: i + 1 })}
                        className="flex min-h-8 w-full items-center gap-2 px-3 py-0.5 text-left text-sm hover:bg-[var(--muted)]"
                        aria-label={`Posição ${i + 1} de ${g.nome}: ${p?.nome ?? "vazia"}. Trocar`}
                      >
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[var(--muted-foreground)]">{i + 1}</span>
                        {p ? (
                          <>
                            <CorDoForno cor={p.corForno} espaco />
                            <span className={`min-w-0 flex-1 truncate ${p.ativo ? "" : "line-through opacity-60"}`}>{p.nome}</span>
                            <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{custoKgTexto(p.custoKg)}</span>
                          </>
                        ) : (
                          <span className="flex-1 text-[var(--muted-foreground)]">vazia</span>
                        )}
                      </button>
                      {sugeridaEm.has(lugar(dia, g.id, i + 1)) && (
                        <p className="px-3 pb-1 pl-11 text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                          esperando aprovação: {sugeridaEm.get(lugar(dia, g.id, i + 1))!.resumo.split(": ").slice(1).join(": ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.id}>
              <h2 className="section-label mb-2">
                <button type="button" onClick={() => alternar(g.id)} aria-expanded={abertos.has(g.id)} className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: g.cor }} aria-hidden />
                  {g.nome}
                  <ChevronDown aria-hidden className={`size-3.5 transition ${abertos.has(g.id) ? "rotate-180" : ""}`} />
                </button>
              </h2>
              {abertos.has(g.id) && (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full table-fixed text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                      <th className="w-8 px-1 py-1.5 text-right font-medium">Nº</th>
                      {DIAS_DA_SEMANA.map((d, i) => (
                        <th key={d} className="px-1.5 py-1.5 font-medium">
                          {d.slice(0, 3)}
                          {temas[i] && <span className="font-normal"> · {temas[i]}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {Array.from({ length: g.posicoes }, (_, i) => (
                      <tr key={i}>
                        <td className="px-1 text-right tabular-nums text-[var(--muted-foreground)]">{i + 1}</td>
                        {DIAS_DA_SEMANA.map((d, di) => {
                          const p = porLugar.get(lugar(di + 1, g.id, i + 1));
                          return (
                            <td key={d} className="border-l border-[var(--border)] p-0">
                              <button
                                type="button"
                                onClick={() => setVaga({ dia: di + 1, grupo: g, posicao: i + 1 })}
                                title={p ? `${p.nome} · ${custoKgTexto(p.custoKg)}` : "vazia"}
                                className="flex w-full items-center gap-1 px-1.5 py-1 text-left hover:bg-[var(--muted)]"
                              >
                                {p && <CorDoForno cor={p.corForno} />}
                                <span className={`truncate ${p ? "" : "text-[var(--muted-foreground)]"}`}>{p?.nome ?? "–"}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
        {(["VERDE", "AZUL"] as const).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <CorDoForno cor={c} />
            {COR_FORNO[c].nome}
          </span>
        ))}
      </p>

      {vaga && (
        <EscolherPrato
          titulo={`${vaga.grupo.nome} · posição ${vaga.posicao}`}
          subtitulo={`${DIAS_DA_SEMANA[vaga.dia - 1]} · agora: ${porLugar.get(lugar(vaga.dia, vaga.grupo.id, vaga.posicao))?.nome ?? "vazia"}`}
          atual={porLugar.get(lugar(vaga.dia, vaga.grupo.id, vaga.posicao)) ?? null}
          noDia={new Set(semana.itens.filter((i) => i.diaSemana === vaga.dia).map((i) => i.prato.id))}
          pratos={pratos.filter((p) => p.grupoId === vaga.grupo.id)}
          escolher={(pratoId) =>
            rodar(() => definirItemDoCardapio(semana.id, vaga.dia, vaga.grupo.id, vaga.posicao, pratoId), () => setVaga(null))
          }
          pendente={pendente}
          erro={erro}
          fechar={() => setVaga(null)}
        />
      )}
    </div>
  );
}
