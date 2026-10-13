import { prisma } from "../lib/db";
import { destinatarios } from "../lib/notificar";

/**
 * Quem recebe cada aviso, no banco: módulo, conta desligada, canal escolhido
 * e e-mail cadastrado. Cria três contas de teste e as apaga no fim. Só no
 * banco local: `source /var/tmp/pgrender/env.sh && npx tsx scripts/test-notificar.ts`.
 */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

const PREFIXO = "teste-notif-";
const aparelho = (n: string) => ({ endpoint: `https://push.exemplo/${PREFIXO}${n}`, p256dh: "p", auth: "a" });

async function limpar() {
  await prisma.adminUser.deleteMany({ where: { username: { startsWith: PREFIXO } } });
}

async function main() {
  await limpar();
  // Compras, com e-mail ligado só para atrasados e o celular desligado neles.
  await prisma.adminUser.create({
    data: {
      username: `${PREFIXO}compras`,
      passwordHash: "x",
      email: "compras@teste-notif.invalid",
      notificacoes: { "compras-atrasado": { email: true, celular: false } },
      permissions: { create: { moduleSlug: "compras" } },
      celulares: { create: aparelho("compras") },
    },
  });
  // Garçom: Reservas e Departamento pessoal, e-mail cadastrado mas no padrão (desligado).
  await prisma.adminUser.create({
    data: {
      username: `${PREFIXO}garcom`,
      passwordHash: "x",
      email: "garcom@teste-notif.invalid",
      permissions: { create: [{ moduleSlug: "comercial" }, { moduleSlug: "pessoal" }] },
      celulares: { create: aparelho("garcom") },
    },
  });
  // Conta desligada: nunca recebe.
  await prisma.adminUser.create({
    data: {
      username: `${PREFIXO}desligado`,
      passwordHash: "x",
      isActive: false,
      email: "fora@teste-notif.invalid",
      notificacoes: { "compras-atrasado": { email: true } },
      permissions: { create: { moduleSlug: "compras" } },
      celulares: { create: aparelho("desligado") },
    },
  });

  const meus = async (evento: Parameters<typeof destinatarios>[0]) => {
    const d = await destinatarios(evento);
    return {
      celular: d.aparelhos.map((a) => a.endpoint.split(PREFIXO)[1]).filter(Boolean).sort(),
      email: d.emails.filter((e) => e.endsWith("@teste-notif.invalid")).sort(),
    };
  };

  igual("fornecedor respondeu: só quem tem Compras, no celular", await meus("compras-fornecedor"), {
    celular: ["compras"],
    email: [],
  });
  igual("atrasados: e-mail ligado e celular desligado", await meus("compras-atrasado"), {
    celular: [],
    email: ["compras@teste-notif.invalid"],
  });
  igual("reserva nova: só o garçom, e-mail no padrão (desligado)", await meus("reserva-nova"), {
    celular: ["garcom"],
    email: [],
  });
  igual("cadastro novo: Departamento pessoal", await meus("pessoal-cadastro"), { celular: ["garcom"], email: [] });

  await limpar();
}

main()
  .catch(async (e) => {
    console.error(e);
    falhas++;
    await limpar().catch(() => {});
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (falhas > 0) {
      console.log(`\n${falhas} falha(s).`);
      process.exit(1);
    }
    console.log("\nTudo certo.");
  });
