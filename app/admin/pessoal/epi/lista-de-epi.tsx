"use client";

import { Plus, Printer } from "lucide-react";
import { useState } from "react";

import { Gaveta } from "@/components/gaveta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarEntrega, marcarDesgastado, registrarEntrega } from "@/lib/actions/epi";
import { proximaTrocaDe } from "@/lib/prazos-pessoal";
import { restaurarDaLixeira } from "@/lib/actions/lixeira";
import { useAcao } from "@/lib/use-acao";
import { pdfDe } from "@/lib/pdf-da-pagina";

export type EntregaNaTela = {
  id: number;
  item: string;
  data: string;
  quantidade: number;
  tamanho: string | null;
  proximaTroca: string | null;
  desgastado: boolean;
  observacao: string | null;
  situacao: "ok" | "perto" | "trocar";
};
export type PessoaComEpi = { id: number; nome: string; detalhe: string; entregas: EntregaNaTela[] };
type Item = { id: number; nome: string; trocaEmDias: number | null };

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
const COR = {
  ok: { borderColor: "var(--border)" },
  perto: { borderColor: "var(--warn)", background: "var(--warn-soft)" },
  trocar: { borderColor: "var(--destructive)", background: "var(--danger-soft)" },
} as const;

/** Cada pessoa com as peças que valem hoje; tocar numa peça abre o que dá para fazer com ela. */
export function ListaDeEpi({ pessoas, itens, hoje }: { pessoas: PessoaComEpi[]; itens: Item[]; hoje: string }) {
  const [entregando, setEntregando] = useState<{ pessoa: PessoaComEpi; itemId: number | null } | null>(null);
  const [aberta, setAberta] = useState<{ pessoa: PessoaComEpi; entrega: EntregaNaTela } | null>(null);
  return (
    <>
      <ul className="space-y-2">
        {pessoas.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.nome}</p>
                {p.detalhe && <p className="truncate text-xs text-[var(--muted-foreground)]">{p.detalhe}</p>}
              </div>
              <Button asChild size="sm" variant="ghost" className="gap-1">
                <a href={pdfDe(`/imprimir/pessoal/epi/${p.id}`)} download>
                  <Printer aria-hidden className="size-4" />
                  Termo
                </a>
              </Button>
              <Button type="button" size="sm" className="gap-1" onClick={() => setEntregando({ pessoa: p, itemId: null })}>
                <Plus aria-hidden className="size-4" />
                Entregar
              </Button>
            </div>
            {p.entregas.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">Nenhuma entrega registrada.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {p.entregas.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setAberta({ pessoa: p, entrega: e })}
                      className="rounded-lg border px-2.5 py-1 text-left text-xs"
                      style={COR[e.situacao]}
                    >
                      <span className="block font-semibold">
                        {e.item}
                        {e.tamanho && <span className="font-normal"> · {e.tamanho}</span>}
                      </span>
                      <span className="block text-[var(--muted-foreground)]">
                        {e.desgastado ? "desgastado" : e.proximaTroca ? `troca ${ddmm(e.proximaTroca)}` : `desde ${ddmm(e.data)}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {entregando && (
        <Entregar
          pessoa={entregando.pessoa}
          itemInicial={entregando.itemId}
          itens={itens}
          hoje={hoje}
          fechar={() => setEntregando(null)}
        />
      )}
      {aberta && (
        <PecaEntregue
          pessoa={aberta.pessoa}
          entrega={aberta.entrega}
          trocar={() => {
            const item = itens.find((i) => i.nome === aberta.entrega.item);
            setEntregando({ pessoa: aberta.pessoa, itemId: item?.id ?? null });
            setAberta(null);
          }}
          fechar={() => setAberta(null)}
        />
      )}
    </>
  );
}

function Entregar({
  pessoa,
  itemInicial,
  itens,
  hoje,
  fechar,
}: {
  pessoa: PessoaComEpi;
  itemInicial: number | null;
  itens: Item[];
  hoje: string;
  fechar: () => void;
}) {
  const { erro, pendente, rodar } = useAcao();
  const inicial = itens.find((i) => i.id === itemInicial) ?? itens[0];
  const [v, setV] = useState({
    itemId: inicial?.id ?? 0,
    data: hoje,
    quantidade: "1",
    tamanho: "",
    proximaTroca: proximaTrocaDe(hoje, inicial?.trocaEmDias ?? null) ?? "",
    observacao: "",
  });
  // Trocar o item ou a data recalcula a troca pelo prazo do item.
  const recalcular = (itemId: number, data: string) => proximaTrocaDe(data, itens.find((i) => i.id === itemId)?.trocaEmDias ?? null) ?? "";
  return (
    <Gaveta rotulo={`Entregar para ${pessoa.nome}`} aoFechar={fechar} className="overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(
            () =>
              registrarEntrega({
                colaboradorId: pessoa.id,
                itemId: v.itemId,
                data: v.data,
                quantidade: Number(v.quantidade) || 0,
                tamanho: v.tamanho,
                proximaTroca: v.proximaTroca,
                observacao: v.observacao,
              }),
            fechar,
          );
        }}
        className="space-y-3 p-4"
      >
        <p className="font-semibold">Entregar para {pessoa.nome}</p>
        <label className="block">
          <span className="label">Item</span>
          <select
            aria-label="Item"
            value={v.itemId}
            onChange={(e) => {
              const itemId = Number(e.target.value);
              setV({ ...v, itemId, proximaTroca: recalcular(itemId, v.data) });
            }}
            className="field w-full"
          >
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-1 block">
            <span className="label">Dia</span>
            <Input type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value, proximaTroca: recalcular(v.itemId, e.target.value) })} required />
          </label>
          <label className="block">
            <span className="label">Quantidade</span>
            <Input inputMode="numeric" value={v.quantidade} onChange={(e) => setV({ ...v, quantidade: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">Tamanho</span>
            <Input value={v.tamanho} onChange={(e) => setV({ ...v, tamanho: e.target.value })} maxLength={10} placeholder="40, M" />
          </label>
        </div>
        <label className="block">
          <span className="label">Próxima troca</span>
          <Input type="date" value={v.proximaTroca} onChange={(e) => setV({ ...v, proximaTroca: e.target.value })} />
          <span className="hint mt-1 block">Vem do prazo do item em Configurações. Vazio: sem troca prevista.</span>
        </label>
        <label className="block">
          <span className="label">Observação</span>
          <Input value={v.observacao} onChange={(e) => setV({ ...v, observacao: e.target.value })} maxLength={200} />
        </label>
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="h-10" disabled={pendente || !v.itemId}>
            Registrar entrega
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={fechar}>
            Cancelar
          </Button>
        </div>
        <p className="hint">A entrega anterior do mesmo item para esta pessoa fica como substituída e continua no termo.</p>
      </form>
    </Gaveta>
  );
}

function PecaEntregue({
  pessoa,
  entrega: e,
  trocar,
  fechar,
}: {
  pessoa: PessoaComEpi;
  entrega: EntregaNaTela;
  trocar: () => void;
  fechar: () => void;
}) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <Gaveta rotulo={`${e.item} de ${pessoa.nome}`} aoFechar={fechar}>
      <div className="space-y-3 p-4">
        <p className="font-semibold">
          {e.item} · {pessoa.nome}
        </p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-[var(--muted-foreground)]">Entregue em</dt>
          <dd>{ddmm(e.data)}</dd>
          <dt className="text-[var(--muted-foreground)]">Quantidade</dt>
          <dd>
            {e.quantidade}
            {e.tamanho && ` · tamanho ${e.tamanho}`}
          </dd>
          <dt className="text-[var(--muted-foreground)]">Próxima troca</dt>
          <dd>{e.proximaTroca ? ddmm(e.proximaTroca) : "sem troca prevista"}</dd>
          {e.observacao && (
            <>
              <dt className="text-[var(--muted-foreground)]">Observação</dt>
              <dd>{e.observacao}</dd>
            </>
          )}
        </dl>
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-10" onClick={trocar}>
            Entregar outro
          </Button>
          <Button type="button" variant="outline" className="h-10" disabled={pendente} onClick={() => rodar(() => marcarDesgastado(e.id, !e.desgastado), fechar)}>
            {e.desgastado ? "Está bom" : "Marcar desgastado"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto h-10"
            style={{ color: "var(--destructive)" }}
            disabled={pendente}
            onClick={() => {
              // Lançamento errado: vai para a lixeira, e o Desfazer da faixa traz de volta.
              let lixeiraId = 0;
              rodar(
                () => apagarEntrega(e.id),
                (r) => {
                  lixeiraId = r.lixeiraId ?? 0;
                  fechar();
                },
                { aviso: `Entrega de ${e.item} na lixeira`, desfazer: () => restaurarDaLixeira(lixeiraId) },
              );
            }}
          >
            Apagar
          </Button>
        </div>
      </div>
    </Gaveta>
  );
}
