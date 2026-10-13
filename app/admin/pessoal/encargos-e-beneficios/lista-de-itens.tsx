"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarItemDeCusto, criarEncargosPadrao, ligarItemDeCusto, salvarItemDeCusto } from "@/lib/actions/pessoal";
import { descreverItem, type FormaDoItem, type ItemDeCusto, type NaturezaDoItem } from "@/lib/cmo";
import { formatMoney, plural } from "@/lib/format";
import { TIPO, TIPOS, type TipoContrato } from "@/lib/tipos-de-contrato";

type Item = ItemDeCusto & { excecoes: number; custoNoMes: number | null };

const FORMAS: [FormaDoItem, string][] = [
  ["PERCENTUAL_SALARIO", "% do salário"],
  ["POR_MES", "R$ por mês"],
  ["POR_DIA", "R$ por dia"],
];
const NATUREZAS: [NaturezaDoItem, string][] = [
  ["ENCARGO", "Encargo"],
  ["BENEFICIO", "Benefício"],
  ["DESCONTO", "Desconto"],
];

const NOME_DA_NATUREZA: Record<NaturezaDoItem, string> = { ENCARGO: "encargo", BENEFICIO: "benefício", DESCONTO: "desconto" };

/** Os descontos de sempre, para começar o formulário já com nome, forma e tipo. O valor é seu. */
const DESCONTOS_SUGERIDOS: { nome: string; forma: FormaDoItem; tipos: TipoContrato[] }[] = [
  { nome: "INSS", forma: "PERCENTUAL_SALARIO", tipos: ["CLT"] },
  { nome: "Sindicato", forma: "POR_MES", tipos: ["CLT"] },
];

const escolha = (ativo: boolean) =>
  `h-10 rounded-xl border px-1 text-sm leading-tight font-semibold ${
    ativo ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--card)]"
  }`;

/**
 * As duas listas, encargos e benefícios, com criar, editar, ligar e apagar.
 * Quem só opera vê a lista, sem os botões e sem os valores do mês.
 */
export function ListaDeItens({ itens, podeConfigurar }: { itens: Item[]; podeConfigurar: boolean }) {
  const [editando, setEditando] = useState<number | "novo" | null>(null);
  // O formulário novo pode começar preenchido com um desconto sugerido.
  const [sugestao, setSugestao] = useState<(typeof DESCONTOS_SUGERIDOS)[number] | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      depois?.();
    });
  }

  const grupo = (natureza: NaturezaDoItem, titulo: string) => {
    const doGrupo = itens.filter((i) => i.natureza === natureza);
    return (
      <section>
        <h2 className="section-label mb-2">
          {titulo} · {doGrupo.length}
        </h2>
        {doGrupo.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum {NOME_DA_NATUREZA[natureza]} cadastrado.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {doGrupo.map((i) =>
              editando === i.id ? (
                <li key={i.id} className="p-3">
                  <FormularioDoItem item={i} fechar={() => setEditando(null)} />
                </li>
              ) : (
                <li key={i.id} className={`px-3 py-2.5 ${i.ativo ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{i.nome}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">{descreverItem(i.forma, i.valor)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1">
                        {i.tipos.length === 0 ? (
                          <span className="text-xs text-[var(--muted-foreground)]">só para quem for marcado na ficha</span>
                        ) : (
                          i.tipos.map((t) => (
                            <span key={t} className="selo" style={TIPO[t].selo}>
                              {TIPO[t].curto}
                            </span>
                          ))
                        )}
                        {i.excecoes > 0 && (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            · {plural(i.excecoes, "exceção", "exceções")}
                          </span>
                        )}
                        {!i.ativo && <span className="text-xs text-[var(--destructive)]">· desligado</span>}
                      </p>
                    </div>
                    {i.custoNoMes !== null && (
                      <span className="shrink-0 text-right text-sm">
                        <span className="block font-semibold tabular-nums">{formatMoney(i.custoNoMes)}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {i.natureza === "DESCONTO" ? "descontado por mês" : "por mês"}
                        </span>
                      </span>
                    )}
                  </div>
                  {podeConfigurar &&
                    (apagando === i.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm">
                          Apagar {i.nome}
                          {i.excecoes > 0 ? ` e ${plural(i.excecoes, "exceção", "exceções")}` : ""}?
                        </span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pendente}
                          onClick={() => rodar(() => apagarItemDeCusto(i.id), () => setApagando(null))}
                        >
                          Apagar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setApagando(null)}>
                          voltar
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => rodar(() => ligarItemDeCusto(i.id, !i.ativo))}
                          disabled={pendente}
                          className="chip px-2.5 py-1 text-xs"
                        >
                          {i.ativo ? "Desligar" : "Ligar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(i.id);
                            setApagando(null);
                          }}
                          aria-label={`Editar ${i.nome}`}
                          title="Editar"
                          className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          <Pencil aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setApagando(i.id)}
                          aria-label={`Apagar ${i.nome}`}
                          title="Apagar"
                          className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </div>
                    ))}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      {podeConfigurar &&
        (editando === "novo" ? (
          <div className="rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-3">
            <FormularioDoItem
              item={null}
              inicial={sugestao ? { ...sugestao, natureza: "DESCONTO" } : undefined}
              fechar={() => {
                setEditando(null);
                setSugestao(null);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-11 gap-1.5" onClick={() => setEditando("novo")}>
              <Plus aria-hidden className="size-4" />
              Novo item
            </Button>
            {DESCONTOS_SUGERIDOS.filter((d) => !itens.some((i) => i.nome.toLowerCase() === d.nome.toLowerCase())).map((d) => (
              <Button
                key={d.nome}
                type="button"
                variant="outline"
                className="h-11 gap-1.5"
                onClick={() => {
                  setSugestao(d);
                  setEditando("novo");
                }}
              >
                <Plus aria-hidden className="size-4" />
                Desconto de {d.nome}
              </Button>
            ))}
            {!itens.some((i) => i.natureza === "ENCARGO") && (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={pendente}
                onClick={() => rodar(() => criarEncargosPadrao())}
              >
                Criar os encargos do CLT
              </Button>
            )}
          </div>
        ))}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {grupo("ENCARGO", "Encargos")}
      {grupo("BENEFICIO", "Benefícios")}
      {grupo("DESCONTO", "Descontos")}

      {podeConfigurar && (
        <p className="hint">
          O botão Criar os encargos do CLT põe 13º (8,33%), férias com 1/3 (11,11%) e FGTS (9,56%): 29% sobre o salário, a conta do
          Simples Nacional. Fora do Simples entra também o INSS da empresa. Confirme com a contabilidade.
          Descontos (INSS do colaborador, sindicato) saem do salário da pessoa: não entram no CMO, só no líquido que ela
          recebe. O % do INSS de cada um você ajusta na ficha dele.
        </p>
      )}
    </>
  );
}

/** Criar (item nulo) ou editar um item. */
function FormularioDoItem({
  item,
  inicial,
  fechar,
}: {
  item: Item | null;
  /** Um item novo que já começa preenchido (os descontos sugeridos). */
  inicial?: { nome: string; natureza: NaturezaDoItem; forma: FormaDoItem; tipos: TipoContrato[] };
  fechar: () => void;
}) {
  const [nome, setNome] = useState(item?.nome ?? inicial?.nome ?? "");
  const [natureza, setNatureza] = useState<NaturezaDoItem>(item?.natureza ?? inicial?.natureza ?? "BENEFICIO");
  const [forma, setForma] = useState<FormaDoItem>(item?.forma ?? inicial?.forma ?? "POR_DIA");
  const [valor, setValor] = useState(item ? item.valor.toFixed(2).replace(".", ",") : "");
  const [tipos, setTipos] = useState<TipoContrato[]>(item?.tipos ?? inicial?.tipos ?? ["CLT", "FIXO"]);
  const desconto = natureza === "DESCONTO";
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const pct = forma === "PERCENTUAL_SALARIO";

  const alternar = (t: TipoContrato) => setTipos((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await salvarItemDeCusto(item?.id ?? null, { nome, natureza, forma, valor, tipos });
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      fechar();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      <p className="font-semibold">{item ? `Editar ${item.nome}` : "Novo item"}</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Nome</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="ex.: Vale-transporte" required />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">É um</legend>
        <div className="grid grid-cols-3 gap-2">
          {NATUREZAS.map(([n, texto]) => (
            <button key={n} type="button" aria-pressed={natureza === n} onClick={() => setNatureza(n)} className={escolha(natureza === n)}>
              {texto}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{desconto ? "Como desconta" : "Como cobra"}</legend>
        <div className="grid grid-cols-3 gap-2">
          {FORMAS.map(([f, texto]) => (
            <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)} className={escolha(forma === f)}>
              {texto}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{pct ? "Quantos % do salário" : "Valor em reais"}</span>
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder={pct ? (desconto ? "ex.: 7,5" : "ex.: 8,33") : "R$ 0,00"}
          className="w-32"
          required
        />
        {forma === "POR_DIA" && (
          <span className="hint mt-1 block">Conta pelos dias da escala fixa de cada um × 4,35 semanas.</span>
        )}
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{desconto ? "De quem desconta" : "Quem recebe"}</legend>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => {
            const fora = pct && t === "FREELANCER";
            return (
              <button
                key={t}
                type="button"
                aria-pressed={!fora && tipos.includes(t)}
                disabled={fora}
                onClick={() => alternar(t)}
                className="chip px-3 py-1.5 text-sm disabled:opacity-40"
                title={fora ? "O free não tem salário" : undefined}
              >
                {TIPO[t].longo}
              </button>
            );
          })}
        </div>
        <span className="hint mt-1 block">
          Nenhum marcado: o item só vale para quem você marcar na ficha do colaborador.
        </span>
      </fieldset>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
