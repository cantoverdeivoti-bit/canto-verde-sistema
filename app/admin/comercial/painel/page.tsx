import { ExternalLink } from "lucide-react";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
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

  // O Google não deixa o painel abrir dentro de outra página enquanto o
  // script não liberar (setXFrameOptionsMode ALLOWALL no doGet). Até lá,
  // a tela é um botão grande que abre o painel direto.
  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Painel de reservas" subtitulo="Sábados, domingos e feriados, direto da planilha." />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--botao)] px-6 py-8 text-lg font-semibold text-[var(--botao-texto)] hover:opacity-90"
      >
        <ExternalLink aria-hidden className="size-5" />
        Abrir o painel de reservas
      </a>
      {podeConfigurar && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">Trocar o link do painel</summary>
          <div className="pt-2">
            <FormLink atual={url} />
          </div>
        </details>
      )}
    </Pagina>
  );
}
