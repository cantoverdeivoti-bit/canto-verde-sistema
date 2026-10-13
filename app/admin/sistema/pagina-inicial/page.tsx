import { redirect } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { catalogoDaBarra, lerBarra, montarBarra } from "@/lib/barra-de-baixo";
import { prisma } from "@/lib/db";
import { catalogoPermitido, lerPreferencia, montarPagina } from "@/lib/pagina-inicial";
import { getCurrentUser } from "@/lib/permissions";
import { can, visibleModules } from "@/lib/roles";

import { EditarPagina } from "./editar-pagina";

export const dynamic = "force-dynamic";
export const metadata = { title: "Página inicial · Configurações gerais" };

/**
 * Cada pessoa escolhe o que vê na página inicial (que números, que atalhos
 * e em que ordem) e os quatro atalhos da barra de baixo do celular. Basta
 * estar logado (a guarda de "configurar" é só de Usuários); só aparece o que
 * a pessoa consegue abrir.
 */
export default async function PaginaInicialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.atalho) redirect("/atalhos");

  const pode = (m: string) => can(user, m);
  const salvo = await prisma.adminUser.findUnique({ where: { id: user.id }, select: { paginaInicial: true } });
  const preferencia = lerPreferencia(salvo?.paginaInicial);
  const atual = montarPagina(preferencia, pode);
  const padrao = montarPagina(null, pode);
  const catalogo = catalogoPermitido(pode);

  // A barra pergunta como o menu: módulo pronto e com permissão.
  const abre = new Set(visibleModules(user).map((m) => m.slug));
  const podeNaBarra = (m: string) => abre.has(m);
  const barraSalva = lerBarra(salvo?.paginaInicial);
  const barra = {
    catalogo: catalogoDaBarra(podeNaBarra).map((a) => ({ chave: a.chave, nome: a.nome, completo: a.completo, icone: a.icone })),
    atual: montarBarra(barraSalva, podeNaBarra).map((a) => a.chave),
    padrao: montarBarra(null, podeNaBarra).map((a) => a.chave),
  };

  const item = (i: { chave: string; nome: string; icone: string }) => ({ chave: i.chave, nome: i.nome, icone: i.icone });

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Página inicial"
        subtitulo="Escolha o que aparece na sua página inicial e na barra de baixo."
        ajuda="Vale só para você. A barra de baixo aparece no celular, com até quatro atalhos e o Menu."
      />
      <EditarPagina
        catalogo={{ numeros: catalogo.numeros.map(item), atalhos: catalogo.atalhos.map(item) }}
        atual={{ numeros: atual.numeros.map((n) => n.chave), atalhos: atual.atalhos.map((a) => a.chave), barra: barra.atual }}
        padrao={{ numeros: padrao.numeros.map((n) => n.chave), atalhos: padrao.atalhos.map((a) => a.chave), barra: barra.padrao }}
        catalogoDaBarra={barra.catalogo}
        personalizada={preferencia !== null || barraSalva !== null}
      />
    </Pagina>
  );
}
