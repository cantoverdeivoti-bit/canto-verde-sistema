import { z } from "zod";

import { chave } from "@/lib/format";
import { CATEGORIAS, OPERACOES, type Unidade } from "@/lib/receituario-regras";

/**
 * A receita feita por IA entrando no Receituário. A IA recebe o padrão
 * (`app/admin/receituario/importar/padrao/route.ts`) e responde um JSON; aqui
 * ele é achado no meio da resposta, conferido e ligado aos insumos e
 * pré-preparos da casa. Sem banco: quem chama passa as listas, e as regras
 * cabem num teste (`scripts/test-receituario.ts`).
 *
 * O resultado não salva nada: vira o formulário do Editar ficha já
 * preenchido, e é a pessoa que confere e salva.
 */

/** O JSON da resposta: o bloco ```json, ou o primeiro { … } inteiro, quando a IA não marcou o bloco. */
export function extrairJson(texto: string): string | null {
  const bloco = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
  if (bloco && bloco[1].trim().startsWith("{")) return bloco[1].trim();
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : null;
}

// A IA às vezes põe travessão no texto; a casa não usa (padrão das telas).
const semTravessao = (t: string) => t.replace(/\s+—\s+/g, ", ").replace(/—/g, "-").trim();
const texto = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? semTravessao(v).slice(0, max) : ""));

const UNIDADES: Record<string, { unidade: Unidade; fator: number }> = {
  g: { unidade: "g", fator: 1 },
  gr: { unidade: "g", fator: 1 },
  grama: { unidade: "g", fator: 1 },
  gramas: { unidade: "g", fator: 1 },
  kg: { unidade: "g", fator: 1000 },
  ml: { unidade: "mL", fator: 1 },
  l: { unidade: "mL", fator: 1000 },
  litro: { unidade: "mL", fator: 1000 },
  litros: { unidade: "mL", fator: 1000 },
  un: { unidade: "un", fator: 1 },
  und: { unidade: "un", fator: 1 },
  unidade: { unidade: "un", fator: 1 },
  unidades: { unidade: "un", fator: 1 },
};
const lerUnidade = (u: unknown) => UNIDADES[chave(String(u ?? "")).replace(/\.$/, "")];

const quantidade = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    ctx.addIssue({ code: "custom", message: "a quantidade tem de ser um número maior que zero" });
    return z.NEVER;
  }
  return n;
});

const medida = z.object({ quantidade, unidade: z.string() }).transform((m, ctx) => {
  const u = lerUnidade(m.unidade);
  if (!u) {
    ctx.addIssue({ code: "custom", path: ["unidade"], message: `unidade "${m.unidade}" não vale; use g, mL ou un` });
    return z.NEVER;
  }
  return { quantidade: Math.round(m.quantidade * u.fator * 1000) / 1000, unidade: u.unidade };
});

const ingrediente = z
  .object({
    nome: z.string().trim().min(1, { message: "falta o nome" }),
    quantidade,
    unidade: z.string(),
    preparo: texto(160),
    ficha: z.string().optional().nullable(),
  })
  .transform((i, ctx) => {
    const u = lerUnidade(i.unidade);
    if (!u) {
      ctx.addIssue({ code: "custom", path: ["unidade"], message: `unidade "${i.unidade}" não vale; use g, mL ou un` });
      return z.NEVER;
    }
    return {
      nome: semTravessao(i.nome).slice(0, 120),
      quantidade: Math.round(i.quantidade * u.fator * 1000) / 1000,
      unidade: u.unidade,
      preparo: i.preparo,
      ficha: i.ficha?.trim().toUpperCase() || null,
    };
  });

const categoria = z.string().transform((c, ctx) => {
  const achada = CATEGORIAS.find((x) => chave(x.nome) === chave(c));
  if (!achada) {
    ctx.addIssue({ code: "custom", message: `"${c}" não é uma categoria da casa (${CATEGORIAS.map((x) => x.nome).join(", ")})` });
    return z.NEVER;
  }
  return achada.nome;
});

const receitaSchema = z.object({
  nome: z.string().trim().min(2, { message: "falta o nome da receita" }).transform((n) => semTravessao(n).slice(0, 120)),
  categoria,
  tipo: z
    .string()
    .optional()
    .transform((t) => (chave(t ?? "").replace(/[^a-z]/g, "") === "prepreparo" ? ("PRE_PREPARO" as const) : ("PRONTA" as const))),
  operacoes: z
    .array(z.string())
    .optional()
    .transform((ops) => [...new Set((ops ?? []).map((o) => OPERACOES.find((x) => chave(x.chave) === chave(o) || chave(x.nome) === chave(o))?.chave).filter((o) => o !== undefined))]),
  etiquetas: z.array(z.string()).optional().transform((e) => (e ?? []).map((x) => semTravessao(x).slice(0, 30)).filter(Boolean)),
  porcoes: quantidade.transform((n) => Math.max(1, Math.round(n))),
  rendimento: medida.optional().nullable(),
  tempoPreparo: texto(40),
  ingredientes: z.array(ingrediente).min(1, { message: "a receita precisa de pelo menos um ingrediente" }).max(150),
  passos: z.array(z.string()).optional().transform((p) => (p ?? []).map((x) => semTravessao(x).slice(0, 800)).filter(Boolean).slice(0, 80)),
  forno: z
    .object({
      viabilidade: texto(40),
      modo: texto(60),
      temperatura: texto(30),
      umidade: texto(30),
      tempo: texto(40),
      sonda: texto(20),
      ajuste: texto(1000),
    })
    .partial()
    .optional()
    .nullable(),
  utensilios: texto(1000),
  pontoDeControle: texto(1000),
  armazenamento: texto(1000),
  montagem: texto(1000),
  alergenicos: z.array(z.string()).optional().transform((a) => (a ?? []).map((x) => chave(x)).filter(Boolean).slice(0, 20)),
  observacoes: texto(4000),
});
export type ReceitaLida = z.output<typeof receitaSchema>;

/** Onde o erro aconteceu, como a pessoa lê: "ingredientes 3: unidade ...". */
function ondeFoi(caminho: PropertyKey[]): string {
  return caminho
    .map((p) => (typeof p === "number" ? String(p + 1) : String(p)))
    .filter((p) => p !== "unidade" && p !== "quantidade")
    .join(" ");
}

/** Confere a resposta inteira. Devolve a receita ou a lista de problemas, em português. */
export function lerReceita(textoDaResposta: string): { ok: true; receita: ReceitaLida } | { ok: false; erros: string[] } {
  const json = extrairJson(textoDaResposta);
  if (!json) return { ok: false, erros: ["Não achei o JSON na resposta. Cole a resposta inteira da IA, com o bloco que começa em { e termina em }."] };
  let dados: unknown;
  try {
    dados = JSON.parse(json);
  } catch {
    return { ok: false, erros: ["O JSON da resposta está quebrado (falta vírgula, aspas ou chave). Peça à IA para mandar de novo só o bloco JSON."] };
  }
  const r = receitaSchema.safeParse(dados);
  if (!r.success) {
    return {
      ok: false,
      erros: r.error.issues.slice(0, 12).map((i) => {
        const onde = ondeFoi(i.path);
        const msg = i.code === "invalid_type" ? "faltou ou está no formato errado" : i.message;
        return onde ? `${onde}: ${msg}` : msg;
      }),
    };
  }
  return { ok: true, receita: r.data };
}

export type OpcaoParaCasar = { id: number; nome: string; unidade: string; codigo?: string };
export type Sugestao = { insumoId: number | null; subFichaId: number | null; nome: string; unidade: Unidade };

const palavras = (t: string) => new Set(chave(t).split(/[^a-z0-9]+/).filter((p) => p.length > 2));

/**
 * Liga cada ingrediente ao que a casa tem: pelo código da ficha (pré-preparo)
 * ou pelo nome exato (sem acento e sem maiúscula) de um insumo ou de uma
 * ficha. O que não casa fica para a pessoa escolher, com até 3 sugestões
 * parecidas (as que dividem mais palavras com o nome da IA).
 */
export function casarIngredientes(ingredientes: ReceitaLida["ingredientes"], insumos: OpcaoParaCasar[], fichas: OpcaoParaCasar[]) {
  const unid = (u: string): Unidade => (u === "mL" || u === "un" ? u : "g");
  return ingredientes.map((i) => {
    const base = { quantidade: String(i.quantidade).replace(".", ","), unidade: i.unidade as Unidade | "", preparo: i.preparo };
    const porCodigo = i.ficha ? fichas.find((f) => f.codigo?.toUpperCase() === i.ficha) : undefined;
    if (porCodigo) return { ...base, insumoId: null, subFichaId: porCodigo.id, nomeLivre: null, rotulo: porCodigo.nome, sugestoes: [] as Sugestao[] };
    const insumo = insumos.find((x) => chave(x.nome) === chave(i.nome));
    if (insumo) return { ...base, insumoId: insumo.id, subFichaId: null, nomeLivre: null, rotulo: insumo.nome, sugestoes: [] as Sugestao[] };
    const ficha = fichas.find((x) => chave(x.nome) === chave(i.nome));
    if (ficha) return { ...base, insumoId: null, subFichaId: ficha.id, nomeLivre: null, rotulo: ficha.nome, sugestoes: [] as Sugestao[] };

    const alvo = palavras(i.nome);
    const nota = (nome: string) => [...palavras(nome)].filter((p) => alvo.has(p)).length;
    const sugestoes: Sugestao[] = [
      ...insumos.map((x) => ({ insumoId: x.id, subFichaId: null, nome: x.nome, unidade: unid(x.unidade), n: nota(x.nome) })),
      ...fichas.map((x) => ({ insumoId: null, subFichaId: x.id, nome: x.nome, unidade: unid(x.unidade), n: nota(x.nome) })),
    ]
      .filter((s) => s.n > 0)
      .sort((a, b) => b.n - a.n || a.nome.length - b.nome.length)
      .slice(0, 3)
      .map((s) => ({ insumoId: s.insumoId, subFichaId: s.subFichaId, nome: s.nome, unidade: s.unidade }));
    // Sem par: a linha leva o nome da IA e espera a pessoa escolher.
    return { ...base, insumoId: null, subFichaId: null, nomeLivre: null, rotulo: i.nome, sugestoes };
  });
}
