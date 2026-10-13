import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { CategoriesList } from "./categories-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categorias — Compras" };

export default async function CategoriesPage() {
  // Cadastro: fora do link de atalhos. Guarda própria, porque o layout de
  // Compras abre para ele.
  await guardModule("compras");
  const categorias = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, suppliers: true } } },
  });

  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Categorias" />

      <CategoriesList
        categorias={categorias.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          produtos: c._count.products,
          fornecedores: c._count.suppliers,
        }))}
      />
    </Pagina>
  );
}
