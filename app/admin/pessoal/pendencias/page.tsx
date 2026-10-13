import { CabecalhoDaPagina, Lista, LinhaComLink, Pagina, Vazio } from "@/components/pagina";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { ATUALIZACAO_ESPERANDO, linksAbertos } from "@/lib/convites-colaborador";
import { prisma } from "@/lib/db";
import { itensDeCusto } from "@/lib/cmo-do-banco";
import { opcoesDeFuncao } from "@/lib/funcoes";
import { FUSO_DA_CASA, formatDiaNumerico, formatPhone, plural } from "@/lib/format";
import { linkDoWhatsAppDoColaborador, mascaraCpf } from "@/lib/pessoal";
import { cadastrosIncompletos } from "@/lib/cadastro-incompleto";
import { prazosDoPessoal } from "@/lib/prazos-do-banco";
import type { Prazo, TipoDePrazo } from "@/lib/prazos-pessoal";
import { can } from "@/lib/roles";

import { LinkDeCadastro } from "../colaboradores/link-de-cadastro";
import { AprovarAtualizacao, type AtualizacaoPendente } from "./aprovar-atualizacao";
import { AprovarCadastro, type CadastroPendente } from "./aprovar-cadastro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pendências · Departamento pessoal" };

const ROTULO_DO_PRAZO: Record<TipoDePrazo, string> = {
  aso: "ASO",
  experiencia: "Experiência",
  aprendiz: "Aprendiz",
  ferias: "Férias",
  domingos: "Domingos",
  epi: "EPI",
};

/** Para onde o toque leva: o cadastro, as férias, a escala ou o EPI da pessoa. */
function linkDoPrazo(p: Prazo): string {
  if (p.tipo === "ferias") return "/admin/pessoal/ferias";
  if (p.tipo === "domingos") return "/admin/pessoal";
  if (p.tipo === "epi") return `/admin/pessoal/epi?pessoa=${p.colaboradorId}`;
  return `/admin/pessoal/colaboradores/${p.colaboradorId}`;
}

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Idade em anos completos, contada no dia de hoje. */
function idade(nascimento: string, hoje: string): number {
  const anos = Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4));
  return hoje.slice(5) < nascimento.slice(5) ? anos - 1 : anos;
}

/**
 * Os cadastros que chegaram pelo link e esperam alguém decidir. A pessoa
 * mandou os dados dela; a casa completa o resto (equipe, função, valores) e
 * aprova, ou recusa. Aprovar e ver CPF é só para quem configura o módulo,
 * a mesma trava do salário.
 */
export default async function PendenciasDoPessoalPage() {
  const user = await guardModule("pessoal");
  const podeConfigurar = can(user, "pessoal", { configure: true });

  const [pendentes, abertos, funcoes, itens, pedidosDeAtualizacao] = await Promise.all([
    prisma.colaborador.findMany({
      where: { pendente: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nome: true,
        telefone: true,
        tipo: true,
        cpf: true,
        nascimento: true,
        endereco: true,
        emergenciaNome: true,
        emergenciaTelefone: true,
        createdAt: true,
      },
    }),
    linksAbertos(),
    opcoesDeFuncao(),
    // Os benefícios ligados, para o cartão marcar e pôr o valor de cada um.
    podeConfigurar ? itensDeCusto() : [],
    prisma.conviteColaborador.findMany({
      where: ATUALIZACAO_ESPERANDO,
      orderBy: { usadoEm: "asc" },
      select: { id: true, colaboradorId: true, dados: true, usadoEm: true },
    }),
  ]);
  const beneficios = itens.filter((i) => i.ativo && i.natureza === "BENEFICIO");
  // Para avisar de cadastro repetido: o mesmo CPF ou telefone em outra pessoa.
  const outros = await prisma.colaborador.findMany({
    where: {
      OR: [
        { cpf: { in: pendentes.map((c) => c.cpf).filter((x): x is string => !!x) } },
        { telefone: { in: pendentes.map((c) => c.telefone).filter((x): x is string => !!x) } },
      ],
    },
    select: { id: true, nome: true, cpf: true, telefone: true, pendente: true },
  });
  const repetido = (c: (typeof pendentes)[number]): string | null => {
    const iguais = outros.filter((o) => o.id !== c.id && ((c.cpf && o.cpf === c.cpf) || (c.telefone && o.telefone === c.telefone)));
    if (iguais.length === 0) return null;
    const qual = iguais.some((o) => c.cpf && o.cpf === c.cpf) ? "Mesmo CPF" : "Mesmo telefone";
    const quem = iguais.map((o) => (o.pendente ? `${o.nome} (também pendente)` : o.nome)).join(", ");
    return `${qual} de ${quem}. Confira antes de aprovar.`;
  };
  const hoje = todayInTimezone(FUSO_DA_CASA);

  const cadastros: CadastroPendente[] = pendentes.map((c) => {
    const nasc = c.nascimento ? dateOnlyToString(c.nascimento) : null;
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      telefone: c.telefone ? formatPhone(c.telefone) : null,
      telefoneLigar: c.telefone,
      whatsApp: linkDoWhatsAppDoColaborador(c.telefone),
      // Sem acesso, o CPF nem desce para a página.
      cpf: podeConfigurar && c.cpf ? mascaraCpf(c.cpf) : null,
      nascimento: nasc ? `${dataBR(nasc)} · ${idade(nasc, hoje)} anos` : null,
      endereco: c.endereco,
      emergencia: c.emergenciaNome || c.emergenciaTelefone
        ? {
            nome: c.emergenciaNome,
            telefone: c.emergenciaTelefone ? formatPhone(c.emergenciaTelefone) : null,
            telefoneLigar: c.emergenciaTelefone,
          }
        : null,
      enviado: formatDiaNumerico(c.createdAt, FUSO_DA_CASA),
      repetido: repetido(c),
    };
  });

  const [atualizacoes, incompletos, prazos] = await Promise.all([
    atualizacoesParaATela(pedidosDeAtualizacao, podeConfigurar),
    cadastrosIncompletos(),
    prazosDoPessoal(hoje, { comDomingos: true }),
  ]);
  // Os que tendem a vir em grupo (ninguém com ASO lançado, a escala fixa com
  // domingo toda semana) viram uma linha cada, para não afogar o resto.
  const semAso = prazos.filter((p) => p.semData);
  const domingos = prazos.filter((p) => p.tipo === "domingos");
  const comData = prazos.filter((p) => !p.semData && p.tipo !== "domingos");
  const total = cadastros.length + atualizacoes.length;

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Pendências"
        acoes={<LinkDeCadastro abertos={abertos} />}
        subtitulo={
          total === 0
            ? prazos.length > 0
              ? `Nenhum cadastro esperando. ${plural(prazos.length, "prazo pede", "prazos pedem")} atenção.`
              : "Nenhum cadastro esperando."
            : [
                cadastros.length > 0 && plural(cadastros.length, "cadastro novo", "cadastros novos"),
                atualizacoes.length > 0 && plural(atualizacoes.length, "atualização", "atualizações"),
              ]
                .filter(Boolean)
                .join(" e ") + " esperando aprovação."
        }
      />

      {/* Os prazos vêm antes de tudo: vencido em vermelho, perto em amarelo. */}
      {prazos.length > 0 && (
        <section id="prazos" className="scroll-mt-4">
          <h2 className="section-label mb-2">Prazos · {comData.length + (semAso.length > 0 ? 1 : 0) + (domingos.length > 0 ? 1 : 0)}</h2>
          <Lista>
            {semAso.length > 0 && (
              <LinhaComLink href="/admin/pessoal/colaboradores">
                <span className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                    ASO
                  </span>
                  <span className="min-w-0 truncate font-medium">{plural(semAso.length, "pessoa sem ASO registrado", "pessoas sem ASO registrado")}</span>
                </span>
                <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">
                  {semAso.map((p) => p.nome).join(", ")}. Lance a data do último ASO e a validade no cadastro de cada uma.
                </span>
              </LinhaComLink>
            )}
            {domingos.length > 0 && (
              <LinhaComLink href="/admin/pessoal">
                <span className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={domingos.some((d) => d.vencido) ? { background: "var(--danger-soft)", color: "var(--destructive)" } : { background: "var(--warn-soft)", color: "var(--warn)" }}
                  >
                    Domingos
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    {plural(domingos.length, "pessoa", "pessoas")} acima do limite
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">
                  {domingos.map((p) => p.nome).join(", ")}. {(domingos[0].texto.split("; ")[1] ?? "").replace(/^o/, "O")}. Dê folga num domingo, ou ajuste o limite em Configurações.
                </span>
              </LinhaComLink>
            )}
            {comData.map((p, i) => (
              <LinhaComLink key={`${p.tipo}-${p.colaboradorId}-${i}`} href={linkDoPrazo(p)}>
                <span className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={p.vencido ? { background: "var(--danger-soft)", color: "var(--destructive)" } : { background: "var(--warn-soft)", color: "var(--warn)" }}
                  >
                    {ROTULO_DO_PRAZO[p.tipo]}
                  </span>
                  <span className="min-w-0 truncate font-medium">{p.nome}</span>
                </span>
                <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">{p.texto}</span>
              </LinhaComLink>
            ))}
          </Lista>
        </section>
      )}

      {atualizacoes.length > 0 && (
        <ul className="space-y-3">
          {atualizacoes.map((a) => (
            <li key={a.id}>
              <AprovarAtualizacao atualizacao={a} podeAprovar={podeConfigurar} />
            </li>
          ))}
        </ul>
      )}

      {total === 0 ? (
        <Vazio>Quando alguém preencher o link de cadastro, aparece aqui para você completar e aprovar.</Vazio>
      ) : cadastros.length === 0 ? null : (
        <ul className="space-y-3">
          {cadastros.map((c) => (
            <li key={c.id}>
              <AprovarCadastro cadastro={c} podeAprovar={podeConfigurar} funcoes={funcoes} beneficios={beneficios} />
            </li>
          ))}
        </ul>
      )}

      {/* Quem está na equipe com o cadastro pela metade: o que falta em cada
          um, e o toque leva à ficha (de lá sai o link para a pessoa completar). */}
      {incompletos.length > 0 && (
        <section id="incompletos" className="scroll-mt-4">
          <h2 className="section-label mb-2">Cadastros incompletos · {incompletos.length}</h2>
          <Lista>
            {incompletos.map((c) => (
              <LinhaComLink key={c.id} href={`/admin/pessoal/colaboradores/${c.id}`}>
                <span className="block font-medium">{c.nome}</span>
                <span className="block text-xs" style={{ color: "var(--warn)" }}>
                  falta {c.falta.join(", ")}
                </span>
              </LinhaComLink>
            ))}
          </Lista>
          <p className="hint mt-1.5">
            Na ficha de cada um, o link de atualização manda a própria pessoa completar pelo celular.
          </p>
        </section>
      )}
    </Pagina>
  );
}

/**
 * As atualizações pela tela: o que a pessoa mandou contra o que está no
 * cadastro, só os campos que mudaram. O CPF só para quem configura, como no
 * cadastro novo; em branco ele não muda, então nem entra.
 */
async function atualizacoesParaATela(
  pedidos: { id: number; colaboradorId: number | null; dados: unknown; usadoEm: Date | null }[],
  podeConfigurar: boolean,
): Promise<AtualizacaoPendente[]> {
  const ids = pedidos.map((p) => p.colaboradorId).filter((x): x is number => x !== null);
  const atuais = await prisma.colaborador.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nome: true,
      apelido: true,
      telefone: true,
      cpf: true,
      nascimento: true,
      endereco: true,
      emergenciaNome: true,
      emergenciaTelefone: true,
    },
  });
  const fone = (v: string | null) => (v ? formatPhone(v) : null);
  const data = (v: string | null) => (v ? dataBR(v) : null);
  return pedidos.flatMap((p) => {
    const c = atuais.find((x) => x.id === p.colaboradorId);
    if (!c) return [];
    const d = (p.dados ?? {}) as Record<string, string | null | undefined>;
    const novo = (k: string) => (typeof d[k] === "string" && d[k] !== "" ? (d[k] as string) : null);
    const campos: [string, string | null, string | null][] = [
      ["Nome", c.nome, novo("nome")],
      ["Telefone", fone(c.telefone), fone(novo("telefone"))],
      ...(podeConfigurar && novo("cpf")
        ? [["CPF", c.cpf ? mascaraCpf(c.cpf) : null, mascaraCpf(novo("cpf")!)] as [string, string | null, string | null]]
        : []),
      ["Nascimento", data(c.nascimento ? dateOnlyToString(c.nascimento) : null), data(novo("nascimento"))],
      ["Endereço", c.endereco, novo("endereco")],
      ["Contato de emergência", c.emergenciaNome, novo("emergenciaNome")],
      ["Telefone de emergência", fone(c.emergenciaTelefone), fone(novo("emergenciaTelefone"))],
    ];
    return [
      {
        id: p.id,
        colaboradorId: c.id,
        nome: c.apelido ?? c.nome,
        enviado: p.usadoEm ? formatDiaNumerico(p.usadoEm, FUSO_DA_CASA) : "",
        mudancas: campos.filter(([, antes, depois]) => antes !== depois).map(([campo, antes, depois]) => ({ campo, antes, depois })),
      },
    ];
  });
}
