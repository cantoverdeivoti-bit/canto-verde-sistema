import { Calculator, Carrot, ClipboardList, Flame, Link2, ListOrdered, Scale, ShoppingBag, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CabecalhoDaPagina, CartaoDeSecao, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatMoney, plural } from "@/lib/format";
import { receituarioComCustos } from "@/lib/receituario-dados";
import { corDaCategoria, OPERACOES, precoNaUnidade, precosSugeridos } from "@/lib/receituario-regras";
import { opcoesDaVenda, vendasComCustos } from "@/lib/receituario-vendas";
import { can } from "@/lib/roles";

import { VendasDaFicha } from "../precos/lista-de-precos";

import { AcoesDaFicha } from "./acoes-da-ficha";
import { FotoDaFicha } from "./foto-da-ficha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha · Receituário" };

const numero = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/**
 * Uma ficha em duas partes. A operacional é a da cozinha: ingredientes com
 * as quantidades, modo de preparo, forno, utensílios, ponto de controle e
 * montagem, sem valor nenhum. A técnica é a da gestão: o custo de cada
 * ingrediente, da receita e da porção, e o preço sugerido; só quem
 * configura o módulo a vê. Cada uma imprime na sua folha.
 */
export default async function FichaPage({ params, searchParams }: PageProps<"/admin/receituario/[codigo]">) {
  const [{ codigo: bruto }, q] = await Promise.all([params, searchParams]);
  const codigo = decodeURIComponent(bruto).toUpperCase();
  const [user, ficha] = await Promise.all([
    guardModule("receituario"),
    prisma.fichaTecnica.findUnique({
      where: { codigo },
      include: {
        foto: { select: { updatedAt: true } },
        ingredientes: {
          orderBy: { ordem: "asc" },
          include: {
            insumo: { select: { nome: true, unidadeUso: true } },
            subFicha: { select: { codigo: true, nome: true } },
          },
        },
        usadaEm: { select: { ficha: { select: { codigo: true, nome: true } } } },
        itensDeCardapio: { select: { cardapio: { select: { id: true, nome: true } } } },
      },
    }),
  ]);
  if (!ficha) notFound();
  const verCusto = can(user, "receituario", { configure: true });
  const tecnica = verCusto && q.aba === "tecnica";
  const [{ custoDasFichas, custosDosInsumos, config }, pratos, vendas, opcoes] = await Promise.all([
    receituarioComCustos(),
    prisma.pratoBuffet.findMany({ where: { codFicha: ficha.codigo }, select: { nome: true }, orderBy: { nome: "asc" } }),
    // A lista de preços só na ficha técnica: é preço e custo.
    tecnica ? vendasComCustos() : null,
    tecnica ? opcoesDaVenda() : null,
  ]);
  const custo = custoDasFichas.get(ficha.id)!;
  const precos = precosSugeridos(custo.porPorcao, config.metaFoodCost, config.markup);
  const rend = ficha.rendimentoTotal === null ? null : Number(ficha.rendimentoTotal);
  const porcao = rend !== null && ficha.porcoes > 0 ? rend / ficha.porcoes : null;
  const cor = corDaCategoria(ficha.categoria, config.cores);
  const usadaEm = [...new Map(ficha.usadaEm.map((u) => [u.ficha.codigo, u.ficha])).values()];
  const cardapios = [...new Map(ficha.itensDeCardapio.map((i) => [i.cardapio.id, i.cardapio])).values()];
  const verEventos = can(user, "eventos");

  const operacional: [string, ReactNode][] = (
    [
      ["Utensílios", ficha.utensilios],
      ["Ponto de controle", ficha.pontoDeControle],
      ["Montagem e porcionamento", ficha.montagem],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => Boolean(x[1]));
  const forno = (
    [
      ["Viabilidade", ficha.viabilidade],
      ["Modo", ficha.modoForno],
      ["Temperatura", ficha.temperatura],
      ["Umidade", ficha.umidade],
      ["Tempo", ficha.tempoForno],
      ["Sonda", ficha.sonda],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => Boolean(x[1]));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        voltar={{ href: "/admin/receituario", texto: "Fichas" }}
        titulo={ficha.nome}
        subtitulo={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{ficha.codigo}</span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: cor }} />
              {ficha.categoria}
            </span>
            {ficha.tipo === "PRE_PREPARO" && <span className="selo">Pré-preparo</span>}
            {!ficha.ativo && <span className="selo">Desligada</span>}
            {ficha.operacoes.map((o) => (
              <span key={o} className="selo">
                {OPERACOES.find((x) => x.chave === o)?.nome ?? o}
              </span>
            ))}
            {ficha.etiquetas.map((e) => (
              <Link key={e} href={`/admin/receituario?etiqueta=${encodeURIComponent(e)}`} className="selo hover:underline">
                #{e}
              </Link>
            ))}
          </span>
        }
      />

      <div aria-hidden className="h-1.5 rounded-full" style={{ background: cor }} />

      <AcoesDaFicha id={ficha.id} codigo={ficha.codigo} conferida={ficha.conferida} tecnica={tecnica} podeMudar={verCusto} />

      <FotoDaFicha fichaId={ficha.id} codigo={ficha.codigo} nome={ficha.nome} versao={ficha.foto ? String(ficha.foto.updatedAt.getTime()) : null} podeTrocar={verCusto} />

      {verCusto && (
        <nav aria-label="Parte da ficha" className="flex gap-1 rounded-xl bg-[var(--muted)] p-1">
          {[
            { href: `/admin/receituario/${ficha.codigo}`, texto: "Ficha operacional", atual: !tecnica },
            { href: `/admin/receituario/${ficha.codigo}?aba=tecnica`, texto: "Ficha técnica", atual: tecnica },
          ].map((a) => (
            <Link
              key={a.texto}
              href={a.href}
              aria-current={a.atual ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium ${a.atual ? "bg-[var(--card)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {a.texto}
            </Link>
          ))}
        </nav>
      )}

      <CartaoDeSecao icone={Scale} titulo="Rendimento" frase="Quanto rende e quanto tempo dura.">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          <Dado rotulo="Peso pronto" valor={rend === null ? "—" : `${numero(rend)} ${ficha.unidadeRendimento}`} />
          <Dado rotulo="Porções" valor={porcao === null ? String(ficha.porcoes) : `${ficha.porcoes} de ${numero(porcao)} ${ficha.unidadeRendimento}`} />
          <Dado rotulo="Tempo de preparo" valor={ficha.tempoPreparo ?? "—"} />
          <Dado rotulo="Validade" valor={ficha.armazenamento ?? "—"} texto />
        </dl>
      </CartaoDeSecao>

      <div className={`grid items-start gap-4 ${tecnica ? "lg:grid-cols-[1fr_17rem]" : ""}`}>
        <CartaoDeSecao icone={Carrot} titulo="Ingredientes" frase={tecnica ? "O custo de cada item, pelo preço da última compra." : "Na ordem de uso, com o preparo de cada item."}>
          {ficha.ingredientes.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Sem ingredientes lançados.</p>
          ) : (
            <ul className="-my-2 divide-y divide-[var(--border)]">
              {ficha.ingredientes.map((l, i) => {
                const c = custo.linhas[i];
                const semPreco = c === null;
                const insumo = l.insumoId ? custosDosInsumos.get(l.insumoId) : undefined;
                const preco = insumo
                  ? precoNaUnidade(insumo.liquido, insumo.unidadeUso)
                  : l.subFichaId
                    ? precoNaUnidade(custoDasFichas.get(l.subFichaId)?.porUnidade ?? null, l.unidade ?? "g")
                    : null;
                const detalhe = tecnica
                  ? [preco ? `${formatMoney(preco.valor)}/${preco.por}` : null, insumo?.origem === "compra" ? "da compra" : null].filter(Boolean).join(" · ")
                  : l.preparo;
                return (
                  <li key={l.id} className="flex items-start gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      {l.subFicha ? (
                        <Link href={`/admin/receituario/${l.subFicha.codigo}`} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
                          {l.subFicha.nome}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.insumo?.nome ?? l.nomeLivre}</span>
                      )}
                      {l.subFicha && <span className="ml-1 text-xs text-[var(--muted-foreground)]">pré-preparo</span>}
                      {detalhe && <span className="block text-xs text-[var(--muted-foreground)]">{detalhe}</span>}
                    </div>
                    <div className="shrink-0 text-right whitespace-nowrap tabular-nums">
                      <span className="block">
                        {numero(Number(l.quantidade), 1)} {l.unidade ?? ""}
                      </span>
                      {tecnica && (
                        <span className="block text-xs font-semibold" style={semPreco ? { color: "var(--warn)" } : undefined}>
                          {semPreco ? "sem preço" : l.nomeLivre ? "—" : formatMoney(c)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CartaoDeSecao>

        {tecnica && (
          <CartaoDeSecao icone={Calculator} titulo="Custo" frase="Da receita, da porção e o preço sugerido.">
            <dl className="-my-2 divide-y divide-[var(--border)] text-sm">
              <LinhaDeCusto rotulo="Total da receita" valor={formatMoney(custo.total)} forte />
              <LinhaDeCusto rotulo="Por porção" valor={custo.porPorcao === null ? "—" : formatMoney(custo.porPorcao)} forte />
              <LinhaDeCusto rotulo={`Por ${ficha.unidadeRendimento === "mL" ? "L" : "kg"} pronto`} valor={custo.porKg === null ? "—" : formatMoney(custo.porKg)} />
              <LinhaDeCusto rotulo="Perda no preparo" valor={custo.perda === null ? "—" : `${numero(custo.perda * 100, 1)}%`} />
              <LinhaDeCusto rotulo={`Preço mínimo (food cost ${numero(config.metaFoodCost * 100)}%)`} valor={precos.minimo === null ? "—" : formatMoney(precos.minimo)} />
              <LinhaDeCusto rotulo={`Preço pelo markup ${numero(config.markup, 2)}`} valor={precos.markup === null ? "—" : formatMoney(precos.markup)} />
            </dl>
            {custo.semPreco > 0 && (
              <p className="msg-warn text-sm">
                {plural(custo.semPreco, "ingrediente está", "ingredientes estão")} sem preço: o custo real é maior.{" "}
                <Link href="/admin/receituario/insumos" className="underline">
                  Ver insumos
                </Link>
              </p>
            )}
          </CartaoDeSecao>
        )}
      </div>

      {vendas && opcoes && (
        <CartaoDeSecao icone={ShoppingBag} titulo="Venda" frase="Encomenda e delivery desta receita, com preço e CMV.">
          <VendasDaFicha
            fichaId={ficha.id}
            itens={vendas.itens.filter((v) => v.fichaId === ficha.id)}
            todos={vendas.itens}
            opcoes={opcoes}
            metaFoodCost={vendas.metaFoodCost}
          />
        </CartaoDeSecao>
      )}

      {!tecnica && (
        <>
          <CartaoDeSecao icone={ListOrdered} titulo="Modo de preparo" frase="Os passos, na ordem.">
            {ficha.passos.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Sem modo de preparo.</p>
            ) : (
              <ol className="-my-2 divide-y divide-[var(--border)]">
                {ficha.passos.map((p, i) => (
                  <li key={i} className="flex gap-3 py-2.5 text-sm leading-relaxed">
                    <span className="num-display w-5 shrink-0 text-right text-base text-[var(--muted-foreground)]">{i + 1}</span>
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ol>
            )}
          </CartaoDeSecao>

          <CartaoDeSecao icone={Flame} titulo="Forno combinado" frase="Como regular o forno para esta receita.">
            {forno.length === 0 && !ficha.ajusteForno ? (
              <p className="text-sm text-[var(--muted-foreground)]">Sem dados de forno. {verCusto && "Edite a ficha para preencher."}</p>
            ) : (
              <>
                {forno.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
                    {forno.map(([r, v]) => (
                      <Dado key={r} rotulo={r} valor={v} texto />
                    ))}
                  </dl>
                )}
                {ficha.ajusteForno && <p className="text-sm leading-relaxed whitespace-pre-line">{ficha.ajusteForno}</p>}
              </>
            )}
          </CartaoDeSecao>

          {operacional.length > 0 && (
            <CartaoDeSecao icone={ClipboardList} titulo="Execução" frase="Utensílios, controle e montagem.">
              {operacional.map(([r, v]) => (
                <div key={r}>
                  <h3 className="text-xs font-medium text-[var(--muted-foreground)]">{r}</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{v}</p>
                </div>
              ))}
            </CartaoDeSecao>
          )}

          {(ficha.alergenicos.length > 0 || ficha.observacoes) && (
            <CartaoDeSecao icone={TriangleAlert} titulo="Observações" frase="Alergênicos e dicas de execução.">
              {ficha.alergenicos.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">Alergênicos:</span> {ficha.alergenicos.join(", ")}
                </p>
              )}
              {ficha.observacoes && <p className="text-sm leading-relaxed whitespace-pre-line">{ficha.observacoes}</p>}
            </CartaoDeSecao>
          )}
        </>
      )}

      {(usadaEm.length > 0 || pratos.length > 0 || cardapios.length > 0) && (
        <CartaoDeSecao icone={Link2} titulo="Onde é usada" frase="Fichas, pratos do buffet e cardápios que usam esta receita.">
          <ul className="space-y-1 text-sm">
            {usadaEm.map((u) => (
              <li key={u.codigo}>
                Pré-preparo de{" "}
                <Link href={`/admin/receituario/${u.codigo}`} className="text-[var(--primary)] underline-offset-4 hover:underline">
                  {u.nome}
                </Link>
              </li>
            ))}
            {pratos.map((p) => (
              <li key={p.nome}>Buffet: {p.nome}</li>
            ))}
            {cardapios.map((c) => (
              <li key={c.id}>
                Cardápio de evento:{" "}
                {verEventos ? (
                  <Link href={`/admin/eventos/cardapios/${c.id}`} className="text-[var(--primary)] underline-offset-4 hover:underline">
                    {c.nome}
                  </Link>
                ) : (
                  c.nome
                )}
              </li>
            ))}
          </ul>
        </CartaoDeSecao>
      )}
    </Pagina>
  );
}

/** Um dado da ficha: rótulo pequeno em cima, valor embaixo. `texto` para valor longo (a validade). */
function Dado({ rotulo, valor, texto = false }: { rotulo: string; valor: string; texto?: boolean }) {
  return (
    <div className={texto && valor.length > 24 ? "col-span-2 sm:col-span-1" : undefined}>
      <dt className="text-xs text-[var(--muted-foreground)]">{rotulo}</dt>
      <dd className={texto ? "text-sm leading-snug font-medium" : "text-base font-semibold tabular-nums"}>{valor}</dd>
    </div>
  );
}

function LinhaDeCusto({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-[var(--muted-foreground)]">{rotulo}</dt>
      <dd className={`tabular-nums ${forte ? "font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}
