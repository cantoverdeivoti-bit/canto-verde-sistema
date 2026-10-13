"use client";

import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apagarCategoria,
  apagarSubgrupo,
  ligarCategoria,
  ligarSubgrupo,
  moverLancamentosDeCategoria,
  moverNoPlano,
  salvarCategoria,
  salvarSubgrupo,
} from "@/lib/actions/financeiro";
import { opcoes } from "@/lib/eventos";
import { DICA_DO_GRUPO, GRUPO_DRE, NATUREZA_DA_CATEGORIA, NATUREZAS_DO_GRUPO } from "@/lib/financeiro";
import { plural } from "@/lib/format";
import type { GrupoDre, TipoLancamento } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Categoria = {
  id: number;
  nome: string;
  tipo: TipoLancamento;
  grupo: GrupoDre;
  subgrupoId: number;
  sistema: boolean;
  /** Só guarda código contábil (taxas, descontos): não recebe lançamento. */
  soCodigo: boolean;
  ativo: boolean;
  usos: number;
  codigoContabil: string;
  centroPadraoId: number | null;
  centroPadrao: string | null;
};
type Subgrupo = { id: number; nome: string; grupo: GrupoDre; ativo: boolean; categorias: Categoria[] };
type Centro = { id: number; nome: string };

/** O que está aberto na tela: no máximo um formulário ou uma barra de ações por vez. */
type Aberto =
  | { tipo: "novo-subgrupo" }
  | { tipo: "nova-categoria"; subgrupoId?: number }
  | { tipo: "subgrupo"; id: number; modo: "acoes" | "editar" }
  | { tipo: "categoria"; id: number; modo: "acoes" | "editar" | "mover" }
  | null;

export function PlanoDeContas({ subgrupos, centros }: { subgrupos: Subgrupo[]; centros: Centro[] }) {
  const [aberto, setAberto] = useState<Aberto>(null);
  const todas = subgrupos.flatMap((s) => s.categorias);
  const semCodigo = todas.filter((c) => c.ativo && !c.codigoContabil).length;
  const fechar = () => setAberto(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11 gap-1.5" onClick={() => setAberto(aberto?.tipo === "nova-categoria" ? null : { tipo: "nova-categoria" })}>
          <Plus aria-hidden className="size-4" />
          Nova categoria
        </Button>
        <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setAberto(aberto?.tipo === "novo-subgrupo" ? null : { tipo: "novo-subgrupo" })}>
          <Plus aria-hidden className="size-4" />
          Novo subgrupo
        </Button>
      </div>
      {semCodigo > 0 && (
        <p className="hint">{plural(semCodigo, "categoria ligada está", "categorias ligadas estão")} sem código contábil. Sem ele, a linha sai em branco na exportação para o contador.</p>
      )}
      {aberto?.tipo === "novo-subgrupo" && <SubgrupoForm id={null} inicial={{ nome: "", grupo: "OPERACIONAL" }} fechar={fechar} />}
      {aberto?.tipo === "nova-categoria" && aberto.subgrupoId === undefined && (
        <CategoriaForm id={null} sistema={false} subgrupos={subgrupos} centros={centros} inicial={categoriaVazia(subgrupos)} fechar={fechar} />
      )}

      {opcoes(GRUPO_DRE).map((g) => {
        const doGrupo = subgrupos.filter((s) => s.grupo === g.valor);
        return (
          <section key={g.valor} aria-labelledby={`g-${g.valor}`}>
            <h2 id={`g-${g.valor}`} className="section-label mb-2">
              {g.texto} <span className="font-normal normal-case tracking-normal">· {DICA_DO_GRUPO[g.valor]}</span>
            </h2>
            {doGrupo.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhum subgrupo. Crie um em &quot;Novo subgrupo&quot; para lançar nesta linha.</p>
            ) : (
              <div className="space-y-3">
                {doGrupo.map((s, i) => (
                  <SubgrupoCard
                    key={s.id}
                    s={s}
                    primeiro={i === 0}
                    ultimo={i === doGrupo.length - 1}
                    subgrupos={subgrupos}
                    todas={todas}
                    centros={centros}
                    aberto={aberto}
                    setAberto={setAberto}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function categoriaVazia(subgrupos: Subgrupo[], subgrupoId?: number) {
  const s = subgrupos.find((x) => x.id === subgrupoId) ?? subgrupos.find((x) => x.grupo === "OPERACIONAL" && x.ativo) ?? subgrupos[0];
  return { nome: "", tipo: NATUREZAS_DO_GRUPO[s?.grupo ?? "OPERACIONAL"][0], subgrupoId: s?.id ?? 0, codigoContabil: "", centroPadraoId: null };
}

function SubgrupoCard({
  s,
  primeiro,
  ultimo,
  subgrupos,
  todas,
  centros,
  aberto,
  setAberto,
}: {
  s: Subgrupo;
  primeiro: boolean;
  ultimo: boolean;
  subgrupos: Subgrupo[];
  todas: Categoria[];
  centros: Centro[];
  aberto: Aberto;
  setAberto: (a: Aberto) => void;
}) {
  const { erro, pendente, rodar } = useAcao();
  const [apagando, setApagando] = useState(false);
  const fechar = () => setAberto(null);
  const acoesAbertas = aberto?.tipo === "subgrupo" && aberto.id === s.id && aberto.modo === "acoes";
  const editando = aberto?.tipo === "subgrupo" && aberto.id === s.id && aberto.modo === "editar";

  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] ${s.ativo ? "" : "opacity-70"}`}>
      {editando ? (
        <div className="p-3">
          <SubgrupoForm id={s.id} inicial={{ nome: s.nome, grupo: s.grupo }} fechar={fechar} />
        </div>
      ) : (
        <div className="flex min-h-11 items-center gap-2 bg-[var(--muted)]/50 px-3 py-1.5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {s.nome}
            <span className="font-normal text-[var(--muted-foreground)]">
              {" "}
              · {plural(s.categorias.length, "categoria")}
              {!s.ativo && " · desligado"}
            </span>
          </p>
          <BotaoIcone rotulo={`Ações de ${s.nome}`} onClick={() => setAberto(acoesAbertas ? null : { tipo: "subgrupo", id: s.id, modo: "acoes" })}>
            <MoreHorizontal aria-hidden className="size-4" />
          </BotaoIcone>
        </div>
      )}
      {acoesAbertas && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] px-3 py-2">
          {apagando ? (
            <>
              <span className="text-sm">Apagar o subgrupo {s.nome}?</span>
              <Button type="button" size="sm" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarSubgrupo(s.id), fechar)}>
                Apagar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setApagando(false)}>
                voltar
              </Button>
            </>
          ) : (
            <>
              <OrdemBotoes primeiro={primeiro} ultimo={ultimo} pendente={pendente} mover={(d) => rodar(() => moverNoPlano("subgrupo", s.id, d))} />
              <Button type="button" size="sm" onClick={() => setAberto({ tipo: "subgrupo", id: s.id, modo: "editar" })}>
                Renomear
              </Button>
              <Button type="button" size="sm" onClick={() => setAberto({ tipo: "nova-categoria", subgrupoId: s.id })}>
                Nova categoria aqui
              </Button>
              <Button type="button" size="sm" disabled={pendente} onClick={() => rodar(() => ligarSubgrupo(s.id, !s.ativo))}>
                {s.ativo ? "Desligar" : "Ligar"}
              </Button>
              {s.categorias.length === 0 && (
                <Button type="button" size="sm" variant="destructive" onClick={() => setApagando(true)}>
                  Apagar
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {erro && (
        <p role="alert" className="msg-error mx-3 my-2">
          {erro}
        </p>
      )}
      {aberto?.tipo === "nova-categoria" && aberto.subgrupoId === s.id && (
        <div className="border-t border-[var(--border)] p-3">
          <CategoriaForm id={null} sistema={false} subgrupos={subgrupos} centros={centros} inicial={categoriaVazia(subgrupos, s.id)} fechar={fechar} />
        </div>
      )}
      {s.categorias.length > 0 && (
        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {s.categorias.map((c, i) => (
            <CategoriaLinha
              key={c.id}
              c={c}
              primeira={i === 0}
              ultima={i === s.categorias.length - 1}
              subgrupos={subgrupos}
              todas={todas}
              centros={centros}
              aberto={aberto}
              setAberto={setAberto}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoriaLinha({
  c,
  primeira,
  ultima,
  subgrupos,
  todas,
  centros,
  aberto,
  setAberto,
}: {
  c: Categoria;
  primeira: boolean;
  ultima: boolean;
  subgrupos: Subgrupo[];
  todas: Categoria[];
  centros: Centro[];
  aberto: Aberto;
  setAberto: (a: Aberto) => void;
}) {
  const { erro, pendente, rodar } = useAcao();
  const [apagando, setApagando] = useState(false);
  const fechar = () => setAberto(null);
  const meu = aberto?.tipo === "categoria" && aberto.id === c.id ? aberto.modo : null;

  if (meu === "editar")
    return (
      <li className="p-3">
        <CategoriaForm
          id={c.id}
          sistema={c.sistema}
          grupoFixo={c.sistema ? c.grupo : undefined}
          subgrupos={subgrupos}
          centros={centros}
          centroAtual={c.centroPadraoId !== null && c.centroPadrao ? { id: c.centroPadraoId, nome: c.centroPadrao } : null}
          inicial={{ nome: c.nome, tipo: c.tipo, subgrupoId: c.subgrupoId, codigoContabil: c.codigoContabil, centroPadraoId: c.centroPadraoId }}
          fechar={fechar}
        />
      </li>
    );

  return (
    <li className={c.ativo ? "" : "opacity-60"}>
      <div className="flex min-h-12 items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.nome}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {NATUREZA_DA_CATEGORIA[c.tipo]}
            {c.codigoContabil ? ` · cód. ${c.codigoContabil}` : " · sem código"}
            {c.centroPadrao && ` · ${c.centroPadrao}`}
            {c.sistema && " · sistema"}
            {c.usos > 0 && ` · ${plural(c.usos, "uso")}`}
            {!c.ativo && " · desligada"}
          </p>
          {c.soCodigo && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Não recebe lançamento: guarda o código contábil {c.tipo === "PAGAR" ? "das taxas das maquininhas" : "dos descontos das baixas"}.
            </p>
          )}
        </div>
        <BotaoIcone rotulo={`Editar ${c.nome}`} onClick={() => setAberto({ tipo: "categoria", id: c.id, modo: "editar" })}>
          <Pencil aria-hidden className="size-4" />
        </BotaoIcone>
        <BotaoIcone rotulo={`Ações de ${c.nome}`} onClick={() => setAberto(meu === "acoes" ? null : { tipo: "categoria", id: c.id, modo: "acoes" })}>
          <MoreHorizontal aria-hidden className="size-4" />
        </BotaoIcone>
      </div>
      {meu === "acoes" && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2">
          {apagando ? (
            <>
              <span className="text-sm">Apagar {c.nome}?</span>
              <Button type="button" size="sm" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarCategoria(c.id), fechar)}>
                Apagar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setApagando(false)}>
                voltar
              </Button>
            </>
          ) : (
            <>
              <OrdemBotoes primeiro={primeira} ultimo={ultima} pendente={pendente} mover={(d) => rodar(() => moverNoPlano("categoria", c.id, d))} />
              {!c.sistema && (
                <Button type="button" size="sm" disabled={pendente} onClick={() => rodar(() => ligarCategoria(c.id, !c.ativo))}>
                  {c.ativo ? "Desligar" : "Ligar"}
                </Button>
              )}
              {!c.sistema && c.usos > 0 && (
                <Button type="button" size="sm" onClick={() => setAberto({ tipo: "categoria", id: c.id, modo: "mover" })}>
                  Passar lançamentos para outra
                </Button>
              )}
              {!c.sistema && c.usos === 0 && (
                <Button type="button" size="sm" variant="destructive" onClick={() => setApagando(true)}>
                  Apagar
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {meu === "mover" && <MoverLancamentos c={c} todas={todas} subgrupos={subgrupos} fechar={fechar} />}
      {erro && (
        <p role="alert" className="msg-error mx-3 mb-2">
          {erro}
        </p>
      )}
    </li>
  );
}

/** Junta duas categorias: tudo o que está nesta passa para a escolhida, e esta fica vazia. */
function MoverLancamentos({ c, todas, subgrupos, fechar }: { c: Categoria; todas: Categoria[]; subgrupos: Subgrupo[]; fechar: () => void }) {
  const destinos = todas.filter((x) => x.id !== c.id && x.tipo === c.tipo && x.ativo && !x.soCodigo);
  const [paraId, setParaId] = useState<number | null>(null);
  const { erro, pendente, rodar } = useAcao();
  return (
    <div className="space-y-2 border-t border-[var(--border)] bg-[var(--muted)]/40 px-3 py-3">
      <p className="text-sm">
        Passar {plural(c.usos, "lançamento e conta fixa", "lançamentos e contas fixas")} de <b>{c.nome}</b> para:
      </p>
      <SeletorDeCategoriaDoPlano
        categorias={destinos}
        subgrupos={subgrupos}
        value={paraId}
        onChange={setParaId}
        rotulo="Categoria de destino"
      />
      <p className="hint">Depois, {c.nome} fica vazia e pode ser apagada. Se a outra for de outro grupo, a DRE dos meses passados muda junto.</p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={pendente || paraId === null} onClick={() => paraId !== null && rodar(() => moverLancamentosDeCategoria(c.id, paraId), fechar)}>
          Passar
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          voltar
        </Button>
      </div>
    </div>
  );
}

/** Um select de categorias agrupado por "Grupo · Subgrupo", na ordem do plano. */
function SeletorDeCategoriaDoPlano({
  categorias,
  subgrupos,
  value,
  onChange,
  rotulo,
}: {
  categorias: Categoria[];
  subgrupos: Subgrupo[];
  value: number | null;
  onChange: (id: number | null) => void;
  rotulo: string;
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label={rotulo} className="field">
      <option value="">Escolha</option>
      {subgrupos
        .filter((s) => categorias.some((c) => c.subgrupoId === s.id))
        .map((s) => (
          <optgroup key={s.id} label={`${GRUPO_DRE[s.grupo]} · ${s.nome}`}>
            {categorias
              .filter((c) => c.subgrupoId === s.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}

function OrdemBotoes({ primeiro, ultimo, pendente, mover }: { primeiro: boolean; ultimo: boolean; pendente: boolean; mover: (d: -1 | 1) => void }) {
  return (
    <span className="flex gap-1">
      <Button type="button" size="sm" variant="outline" disabled={pendente || primeiro} onClick={() => mover(-1)} aria-label="Subir">
        <ArrowUp aria-hidden className="size-4" />
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pendente || ultimo} onClick={() => mover(1)} aria-label="Descer">
        <ArrowDown aria-hidden className="size-4" />
      </Button>
    </span>
  );
}

function BotaoIcone({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
    >
      {children}
    </button>
  );
}

function SubgrupoForm({ id, inicial, fechar }: { id: number | null; inicial: { nome: string; grupo: GrupoDre }; fechar: () => void }) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarSubgrupo(id, v), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Nome do subgrupo</span>
          <Input value={v.nome} onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))} required maxLength={60} autoFocus placeholder="Proteínas" />
        </label>
        <label>
          <span className="label">Linha da DRE</span>
          <select value={v.grupo} disabled={id !== null} onChange={(e) => setV((a) => ({ ...a, grupo: e.target.value as GrupoDre }))} className="field">
            {opcoes(GRUPO_DRE).map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.texto}
              </option>
            ))}
          </select>
          <span className="hint block">{id === null ? DICA_DO_GRUPO[v.grupo] : "A linha da DRE de um subgrupo não muda."}</span>
        </label>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Criar subgrupo" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          voltar
        </Button>
      </div>
    </form>
  );
}

type NoForm = { nome: string; tipo: TipoLancamento; subgrupoId: number; codigoContabil: string; centroPadraoId: number | null };

function CategoriaForm({
  id,
  sistema,
  grupoFixo,
  subgrupos,
  centros,
  centroAtual = null,
  inicial,
  fechar,
}: {
  id: number | null;
  sistema: boolean;
  /** Categoria do sistema: só pode trocar de subgrupo dentro desta linha da DRE. */
  grupoFixo?: GrupoDre;
  subgrupos: Subgrupo[];
  centros: Centro[];
  /** O centro sugerido de hoje, mesmo desligado, para salvar não apagar a sugestão sem aviso. */
  centroAtual?: Centro | null;
  inicial: NoForm;
  fechar: () => void;
}) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  const escolhido = subgrupos.find((s) => s.id === v.subgrupoId);
  const grupo = escolhido?.grupo ?? "OPERACIONAL";
  const naturezas = NATUREZAS_DO_GRUPO[grupo];
  const opcoesDeSubgrupo = subgrupos.filter((s) => (grupoFixo ? s.grupo === grupoFixo : s.ativo || s.id === inicial.subgrupoId));
  const opcoesDeCentro = centroAtual && !centros.some((c) => c.id === centroAtual.id) ? [...centros, { ...centroAtual, nome: `${centroAtual.nome} (desligado)` }] : centros;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarCategoria(id, v), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))} required maxLength={60} autoFocus />
        </label>
        <label>
          <span className="label">Subgrupo</span>
          <select
            value={v.subgrupoId}
            onChange={(e) => {
              const subgrupoId = Number(e.target.value);
              const g = subgrupos.find((s) => s.id === subgrupoId)?.grupo ?? grupo;
              setV((a) => ({ ...a, subgrupoId, tipo: NATUREZAS_DO_GRUPO[g].includes(a.tipo) ? a.tipo : NATUREZAS_DO_GRUPO[g][0] }));
            }}
            className="field"
          >
            {opcoes(GRUPO_DRE)
              .filter((g) => opcoesDeSubgrupo.some((s) => s.grupo === g.valor))
              .map((g) => (
                <optgroup key={g.valor} label={g.texto}>
                  {opcoesDeSubgrupo
                    .filter((s) => s.grupo === g.valor)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
          <span className="hint block">
            Cai em {GRUPO_DRE[grupo]} na DRE{sistema ? "; do sistema, não sai desta linha" : ""}.
          </span>
        </label>
        <label>
          <span className="label">Natureza</span>
          <select value={v.tipo} disabled={sistema || naturezas.length === 1} onChange={(e) => setV((a) => ({ ...a, tipo: e.target.value as TipoLancamento }))} className="field">
            {naturezas.map((t) => (
              <option key={t} value={t}>
                {NATUREZA_DA_CATEGORIA[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Código contábil</span>
          <Input value={v.codigoContabil} onChange={(e) => setV((a) => ({ ...a, codigoContabil: e.target.value }))} maxLength={20} placeholder="3.1.01" />
          <span className="hint block">O código desta conta no plano do escritório.</span>
        </label>
        <label>
          <span className="label">Centro sugerido</span>
          <select
            value={v.centroPadraoId ?? ""}
            onChange={(e) => setV((a) => ({ ...a, centroPadraoId: e.target.value ? Number(e.target.value) : null }))}
            className="field"
          >
            <option value="">Nenhum</option>
            {opcoesDeCentro.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <span className="hint block">Já vem escolhido ao lançar nesta categoria.</span>
        </label>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente || !escolhido}>
          {pendente ? "Salvando…" : id === null ? "Criar categoria" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          voltar
        </Button>
      </div>
    </form>
  );
}
