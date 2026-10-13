/** Um número de destaque, como nos outros painéis. `tom` pinta o valor quando ele pede atenção. */
export function Numero({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: "alerta" | "atencao";
}) {
  const cor = tom === "alerta" ? "var(--destructive)" : tom === "atencao" ? "var(--warn)" : undefined;
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className="num-display text-lg" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {detalhe && <p className="text-[11px] text-[var(--muted-foreground)]">{detalhe}</p>}
    </div>
  );
}
