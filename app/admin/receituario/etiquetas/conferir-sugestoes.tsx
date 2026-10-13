"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LINHAS_POR_VEZ, MaisAoRolar } from "@/components/mais-ao-rolar";
import { Button } from "@/components/ui/button";
import { aplicarEtiquetas } from "@/lib/actions/receituario";
import { plural } from "@/lib/format";
import { corDaCategoria } from "@/lib/receituario-regras";
import { useAcao } from "@/lib/use-acao";

type Linha = { id: number; codigo: string; nome: string; categoria: string; etiqueta: string; porque: string };

export function ConferirSugestoes({ linhas, etiquetas, cores }: { linhas: Linha[]; etiquetas: string[]; cores: Record<string, string> }) {
  const router = useRouter();
  const { erro, aviso, pendente, rodar } = useAcao();
  const [escolha, setEscolha] = useState<Record<number, string>>(() => Object.fromEntries(linhas.map((l) => [l.id, etiquetas.includes(l.etiqueta) ? l.etiqueta : ""])));
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(linhas.filter((l) => etiquetas.includes(l.etiqueta)).map((l) => l.id)));
  const [filtro, setFiltro] = useState("");
  const visiveis = filtro ? linhas.filter((l) => escolha[l.id] === filtro) : linhas;
  // Um lote de cada vez: com centenas de fichas, a página toda travava o
  // celular. Trocar o filtro recomeça do topo.
  const [limite, setLimite] = useState(LINHAS_POR_VEZ);
  const naTela = visiveis.slice(0, limite);
  const filtrar = (e: string) => {
    setFiltro(e);
    setLimite(LINHAS_POR_VEZ);
  };
  // Só o que está na tela: com o filtro em Grelhado, aplica só as grelhadas;
  // e só as linhas já desenhadas, porque ninguém confere o que não viu.
  const aplicar = naTela.filter((l) => marcadas.has(l.id) && escolha[l.id]);
  const porEtiqueta = etiquetas.map((e) => ({ e, n: linhas.filter((l) => escolha[l.id] === e).length }));

  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={filtro === ""} onClick={() => filtrar("")} className="chip px-2.5 py-1 text-xs">
          Todas · {linhas.length}
        </button>
        {porEtiqueta.map(({ e, n }) => (
          <button key={e} type="button" aria-pressed={filtro === e} onClick={() => filtrar(e)} className="chip px-2.5 py-1 text-xs">
            {e} · {n}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {naTela.map((l) => (
          <li key={l.id} className="flex items-center gap-2 py-1.5 pr-2">
            <span aria-hidden className="w-1 self-stretch rounded-r" style={{ background: corDaCategoria(l.categoria, cores) }} />
            <input
              type="checkbox"
              checked={marcadas.has(l.id)}
              onChange={() => alternar(l.id)}
              aria-label={`Aplicar em ${l.nome}`}
              className="size-5 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {l.nome} <span className="font-mono text-xs font-normal text-[var(--muted-foreground)]">{l.codigo}</span>
              </span>
              <span className="block truncate text-xs text-[var(--muted-foreground)]">{l.porque}</span>
            </span>
            <select
              value={escolha[l.id]}
              onChange={(e) => {
                setEscolha({ ...escolha, [l.id]: e.target.value });
                setMarcadas((m) => new Set(m).add(l.id));
              }}
              aria-label={`Etiqueta de ${l.nome}`}
              className="h-9 w-28 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 text-xs"
            >
              <option value="">—</option>
              {etiquetas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {visiveis.length > naTela.length && (
        <MaisAoRolar restam={visiveis.length - naTela.length} aoChegar={() => setLimite((l) => l + LINHAS_POR_VEZ)} />
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      {aviso && <p className="text-sm">{aviso}</p>}
      <div className="sticky bottom-[calc(var(--barra-de-baixo)+0.75rem)] flex justify-end">
        <Button
          type="button"
          className="h-11 shadow-lg"
          disabled={pendente || aplicar.length === 0}
          onClick={() => rodar(() => aplicarEtiquetas(aplicar.map((l) => ({ fichaId: l.id, etiqueta: escolha[l.id] }))), () => router.refresh())}
        >
          Aplicar em {plural(aplicar.length, "ficha", "fichas")}
        </Button>
      </div>
    </div>
  );
}
