import Link from "next/link";
import { cache } from "react";

import { prisma } from "@/lib/db";
import { DIAS_DA_SEMANA, diaDaSemanaHoje } from "@/lib/format";
import { can, getCurrentUser } from "@/lib/permissions";
import { SEM_SITUACAO, situacaoDasRotinas } from "@/lib/rotina-de-hoje";

import { ContarRotina } from "./contar-rotina";

/**
 * As compras de rotina do dia, com o próximo passo de cada uma: contar os
 * produtos dela, continuar a contagem, ou mandar o pedido que saiu. A rotina
 * tem a contagem dela; a contagem geral de estoque não faz pedido de rotina.
 *
 * Some quando não há compra de rotina hoje: um quadro vazio no alto da tela
 * de todo dia seria ruído.
 */
/**
 * Os dados do quadro, numa ida ao banco: as listas de hoje, a situação delas
 * (pelo mesmo filtro, sem esperar a lista) e quem está vendo. Com `cache`, a
 * tela que mostra o quadro chama isto logo no começo e a busca já sai junto
 * com a dela; o quadro, que só desenha no fim, encontra tudo pronto.
 */
export const rotinasDeHoje = cache(async (timezone: string) => {
  const hoje = diaDaSemanaHoje(timezone);
  const deHoje = { diaSemana: hoje, ativa: true };
  const [listas, situacao, user] = await Promise.all([
    prisma.listaCompra.findMany({ where: deHoje, select: { id: true, nome: true, fornecedor: { select: { name: true, apelido: true } } } }),
    situacaoDasRotinas(deHoje, timezone),
    getCurrentUser(),
  ]);
  return { hoje, listas, situacao, podeComprar: can(user, "compras", { configure: true }) };
});

export async function RotinasDeHoje({ timezone, className = "" }: { timezone: string; className?: string }) {
  const { hoje, listas, situacao, podeComprar } = await rotinasDeHoje(timezone);
  if (listas.length === 0) return null;
  const nome = (l: (typeof listas)[number]) => l.fornecedor.apelido ?? l.fornecedor.name;
  listas.sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR"));

  return (
    <section className={`rounded-xl border-2 border-[var(--primary)] bg-[var(--card)] p-3 ${className}`}>
      <h2 className="text-sm font-semibold">
        Rotinas de hoje · <span className="capitalize">{DIAS_DA_SEMANA[hoje]}</span>
      </h2>
      <ul className="mt-2 divide-y divide-[var(--border)]">
        {listas.map((l) => (
          <li key={l.id} className="space-y-2 py-3 first:pt-1 last:pb-0">
            <Link href={`/admin/compras/listas/${l.id}`} className="font-medium underline-offset-4 hover:underline">
              {nome(l)}
            </Link>
            {/* Os quadrados da rotina embaixo do nome, separados por um fio. */}
            <div className="basis-full border-t border-[var(--border)] pt-1">
              <ContarRotina listaId={l.id} nome={l.nome} situacao={situacao.get(l.id) ?? SEM_SITUACAO} podeComprar={podeComprar} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
