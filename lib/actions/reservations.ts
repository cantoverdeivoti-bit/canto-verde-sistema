"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  OCCUPYING_STATUSES,
  checkAvailability,
  getDayWindows,
  getSeatingTimes,
  getSettings,
  toDateOnly,
  toInstant,
  type Settings,
} from "@/lib/availability";
import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { avisarEquipeDaReserva, notifyNewReservation } from "@/lib/notify";
import { normalizePhone, reservationInputSchema } from "@/lib/validations";
import type { ReservationStatus } from "@/generated/prisma/client";

export type CreateReservationResult =
  | { ok: true; reservationId: string; status: ReservationStatus }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Criação de reserva — o único caminho que grava no salão.
 *
 * As validações que não competem entre si (horário, antecedência, tamanho do
 * grupo) rodam antes. A checagem de CAPACIDADE roda de novo dentro de uma
 * transação com `pg_advisory_xact_lock`, porque é a única que pode ser
 * invalidada por outro cliente reservando no mesmo instante.
 *
 * O lock é por data de serviço: dois pedidos para o mesmo dia são serializados;
 * pedidos para dias diferentes seguem em paralelo.
 */
export async function createReservation(
  raw: unknown,
): Promise<CreateReservationResult> {
  const parsed = reservationInputSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, message: "Confira os dados do formulário.", fieldErrors };
  }

  const input = parsed.data;

  // O telefone já passou pelo refine do schema, então a normalização não falha.
  const phone = normalizePhone(input.customerPhone);
  if (!phone) {
    return {
      ok: false,
      message: "Confira os dados do formulário.",
      fieldErrors: { customerPhone: "Telefone inválido" },
    };
  }

  const settings = await getSettings();
  const check = await checkAvailability(
    { date: input.date, time: input.time, partySize: input.partySize },
    settings,
  );

  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  const day = await getDayWindows(input.date, settings.capacity);
  const status: ReservationStatus = check.needsManualApproval
    ? "PENDING"
    : "CONFIRMED";

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // Serializa as tentativas concorrentes para esta data. Como a capacidade
      // é uma soma e não uma linha, não há registro para travar com FOR UPDATE.
      // $executeRaw, não $queryRaw: a função retorna `void`, que o driver
      // adapter não consegue desserializar como resultado de consulta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.date}))`;

      // Duplicada: o mesmo telefone com reserva ativa sobreposta.
      //
      // Esta é a porta pública, e só ela. O balcão, que pode duplicar de
      // propósito, entra por createAdminReservation — que tem guarda. Antes
      // isto dependia de um `options.fromAdmin` recebido do cliente: como
      // ação de servidor é endpoint HTTP, qualquer um podia enviá-lo e pular
      // a checagem.
      const duplicate = await tx.reservation.findFirst({
        where: {
          customerPhone: phone,
          status: { in: [...OCCUPYING_STATUSES] },
          startTime: { lt: check.endTime },
          endTime: { gt: check.startTime },
        },
        select: { id: true },
      });
      if (duplicate) throw new DuplicateError();

      const agg = await tx.reservation.aggregate({
        _sum: { partySize: true },
        where: {
          status: { in: [...OCCUPYING_STATUSES] },
          startTime: { lt: check.endTime },
          endTime: { gt: check.startTime },
        },
      });

      const occupied = agg._sum.partySize ?? 0;

      if (day.capacity - occupied < input.partySize) {
        throw new CapacityError(day.capacity - occupied);
      }

      return tx.reservation.create({
        data: {
          customerName: input.customerName,
          customerPhone: phone,
          customerEmail: input.customerEmail || null,
          partySize: input.partySize,
          serviceDate: toDateOnly(input.date),
          startTime: check.startTime,
          endTime: check.endTime,
          durationMinutes: check.durationMinutes,
          status,
          notes: input.notes || null,
          source: "PUBLIC",
        },
      });
    });

    // Fora da transação, e com try/catch próprio: um erro de e-mail não pode
    // desfazer uma reserva já gravada.
    await notifyNewReservation(
      reservation,
      settings.capacity.timezone,
      settings.capacity.name,
    );
    // A equipe, no celular e no e-mail de quem escolheu: depois da resposta,
    // para o cliente não esperar o envio.
    after(() => avisarEquipeDaReserva("reserva-nova", reservation, settings.capacity.timezone));

    revalidatePath("/admin/comercial");

    return { ok: true, reservationId: reservation.id, status: reservation.status };
  } catch (error) {
    if (error instanceof CapacityError) {
      return {
        ok: false,
        message:
          error.remaining > 0
            ? `Alguém reservou enquanto você preenchia. Restam ${error.remaining} lugar(es) neste horário.`
            : "Alguém reservou este horário enquanto você preenchia. Escolha outro horário.",
      };
    }

    if (error instanceof DuplicateError) {
      return {
        ok: false,
        message:
          "Você já tem uma reserva nesse horário. Para mudar, cancele a anterior pelo link da confirmação ou ligue para o restaurante.",
      };
    }

    console.error("[createReservation] falha:", error);
    return {
      ok: false,
      message: "Não conseguimos registrar a reserva. Tente novamente.",
    };
  }
}

class CapacityError extends Error {
  constructor(readonly remaining: number) {
    super("Sem capacidade");
    this.name = "CapacityError";
  }
}

class DuplicateError extends Error {
  constructor() {
    super("Reserva duplicada");
    this.name = "DuplicateError";
  }
}

/**
 * A hora deriva do dia — regra confirmada com o dono: o serviço é assento
 * único (11:30), e formulário nenhum digita hora. Dia fechado → erro que
 * aponta para a tela de Capacidade; mais de um horário (futuro) → o chamador
 * precisa mandar um `time` que pertença à lista.
 */
async function resolveSeatingTime(
  date: string,
  requested: string | undefined,
  settings: Settings,
): Promise<{ ok: true; time: string } | { ok: false; message: string }> {
  const times = await getSeatingTimes(date, settings);

  if (times.length === 0) {
    return {
      ok: false,
      message:
        "Esse dia está fechado. Se for atender, abra-o em Configurações de reservas (horários da semana ou data especial).",
    };
  }
  if (times.length === 1) return { ok: true, time: times[0] };

  if (requested && times.includes(requested)) {
    return { ok: true, time: requested };
  }
  return {
    ok: false,
    message: `Esse dia tem mais de um horário de serviço (${times.join(", ")}): escolha um deles.`,
  };
}

// ---------------------------------------------------------------------------
// Edição pelo painel
// ---------------------------------------------------------------------------

export type UpdateDetailsInput = {
  partySize: number;
  date: string;
  /** Só usado se o dia tiver MAIS de um horário de serviço (hoje não tem). */
  time?: string;
  notes?: string;
};

export type UpdateDetailsResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * "Somos 4, não 2" / "dá pra mudar pra 20h?" — sem cancelar e refazer.
 *
 * Regras de balcão (quem atende decide): sem antecedência, horário de
 * funcionamento ou teto de grupo. O que não se negocia: capacidade — a soma
 * de ocupação do intervalo destino, EXCLUINDO esta própria reserva, tem que
 * comportar o novo tamanho. `durationMinutes` original é preservado: o
 * snapshot conta a história de quando a reserva foi feita.
 */
export async function updateReservationDetails(
  id: string,
  raw: UpdateDetailsInput,
): Promise<UpdateDetailsResult> {
  await requireModule("comercial");

  const partySize = Math.floor(Number(raw.partySize));
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 200) {
    return { ok: false, message: "Número de pessoas inválido." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    return { ok: false, message: "Data inválida." };
  }

  const settings = await getSettings();
  const { capacity } = settings;

  const current = await prisma.reservation.findUnique({ where: { id } });
  if (!current) return { ok: false, message: "Reserva não encontrada." };
  if (current.status !== "CONFIRMED" && current.status !== "PENDING") {
    return { ok: false, message: "Só reservas ativas podem ser editadas." };
  }

  const seating = await resolveSeatingTime(raw.date, raw.time, settings);
  if (!seating.ok) return { ok: false, message: seating.message };

  const start = toInstant(raw.date, seating.time, capacity.timezone);
  if (start <= new Date()) {
    return { ok: false, message: "Esse horário já passou." };
  }
  const end = new Date(
    start.getTime() +
      (current.durationMinutes + capacity.bufferMinutes) * 60_000,
  );

  const day = await getDayWindows(raw.date, capacity);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${raw.date}))`;

      const agg = await tx.reservation.aggregate({
        _sum: { partySize: true },
        where: {
          id: { not: id }, // a própria reserva não disputa lugar consigo
          status: { in: [...OCCUPYING_STATUSES] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      const remaining = day.capacity - (agg._sum.partySize ?? 0);
      if (remaining < partySize) throw new CapacityError(remaining);

      await tx.reservation.update({
        where: { id },
        data: {
          partySize,
          serviceDate: toDateOnly(raw.date),
          startTime: start,
          endTime: end,
          notes: raw.notes?.trim() || null,
        },
      });
    });

    revalidatePath("/admin/comercial");
    return { ok: true };
  } catch (error) {
    if (error instanceof CapacityError) {
      return {
        ok: false,
        message:
          error.remaining > 0
            ? `Não cabe: restam ${error.remaining} lugar(es) nesse horário.`
            : "Esse horário está lotado.",
      };
    }
    console.error("[updateReservationDetails] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Cancelamento pelo cliente (link com token)
// ---------------------------------------------------------------------------

export type CancelByTokenResult =
  | { ok: true; alreadyCancelled: boolean }
  | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" | "NOT_CANCELLABLE" };

/**
 * Cancela pela posse do token — sem login. O token só circula na página de
 * confirmação e no e-mail do próprio cliente.
 *
 * Regra de corte: até o horário da reserva. Depois disso a mesa já está
 * separada e o desfecho (chegou / não veio) é decisão do salão, não do link.
 */
export async function cancelByToken(
  token: string,
): Promise<CancelByTokenResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { cancelToken: token },
  });

  if (!reservation) return { ok: false, reason: "NOT_FOUND" };
  if (reservation.status === "CANCELLED")
    return { ok: true, alreadyCancelled: true };
  if (reservation.status !== "CONFIRMED" && reservation.status !== "PENDING")
    return { ok: false, reason: "NOT_CANCELLABLE" };
  if (new Date() >= reservation.startTime)
    return { ok: false, reason: "TOO_LATE" };

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: "CANCELLED" },
  });

  after(async () => {
    const { capacity } = await getSettings();
    await avisarEquipeDaReserva("reserva-cancelada", reservation, capacity.timezone);
  });
  revalidatePath("/admin/comercial");
  return { ok: true, alreadyCancelled: false };
}

// ---------------------------------------------------------------------------
// Criação pelo painel
// ---------------------------------------------------------------------------

export type AdminCreateInput = {
  customerName: string;
  customerPhone: string;
  partySize: number;
  date: string;
  /** Só usado se o dia tiver MAIS de um horário de serviço (hoje não tem). */
  time?: string;
  notes?: string;
};

/**
 * Reserva registrada pelo balcão — o telefone tocou.
 *
 * As regras da página pública protegem o salão de desconhecidos; quem atende
 * o telefone É o salão. Portanto: sem antecedência mínima, sem teto de grupo,
 * sem exigir horário de funcionamento (o dono pode abrir exceção). A única
 * regra que permanece inegociável é a CAPACIDADE — o lock e a soma são os
 * mesmos da criação pública, porque overbooking não tem exceção.
 */
export async function createAdminReservation(
  raw: AdminCreateInput,
): Promise<CreateReservationResult> {
  await requireModule("comercial");

  const name = raw.customerName?.trim();
  if (!name || name.length < 2) {
    return {
      ok: false,
      message: "Confira os dados.",
      fieldErrors: { customerName: "Informe o nome" },
    };
  }

  const phone = normalizePhone(raw.customerPhone ?? "");
  if (!phone) {
    return {
      ok: false,
      message: "Confira os dados.",
      fieldErrors: { customerPhone: "Telefone inválido" },
    };
  }

  const partySize = Math.floor(Number(raw.partySize));
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 200) {
    return {
      ok: false,
      message: "Confira os dados.",
      fieldErrors: { partySize: "Número de pessoas inválido" },
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    return { ok: false, message: "Data inválida." };
  }

  const settings = await getSettings();
  const { capacity } = settings;

  const seating = await resolveSeatingTime(raw.date, raw.time, settings);
  if (!seating.ok) return { ok: false, message: seating.message };

  const start = toInstant(raw.date, seating.time, capacity.timezone);
  if (start <= new Date()) {
    return { ok: false, message: "Esse horário já passou." };
  }

  const end = new Date(
    start.getTime() +
      (capacity.defaultDurationMinutes + capacity.bufferMinutes) * 60_000,
  );
  const day = await getDayWindows(raw.date, capacity);

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${raw.date}))`;

      const agg = await tx.reservation.aggregate({
        _sum: { partySize: true },
        where: {
          status: { in: [...OCCUPYING_STATUSES] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      const remaining = day.capacity - (agg._sum.partySize ?? 0);
      if (remaining < partySize) throw new CapacityError(remaining);

      return tx.reservation.create({
        data: {
          customerName: name,
          customerPhone: phone,
          partySize,
          serviceDate: toDateOnly(raw.date),
          startTime: start,
          endTime: end,
          durationMinutes: capacity.defaultDurationMinutes,
          status: "CONFIRMED",
          notes: raw.notes?.trim() || null,
          source: "ADMIN",
        },
      });
    });

    revalidatePath("/admin/comercial");
    return { ok: true, reservationId: reservation.id, status: reservation.status };
  } catch (error) {
    if (error instanceof CapacityError) {
      return {
        ok: false,
        message:
          error.remaining > 0
            ? `Não cabe: restam ${error.remaining} lugar(es) nesse horário.`
            : "Esse horário está lotado.",
      };
    }
    console.error("[createAdminReservation] falha:", error);
    return { ok: false, message: "Não foi possível registrar. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Ações do painel
// ---------------------------------------------------------------------------

export async function updateReservationStatus(
  id: string,
  status: ReservationStatus,
): Promise<{ ok: boolean; message?: string }> {
  await requireModule("comercial");

  const occupying = (s: ReservationStatus) =>
    (OCCUPYING_STATUSES as readonly string[]).includes(s);

  try {
    const current = await prisma.reservation.findUnique({ where: { id } });
    if (!current) return { ok: false, message: "Reserva não encontrada." };

    // Reativar uma reserva cancelada devolve pessoas ao salão — o lugar pode
    // já ter sido tomado nesse meio-tempo. Aprovar uma PENDING não passa por
    // aqui: pendente já ocupava capacidade desde a criação.
    if (occupying(status) && !occupying(current.status)) {
      const day = await getDayWindows(
        current.serviceDate.toISOString().slice(0, 10),
        (await getSettings()).capacity,
      );

      const agg = await prisma.reservation.aggregate({
        _sum: { partySize: true },
        where: {
          id: { not: id },
          status: { in: [...OCCUPYING_STATUSES] },
          startTime: { lt: current.endTime },
          endTime: { gt: current.startTime },
        },
      });

      const remaining = day.capacity - (agg._sum.partySize ?? 0);
      if (remaining < current.partySize) {
        return {
          ok: false,
          message: `Não há mais espaço neste horário (${remaining} lugar(es) livre(s), a reserva precisa de ${current.partySize}).`,
        };
      }
    }

    await prisma.reservation.update({ where: { id }, data: { status } });
    revalidatePath("/admin/comercial");
    return { ok: true };
  } catch (error) {
    console.error("[updateReservationStatus] falha:", error);
    return { ok: false, message: "Não foi possível atualizar a reserva." };
  }
}
