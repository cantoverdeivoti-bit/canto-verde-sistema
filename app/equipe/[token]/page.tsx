import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { dateOnlyToString, getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import type { CadastroPeloLinkInput } from "@/lib/validations";

import { CadastroForm } from "./cadastro-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cadastro de colaborador",
  // Link privado, mandado a uma pessoa. Não deve aparecer em busca.
  robots: { index: false, follow: false },
};

/**
 * A pessoa preenchendo o próprio cadastro de trabalho, sem login.
 *
 * A porta é o token no endereço: aleatório, de uso único e com validade.
 * Página pública, então não mostra nada da casa além do nome.
 */
export default async function CadastroDeColaboradorPage({ params }: PageProps<"/equipe/[token]">) {
  const { token } = await params;
  const [convite, { capacity }] = await Promise.all([
    prisma.conviteColaborador.findUnique({
      where: { token },
      select: { tipo: true, usadoEm: true, expiraEm: true, paraAtualizar: true, colaboradorId: true },
    }),
    getSettings(),
  ]);

  // Link de atualização: o formulário vem com o que já está no cadastro,
  // menos o CPF, que uma página pública não mostra.
  const atual =
    convite?.paraAtualizar && convite.colaboradorId !== null && !convite.usadoEm && convite.expiraEm >= new Date()
      ? await prisma.colaborador.findFirst({
          where: { id: convite.colaboradorId, pendente: false },
          select: {
            nome: true,
            telefone: true,
            nascimento: true,
            endereco: true,
            emergenciaNome: true,
            emergenciaTelefone: true,
          },
        })
      : null;
  const inicial: CadastroPeloLinkInput | undefined = atual
    ? {
        nome: atual.nome,
        telefone: atual.telefone ? formatPhone(atual.telefone) : "",
        cpf: "",
        nascimento: atual.nascimento ? dateOnlyToString(atual.nascimento) : "",
        endereco: atual.endereco ?? "",
        emergenciaNome: atual.emergenciaNome ?? "",
        emergenciaTelefone: atual.emergenciaTelefone ? formatPhone(atual.emergenciaTelefone) : "",
      }
    : undefined;

  // O link que não serve mais: o que houve no título, e o que fazer embaixo.
  const jaEnviado = "Se precisar corrigir alguma coisa, fale com o restaurante.";
  const invalido = !convite || (convite.paraAtualizar && !convite.usadoEm && convite.expiraEm >= new Date() && !atual)
    ? { titulo: "Este link não existe", frase: "Cada link serve uma vez só." }
    : convite.usadoEm
      ? convite.paraAtualizar
        ? { titulo: "Esta atualização já foi enviada", frase: jaEnviado }
        : { titulo: "Este cadastro já foi enviado", frase: jaEnviado }
      : convite.expiraEm < new Date()
        ? { titulo: "Este link venceu", frase: "Peça um novo ao restaurante." }
        : null;

  const casa = `${capacity.name} · Ivoti`;

  if (invalido || !convite) {
    return <MolduraDeLink largura="form" rotulo={casa} titulo={invalido?.titulo} subtitulo={invalido?.frase} />;
  }

  return (
    <MolduraDeLink
      largura="form"
      rotulo={casa}
      titulo={
        inicial
          ? "Atualize o seu cadastro"
          : convite.tipo === "FREELANCER"
            ? "Cadastro de free lancer"
            : "Cadastro de colaborador"
      }
      subtitulo={inicial ? "Confira os seus dados e corrija o que mudou." : "Preencha os seus dados."}
      ajuda={
        inicial
          ? "O restaurante confere antes de valer."
          : "Eles ficam só com o restaurante, para o cadastro de trabalho."
      }
    >
      <CadastroForm token={token} inicial={inicial} />
    </MolduraDeLink>
  );
}
