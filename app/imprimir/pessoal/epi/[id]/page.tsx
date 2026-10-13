import { notFound } from "next/navigation";

import { dateOnlyToString } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";

import { FolhaDeImpressao } from "../../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termo de entrega de EPI" };

const dataBR = (d: Date) => {
  const s = dateOnlyToString(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

/**
 * A ficha de entrega de EPI e uniforme de uma pessoa, para assinar: todas as
 * entregas, as substituídas também, com o CA de cada EPI e a declaração de
 * responsabilidade pelo uso e pela guarda.
 */
export default async function TermoDeEpiPage({ params }: PageProps<"/imprimir/pessoal/epi/[id]">) {
  const user = await guardModule("pessoal");
  // O CPF segue a trava do cadastro: só quem configura o módulo vê.
  const verCpf = can(user, "pessoal", { configure: true });
  const id = Number((await params).id) || 0;
  const c = await prisma.colaborador.findUnique({
    where: { id },
    select: {
      nome: true,
      cpf: true,
      admissao: true,
      comecouEm: true,
      funcao: { select: { nome: true } },
      entregasDeEpi: {
        orderBy: [{ data: "asc" }, { id: "asc" }],
        select: { id: true, data: true, quantidade: true, tamanho: true, item: { select: { nome: true, ca: true } } },
      },
    },
  });
  if (!c) notFound();
  const inicio = c.admissao ?? c.comecouEm;
  // Linhas em branco para as próximas entregas, escritas à mão.
  const vazias = Math.max(4, 14 - c.entregasDeEpi.length);

  return (
    <FolhaDeImpressao css="tr { break-inside: avoid; }">
      <section className="folha text-[11.5px] leading-snug">
        <h1 className="text-[18px] font-bold">Ficha de entrega de EPI e uniforme</h1>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 border-y border-neutral-400 py-2">
          <p>
            <span className="font-semibold">Nome:</span> {c.nome}
          </p>
          <p>
            <span className="font-semibold">Função:</span> {c.funcao?.nome ?? "________________"}
          </p>
          <p>
            <span className="font-semibold">CPF:</span> {verCpf && c.cpf ? `${c.cpf.slice(0, 3)}.${c.cpf.slice(3, 6)}.${c.cpf.slice(6, 9)}-${c.cpf.slice(9)}` : "________________"}
          </p>
          <p>
            <span className="font-semibold">Admissão:</span> {inicio ? dataBR(inicio) : "___/___/______"}
          </p>
        </div>

        <p className="mt-3 text-justify">
          Declaro que recebi, gratuitamente, os equipamentos de proteção individual e as peças de uniforme abaixo, e me comprometo a:
          usá-los apenas para a finalidade a que se destinam; responsabilizar-me pela guarda e conservação; comunicar qualquer
          alteração que os torne impróprios para uso; e devolvê-los quando substituídos ou ao deixar a empresa.
        </p>

        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="bg-neutral-200 text-left text-[10px] uppercase">
              <th className="w-[22mm] border border-neutral-400 px-1.5 py-1">Data</th>
              <th className="border border-neutral-400 px-1.5 py-1">Item</th>
              <th className="w-[20mm] border border-neutral-400 px-1.5 py-1">CA</th>
              <th className="w-[12mm] border border-neutral-400 px-1.5 py-1 text-right">Qtd</th>
              <th className="w-[16mm] border border-neutral-400 px-1.5 py-1">Tam.</th>
              <th className="w-[50mm] border border-neutral-400 px-1.5 py-1">Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {c.entregasDeEpi.map((e) => (
              <tr key={e.id} className="h-[8mm]">
                <td className="border border-neutral-400 px-1.5">{dataBR(e.data)}</td>
                <td className="border border-neutral-400 px-1.5">{e.item.nome}</td>
                <td className="border border-neutral-400 px-1.5">{e.item.ca ?? ""}</td>
                <td className="border border-neutral-400 px-1.5 text-right">{e.quantidade}</td>
                <td className="border border-neutral-400 px-1.5">{e.tamanho ?? ""}</td>
                <td className="border border-neutral-400 px-1.5" />
              </tr>
            ))}
            {Array.from({ length: vazias }, (_, i) => (
              <tr key={`v${i}`} className="h-[8mm]">
                {Array.from({ length: 6 }, (_, j) => (
                  <td key={j} className="border border-neutral-400" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-[10.5px]">
          <p className="border-t border-black pt-0.5">Assinatura do colaborador</p>
          <p className="border-t border-black pt-0.5">Responsável pela entrega</p>
        </footer>
      </section>
    </FolhaDeImpressao>
  );
}
