/**
 * Máscara progressiva de telefone BR para digitação: só UX.
 * A normalização E.164 continua no servidor — esta função nunca valida.
 *
 * "51999887766"  -> "(51) 99988-7766"   (celular, 11 dígitos)
 * "5135541234"   -> "(51) 3554-1234"    (fixo, 10 dígitos)
 * "+5551999887766" -> "(51) 99988-7766" (país informado, ver abaixo)
 * Parciais formatam até onde dá: "519" -> "(51) 9".
 */
export function maskPhoneBR(value: string): string {
  const all = value.replace(/\D/g, "");

  // Quem digita "+55 51 99988-7766" está informando o país, não um DDD. Sem
  // tirar o 55 antes de cortar, ele virava DDD e os dois últimos dígitos do
  // número real caíam fora — o cliente saía com um telefone que não existe
  // e o restaurante sem como chamá-lo.
  //
  // A regra é por comprimento e não tem ambiguidade: número nacional nunca
  // passa de 11 dígitos, então 12 (fixo) ou 13 (celular) começando em 55 só
  // pode ser o código do país. O DDD 55 chega com 10 ou 11 e não é tocado.
  const national =
    (all.length === 12 || all.length === 13) && all.startsWith("55")
      ? all.slice(2)
      : all;

  const digits = national.slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  // Até 6 dígitos após o DDD ainda não dá para saber onde vai o hífen.
  if (rest.length <= 6) return `(${ddd}) ${rest}`;

  // Celular (9 dígitos locais): 5+4. Fixo (8): 4+4.
  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
