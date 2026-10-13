import { porMes, type TipoContrato } from "@/lib/tipos-de-contrato";

/**
 * O que falta no cadastro de um colaborador ativo. Decisão do dono: CPF,
 * telefone, nascimento, endereço, contato de emergência (nome e telefone),
 * função, dias de trabalho e os valores (salário no CLT e no fixo, diária no
 * free); admissão no CLT e no fixo, que é o que conta o período de férias.
 * Sem dia marcado a escala trata a pessoa como "qualquer dia", mas o cadastro
 * fica pela metade do mesmo jeito.
 *
 * Sem banco, para caber num teste; quem busca no banco é
 * `lib/cadastro-incompleto.ts`. A lista em Pendências e o número da página
 * inicial saem daqui.
 */
export function faltasDoCadastro(c: {
  tipo: TipoContrato;
  cpf: string | null;
  telefone: string | null;
  nascimento: Date | null;
  endereco: string | null;
  emergenciaNome: string | null;
  emergenciaTelefone: string | null;
  salario: unknown;
  diaria: unknown;
  comecouEm: Date | null;
  admissao: Date | null;
  funcaoId: number | null;
  diasDeTrabalho: number[];
  /** O free que só tem diária por dia da semana também tem valor. */
  diariasPorDia: number;
}): string[] {
  const falta: string[] = [];
  if (!c.cpf) falta.push("CPF");
  if (!c.telefone) falta.push("telefone");
  if (!c.nascimento) falta.push("nascimento");
  if (!c.endereco?.trim()) falta.push("endereço");
  if (!c.emergenciaNome || !c.emergenciaTelefone) falta.push("contato de emergência");
  if (c.funcaoId === null) falta.push("função");
  if (c.diasDeTrabalho.length === 0) falta.push("dias de trabalho");
  if (porMes(c.tipo)) {
    if (c.salario === null) falta.push("salário");
    // As férias contam da carteira no CLT e do começo no fixo (sem registro).
    if (c.tipo === "CLT" && !c.admissao) falta.push("carteira assinada");
    if (c.tipo === "FIXO" && !c.comecouEm) falta.push("data em que começou");
  } else if (c.diaria === null && c.diariasPorDia === 0) {
    falta.push("diária");
  }
  return falta;
}
