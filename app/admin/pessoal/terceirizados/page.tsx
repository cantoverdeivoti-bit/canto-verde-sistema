import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { linkDoWhatsAppDoColaborador } from "@/lib/pessoal";
import { precoNoCampo } from "@/lib/format";

import { ListaDeTerceirizados } from "./lista-de-terceirizados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terceirizados · Departamento pessoal" };

/**
 * As empresas que mandam gente quando falta alguém (garçons terceirizados).
 * Um cadastro à parte do colaborador: entram na escala, mas sem férias, ASO,
 * EPI nem folga, e podem estar em vários postos no mesmo dia.
 */
export default async function TerceirizadosPage() {
  await guardModule("pessoal");
  const empresas = await prisma.terceirizado.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, telefone: true, valorPorPessoa: true, area: true, observacoes: true, ativo: true },
  });

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina titulo="Terceirizados" subtitulo="Empresas que mandam gente quando falta alguém na escala." />
      <ListaDeTerceirizados
        itens={empresas.map((t) => ({
          id: t.id,
          nome: t.nome,
          telefone: t.telefone ?? "",
          valorPorPessoa: precoNoCampo(t.valorPorPessoa?.toNumber() ?? null),
          valor: t.valorPorPessoa?.toNumber() ?? null,
          area: t.area ?? "",
          observacoes: t.observacoes ?? "",
          ativo: t.ativo,
          whatsapp: linkDoWhatsAppDoColaborador(t.telefone),
        }))}
      />
    </Pagina>
  );
}
