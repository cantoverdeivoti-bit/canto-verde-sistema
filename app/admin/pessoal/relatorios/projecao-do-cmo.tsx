"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  linhaDoCmo,
  projecaoDoMes,
  situacaoDaMeta,
  type FonteDoFaturamento,
  type ItemDeCusto,
  type PessoaDoCmo,
} from "@/lib/cmo";
import { formatMoney, plural } from "@/lib/format";
import { TIPO } from "@/lib/tipos-de-contrato";

import { COR_DA_META } from "./cores-da-meta";

const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const um = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * A projeção do mês padrão, com a simulação: cada pessoa tem um botão para
 * entrar ou sair da conta. Começa com a equipe ativa; os desligados ficam
 * embaixo, para simular a volta de alguém. Nada daqui grava no cadastro.
 */
export function ProjecaoDoCmo({
  pessoas,
  itens,
  faturamentoMensal,
  fonte,
  meta,
}: {
  pessoas: PessoaDoCmo[];
  itens: ItemDeCusto[];
  faturamentoMensal: number | null;
  fonte: FonteDoFaturamento;
  meta: number | null;
}) {
  const daEquipe = useMemo(
    () => new Set(pessoas.filter((p) => p.ativo).map((p) => p.id)),
    [pessoas],
  );
  const [incluidos, setIncluidos] = useState<Set<number>>(daEquipe);
  const p = projecaoDoMes({ pessoas, itens, faturamentoMensal, incluidos });
  const situacao = situacaoDaMeta(p.percentual, meta);
  const simulando =
    incluidos.size !== daEquipe.size ||
    [...incluidos].some((id) => !daEquipe.has(id));

  const alternar = (id: number) =>
    setIncluidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  // "R$ 9.900,00 + R$ 2.871,00 de encargos + R$ 520,00 de benefícios".
  const detalhe = (base: string, m: { encargos: number; beneficios: number }) =>
    [
      base,
      m.encargos > 0 ? `${formatMoney(m.encargos)} de encargos` : null,
      m.beneficios > 0 ? `${formatMoney(m.beneficios)} de benefícios` : null,
    ]
      .filter(Boolean)
      .join(" + ");
  const partes = [
    {
      nome: "CLT",
      valor: p.clt.total,
      cor: "var(--primary)",
      detalhe: detalhe(formatMoney(p.clt.base), p.clt),
    },
    {
      nome: "Fixo sem registro",
      valor: p.fixo.total,
      cor: "var(--muted-foreground)",
      detalhe: detalhe(formatMoney(p.fixo.base), p.fixo),
    },
    {
      nome: "Free lancer",
      valor: p.free.total,
      cor: "var(--warn)",
      detalhe: detalhe(`${um(p.free.diasNoMes)} diárias`, p.free),
    },
  ].filter((x) => x.valor > 0);

  const ordem = (a: PessoaDoCmo, b: PessoaDoCmo) =>
    linhaDoCmo(b, itens).total - linhaDoCmo(a, itens).total ||
    a.nome.localeCompare(b.nome, "pt-BR");
  const ativos = pessoas.filter((x) => x.ativo).sort(ordem);
  const desligados = pessoas.filter((x) => !x.ativo).sort(ordem);

  return (
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">
            {simulando ? "Simulação" : "Mês padrão com a equipe de hoje"}
          </h2>
          {simulando && (
            <button
              type="button"
              onClick={() => setIncluidos(new Set(daEquipe))}
              className="ml-auto flex items-center gap-1 text-sm text-[var(--primary)] underline underline-offset-4"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Voltar à equipe de hoje
            </button>
          )}
        </div>

        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {formatMoney(p.total)}
        </p>
        <p className="mt-1 text-sm">
          {p.percentual === null || p.faturamento === null || !fonte ? (
            <span className="text-[var(--muted-foreground)]">
              Sem faturamento para comparar. Digite o de um mês em CMO x
              faturamento, aqui embaixo.
            </span>
          ) : (
            <>
              <strong
                className="tabular-nums"
                style={
                  situacao ? { color: COR_DA_META[situacao].cor } : undefined
                }
              >
                {pct(p.percentual)}
              </strong>{" "}
              do faturamento
              <span className="text-[var(--muted-foreground)]">
                {" "}
                ({formatMoney(p.faturamento)} num mês,{" "}
                {fonte.de === "meses"
                  ? `média ${fonte.quantos === 1 ? "do último mês digitado" : `dos últimos ${fonte.quantos} meses digitados`}`
                  : `pela média de ${plural(fonte.quantos, "semana", "semanas")} do orçamento de Compras`}
                )
              </span>
            </>
          )}
        </p>
        {meta !== null && (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted-foreground)]">
              Meta: até {pct(meta)}
            </span>
            {situacao && (
              <span
                className="selo"
                style={{
                  color: COR_DA_META[situacao].cor,
                  background: COR_DA_META[situacao].fundo,
                }}
              >
                {COR_DA_META[situacao].texto}
              </span>
            )}
          </p>
        )}

        {p.total > 0 && (
          <div className="mt-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-[var(--muted)]">
              {partes.map((x) => (
                <span
                  key={x.nome}
                  style={{
                    width: `${(x.valor / p.total) * 100}%`,
                    background: x.cor,
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {partes.map((x) => (
                <li key={x.nome} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ background: x.cor }}
                  />
                  <span className="min-w-0 flex-1">
                    {x.nome}
                    <span className="block text-xs text-[var(--muted-foreground)] tabular-nums">
                      {x.detalhe}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(x.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.semValor > 0 && (
          <p className="msg-warn mt-3 text-sm">
            {plural(p.semValor, "pessoa está", "pessoas estão")} sem salário ou
            diária no cadastro. O custo delas não entrou.
          </p>
        )}

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Encargos e benefícios ·{" "}
            <span className="tabular-nums">{formatMoney(p.encargos + p.beneficios)}</span>
          </summary>
          {p.itens.length === 0 ? (
            <p className="mt-1.5 text-[var(--muted-foreground)]">Nenhum item entra na conta.</p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {p.itens.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{i.nome}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {i.natureza === "ENCARGO" ? "encargo" : "benefício"}
                  </span>
                  <span className="w-24 text-right tabular-nums">{formatMoney(i.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/pessoal/encargos-e-beneficios"
            className="mt-1.5 inline-block text-[var(--primary)] underline underline-offset-4"
          >
            Editar em Cadastros
          </Link>
        </details>
        {p.descontos > 0 && (
          <p className="hint mt-2">
            Descontos da equipe (INSS do colaborador, sindicato): {formatMoney(p.descontos)} por mês. Saem do salário de cada
            um e não entram no CMO.
          </p>
        )}
      </section>

      {/* Recolhida: a lista é longa e empurraria o CMO x faturamento para o fim da tela. */}
      <details>
        <summary className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium">
          Por pessoa e simulação · {ativos.length}
          <span className="block text-xs font-normal text-[var(--muted-foreground)]">
            Ligue e desligue cada um para ver o custo sem ele. O cadastro não
            muda.
          </span>
        </summary>
        <div className="mt-2">
          {ativos.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhum colaborador ativo.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {ativos.map((x) => (
                <Linha
                  key={x.id}
                  pessoa={x}
                  itens={itens}
                  dentro={incluidos.has(x.id)}
                  alternar={alternar}
                />
              ))}
            </ul>
          )}

          {desligados.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">
                Desligados · {desligados.length}
                <span className="font-normal text-[var(--muted-foreground)]">
                  {" "}
                  para simular a volta
                </span>
              </summary>
              <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                {desligados.map((x) => (
                  <Linha
                    key={x.id}
                    pessoa={x}
                    itens={itens}
                    dentro={incluidos.has(x.id)}
                    alternar={alternar}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      </details>
    </>
  );
}

/** Uma pessoa na conta, com o botão de entrar e sair da simulação. */
function Linha({
  pessoa,
  itens,
  dentro,
  alternar,
}: {
  pessoa: PessoaDoCmo;
  itens: ItemDeCusto[];
  dentro: boolean;
  alternar: (id: number) => void;
}) {
  const l = linhaDoCmo(pessoa, itens);
  const extras = [
    l.encargos > 0 ? `${formatMoney(l.encargos)} enc.` : null,
    l.beneficios > 0 ? `${formatMoney(l.beneficios)} benef.` : null,
  ].filter(Boolean);
  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 ${dentro ? "" : "opacity-50"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={dentro}
        aria-label={`${dentro ? "Tirar" : "Pôr"} ${pessoa.nome} na conta`}
        onClick={() => alternar(pessoa.id)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${dentro ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${dentro ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{pessoa.nome}</span>
          <span className="selo shrink-0" style={TIPO[pessoa.tipo].selo}>
            {TIPO[pessoa.tipo].curto}
          </span>
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {pessoa.tipo === "FREELANCER"
            ? pessoa.diasPorSemana === 0
              ? "fora da escala fixa"
              : `${plural(pessoa.diasPorSemana, "dia", "dias")} por semana · ${um(l.diasNoMes)} diárias${l.semValor ? " · sem valor da diária" : ""}${extras.length ? ` + ${extras.join(" + ")}` : ""}`
            : l.semValor
              ? "sem salário no cadastro"
              : extras.length
                ? `${formatMoney(l.salario)} + ${extras.join(" + ")}`
                : "só salário"}
        </p>
      </div>
      <span className="shrink-0 font-semibold tabular-nums">
        {l.semValor && l.total === 0 ? "—" : formatMoney(l.total)}
      </span>
    </li>
  );
}
