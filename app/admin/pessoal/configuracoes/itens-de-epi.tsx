"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ligarItemDeEpi, salvarItemDeEpi } from "@/lib/actions/epi";
import { salvarDomingosSeguidos } from "@/lib/actions/pessoal";
import { plural } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";

export type ItemDeEpiNaTela = { id: number; nome: string; ca: string | null; trocaEmDias: number | null; ativo: boolean; entregas: number };

/** Os EPIs e uniformes que se entregam: nome, CA e em quantos dias costuma trocar. */
export function ItensDeEpi({ itens }: { itens: ItemDeEpiNaTela[] }) {
  return (
    <section className="space-y-2">
      <h2 className="section-label">EPI e uniformes</h2>
      <p className="text-sm text-[var(--muted-foreground)]">
        O prazo de troca dá a próxima troca de cada entrega e o aviso em Pendências. O CA (certificado de aprovação) sai no termo de entrega.
      </p>
      <ul className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        {itens.map((i) => (
          <li key={i.id}>
            <LinhaDoItem item={i} />
          </li>
        ))}
        <li className="border-t border-[var(--border)] pt-2">
          <LinhaDoItem item={null} />
        </li>
      </ul>
    </section>
  );
}

function LinhaDoItem({ item }: { item: ItemDeEpiNaTela | null }) {
  const { erro, pendente, rodar } = useAcao();
  const [v, setV] = useState({ nome: item?.nome ?? "", ca: item?.ca ?? "", troca: item?.trocaEmDias ? String(item.trocaEmDias) : "" });
  const mudou = !item || v.nome !== item.nome || v.ca !== (item.ca ?? "") || v.troca !== (item.trocaEmDias ? String(item.trocaEmDias) : "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarItemDeEpi(item?.id ?? null, { nome: v.nome, ca: v.ca, trocaEmDias: v.troca.trim() === "" ? null : Number(v.troca) }),
          () => !item && setV({ nome: "", ca: "", troca: "" }),
        );
      }}
      className={item && !item.ativo ? "opacity-50" : undefined}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] gap-1.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto_auto]">
        <Input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} maxLength={60} placeholder={item ? "" : "Novo item"} aria-label="Nome do item" className="h-10" />
        <Input value={v.ca} onChange={(e) => setV({ ...v, ca: e.target.value })} maxLength={20} placeholder="CA" aria-label={`CA de ${v.nome || "novo item"}`} className="h-10" />
        <Input
          inputMode="numeric"
          value={v.troca}
          onChange={(e) => setV({ ...v, troca: e.target.value.replace(/\D/g, "") })}
          placeholder="dias"
          aria-label={`Troca em dias de ${v.nome || "novo item"}`}
          className="h-10"
        />
        <div className="col-span-3 flex gap-1.5 sm:col-span-2">
          <Button type="submit" variant={item ? "outline" : "default"} className="h-10" disabled={pendente || !mudou || v.nome.trim().length < 2}>
            {item ? "Salvar" : "Criar"}
          </Button>
          {item && (
            <Button type="button" variant="ghost" className="h-10" disabled={pendente} onClick={() =>
                rodar(() => ligarItemDeEpi(item.id, !item.ativo), undefined, {
                  aviso: `${item.nome} ${item.ativo ? "desligado" : "ligado"}`,
                  desfazer: () => ligarItemDeEpi(item.id, item.ativo),
                })
              }>
              {item.ativo ? "Desligar" : "Ligar"}
            </Button>
          )}
          {item && item.entregas > 0 && <span className="self-center text-xs text-[var(--muted-foreground)]">{plural(item.entregas, "entrega")}</span>}
        </div>
      </div>
      {erro && (
        <p role="alert" className="msg-error mt-1">
          {erro}
        </p>
      )}
    </form>
  );
}

/** O limite de domingos seguidos que a escala respeita antes de avisar em Pendências. */
export function DomingosSeguidos({ inicial }: { inicial: number }) {
  const { erro, pendente, rodar } = useAcao();
  const [n, setN] = useState(String(inicial));
  return (
    <section className="space-y-2">
      <h2 className="section-label">Domingos seguidos</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarDomingosSeguidos(Number(n)), undefined, { aviso: "Salvo" });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label>
          <span className="label">Pode trabalhar até</span>
          <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} className="h-10 w-20" />
        </label>
        <span className="pb-2.5 text-sm">domingos seguidos; o seguinte é folga.</span>
        <Button type="submit" variant="outline" className="h-10" disabled={pendente || n === String(inicial)}>
          Salvar
        </Button>
      </form>
      <p className="hint">Confira na convenção coletiva do sindicato. Quem passar disso na escala aparece em Pendências. Zero desliga o aviso.</p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </section>
  );
}
