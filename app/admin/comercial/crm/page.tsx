import { MessageCircle, Phone, Search } from "lucide-react";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSettings, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDiaCurtoString, formatPhone, PARTY_LABEL, plural } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Reservas" };

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];


/**
 * A agenda de contatos da casa, tirada das próprias reservas.
 *
 * Não conta visitas nem faltas: a casa não registra quem sentou, então
 * qualquer número aqui seria chute com cara de dado. O que a lista responde é
 * o que ela sabe — quem são as pessoas, como se fala com elas, e quem tem
 * mesa marcada para os próximos dias.
 *
 * Não existe cadastro de cliente: a pessoa é o telefone, que é o único dado
 * que o sistema exige e normaliza. Duas reservas com o mesmo número são a
 * mesma pessoa mesmo que o nome venha escrito diferente — e vem: "Jonathan
 * schmidt" e "jonathan schmidt" são o mesmo cliente. Vale o nome da reserva
 * mais recente, que é como a pessoa se apresentou por último.
 *
 * Sem tabela nova de propósito. Tudo aqui é derivado; nada precisa ser
 * mantido em dia por ninguém, e não há um segundo lugar onde o nome do
 * cliente possa ficar desatualizado.
 */
export default async function CustomersPage({
  searchParams,
}: PageProps<"/admin/comercial/crm">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const { capacity } = await getSettings();

  const today = todayInTimezone(capacity.timezone);

  // Quatro consultas, todas limitadas ao número de clientes, e não ao de
  // reservas: a mais recente de cada telefone (nome e WhatsApp), a próxima
  // mesa marcada, e duas contagens por telefone para o histórico.
  const [latest, proximas, historico, canceladas] = await Promise.all([
    prisma.reservation.findMany({
      distinct: ["customerPhone"],
      orderBy: { startTime: "desc" },
      select: {
        customerPhone: true,
        customerName: true,
        partySize: true,
        startTime: true,
        serviceDate: true,
        status: true,
      },
    }),
    // Ordem ascendente, ao contrário da consulta acima: com `distinct`, o
    // banco guarda a PRIMEIRA linha de cada telefone, que aqui precisa ser a
    // reserva mais próxima, não a mais distante.
    prisma.reservation.findMany({
      where: {
        serviceDate: { gte: toDateOnly(today) },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      distinct: ["customerPhone"],
      orderBy: { startTime: "asc" },
      select: { customerPhone: true, serviceDate: true, partySize: true },
    }),
    /* Quantas reservas cada um fez e desde quando. Reserva feita é fato;
       "visita" não seria, porque a casa não registra quem sentou. */
    prisma.reservation.groupBy({
      by: ["customerPhone"],
      _count: { _all: true },
      _min: { serviceDate: true },
    }),
    prisma.reservation.groupBy({
      by: ["customerPhone"],
      where: { status: "CANCELLED" },
      _count: { _all: true },
    }),
  ]);

  type Customer = {
    phone: string;
    name: string;
    /** A próxima mesa marcada desta pessoa, se houver alguma. */
    proxima: { date: string; partySize: number } | null;
    wa: string | null;
    reservas: number;
    /** "set/26": o mês da primeira reserva. */
    desde: string | null;
    canceladas: number;
  };

  const proximaPorTelefone = new Map(
    proximas.map((p) => [
      p.customerPhone,
      { date: p.serviceDate.toISOString().slice(0, 10), partySize: p.partySize },
    ]),
  );
  const historicoPorTelefone = new Map(historico.map((h) => [h.customerPhone, h]));
  const canceladasPorTelefone = new Map(canceladas.map((c) => [c.customerPhone, c._count._all]));

  const byPhone = new Map<string, Customer>();
  for (const row of latest) {
    const h = historicoPorTelefone.get(row.customerPhone);
    const primeira = h?._min.serviceDate ?? null;
    byPhone.set(row.customerPhone, {
      phone: row.customerPhone,
      name: row.customerName,
      proxima: proximaPorTelefone.get(row.customerPhone) ?? null,
      wa: whatsappLink(row, {
        timezone: capacity.timezone,
        restaurantName: capacity.name,
      }),
      reservas: h?._count._all ?? 1,
      desde: primeira ? `${MES_CURTO[primeira.getUTCMonth()]}/${String(primeira.getUTCFullYear()).slice(2)}` : null,
      canceladas: canceladasPorTelefone.get(row.customerPhone) ?? 0,
    });
  }

  const needle = query.toLowerCase();
  const digits = query.replace(/\D/g, "");
  const customers = [...byPhone.values()].filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(needle) ||
      (digits.length > 0 && c.phone.includes(digits)),
  );
  // Quem tem mesa marcada vem primeiro, do mais próximo ao mais distante; o
  // resto em ordem alfabética, que é como se procura um nome numa lista.
  const comMesa = customers
    .filter((c) => c.proxima)
    .sort((a, b) => a.proxima!.date.localeCompare(b.proxima!.date));
  const todos = [...customers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const cartao = (c: Customer, destaque: boolean) => (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{c.name}</p>
        {destaque && c.proxima ? (
          <p className="text-sm font-semibold text-[var(--primary)]">
            {/* "dom, 04/10 · 4 pessoas": o dia da semana em três letras, para caber numa linha. */}
            {formatDiaCurtoString(c.proxima.date).replace(/^(\p{L}{3})[^,]*/u, "$1")} · {PARTY_LABEL(c.proxima.partySize)}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            <a href={`tel:${c.phone}`} className="tabular-nums hover:underline">
              {formatPhone(c.phone)}
            </a>
            {!c.wa && (
              <span className="ml-2 text-xs font-semibold" style={{ color: "var(--warn)" }}>
                telefone incompleto
              </span>
            )}
          </p>
        )}
        {/* O histórico, só com o que a casa sabe de verdade. */}
        <p className="text-xs text-[var(--muted-foreground)]">
          {plural(c.reservas, "reserva", "reservas")}
          {c.desde && ` · desde ${c.desde}`}
          {c.canceladas > 0 && (
            <span style={{ color: "var(--warn)" }}> · {plural(c.canceladas, "cancelada", "canceladas")}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {c.wa && (
          <a
            href={c.wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir conversa com ${c.name} no WhatsApp (nova aba)`}
            title="WhatsApp"
            className="flex size-9 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-strong)] hover:opacity-80"
          >
            <MessageCircle aria-hidden className="size-5" />
          </a>
        )}
        <a
          href={`tel:${c.phone}`}
          aria-label={`Ligar para ${c.name}`}
          title="Ligar"
          className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <Phone aria-hidden className="size-[18px]" />
        </a>
      </div>
    </div>
  );

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina titulo="CRM" />

      {/* A busca numa linha só: a lupa no campo e o botão do lado. */}
      <form method="get" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          />
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Nome ou telefone"
            className="w-full pl-9"
            aria-label="Buscar cliente por nome ou telefone"
          />
        </div>
        <Button type="submit" className="h-11 shrink-0">
          Buscar
        </Button>
      </form>
      {query && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {plural(customers.length, "cliente")} para “{query}”.{" "}
          <a href="/admin/comercial/crm" className="text-[var(--primary)] underline-offset-4 hover:underline">
            Limpar
          </a>
        </p>
      )}

      {customers.length === 0 ? (
        <Vazio>
          {query
            ? "Ninguém com esse nome ou telefone. Tente só o começo do nome."
            : "Nenhuma reserva ainda. A lista se enche sozinha conforme as pessoas reservam."}
        </Vazio>
      ) : (
        <>
          {comMesa.length > 0 && (
            <section>
              <h2 className="section-label mb-2">Com mesa marcada · {comMesa.length}</h2>
              <ul className="space-y-2">
                {comMesa.map((c) => (
                  <li key={c.phone} className="rounded-xl border border-[var(--primary)]/30 bg-[var(--card)] p-3">
                    {cartao(c, true)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="section-label mb-2">Todos os clientes · {todos.length}</h2>
            <Lista>
              {todos.map((c) => (
                <li key={c.phone} className="px-3 py-3">
                  {cartao(c, false)}
                </li>
              ))}
            </Lista>
          </section>
        </>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        O mesmo telefone é a mesma pessoa, mesmo com o nome escrito diferente. Vale o nome da reserva mais recente.
      </p>
    </Pagina>
  );
}
