/**
 * O aviso da casa, escrito pelo dono em Configurações.
 *
 * Renderiza nulo quando não há texto, para que quem chama não precise
 * repetir a checagem — e para que a casa sem aviso não pague nenhuma
 * moldura vazia. `whitespace-pre-line` preserva as quebras que o dono
 * digitou: o campo é texto corrido, não markdown, e a primeira linha
 * costuma ser o título ("ATENÇÃO").
 */
export function BookingNotice({
  text,
  className = "",
}: {
  text: string | null;
  className?: string;
}) {
  if (!text) return null;

  return (
    <div
      role="note"
      className={`msg-warn whitespace-pre-line leading-relaxed ${className}`}
    >
      {text}
    </div>
  );
}
