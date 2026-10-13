import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { contarMotivos, mesesAte, MOTIVO_DESLIGAMENTO, rotatividadePorMes } from "@/lib/desligamento";
import { plural } from "@/lib/format";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloDoMes = (m: string) => `${MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/**
 * A rotatividade dos últimos 12 meses (quem entrou, quem saiu e o % do mês) e
 * por que as pessoas saíram. Free lancer fica de fora: entra e sai por dia.
 */
export async function Rotatividade({ hoje }: { hoje: string }) {
  const meses = mesesAte(hoje.slice(0, 7), 12);
  const pessoas = await prisma.colaborador.findMany({
    where: { pendente: false, tipo: { not: "FREELANCER" } },
    select: { comecouEm: true, admissao: true, desligadoEm: true, motivoDesligamento: true, razaoDesligamento: true },
  });
  const linhas = rotatividadePorMes(
    pessoas.map((p) => {
      const inicio = p.comecouEm ?? p.admissao;
      return { inicio: inicio ? dateOnlyToString(inicio) : null, fim: p.desligadoEm ? dateOnlyToString(p.desligadoEm) : null };
    }),
    meses,
  );
  const desde = `${meses[0]}-01`;
  const sairam = pessoas.filter((p) => p.desligadoEm && dateOnlyToString(p.desligadoEm) >= desde);
  const razoes = contarMotivos(sairam.map((p) => p.razaoDesligamento));
  const comoSairam = contarMotivos(sairam.map((p) => p.motivoDesligamento));
  const media = linhas.filter((l) => l.percentual !== null);
  const mediaPct = media.length ? Math.round((media.reduce((s, l) => s + l.percentual!, 0) / media.length) * 10) / 10 : null;
  const maior = Math.max(...linhas.map((l) => l.percentual ?? 0), 1);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-label">Rotatividade · últimos 12 meses</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {plural(sairam.length, "pessoa saiu", "pessoas saíram")}. Média de {pct(mediaPct)} ao mês (desligados ÷ média de ativos do mês, sem free).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-[var(--primary-soft)] text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Mês</th>
              <th className="px-2 py-2 text-right font-semibold">Entraram</th>
              <th className="px-2 py-2 text-right font-semibold">Saíram</th>
              <th className="px-2 py-2 text-right font-semibold">Ativos</th>
              <th className="w-[35%] px-3 py-2 font-semibold">Rotatividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td className="px-3 py-1.5 capitalize">{rotuloDoMes(l.mes)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.admitidos}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.desligados}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.ativosNoFim}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-full bg-[var(--muted)]" aria-hidden>
                      <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${((l.percentual ?? 0) / maior) * 100}%` }} />
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums">{pct(l.percentual)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sairam.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Motivos titulo="Por que saíram" itens={razoes.map((r) => ({ texto: r.valor ?? "Não informado", n: r.n }))} total={sairam.length} />
          <Motivos
            titulo="Como saíram"
            itens={comoSairam.map((r) => ({ texto: r.valor ? MOTIVO_DESLIGAMENTO[r.valor] : "Não informado", n: r.n }))}
            total={sairam.length}
          />
        </div>
      )}
    </section>
  );
}

function Motivos({ titulo, itens, total }: { titulo: string; itens: { texto: string; n: number }[]; total: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <ul className="space-y-1.5 text-sm">
        {itens.map((i) => (
          <li key={i.texto} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{i.texto}</span>
            <span className="h-2 w-20 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden>
              <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${(i.n / total) * 100}%` }} />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums">{i.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
