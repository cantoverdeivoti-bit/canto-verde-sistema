import { GradeDeAtalhos } from "@/components/cartoes-de-atalho";
import { contadoresDaCasa } from "@/lib/contadores";
import { agruparSecoes, MODULES, type ModuleSection } from "@/lib/modules";
import { can, type CurrentUser } from "@/lib/roles";

/**
 * A tela de atalhos de um módulo: as telas dele em cartões grandes de tocar,
 * as soltas em cima e cada grupo ("Movimentações", "Cadastros") com o seu
 * título. É para onde o módulo leva no menu, que não lista mais as seções.
 *
 * Os cartões saem de `lib/modules.ts`: tela nova no módulo aparece aqui
 * sozinha. Some o cartão da tela que pede "configurar" para quem não
 * configura, e Pendências mostra o número do que espera alguém.
 */
export async function AtalhosDoModulo({ slug, user }: { slug: string; user: CurrentUser }) {
  const modulo = MODULES.find((m) => m.slug === slug);
  if (!modulo) return null;

  const pode = (s: ModuleSection) => !s.soQuemConfigura || can(user, slug, { configure: true });
  const secoes = modulo.sections.filter(pode);
  const temNumero = secoes.some((s) => s.contador);
  const contadores = temNumero ? await contadoresDaCasa().catch(() => null) : null;
  const numeroDe = (s: ModuleSection) =>
    s.contador === "pendencias"
      ? contadores?.decisoes
      : s.contador === "cadastrosPendentes"
        ? contadores?.cadastrosPendentes
        : s.contador === "sugestoesBuffet" && can(user, slug, { configure: true })
          ? contadores?.sugestoesBuffet
          : s.contador === "treinamentosPendentes"
            ? contadores?.treinamentosPendentes
            : undefined;
  const cartao = (s: ModuleSection) => ({ href: s.href, titulo: s.label, icone: s.icone, numero: numeroDe(s) });

  const itens = agruparSecoes(secoes);
  const soltas = itens.flatMap((i) => (i.tipo === "secao" ? [i.secao] : []));
  const grupos = itens.flatMap((i) => (i.tipo === "grupo" ? [i] : []));

  return (
    <div className="space-y-6">
      {soltas.length > 0 && <GradeDeAtalhos itens={soltas.map(cartao)} colunas="sm:grid-cols-4" />}
      {grupos.map((g) => (
        <section key={g.nome} className="space-y-2.5">
          <h2 className="section-label">{g.nome}</h2>
          <GradeDeAtalhos itens={g.secoes.map(cartao)} colunas="sm:grid-cols-4" />
        </section>
      ))}
    </div>
  );
}
