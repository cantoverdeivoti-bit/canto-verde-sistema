/**
 * Os documentos que a admissão pede, na ordem em que a casa costuma pedir.
 * Cada um é entregue (com a foto ou o PDF, quando houver), não se aplica a
 * esta pessoa, ou falta.
 */
export const DOCUMENTOS_DA_ADMISSAO = [
  { chave: "rg", nome: "RG ou CNH" },
  { chave: "cpf", nome: "CPF" },
  { chave: "ctps", nome: "Carteira de trabalho (CTPS digital)" },
  { chave: "pis", nome: "PIS/NIS" },
  { chave: "titulo", nome: "Título de eleitor" },
  { chave: "reservista", nome: "Certificado de reservista", dica: "homens de 18 a 45 anos" },
  { chave: "residencia", nome: "Comprovante de residência" },
  { chave: "certidao", nome: "Certidão de nascimento ou casamento" },
  { chave: "escolaridade", nome: "Comprovante de escolaridade" },
  { chave: "foto", nome: "Foto 3x4" },
  { chave: "filhos", nome: "Certidão e vacinação dos filhos até 14 anos", dica: "para o salário-família" },
  { chave: "aso", nome: "ASO admissional" },
  { chave: "banco", nome: "Conta bancária ou PIX" },
  { chave: "contrato", nome: "Contrato de trabalho assinado" },
] as const;

export type ChaveDoDocumento = (typeof DOCUMENTOS_DA_ADMISSAO)[number]["chave"];
export const ehDocumento = (v: unknown): v is ChaveDoDocumento => DOCUMENTOS_DA_ADMISSAO.some((d) => d.chave === v);

export const PARENTESCOS = ["Filho(a)", "Cônjuge", "Outro"] as const;
