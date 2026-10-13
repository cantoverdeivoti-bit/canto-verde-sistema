import { faltasDoCadastro } from "@/lib/cadastro-incompleto-regras";
import { prisma } from "@/lib/db";

/** Os colaboradores ativos com cadastro incompleto, cada um com o que falta. */
export async function cadastrosIncompletos(): Promise<{ id: number; nome: string; falta: string[] }[]> {
  const colaboradores = await prisma.colaborador.findMany({
    where: { ativo: true, pendente: false },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      apelido: true,
      tipo: true,
      cpf: true,
      telefone: true,
      nascimento: true,
      endereco: true,
      funcaoId: true,
      diasDeTrabalho: true,
      emergenciaNome: true,
      emergenciaTelefone: true,
      salario: true,
      diaria: true,
      comecouEm: true,
      admissao: true,
      _count: { select: { diariasDoDia: true } },
    },
  });
  return colaboradores.flatMap((c) => {
    const falta = faltasDoCadastro({ ...c, diariasPorDia: c._count.diariasDoDia });
    return falta.length === 0 ? [] : [{ id: c.id, nome: c.apelido ?? c.nome, falta }];
  });
}
