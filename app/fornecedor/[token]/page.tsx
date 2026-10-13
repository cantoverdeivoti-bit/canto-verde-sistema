import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";

import { RegistrationForm } from "./registration-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cadastro de fornecedor",
  // Link privado, mandado a uma pessoa. Não deve aparecer em busca.
  robots: { index: false, follow: false },
};

/**
 * O fornecedor preenchendo o próprio cadastro, sem login.
 *
 * A porta é o token no endereço — aleatório, de uso único e com validade.
 * Página pública, então ela não mostra nada da casa além do nome: quem abre
 * um link deste não deve conseguir enxergar fornecedor, produto ou preço.
 */
export default async function SupplierInvitePage({
  params,
}: PageProps<"/fornecedor/[token]">) {
  const { token } = await params;

  const [convite, { capacity }, categorias] = await Promise.all([
    prisma.supplierInvite.findUnique({ where: { token } }),
    getSettings(),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  // O link que não serve mais: o que houve no título, e o que fazer embaixo.
  const invalido =
    !convite
      ? { titulo: "Este link não existe", frase: "Cada convite serve uma vez só." }
      : convite.usedAt
        ? { titulo: "Este cadastro já foi enviado", frase: "Se precisar corrigir alguma coisa, fale com o restaurante." }
        : convite.expiresAt < new Date()
          ? { titulo: "Este link venceu", frase: "Peça um novo ao restaurante." }
          : // O formulário exige ao menos uma categoria. Sem nenhuma cadastrada
            // ele seria impossível de enviar, e o fornecedor levaria a culpa
            // por um cadastro que a casa ainda não montou.
            categorias.length === 0
            ? { titulo: "O cadastro ainda não está pronto do nosso lado", frase: "Avise o restaurante." }
            : null;

  const casa = `${capacity.name} · Ivoti`;

  if (invalido) {
    return <MolduraDeLink largura="form" rotulo={casa} titulo={invalido.titulo} subtitulo={invalido.frase} />;
  }

  return (
    <MolduraDeLink
      largura="form"
      rotulo={casa}
      titulo="Queremos comprar de você."
      subtitulo="Preencha os dados da sua empresa e marque o que você fornece."
      ajuda="É por aqui que vamos te chamar quando precisarmos de preço."
    >
      <RegistrationForm token={token} categorias={categorias} />
    </MolduraDeLink>
  );
}
