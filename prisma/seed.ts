import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Configuração inicial do Canto Verde (Ivoti/RS), num banco zerado.
 *
 * Regras de reserva: antecedência de 2 meses / 2 horas, tolerância de 15 min,
 * grupos de 1 a 8, aprovação manual acima do limite automático.
 *
 * SERVIÇO INICIAL: almoço de sábado e domingo, assento único às 11:30.
 * É só o ponto de partida: lotação, dias e horários se ajustam no painel
 * (Comercial → Configurações) antes de divulgar o link.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL / DIRECT_URL não definidas.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Lotação do salão. Confirme com o restaurante antes de ir para produção. */
const TOTAL_CAPACITY = Number(process.env.SEED_TOTAL_CAPACITY ?? 100);

const RESTAURANT_NAME = process.env.SEED_RESTAURANT_NAME ?? "Canto Verde";

/** 0 = domingo … 6 = sábado */
const WEEKLY_HOURS: Array<{
  dayOfWeek: number;
  shiftName: string;
  opensAt: string;
  closesAt: string;
}> = [];

// Assento único às 11:30, sábado e domingo. A janela é o serviço real do
// almoço (11:30–15:00); o horário único vem do intervalo entre horários
// (SLOT_INTERVAL_MINUTES), maior que a janela — assim só 11:30 é gerado.
//
// Modelado desta forma, e não com uma janela apertada, para que mudar a
// duração da mesa no painel nunca faça a grade sumir sem aviso.
for (const day of [0, 6]) {
  WEEKLY_HOURS.push({
    dayOfWeek: day,
    shiftName: "Almoço",
    opensAt: "11:30",
    closesAt: "15:00",
  });
}

async function main() {
  // --- Domínio 1: regras de reserva -----------------------------------------
  await prisma.reservationRules.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      isActive: true,
      selfService: true,
      maxAdvanceValue: 2,
      maxAdvanceUnit: "MONTHS",
      minAdvanceValue: 2,
      minAdvanceUnit: "HOURS",
      delayToleranceMinutes: 15,
      minPartySize: 1,
      maxPartySize: 8,
      autoApproveUpTo: 6,
      manualIfOverLimit: true,
      paymentRequired: false,
      waitlistEnabled: false,
    },
  });

  // --- Domínio 2: capacidade física -----------------------------------------
  await prisma.capacitySettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: RESTAURANT_NAME,
      timezone: "America/Sao_Paulo",
      totalCapacity: TOTAL_CAPACITY,
      defaultDurationMinutes: 90,
      bufferMinutes: 0,
      // Maior que a janela do almoço: garante um único horário de início
      // (11:30). Aumente a janela ou reduza este valor se um dia o
      // restaurante passar a ter mais de um assento.
      slotIntervalMinutes: 240,
      // Um horário por dia é o normal aqui — o alerta de "grade rala" só
      // deve disparar se a grade zerar.
      minSlotsWarningThreshold: 1,
    },
  });

  const existingHours = await prisma.businessHours.count();
  if (existingHours === 0) {
    await prisma.businessHours.createMany({ data: WEEKLY_HOURS });
  }

  // --- Domínio 3: notificação -----------------------------------------------
  await prisma.notificationSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      restaurantEmail:
        process.env.SEED_RESTAURANT_EMAIL ?? "cantoverdeivoti@gmail.com",
      notifyRestaurant: true,
      notifyCustomer: true,
      channel: "EMAIL_AUTO",
      sendReminderHours: 24,
    },
  });

  // --- Domínio 4: configuração da cotação -----------------------------------
  // Mensagem nula = a página do fornecedor usa o padrão do código. A migration
  // já cria esta linha; o upsert aqui cobre o banco novo que roda o seed antes.
  await prisma.cotacaoSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // --- Admin ----------------------------------------------------------------
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!password) {
    throw new Error(
      "ADMIN_INITIAL_PASSWORD não definida — necessária para criar o usuário do painel.",
    );
  }

  await prisma.adminUser.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash: await bcrypt.hash(password, 12) },
  });

  const slots = WEEKLY_HOURS.length;
  console.log(`
Configuração inicial criada.

  Restaurante ....... ${RESTAURANT_NAME}
  Lotação ........... ${TOTAL_CAPACITY} lugares
  Turnos cadastrados  ${slots} (almoço com assento único às 11:30, todos os dias)
  Admin ............. ${username}

  CONFIRME COM O RESTAURANTE antes do deploy:
    - a lotação real do salão (hoje: ${TOTAL_CAPACITY})
    - os horários de cada dia da semana
  Ambos são editáveis em /admin/configuracoes/capacidade.
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
