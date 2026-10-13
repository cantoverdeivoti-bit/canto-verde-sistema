"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { UNIT_LABEL } from "@/lib/format";
import {
  chave,
  lerCSV,
  lerNumero,
  lerSimNao,
  lerUnidade,
  mapaDeCategorias,
} from "@/lib/planilha";
import { productSchema } from "@/lib/validations";
import type { ProductUnit } from "@/generated/prisma/client";

const UNIDADES = new Set<string>(Object.keys(UNIT_LABEL));
const numeroValido = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Acima disto é engano, não cadastro. */
const TETO = 2000;

export type LinhaPronta = {
  /** Número da linha no arquivo, contando o cabeçalho — é o que a pessoa vê. */
  linha: number;
  code: string | null;
  name: string;
  categoryId: number | null;
  unit: string;
  currentStock: number;
  /** A célula de estoque veio preenchida? Vazia nunca zera o estoque de quem já existe. */
  temEstoque: boolean;
  minStock: number | null;
  idealStock: number | null;
  isActive: boolean;
  /** Já existe produto com este código? Decide inserir ou atualizar. */
  existente: boolean;
};

export type Diagnostico = {
  ok: boolean;
  message?: string;
  novas: LinhaPronta[];
  atualizacoes: LinhaPronta[];
  erros: { linha: number; motivo: string }[];
  /** Linhas sem código repetido dentro do próprio arquivo. */
  duplicadasNoArquivo: number[];
};

const VAZIO: Diagnostico = {
  ok: false,
  novas: [],
  atualizacoes: [],
  erros: [],
  duplicadasNoArquivo: [],
};

/** Lê a planilha e devolve as células como texto, sem interpretar nada. */
async function celulas(file: File): Promise<string[][]> {
  const nome = file.name.toLowerCase();

  if (nome.endsWith(".csv") || file.type === "text/csv") {
    return lerCSV(await file.text());
  }

  // XLSX. O import é dinâmico para a biblioteca não entrar no bundle de quem
  // só abre a tela — ela só é necessária quando um .xlsx aparece.
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const aba = wb.worksheets[0];
  if (!aba) return [];

  const linhas: string[][] = [];
  aba.eachRow((row) => {
    const valores: string[] = [];
    // `row.eachCell` pula célula vazia, o que desalinharia as colunas.
    for (let c = 1; c <= COLUNAS_ESPERADAS; c++) {
      valores.push(textoDaCelula(row.getCell(c).value).trim());
    }
    if (valores.some((v) => v !== "")) linhas.push(valores);
  });
  return linhas;
}

const COLUNAS_ESPERADAS = 8;

/**
 * A célula do .xlsx como texto. Fórmula vale o resultado, texto formatado
 * vale as letras e link vale o que aparece — `String()` direto devolvia
 * "[object Object]" para os três.
 */
function textoDaCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object" || v instanceof Date) return String(v);
  if ("result" in v) return textoDaCelula(v.result);
  if ("richText" in v && Array.isArray(v.richText)) {
    return v.richText.map((t: { text?: string }) => t.text ?? "").join("");
  }
  if ("text" in v) return textoDaCelula(v.text);
  return "";
}

/**
 * Passo 1: entende o arquivo e diz o que aconteceria. NÃO escreve nada.
 *
 * Operação em massa precisa de conferência antes — um arquivo errado estraga o
 * catálogo, e ver "12 novos, 3 atualizados, 2 com erro" antes de aplicar é a
 * diferença entre confiança e susto.
 *
 * A leitura fica no servidor para a biblioteca de XLSX não ir para o
 * navegador; entre este passo e o próximo trafega só JSON.
 */
export async function analisarPlanilha(formData: FormData): Promise<Diagnostico> {
  await requireModule("compras");

  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) {
    return { ...VAZIO, message: "Escolha um arquivo." };
  }

  let linhas: string[][];
  try {
    linhas = await celulas(file);
  } catch (error) {
    console.error("[analisarPlanilha] leitura falhou:", error);
    return {
      ...VAZIO,
      message: "Não consegui ler este arquivo. Ele é mesmo uma planilha?",
    };
  }

  if (linhas.length === 0) {
    return { ...VAZIO, message: "A planilha está vazia." };
  }

  // A primeira linha é cabeçalho se a segunda coluna não parecer descrição de
  // produto — na prática, se ela disser "Descrição".
  const cabecalho = /descric/i.test((linhas[0][1] ?? "").normalize("NFD"));
  const corpo = cabecalho ? linhas.slice(1) : linhas;
  const deslocamento = cabecalho ? 2 : 1;

  if (corpo.length > TETO) {
    return {
      ...VAZIO,
      message: `A planilha tem ${corpo.length} linhas. O limite é ${TETO}.`,
    };
  }

  const [produtos, categorias] = await Promise.all([
    prisma.product.findMany({
      where: { code: { not: null } },
      select: { code: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  const codigosExistentes = new Set(produtos.map((p) => p.code as string));

  // Montado a cada importação porque a lista de categorias mudou de lugar:
  // era enum no código, agora é cadastro, e o que vale é o que existe agora.
  const categoriaPorTexto = mapaDeCategorias(categorias);

  const novas: LinhaPronta[] = [];
  const atualizacoes: LinhaPronta[] = [];
  const erros: { linha: number; motivo: string }[] = [];
  const vistosNoArquivo = new Map<string, number>();
  const duplicadasNoArquivo: number[] = [];

  corpo.forEach((celula, i) => {
    const linha = i + deslocamento;
    const [code = "", name = "", categoria = "", unidade = "", estoque = "", minimo = "", ideal = "", ativo = ""] =
      celula;

    const unit = lerUnidade(unidade);
    if (unidade.trim() !== "" && !unit) {
      erros.push({ linha, motivo: `Unidade "${unidade}" não existe.` });
      return;
    }

    // Categoria desconhecida é erro, não motivo para criar uma nova: a
    // planilha vem cheia de variação de digitação, e aceitar cada uma
    // encheria o cadastro de "Hortifruti", "Hortfruti" e "HORTI". Quem
    // quiser a categoria nova cria na tela, uma vez, com o nome certo.
    const categoryId =
      categoria.trim() === ""
        ? null
        : (categoriaPorTexto.get(chave(categoria)) ?? undefined);

    if (categoryId === undefined) {
      erros.push({
        linha,
        motivo: `Categoria "${categoria}" não existe. Crie ela antes de importar.`,
      });
      return;
    }

    // O normalizador entrega exatamente a forma que o productSchema espera,
    // para a regra de negócio continuar tendo um dono só — inclusive o
    // "ideal ≥ mínimo", que é o refinamento do schema.
    const parsed = productSchema.safeParse({
      code: code.trim(),
      name: name.trim(),
      categoryId,
      unit: unit ?? "UN",
      currentStock: lerNumero(estoque) || "0",
      minStock: lerNumero(minimo),
      idealStock: lerNumero(ideal),
      // A planilha não tem coluna de lote: são oito, lidas por posição. Vazio
      // aqui é o que faz a reimportação NUNCA apagar o lote de quem já tem —
      // `aplicarPlanilha` monta só as colunas do arquivo, e esta fica fora.
      lotSize: "",
      isActive: lerSimNao(ativo),
      // Os três que a planilha não carrega, passados na mão.
      //
      // Sem eles TODA linha falhava com "expected string, received undefined":
      // `optionalText` transforma vazio em nulo mas não aceita ausente, e
      // `acceptsSimilarBrand` é booleano sem padrão. Passou batido quando a
      // marca de preferência virou lista — o outro chamador do schema foi
      // ajustado e este não.
      //
      // Só para o schema poder validar o resto. Não chegam ao banco: o
      // `dados` de `aplicarPlanilha` monta as oito colunas da planilha e mais
      // nada, então reimportar não apaga a descrição nem as marcas que alguém
      // escreveu à mão na tela.
      description: "",
      preferredBrands: [],
      acceptsSimilarBrand: false,
    });

    if (!parsed.success) {
      erros.push({
        linha,
        motivo: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
      return;
    }

    const d = parsed.data;

    if (d.code) {
      const antes = vistosNoArquivo.get(d.code);
      if (antes !== undefined) {
        duplicadasNoArquivo.push(linha);
        erros.push({
          linha,
          motivo: `Código "${d.code}" repetido (já aparece na linha ${antes}).`,
        });
        return;
      }
      vistosNoArquivo.set(d.code, linha);
    }

    const pronta: LinhaPronta = {
      linha,
      ...d,
      temEstoque: estoque.trim() !== "",
      existente: d.code !== null && codigosExistentes.has(d.code),
    };

    if (pronta.existente) atualizacoes.push(pronta);
    else novas.push(pronta);
  });

  return { ok: true, novas, atualizacoes, erros, duplicadasNoArquivo };
}

export type AplicacaoResult = {
  ok: boolean;
  message?: string;
  criados?: number;
  atualizados?: number;
};

/**
 * Passo 2: grava o que o passo 1 aprovou.
 *
 * Não apaga nada. O módulo tem invariante de que produto some da lista mas
 * continua existindo, porque a cotação referencia a linha — item ausente da
 * planilha é ignorado, nunca desativado.
 */
export async function aplicarPlanilha(
  linhas: LinhaPronta[],
  opcoes: { trocarEstoque: boolean } = { trocarEstoque: false },
): Promise<AplicacaoResult> {
  await requireModule("compras");

  if (linhas.length === 0) return { ok: false, message: "Nada para aplicar." };
  if (linhas.length > TETO) return { ok: false, message: "Arquivo grande demais." };

  // As linhas foram e voltaram pelo navegador: confere o mínimo de novo.
  const invalida = linhas.find(
    (l) =>
      typeof l.name !== "string" ||
      l.name.trim() === "" ||
      !UNIDADES.has(l.unit) ||
      !numeroValido(l.currentStock) ||
      (l.minStock !== null && !numeroValido(l.minStock)) ||
      (l.idealStock !== null && !numeroValido(l.idealStock)),
  );
  if (invalida) return { ok: false, message: `A linha ${invalida.linha} veio com dado inválido. Confira de novo.` };

  let criados = 0;
  let atualizados = 0;

  // O passo 1 devolveu ids de categoria ao navegador e eles voltaram por aqui.
  // Conferir de novo é barato e evita que um id que sumiu no meio do caminho
  // — categoria apagada em outra aba — derrube a transação inteira.
  const validas = new Set(
    (await prisma.category.findMany({ select: { id: true } })).map((c) => c.id),
  );

  /**
   * Quem já existe, num mapa, ANTES da transação.
   *
   * Era um `findUnique` por linha dentro dela — numa planilha de trezentas
   * linhas, trezentas consultas só para perguntar "este código existe?", mais
   * uma escrita para cada. Mil idas ao banco pelo pooler não cabem nos cinco
   * segundos que o Prisma dá a uma transação, e o mesmo estouro derrubou o
   * fechamento da contagem e a importação de estoque antes desta.
   *
   * Fora da transação é a leitura certa: o passo 1 já mostrou o diagnóstico a
   * partir desta mesma foto, e um código que apareça no meio do caminho vira
   * um erro honesto de chave única, não uma linha escrita por cima.
   */
  const idPorCodigo = new Map(
    (
      await prisma.product.findMany({
        where: { code: { not: null } },
        select: { id: true, code: true },
      })
    ).map((p) => [p.code as string, p.id]),
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const l of linhas) {
          const dados = {
            code: l.code,
            name: l.name,
            categoryId:
              l.categoryId !== null && validas.has(l.categoryId)
                ? l.categoryId
                : null,
            unit: l.unit as ProductUnit,
            minStock: l.minStock,
            idealStock: l.idealStock,
            isActive: l.isActive,
          };

          // Sem código não há identidade: a linha só pode ser produto novo.
          const existente = l.code ? idPorCodigo.get(l.code) : undefined;

          if (existente !== undefined) {
            // O estoque de quem já existe só muda se o dono pediu: uma
            // planilha exportada semanas atrás desfaria as contagens de
            // depois. E célula vazia nunca vira zero.
            const estoque = opcoes.trocarEstoque && l.temEstoque ? { currentStock: l.currentStock } : {};
            await tx.product.update({ where: { id: existente }, data: { ...dados, ...estoque } });
            atualizados++;
          } else {
            await tx.product.create({ data: { ...dados, currentStock: l.currentStock } });
            criados++;
          }
        }
      },
      // Uma escrita por linha ainda é uma escrita por linha: cada uma tem
      // valores próprios em oito colunas, e agrupar isso num `UPDATE` só
      // custaria mais do que resolve. O que dava para tirar — as consultas de
      // conferência — saiu; o teto cobre o resto.
      { timeout: 60_000 },
    );
  } catch (error) {
    console.error("[aplicarPlanilha] falha:", error);
    // A transação é tudo ou nada: um erro no meio não deixa metade aplicada.
    return {
      ok: false,
      message: "Não consegui aplicar. Nada foi gravado — confira e tente de novo.",
    };
  }

  revalidatePath("/admin/compras", "layout");
  return { ok: true, criados, atualizados };
}
