import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/roles";
import { papelEfetivo } from "@/lib/tarefas-permissoes";

/**
 * O papel de alguém numa tarefa, para quem não passa pelo layout.
 *
 * As rotas de anexo são manipuladores de rota: não passam pelo layout de
 * `/admin/tarefas` nem pelo `abrirTarefa` das ações (que mora num arquivo
 * "use server", onde toda função exportada vira endpoint). Esta é a mesma
 * pergunta, num arquivo comum de servidor.
 *
 * `podeVer` segue o detalhe da tarefa: quadro aberto, todo mundo do módulo
 * lê; quadro privado, só membro (RF-054). Tarefa na lixeira não abre.
 */
export async function papelNaTarefa(user: CurrentUser, tarefaId: number) {
  const tarefa = await prisma.tarefa.findFirst({
    where: { id: tarefaId, excluidoEm: null },
    select: {
      id: true,
      responsavelId: true,
      projeto: {
        select: {
          privado: true,
          membros: { where: { userId: user.id }, select: { papel: true } },
        },
      },
    },
  });
  if (!tarefa) return null;
  const papel = papelEfetivo(user, tarefa.projeto.membros[0]?.papel ?? null);
  return {
    tarefa,
    papel,
    ehMinha: tarefa.responsavelId === user.id,
    podeVer: papel !== null || !tarefa.projeto.privado,
  };
}
