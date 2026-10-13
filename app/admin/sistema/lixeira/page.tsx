import { redirect } from "next/navigation";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { FUSO_DA_CASA } from "@/lib/format";
import { DIAS_NA_LIXEIRA, DONO_DO_TIPO, diasQueFaltam, esvaziarVencidos, type TipoNaLixeira } from "@/lib/lixeira";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";

import { ListaDaLixeira } from "./lista-da-lixeira";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lixeira" };

/**
 * O que foi apagado nos últimos 30 dias (lançamento, insumo, entrega de EPI),
 * para trazer de volta depois que o Desfazer da faixa sumiu. Cada um vê só o
 * dos módulos em que pode apagar. As tarefas têm a lixeira delas.
 */
export default async function LixeiraPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  await esvaziarVencidos();
  const tipos = (Object.keys(DONO_DO_TIPO) as TipoNaLixeira[]).filter((t) =>
    can(user, DONO_DO_TIPO[t].modulo, DONO_DO_TIPO[t].configurar ? { configure: true } : undefined),
  );
  const itens = await prisma.itemNaLixeira.findMany({
    where: { tipo: { in: tipos } },
    orderBy: { apagadoEm: "desc" },
    select: { id: true, tipo: true, rotulo: true, apagadoPor: true, apagadoEm: true },
  });

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina titulo="Lixeira" subtitulo={`O que foi apagado fica aqui por ${DIAS_NA_LIXEIRA} dias.`} />
      {itens.length === 0 ? (
        <Vazio>A lixeira está vazia.</Vazio>
      ) : (
        <ListaDaLixeira
          itens={itens.map((i) => ({
            id: i.id,
            tipo: DONO_DO_TIPO[i.tipo as TipoNaLixeira]?.nome ?? i.tipo,
            rotulo: i.rotulo,
            apagadoPor: i.apagadoPor,
            apagadoEm: i.apagadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO_DA_CASA }),
            diasRestantes: diasQueFaltam(i.apagadoEm),
          }))}
        />
      )}
    </Pagina>
  );
}
