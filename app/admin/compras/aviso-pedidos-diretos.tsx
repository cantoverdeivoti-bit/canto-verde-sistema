import Link from "next/link";

/**
 * Os pedidos diretos que nasceram junto com a cotação, lembrados nos passos
 * de chamar fornecedores e comparar preços — senão eles ficam esperando em
 * Pedidos enquanto a atenção está toda na cotação.
 */
export function AvisoPedidosDiretos({
  quantos,
  contagemIds,
}: {
  quantos: number;
  contagemIds: number[];
}) {
  if (quantos === 0 || contagemIds.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm">
      <p className="min-w-0 flex-1">
        <strong>
          {quantos === 1 ? "1 pedido direto já nasceu" : `${quantos} pedidos diretos já nasceram`}
        </strong>{" "}
        <span className="text-[var(--muted-foreground)]">
          nesta rodada, para os fornecedores exclusivos.
        </span>
      </p>
      <Link
        href={`/admin/compras/enviar?c=${contagemIds.join(",")}`}
        className="inline-flex h-10 items-center rounded-lg border border-[var(--primary)] px-4 font-semibold text-[var(--primary)] hover:bg-[var(--muted)]"
      >
        Enviar
      </Link>
    </div>
  );
}
