"use client";

import { Pencil, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ligarPrato, salvarPrato } from "@/lib/actions/buffet";
import { CARGA_FORNO, COR_FORNO, custoKgTexto, JANELA_PRODUCAO, POSTO_BUFFET, VIABILIDADE_FORNO } from "@/lib/buffet";
import { chave, plural } from "@/lib/format";
import type { SugestaoPendente } from "@/lib/buffet-dados";
import type { PratoBuffetInput } from "@/lib/validations";
import type { CargaForno, CorForno, JanelaProducao, PostoBuffet, ViabilidadeForno } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Grupo = { id: number; nome: string; cor: string };
type Prato = {
  id: number;
  codigo: string | null;
  nome: string;
  grupoId: number;
  categoria: string | null;
  custoKg: number | null;
  codFicha: string | null;
  alertaCusto: string | null;
  viabilidade: ViabilidadeForno | null;
  modo: string | null;
  temperatura: string | null;
  umidade: string | null;
  tempo: string | null;
  sonda: string | null;
  posto: PostoBuffet | null;
  carga: CargaForno | null;
  janela: JanelaProducao | null;
  ajuste: string | null;
  corForno: CorForno;
  defumar: boolean;
  processoD1: string | null;
  ativo: boolean;
  noCardapio: number;
};

type Filtro = "todos" | "semCusto" | "semFluxo" | "desligados";
const FILTROS: [Filtro, string][] = [
  ["todos", "Ligados"],
  ["semCusto", "Sem custo"],
  ["semFluxo", "Sem fluxo do forno"],
  ["desligados", "Desligados"],
];
/** Quantos aparecem antes do "mostrar mais": 344 linhas de uma vez pesam no celular. */
const PAGINA = 60;

const custoNoCampo = (n: number | null) => (n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false }));

function noForm(p: Prato | null, grupoId: number): PratoBuffetInput {
  return {
    nome: p?.nome ?? "",
    grupoId: p?.grupoId ?? grupoId,
    categoria: p?.categoria ?? "",
    custoKg: custoNoCampo(p?.custoKg ?? null),
    codFicha: p?.codFicha ?? "",
    alertaCusto: p?.alertaCusto ?? "",
    viabilidade: p?.viabilidade ?? null,
    modo: p?.modo ?? "",
    temperatura: p?.temperatura ?? "",
    umidade: p?.umidade ?? "",
    tempo: p?.tempo ?? "",
    sonda: p?.sonda ?? "",
    posto: p?.posto ?? null,
    carga: p?.carga ?? null,
    janela: p?.janela ?? null,
    ajuste: p?.ajuste ?? "",
    corForno: p?.corForno ?? "NENHUMA",
    defumar: p?.defumar ?? false,
    processoD1: p?.processoD1 ?? "",
  };
}

/** O custo por kg de cada ficha do Receituário, pelo código: o prato ligado a ela usa este custo. */
export type FornoDaFicha = { modo: string | null; temperatura: string | null; umidade: string | null; tempo: string | null; sonda: string | null; ajuste: string | null };
export type FichasDoReceituario = Record<string, { nome: string; porKg: number | null; forno: FornoDaFicha | null }>;

// Os números do forno. O "ajuste" fica de fora: no prato e na ficha ele é
// texto livre, escrito de jeitos diferentes, e acusaria diferença sempre.
const CAMPOS_DO_FORNO = [
  ["modo", "Modo"],
  ["temperatura", "Temperatura"],
  ["umidade", "Umidade"],
  ["tempo", "Tempo"],
  ["sonda", "Sonda"],
] as const;

/** "200 °C" e "200", "25 min + 18 min" e "25 + 18 min" dizem o mesmo. */
const semEscrita = (t: string) =>
  t
    .toLowerCase()
    .replace(/[°º]\s*c/g, "")
    .replace(/min/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Onde o forno do prato difere do da ficha. Só conta o que a ficha diz:
 * campo vazio na ficha não manda apagar o do prato.
 */
function diferencasDoForno(v: PratoBuffetInput, forno: FornoDaFicha | null | undefined) {
  if (!forno) return [];
  return CAMPOS_DO_FORNO.filter(([k]) => {
    const daFicha = forno[k]?.trim();
    return daFicha && semEscrita(daFicha) !== semEscrita(v[k] ?? "");
  }).map(([k, rotulo]) => ({ k, rotulo, daFicha: forno[k]!.trim(), noPrato: (v[k] ?? "").trim() }));
}
const fichaDo = (fichas: FichasDoReceituario, codigo: string | null | undefined) => (codigo ? fichas[codigo.trim().toUpperCase()] : undefined);

export function ListaDePratos({
  itens,
  grupos,
  fichas,
  sugeridos,
  mudaDireto,
}: {
  itens: Prato[];
  grupos: Grupo[];
  fichas: FichasDoReceituario;
  /** Mudanças de pratos esperando aprovação (pratos novos e alterações). */
  sugeridos: SugestaoPendente[];
  /** Quem configura muda na hora; os outros mandam para aprovação. */
  mudaDireto: boolean;
}) {
  const [avisoDoForm, setAvisoDoForm] = useState<string | null>(null);
  const esperando = new Set(sugeridos.map((s) => s.pratoId).filter((id): id is number => id !== null));
  const novosEsperando = sugeridos.filter((s) => s.tipo === "PRATO_NOVO");
  const [abrindo, setAbrindo] = useState<number | "novo" | null>(null);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [quantos, setQuantos] = useState(PAGINA);
  const { erro, aviso, pendente, rodar } = useAcao();
  const recado = aviso ?? avisoDoForm;
  const categorias = [...new Set(itens.map((p) => p.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g]));

  const visiveis = itens.filter(
    (p) =>
      (grupo === null || p.grupoId === grupo) &&
      (filtro === "desligados" ? !p.ativo : p.ativo) &&
      (filtro !== "semCusto" || p.custoKg === null) &&
      (filtro !== "semFluxo" || p.janela === null) &&
      chave(`${p.nome} ${p.categoria ?? ""} ${p.codigo ?? ""}`).includes(chave(busca)),
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setQuantos(PAGINA);
          }}
          placeholder="Buscar prato, categoria ou código"
          aria-label="Buscar prato"
          className="min-w-0 flex-1"
        />
        <Button type="button" className="h-11 shrink-0 gap-1.5" onClick={() => setAbrindo(abrindo === "novo" ? null : "novo")}>
          <Plus aria-hidden className="size-4" />
          Novo prato
        </Button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button type="button" aria-pressed={grupo === null} onClick={() => setGrupo(null)} className="chip shrink-0 px-3 py-1.5 text-sm">
          Todos os grupos
        </button>
        {grupos.map((g) => (
          <button key={g.id} type="button" aria-pressed={grupo === g.id} onClick={() => setGrupo(g.id)} className="chip shrink-0 px-3 py-1.5 text-sm">
            {g.nome}
          </button>
        ))}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTROS.map(([f, texto]) => (
          <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)} className="chip shrink-0 px-2.5 py-1 text-xs">
            {texto}
          </button>
        ))}
      </div>

      <datalist id="categorias-do-buffet">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {abrindo === "novo" && (
        <PratoForm
          id={null}
          inicial={noForm(null, grupo ?? grupos[0]?.id ?? 0)}
          grupos={grupos}
          fichas={fichas}
          fechar={() => setAbrindo(null)}
          avisar={setAvisoDoForm}
          // O prato novo cai no meio da ordem alfabética, talvez depois do "mostrar mais": a busca mostra ele.
          criado={(nome) => {
            setBusca(nome);
            setFiltro("todos");
          }}
        />
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      {recado && <p className="msg-warn">{recado}</p>}
      {!mudaDireto && <p className="text-xs text-[var(--muted-foreground)]">O que você criar ou mudar aqui vai para aprovação antes de valer.</p>}
      {novosEsperando.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3 text-sm" style={{ background: "var(--warn-soft)" }}>
          <p className="font-semibold">Pratos novos esperando aprovação</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {novosEsperando.map((s) => (
              <li key={s.id}>{s.resumo.replace(/^Prato novo: /, "")}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">{plural(visiveis.length, "prato")}</p>
      {visiveis.length > 0 && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {visiveis.slice(0, quantos).map((p) => {
            const g = nomeDoGrupo.get(p.grupoId);
            const cor = COR_FORNO[p.corForno].cor;
            return (
              <li key={p.id} className={p.ativo ? "" : "opacity-60"}>
                {abrindo === p.id ? (
                  <div className="p-3">
                    <PratoForm
                      id={p.id}
                      inicial={noForm(p, p.grupoId)}
                      grupos={grupos}
                      fichas={fichas}
                      fechar={() => setAbrindo(null)}
                      ativo={p.ativo}
                      avisar={setAvisoDoForm}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-14 items-center gap-2 px-3 py-2">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: g?.cor }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        {cor && (
                          <span
                            className="inline-block size-2 shrink-0 rounded-full"
                            style={{ background: cor }}
                            title={COR_FORNO[p.corForno].nome}
                          />
                        )}
                        <span className="line-clamp-2">{p.nome}</span>
                        {p.alertaCusto && (
                          <TriangleAlert aria-label="O custo tem ressalva" className="size-3.5 shrink-0" style={{ color: "var(--warn)" }} />
                        )}
                      </p>
                      {esperando.has(p.id) && (
                        <p className="text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                          alteração esperando aprovação
                        </p>
                      )}
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {[g?.nome, p.categoria, p.codigo, p.noCardapio > 0 ? `${plural(p.noCardapio, "vez", "vezes")} no cardápio` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {p.custoKg === null ? <span className="text-xs font-normal text-[var(--warn)]">sem custo</span> : custoKgTexto(p.custoKg)}
                      {fichaDo(fichas, p.codFicha)?.porKg != null && <span className="block text-[10px] font-normal text-[var(--muted-foreground)]">da ficha</span>}
                    </p>
                    {/* No celular, ligar e desligar fica dentro da edição: a linha precisa do espaço para o nome. */}
                    <button
                      type="button"
                      onClick={() => rodar(() => ligarPrato(p.id, !p.ativo))}
                      disabled={pendente}
                      className="chip hidden shrink-0 px-2.5 py-1 text-xs sm:block"
                    >
                      {p.ativo ? "Desligar" : "Ligar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbrindo(p.id)}
                      aria-label={`Editar ${p.nome}`}
                      title="Editar"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {visiveis.length > quantos && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setQuantos(quantos + PAGINA)}>
          Mostrar mais {Math.min(PAGINA, visiveis.length - quantos)}
        </Button>
      )}
    </div>
  );
}

function Opcoes<T extends string>({
  rotulos,
  valor,
  mudar,
  rotulo,
}: {
  rotulos: Record<T, string>;
  valor: T | null;
  mudar: (v: T | null) => void;
  rotulo: string;
}) {
  return (
    <label>
      <span className="label">{rotulo}</span>
      <select value={valor ?? ""} onChange={(e) => mudar((e.target.value || null) as T | null)} className="field">
        <option value="">não definido</option>
        {(Object.entries(rotulos) as [T, string][]).map(([k, t]) => (
          <option key={k} value={k}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

const nomes = <T extends string>(r: Record<T, { nome: string }>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as { nome: string }).nome])) as Record<T, string>;

function PratoForm({
  id,
  inicial,
  grupos,
  fichas,
  fechar,
  criado,
  ativo,
  avisar,
}: {
  id: number | null;
  inicial: PratoBuffetInput;
  grupos: Grupo[];
  fichas: FichasDoReceituario;
  fechar: () => void;
  criado?: (nome: string) => void;
  ativo?: boolean;
  /** O recado de "foi para aprovação", mostrado na lista depois que o formulário fecha. */
  avisar?: (recado: string | null) => void;
}) {
  const [v, setV] = useState(inicial);
  const [forno, setForno] = useState(id === null);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof PratoBuffetInput>(k: K, valor: PratoBuffetInput[K]) => setV((a) => ({ ...a, [k]: valor }));
  // A ficha é a fonte do forno: o prato ligado a ela avisa quando ficou diferente.
  const daFicha = fichaDo(fichas, v.codFicha);
  const difere = diferencasDoForno(v, daFicha?.forno);
  const texto = (k: "modo" | "temperatura" | "umidade" | "tempo" | "sonda" | "processoD1", rotulo: string, max: number) => (
    <label>
      <span className="label">{rotulo}</span>
      <Input value={v[k]} onChange={(e) => muda(k, e.target.value)} maxLength={max} />
    </label>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarPrato(id, v),
          (r) => {
            avisar?.(r.message ?? null);
            // Sugestão de prato novo ainda não existe na lista: não adianta buscar por ele.
            if (!r.message) criado?.(v.nome.trim());
            fechar();
          },
        );
      }}
      className="card space-y-4 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => muda("nome", e.target.value)} required maxLength={100} autoFocus={id === null} />
        </label>
        <label>
          <span className="label">Grupo</span>
          <select value={v.grupoId} onChange={(e) => muda("grupoId", Number(e.target.value))} className="field">
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Categoria</span>
          <Input
            value={v.categoria}
            onChange={(e) => muda("categoria", e.target.value)}
            maxLength={40}
            list="categorias-do-buffet"
            placeholder="Ex.: Bovino"
          />
        </label>
        <label>
          <span className="label">Custo por kg (R$)</span>
          {fichaDo(fichas, v.codFicha)?.porKg != null ? (
            <span className="flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 text-sm">
              {custoKgTexto(fichaDo(fichas, v.codFicha)!.porKg!)} · da ficha {fichaDo(fichas, v.codFicha)!.nome}
            </span>
          ) : (
            <Input inputMode="decimal" value={v.custoKg} onChange={(e) => muda("custoKg", e.target.value)} placeholder="vazio = sem custo" />
          )}
        </label>
        <label>
          <span className="label">Código da ficha no Receituário</span>
          <Input value={v.codFicha} onChange={(e) => muda("codFicha", e.target.value)} maxLength={20} placeholder="Ex.: 264C" />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Ressalva do custo</span>
          <Textarea
            value={v.alertaCusto}
            onChange={(e) => muda("alertaCusto", e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex.: preço estimado, falta rendimento"
          />
        </label>
      </div>

      {difere.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <p className="font-medium">O forno da ficha {daFicha?.nome} é outro:</p>
          <ul className="mt-1 text-[var(--muted-foreground)]">
            {difere.map((d) => (
              <li key={d.k}>
                {d.rotulo}: {d.daFicha}
                {d.noPrato ? ` (aqui ${d.noPrato})` : " (aqui vazio)"}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-10"
            onClick={() => {
              setV((a) => ({ ...a, ...Object.fromEntries(difere.map((d) => [d.k, d.daFicha])) }));
              setForno(true);
            }}
          >
            Puxar o forno da ficha
          </Button>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setForno(!forno)}
          aria-expanded={forno}
          className="text-sm font-semibold underline-offset-2 hover:underline"
        >
          {forno ? "▾" : "▸"} Forno combinado e produção
        </button>
        {forno && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Opcoes rotulo="Viabilidade no combinado" rotulos={VIABILIDADE_FORNO} valor={v.viabilidade} mudar={(x) => muda("viabilidade", x)} />
            <label>
              <span className="label">Cor no cardápio</span>
              <select value={v.corForno} onChange={(e) => muda("corForno", e.target.value as CorForno)} className="field">
                {(Object.keys(COR_FORNO) as CorForno[]).map((c) => (
                  <option key={c} value={c}>
                    {COR_FORNO[c].nome}
                  </option>
                ))}
              </select>
            </label>
            <Opcoes rotulo="Posto" rotulos={POSTO_BUFFET} valor={v.posto} mudar={(x) => muda("posto", x)} />
            <Opcoes rotulo="Carga do forno" rotulos={nomes(CARGA_FORNO)} valor={v.carga} mudar={(x) => muda("carga", x)} />
            <Opcoes rotulo="Janela de produção" rotulos={nomes(JANELA_PRODUCAO)} valor={v.janela} mudar={(x) => muda("janela", x)} />
            {texto("modo", "Modo", 60)}
            {texto("temperatura", "Temperatura", 30)}
            {texto("umidade", "Umidade", 30)}
            {texto("tempo", "Tempo", 40)}
            {texto("sonda", "Sonda (núcleo)", 20)}
            {texto("processoD1", "O que se adianta na véspera", 200)}
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
              <input type="checkbox" checked={v.defumar} onChange={(e) => muda("defumar", e.target.checked)} className="size-4" />
              Passa pela defumação
            </label>
            <label className="sm:col-span-2">
              <span className="label">Ajuste necessário</span>
              <Textarea value={v.ajuste} onChange={(e) => muda("ajuste", e.target.value)} maxLength={1000} rows={2} />
            </label>
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {id === null ? "Criar prato" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        {id !== null && ativo !== undefined && (
          <Button
            type="button"
            variant="outline"
            className="ml-auto sm:hidden"
            disabled={pendente}
            onClick={() =>
              rodar(
                () => ligarPrato(id, !ativo),
                (r) => {
                  avisar?.(r.message ?? null);
                  fechar();
                },
              )
            }
          >
            {ativo ? "Desligar" : "Ligar"}
          </Button>
        )}
      </div>
    </form>
  );
}
