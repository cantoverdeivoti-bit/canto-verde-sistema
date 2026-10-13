import { ddmm } from "@/lib/buffet";
import type { DiaDoBuffet, GrupoDoBuffet, PesosDoDia } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA } from "@/lib/buffet-regras";

/**
 * A folha da cozinha de um dia, no desenho das abas SEGUNDA…DOMINGO da
 * planilha: uma tabela só, o grupo numa faixa colorida, e por posição Nº,
 * prato, quantidade, sobra e alterações (as trocas do dia). Cabe numa A4 em
 * pé porque a linha é uma linha: o como fazer no forno fica no Fluxo do
 * forno. Serve à página de imprimir e ao imprimir do navegador na Produção
 * do dia.
 */
export function FolhaDoDia({ data, dia, grupos, pesos }: { data: string; dia: DiaDoBuffet | null; grupos: GrupoDoBuffet[]; pesos: PesosDoDia }) {
  // O que já foi lançado sai preenchido; o resto, em branco para anotar à mão.
  const kg = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
  const celula = "border border-neutral-500 px-1 leading-[1.2]";
  if (!dia) return <p>Nenhum cardápio vale em {ddmm(data)}.</p>;
  return (
  <table className="w-full table-fixed border-collapse text-[11px]">
    <colgroup>
      <col className="w-[7mm]" />
      <col className="w-[62mm]" />
      <col className="w-[22mm]" />
      <col className="w-[18mm]" />
      <col />
    </colgroup>
    <thead>
      <tr>
        <th colSpan={3} className="bg-neutral-800 py-1 text-center text-base font-bold uppercase text-white">
          {DIAS_DA_SEMANA[dia.diaSemana - 1]} {ddmm(data)}
          {dia.tema && <span className="font-normal"> · {dia.tema}</span>}
        </th>
        <th colSpan={2} className="border border-neutral-500 bg-amber-50 py-1 text-center text-xs font-semibold">
          Prev. clientes: {pesos.clientes ?? "______"}
        </th>
      </tr>
      <tr className="bg-neutral-700 text-left text-[10px] uppercase text-white">
        <th className={`${celula} text-center`}>Nº</th>
        <th className={celula}>Prato</th>
        <th className={celula}>Qtd. (kg)</th>
        <th className={celula}>Sobra (kg)</th>
        <th className={celula}>Alterações</th>
      </tr>
    </thead>
    {grupos.map((g) => {
      const doGrupo = dia.itens.filter((i) => i.grupoId === g.id);
      return (
        <tbody key={g.id}>
          <tr>
            <th colSpan={5} className="px-1.5 py-0.5 text-left text-[11px] font-bold uppercase text-white" style={{ background: g.cor }}>
              {g.nome}
            </th>
          </tr>
          {Array.from({ length: g.posicoes }, (_, n) => {
            const i = doGrupo.find((x) => x.posicao === n + 1);
            const p = i?.prato ?? null;
            const peso = pesos.porLugar[`${g.id}:${n + 1}`];
            return (
              <tr key={n}>
                <td className={`${celula} text-center`}>{n + 1}</td>
                <td className={`${celula} truncate ${i?.trocado ? "font-bold" : ""}`}>{p?.nome ?? ""}</td>
                <td className={`${celula} text-center`}>{p ? kg(peso?.kgProduzido) : ""}</td>
                <td className={`${celula} text-center`}>{p ? kg(peso?.kgSobra) : ""}</td>
                <td className={`${celula} truncate`}>
                  {i?.trocado && (
                    <>
                      troca{i.noLugarDe && ` (era ${i.noLugarDe})`}
                      {i.motivo && `: ${i.motivo}`}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      );
    })}
  </table>
  );
}
