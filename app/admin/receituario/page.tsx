import { CircleCheck, Search } from "lucide-react";
import Link from "next/link";

import { ListaEmLotes } from "@/components/mais-ao-rolar";
import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { chave, formatMoney, plural } from "@/lib/format";
import { configDoReceituario, receituarioComCustos } from "@/lib/receituario-dados";
import { CATEGORIAS, corDaCategoria, OPERACOES } from "@/lib/receituario-regras";
import { can } from "@/lib/roles";

import { AcoesDasFichas } from "./acoes-das-fichas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fichas · Receituário" };

const SITUACOES = [
  { valor: "", texto: "Todas as situações" },
  { valor: "conferir", texto: "A conferir na cozinha" },
  { valor: "conferidas", texto: "Conferidas" },
  { valor: "sem-preco", texto: "Com insumo sem preço" },
  { valor: "desligadas", texto: "Desligadas" },
];

/**
 * As fichas da casa: busca por nome, código ou ingrediente, e filtros por
 * categoria, operação, tipo e situação. O custo só aparece para quem
 * configura o módulo; a cozinha vê a receita.
 */
export default async function FichasPage({ searchParams }: PageProps<"/admin/receituario">) {
  const [user, q] = await Promise.all([guardModule("receituario"), searchParams]);
  const verCusto = can(user, "receituario", { configure: true });
  const [{ fichas, custoDasFichas, insumos, custosDosInsumos }, config, fotos] = await Promise.all([
    receituarioComCustos(),
    configDoReceituario(),
    // Só a data de cada foto: a miniatura vem pela rota, com `?v=` para o navegador guardar.
    prisma.fotoDaFicha.findMany({ select: { fichaId: true, updatedAt: true } }),
  ]);
  const versaoDaFoto = new Map(fotos.map((f) => [f.fichaId, f.updatedAt.getTime()]));

  const p = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const busca = chave(p("q"));
  const categoria = p("categoria");
  const operacao = p("operacao");
  const tipo = p("tipo");
  const situacao = p("situacao");
  const etiqueta = p("etiqueta");

  const nomeDoInsumo = new Map(insumos.map((i) => [i.id, i.nome]));
  const nomeDaFicha = new Map(fichas.map((f) => [f.id, f.nome]));
  const visiveis = fichas.filter((f) => {
    const c = custoDasFichas.get(f.id)!;
    if (situacao === "desligadas" ? f.ativo : !f.ativo) return false;
    if (categoria && f.categoria !== categoria) return false;
    if (operacao && !f.operacoes.includes(operacao)) return false;
    if (tipo && f.tipo !== tipo) return false;
    if (etiqueta && !f.etiquetas.includes(etiqueta)) return false;
    if (situacao === "conferir" && f.conferida) return false;
    if (situacao === "conferidas" && !f.conferida) return false;
    if (situacao === "sem-preco" && c.semPreco === 0) return false;
    if (busca) {
      const ingredientes = f.ingredientes.map((l) => (l.insumoId ? nomeDoInsumo.get(l.insumoId) : l.subFichaId ? nomeDaFicha.get(l.subFichaId) : "") ?? "");
      if (!chave(`${f.codigo} ${f.nome} ${f.etiquetas.join(" ")} ${ingredientes.join(" ")}`).includes(busca)) return false;
    }
    return true;
  });

  // A impressão em lote sai na operacional (sem valores); a técnica é um botão à parte.
  const filtroDaImpressao: Record<string, string> = { ...(categoria ? { categoria } : {}), ...(operacao ? { operacao } : {}) };

  const ativas = fichas.filter((f) => f.ativo);
  const conferidas = ativas.filter((f) => f.conferida).length;
  const estimados = insumos.filter((i) => i.ativo && i.estimado && custosDosInsumos.get(i.id)?.origem !== "compra").length;
  const porPorcao = ativas.map((f) => custoDasFichas.get(f.id)!.porPorcao).filter((x): x is number => x !== null && x > 0);
  const medio = porPorcao.length ? porPorcao.reduce((s, x) => s + x, 0) / porPorcao.length : null;

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Receituário"
        subtitulo="As receitas da casa num lugar só: a ficha técnica e a operacional de cada uma."
      />

      {/* Criar à mão ou trazer a receita que a IA escreveu. */}
      <AcoesDasFichas
        podeCriar={verCusto}
        filtro={(categoria || operacao) && visiveis.length > 0 ? new URLSearchParams(filtroDaImpressao).toString() : null}
        rotulo={categoria ? `as fichas de ${categoria}` : `estas ${plural(visiveis.length, "ficha", "fichas")}`}
        verCusto={verCusto}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero rotulo="Fichas" valor={String(ativas.length)} />
        <Numero rotulo="Conferidas na cozinha" valor={`${conferidas} de ${ativas.length}`} />
        {verCusto && <Numero rotulo="Insumos com preço estimado" valor={String(estimados)} href="/admin/receituario/insumos?situacao=estimados" />}
        {verCusto && <Numero rotulo="Custo médio por porção" valor={medio === null ? "—" : formatMoney(medio)} />}
      </div>

      <form method="get" className="space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input name="q" defaultValue={p("q")} placeholder="Nome, código ou ingrediente" aria-label="Buscar ficha" className="h-11 pl-9" />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Buscar
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SelectQueEnvia name="categoria" rotulo="Categoria" atual={categoria} opcoes={[{ valor: "", texto: "Todas as categorias" }, ...CATEGORIAS.map((c) => ({ valor: c.nome, texto: c.nome }))]} />
          <SelectQueEnvia name="operacao" rotulo="Operação" atual={operacao} opcoes={[{ valor: "", texto: "Todas as operações" }, ...OPERACOES.map((o) => ({ valor: o.chave, texto: o.nome }))]} />
          <SelectQueEnvia
            name="tipo"
            rotulo="Tipo de ficha"
            atual={tipo}
            opcoes={[
              { valor: "", texto: "Prontas e pré-preparos" },
              { valor: "PRONTA", texto: "Receitas prontas" },
              { valor: "PRE_PREPARO", texto: "Pré-preparos" },
            ]}
          />
          <SelectQueEnvia
            name="etiqueta"
            rotulo="Etiqueta"
            atual={etiqueta}
            opcoes={[{ valor: "", texto: "Todas as etiquetas" }, ...[...new Set([...config.etiquetas, ...(etiqueta ? [etiqueta] : [])])].map((e) => ({ valor: e, texto: e }))]}
          />
          <SelectQueEnvia name="situacao" rotulo="Situação" atual={situacao} opcoes={verCusto ? SITUACOES : SITUACOES.filter((s) => s.valor !== "sem-preco")} />
        </div>
      </form>

      <p className="text-sm text-[var(--muted-foreground)]">{plural(visiveis.length, "ficha", "fichas")}</p>
      {visiveis.length === 0 ? (
        <Vazio>Nenhuma ficha com esses filtros.</Vazio>
      ) : (
        // Um lote de cada vez: com todas as fichas desenhadas, a página passava
        // de 30 mil pixels no celular. A `key` dos filtros recomeça do topo
        // quando a busca muda.
        <ListaEmLotes key={`${busca}|${categoria}|${operacao}|${tipo}|${situacao}|${etiqueta}`}>
          {visiveis.map((f) => {
            const c = custoDasFichas.get(f.id)!;
            return (
              <li key={f.id}>
                <Link href={`/admin/receituario/${f.codigo}`} className="flex items-center gap-3 py-2 pr-4 hover:bg-[var(--muted)]">
                  <span aria-hidden className="w-1 self-stretch rounded-r" style={{ background: corDaCategoria(f.categoria, config.cores) }} />
                  {versaoDaFoto.has(f.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura da rota do módulo, com a sessão.
                    <img
                      src={`/admin/receituario/foto/${encodeURIComponent(f.codigo)}?mini=1&v=${versaoDaFoto.get(f.id)}`}
                      alt=""
                      loading="lazy"
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span aria-hidden className="size-10 shrink-0 rounded-lg bg-[var(--muted)]" />
                  )}
                  <span className="w-12 shrink-0 font-mono text-xs text-[var(--muted-foreground)]">{f.codigo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.nome}</span>
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">
                      {f.categoria}
                      {f.tipo === "PRE_PREPARO" && " · pré-preparo"}
                      {f.operacoes.length > 0 && ` · ${f.operacoes.map((o) => OPERACOES.find((x) => x.chave === o)?.nome ?? o).join(", ")}`}
                      {f.etiquetas.length > 0 && ` · ${f.etiquetas.join(", ")}`}
                      {verCusto && c.semPreco > 0 && <span style={{ color: "var(--warn)" }}> · {plural(c.semPreco, "insumo sem preço", "insumos sem preço")}</span>}
                    </span>
                  </span>
                  {verCusto && c.porPorcao !== null && (
                    <span className="shrink-0 text-right text-sm tabular-nums">
                      {formatMoney(c.porPorcao)}
                      <span className="block text-[10px] text-[var(--muted-foreground)]">por porção</span>
                    </span>
                  )}
                  <span className="w-5 shrink-0">
                    {f.conferida && <CircleCheck aria-label="conferida" className="size-5" style={{ color: "var(--ok-strong)" }} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ListaEmLotes>
      )}
    </Pagina>
  );
}

function Numero({ rotulo, valor, href }: { rotulo: string; valor: string; href?: string }) {
  const corpo = (
    <>
      <span className="block text-xs text-[var(--muted-foreground)]">{rotulo}</span>
      <span className="block text-lg font-semibold tabular-nums">{valor}</span>
    </>
  );
  const classe = "block rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5";
  return href ? (
    <Link href={href} className={`${classe} hover:bg-[var(--muted)]`}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}
