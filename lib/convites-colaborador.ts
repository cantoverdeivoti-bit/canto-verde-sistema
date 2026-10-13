import { prisma } from "@/lib/db";
import { FUSO_DA_CASA, formatDiaNumerico } from "@/lib/format";

/** Os links de cadastro ainda sem uso e dentro do prazo, do mais novo ao mais velho. */
export async function linksAbertos() {
  const convites = await prisma.conviteColaborador.findMany({
    // Os links de atualização ficam no cadastro de cada pessoa, não aqui.
    where: { usadoEm: null, expiraEm: { gt: new Date() }, paraAtualizar: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, tipo: true, paraQuem: true, expiraEm: true },
  });
  return convites.map((c) => ({
    id: c.id,
    token: c.token,
    tipo: c.tipo,
    paraQuem: c.paraQuem,
    vence: formatDiaNumerico(c.expiraEm, FUSO_DA_CASA),
  }));
}

/** As atualizações de cadastro que chegaram pelo link e esperam aprovação. */
export const ATUALIZACAO_ESPERANDO = { paraAtualizar: true, usadoEm: { not: null }, resolvidoEm: null } as const;
