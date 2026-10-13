import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { formatDayMonthTime, formatDiaNumericoString, formatMoney, plural } from "@/lib/format";
import {
  avisosNaoLidos,
  avisosParaAgir,
  avisosRecentes,
  bonificacoesQueNaoVieram,
  creditosAReceber,
  idealSugeridoPendente,
  pedidosDaRotinaParaEnviar,
  pendenciasDeCompras,
  type Aviso,
} from "@/lib/pendencias";
import { somarDias } from "@/lib/periodo";

import { SugestoesPendentes } from "../sugestoes-list";
import { AvisarNoCelular } from "@/components/avisar-no-celular";
import { FaltasParaAgir, LinhaDoTempo, type AvisoNaTela } from "./avisos";
import { ehBlocoDeAviso } from "@/lib/blocos-de-aviso";
import {
  BonificacoesQueNaoVieram,
  Correcoes,
  CreditosAReceber,
  IdeaisSugeridos,
  Divergencias,
  FornecedoresSemCategoria,
  FornecedoresSemPrazo,
  Ofertas,
  ProdutosSemCodigo,
  ProdutosSemIdeal,
} from "./pendencias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pendências — Compras" };

/**
 * O que em Compras espera por alguém, e o que os fornecedores fizeram.
 *
 * Duas abas. **Pendências**, em ordem de urgência:
 * 1. Agora — o que trava a compra: item que o fornecedor avisou que falta, e
 *    entrega que chegou diferente do combinado.
 * 2. Para decidir — correções do estoquista, produtos novos, ofertas.
 * 3. Cadastros para completar — produto sem estoque ideal nunca é sugerido,
 *    fornecedor sem categoria nunca é chamado para cotação. Dá para completar
 *    ali mesmo, linha a linha.
 *
 * **Avisos** — a linha do tempo dos atos dos fornecedores: respondeu,
 * faltou, entregou (certo ou com diferença). Gravados no instante em que
 * acontecem (`AvisoCompra`), porque o resto do banco só guarda o estado de
 * agora.
 */
export default async function PendenciasPage({ searchParams }: PageProps<"/admin/compras/pendencias">) {
  // Fora do link de atalhos: decidir e mexer em cadastro é de quem cuida das compras.
  const user = await guardModule("compras");
  // Mandar o pedido ao fornecedor é de quem compra: só ele vê os da rotina esperando.
  const podeComprar = can(user, "compras", { configure: true });
  const { aba, bloco } = await searchParams;
  const naAbaAvisos = aba === "avisos";

  // A aba de pendências busca tudo já, junto com as configurações e os avisos
  // não lidos, e não depois deles: nada aqui depende daquilo.
  const principal = naAbaAvisos
    ? null
    : Promise.all([
        // O catálogo só serve para comparar nomes com os produtos novos: sem
        // nenhum esperando decisão, ele nem é buscado (nem vai para a tela).
        pendenciasDeCompras().then(
          async (p) =>
            [
              p,
              p.produtosNovos.length > 0
                ? await prisma.product.findMany({ select: { id: true, name: true, isActive: true } })
                : [],
            ] as const,
        ),
        avisosParaAgir(),
        creditosAReceber(),
        bonificacoesQueNaoVieram(),
        idealSugeridoPendente(),
        podeComprar ? pedidosDaRotinaParaEnviar() : Promise.resolve([]),
      ]);
  principal?.catch(() => {});

  const [{ capacity }, naoLidos] = await Promise.all([getSettings(), avisosNaoLidos()]);
  const tz = capacity.timezone;

  // O dia e a hora de cada aviso no fuso da casa, montados aqui — a tela
  // não recalcula "hoje" no navegador, que pode estar em outro fuso.
  const hoje = todayInTimezone(tz);
  const ontem = somarDias(hoje, -1);
  const naTela = (a: Aviso): AvisoNaTela => {
    const dia = formatInTimeZone(a.em, tz, "yyyy-MM-dd");
    return {
      ...a,
      dia,
      diaTexto: dia === hoje ? "hoje" : dia === ontem ? "ontem" : formatDiaNumericoString(dia),
      hora: formatInTimeZone(a.em, tz, "HH:mm"),
    };
  };

  const abas = (
    <nav aria-label="Pendências e avisos" className="flex gap-1 border-b border-[var(--border)]">
      {[
        { href: "/admin/compras/pendencias", nome: "Pendências", ativa: !naAbaAvisos, conta: 0 },
        { href: "/admin/compras/pendencias?aba=avisos", nome: "Avisos", ativa: naAbaAvisos, conta: naoLidos },
      ].map((x) => (
        <Link
          key={x.href}
          href={x.href}
          aria-current={x.ativa ? "page" : undefined}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            x.ativa
              ? "border-[var(--primary)] text-[var(--foreground)]"
              : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {x.nome}
          {x.conta > 0 && (
            <span className="rounded-full bg-[var(--botao)] px-1.5 text-xs text-[var(--botao-texto)]">
              {x.conta}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  if (naAbaAvisos) {
    const avisos = (await avisosRecentes()).map(naTela);
    return (
      <Pagina>
        <CabecalhoDaPagina titulo="Pendências" />
        {abas}
        <AvisarNoCelular soSeDesligado />
        <LinhaDoTempo avisos={avisos} blocoInicial={ehBlocoDeAviso(bloco) ? bloco : undefined} />
      </Pagina>
    );
  }

  const [[p, catalogo], faltasBrutas, creditos, bonificacoes, ideais, paraEnviar] = await principal!;
  const faltas = faltasBrutas.map(naTela);

  const agora = faltas.length + p.divergencias.length + bonificacoes.length + paraEnviar.length;
  const decisoes = p.produtosNovos.length + p.ofertas.length + p.correcoes.length + ideais.length;
  const cadastros =
    p.semIdeal.length +
    p.semCodigo.length +
    p.loteImpede.length +
    p.semQuemCote.length +
    p.exclusivoInativo.length +
    p.fornSemCategoria.length +
    p.fornSemPrazo.length +
    p.fornSemTelefone.length;

  const resumo = [
    agora > 0 && `${agora} para agir agora`,
    creditos.length > 0 && plural(creditos.length, "crédito a receber", "créditos a receber"),
    decisoes > 0 && `${plural(decisoes, "coisa", "coisas")} esperando decisão`,
    cadastros > 0 && plural(cadastros, "cadastro para completar", "cadastros para completar"),
  ].filter(Boolean);

  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Pendências" />
      {abas}
      <p className="text-sm text-[var(--muted-foreground)]">
        {resumo.length > 0 ? resumo.join(" · ") : "Nada esperando você"}
      </p>

      {resumo.length === 0 && (
        <Vazio>Nada pendente.</Vazio>
      )}

      {/* ---- 1. Agora: o que trava a compra ---- */}
      {agora > 0 && (
        <section className="space-y-3">
          <h2 className="section-label" style={{ color: "var(--primary)" }}>
            Agora
          </h2>
          {paraEnviar.length > 0 && (
            <Bloco
              titulo="Pedidos da rotina para enviar"
              total={paraEnviar.length}
              dica="o estoquista contou; revise e mande ao fornecedor"
              aberto
              destaque
            >
              <ul className="divide-y divide-[var(--border)]">
                {paraEnviar.map((x) => (
                  <li key={x.id}>
                    <Link
                      href={`/admin/compras/pedidos/${x.id}`}
                      className="flex min-h-12 items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--muted)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {x.fornecedor}
                          {x.lista && <span className="font-normal text-[var(--muted-foreground)]"> · rotina {x.lista}</span>}
                        </span>
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          Pedido #{x.id} · {plural(x.itens, "item", "itens")} · contado {formatDayMonthTime(x.criadoEm, tz)}
                          {x.atacado && " · atacado: a lista de compra"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[var(--primary)]">{x.atacado ? "Abrir" : "Mandar"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
          {faltas.length > 0 && (
            <Bloco
              titulo="Em falta no fornecedor"
              total={faltas.length}
              dica="compre de outro, ou marque como resolvido"
              aberto
              destaque
            >
              <FaltasParaAgir avisos={faltas} />
            </Bloco>
          )}
          {p.divergencias.length > 0 && (
            <Bloco
              titulo="Recebimentos com diferença"
              total={p.divergencias.length}
              dica="chegou diferente do combinado"
              aberto
              destaque
            >
              <Divergencias
                pedidos={p.divergencias.map(({ recebidoEm, ...d }) => ({
                  ...d,
                  recebidoEmTexto: recebidoEm ? formatDayMonthTime(recebidoEm, tz) : null,
                }))}
              />
            </Bloco>
          )}
          {bonificacoes.length > 0 && (
            <Bloco
              titulo="Bonificações que não vieram"
              total={bonificacoes.length}
              dica="combinadas, mas não chegaram com o pedido"
              aberto
              destaque
            >
              <BonificacoesQueNaoVieram itens={bonificacoes} />
            </Bloco>
          )}
        </section>
      )}

      {/* ---- Créditos combinados, até serem abatidos ---- */}
      {creditos.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Créditos a receber</h2>
          <Bloco
            titulo="Combinados com o fornecedor"
            total={creditos.length}
            dica={`${formatMoney(creditos.reduce((s, c) => s + c.valor, 0))} para abater nos próximos pedidos`}
            aberto
          >
            <CreditosAReceber
              creditos={creditos.map(({ combinadoEm, ...c }) => ({
                ...c,
                combinadoEmTexto: combinadoEm ? formatDiaNumericoString(formatInTimeZone(combinadoEm, tz, "yyyy-MM-dd")) : null,
              }))}
            />
          </Bloco>
        </section>
      )}

      {/* ---- 2. Para decidir ---- */}
      {decisoes > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Para decidir</h2>

          {ideais.length > 0 && (
            <Bloco titulo="Ideal de compra de rotina sugerido" total={ideais.length} dica="o estoquista achou pouco ou muito" aberto>
              <IdeaisSugeridos itens={ideais} />
            </Bloco>
          )}

          {p.correcoes.length > 0 && (
            <Bloco titulo="Correções de cadastro" total={p.correcoes.length} dica="sugeridas na contagem ou na cotação" aberto>
              <Correcoes correcoes={p.correcoes} categorias={p.categorias} />
            </Bloco>
          )}

          {p.produtosNovos.length > 0 && (
            <SugestoesPendentes
              categorias={p.categorias}
              catalogo={catalogo}
              sugestoes={p.produtosNovos.map((s) => ({
                id: s.id,
                nome: s.nome,
                unit: s.unit,
                categoryId: s.categoryId,
                quantidade: s.quantidade.toNumber(),
                contadoEmTexto: formatDayMonthTime(s.createdAt, tz),
                responsavel: s.contagem.responsavel?.name ?? s.contagem.responsavel?.username ?? null,
              }))}
            />
          )}

          {p.ofertas.length > 0 && (
            <Bloco titulo="Ofertas de fornecedor" total={p.ofertas.length} dica="produtos fora da lista" aberto>
              <Ofertas ofertas={p.ofertas} categorias={p.categorias} />
            </Bloco>
          )}
        </section>
      )}

      {/* ---- 3. Cadastros para completar ---- */}
      {cadastros > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Cadastros para completar</h2>

          {p.semIdeal.length > 0 && (
            <Bloco titulo="Produtos sem estoque ideal" total={p.semIdeal.length} dica="nunca entram na sugestão de compra">
              <ProdutosSemIdeal itens={p.semIdeal} />
            </Bloco>
          )}
          {p.fornSemCategoria.length > 0 && (
            <Bloco titulo="Fornecedores sem categoria" total={p.fornSemCategoria.length} dica="nunca são chamados para cotação">
              <FornecedoresSemCategoria itens={p.fornSemCategoria} categorias={p.categorias} />
            </Bloco>
          )}
          {p.fornSemPrazo.length > 0 && (
            <Bloco titulo="Fornecedores sem prazo de entrega" total={p.fornSemPrazo.length} dica="o pedido fica sem data prevista">
              <FornecedoresSemPrazo itens={p.fornSemPrazo} />
            </Bloco>
          )}
          {p.semCodigo.length > 0 && (
            <Bloco titulo="Produtos sem código" total={p.semCodigo.length}>
              <ProdutosSemCodigo itens={p.semCodigo} />
            </Bloco>
          )}
          {p.loteImpede.length > 0 && (
            <Bloco titulo="Lote maior que o dobro do ideal" total={p.loteImpede.length} dica="a sugestão nunca pede">
              <ListaSimples
                itens={p.loteImpede.map((x) => ({ id: x.id, nome: x.nome, detalhe: `lote ${x.lote} · ideal ${x.ideal}` }))}
                href="/admin/compras"
                acao="Abrir Produtos"
              />
            </Bloco>
          )}
          {p.semQuemCote.length > 0 && (
            <Bloco titulo="Produtos sem fornecedor" total={p.semQuemCote.length} dica="nenhum fornecedor ativo alcança">
              <ListaSimples itens={p.semQuemCote} href="/admin/compras" acao="Abrir Produtos" />
            </Bloco>
          )}
          {p.exclusivoInativo.length > 0 && (
            <Bloco titulo="Exclusivo de fornecedor desativado" total={p.exclusivoInativo.length} dica="o pedido iria para quem não está mais ativo">
              <ListaSimples
                itens={p.exclusivoInativo.map((x) => ({ id: x.id, nome: x.nome, detalhe: x.fornecedor }))}
                href="/admin/compras"
                acao="Abrir Produtos"
              />
            </Bloco>
          )}
          {p.fornSemTelefone.length > 0 && (
            <Bloco titulo="Fornecedores sem telefone" total={p.fornSemTelefone.length} dica="sem WhatsApp para pedido e cotação">
              <ListaSimples itens={p.fornSemTelefone} href="/admin/compras/fornecedores" acao="Abrir Fornecedores" />
            </Bloco>
          )}
        </section>
      )}
    </Pagina>
  );
}

/** Um grupo recolhível: título, quantos, e por que importa. */
function Bloco({
  titulo,
  total,
  dica,
  aberto = false,
  destaque = false,
  children,
}: {
  titulo: string;
  total: number;
  dica?: string;
  aberto?: boolean;
  /** Os da faixa "Agora": borda e fundo na cor da casa. */
  destaque?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={aberto}
      className="group overflow-hidden rounded-xl border"
      style={{ borderColor: destaque ? "var(--primary)" : "var(--border)" }}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden"
        style={{
          background: destaque ? "color-mix(in oklch, var(--primary) 8%, var(--background))" : "var(--surface)",
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{titulo}</span>
          {dica && <span className="block text-xs text-[var(--muted-foreground)]">{dica}</span>}
        </span>
        <span className="num-display shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-sm">{total}</span>
        <span aria-hidden className="text-[var(--muted-foreground)] transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-[var(--border)]">{children}</div>
    </details>
  );
}

/** Uma lista só para ver, com o caminho para resolver na tela do cadastro. */
function ListaSimples({
  itens,
  href,
  acao,
}: {
  itens: { id: number; nome: string; detalhe?: string }[];
  href: string;
  acao: string;
}) {
  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {itens.slice(0, 30).map((i) => (
          <li key={i.id} className="px-3 py-2 text-sm">
            {i.nome}
            {i.detalhe && <span className="block text-xs text-[var(--muted-foreground)]">{i.detalhe}</span>}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-3 py-2 text-sm">
        <span className="text-xs text-[var(--muted-foreground)]">
          {itens.length > 30 && `e mais ${itens.length - 30}`}
        </span>
        <Link href={href} className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
          {acao} →
        </Link>
      </div>
    </>
  );
}
