import { Search } from "lucide-react";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { chave } from "@/lib/format";
import { receituarioComCustos } from "@/lib/receituario-dados";

import { ListaDeInsumos, type InsumoNaTela } from "./lista-de-insumos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insumos · Receituário" };

const SITUACOES = [
  { valor: "", texto: "Todos" },
  { valor: "estimados", texto: "Preço estimado" },
  { valor: "sem-preco", texto: "Sem preço" },
  { valor: "da-compra", texto: "Preço da última compra" },
  { valor: "sem-vinculo", texto: "Sem produto de Compras" },
  { valor: "embalagens", texto: "Embalagens" },
];

/**
 * Os insumos das fichas: o preço por kg (ou L, ou unidade) de cada um, de
 * onde ele vem (última compra em Compras ou digitado) e em quantas fichas
 * entra. Trocar o preço ou o vínculo aqui recalcula todas as fichas.
 */
export default async function InsumosPage({ searchParams }: PageProps<"/admin/receituario/insumos">) {
  await guardModule("receituario", { configure: true });
  const q = await searchParams;
  const p = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const [{ insumos, custosDosInsumos }, produtos] = await Promise.all([
    receituarioComCustos(),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, unit: true } }),
  ]);
  const busca = chave(p("q"));
  const situacao = p("situacao");

  const linhas: InsumoNaTela[] = insumos.map((i) => {
    const c = custosDosInsumos.get(i.id)!;
    return {
      id: i.id,
      codigo: i.codigo,
      nome: i.nome,
      categoria: i.categoria ?? "",
      unidadeUso: i.unidadeUso,
      produtoId: i.produtoId,
      produto: i.produto ? `${i.produto.code ? `${i.produto.code} · ` : ""}${i.produto.name}` : null,
      unidadeCompra: i.unidadeCompra ?? "",
      precoCompra: i.precoCompra === null ? null : Number(i.precoCompra),
      qtdPorUnidade: Number(i.qtdPorUnidade),
      rendimento: Number(i.rendimento),
      estimado: i.estimado,
      embalagem: i.embalagem,
      observacao: i.observacao ?? "",
      usos: i._count.ingredientes,
      liquido: c.liquido,
      origem: c.origem,
      em: c.em,
    };
  });
  const visiveis = linhas.filter((i) => {
    if (busca && !chave(`${i.codigo} ${i.nome} ${i.categoria} ${i.produto ?? ""}`).includes(busca)) return false;
    if (situacao === "estimados") return i.estimado && i.origem !== "compra";
    if (situacao === "sem-preco") return i.origem === null;
    if (situacao === "da-compra") return i.origem === "compra";
    if (situacao === "sem-vinculo") return i.produtoId === null;
    if (situacao === "embalagens") return i.embalagem;
    return true;
  });

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Insumos"
        subtitulo="O preço vem da última compra em Compras."
        ajuda="Sem compra do produto ligado, vale o preço digitado no insumo. Trocar o preço ou o produto ligado recalcula todas as fichas."
      />
      <ListaDeInsumos
        key={`${p("q")}|${situacao}`}
        busca={
          // A busca num cartão branco, como em Produtos: o campo com a lupa
          // em cima, a situação e o Buscar embaixo.
          <form method="get" className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
            <div className="relative min-w-0">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input name="q" type="search" defaultValue={p("q")} placeholder="Nome, código ou categoria" aria-label="Buscar insumo" className="h-11 w-full pl-9" />
            </div>
            <div className="flex gap-2">
              <SelectQueEnvia
                name="situacao"
                rotulo="Situação do preço"
                atual={situacao}
                opcoes={SITUACOES}
                className="field h-11 min-w-0 flex-1 py-0 sm:max-w-64"
              />
              <Button type="submit" className="h-11 shrink-0 sm:ml-auto">
                Buscar
              </Button>
            </div>
          </form>
        }
        insumos={visiveis} total={linhas.length} produtos={produtos.map((x) => ({ id: x.id, nome: `${x.code ? `${x.code} · ` : ""}${x.name}`, unidade: x.unit }))} />
    </Pagina>
  );
}
