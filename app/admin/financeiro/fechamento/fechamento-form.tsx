"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apagarFechamento, salvarFechamento } from "@/lib/actions/financeiro";
import { arredondar, somar, somarDias } from "@/lib/financeiro-calculo";
import { formatDiaCurtoString, formatMoney, lerNumeroBR, precoNoCampo } from "@/lib/format";

import { useAcao } from "@/lib/use-acao";

type Forma = { id: number; nome: string; taxaPct: number; prazoDias: number; conta: string };

/**
 * Um campo por forma de pagamento, e a conta feita na hora: quanto vendeu,
 * quanto a maquininha fica e quando cada parte cai. Quem digita confere com
 * o relatório do PDV antes de salvar.
 */
export function FechamentoForm({
  data,
  hoje,
  formas,
  existente,
  trava,
  apagado,
}: {
  data: string;
  hoje: string;
  formas: Forma[];
  existente: { id: number; taxaServico: number; observacao: string; valores: Record<number, number> } | null;
  /** Por que o dia não pode mais ser refeito (`travaDoFechamentoDoDia`), ou nulo. */
  trava: string | null;
  /** Acabou de ser apagado: o formulário renasce vazio e diz isso. */
  apagado: boolean;
}) {
  const conferido = trava !== null;
  const router = useRouter();
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(formas.map((f) => [f.id, existente?.valores[f.id] ? precoNoCampo(existente.valores[f.id]) : ""])),
  );
  const [taxaServico, setTaxaServico] = useState(existente && existente.taxaServico > 0 ? precoNoCampo(existente.taxaServico) : "");
  const [observacao, setObservacao] = useState(existente?.observacao ?? "");
  const [apagando, setApagando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const { erro, pendente, rodar } = useAcao();

  const lido = (texto: string) => Math.max(lerNumeroBR(texto) ?? 0, 0);
  const linhas = formas.map((f) => {
    const bruto = lido(valores[f.id] ?? "");
    const taxa = arredondar((bruto * f.taxaPct) / 100);
    return { ...f, bruto, taxa, cai: somarDias(data, f.prazoDias) };
  });
  const total = somar(linhas.map((l) => l.bruto));
  const taxas = somar(linhas.map((l) => l.taxa));
  const servico = lido(taxaServico);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSalvo(false);
        rodar(
          () =>
            salvarFechamento({
              data,
              taxaServico,
              observacao,
              itens: formas.map((f) => ({ formaId: f.id, valor: valores[f.id] ?? "" })),
            }),
          () => setSalvo(true),
        );
      }}
      className="space-y-5"
    >
      <label className="block">
        <span className="label">Dia</span>
        <Input
          type="date"
          value={data}
          max={hoje}
          onChange={(e) => e.target.value && router.push(`/admin/financeiro/fechamento?data=${e.target.value}`)}
          className="w-48"
        />
      </label>

      {existente && (
        <p className="msg-warn">
          {trava ?? "Este dia já foi fechado. Salvar de novo substitui os valores e refaz os lançamentos."}
        </p>
      )}

      <div className="card divide-y divide-[var(--border)]">
        {linhas.map((l) => (
          <label key={l.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{l.nome}</span>
              <span className="block text-[11px] text-[var(--muted-foreground)]">
                {l.taxaPct > 0 && `taxa ${l.taxaPct.toLocaleString("pt-BR")}% · `}
                {l.prazoDias === 0 ? `entra hoje em ${l.conta}` : `cai ${formatDiaCurtoString(l.cai)} em ${l.conta}`}
              </span>
            </span>
            <Input
              inputMode="decimal"
              value={valores[l.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [l.id]: e.target.value }))}
              placeholder="0,00"
              aria-label={`Total em ${l.nome}`}
              className="w-32 text-right"
              disabled={conferido}
            />
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Taxa de serviço incluída (R$)</span>
          <Input inputMode="decimal" value={taxaServico} onChange={(e) => setTaxaServico(e.target.value)} placeholder="0,00" disabled={conferido} />
          <span className="hint block">Os 10% que vieram dentro dos valores acima. São da equipe: viram repasse a pagar e saem da receita.</span>
        </label>
        <label>
          <span className="label">Observação</span>
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={1000} disabled={conferido} />
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Total do PDV</dt>
          <dd className="num-display">{formatMoney(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Taxas das maquininhas</dt>
          <dd className="num-display">{formatMoney(taxas)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Taxa de serviço</dt>
          <dd className="num-display">{formatMoney(servico)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Receita da casa</dt>
          <dd className="num-display">{formatMoney(Math.max(arredondar(total - servico), 0))}</dd>
        </div>
      </dl>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      {apagado && !salvo && !erro && (
        <p role="status" className="text-sm font-semibold">
          Fechamento de {formatDiaCurtoString(data)} apagado, com os lançamentos dele.
        </p>
      )}
      {salvo && !erro && (
        <p role="status" className="text-sm font-semibold">
          Fechamento de {formatDiaCurtoString(data)} salvo.
        </p>
      )}

      {!conferido && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendente || total === 0}>
            {pendente ? "Salvando…" : existente ? "Salvar de novo" : "Fechar o dia"}
          </Button>
          {existente &&
            (apagando ? (
              <>
                <Button type="button" variant="destructive" disabled={pendente} onClick={() =>
                    rodar(
                      () => apagarFechamento(existente.id),
                      () => {
                        // Apagado: o formulário volta limpo, sem o que estava
                        // digitado, e a página diz que apagou.
                        setValores(Object.fromEntries(formas.map((f) => [f.id, ""])));
                        setTaxaServico("");
                        setObservacao("");
                        setApagando(false);
                        setSalvo(false);
                        router.replace(`/admin/financeiro/fechamento?data=${data}&apagado=1`);
                      },
                    )
                  }>
                  Apagar o fechamento e os lançamentos dele
                </Button>
                <Button type="button" variant="ghost" onClick={() => setApagando(false)}>
                  voltar
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setApagando(true)}>
                Apagar
              </Button>
            ))}
        </div>
      )}
    </form>
  );
}
