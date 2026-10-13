"use client";

import { RotateCcw } from "lucide-react";

import { Lista } from "@/components/pagina";
import { restaurarDaLixeira } from "@/lib/actions/lixeira";
import { plural } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";

type Item = { id: number; tipo: string; rotulo: string; apagadoPor: string | null; apagadoEm: string; diasRestantes: number };

/** Uma linha por item apagado, com o Restaurar à direita. */
export function ListaDaLixeira({ itens }: { itens: Item[] }) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div className="space-y-2">
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <Lista aria-label="Itens na lixeira">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--primary)]">{i.tipo}</p>
              <p className="truncate font-semibold">{i.rotulo}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Apagado em {i.apagadoEm}
                {i.apagadoPor && ` por ${i.apagadoPor}`} · some em {plural(i.diasRestantes, "dia", "dias")}
              </p>
            </div>
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => restaurarDaLixeira(i.id), undefined, { aviso: `${i.tipo} restaurado` })}
              className="chip inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm"
            >
              <RotateCcw aria-hidden className="size-4" />
              Restaurar
            </button>
          </li>
        ))}
      </Lista>
    </div>
  );
}
