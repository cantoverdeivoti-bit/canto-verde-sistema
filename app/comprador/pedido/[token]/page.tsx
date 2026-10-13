import { Gift } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { bonificacaoPorExtenso } from "@/lib/bonificacoes";
import { bonificacoesDosPedidos } from "@/lib/bonificacoes-dados";
import { prisma } from "@/lib/db";
import { SEM_CATEGORIA, diaISO, formatDiaNumericoString } from "@/lib/format";
import { somarDias } from "@/lib/periodo";

import { PrecoForm } from "./preco-form";

export const dynamic = "force-dynamic";

/** Pelo getUTCDay: 0 é domingo. */
const SIGLAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const metadata = {
  title: "Confirmar preço",
  robots: { index: false, follow: false },
};

/**
 * O fornecedor exclusivo confirmando o preço de um pedido que já existe, sem
 * login. A porta é o token no endereço — mesmo desenho da cotação, mas aqui
 * não há concorrência: o pedido nasceu no instante em que o link foi gerado,
 * e falta só o preço de cada item.
 */
export default async function PedidoDiretoPage({
  params,
}: PageProps<"/comprador/pedido/[token]">) {
  const { token } = await params;

  const [pedido, { capacity }] = await Promise.all([
    prisma.pedidoCompra.findUnique({
      where: { token },
      include: {
        fornecedor: { select: { name: true } },
        itens: {
          include: {
            produto: {
              select: {
                name: true,
                unit: true,
                preferredBrands: true,
                acceptsSimilarBrand: true,
                category: { select: { name: true, sortOrder: true } },
              },
            },
          },
          orderBy: [{ produto: { category: { sortOrder: "asc" } } }, { produto: { name: "asc" } }],
        },
      },
    }),
    getSettings(),
  ]);

  // O link que não serve mais: o que houve no título, e a frase embaixo.
  const invalido: { titulo: string; frase?: string } | null = !pedido
    ? { titulo: "Este link não existe" }
    : pedido.entregaConfirmada || pedido.estatus === "CANCELADO"
      ? { titulo: "Este pedido já foi encerrado", frase: "Obrigado pela resposta!" }
      : null;
  const bonificacoes = pedido && !invalido
    ? (await bonificacoesDosPedidos([pedido.id])).get(pedido.id)?.filter((b) => b.estado !== "CANCELADA") ?? []
    : [];

  const casa = `${capacity.name} · Ivoti`;

  if (invalido || !pedido) {
    return <MolduraDeLink largura="form" rotulo={casa} titulo={invalido?.titulo} subtitulo={invalido?.frase} />;
  }

  const nome = pedido.fornecedor.name;
  return (
    <MolduraDeLink
      largura="form"
      rotulo={casa}
      // O ponto só quando o nome não termina com um ("Ltda." virava "Ltda..").
      titulo={`Olá, ${nome}${nome.trim().endsWith(".") ? "" : "."}`}
    >
      {/* O recado inteiro num quadro, e não num parágrafo cinza: é a
          única instrução da página, e quem abre pelo celular lê só o
          que salta aos olhos. Fica na folha, e não no verde do alto, de
          propósito: lá o quadro de destaque não se leria. */}
      <div
        className="rounded-xl border-l-4 p-4"
        style={{
          borderColor: "var(--primary)",
          background: "color-mix(in oklch, var(--primary) 7%, var(--background))",
        }}
      >
        <p className="text-lg font-semibold">
          Este pedido já é seu. Só falta o preço de cada item.
        </p>
        <p className="mt-1 text-base">
          O que você não tiver, toque em <strong>Em falta</strong>.
        </p>
      </div>

      {bonificacoes.length > 0 && (
        <CartaoDeSecao icone={Gift} titulo="Bonificação combinada">
          <ul className="space-y-1 text-base">
            {bonificacoes.map((b) => (
              <li key={b.id}>
                {bonificacaoPorExtenso(b)}
                {b.nota && <span className="block text-sm text-[var(--muted-foreground)]">{b.nota}</span>}
              </li>
            ))}
          </ul>
        </CartaoDeSecao>
      )}

      <PrecoForm
        token={token}
        casa={capacity.name}
        fornecedor={pedido.fornecedor.name}
        // Os próximos 7 dias (de hoje em diante), no calendário da casa,
        // em ordem de semana — seg a dom —, para ele escolher quando
        // entrega; marcado já o que o pedido prevê, se prevê.
        diasDeEntrega={Array.from({ length: 7 }, (_, n) => {
          const dia = somarDias(todayInTimezone(capacity.timezone), n);
          const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
          return { dia, sigla: SIGLAS[semana], extenso: formatDiaNumericoString(dia), ordem: (semana + 6) % 7 };
        })
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ dia, sigla, extenso }) => ({ dia, sigla, extenso }))}
        entregaAtual={pedido.dataEntregaPrevista ? diaISO(pedido.dataEntregaPrevista) : null}
        itens={pedido.itens.map((i) => ({
          id: i.id,
          nome: i.produto.name,
          unidade: i.produto.unit,
          categoria: i.produto.category?.name ?? SEM_CATEGORIA,
          quantidade: i.quantidadeSolicitada.toNumber(),
          marcas: i.produto.preferredBrands,
          aceitaSimilar: i.produto.acceptsSimilarBrand,
          precoAnterior: i.precoUnitario?.toNumber() ?? null,
          marcaAnterior: i.marca,
          observacaoAnterior: i.observacoes,
          emFaltaAntes: i.emFalta,
        }))}
      />
    </MolduraDeLink>
  );
}
