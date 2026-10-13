"use client";

import { Check, PackagePlus, ScanLine, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { lancarNotaDoMercado, lerNotaDoMercado, type NotaLida } from "@/lib/actions/nota-mercado";
import { UNIT_LABEL, formatAmount, formatMoney, formatTaxId, lerNumeroBR } from "@/lib/format";
import type { ProdutoComFornecedores } from "@/lib/produtos-para-pedido";
import type { ProductUnit } from "@/generated/prisma/client";

import { CadastroRapidoProduto } from "../../pedido-manual/cadastro-rapido";
import { SeletorDeProduto } from "../../pedidos/seletor-de-produto";
import { CameraQr } from "./camera-qr";

/** O que se decidiu de cada linha da nota. `undefined` = ainda não decidiu. */
type Escolha = { produtoId: number | null; fator: string; sugerido: boolean };

/**
 * Ler a nota do mercado: a câmera no QR, a nota com os itens, e o dono só
 * diz qual produto da casa é cada um (ou que não é da casa). O que ele
 * vincula fica lembrado para a próxima nota do mesmo mercado.
 */
export function LerNota({
  produtos,
  categorias,
}: {
  produtos: ProdutoComFornecedores[];
  categorias: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [lida, setLida] = useState<NotaLida | null>(null);
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({});
  const [aberta, setAberta] = useState<number | null>(null);
  const [cadastrando, setCadastrando] = useState<number | null>(null);
  const [novos, setNovos] = useState<ProdutoComFornecedores[]>([]);
  const [link, setLink] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, startLer] = useTransition();
  const [lancando, startLancar] = useTransition();
  const [tentativa, setTentativa] = useState(0);

  const todos = [...produtos, ...novos];
  const produtoDe = (id: number) => todos.find((p) => p.id === id);

  const ler = useCallback((texto: string) => {
    setErro(null);
    startLer(async () => {
      const r = await lerNotaDoMercado(texto);
      if (!r.ok) {
        setErro(r.message);
        setTentativa((t) => t + 1); // religa a câmera para tentar de novo
        return;
      }
      setLida(r.data);
      setEscolhas(
        Object.fromEntries(
          Object.entries(r.data.vinculos).map(([linha, v]) => [
            Number(linha),
            { produtoId: v.produtoId, fator: String(v.fator).replace(".", ","), sugerido: true },
          ]),
        ),
      );
    });
  }, []);

  // ---- Passo 1: ler o QR ----
  if (!lida) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          Aponte a câmera para o QR Code do cupom fiscal. Os itens vêm sozinhos; você só diz qual produto da casa é cada um.
        </p>
        {lendo ? (
          <p className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-3 text-sm">
            <ScanLine aria-hidden className="size-5 animate-pulse text-[var(--primary)]" />
            Buscando a nota no site da Receita…
          </p>
        ) : (
          <CameraQr key={tentativa} aoLer={ler} />
        )}
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-[var(--primary)]">Ou cole o link do QR</summary>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) ler(link);
            }}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.sefaz.rs.gov.br/NFCE/…"
              className="h-10 min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={lendo}
              className="h-10 shrink-0 rounded-lg bg-[var(--botao)] px-4 text-sm font-semibold text-[var(--botao-texto)] disabled:opacity-60"
            >
              Ler
            </button>
          </form>
        </details>
      </div>
    );
  }

  // ---- Passo 2: vincular ----
  const { nota, fornecedor, jaLancada } = lida;
  const decididos = nota.itens.filter((i) => escolhas[i.linha] !== undefined);
  const daCasa = nota.itens.filter((i) => escolhas[i.linha]?.produtoId != null);
  const valorDaCasa = daCasa.reduce((s, i) => s + i.valorTotal, 0);
  const faltam = nota.itens.length - decididos.length;

  function escolher(linha: number, e: Escolha | undefined) {
    setErro(null);
    setEscolhas((a) => {
      const n = { ...a };
      if (e === undefined) delete n[linha];
      else n[linha] = e;
      return n;
    });
  }

  function lancar() {
    setErro(null);
    for (const i of nota.itens) {
      const e = escolhas[i.linha];
      if (e?.produtoId != null) {
        const f = lerNumeroBR(e.fator);
        if (f === null || f <= 0) return setErro(`Confira quanto vem em "${i.descricao}".`);
      }
    }
    startLancar(async () => {
      const r = await lancarNotaDoMercado({
        chave: nota.chave,
        emitente: nota.emitente,
        fornecedorId: fornecedor?.id ?? null,
        itens: nota.itens.map((i) => {
          const e = escolhas[i.linha]!;
          return {
            codigo: i.codigo,
            descricao: i.descricao,
            quantidade: i.quantidade,
            valorTotal: i.valorTotal,
            produtoId: e.produtoId,
            fator: e.produtoId === null ? 1 : (lerNumeroBR(e.fator) ?? 1),
          };
        }),
      });
      if (!r.ok) return setErro(r.message);
      router.push(`/admin/compras/recebimentos?entrada=${r.data.id}`);
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {/* De onde é a nota. */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm">
        <p className="font-semibold">{nota.emitente.nome || "Mercado"}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {nota.emitente.cnpj && `CNPJ ${formatTaxId(nota.emitente.cnpj)}`}
          {nota.emissao && ` · ${nota.emissao}`}
          {nota.total !== null && ` · ${formatMoney(nota.total)}`}
        </p>
        <p className="mt-1 text-xs">
          {fornecedor ? (
            <>Fornecedor: <strong>{fornecedor.nome}</strong></>
          ) : (
            <span style={{ color: "var(--warn)" }}>Mercado novo: vira fornecedor ao dar entrada.</span>
          )}
        </p>
      </section>

      {jaLancada !== null && (
        <p role="alert" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--warn-soft, var(--surface))", color: "var(--warn)" }}>
          Esta nota já deu entrada.{" "}
          <Link href={`/admin/compras/recebimentos?entrada=${jaLancada}`} className="underline underline-offset-4">
            Ver a entrada
          </Link>
        </p>
      )}

      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {nota.itens.map((i) => {
          const e = escolhas[i.linha];
          const p = e?.produtoId != null ? produtoDe(e.produtoId) : undefined;
          const fator = lerNumeroBR(e?.fator ?? "1") ?? 0;
          const naCasa = p && fator > 0 ? i.quantidade * fator : null;
          const cor = e === undefined ? "var(--warn)" : e.produtoId === null ? "var(--muted-foreground)" : "var(--ok-strong)";
          return (
            <li key={i.linha} className="border-l-[3px] px-3 py-2.5" style={{ borderLeftColor: cor }}>
              <p className="text-sm font-medium leading-snug">{i.descricao}</p>
              <p className="num-display text-xs text-[var(--muted-foreground)]">
                {formatAmount(i.quantidade)} {i.unidade} × {formatMoney(i.valorUnitario)} = {formatMoney(i.valorTotal)}
              </p>

              {e === undefined && aberta !== i.linha && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAberta(i.linha)}
                    className="inline-flex h-10 items-center rounded-lg bg-[var(--botao)] px-3 text-sm font-semibold text-[var(--botao-texto)]"
                  >
                    Vincular
                  </button>
                  <button
                    type="button"
                    onClick={() => escolher(i.linha, { produtoId: null, fator: "1", sugerido: false })}
                    className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-3 text-sm"
                  >
                    Não é da casa
                  </button>
                </div>
              )}

              {e === undefined && aberta === i.linha && (
                <div className="mt-2 space-y-2">
                  <SeletorDeProduto
                    soProduto
                    semMoldura
                    focarAoAbrir
                    produtos={todos.map((x) => ({
                      id: x.id,
                      nome: x.nome,
                      unidade: x.unidade,
                      lote: null,
                      doFornecedor: fornecedor !== null && x.fornecedorIds.includes(fornecedor.id),
                    }))}
                    aoAcrescentar={async (produtoId) => {
                      escolher(i.linha, { produtoId, fator: "1", sugerido: false });
                      setAberta(null);
                      return null;
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCadastrando(cadastrando === i.linha ? null : i.linha)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm"
                    >
                      <PackagePlus aria-hidden className="size-4" />
                      Cadastrar produto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAberta(null);
                        setCadastrando(null);
                      }}
                      className="h-10 rounded-lg px-3 text-sm text-[var(--muted-foreground)]"
                    >
                      voltar
                    </button>
                  </div>
                  {cadastrando === i.linha && (
                    <CadastroRapidoProduto
                      fornecedorId={fornecedor?.id ?? null}
                      categorias={categorias}
                      aoFechar={() => setCadastrando(null)}
                      aoCriar={(novo) => {
                        setNovos((a) => [
                          ...a,
                          { id: novo.id, nome: novo.nome, unidade: novo.unidade, lote: null, fornecedorIds: fornecedor ? [fornecedor.id] : [] },
                        ]);
                        escolher(i.linha, { produtoId: novo.id, fator: "1", sugerido: false });
                        setCadastrando(null);
                        setAberta(null);
                      }}
                    />
                  )}
                </div>
              )}

              {e?.produtoId === null && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <X aria-hidden className="size-4" />
                  não é da casa{e.sugerido && " (lembrado)"}
                  <button
                    type="button"
                    onClick={() => escolher(i.linha, undefined)}
                    className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[var(--primary)]"
                  >
                    <Undo2 aria-hidden className="size-4" />
                    desfazer
                  </button>
                </p>
              )}

              {e?.produtoId != null && (
                <div className="mt-1.5 space-y-1.5">
                  <p className="flex items-center gap-2 text-sm">
                    <Check aria-hidden className="size-4 shrink-0" style={{ color: "var(--ok-strong)" }} />
                    <span className="min-w-0 flex-1 font-semibold">{p?.nome ?? "Produto"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        escolher(i.linha, undefined);
                        setAberta(i.linha);
                      }}
                      className="h-9 shrink-0 rounded-lg px-2 text-sm text-[var(--primary)]"
                    >
                      trocar
                    </button>
                  </p>
                  {e.sugerido && <p className="text-xs text-[var(--muted-foreground)]">vínculo lembrado</p>}
                  {/* Quanto da unidade da casa vem em 1 da nota: o pote de 1 kg vendido
                      como "1 UN", o fardo de 12 latas. */}
                  {p && (
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-[var(--muted-foreground)]">1 {i.unidade} da nota =</span>
                      <Input
                        inputMode="decimal"
                        value={e.fator}
                        onChange={(ev) => escolher(i.linha, { ...e, fator: ev.target.value })}
                        className="num-display h-9 w-20 text-right"
                      />
                      <span>{UNIT_LABEL[p.unidade as ProductUnit]}</span>
                      {naCasa !== null && (
                        <span className="w-full text-xs text-[var(--muted-foreground)]">
                          entra {formatAmount(naCasa)} {UNIT_LABEL[p.unidade as ProductUnit]} a{" "}
                          {formatMoney(i.valorTotal / naCasa)}/{UNIT_LABEL[p.unidade as ProductUnit]}
                        </span>
                      )}
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Embaixo, sempre à vista: o que falta e o botão. */}
      <div className="fixed inset-x-0 bottom-[var(--barra-de-baixo)] z-20 border-t border-[var(--border)] bg-[var(--background)] px-5 py-3 lg:static lg:border-0 lg:px-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            {faltam > 0 ? (
              <span style={{ color: "var(--warn)" }}>
                {faltam === 1 ? "Falta decidir 1 item" : `Faltam decidir ${faltam} itens`}
              </span>
            ) : (
              <>
                {daCasa.length} {daCasa.length === 1 ? "item" : "itens"} da casa ·{" "}
                <strong className="num-display">{formatMoney(valorDaCasa)}</strong>
              </>
            )}
          </p>
          <button
            type="button"
            disabled={faltam > 0 || daCasa.length === 0 || lancando || jaLancada !== null}
            onClick={lancar}
            className="h-11 shrink-0 rounded-lg bg-[var(--botao)] px-5 text-base font-semibold text-[var(--botao-texto)] disabled:opacity-50"
          >
            {lancando ? "Dando entrada…" : "Dar entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}
