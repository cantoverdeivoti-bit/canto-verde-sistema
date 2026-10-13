import Link from "next/link";
import type { ReactNode } from "react";

import { atalhosDePeriodo, diasNoPeriodo } from "@/lib/periodo";

/** "1 set", "25 set 2026" — curto, para caber na linha do filtro. */
export function diaCurto(dia: string, comAno = false) {
  return new Date(`${dia}T12:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    ...(comAno ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * O filtro de período, igual em todas as abas: atalhos de um toque e, para o
 * resto, as duas datas. Tudo pelo endereço (`?de=&ate=`), sem estado na tela —
 * recarregar ou mandar o link mostra o mesmo relatório.
 *
 * É o cartão de busca da aba (padrão das telas, seção 5): `busca` entra em
 * cima (o campo com a lupa) e `children` embaixo (os outros filtros da aba),
 * tudo no mesmo cartão branco, para a aba não ter dois filtros soltos.
 *
 * `extras` são os outros filtros da aba (fornecedor, produto…), que não podem
 * se perder quando ele troca o período.
 */
export function FiltroDePeriodo({
  caminho,
  de,
  ate,
  hoje,
  extras = {},
  busca,
  children,
}: {
  caminho: string;
  de: string;
  ate: string;
  hoje: string;
  extras?: Record<string, string>;
  busca?: ReactNode;
  children?: ReactNode;
}) {
  const atalhos = atalhosDePeriodo(hoje);
  const endereco = (d: string, a: string) =>
    `${caminho}?${new URLSearchParams({ ...extras, de: d, ate: a }).toString()}`;

  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
      {busca}
      {/* No celular, os quatro atalhos numa linha só, em colunas iguais. */}
      <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        {atalhos.map((a) => (
          <Link
            key={a.chave}
            href={endereco(a.de, a.ate)}
            aria-pressed={a.de === de && a.ate === ate}
            className="chip min-w-0 px-1 py-2 text-center text-[13px] whitespace-nowrap sm:px-3.5 sm:py-2.5 sm:text-[15px]"
          >
            <span className="sm:hidden">{a.curto}</span>
            <span className="hidden sm:inline">{a.nome}</span>
          </Link>
        ))}
      </div>
      {/* As duas datas e o "Ver" na mesma linha, também no celular. */}
      <form
        action={caminho}
        method="get"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5 text-sm sm:flex sm:flex-wrap sm:gap-2"
      >
        {Object.entries(extras).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="text-xs">
          <span className="mb-1 block font-medium">De</span>
          <input type="date" name="de" defaultValue={de} className="field data-compacta h-9 w-full min-w-0 px-1 py-0 text-[13px] sm:w-auto sm:px-2 sm:text-base" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Até</span>
          <input type="date" name="ate" defaultValue={ate} max={hoje} className="field data-compacta h-9 w-full min-w-0 px-1 py-0 text-[13px] sm:w-auto sm:px-2 sm:text-base" />
        </label>
        <button type="submit" className="btn-ghost h-9 px-2.5 sm:px-3.5">
          Ver
        </button>
        <span className="col-span-3 text-xs text-[var(--muted-foreground)] sm:pb-2">
          {diaCurto(de)} a {diaCurto(ate, true)} · {diasNoPeriodo(de, ate)} dias
        </span>
      </form>
      {children}
    </div>
  );
}
