"use client";

import { Building2, MessageCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ativarTerceirizado, salvarTerceirizado } from "@/lib/actions/pessoal";
import { formatMoney } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";

type Campos = { nome: string; telefone: string; valorPorPessoa: string; area: "" | "COZINHA" | "SALAO"; observacoes: string };
type Item = Campos & { id: number; valor: number | null; ativo: boolean; whatsapp: string | null };

const VAZIO: Campos = { nome: "", telefone: "", valorPorPessoa: "", area: "SALAO", observacoes: "" };
const AREA = { "": "Cozinha e salão", COZINHA: "Cozinha", SALAO: "Salão" } as const;

/**
 * A lista das empresas terceirizadas, com cadastrar, editar e desativar.
 * Cada uma tem o WhatsApp à mão, para chamar quando falta alguém.
 */
export function ListaDeTerceirizados({ itens }: { itens: Item[] }) {
  const [editando, setEditando] = useState<number | "nova" | null>(itens.length === 0 ? "nova" : null);
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-3">
      {editando === "nova" ? (
        <Formulario inicial={VAZIO} aoFechar={() => setEditando(null)} />
      ) : (
        <Button type="button" className="h-11 gap-1.5" onClick={() => setEditando("nova")}>
          <Plus aria-hidden className="size-4" />
          Cadastrar empresa
        </Button>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {itens.length > 0 && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {itens.map((t) =>
            editando === t.id ? (
              <li key={t.id} className="p-3">
                <Formulario id={t.id} inicial={t} aoFechar={() => setEditando(null)} />
              </li>
            ) : (
              <li key={t.id} className={`flex min-h-16 items-center gap-3 px-3 py-2.5 ${t.ativo ? "" : "opacity-60"}`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--primary)]">
                  <Building2 aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.nome}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {t.ativo
                      ? [AREA[t.area], t.valor === null ? "sem valor por pessoa" : `${formatMoney(t.valor)} por pessoa por dia`].join(" · ")
                      : "desativada: não aparece na escala"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.whatsapp && t.ativo && (
                    <a
                      href={t.whatsapp}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Chamar ${t.nome} no WhatsApp`}
                      title="Chamar no WhatsApp"
                      className="flex size-9 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      <MessageCircle aria-hidden className="size-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditando(t.id)}
                    aria-label={`Editar ${t.nome}`}
                    title="Editar"
                    className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() =>
                      rodar(() => ativarTerceirizado(t.id, !t.ativo), undefined, {
                        aviso: t.ativo ? `${t.nome} desativada` : `${t.nome} de volta à escala`,
                      })
                    }
                    className="chip px-2.5 py-1 text-xs"
                  >
                    {t.ativo ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        Na escala, a empresa aparece no fim da lista de cada posto e pode ficar em vários postos no mesmo dia: cada posto é uma
        pessoa que ela manda, e o custo do dia conta uma diária por posto. Desativar tira a empresa da semana fixa; os dias que já
        passaram ficam como estão.
      </p>
    </div>
  );
}

function Formulario({ id = null, inicial, aoFechar }: { id?: number | null; inicial: Campos; aoFechar: () => void }) {
  const [c, setC] = useState<Campos>({
    nome: inicial.nome,
    telefone: inicial.telefone,
    valorPorPessoa: inicial.valorPorPessoa,
    area: inicial.area,
    observacoes: inicial.observacoes,
  });
  const { erro, pendente, rodar } = useAcao();
  const mudar = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setC((x) => ({ ...x, [k]: e.target.value }));
  const rotulo = "mb-1 block text-sm font-medium";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarTerceirizado(id, c), aoFechar, { aviso: id === null ? "Empresa cadastrada" : "Salvo" });
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <label className="block">
        <span className={rotulo}>Nome da empresa</span>
        <Input value={c.nome} onChange={mudar("nome")} required maxLength={80} autoFocus placeholder="Ex.: Serve bem" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>WhatsApp</span>
          <Input value={c.telefone} onChange={mudar("telefone")} inputMode="tel" placeholder="(51) 99999-9999" />
        </label>
        <label className="block">
          <span className={rotulo}>Valor por pessoa por dia</span>
          <Input value={c.valorPorPessoa} onChange={mudar("valorPorPessoa")} inputMode="decimal" placeholder="R$ 0,00" />
        </label>
      </div>
      <label className="block">
        <span className={rotulo}>Manda gente para</span>
        <select value={c.area} onChange={mudar("area")} className="field w-full">
          <option value="SALAO">Salão</option>
          <option value="COZINHA">Cozinha</option>
          <option value="">Cozinha e salão</option>
        </select>
      </label>
      <label className="block">
        <span className={rotulo}>
          Observações <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
        </span>
        <Input value={c.observacoes} onChange={mudar("observacoes")} maxLength={500} placeholder="Ex.: avisar com um dia de antecedência" />
      </label>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-10" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Cadastrar" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
