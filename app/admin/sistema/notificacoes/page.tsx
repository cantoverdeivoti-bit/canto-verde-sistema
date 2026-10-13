import { redirect } from "next/navigation";

import { AvisarNoCelular } from "@/components/avisar-no-celular";
import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { emailConfigurado } from "@/lib/email";
import { MODULES } from "@/lib/modules";
import { escolhaDe, eventosPermitidos, lerPreferencias } from "@/lib/notificacoes";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";

import { EmailDosAvisos, EscolhaDosAvisos, type GrupoDeAvisos } from "./escolha-dos-avisos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas notificações · Configurações gerais" };

/**
 * Cada pessoa escolhe que avisos recebe e por onde: no celular (o pop-up,
 * ligado em cada aparelho) e no e-mail dela. Só aparecem os avisos dos
 * módulos em que ela entra. Basta estar logado.
 */
export default async function MinhasNotificacoesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.atalho) redirect("/atalhos");

  const salvo = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { email: true, notificacoes: true, _count: { select: { celulares: true } } },
  });
  const prefs = lerPreferencias(salvo?.notificacoes);
  const permitidos = eventosPermitidos((m, configurar) => can(user, m, configurar ? { configure: true } : undefined));

  const grupos: GrupoDeAvisos[] = MODULES.filter((m) => permitidos.some((e) => e.modulo === m.slug)).map((m) => ({
    nome: m.name,
    eventos: permitidos
      .filter((e) => e.modulo === m.slug)
      .map((e) => ({
        chave: e.chave,
        nome: e.nome,
        detalhe: e.detalhe,
        secao: "secao" in e ? e.secao : null,
        ...escolhaDe(prefs, e.chave),
      })),
  }));

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Minhas notificações" subtitulo="Escolha que avisos você recebe e por onde. Vale só para você." />

      <section>
        <h2 className="section-label mb-1">Este celular</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Ligue em cada aparelho onde quer receber.{" "}
          {salvo && salvo._count.celulares > 0
            ? `Você tem ${salvo._count.celulares === 1 ? "1 aparelho ligado" : `${salvo._count.celulares} aparelhos ligados`}.`
            : "Nenhum aparelho ligado ainda."}
        </p>
        <AvisarNoCelular />
      </section>

      <section>
        <h2 className="section-label mb-1">Seu e-mail</h2>
        <EmailDosAvisos email={salvo?.email ?? ""} configurado={emailConfigurado()} />
      </section>

      <section>
        <h2 className="section-label mb-1">Avisos</h2>
        {grupos.length === 0 ? (
          <Vazio>Nenhum aviso para os módulos em que você entra.</Vazio>
        ) : (
          <EscolhaDosAvisos grupos={grupos} temEmail={Boolean(salvo?.email)} />
        )}
      </section>
    </Pagina>
  );
}
