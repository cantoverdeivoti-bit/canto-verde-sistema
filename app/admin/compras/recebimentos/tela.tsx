import { PackagePlus, Scale, ScanLine, SquarePen } from "lucide-react";
import Link from "next/link";

import { GradeDeAtalhos } from "@/components/grade-de-atalhos";
import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { MOTIVO_SEM_PEDIDO } from "@/lib/cotacao-labels";
import { diaDaqui, diaISO, formatDiaCurtoString, formatDiaNumericoString } from "@/lib/format";
import type { DesfechoDivergencia, MotivoSemPedido } from "@/generated/prisma/client";

import type { PedidoRow } from "../pedido-card";
import type { ProdutoComFornecedores } from "@/lib/produtos-para-pedido";

import { ProvedorDeInclusao } from "./incluir-item";
import { LinhaDoPedido } from "./linha-do-pedido";

export type Linha = PedidoRow & {
  fornecedorId: number;
  criadoEm: string;
  cotacaoId: number | null;
  /** "Cotação de 02/10", quando veio de uma. */
  cotacaoNome: string | null;
  /** Preenchido, nasceu de uma contagem. Nulo nos dois = pedido avulso. */
  contagemId: number | null;
  /** "2026-09-24" — quando a entrada foi dada. Nulo enquanto espera. */
  recebidoEm?: string | null;
  /** Preenchido, chegou sem pedido e nasceu já recebido. */
  motivoSemPedido?: MotivoSemPedido | null;
  /** O que foi feito com a diferença, quando houve e foi resolvida em Pendências. */
  desfecho?: DesfechoDivergencia | null;
};

const DESFECHO_TEXTO: Record<DesfechoDivergencia, string> = {
  COBRADO: "diferença cobrada",
  CREDITO: "crédito na próxima",
  ACEITO: "diferença aceita",
};

type Grupo = { chave: string; titulo: string; atencao?: boolean; pedidos: Linha[] };

/**
 * A tela de Recebimentos, separada da busca no banco: a página real passa os
 * pedidos de verdade, e a página de exemplo passa pedidos inventados para ver
 * o desenho sem gravar nada.
 *
 * Uma lista por dia de entrega, e só: quem recebe quer saber o que chega hoje
 * e o que já devia ter chegado. Cada pedido é uma linha — fornecedor, itens,
 * valor — e tocar nela abre a conferência ali mesmo.
 */
export function TelaDeRecebimentos({
  linhas,
  entradaAberta,
  timezone,
  peloLink = false,
  paraIncluir,
}: {
  linhas: Linha[];
  /** Acabou de ser registrada (chegou sem pedido): abre os recebidos nela. */
  entradaAberta?: number;
  /** O fuso da casa: "hoje" é o dia do restaurante, não o do servidor. */
  timezone: string;
  /** Aberto pelo link de atalhos: cotação e lista de pedidos pedem login, então viram texto. */
  peloLink?: boolean;
  /** Os produtos para incluir na conferência o que veio fora do pedido. */
  paraIncluir?: { produtos: ProdutoComFornecedores[]; categorias: { id: number; name: string }[] };
}) {
  const esperando = linhas.filter((p) => !p.entregaConfirmada);
  // Os recebidos vêm do mais novo para o mais velho: o que se procura num
  // histórico é o que aconteceu por último, e não o começo de tudo.
  const recebidos = linhas.filter((p) => p.entregaConfirmada).reverse();

  const hoje = diaISO(diaDaqui(0, timezone));
  const amanha = diaISO(diaDaqui(1, timezone));
  // Pela entrega prevista, a mais próxima primeiro; no mesmo dia, pelo nome.
  const ordem = [...esperando].sort(
    (a, b) =>
      (a.entregaPrevista ?? "9999").localeCompare(b.entregaPrevista ?? "9999") ||
      a.fornecedor.localeCompare(b.fornecedor),
  );
  const grupos: Grupo[] = [
    { chave: "atrasados", titulo: "Atrasados", atencao: true, pedidos: [] },
    { chave: "hoje", titulo: "Hoje", pedidos: [] },
    { chave: "amanha", titulo: "Amanhã", pedidos: [] },
    { chave: "proximos", titulo: "Próximos dias", pedidos: [] },
    { chave: "sem-data", titulo: "Sem data", pedidos: [] },
  ];
  for (const p of ordem) {
    const d = p.entregaPrevista;
    const i = d === null ? 4 : d < hoje ? 0 : d === hoje ? 1 : d === amanha ? 2 : 3;
    grupos[i].pedidos.push(p);
  }

  /** A linha pequena sob o nome: só onde a data diz algo que o grupo não diz. */
  const sub = (p: Linha) =>
    p.entregaPrevista === null || p.entregaPrevista === hoje || p.entregaPrevista === amanha ? null : p.entregaPrevista <
      hoje ? (
      <span style={{ color: "var(--warn)" }}>era {formatDiaCurtoString(p.entregaPrevista)}</span>
    ) : (
      formatDiaCurtoString(p.entregaPrevista)
    );

  /* De onde o pedido veio, com caminho de volta. São TRÊS origens e não duas:
     cotação, direto (nasceu de um produto exclusivo dentro de uma contagem) e
     avulso (não nasceu de nenhuma das duas) — e agora a quarta, que nem pedido
     teve: chegou na porta. */
  const origem = (p: Linha) =>
    p.motivoSemPedido ? (
      <span>sem pedido · {MOTIVO_SEM_PEDIDO[p.motivoSemPedido].texto.toLowerCase()}</span>
    ) : peloLink && p.cotacaoId !== null ? (
      <span>{p.cotacaoNome}</span>
    ) : peloLink && p.contagemId !== null ? (
      <span>pedido direto</span>
    ) : p.cotacaoId !== null ? (
      <Link href={`/admin/compras/cotacao/${p.cotacaoId}`} className="underline-offset-4 hover:underline">
        {p.cotacaoNome}
      </Link>
    ) : p.contagemId !== null ? (
      <Link href={`/admin/compras/pedidos?c=${p.contagemId}`} className="underline-offset-4 hover:underline">
        pedido direto
      </Link>
    ) : (
      <Link href={`/admin/compras/pedidos/${p.id}`} className="underline-offset-4 hover:underline">
        pedido avulso
      </Link>
    );

  /** Nos recebidos: quando chegou, e o que merece olho — sem pedido, problema. */
  const subDoRecebido = (p: Linha) => {
    const problemas = p.itens.filter((i) => i.problema).length;
    return (
      <>
        {p.recebidoEm ? `chegou ${formatDiaCurtoString(p.recebidoEm)}` : `pedido de ${formatDiaNumericoString(p.criadoEm)}`}
        {p.motivoSemPedido && ` · ${MOTIVO_SEM_PEDIDO[p.motivoSemPedido].texto}`}
        {p.desfecho ? (
          ` · ${DESFECHO_TEXTO[p.desfecho]}`
        ) : problemas > 0 && (
          <span style={{ color: "var(--destructive)" }}>
            {" · "}
            {problemas === 1 ? "1 item com problema" : `${problemas} itens com problema`}
          </span>
        )}
      </>
    );
  };

  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Receber pedidos" />
      {/* Os atalhos num cartão, como as abas dos Relatórios: o que chegou sem
          pedido, a nota do mercado (a câmera lê o QR do cupom e os itens vêm
          sozinhos) e, para quem compra, onde os pedidos nascem. Pelo link de
          atalhos, só os dois primeiros. */}
      <GradeDeAtalhos
        rotulo="Atalhos do recebimento"
        atalhos={[
          { href: "/admin/compras/recebimentos/sem-pedido", nome: "Chegou sem pedido", icone: PackagePlus },
          { href: "/admin/compras/recebimentos/nota", nome: "Ler nota do mercado", icone: ScanLine },
          ...(peloLink
            ? []
            : [
                { href: "/admin/compras/pedido-manual", nome: "Pedido manual", icone: SquarePen },
                { href: "/admin/compras/cotacao", nome: "Fazer cotação", icone: Scale },
              ]),
        ]}
      />

      {esperando.length === 0 && peloLink ? (
        <Vazio>Nada esperando entrega.</Vazio>
      ) : esperando.length === 0 ? (
        <Vazio>
          Nada esperando entrega. Os pedidos aparecem aqui assim que saem da{" "}
          <Link href="/admin/compras/cotacao" className="text-[var(--primary)] underline-offset-4 hover:underline">
            Cotação
          </Link>{" "}
          ou do{" "}
          <Link href="/admin/compras/pedido-manual" className="text-[var(--primary)] underline-offset-4 hover:underline">
            Pedido manual
          </Link>
          .
        </Vazio>
      ) : (
        <ProvedorDeInclusao produtos={paraIncluir?.produtos ?? []} categorias={paraIncluir?.categorias ?? []}>
        {grupos
          .filter((g) => g.pedidos.length > 0)
          .map((g) => (
            <section key={g.chave}>
              <h2 className="section-label" style={g.atencao ? { color: "var(--warn)" } : undefined}>
                {g.titulo} · {g.pedidos.length}
              </h2>
              <ul
                className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border bg-[var(--card)]"
                style={{ borderColor: g.atencao ? "var(--warn)" : "var(--border)" }}
              >
                {g.pedidos.map((p) => (
                  <LinhaDoPedido key={p.id} pedido={p} sub={sub(p)} conferir />
                ))}
              </ul>
            </section>
          ))}
        </ProvedorDeInclusao>
      )}

      {/* Fechado: é consulta, não trabalho pendente. Aberto, empurraria para
          baixo justamente o que ainda falta conferir. */}
      {recebidos.length > 0 && (
        <details className="group" open={entradaAberta !== undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex-1 font-semibold">Já recebidos</span>
            <span className="text-xs text-[var(--muted-foreground)]">últimos {recebidos.length}</span>
            <span aria-hidden className="text-[var(--muted-foreground)] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <Lista className="mt-2">
            {recebidos.map((p) => (
              <LinhaDoPedido
                key={p.id}
                pedido={p}
                sub={subDoRecebido(p)}
                detalhe={origem(p)}
                abertoDeInicio={p.id === entradaAberta}
              />
            ))}
          </Lista>
        </details>
      )}
    </Pagina>
  );
}
