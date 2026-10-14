import { ExternalLink } from "lucide-react";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { buttonVariants } from "@/components/ui/button";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";

import { FormLink } from "./form-link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel de reservas — Reservas" };

/**
 * O painel de reservas que a casa já usa (app do Google ligado à planilha),
 * aberto aqui dentro. O link fica no banco, nunca no código.
 */
export default async function PainelDeReservasPage() {
  const user = await guardModule("comercial");
  const podeConfigurar = can(user, "comercial", { configure: true });
  const regras = await prisma.reservationRules.findUnique({ where: { id: 1 }, select: { painelReservasUrl: true } });
  const url = regras?.painelReservasUrl ?? null;

  if (!url) {
    return (
      <Pagina>
        <CabecalhoDaPagina titulo="Painel de reservas" subtitulo="Cole uma vez o link do seu painel e ele passa a abrir aqui." />
        {podeConfigurar ? (
          <FormLink />
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">O dono ainda não colocou o link do painel.</p>
        )}
      </Pagina>
    );
  }

  return (
    <div className="space-y-3">
      <CabecalhoDaPagina
        titulo="Painel de reservas"
        subtitulo="Sábados, domingos e feriados, direto da planilha."
        acoes={
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink aria-hidden className="size-4" />
            Abrir em tela cheia
          </a>
        }
      />
      <iframe
        src={url}
        title="Painel de reservas do Canto Verde"
        className="h-[calc(100dvh-11rem)] min-h-[600px] w-full rounded-lg border bg-white"
        allow="clipboard-write"
      />
      {podeConfigurar && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">Trocar o link do painel</summary>
          <div className="pt-2">
            <FormLink atual={url} />
          </div>
        </details>
      )}
    </div>
  );
}
