import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { sugerirEtiqueta } from "@/lib/etiquetas-sugeridas";
import { configDoReceituario } from "@/lib/receituario-dados";

import { ConferirSugestoes } from "./conferir-sugestoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiquetas sugeridas · Receituário" };

/**
 * As fichas sem etiqueta, cada uma com a etiqueta que o nome e o modo do
 * forno sugerem e o porquê. Quem conhece a receita confere, troca o que
 * estiver errado e aplica de uma vez.
 */
export default async function EtiquetasSugeridasPage() {
  await guardModule("receituario", { configure: true });
  const [fichas, config] = await Promise.all([
    prisma.fichaTecnica.findMany({
      where: { ativo: true, etiquetas: { isEmpty: true } },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
      select: { id: true, codigo: true, nome: true, categoria: true, modoForno: true, temperatura: true, umidade: true },
    }),
    configDoReceituario(),
  ]);
  const linhas = fichas.map((f) => ({ id: f.id, codigo: f.codigo, nome: f.nome, categoria: f.categoria, ...sugerirEtiqueta(f) }));
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Etiquetas sugeridas"
        voltar={{ href: "/admin/receituario/configuracoes", texto: "Configurações" }}
        subtitulo="A sugestão vem do nome da receita e do modo do forno. Desmarque ou troque o que estiver errado e aplique."
      />
      {linhas.length === 0 ? (
        <Vazio>Todas as fichas já têm etiqueta.</Vazio>
      ) : (
        <ConferirSugestoes linhas={linhas} etiquetas={config.etiquetas} cores={config.cores} />
      )}
    </Pagina>
  );
}
