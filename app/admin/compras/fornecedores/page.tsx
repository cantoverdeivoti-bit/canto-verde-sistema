import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { whatsappNumberLink as whatsappFor } from "@/lib/whatsapp";

import { InvitePanel } from "./invite-panel";
import { SuppliersList } from "./suppliers-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornecedores — Compras" };

export default async function SuppliersPage() {
  // Cadastro: fora do link de atalhos. Guarda própria, porque o layout de
  // Compras abre para ele.
  await guardModule("compras");
  const [suppliers, convites, categorias, produtos] = await Promise.all([
    prisma.supplier.findMany({
      // A categoria vem junto porque a lista mostra o que cada um atende, e
      // uma consulta por fornecedor para descobrir isso seria uma ida ao
      // banco por linha da tela.
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        // Os produtos ligados a ele à mão, para o "Vincular produto".
        products: { select: { productId: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Só o que ainda espera resposta: convite usado virou fornecedor, e
    // convite vencido é ruído.
    prisma.supplierInvite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    // Só ativos: vincular produto desligado é trabalho que não aparece em lugar nenhum.
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, exclusiveSupplierId: true, category: { select: { name: true } } },
    }),
  ]);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Fornecedores" />

      <SuppliersList
        categorias={categorias}
        produtos={produtos.map((p) => ({
          id: p.id,
          nome: p.name,
          categoria: p.category?.name ?? null,
          exclusivoDe: p.exclusiveSupplierId,
        }))}
        convite={
          // A chave cala o aviso de lista do React: este elemento nasce aqui,
          // no servidor, e vai morar entre os botões de SuppliersList.
          <InvitePanel
            key="convite"
            convites={convites.map((c) => ({
              id: c.id,
              token: c.token,
              label: c.label,
              expiresAt: c.expiresAt.toISOString().slice(0, 10),
            }))}
          />
        }
        items={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          apelido: s.apelido,
          contactName: s.contactName,
          phone: s.phone,
          deliveryDays: s.deliveryDays,
          deliveryWeekdays: s.deliveryWeekdays,
          paymentTerms: s.paymentTerms,
          // Decimal do Prisma não atravessa a fronteira servidor/cliente: vira
          // string aqui e a tela formata como moeda.
          minOrder: s.minOrder === null ? null : s.minOrder.toString(),
          notes: s.notes,
          isActive: s.isActive,
          compraNoAtacado: s.compraNoAtacado,
          categoryIds: s.categories.map((c) => c.category.id),
          categoryNames: s.categories.map((c) => c.category.name),
          wa: whatsappFor(s.phone),
          produtoIds: s.products.map((p) => p.productId),
        }))}
      />
    </Pagina>
  );
}
