import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { NOME_DA_AREA, diaDaSemana, quemNaCelula, segundaDaSemana, somarDias, type Area } from "@/lib/escala";
import { carregarSemana } from "@/lib/escala-do-banco";
import { dateString } from "@/lib/validations";

import { FolhaDeImpressao } from "../_comum/folha";

export const dynamic = "force-dynamic";
// Folha deitada: a largura do papel A4 deitado (ver `app/imprimir/layout.tsx`).
export const viewport = { width: 1047, initialScale: undefined };
export const metadata = { title: "Escala para imprimir" };

const DIA = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * A escala numa folha A4 deitada, fora do painel (sem lateral nem menu), no
 * desenho da planilha de sempre: Cozinha e Salão, postos nas linhas, dias nas
 * colunas, a folga embaixo. Abre já pedindo para imprimir.
 */
export default async function ImprimirEscalaPage({ searchParams }: PageProps<"/imprimir/escala">) {
  await guardModule("pessoal");
  const { capacity } = await getSettings();
  const q = await searchParams;
  const pedida =
    typeof q.semana === "string" && dateString.safeParse(q.semana).success ? q.semana : todayInTimezone(capacity.timezone);
  const segunda = segundaDaSemana(pedida);
  const { semana, postos, pessoas } = await carregarSemana(segunda);
  const nome = (id: number) => pessoas.find((p) => p.id === id)?.nome ?? "";

  return (
    <FolhaDeImpressao papel="paisagem" className="p-4">
      <h1 className="text-center text-xl font-bold">
        Escala do almoço · {capacity.name} · {ddmm(segunda)} a {ddmm(somarDias(segunda, 6))}
      </h1>
      {(["COZINHA", "SALAO"] as Area[]).map((area) => (
        <table key={area} className="mt-3 w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr>
              <th colSpan={8} className="border border-black bg-neutral-200 py-1 text-sm">
                {NOME_DA_AREA[area].toUpperCase()}
              </th>
            </tr>
            <tr>
              <th className="w-24 border border-black px-1 py-0.5 text-left">POSTO</th>
              {semana.dias.map((d) => (
                <th key={d} className="border border-black px-1 py-0.5">
                  {DIA[diaDaSemana(d)]} {ddmm(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {postos
              .filter((p) => p.area === area)
              .map((p) => (
                <tr key={p.id}>
                  <th className="border border-black px-1 py-0.5 text-left font-semibold">{p.nome}</th>
                  {semana.celulas.get(p.id)!.map((c, i) => (
                    <td
                      key={i}
                      className={`border border-black px-1 py-0.5 text-center ${c.fechado ? "bg-neutral-300 text-[9px] uppercase" : ""}`}
                    >
                      {c.fechado ? "fechado" : (quemNaCelula(semana, pessoas, c) ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      ))}
      <table className="mt-3 w-full table-fixed border-collapse text-[11px]">
        <tbody>
          <tr>
            <th className="w-24 border border-black px-1 py-0.5 text-left">FOLGA</th>
            {semana.folgas.map((ids, i) => (
              <td key={i} className="border border-black px-1 py-0.5 text-center">
                {ids.map(nome).join(", ")}
              </td>
            ))}
          </tr>
          {semana.deFerias.some((f) => f.length > 0) && (
            <tr>
              <th className="border border-black px-1 py-0.5 text-left">FÉRIAS</th>
              {semana.deFerias.map((ids, i) => (
                <td key={i} className="border border-black px-1 py-0.5 text-center">
                  {ids.map(nome).join(", ")}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </FolhaDeImpressao>
  );
}
