import { formatInTimeZone } from "date-fns-tz";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { enderecoDoSite } from "@/lib/email";
import { getCurrentUser } from "@/lib/permissions";

import { AcessosDoClaude } from "./acessos-do-claude";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acesso do Claude · Configurações gerais" };

/**
 * O acesso do Claude ao app (MCP): cada pessoa cria o seu, e o Claude vê o
 * mesmo que ela vê no painel, só para ler. Basta estar logado.
 */
export default async function AcessoDoClaudePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.atalho) redirect("/atalhos");

  const [tokens, { capacity }, cabecalhos] = await Promise.all([
    prisma.tokenDeAcesso.findMany({
      where: { userId: user.id, revogadoEm: null },
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, criadoEm: true, usadoEm: true },
    }),
    getSettings(),
    headers(),
  ]);
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "https";
  const site = enderecoDoSite() ?? (host ? `${protocolo}://${host}` : "");
  const quando = (d: Date) => formatInTimeZone(d, capacity.timezone, "dd/MM/yyyy HH:mm");

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Acesso do Claude"
        subtitulo="O Claude consulta o app por você, sem mudar nada."
        ajuda="Ele vê reservas, pendências, pedidos, estoque, escala e CMO, o mesmo que você vê no painel. CPF, endereço, telefone e salário de cada pessoa ficam de fora."
      />
      <AcessosDoClaude
        endereco={`${site}/api/mcp`}
        tokens={tokens.map((t) => ({
          id: t.id,
          nome: t.nome,
          criadoEm: quando(t.criadoEm),
          usadoEm: t.usadoEm ? quando(t.usadoEm) : null,
        }))}
      />
    </Pagina>
  );
}
