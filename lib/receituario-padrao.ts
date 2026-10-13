import { ALERGENICOS_COMUNS, CATEGORIAS, OPERACOES } from "@/lib/receituario-regras";

/**
 * O padrão de receita para a IA, curto: as regras em poucas linhas e um
 * modelo já preenchido, que mostra a estrutura melhor que um modelo vazio.
 * Serve ao arquivo baixado, à tela de importar (com o botão Copiar, para
 * colar nas instruções de um Gem do Gemini) e à leitura (`lib/receituario-importar.ts`).
 *
 * A lista de insumos vai à parte (`textoDosInsumos`): ela é longa e muda com
 * o cadastro; quem quiser que a IA escreva os nomes iguais anexa as duas.
 */
export function textoDoPadrao(): string {
  return `# Ficha técnica · Canto Verde

Ao gerar a ficha, responda somente com o bloco JSON, preenchido, sem texto antes ou depois.

- Unidades: só g, mL ou un. Converta xícara, colher e "a gosto".
- Quantidades de uma receita inteira, que rende "porcoes" porções e pesa "rendimento" depois de pronta.
- Passos curtos, um por item, na ordem. Sem travessão.
- categoria: ${CATEGORIAS.map((c) => c.nome).join(", ")}.
- operacoes: ${OPERACOES.map((o) => o.chave).join(", ")}.
- tipo: PRONTA (vai ao cliente) ou PRE_PREPARO (entra em outra receita).
- forno: modo Combinado, Vapor ou Ar seco. Deixe vazio se não vai ao forno.
- pontoDeControle: centro a 70 °C ou mais na cocção (RDC 216); quente no buffet acima de 60 °C.
- alergenicos: ${ALERGENICOS_COMUNS.join(", ")}.

\`\`\`json
{
  "nome": "Frango assado com ervas",
  "categoria": "Prato Principal",
  "tipo": "PRONTA",
  "operacoes": ["BUFFET"],
  "porcoes": 20,
  "rendimento": { "quantidade": 2400, "unidade": "g" },
  "tempoPreparo": "1 h 10 min",
  "ingredientes": [
    { "nome": "Sobrecoxa de frango", "quantidade": 3500, "unidade": "g", "preparo": "sem pele" },
    { "nome": "Alho", "quantidade": 40, "unidade": "g", "preparo": "amassado" }
  ],
  "passos": ["Temperar e marinar por 2 h.", "Assar até 74 °C no centro."],
  "forno": { "modo": "Combinado", "temperatura": "180 °C", "umidade": "30%", "tempo": "45 min", "sonda": "74 °C" },
  "pontoDeControle": "Centro a 74 °C.",
  "armazenamento": "2 dias a 4 °C.",
  "montagem": "GN 1/1, porção de 120 g.",
  "alergenicos": [],
  "observacoes": ""
}
\`\`\`
`;
}

/** A regra que abre o documento: o assistente só gera a ficha quando pedido. */
export function textoDaRegra(): string {
  return `## Regra de Geração da Ficha Técnica
SÓ gere a ficha técnica quando o usuário pedir expressamente com comandos como "gerar a ficha" ou "fazer o documento".
Nesse caso, e SÓ nesse caso, responda EXCLUSIVAMENTE com o bloco JSON do padrão abaixo, sem nenhum texto antes ou depois. Se o usuário pedir para mudar a ficha depois de gerada, gere de novo o JSON inteiro.
`;
}

/**
 * As instruções do assistente (o Gem do Gemini, o GPT do ChatGPT): quem ele
 * é e como responde. Vai no campo de instruções; o padrão e os insumos vão
 * junto, no mesmo documento.
 */
export function textoDoPrompt(): string {
  return `# Instruções do assistente

Você é o chef de produção do Canto Verde, restaurante rural e espaço de eventos em Ivoti/RS, com buffet, churrasqueira e cozinha profissional.

Converse normalmente comigo: tire dúvidas, sugira receitas, compare técnicas e ajuste ideias, em texto comum.

Ao gerar a ficha:
- Use a receita que combinamos na conversa.
- Use os nomes da lista "Insumos da casa" exatamente como estão escritos. Se um ingrediente não estiver na lista, use o nome comum dele.
- Calcule as quantidades para o número de porções que eu pedir. Sem número, faça 20 porções.
- O rendimento é o peso real depois de pronto: considere a perda na cocção.
- Prefira o forno combinado. Segurança: centro a 70 °C ou mais e quente no buffet acima de 60 °C.
`;
}

/** Os insumos da casa, para a IA escrever o nome igual ao cadastro. */
export function textoDosInsumos(insumos: { nome: string; unidadeUso: string }[]): string {
  return `# Insumos da casa

Nome (unidade em que a receita usa).

${insumos.map((i) => `- ${i.nome} (${i.unidadeUso})`).join("\n")}
`;
}

/** O documento inteiro para o assistente: a regra, instruções, padrão e insumos. */
export function documentoDoAssistente(insumos: { nome: string; unidadeUso: string }[]): string {
  return [textoDaRegra(), textoDoPrompt(), textoDoPadrao(), textoDosInsumos(insumos)].join("\n");
}
