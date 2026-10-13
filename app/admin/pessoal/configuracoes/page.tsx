import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { DomingosSeguidos, ItensDeEpi } from "./itens-de-epi";
import { PostosDaEscala } from "./postos-da-escala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações · Departamento pessoal" };

/** O que se ajusta uma vez e vale sempre: os postos da escala, os domingos seguidos e os itens de EPI e uniforme. */
export default async function ConfiguracoesPessoalPage() {
  await guardModule("pessoal", { configure: true });
  const [postos, itens, config] = await Promise.all([
    prisma.postoDaEscala.findMany({
      orderBy: [{ area: "asc" }, { ordem: "asc" }, { id: "asc" }],
      select: { id: true, area: true, nome: true, ativo: true },
    }),
    prisma.itemDeEpi.findMany({
      orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, ca: true, trocaEmDias: true, ativo: true, _count: { select: { entregas: true } } },
    }),
    prisma.configuracaoPessoal.findUnique({ where: { id: 1 }, select: { domingosSeguidos: true } }),
  ]);
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Configurações do pessoal" subtitulo="Mudar aqui vale para todas as semanas e todas as pessoas." />
      <PostosDaEscala postos={postos} />
      <DomingosSeguidos inicial={config?.domingosSeguidos ?? 2} />
      <ItensDeEpi itens={itens.map(({ _count, ...i }) => ({ ...i, entregas: _count.entregas }))} />
    </Pagina>
  );
}
