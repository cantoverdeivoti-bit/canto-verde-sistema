import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString, getSettings, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { situacaoDoTreinamento } from "@/lib/operacional-regras";
import { can } from "@/lib/roles";

import { EscolherFuncao, HistoricoDoColaborador, RegistrarTreinamento } from "./registrar-treinamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Treinamento · Operacional" };

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Quem já foi treinado no que a função pede. Cada pessoa com os processos
 * obrigatórios da função dela: verde com a data do último treinamento, ou
 * amarelo, pendente. Registrar um treinamento tira o pendente na hora.
 */
export default async function TreinamentoPage({ searchParams }: PageProps<"/admin/operacional/treinamento">) {
  const q = await searchParams;
  const [user, { capacity }, pessoas, obrigatorios, treinamentos, processos, funcoes] = await Promise.all([
    guardModule("operacional"),
    getSettings(),
    prisma.colaborador.findMany({
      where: { ativo: true, pendente: false },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, apelido: true, funcaoId: true, funcao: { select: { nome: true } } },
    }),
    prisma.processoDaFuncao.findMany({ where: { processo: { ativo: true } }, select: { funcaoId: true, processoId: true } }),
    prisma.treinamento.findMany({
      orderBy: [{ data: "desc" }, { id: "desc" }],
      select: { id: true, colaboradorId: true, processoId: true, data: true, instrutor: true, observacao: true, processo: { select: { titulo: true } } },
    }),
    prisma.processo.findMany({ where: { ativo: true }, orderBy: { titulo: "asc" }, select: { id: true, titulo: true } }),
    prisma.funcao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const podeMudar = can(user, "operacional", { configure: true });
  const funcaoFiltro = typeof q.funcao === "string" && /^\d+$/.test(q.funcao) ? Number(q.funcao) : null;
  const soPendentes = q.pendentes === "1";

  const treinos = treinamentos.map((t) => ({ ...t, data: dateOnlyToString(t.data) }));
  const situacao = situacaoDoTreinamento(pessoas, obrigatorios, treinos);
  const tituloDe = new Map(processos.map((p) => [p.id, p.titulo]));
  const lista = pessoas
    .filter((p) => funcaoFiltro === null || p.funcaoId === funcaoFiltro)
    .filter((p) => !soPendentes || (situacao.get(p.id)?.pendentes ?? 0) > 0);
  const totalPendentes = [...situacao.values()].reduce((s, x) => s + x.pendentes, 0);

  const endereco = (o: { funcao?: number | null; pendentes?: boolean }) => {
    const p = new URLSearchParams();
    const f = o.funcao === undefined ? funcaoFiltro : o.funcao;
    if (f !== null) p.set("funcao", String(f));
    if (o.pendentes ?? soPendentes) p.set("pendentes", "1");
    return `/admin/operacional/treinamento${p.size ? `?${p}` : ""}`;
  };

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Treinamento"
        subtitulo={totalPendentes === 0 ? "Ninguém com treinamento pendente." : `${plural(totalPendentes, "treinamento pendente", "treinamentos pendentes")} nos processos obrigatórios das funções.`}
      />

      {podeMudar && (
        <RegistrarTreinamento
          pessoas={pessoas.map((p) => ({
            id: p.id,
            nome: p.apelido ?? p.nome,
            pendentes: (situacao.get(p.id)?.processos ?? []).filter((x) => x.treinadoEm === null).map((x) => x.processoId),
          }))}
          processos={processos}
          hoje={todayInTimezone(capacity.timezone)}
        />
      )}

      <div className="flex items-center gap-2">
        <EscolherFuncao funcoes={funcoes} atual={funcaoFiltro} soPendentes={soPendentes} />
        <Link href={endereco({ pendentes: !soPendentes })} aria-pressed={soPendentes} className="chip shrink-0 px-3 py-1.5 text-sm">
          Só pendentes
        </Link>
      </div>

      {lista.length === 0 ? (
        <Vazio>Ninguém neste filtro.</Vazio>
      ) : (
        <Lista>
          {lista.map((p) => {
            const s = situacao.get(p.id)!;
            const feitos = s.processos.length - s.pendentes;
            const historico = treinos.filter((t) => t.colaboradorId === p.id);
            return (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{p.apelido ?? p.nome}</span>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">{p.funcao?.nome ?? "sem função"}</span>
                  </span>
                  {s.processos.length > 0 && (
                    <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: s.pendentes > 0 ? "var(--warn)" : "var(--ok-strong)" }}>
                      {feitos} de {s.processos.length}
                    </span>
                  )}
                </div>
                {s.processos.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)]">{p.funcaoId === null ? "Sem função: nada obrigatório." : "A função não tem processo obrigatório."}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {s.processos.map((x) => (
                      <li
                        key={x.processoId}
                        className="rounded-md px-2 py-0.5 text-xs font-medium"
                        style={
                          x.treinadoEm
                            ? { background: "var(--ok-soft)", color: "var(--ok-strong)" }
                            : { background: "var(--warn-soft)", color: "var(--warn)" }
                        }
                      >
                        {tituloDe.get(x.processoId)} · {x.treinadoEm ? dataBR(x.treinadoEm) : "pendente"}
                      </li>
                    ))}
                  </ul>
                )}
                {historico.length > 0 && (
                  <HistoricoDoColaborador
                    itens={historico.map((t) => ({ id: t.id, titulo: t.processo.titulo, data: dataBR(t.data), instrutor: t.instrutor, observacao: t.observacao }))}
                    podeMudar={podeMudar}
                  />
                )}
              </li>
            );
          })}
        </Lista>
      )}
    </Pagina>
  );
}
