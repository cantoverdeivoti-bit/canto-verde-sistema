import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Teste de integração da lógica de reservas, direto no banco.
 * Replica a transação de `createReservation` (lock + soma + insert) para
 * exercitar overbooking e corrida sem depender do runtime do Next.
 *
 * Roda contra o banco de dev e limpa tudo que criou (telefone-marcador).
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MARKER_PHONE = "+5551000000000";
const DATE = "2026-09-15"; // terça-feira — almoço e jantar abertos
const TZ_OFFSET = "-03:00"; // America/Sao_Paulo em setembro

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function instant(time: string): Date {
  return new Date(`${DATE}T${time}:00${TZ_OFFSET}`);
}

async function occupied(start: Date, end: Date): Promise<number> {
  const agg = await prisma.reservation.aggregate({
    _sum: { partySize: true },
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  return agg._sum.partySize ?? 0;
}

/** A mesma transação de createReservation: lock -> soma -> valida -> insert. */
async function tryCreate(
  partySize: number,
  time: string,
  capacity: number,
  status: "PENDING" | "CONFIRMED" = "CONFIRMED",
): Promise<{ ok: boolean; remaining?: number }> {
  const start = instant(time);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DATE}))`;

      const agg = await tx.reservation.aggregate({
        _sum: { partySize: true },
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      const occ = agg._sum.partySize ?? 0;
      if (capacity - occ < partySize) {
        throw new Error(`SEM_CAPACIDADE:${capacity - occ}`);
      }

      await tx.reservation.create({
        data: {
          customerName: `Teste ${partySize}p ${time}`,
          customerPhone: MARKER_PHONE,
          partySize,
          serviceDate: new Date(`${DATE}T00:00:00.000Z`),
          startTime: start,
          endTime: end,
          durationMinutes: 90,
          status,
          source: "ADMIN",
        },
      });
    });
    return { ok: true };
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("SEM_CAPACIDADE:")) {
      return { ok: false, remaining: Number(message.split(":")[1]) };
    }
    throw error;
  }
}

async function main() {
  const capacity = 40;

  // limpeza de execuções anteriores
  await prisma.reservation.deleteMany({ where: { customerPhone: MARKER_PHONE } });

  // --- 1. reserva simples -------------------------------------------------
  const r1 = await tryCreate(4, "19:00", capacity);
  check("reserva simples é aceita", r1.ok);

  // --- 2. ocupação sobreposta conta certo ---------------------------------
  // 19:00–20:30 ocupa o slot das 19:30 (overlap) mas não o das 21:00
  const occ1930 = await occupied(instant("19:30"), instant("21:00"));
  const occ2100 = await occupied(instant("21:00"), instant("22:30"));
  check("sobreposição parcial conta as 4 pessoas", occ1930 === 4, `viu ${occ1930}`);
  check("horário sem sobreposição vê 0", occ2100 === 0, `viu ${occ2100}`);

  // --- 3. encher até o limite → bloqueia ----------------------------------
  await tryCreate(30, "19:00", capacity); // 4 + 30 = 34
  const cheio = await tryCreate(8, "19:30", capacity); // precisaria 34+8=42 > 40
  check("overbooking bloqueado no limite", !cheio.ok, `restavam ${cheio.remaining}`);
  const cabe = await tryCreate(6, "19:30", capacity); // 34+6 = 40 exato
  check("cabe exatamente até a lotação", cabe.ok);

  // --- 4. corrida: 2 tentativas simultâneas no último lugar ---------------
  await prisma.reservation.deleteMany({ where: { customerPhone: MARKER_PHONE } });
  await tryCreate(38, "12:00", capacity); // restam 2

  const [a, b] = await Promise.all([
    tryCreate(2, "12:00", capacity),
    tryCreate(2, "12:30", capacity), // sobrepõe 12:00–13:30
  ]);
  const winners = [a, b].filter((r) => r.ok).length;
  check("corrida: só um dos dois consegue o último lugar", winners === 1, `${winners} venceram`);

  const total = await occupied(instant("12:00"), instant("14:00"));
  check("total nunca passa da lotação", total <= capacity, `total ${total}/${capacity}`);

  // --- 5. pendente também ocupa lugar -------------------------------------
  await prisma.reservation.deleteMany({ where: { customerPhone: MARKER_PHONE } });
  await tryCreate(7, "20:00", capacity, "PENDING");
  const occPending = await occupied(instant("20:00"), instant("21:30"));
  check("reserva PENDING ocupa capacidade", occPending === 7, `viu ${occPending}`);

  // --- 6. cancelamento libera o lugar -------------------------------------
  await prisma.reservation.updateMany({
    where: { customerPhone: MARKER_PHONE },
    data: { status: "CANCELLED" },
  });
  const occFree = await occupied(instant("20:00"), instant("21:30"));
  check("cancelar devolve a capacidade", occFree === 0, `viu ${occFree}`);

  // --- 7. duplicada: mesmo telefone, intervalo sobreposto ------------------
  await prisma.reservation.deleteMany({ where: { customerPhone: MARKER_PHONE } });
  await tryCreate(2, "20:00", capacity);
  const dup = await prisma.reservation.findFirst({
    where: {
      customerPhone: MARKER_PHONE,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: instant("21:00") },        // nova tentativa 20:30–22:00
      endTime: { gt: instant("20:30") },
    },
  });
  check("guarda de duplicada encontra a reserva ativa sobreposta", dup !== null);

  // --- 8. edição que estouraria a capacidade é bloqueada -------------------
  // Reserva própria de 2 + terceiros ocupando 37 => editar a própria para 4
  // exigiria 4 <= 40 - 37 = 3 → bloqueia. Editar para 3 → cabe.
  await prisma.reservation.create({
    data: {
      customerName: "Terceiros", customerPhone: "+5551000000099",
      partySize: 37, serviceDate: new Date(`${DATE}T00:00:00.000Z`),
      startTime: instant("20:00"), endTime: instant("21:30"),
      durationMinutes: 90, status: "CONFIRMED", source: "PUBLIC",
    },
  });
  const own = await prisma.reservation.findFirst({ where: { customerPhone: MARKER_PHONE } });
  async function editOccupied(excludeId: string): Promise<number> {
    const agg = await prisma.reservation.aggregate({
      _sum: { partySize: true },
      where: {
        id: { not: excludeId },
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { lt: instant("21:30") },
        endTime: { gt: instant("20:00") },
      },
    });
    return agg._sum.partySize ?? 0;
  }
  const othersOcc = await editOccupied(own!.id);
  check(
    "edição exclui a própria reserva da soma",
    othersOcc === 37 && capacity - othersOcc < 4 && capacity - othersOcc >= 3,
    `terceiros ocupam ${othersOcc}: editar para 4 bloqueia, para 3 cabe`,
  );
  await prisma.reservation.deleteMany({ where: { customerPhone: "+5551000000099" } });

  // limpeza final
  await prisma.reservation.deleteMany({ where: { customerPhone: MARKER_PHONE } });

  console.log(failures === 0 ? "\nTodos os testes passaram." : `\n${failures} falha(s).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
