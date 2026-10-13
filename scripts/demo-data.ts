import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Dados de demonstração: uma semana verossímil de restaurante — ontem com
 * histórico fechado, hoje com atraso em curso, sábado lotando com pendentes,
 * domingo de almoço, semana seguinte esparsa, um feriado e um evento com
 * lotação reduzida. Rode quantas vezes quiser: limpa e recria.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TZ = "-03:00";

type Row = {
  date: string;
  time: string;
  name: string;
  phone: string;
  party: number;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  source?: "PUBLIC" | "ADMIN";
  notes?: string;
  email?: string;
};

const D = {
  yesterday: "2026-08-27",
  today: "2026-08-28",
  saturday: "2026-08-29",
  sunday: "2026-08-30",
  tue: "2026-09-01",
  wed: "2026-09-02",
  nextFri: "2026-09-04",
};

const ROWS: Row[] = [
  // --- ontem: dia encerrado, vira histórico -------------------------------
  { date: D.yesterday, time: "12:00", name: "Ana Beatriz Kunz", phone: "+5551991112233", party: 2, status: "COMPLETED" },
  { date: D.yesterday, time: "12:30", name: "Marcos Reali", phone: "+5551992223344", party: 4, status: "COMPLETED" },
  { date: D.yesterday, time: "19:30", name: "Otávio Griebeler", phone: "+5551993215476", party: 2, status: "NO_SHOW" },
  { date: D.yesterday, time: "20:00", name: "Helena Ritter", phone: "+5551994326587", party: 5, status: "COMPLETED", notes: "vinho da casa reservado" },
  { date: D.yesterday, time: "20:30", name: "Bruno Weissheimer", phone: "+5551995437698", party: 2, status: "CANCELLED" },

  // --- hoje (sexta, noite em curso) ---------------------------------------
  { date: D.today, time: "12:30", name: "Escritório Dreher", phone: "+5551996548709", party: 8, status: "COMPLETED", source: "ADMIN", notes: "almoço de fechamento de mês" },
  { date: D.today, time: "19:00", name: "Camila Endres", phone: "+5551997659810", party: 2, status: "COMPLETED" },
  { date: D.today, time: "20:30", name: "Rafael Sperb", phone: "+5551998760921", party: 4, status: "COMPLETED" },
  { date: D.today, time: "21:30", name: "Vitória Lammel", phone: "+5551999871032", party: 2, status: "CONFIRMED", notes: "pediu mesa mais reservada" }, // fica "atrasada" à noite
  { date: D.today, time: "21:30", name: "Pedro Anschau", phone: "+5551990982143", party: 3, status: "CONFIRMED" },

  // --- sábado: o dia cheio -------------------------------------------------
  { date: D.saturday, time: "11:30", name: "Família Wilborn", phone: "+5551991093254", party: 6, status: "CONFIRMED", notes: "aniversário da vó — levam bolo" },
  { date: D.saturday, time: "12:00", name: "Suzana Franzen", phone: "+5551992104365", party: 2, status: "CONFIRMED", email: "suzana.franzen@gmail.com" },
  { date: D.saturday, time: "12:00", name: "Léo Petersen", phone: "+5551993215476", party: 4, status: "CONFIRMED" },
  { date: D.saturday, time: "12:30", name: "Grupo da Pedalada", phone: "+5551994326587", party: 8, status: "PENDING", notes: "chegam de bike, perguntar do bicicletário" },
  { date: D.saturday, time: "13:00", name: "Iracema Scheffel", phone: "+5551995437698", party: 3, status: "CONFIRMED" },
  { date: D.saturday, time: "19:00", name: "Daniel Hoffstetter", phone: "+5551996548709", party: 2, status: "CONFIRMED", email: "dhoff@hotmail.com" },
  { date: D.saturday, time: "19:30", name: "Casal Petry", phone: "+5551997659810", party: 2, status: "CONFIRMED", source: "ADMIN", notes: "pediram a mesa da janela" },
  { date: D.saturday, time: "19:30", name: "Turma do Vôlei", phone: "+5551998760921", party: 7, status: "PENDING" },
  { date: D.saturday, time: "20:00", name: "Marina Cadó", phone: "+5551999871032", party: 4, status: "CONFIRMED", notes: "uma cadeira de bebê" },
  { date: D.saturday, time: "20:30", name: "Jorge Altenhofen", phone: "+5551990982143", party: 2, status: "CONFIRMED" },
  { date: D.saturday, time: "21:00", name: "Paula Baldasso", phone: "+5551991093254", party: 5, status: "CONFIRMED" },

  // --- domingo de almoço ---------------------------------------------------
  { date: D.sunday, time: "11:30", name: "Família Rückert", phone: "+5551992104365", party: 9, status: "CONFIRMED", source: "ADMIN", notes: "mesa comprida, autorizado pelo Zero" },
  { date: D.sunday, time: "12:30", name: "Cris e Amanda", phone: "+5551993215476", party: 2, status: "CONFIRMED" },
  { date: D.sunday, time: "13:00", name: "Nelson Feltes", phone: "+5551994326587", party: 4, status: "CONFIRMED" },

  // --- semana que vem ------------------------------------------------------
  { date: D.tue, time: "20:00", name: "Aline Spohr", phone: "+5551995437698", party: 2, status: "CONFIRMED", email: "alinespohr@gmail.com" },
  { date: D.wed, time: "12:00", name: "Sindicato Rural", phone: "+5551996548709", party: 12, status: "CONFIRMED", source: "ADMIN", notes: "reunião mensal — combinado direto com a cozinha" },
  { date: D.nextFri, time: "21:00", name: "Formandos IENH", phone: "+5551997659810", party: 8, status: "PENDING", notes: "confirmar cardápio fechado antes" },
];

async function main() {
  await prisma.reservation.deleteMany({});

  for (const r of ROWS) {
    const start = new Date(`${r.date}T${r.time}:00${TZ}`);
    await prisma.reservation.create({
      data: {
        customerName: r.name,
        customerPhone: r.phone,
        customerEmail: r.email ?? null,
        partySize: r.party,
        serviceDate: new Date(`${r.date}T00:00:00.000Z`),
        startTime: start,
        endTime: new Date(start.getTime() + 90 * 60_000),
        durationMinutes: 90,
        status: r.status,
        source: r.source ?? "PUBLIC",
        notes: r.notes ?? null,
      },
    });
  }

  // Datas especiais: feriado fechado e evento com lotação reduzida.
  await prisma.specialDate.deleteMany({});
  await prisma.specialDate.createMany({
    data: [
      {
        date: new Date("2026-09-07T00:00:00.000Z"),
        isClosed: true,
        note: "Independência — fechado",
      },
      {
        date: new Date("2026-09-20T00:00:00.000Z"),
        isClosed: false,
        opensAt: "19:00",
        closesAt: "22:00",
        capacityOverride: 16,
        note: "Jantar harmonizado — só reservas",
      },
    ],
  });

  console.log(`${ROWS.length} reservas + 2 datas especiais criadas.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
