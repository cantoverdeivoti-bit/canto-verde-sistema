"use client";

import {
  Calculator,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Scale,
  ShoppingBasket,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Aba = { href: string; nome: string; icone: LucideIcon };

/**
 * Dois blocos, cada um com o seu nome em cima: o que é compra (o painel, as
 * cotações, os pedidos, os preços, quem forneceu e o gasto por produto) e o
 * que é estoque (as contagens e o balanço, onde está o consumo de verdade). Os símbolos repetem os do menu onde a
 * tela é a mesma coisa (cotação, pedidos, fornecedores, contagem).
 */
const BLOCOS: { nome: string; abas: Aba[] }[] = [
  {
    nome: "Compras",
    abas: [
      { href: "/admin/compras/relatorios", nome: "Painel", icone: LayoutDashboard },
      { href: "/admin/compras/relatorios/orcamento", nome: "Orçamento", icone: Wallet },
      { href: "/admin/compras/relatorios/cotacoes", nome: "Cotações", icone: Scale },
      { href: "/admin/compras/relatorios/historico", nome: "Pedidos", icone: FileText },
      { href: "/admin/compras/relatorios/precos", nome: "Preços", icone: TrendingUp },
      { href: "/admin/compras/relatorios/fornecedores", nome: "Fornecedores", icone: Truck },
      { href: "/admin/compras/relatorios/consumo", nome: "Por produto", icone: ShoppingBasket },
    ],
  },
  {
    nome: "Estoque",
    abas: [
      { href: "/admin/compras/relatorios/estoque", nome: "Contagens", icone: ClipboardList },
      { href: "/admin/compras/relatorios/balanco", nome: "Balanço", icone: Calculator },
    ],
  },
];
const PAINEL = BLOCOS[0].abas[0].href;

/**
 * As abas levam o período junto: quem olhou o gasto de setembro e troca para
 * Por produto quer as compras de setembro, não as do mês corrente de novo.
 *
 * Cada aba tem símbolo e nome, e a aberta ganha fundo verde-claro e negrito,
 * e não só um sublinhado fino. No celular viram uma grade de quadradinhos,
 * todas à vista; no computador, dois blocos com o nome em cima.
 */
export function AbasDosRelatorios() {
  const pathname = usePathname();
  const params = useSearchParams();
  const de = params.get("de");
  const ate = params.get("ate");
  const periodo = de && ate ? `?de=${de}&ate=${ate}` : "";
  const ativa = (href: string) => (href === PAINEL ? pathname === href : pathname.startsWith(href));

  return (
    <nav aria-label="Relatórios">
      {/* Celular: as oito num cartão só, quatro por linha, símbolo em cima e
          nome embaixo, como os atalhos. Todas à vista, sem rolar de lado. */}
      <ul className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 sm:hidden">
        {BLOCOS.flatMap((b) => b.abas).map((a) => {
          const aberta = ativa(a.href);
          const Icone = a.icone;
          return (
            <li key={a.href}>
              <Link
                href={`${a.href}${periodo}`}
                aria-current={aberta ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[11px] leading-tight ${
                  aberta
                    ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/30"
                    : "font-medium text-[var(--foreground)]"
                }`}
              >
                <Icone aria-hidden className={`size-5 shrink-0 ${aberta ? "" : "text-[var(--primary)]"}`} />
                {a.nome}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Computador: os dois blocos com o nome em cima. Se não couberem lado
          a lado, o segundo desce de linha em vez de ficar cortado. */}
      <div className="hidden flex-wrap gap-x-5 gap-y-3 sm:flex">
        {BLOCOS.map((b) => (
          <div key={b.nome}>
            <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">
              {b.nome}
            </p>
            <ul className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
              {b.abas.map((a) => {
                const aberta = ativa(a.href);
                const Icone = a.icone;
                return (
                  <li key={a.href}>
                    <Link
                      href={`${a.href}${periodo}`}
                      aria-current={aberta ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition ${
                        aberta
                          ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/30"
                          : "font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                      }`}
                    >
                      <Icone aria-hidden className={`size-[18px] shrink-0 ${aberta ? "" : "text-[var(--primary)]"}`} />
                      {a.nome}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
