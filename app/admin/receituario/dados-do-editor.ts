
import { prisma } from "@/lib/db";
import { configDoReceituario } from "@/lib/receituario-dados";
import { unidade } from "@/lib/receituario-regras";

import type { OpcaoDeFicha, OpcaoDeInsumo, ValorInicial } from "./editor-de-ficha";

/** O que o editor oferece para escolher como ingrediente: os insumos ligados e as fichas (menos a própria). */
export async function opcoesDoEditor(
  semFichaId: number | null,
): Promise<{ insumos: OpcaoDeInsumo[]; fichas: OpcaoDeFicha[]; etiquetas: string[] }> {
  const [insumos, fichas, { etiquetas }] = await Promise.all([
    prisma.insumoReceita.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, unidadeUso: true } }),
    prisma.fichaTecnica.findMany({
      where: { ativo: true, ...(semFichaId ? { NOT: { id: semFichaId } } : {}) },
      orderBy: { nome: "asc" },
      select: { id: true, codigo: true, nome: true, unidadeRendimento: true, tipo: true },
    }),
    configDoReceituario(),
  ]);
  return {
    insumos,
    etiquetas,
    fichas: fichas.map((f) => ({ id: f.id, codigo: f.codigo, nome: f.nome, unidadeRendimento: f.unidadeRendimento, preparo: f.tipo === "PRE_PREPARO" })),
  };
}

export const FICHA_EM_BRANCO: ValorInicial = {
  codigo: "",
  nome: "",
  categoria: "Prato Principal",
  tipo: "PRONTA",
  operacoes: [],
  etiquetas: [],
  porcoes: "1",
  rendimentoTotal: "",
  unidadeRendimento: "g",
  tempoPreparo: "",
  passos: [""],
  observacoes: "",
  alergenicos: [],
  viabilidade: "",
  modoForno: "",
  temperatura: "",
  umidade: "",
  tempoForno: "",
  sonda: "",
  ajusteForno: "",
  utensilios: "",
  pontoDeControle: "",
  armazenamento: "",
  montagem: "",
  custoManualPorcao: "",
  ingredientes: [],
};

/** A ficha do banco no formato do editor (números como texto, ingredientes com o nome para mostrar). */
export async function fichaParaEditar(codigo: string) {
  const f = await prisma.fichaTecnica.findUnique({
    where: { codigo },
    include: {
      ingredientes: {
        orderBy: { ordem: "asc" },
        include: { insumo: { select: { nome: true } }, subFicha: { select: { nome: true } } },
      },
    },
  });
  if (!f) return null;
  const inicial: ValorInicial = {
    codigo: f.codigo,
    nome: f.nome,
    categoria: f.categoria,
    tipo: f.tipo,
    operacoes: f.operacoes,
    etiquetas: f.etiquetas,
    porcoes: String(f.porcoes),
    rendimentoTotal: f.rendimentoTotal === null ? "" : String(Number(f.rendimentoTotal)).replace(".", ","),
    unidadeRendimento: unidade(f.unidadeRendimento) ?? "g",
    tempoPreparo: f.tempoPreparo ?? "",
    passos: f.passos.length ? f.passos : [""],
    observacoes: f.observacoes ?? "",
    alergenicos: f.alergenicos,
    viabilidade: f.viabilidade ?? "",
    modoForno: f.modoForno ?? "",
    temperatura: f.temperatura ?? "",
    umidade: f.umidade ?? "",
    tempoForno: f.tempoForno ?? "",
    sonda: f.sonda ?? "",
    ajusteForno: f.ajusteForno ?? "",
    utensilios: f.utensilios ?? "",
    pontoDeControle: f.pontoDeControle ?? "",
    armazenamento: f.armazenamento ?? "",
    montagem: f.montagem ?? "",
    custoManualPorcao: f.custoManualPorcao === null ? "" : String(Number(f.custoManualPorcao)).replace(".", ","),
    ingredientes: f.ingredientes.map((l) => ({
      insumoId: l.insumoId,
      subFichaId: l.subFichaId,
      nomeLivre: l.nomeLivre,
      rotulo: l.insumo?.nome ?? l.subFicha?.nome ?? l.nomeLivre ?? "",
      quantidade: String(Number(l.quantidade)).replace(".", ","),
      unidade: unidade(l.unidade) ?? "",
      preparo: l.preparo ?? "",
    })),
  };
  return { id: f.id, nome: f.nome, inicial };
}
