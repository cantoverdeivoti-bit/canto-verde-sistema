import { NextResponse } from "next/server";

import { getSettings, toDateOnly, todayInTimezone } from "@/lib/availability";
import {
  casaDigitos,
  casaTexto,
  lerTermo,
  melhores,
  POR_GRUPO,
  type Grupo,
} from "@/lib/busca";
import { PEDIDO_LABEL } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { formatDayAndMonth, FUSO_DA_CASA } from "@/lib/format";
import { visibleModules } from "@/lib/roles";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A busca da lupa do topo (`app/admin/busca-do-topo.tsx`): `?q=` e volta os
 * grupos com o que casou, cada item com o link da tela dele.
 *
 * Cada grupo só é consultado para quem entra no módulo dele: quem não vê o
 * Pessoal não acha colaborador nem sabe que ele existe. O CPF só conta para
 * quem configura o Pessoal, a mesma trava da ficha do colaborador.
 *
 * Os cadastros são pequenos (dezenas de pessoas, centenas de produtos e
 * fichas), então a comparação é feita aqui, sem acento (`lib/busca.ts`); o
 * banco não tem `unaccent`. Pedidos e reservas, que crescem, têm recorte.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.atalho)
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const termo = lerTermo(new URL(request.url).searchParams.get("q") ?? "");
  if (!termo) return NextResponse.json({ grupos: [] });

  const consultas: Promise<Grupo | null>[] = [];
  // "#23": só o pedido. Os outros grupos entram com qualquer outra busca.
  const tudo = !termo.soPedido;

  // As telas do menu: "escala", "ferias" leva direto para a tela.
  const telas = visibleModules(user).flatMap((m) =>
    m.sections
      .filter(
        (s) => !s.soQuemConfigura || can(user, m.slug, { configure: true }),
      )
      .map((s) => ({ titulo: s.label, detalhe: m.name, href: s.href })),
  );
  if (tudo)
    consultas.push(
      Promise.resolve({
        nome: "Telas",
        itens: melhores(
          telas,
          (t) => casaTexto(termo, t.titulo, t.detalhe),
          (t) => t.titulo,
          termo,
        ),
      }),
    );

  if (tudo && can(user, "pessoal")) {
    const verCpf = can(user, "pessoal", { configure: true });
    consultas.push(
      prisma.colaborador
        .findMany({
          where: { pendente: false },
          select: {
            id: true,
            nome: true,
            apelido: true,
            telefone: true,
            cpf: true,
            ativo: true,
          },
        })
        .then((todos) => ({
          nome: "Colaboradores",
          itens: melhores(
            todos,
            (c) =>
              casaTexto(termo, c.nome, c.apelido) ||
              casaDigitos(termo, c.telefone, verCpf ? c.cpf : null),
            (c) => c.nome,
            termo,
            (c) => c.ativo,
          ).map((c) => ({
            titulo: c.nome,
            detalhe: c.ativo ? (c.apelido ?? undefined) : "desligado",
            href: `/admin/pessoal/colaboradores/${c.id}`,
            apagado: !c.ativo,
          })),
        })),
    );
  }

  if (tudo && can(user, "receituario")) {
    consultas.push(
      prisma.fichaTecnica
        .findMany({
          select: { codigo: true, nome: true, categoria: true, ativo: true },
        })
        .then((todas) => ({
          nome: "Fichas técnicas",
          itens: melhores(
            todas,
            (f) => casaTexto(termo, f.codigo, f.nome),
            (f) => f.nome,
            termo,
            (f) => f.ativo,
          ).map((f) => ({
            titulo: f.nome,
            detalhe: `${f.codigo} · ${f.categoria}`,
            href: `/admin/receituario/${encodeURIComponent(f.codigo)}`,
            apagado: !f.ativo,
          })),
        })),
    );
  }

  if (can(user, "compras")) {
    if (tudo) {
      consultas.push(
        prisma.product
          .findMany({
            select: { id: true, code: true, name: true, isActive: true },
          })
          .then((todos) => ({
            nome: "Produtos",
            itens: melhores(
              todos,
              (p) => casaTexto(termo, p.name, p.code),
              (p) => p.name,
              termo,
              (p) => p.isActive,
            ).map((p) => ({
              titulo: p.name,
              detalhe: p.code ?? undefined,
              href: `/admin/compras?q=${encodeURIComponent(p.name)}`,
              apagado: !p.isActive,
            })),
          })),
        prisma.supplier
          .findMany({
            select: {
              id: true,
              name: true,
              apelido: true,
              contactName: true,
              phone: true,
              isActive: true,
            },
          })
          .then((todos) => ({
            nome: "Fornecedores",
            itens: melhores(
              todos,
              (f) =>
                casaTexto(termo, f.name, f.apelido, f.contactName) ||
                casaDigitos(termo, f.phone),
              (f) => f.apelido || f.name,
              termo,
              (f) => f.isActive,
            ).map((f) => ({
              titulo: f.apelido || f.name,
              detalhe: f.apelido ? f.name : (f.contactName ?? undefined),
              href: `/admin/compras/fornecedores?q=${encodeURIComponent(f.name)}`,
              apagado: !f.isActive,
            })),
          })),
      );
    }
    consultas.push(
      // Pelo número ("#23") ou pelo fornecedor, nos pedidos mais recentes.
      prisma.pedidoCompra
        .findMany({
          where: termo.numero ? { id: termo.numero } : undefined,
          orderBy: { id: "desc" },
          take: termo.numero ? 1 : 200,
          select: {
            id: true,
            estatus: true,
            createdAt: true,
            fornecedor: { select: { name: true, apelido: true } },
          },
        })
        .then((pedidos) => ({
          nome: "Pedidos de compra",
          itens: (termo.numero
            ? pedidos
            : pedidos.filter((p) =>
                casaTexto(termo, p.fornecedor.name, p.fornecedor.apelido),
              )
          )
            .slice(0, POR_GRUPO)
            .map((p) => ({
              titulo: `Pedido #${p.id} · ${p.fornecedor.apelido || p.fornecedor.name}`,
              detalhe: `${PEDIDO_LABEL[p.estatus].texto} · ${formatDayAndMonth(p.createdAt, FUSO_DA_CASA)}`,
              href: `/admin/compras/pedidos/${p.id}`,
            })),
        })),
    );
  }

  if (tudo && can(user, "comercial")) {
    consultas.push(
      getSettings().then(async ({ capacity }) => {
        // De 30 dias atrás em diante: quem liga para remarcar ou para reclamar.
        const desde = new Date(
          `${todayInTimezone(capacity.timezone)}T00:00:00.000Z`,
        );
        desde.setUTCDate(desde.getUTCDate() - 30);
        const reservas = await prisma.reservation.findMany({
          where: {
            serviceDate: { gte: toDateOnly(desde.toISOString().slice(0, 10)) },
            OR: [
              ...termo.palavras.map((p) => ({
                customerName: { contains: p, mode: "insensitive" as const },
              })),
              ...(termo.digitos
                ? [{ customerPhone: { contains: termo.digitos } }]
                : []),
            ],
          },
          orderBy: { serviceDate: "asc" },
          take: 50,
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            partySize: true,
            serviceDate: true,
          },
        });
        return {
          nome: "Reservas",
          itens: reservas
            .filter(
              (r) =>
                casaTexto(termo, r.customerName) ||
                casaDigitos(termo, r.customerPhone),
            )
            .slice(0, POR_GRUPO)
            .map((r) => ({
              titulo: r.customerName,
              detalhe: `${formatDayAndMonth(r.serviceDate, "UTC")} · ${r.partySize} pessoas`,
              href: `/admin/comercial?date=${r.serviceDate.toISOString().slice(0, 10)}`,
            })),
        };
      }),
    );
  }

  // Um grupo que falhou não derruba os outros.
  const grupos = (await Promise.allSettled(consultas)).flatMap((r) =>
    r.status === "fulfilled" && r.value && r.value.itens.length > 0
      ? [r.value]
      : [],
  );
  return NextResponse.json({ grupos });
}
