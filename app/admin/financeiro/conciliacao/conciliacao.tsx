"use client";

import { Check, FileUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apagarExtrato,
  conciliarLinha,
  desfazerConciliacao,
  ignorarLinha,
  importarExtrato,
  lancamentoDaLinha,
  transferenciaDaLinha,
} from "@/lib/actions/conciliacao";
import { diasEntre, diferencaDaConciliacao, somar, type Sugestao } from "@/lib/financeiro-calculo";
import type { DadosDaConciliacao, OpcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { formatDiaCurtoString, formatMoney, plural } from "@/lib/format";
import { decodificarOfx, type ExtratoOfx, lerOfx } from "@/lib/ofx";

import { useAcao } from "@/lib/use-acao";
import { OpcoesDeCategoria } from "../_comum/opcoes-de-categoria";

type Conta = { id: number; nome: string; contaNoBanco: string | null };
type Pendente = DadosDaConciliacao["pendentes"][number];
type Candidato = DadosDaConciliacao["candidatos"][number];

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Valor({ valor, className = "" }: { valor: number; className?: string }) {
  return (
    <span className={`num-display whitespace-nowrap ${className}`} style={valor < 0 ? { color: "var(--destructive)" } : undefined}>
      {valor > 0 ? "+" : ""}
      {formatMoney(valor)}
    </span>
  );
}

export function Conciliacao({
  conta,
  outrasContas,
  dados,
  opcoes,
}: {
  conta: Conta;
  outrasContas: Conta[];
  dados: DadosDaConciliacao;
  opcoes: OpcoesDoFinanceiro;
}) {
  const [verConciliadas, setVerConciliadas] = useState(false);
  const c = dados.comparacao;
  const diferenca = c ? Math.round((c.banco - c.sistema) * 100) / 100 : 0;

  return (
    <div className="space-y-6">
      <Importar conta={conta} outrasContas={outrasContas} />

      {c && (
        <section className={diferenca === 0 ? "card p-3 text-sm" : "msg-warn"}>
          <p>
            Saldo em {formatDiaCurtoString(c.saldoEm)}: no banco <span className="num-display">{formatMoney(c.banco)}</span>, no sistema{" "}
            <span className="num-display">{formatMoney(c.sistema)}</span>.
          </p>
          <p className="mt-1 font-semibold">
            {diferenca === 0
              ? "Batem."
              : `Diferença de ${formatMoney(Math.abs(diferenca))}${dados.pendentes.length > 0 ? ": concilie as linhas pendentes e confira de novo." : ". Confira o saldo inicial da conta e as baixas lançadas fora do extrato."}`}
          </p>
        </section>
      )}

      <section>
        <h2 className="section-label mb-2">
          Pendentes {dados.pendentes.length > 0 && `(${dados.pendentes.length})`}
        </h2>
        {dados.pendentes.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nada pendente nesta conta. Importe o extrato mais recente para continuar.</p>
        ) : (
          <ul className="space-y-2">
            {dados.pendentes.map((l) => (
              <LinhaPendente key={l.id} linha={l} candidatos={dados.candidatos} opcoes={opcoes} conta={conta} outrasContas={outrasContas} />
            ))}
          </ul>
        )}
      </section>

      {dados.conciliadas.length > 0 && (
        <section>
          <button type="button" className="section-label mb-2" aria-expanded={verConciliadas} onClick={() => setVerConciliadas(!verConciliadas)}>
            {verConciliadas ? "▾" : "▸"} Conciliadas recentes ({dados.conciliadas.length})
          </button>
          {verConciliadas && (
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm">
              {dados.conciliadas.map((l) => (
                <Resolvida key={l.id} id={l.id} data={l.data} valor={l.valor} descricao={l.descricao} detalhe={l.com} acao="Desfazer" />
              ))}
            </ul>
          )}
        </section>
      )}

      {dados.ignoradas.length > 0 && (
        <section>
          <h2 className="section-label mb-2">Ignoradas</h2>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm">
            {dados.ignoradas.map((l) => (
              <Resolvida key={l.id} id={l.id} data={l.data} valor={l.valor} descricao={l.descricao} detalhe="ignorada" acao="Voltar" />
            ))}
          </ul>
        </section>
      )}

      {dados.extratos.length > 0 && <Extratos extratos={dados.extratos} />}
    </div>
  );
}

/**
 * Ler o OFX no navegador: o arquivo não sobe, só as transações. Antes de
 * gravar, mostra o que leu, e avisa se o extrato parece ser de outra conta.
 */
function Importar({ conta, outrasContas }: { conta: Conta; outrasContas: Conta[] }) {
  const [lido, setLido] = useState<{ arquivo: string; extrato: ExtratoOfx } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const deOutra = lido?.extrato.conta ? outrasContas.find((c) => c.contaNoBanco === lido.extrato.conta) : undefined;

  async function ler(arquivo: File) {
    setFalha(null);
    setResultado(null);
    setLido(null);
    try {
      const extrato = lerOfx(decodificarOfx(new Uint8Array(await arquivo.arrayBuffer())));
      if (extrato.transacoes.length === 0) return setFalha("O arquivo não tem transações.");
      setLido({ arquivo: arquivo.name.slice(0, 160), extrato });
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <label className="btn-ghost cursor-pointer gap-1.5">
        <FileUp aria-hidden className="size-4" />
        Importar extrato OFX de {conta.nome}
        <input type="file" accept=".ofx,.OFX,application/x-ofx" className="sr-only" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
      </label>
      {lido && (
        <div className="space-y-2 text-sm">
          <p>
            {plural(lido.extrato.transacoes.length, "transação", "transações")}
            {lido.extrato.de && lido.extrato.ate && ` de ${formatDiaCurtoString(lido.extrato.de)} a ${formatDiaCurtoString(lido.extrato.ate)}`}
            {lido.extrato.saldoFinal !== null && `, saldo final ${formatMoney(lido.extrato.saldoFinal)}`}
            {lido.extrato.conta && ` (conta ${lido.extrato.conta} no banco)`}.
          </p>
          {deOutra && (
            <p className="msg-warn">
              Este extrato é da conta {lido.extrato.conta}, que é a {deOutra.nome}.{" "}
              <Link href={`/admin/financeiro/conciliacao?conta=${deOutra.id}`} className="font-semibold underline">
                Ir para {deOutra.nome}
              </Link>
            </p>
          )}
          {!deOutra && (
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={pendente}
                onClick={() =>
                  rodar(
                    () => importarExtrato(conta.id, { ...lido.extrato, arquivo: lido.arquivo }),
                    (r) => {
                      if (!r.ok) return;
                      const { novas, repetidas, antes } = r.data;
                      setResultado(
                        [
                          `${plural(novas, "linha nova", "linhas novas")}`,
                          repetidas > 0 ? `${plural(repetidas, "já estava importada", "já estavam importadas")}` : null,
                          antes > 0 ? `${antes} de antes do saldo inicial ficaram de fora` : null,
                        ]
                          .filter(Boolean)
                          .join(", ") + ".",
                      );
                      setLido(null);
                    },
                  )
                }
              >
                {pendente ? "Importando…" : "Importar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setLido(null)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
      {resultado && (
        <p role="status" className="text-sm font-semibold">
          {resultado}
        </p>
      )}
      {(falha || erro) && (
        <p role="alert" className="msg-error">
          {falha ?? erro}
        </p>
      )}
    </section>
  );
}

function LinhaPendente({
  linha,
  candidatos,
  opcoes,
  conta,
  outrasContas,
}: {
  linha: Pendente;
  candidatos: Candidato[];
  opcoes: OpcoesDoFinanceiro;
  conta: Conta;
  outrasContas: Conta[];
}) {
  const [modo, setModo] = useState<"escolher" | "criar" | "transferir" | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const aceitar = (s: Sugestao) =>
    rodar(() => (s.transferenciaId ? transferenciaDaLinha(linha.id, { transferenciaId: s.transferenciaId }) : conciliarLinha(linha.id, s.lancamentos)));

  return (
    <li className="card space-y-2 p-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 text-xs text-[var(--muted-foreground)]">{dataCurta(linha.data)}</span>
        <span className="min-w-0 flex-1 break-words">{linha.descricao}</span>
        <Valor valor={linha.valor} className="shrink-0" />
      </div>
      {linha.sugestoes.length > 0 && modo === null && (
        <div className="flex flex-col gap-1.5">
          {linha.sugestoes.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={pendente}
              onClick={() => aceitar(s)}
              className="flex items-center gap-2 rounded-lg border border-[var(--primary)] px-3 py-2 text-left hover:bg-[var(--muted)]"
            >
              <Check aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.texto}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {s.tipo === "pago" && "já baixado nesta conta: só ligar"}
                  {s.tipo === "aberto" && "em aberto: baixar na data do extrato"}
                  {s.tipo === "lote" && "a soma bate com o depósito: baixar todos"}
                  {s.tipo === "transferencia" && "já lançada: só ligar"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(["escolher", "criar", "transferir"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(modo === m ? null : m)} className="chip px-2.5 py-1 text-xs">
            {m === "escolher" && "Escolher lançamento"}
            {m === "criar" && (linha.valor < 0 ? "É tarifa ou despesa nova" : "É receita nova")}
            {m === "transferir" && "É transferência"}
          </button>
        ))}
        <button type="button" disabled={pendente} onClick={() => rodar(() => ignorarLinha(linha.id, true))} className="chip px-2.5 py-1 text-xs">
          Ignorar
        </button>
      </div>
      {modo === "escolher" && <Escolher linha={linha} candidatos={candidatos} />}
      {modo === "criar" && <Criar linha={linha} opcoes={opcoes} />}
      {modo === "transferir" && <Transferir linha={linha} conta={conta} outrasContas={outrasContas} />}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </li>
  );
}

/**
 * Escolher à mão, com a soma na tela. Um lançamento em aberto sozinho pode
 * ter diferença (vira juros ou desconto); vários precisam bater no centavo.
 */
function Escolher({ linha, candidatos }: { linha: Pendente; candidatos: Candidato[] }) {
  const tipo = linha.valor > 0 ? "RECEBER" : "PAGAR";
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<number[]>([]);
  const { erro, pendente, rodar } = useAcao();
  const alvo = Math.abs(linha.valor);
  const lista = candidatos
    .filter((c) => c.tipo === tipo && (busca === "" || c.descricao.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => Math.abs(a.valor - alvo) - Math.abs(b.valor - alvo) || diasEntre(a.data, linha.data) - diasEntre(b.data, linha.data))
    .slice(0, 30);
  const escolhidos = candidatos.filter((c) => marcados.includes(c.id));
  const dif = diferencaDaConciliacao(linha.valor, escolhidos);
  const comAjuste = dif !== 0 && escolhidos.length === 1 && escolhidos[0].status === "ABERTO";
  const pode = escolhidos.length > 0 && (dif === 0 || comAjuste);

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-2">
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lançamento" aria-label="Buscar lançamento" />
      {lista.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nenhum {tipo === "PAGAR" ? "pagamento" : "recebimento"} perto desta data. Se ele não foi lançado, use &quot;{linha.valor < 0 ? "É tarifa ou despesa nova" : "É receita nova"}&quot;.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {lista.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 px-2 py-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={marcados.includes(c.id)}
                  onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))}
                />
                <span className="w-12 shrink-0 text-xs text-[var(--muted-foreground)]">{dataCurta(c.data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.descricao}</span>
                  <span className="block text-[11px] text-[var(--muted-foreground)]">{c.status === "PAGO" ? "já baixado" : "em aberto"}</span>
                </span>
                <span className="num-display shrink-0 text-xs">{formatMoney(c.valor)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {escolhidos.length > 0 && (
        <p className="text-xs">
          Escolhidos: {formatMoney(somar(escolhidos.map((e) => e.valor)))} de {formatMoney(alvo)}.{" "}
          {dif === 0
            ? "Bate."
            : comAjuste
              ? `A diferença de ${formatMoney(Math.abs(dif))} entra como ${dif > 0 ? "juros/multa" : "desconto"}.`
              : `Falta ${formatMoney(Math.abs(dif))} para bater.`}
        </p>
      )}
      <Button type="button" size="sm" disabled={!pode || pendente} onClick={() => rodar(() => conciliarLinha(linha.id, marcados))}>
        Conciliar
      </Button>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}

/** A linha que nasceu no banco (tarifa, rendimento, IOF) vira lançamento já baixado. */
function Criar({ linha, opcoes }: { linha: Pendente; opcoes: OpcoesDoFinanceiro }) {
  const tipo = linha.valor > 0 ? "RECEBER" : "PAGAR";
  const categorias = opcoes.categorias.filter((c) => c.tipo === tipo);
  const [v, setV] = useState({ descricao: linha.descricao.slice(0, 120), categoriaId: null as number | null, centroCustoId: null as number | null });
  const { erro, pendente, rodar } = useAcao();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.categoriaId !== null) rodar(() => lancamentoDaLinha(linha.id, { ...v, categoriaId: v.categoriaId! }));
      }}
      className="grid gap-2 border-t border-[var(--border)] pt-2 sm:grid-cols-2"
    >
      <label className="sm:col-span-2">
        <span className="label">Descrição</span>
        <Input value={v.descricao} onChange={(e) => setV((a) => ({ ...a, descricao: e.target.value }))} maxLength={120} required />
      </label>
      <label>
        <span className="label">Categoria</span>
        <select
          value={v.categoriaId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            setV((a) => ({ ...a, categoriaId: id, centroCustoId: a.centroCustoId ?? categorias.find((c) => c.id === id)?.centroPadraoId ?? null }));
          }}
          className="field"
          required
        >
          <OpcoesDeCategoria categorias={categorias} />
        </select>
      </label>
      <label>
        <span className="label">Centro de custo</span>
        <select value={v.centroCustoId ?? ""} onChange={(e) => setV((a) => ({ ...a, centroCustoId: e.target.value ? Number(e.target.value) : null }))} className="field">
          <option value="">Sem centro</option>
          {opcoes.centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pendente || v.categoriaId === null}>
          Lançar {formatMoney(Math.abs(linha.valor))} já {tipo === "PAGAR" ? "pago" : "recebido"}
        </Button>
      </div>
      {erro && (
        <p role="alert" className="msg-error sm:col-span-2">
          {erro}
        </p>
      )}
    </form>
  );
}

function Transferir({ linha, conta, outrasContas }: { linha: Pendente; conta: Conta; outrasContas: Conta[] }) {
  const [outra, setOutra] = useState<number | null>(outrasContas[0]?.id ?? null);
  const { erro, pendente, rodar } = useAcao();
  if (outrasContas.length === 0) return <p className="text-xs text-[var(--muted-foreground)]">Não há outra conta cadastrada.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-2">
      <label>
        <span className="label">{linha.valor < 0 ? `Saiu de ${conta.nome} para` : `Veio para ${conta.nome} de`}</span>
        <select value={outra ?? ""} onChange={(e) => setOutra(Number(e.target.value))} className="field w-52">
          {outrasContas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" size="sm" disabled={pendente || outra === null} onClick={() => rodar(() => transferenciaDaLinha(linha.id, { contaId: outra! }))}>
        Registrar transferência
      </Button>
      {erro && (
        <p role="alert" className="msg-error w-full">
          {erro}
        </p>
      )}
    </div>
  );
}

function Resolvida({ id, data, valor, descricao, detalhe, acao }: { id: number; data: string; valor: number; descricao: string; detalhe: string; acao: "Desfazer" | "Voltar" }) {
  const { erro, pendente, rodar } = useAcao();
  // Desfazer reabre as baixas e apaga o que a conciliação criou: pede um
  // segundo toque. "Voltar" (tirar de ignorada) não perde nada.
  const [confirmando, setConfirmando] = useState(false);
  const executar = () => rodar(() => (acao === "Desfazer" ? desfazerConciliacao(id) : ignorarLinha(id, false)), () => setConfirmando(false));
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-[var(--muted-foreground)]">{dataCurta(data)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{descricao}</span>
          <span className="block truncate text-xs text-[var(--muted-foreground)]">{detalhe}</span>
        </span>
        <Valor valor={valor} className="shrink-0 text-xs" />
        <button
          type="button"
          disabled={pendente}
          onClick={() => (acao === "Desfazer" ? setConfirmando(true) : executar())}
          className="chip shrink-0 px-2.5 py-1 text-xs"
        >
          {acao}
        </button>
      </div>
      {confirmando && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span>Desfazer? As baixas voltam a ficar em aberto e o que a conciliação criou é apagado.</span>
          <Button type="button" size="sm" variant="destructive" disabled={pendente} onClick={executar}>
            Desfazer
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
            voltar
          </Button>
        </div>
      )}
      {erro && (
        <p role="alert" className="msg-error mt-1">
          {erro}
        </p>
      )}
    </li>
  );
}

function Extratos({ extratos }: { extratos: DadosDaConciliacao["extratos"] }) {
  const [apagando, setApagando] = useState<number | null>(null);
  const { erro, pendente, rodar } = useAcao();
  return (
    <section>
      <h2 className="section-label mb-2">Últimos extratos importados</h2>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm">
        {extratos.map((e) => (
          <li key={e.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{e.arquivo}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {e.de && e.ate ? `${dataCurta(e.de)} a ${dataCurta(e.ate)} · ` : ""}
                {plural(e.linhas, "linha nova", "linhas novas")}
              </span>
            </span>
            {apagando === e.id ? (
              <span className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarExtrato(e.id), () => setApagando(null))}>
                  Apagar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setApagando(null)}>
                  voltar
                </Button>
              </span>
            ) : (
              <button type="button" onClick={() => setApagando(e.id)} className="chip shrink-0 px-2.5 py-1 text-xs">
                Apagar
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="hint">Apagar tira as linhas deste arquivo que ainda não foram conciliadas.</p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </section>
  );
}
