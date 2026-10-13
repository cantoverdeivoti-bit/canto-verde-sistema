import { headers } from "next/headers";

import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDiaNumerico } from "@/lib/format";
import { atalhoVenceEm, atalhoVencido, can } from "@/lib/roles";

import { LinkDosAtalhos } from "./link-dos-atalhos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Compras" };

/**
 * As telas de Compras em cartões (é onde o módulo abre pelo menu), e o link
 * que leva contar, compras de rotina e receber ao estoquista e ao recebedor
 * sem login. Só quem configura Compras vê e mexe no link.
 */
export default async function AtalhosComprasPage() {
  // Fora do link: quem entrou por ele não gera nem troca o próprio link.
  const user = await guardModule("compras");
  const podeConfigurar = can(user, "compras", { configure: true });

  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const [config, { capacity }] = await Promise.all([
    podeConfigurar
      ? prisma.cotacaoSettings.findUnique({
          where: { id: 1 },
          select: { atalhoToken: true, atalhoCriadoEm: true },
        })
      : null,
    getSettings(),
  ]);

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Compras" />

      <AtalhosDoModulo slug="compras" user={user} />

      {podeConfigurar && (
        <LinkDosAtalhos
          token={config?.atalhoToken ?? null}
          origem={origem}
          criadoEm={config?.atalhoCriadoEm ? formatDiaNumerico(config.atalhoCriadoEm, capacity.timezone) : null}
          venceEm={config?.atalhoCriadoEm ? formatDiaNumerico(atalhoVenceEm(config.atalhoCriadoEm), capacity.timezone) : null}
          vencido={config?.atalhoToken ? atalhoVencido(config.atalhoCriadoEm) : false}
        />
      )}
    </Pagina>
  );
}
