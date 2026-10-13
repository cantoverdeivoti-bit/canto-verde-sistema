"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarCardapio } from "@/lib/actions/buffet";
import { DIAS_DA_SEMANA } from "@/lib/buffet-regras";

import { useAcao } from "@/lib/use-acao";

type Inicial = { nome: string; inicio: string; fim: string; temas: string[] };
const VAZIO: Inicial = { nome: "", inicio: "", fim: "", temas: ["", "", "", "", "", "", ""] };

/**
 * Nome, período e o tema de cada dia. Para um cardápio novo, dá para nascer
 * com os pratos de outro (o trimestre seguinte quase sempre parte do atual).
 */
export function CardapioForm({
  id,
  inicial = VAZIO,
  outros,
  copiarDeInicial = null,
  fechar,
}: {
  id: number | null;
  inicial?: Inicial;
  outros: { id: number; nome: string }[];
  copiarDeInicial?: number | null;
  fechar?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [copiarDe, setCopiarDe] = useState<number | null>(copiarDeInicial);
  const { erro, pendente, rodar } = useAcao();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarCardapio(id, v, id === null ? copiarDe : null),
          (r) => {
            fechar?.();
            if (r.ok && id === null) router.push(`/admin/buffet/cardapio?cardapio=${r.data.id}`);
          },
        );
      }}
      className="card space-y-4 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} required maxLength={60} placeholder="Ex.: 1º trimestre 2027" />
        </label>
        <label>
          <span className="label">Vale de</span>
          <Input type="date" value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} required />
        </label>
        <label>
          <span className="label">até</span>
          <Input type="date" value={v.fim} onChange={(e) => setV({ ...v, fim: e.target.value })} required />
        </label>
        {id === null && outros.length > 0 && (
          <label>
            <span className="label">Começar com os pratos de</span>
            <select value={copiarDe ?? ""} onChange={(e) => setCopiarDe(e.target.value ? Number(e.target.value) : null)} className="field">
              <option value="">nenhum (vazio)</option>
              {outros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <fieldset>
        <legend className="label">Tema de cada dia</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {DIAS_DA_SEMANA.map((d, i) => (
            <label key={d}>
              <span className="text-xs text-[var(--muted-foreground)]">{d}</span>
              <Input
                value={v.temas[i]}
                onChange={(e) => setV({ ...v, temas: v.temas.map((t, j) => (j === i ? e.target.value : t)) })}
                maxLength={40}
                placeholder="sem tema"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {id === null ? "Criar cardápio" : "Salvar"}
        </Button>
        {fechar && (
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
