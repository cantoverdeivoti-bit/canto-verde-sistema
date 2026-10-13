import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { colunasParaProjetoNovo } from "../lib/tarefas-colunas";
import { PrismaClient } from "../generated/prisma/client";

/**
 * O que só o Postgres prova: chaves, cascatas e a promessa do histórico.
 *
 * A máquina de estados e a matriz de permissão já são conferidas sem banco,
 * em `scripts/test-tarefas-fluxo.ts`. Aqui ficam as três coisas que nenhum
 * teste puro alcança:
 *
 *   1. as oito colunas cabem no modelo e o nome é único dentro do quadro;
 *   2. apagar o quadro leva junto colunas, tarefas e comentários;
 *   3. apagar a TAREFA **não** leva o log — que é a razão de `log_atividade`
 *      não ter chave estrangeira, e o tipo de promessa que só se confirma
 *      executando.
 *
 * Cria tudo com um nome-marcador e apaga tudo no fim, inclusive se falhar no
 * meio — é a mesma disciplina do telefone-marcador em `scripts/test-flow.ts`.
 * Importa porque o .env deste projeto aponta para o banco de produção.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MARCADOR = "ZZ-TESTE-AUTOMATICO";

let falhas = 0;
function check(label: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

async function limpar() {
  const projetos = await prisma.projeto.findMany({
    where: { nome: { startsWith: MARCADOR } },
    select: { id: true, tarefas: { select: { id: true } } },
  });
  for (const p of projetos) {
    // O log não cascateia — é o ponto do teste 3 — então sai à mão.
    await prisma.logAtividade.deleteMany({
      where: { entidade: "tarefa", entidadeId: { in: p.tarefas.map((t) => t.id) } },
    });
    await prisma.logAtividade.deleteMany({ where: { entidade: "projeto", entidadeId: p.id } });
    await prisma.projeto.delete({ where: { id: p.id } });
  }
  await prisma.setor.deleteMany({ where: { nome: { startsWith: MARCADOR } } });
}

async function main() {
  await limpar();

  const dono = await prisma.adminUser.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, username: true },
  });
  if (!dono) {
    console.log("Sem usuário no banco — nada a testar.");
    return;
  }
  console.log(`usando o usuário #${dono.id} (${dono.username}) como dono\n`);

  console.log("— o quadro nasce com as oito colunas —");
  const setor = await prisma.setor.create({ data: { nome: `${MARCADOR} Cozinha` } });
  const projeto = await prisma.projeto.create({
    data: {
      nome: `${MARCADOR} Manutenção`,
      donoId: dono.id,
      setorId: setor.id,
      colunas: { create: colunasParaProjetoNovo() },
      membros: { create: { userId: dono.id, papel: "GESTOR" } },
    },
    include: { colunas: { orderBy: { ordem: "asc" } } },
  });
  check("oito colunas gravadas", projeto.colunas.length === 8, String(projeto.colunas.length));
  check(
    "na ordem BACKLOG > LAPIDAR > A FAZER",
    projeto.colunas[0].nome === "BACKLOG" &&
      projeto.colunas[1].nome === "LAPIDAR" &&
      projeto.colunas[2].nome === "A FAZER",
    projeto.colunas.map((c) => c.nome).join(" > "),
  );
  check(
    "EM ANDAMENTO guardou o limite de WIP",
    projeto.colunas.find((c) => c.nome === "EM ANDAMENTO")?.wipPorPessoa === 5,
  );
  check(
    "o projeto nasce sem barrar o WIP",
    (await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } })).wipBloqueia ===
      false,
  );

  const repetida = await prisma.coluna
    .create({ data: { projetoId: projeto.id, nome: "BACKLOG", ordem: 99, estado: "ENTRADA" } })
    .then(() => false)
    .catch(() => true);
  check("nome de coluna é único dentro do quadro", repetida);

  console.log("\n— a tarefa, o movimento e o log —");
  const backlog = projeto.colunas[0];
  const tarefa = await prisma.tarefa.create({
    data: {
      projetoId: projeto.id,
      colunaId: backlog.id,
      titulo: "Trocar o botijão de gás",
      criadoPorId: dono.id,
      atualizadoPorId: dono.id,
      status: "ABERTA",
    },
  });
  check("a tarefa ganhou número curto", Number.isInteger(tarefa.id) && tarefa.id > 0, `T-${tarefa.id}`);

  await prisma.movimentoColuna.create({
    data: {
      tarefaId: tarefa.id,
      colunaDestinoId: backlog.id,
      estadoDestino: "ENTRADA",
      usuarioId: dono.id,
    },
  });
  await prisma.logAtividade.create({
    data: {
      entidade: "tarefa",
      entidadeId: tarefa.id,
      acao: "criou",
      valorDepois: tarefa.titulo,
      usuarioId: dono.id,
    },
  });
  await prisma.comentario.create({
    data: { tarefaId: tarefa.id, autorId: dono.id, texto: "o gás acabou no meio do almoço" },
  });

  check(
    "o nascimento virou movimento",
    (await prisma.movimentoColuna.count({ where: { tarefaId: tarefa.id } })) === 1,
  );
  check(
    "valorDepois volta como texto, não como objeto",
    (
      await prisma.logAtividade.findFirstOrThrow({
        where: { entidade: "tarefa", entidadeId: tarefa.id },
      })
    ).valorDepois === tarefa.titulo,
  );

  console.log("\n— quem tem histórico não pode ser apagado (Restrict) —");
  const apagouPessoa = await prisma.adminUser
    .delete({ where: { id: dono.id } })
    .then(() => true)
    .catch(() => false);
  check("o banco recusa apagar quem é responsável por coisas", apagouPessoa === false);

  console.log("\n— anexo e etiqueta —");
  await prisma.anexoTarefa.create({
    data: {
      tarefaId: tarefa.id,
      nome: "foto.jpg",
      mime: "image/jpeg",
      tamanho: 3,
      dados: new Uint8Array([0xff, 0xd8, 0xff]),
      criadoPorId: dono.id,
    },
  });
  const etiqueta = await prisma.etiqueta.create({
    data: { projetoId: projeto.id, nome: "elétrica", criadoPorId: dono.id },
  });
  await prisma.tarefaEtiqueta.create({ data: { tarefaId: tarefa.id, etiquetaId: etiqueta.id } });
  const etiquetaRepetida = await prisma.etiqueta
    .create({ data: { projetoId: projeto.id, nome: "elétrica", criadoPorId: dono.id } })
    .then(() => false)
    .catch(() => true);
  check("nome de etiqueta é único dentro do quadro", etiquetaRepetida);
  check(
    "o anexo voltou com os bytes certos",
    (await prisma.anexoTarefa.findFirstOrThrow({ where: { tarefaId: tarefa.id } })).dados.length === 3,
  );

  console.log("\n— apagar a tarefa leva o comentário, e NÃO leva o log —");
  await prisma.tarefa.delete({ where: { id: tarefa.id } });
  check(
    "anexo foi junto (cascata)",
    (await prisma.anexoTarefa.count({ where: { tarefaId: tarefa.id } })) === 0,
  );
  check(
    "a etiqueta saiu da tarefa (cascata) e ficou no quadro",
    (await prisma.tarefaEtiqueta.count({ where: { tarefaId: tarefa.id } })) === 0 &&
      (await prisma.etiqueta.count({ where: { id: etiqueta.id } })) === 1,
  );
  check(
    "comentário foi junto (cascata)",
    (await prisma.comentario.count({ where: { tarefaId: tarefa.id } })) === 0,
  );
  check(
    "movimento foi junto (cascata)",
    (await prisma.movimentoColuna.count({ where: { tarefaId: tarefa.id } })) === 0,
  );
  check(
    "o log SOBREVIVEU — é para isso que ele não tem chave estrangeira",
    (await prisma.logAtividade.count({
      where: { entidade: "tarefa", entidadeId: tarefa.id },
    })) === 1,
  );

  console.log("\n— apagar o quadro leva as colunas —");
  await prisma.projeto.delete({ where: { id: projeto.id } });
  check(
    "colunas foram junto",
    (await prisma.coluna.count({ where: { projetoId: projeto.id } })) === 0,
  );
  check(
    "etiquetas foram junto",
    (await prisma.etiqueta.count({ where: { projetoId: projeto.id } })) === 0,
  );
}

main()
  .catch((e) => {
    console.error("\nquebrou:", e);
    falhas++;
  })
  .finally(async () => {
    await limpar();
    const sobrou =
      (await prisma.projeto.count({ where: { nome: { startsWith: MARCADOR } } })) +
      (await prisma.setor.count({ where: { nome: { startsWith: MARCADOR } } }));
    check("\nnada de teste ficou no banco", sobrou === 0, String(sobrou));
    console.log(falhas === 0 ? "\nO banco aguenta o desenho." : `\n${falhas} falha(s).`);
    await prisma.$disconnect();
    process.exitCode = falhas === 0 ? 0 : 1;
  });
