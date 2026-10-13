/**
 * Pedaços pequenos do Departamento pessoal usados por mais de uma tela.
 */

/** "Jonathan Schmidt" -> "JS"; uma palavra só, a primeira letra. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${partes[0][0]}${ultima}`.toUpperCase();
}

/** O link do WhatsApp de um telefone gravado em E.164 (+5551999999999). */
export function linkDoWhatsAppDoColaborador(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  return /^55\d{10,11}$/.test(digitos) ? `https://wa.me/${digitos}` : null;
}

/** O nome que a equipe lê: o apelido, quando há. */
export const nomeNaEscala = (c: { nome: string; apelido: string | null }) => c.apelido ?? c.nome;

/** Máscara do CPF enquanto digita: "12345678909" -> "123.456.789-09". Só UX. */
export function mascaraCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
