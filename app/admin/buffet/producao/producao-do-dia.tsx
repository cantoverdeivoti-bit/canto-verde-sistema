"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desfazerTroca, lancarClientes, lancarPeso, trocarNoDia } from "@/lib/actions/buffet";
import { comoFazer } from "@/lib/buffet";
import type { DiaDoBuffet, PesosDoDia, PratoParaEscolher, SugestaoPendente } from "@/lib/buffet-dados";
import { plural } from "@/lib/format";

import { CorDoForno, EscolherPrato } from "../escolher-prato";
import { useAcao } from "@/lib/use-acao";

type Grupo = { id: number; nome: string; cor: string; posicoes: number };
type Item = DiaDoBuffet["itens"][number];
type Vaga = { grupo: Grupo; posicao: number; item: Item | null };

const kgNoCampo = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false }));
const kgTexto = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;

export function ProducaoDoDia({
  dia,
  grupos,
  pratos,
  pesos,
  podePesar,
  sugeridas,
  trocaDireto,
}: {
  dia: DiaDoBuffet;
  grupos: Grupo[];
  pratos: PratoParaEscolher[];
  pesos: PesosDoDia;
  /** Peso só se lança no dia ou depois: o que vai ser feito amanhã ainda não pesa nada. */
  podePesar: boolean;
  /** As trocas deste dia esperando aprovação. */
  sugeridas: SugestaoPendente[];
  /** Quem configura troca na hora; os outros mandam para aprovação. */
  trocaDireto: boolean;
}) {
  const sugeridaEm = new Map(sugeridas.map((x) => [`${x.grupoId}:${x.posicao}`, x]));
  const oQueEspera = (x: SugestaoPendente) => (x.tipo === "DESFAZER_TROCA" ? "voltar ao prato do cardápio" : x.resumo.split(": ").slice(1).join(": "));
  const [vaga, setVaga] = useState<Vaga | null>(null);
  const [pesando, setPesando] = useState(podePesar && Object.keys(pesos.porLugar).length > 0);
  const soma = (filtro: (chave: string) => boolean) =>
    Object.entries(pesos.porLugar)
      .filter(([k]) => filtro(k))
      .reduce((t, [, p]) => ({ feito: t.feito + p.kgProduzido, sobra: t.sobra + (p.kgSobra ?? 0) }), { feito: 0, sobra: 0 });
  const total = soma(() => true);
  const { erro, aviso, pendente, rodar } = useAcao();
  const porLugar = new Map(dia.itens.map((i) => [`${i.grupoId}:${i.posicao}`, i]));
  const trocas = dia.itens.filter((i) => i.trocado).length;
  const noDia = new Set(dia.itens.map((i) => i.prato?.id).filter((id): id is number => id !== undefined));

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {dia.cardapio.nome}
        {dia.tema && (
          <>
            {" "}
            · tema <span className="font-semibold text-[var(--foreground)]">{dia.tema}</span>
          </>
        )}
        {trocas > 0 && ` · ${plural(trocas, "troca", "trocas")} neste dia`}. Toque num prato para trocar só neste dia
        {!trocaDireto && " (a troca vai para aprovação)"}.
      </p>
      {aviso && <p className="msg-warn">{aviso}</p>}

      {podePesar && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={pesando} onClick={() => setPesando(!pesando)} className="chip px-3 py-1.5 text-sm">
            Lançar pesos
          </button>
          {pesando && <ClientesDoDia data={dia.data} inicial={pesos.clientes} />}
          {total.feito > 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Feito {kgTexto(total.feito)} · sobrou {kgTexto(total.sobra)}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {grupos.map((g) => (
          <section key={g.id} className="card overflow-hidden">
            <h2 className="flex items-baseline gap-2 border-b border-[var(--border)] px-3 py-2 font-semibold" style={{ borderTop: `3px solid ${g.cor}` }}>
              <span className="flex-1">{g.nome}</span>
              {pesando && soma((k) => k.startsWith(`${g.id}:`)).feito > 0 && (
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  {kgTexto(soma((k) => k.startsWith(`${g.id}:`)).feito)} · sobra {kgTexto(soma((k) => k.startsWith(`${g.id}:`)).sobra)}
                </span>
              )}
            </h2>
            <ul className="divide-y divide-[var(--border)]">
              {Array.from({ length: g.posicoes }, (_, i) => {
                const item = porLugar.get(`${g.id}:${i + 1}`) ?? null;
                const p = item?.prato ?? null;
                return (
                  <li key={i} style={item?.trocado || sugeridaEm.has(`${g.id}:${i + 1}`) ? { background: "var(--warn-soft)" } : undefined}>
                    <button
                      type="button"
                      onClick={() => setVaga({ grupo: g, posicao: i + 1, item })}
                      aria-label={`Posição ${i + 1} de ${g.nome}: ${p?.nome ?? "vazia"}. Trocar neste dia`}
                      className={`flex w-full items-start gap-2 px-3 text-left text-sm hover:bg-[var(--muted)] ${pesando ? "py-1" : "py-2"}`}
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[var(--muted-foreground)]">{i + 1}</span>
                      <span className="pt-1.5">{p ? <CorDoForno cor={p.corForno} espaco /> : <span className="block size-2" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block ${p ? "font-medium" : "text-[var(--muted-foreground)]"}`}>{p?.nome ?? "vazia"}</span>
                        {item?.trocado && (
                          <span className="block text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                            troca do dia{item.noLugarDe && `, no lugar de ${item.noLugarDe}`}
                            {item.motivo && ` · ${item.motivo}`}
                          </span>
                        )}
                        {sugeridaEm.has(`${g.id}:${i + 1}`) && (
                          <span className="block text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                            esperando aprovação: {oQueEspera(sugeridaEm.get(`${g.id}:${i + 1}`)!)}
                          </span>
                        )}
                        {!pesando && p && comoFazer(p) && <span className="block text-[11px] text-[var(--muted-foreground)]">{comoFazer(p)}</span>}
                        {!pesando && p?.ajuste && (
                          <span className="line-clamp-2 block text-[11px] text-[var(--muted-foreground)]">Ajuste: {p.ajuste}</span>
                        )}
                      </span>
                    </button>
                    {pesando && p && (
                      <CampoDePeso
                        // Pelo prato, e não pelo peso: salvar um campo não pode recriar o outro no meio da digitação.
                        key={p.id}
                        data={dia.data}
                        grupoId={g.id}
                        posicao={i + 1}
                        nome={p.nome}
                        salvo={pesos.porLugar[`${g.id}:${i + 1}`]?.pratoId === p.id ? pesos.porLugar[`${g.id}:${i + 1}`] : undefined}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {vaga && (
        <EscolherPrato
          titulo={`${vaga.grupo.nome} · posição ${vaga.posicao}`}
          subtitulo={`Só neste dia · agora: ${vaga.item?.prato?.nome ?? "vazia"}`}
          atual={vaga.item?.prato ?? null}
          noDia={noDia}
          pratos={pratos.filter((p) => p.grupoId === vaga.grupo.id)}
          comMotivo
          extra={
            vaga.item?.trocado ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={pendente}
                onClick={() => rodar(() => desfazerTroca(dia.data, vaga.grupo.id, vaga.posicao), () => setVaga(null))}
              >
                Voltar ao prato do cardápio{vaga.item.noLugarDe ? ` (${vaga.item.noLugarDe})` : ""}
              </Button>
            ) : undefined
          }
          escolher={(pratoId, motivo) =>
            rodar(() => trocarNoDia({ data: dia.data, grupoId: vaga.grupo.id, posicao: vaga.posicao, pratoId, motivo }), () => setVaga(null))
          }
          pendente={pendente}
          erro={erro}
          fechar={() => setVaga(null)}
        />
      )}
    </div>
  );
}

/**
 * O kg feito e a sobra de um prato, salvos ao sair do campo. Vazio nos dois
 * apaga o lançamento.
 */
function CampoDePeso({
  data,
  grupoId,
  posicao,
  nome,
  salvo,
}: {
  data: string;
  grupoId: number;
  posicao: number;
  nome: string;
  salvo?: { kgProduzido: number; kgSobra: number | null };
}) {
  const router = useRouter();
  const [feito, setFeito] = useState(kgNoCampo(salvo?.kgProduzido));
  const [sobra, setSobra] = useState(kgNoCampo(salvo?.kgSobra));
  const [gravado, setGravado] = useState({ feito: kgNoCampo(salvo?.kgProduzido), sobra: kgNoCampo(salvo?.kgSobra) });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    if (feito === gravado.feito && sobra === gravado.sobra) return;
    setErro(null);
    startTransition(async () => {
      const r = await lancarPeso({ data, grupoId, posicao, kgProduzido: feito, kgSobra: sobra });
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      setGravado({ feito, sobra });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-1.5 pl-11 text-xs">
      <label className="flex items-center gap-1">
        <span className="text-[var(--muted-foreground)]">feito</span>
        <Input
          inputMode="decimal"
          value={feito}
          onChange={(e) => setFeito(e.target.value)}
          onBlur={salvar}
          aria-label={`Kg feito de ${nome}`}
          placeholder="kg"
          className="w-20 px-2"
        />
      </label>
      <label className="flex items-center gap-1">
        <span className="text-[var(--muted-foreground)]">sobrou</span>
        <Input
          inputMode="decimal"
          value={sobra}
          onChange={(e) => setSobra(e.target.value)}
          onBlur={salvar}
          aria-label={`Kg que sobrou de ${nome}`}
          placeholder="kg"
          className="w-20 px-2"
        />
      </label>
      {pendente ? (
        <span className="text-[var(--muted-foreground)]">salvando…</span>
      ) : (
        gravado.feito !== "" && feito === gravado.feito && sobra === gravado.sobra && <Check aria-label="Salvo" className="size-4 text-[var(--ok-strong)]" />
      )}
      {erro && (
        <span role="alert" className="w-full text-[var(--destructive)]">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Quantos clientes o buffet atendeu: é o que dá o custo por cliente no painel. */
function ClientesDoDia({ data, inicial }: { data: string; inicial: number | null }) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial === null ? "" : String(inicial));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    const n = valor.trim() === "" ? null : Number(valor);
    if (n === inicial) return;
    setErro(null);
    startTransition(async () => {
      const r = await lancarClientes(data, n !== null && Number.isNaN(n) ? -1 : n);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-[var(--muted-foreground)]">clientes</span>
      <Input
        inputMode="numeric"
        value={valor}
        onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
        onBlur={salvar}
        aria-label="Clientes do dia"
        className="h-9 w-20 px-2"
        disabled={pendente}
      />
      {erro && <span className="text-xs text-[var(--destructive)]">{erro}</span>}
    </label>
  );
}
