import { prisma } from "@/lib/db";

export type OpcaoDeFuncao = { id: number; nome: string };

/**
 * As funções para escolher num formulário: as ligadas, em ordem alfabética,
 * mais a que a pessoa já tem, mesmo desligada, para o select não apagá-la
 * calado ao salvar.
 */
export async function opcoesDeFuncao(atual: number | null = null): Promise<OpcaoDeFuncao[]> {
  const funcoes = await prisma.funcao.findMany({
    where: { OR: [{ ativo: true }, ...(atual ? [{ id: atual }] : [])] },
    select: { id: true, nome: true },
  });
  return funcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
