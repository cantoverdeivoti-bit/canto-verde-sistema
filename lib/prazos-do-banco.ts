import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { segundaDaSemana } from "@/lib/escala";
import { carregarSemana } from "@/lib/escala-do-banco";
import {
  domingosEmVolta,
  domingosSeguidos,
  emOrdemDeUrgencia,
  prazosDeEpi,
  prazosDoColaborador,
  type Prazo,
} from "@/lib/prazos-pessoal";

const data = (d: Date | null) => (d ? dateOnlyToString(d) : null);

/**
 * Os prazos de hoje: experiência, ASO, férias e troca de EPI de quem está
 * ativo. Com `comDomingos`, também os domingos seguidos na escala (lê oito
 * semanas, então o contador do menu fica sem eles).
 */
export async function prazosDoPessoal(hoje: string, { comDomingos = false } = {}): Promise<Prazo[]> {
  const [pessoas, entregas, config] = await Promise.all([
    prisma.colaborador.findMany({
      where: { ativo: true, pendente: false },
      select: {
        id: true,
        nome: true,
        apelido: true,
        tipo: true,
        admissao: true,
        comecouEm: true,
        experienciaAte: true,
        aprendiz: true,
        contratoAte: true,
        asoValidoAte: true,
        manipulaAlimentos: true,
        ferias: { select: { inicio: true, fim: true } },
      },
    }),
    prisma.entregaDeEpi.findMany({
      where: { substituidaEm: null, colaborador: { ativo: true, pendente: false } },
      select: {
        colaboradorId: true,
        proximaTroca: true,
        desgastado: true,
        item: { select: { nome: true } },
        colaborador: { select: { nome: true, apelido: true } },
      },
    }),
    comDomingos ? prisma.configuracaoPessoal.findUnique({ where: { id: 1 }, select: { domingosSeguidos: true } }) : null,
  ]);

  const nome = (p: { nome: string; apelido: string | null }) => p.apelido ?? p.nome;
  const prazos = [
    ...pessoas.flatMap((p) =>
      prazosDoColaborador(
        {
          id: p.id,
          nome: nome(p),
          tipo: p.tipo,
          inicioDasFerias: data(p.tipo === "CLT" ? p.admissao : p.comecouEm),
          experienciaAte: data(p.experienciaAte),
          contratoAte: p.aprendiz ? data(p.contratoAte) : null,
          asoValidoAte: data(p.asoValidoAte),
          manipulaAlimentos: p.manipulaAlimentos,
          ferias: p.ferias.map((f) => ({ inicio: dateOnlyToString(f.inicio), fim: dateOnlyToString(f.fim) })),
        },
        hoje,
      ),
    ),
    ...prazosDeEpi(
      entregas.map((e) => ({
        colaboradorId: e.colaboradorId,
        nome: nome(e.colaborador),
        item: e.item.nome,
        proximaTroca: data(e.proximaTroca),
        desgastado: e.desgastado,
      })),
      hoje,
    ),
  ];

  const limite = config?.domingosSeguidos ?? 2;
  // Zero desliga o aviso dos domingos.
  if (comDomingos && limite > 0) {
    // Três domingos para trás e quatro para a frente. O domingo é o último dia da semana da escala.
    const domingos = domingosEmVolta(hoje, 3, 4);
    const semanas = await Promise.all(domingos.map((d) => carregarSemana(segundaDaSemana(d))));
    const escalados = semanas.map(({ semana, postos }, i) => ({
      data: domingos[i],
      escalados: new Set(postos.map((p) => semana.celulas.get(p.id)![6].colaboradorId).filter((x): x is number => x !== null)),
    }));
    // Free não entra: a regra do descanso semanal é de quem é empregado.
    const empregados = pessoas.filter((p) => p.tipo !== "FREELANCER").map((p) => ({ id: p.id, nome: nome(p) }));
    prazos.push(...domingosSeguidos(escalados, empregados, limite, hoje));
  }
  return emOrdemDeUrgencia(prazos);
}
