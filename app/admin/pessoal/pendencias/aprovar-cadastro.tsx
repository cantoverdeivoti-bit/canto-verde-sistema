"use client";

import { Check, MessageCircle, Phone, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aprovarCadastro, recusarCadastro } from "@/lib/actions/pessoal";
import { formatMoney, lerNumeroBR } from "@/lib/format";
import type { OpcaoDeFuncao } from "@/lib/funcoes";
import type { TipoContrato } from "@/lib/tipos-de-contrato";
import type { AprovacaoInput } from "@/lib/validations";

import { EscolhaDeContrato } from "../escolha-de-contrato";
import { NovoBeneficio } from "../novo-beneficio";

export type CadastroPendente = {
  id: number;
  nome: string;
  tipo: TipoContrato;
  telefone: string | null;
  telefoneLigar: string | null;
  whatsApp: string | null;
  /** Nulo também quando quem vê não configura o módulo. */
  cpf: string | null;
  nascimento: string | null;
  endereco: string | null;
  emergencia: { nome: string | null; telefone: string | null; telefoneLigar: string | null } | null;
  enviado: string;
  /** Quem já tem o mesmo CPF ou telefone: a pessoa mandou duas vezes, ou já trabalha aqui. */
  repetido: string | null;
};

const rotulo = "mb-1 block text-sm font-medium";

/**
 * Um cadastro que chegou pelo link: em cima o que a pessoa mandou, embaixo o
 * que a casa completa para ela entrar na escala.
 */
/** Um benefício do cadastro, como o cartão precisa. */
export type BeneficioDoCartao = {
  id: number;
  nome: string;
  forma: "PERCENTUAL_SALARIO" | "POR_MES" | "POR_DIA";
  valor: number;
  tipos: TipoContrato[];
};

const UNIDADE: Record<BeneficioDoCartao["forma"], string> = {
  PERCENTUAL_SALARIO: "% sal.",
  POR_MES: "/mês",
  POR_DIA: "/dia",
};
const paraCampo = (n: number) => n.toFixed(2).replace(".", ",");

export function AprovarCadastro({
  cadastro: c,
  podeAprovar,
  funcoes,
  beneficios: doCadastro,
}: {
  cadastro: CadastroPendente;
  podeAprovar: boolean;
  funcoes: OpcaoDeFuncao[];
  beneficios: BeneficioDoCartao[];
}) {
  const [v, setV] = useState<AprovacaoInput>({
    tipo: c.tipo,
    area: "",
    funcaoId: "",
    apelido: "",
    comecouEm: "",
    admissao: "",
    salario: "",
    diaria: "",
  });
  const [recusando, setRecusando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const muda = <K extends keyof AprovacaoInput>(k: K, valor: AprovacaoInput[K]) => setV((a) => ({ ...a, [k]: valor }));
  const porMes = v.tipo !== "FREELANCER";

  // Os benefícios: os do cadastro mais os criados aqui. "recebe" nulo segue o
  // tipo escolhido no cartão, e muda junto com ele até alguém mexer.
  const [criados, setCriados] = useState<BeneficioDoCartao[]>([]);
  // O criado aqui também volta do servidor quando a página recarrega: sem repetir.
  const beneficios = [...doCadastro, ...criados.filter((n) => !doCadastro.some((d) => d.id === n.id))];
  const [escolhas, setEscolhas] = useState<Record<number, { recebe: boolean | null; valor: string }>>({});
  const escolhaDe = (b: BeneficioDoCartao) => escolhas[b.id] ?? { recebe: null, valor: paraCampo(b.valor) };
  const recebe = (b: BeneficioDoCartao) => escolhaDe(b).recebe ?? b.tipos.includes(v.tipo);
  const mudaBeneficio = (b: BeneficioDoCartao, novo: Partial<{ recebe: boolean | null; valor: string }>) =>
    setEscolhas((e) => ({ ...e, [b.id]: { ...escolhaDe(b), ...novo } }));
  // O resumo soma o que é por mês; o por dia depende da escala fixa, que a pessoa ainda não tem.
  const base = lerNumeroBR(porMes ? v.salario : "") ?? 0;
  const porMesNoResumo = beneficios
    .filter((b) => recebe(b) && b.forma === "POR_MES")
    .reduce((t, b) => t + (lerNumeroBR(escolhaDe(b).valor) ?? 0), 0);
  const temPorDia = beneficios.some((b) => recebe(b) && b.forma === "POR_DIA");

  function aprovar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await aprovarCadastro(
        c.id,
        v,
        beneficios.map((b) => ({ itemId: b.id, recebe: recebe(b), valor: escolhaDe(b).valor })),
      );
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  }

  function recusar() {
    setErro(null);
    startTransition(async () => {
      const r = await recusarCadastro(c.id);
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  }

  const dados: [string, React.ReactNode][] = [
    ...(c.cpf ? [["CPF", <span key="cpf" className="tabular-nums">{c.cpf}</span>] as [string, React.ReactNode]] : []),
    ...(c.nascimento ? [["Nascimento", c.nascimento] as [string, React.ReactNode]] : []),
    ...(c.endereco ? [["Endereço", c.endereco] as [string, React.ReactNode]] : []),
    ...(c.emergencia
      ? [
          [
            "Emergência",
            <span key="em">
              {[c.emergencia.nome, c.emergencia.telefone].filter(Boolean).join(" · ")}
              {c.emergencia.telefoneLigar && (
                <a
                  href={`tel:${c.emergencia.telefoneLigar}`}
                  className="ml-1.5 text-[var(--primary)] underline underline-offset-4"
                >
                  ligar
                </a>
              )}
            </span>,
          ] as [string, React.ReactNode],
        ]
      : []),
  ];

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      {/* ---- O que a pessoa mandou ---- */}
      <div className="p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c.nome}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {c.telefone && <span className="tabular-nums">{c.telefone} · </span>}
              enviado {c.enviado}
            </p>
          </div>
          {c.telefoneLigar && (
            <div className="flex shrink-0 gap-1">
              {c.whatsApp && (
                <a
                  href={c.whatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir conversa com ${c.nome} no WhatsApp (nova aba)`}
                  title="WhatsApp"
                  className="flex size-9 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-strong)] hover:opacity-80"
                >
                  <MessageCircle aria-hidden className="size-5" />
                </a>
              )}
              <a
                href={`tel:${c.telefoneLigar}`}
                aria-label={`Ligar para ${c.nome}`}
                title="Ligar"
                className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
              >
                <Phone aria-hidden className="size-[18px]" />
              </a>
            </div>
          )}
        </div>

        {c.repetido && (
          <p className="msg-warn mt-3 text-sm">{c.repetido}</p>
        )}

        {dados.length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {dados.map(([nome, valor]) => (
              <div key={nome} className="contents">
                <dt className="text-[var(--muted-foreground)]">{nome}</dt>
                <dd className="break-words">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* ---- O que a casa completa ---- */}
      {podeAprovar ? (
        <form onSubmit={aprovar} className="space-y-3 border-t border-[var(--border)] bg-[var(--muted)]/40 p-3">
          <EscolhaDeContrato valor={v.tipo} onChange={(t) => muda("tipo", t)} />

          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={rotulo}>Equipe</span>
              <select
                value={v.area}
                onChange={(e) => muda("area", e.target.value as AprovacaoInput["area"])}
                className="field w-full"
              >
                <option value="">Cozinha e salão</option>
                <option value="COZINHA">Cozinha</option>
                <option value="SALAO">Salão</option>
              </select>
            </label>
            <label>
              <span className={rotulo}>Função</span>
<select
                value={v.funcaoId}
                onChange={(e) => muda("funcaoId", e.target.value)}
                className="field w-full"
              >
                <option value="">Sem função</option>
                {funcoes.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={rotulo}>Apelido na escala</span>
              <Input
                value={v.apelido}
                onChange={(e) => muda("apelido", e.target.value)}
                maxLength={40}
                placeholder={c.nome.split(/\s+/)[0]}
              />
            </label>
            <label>
              <span className={rotulo}>Começou na casa</span>
              <Input type="date" value={v.comecouEm} onChange={(e) => muda("comecouEm", e.target.value)} />
            </label>
            {v.tipo === "CLT" && (
              <label>
                <span className={rotulo}>
                  Carteira assinada <span className="font-normal text-[var(--muted-foreground)]">(as férias contam daqui)</span>
                </span>
                <Input type="date" value={v.admissao} onChange={(e) => muda("admissao", e.target.value)} />
              </label>
            )}
            {porMes ? (
              <>
                <label>
                  <span className={rotulo}>Salário por mês</span>
                  <Input
                    value={v.salario}
                    onChange={(e) => muda("salario", e.target.value)}
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                  />
                </label>
              </>
            ) : (
              <label>
                <span className={rotulo}>Diária</span>
                <Input
                  value={v.diaria}
                  onChange={(e) => muda("diaria", e.target.value)}
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                />
              </label>
            )}
          </div>

          {/* ---- Benefícios ---- */}
          {/* min-w-0: fieldset nasce com a largura mínima do conteúdo e vazaria do cartão no celular. */}
          <fieldset className="min-w-0 space-y-2">
            <legend className={rotulo}>Benefícios</legend>
            {beneficios.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhum benefício no cadastro ainda.</p>
            )}
            {beneficios.map((b) => {
              const dentro = recebe(b);
              return (
                <div key={b.id} className={`flex items-center gap-2 ${dentro ? "" : "opacity-60"}`}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dentro}
                    aria-label={`${dentro ? "Tirar" : "Pôr"} ${b.nome}`}
                    onClick={() => mudaBeneficio(b, { recebe: !dentro })}
                    className={`relative h-6 w-10 shrink-0 rounded-full transition ${dentro ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
                  >
                    <span
                      aria-hidden
                      className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${dentro ? "left-[18px]" : "left-0.5"}`}
                    />
                  </button>
                  <span className="min-w-0 flex-1 text-sm leading-tight font-medium break-words">{b.nome}</span>
                  <Input
                    value={escolhaDe(b).valor}
                    onChange={(e) => mudaBeneficio(b, { valor: e.target.value })}
                    inputMode="decimal"
                    aria-label={`Valor de ${b.nome}`}
                    disabled={!dentro}
                    className="h-9 min-h-9! w-20 px-2 text-right"
                  />
                  <span className="w-10 shrink-0 text-xs text-[var(--muted-foreground)]">{UNIDADE[b.forma]}</span>
                </div>
              );
            })}
            <NovoBeneficio
              aoCriar={(n) => {
                setCriados((l) => [...l, { id: n.id, nome: n.nome, forma: n.forma, valor: n.valor, tipos: [] }]);
                setEscolhas((e) => ({ ...e, [n.id]: { recebe: true, valor: paraCampo(n.valor) } }));
              }}
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Os encargos (13º, férias, FGTS) entram sozinhos pelo tipo.
              {temPorDia && " O valor por dia conta quando a pessoa entrar na escala fixa."}
            </p>
            {(base > 0 || porMesNoResumo > 0) && (
              <p className="text-sm">
                {[base > 0 ? `Salário ${formatMoney(base)}` : null, porMesNoResumo > 0 ? `${formatMoney(porMesNoResumo)} de benefícios` : null]
                  .filter(Boolean)
                  .join(" + ")}{" "}
                por mês
              </p>
            )}
          </fieldset>

          {erro && (
            <p role="alert" className="msg-error">
              {erro}
            </p>
          )}

          {recusando ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Recusar e apagar o cadastro de {c.nome.split(/\s+/)[0]}?</span>
              <Button type="button" variant="destructive" className="h-10" disabled={pendente} onClick={recusar}>
                Recusar
              </Button>
              <Button type="button" variant="ghost" className="h-10" onClick={() => setRecusando(false)}>
                voltar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="submit" className="h-11 flex-1 gap-1.5" disabled={pendente}>
                <Check aria-hidden className="size-4" />
                {pendente ? "Aprovando…" : "Aprovar"}
              </Button>
              <button
                type="button"
                onClick={() => setRecusando(true)}
                aria-label={`Recusar o cadastro de ${c.nome}`}
                title="Recusar"
                className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </form>
      ) : (
        <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Quem configura o Departamento pessoal completa e aprova este cadastro.
        </p>
      )}
    </article>
  );
}
