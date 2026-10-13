import {
  aniversariosNoPeriodo,
  diasDoPeriodo,
  diasNaSemana,
  gradeDoMes,
  mesAnterior,
  porDia,
  proximoMes,
  type ItemDaAgenda,
} from "../lib/agenda-regras";

/** As contas da Agenda, sem banco: o período, a grade do mês e as datas que voltam todo ano. */

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

igual("período inclusivo, virando o mês", diasDoPeriodo("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);

// Outubro de 2026 começa numa quinta e termina num sábado: a grade vai de seg 28/09 a dom 01/11.
const outubro = gradeDoMes("2026-10");
igual("grade de outubro: 5 semanas", outubro.length, 5);
igual("grade começa na segunda antes do dia 1", outubro[0][0], "2026-09-28");
igual("grade termina no domingo depois do dia 31", outubro[4][6], "2026-11-01");
// Fevereiro de 2027 começa numa segunda e tem 28 dias: exatamente 4 semanas.
igual("fevereiro que cabe em 4 semanas", gradeDoMes("2027-02").map((s) => s[0]), ["2027-02-01", "2027-02-08", "2027-02-15", "2027-02-22"]);

igual("mês seguinte em dezembro", proximoMes("2026-12"), "2027-01");
igual("mês anterior em janeiro", mesAnterior("2027-01"), "2026-12");

igual("aniversário no período, com os anos", aniversariosNoPeriodo("1990-10-12", "2026-10-01", "2026-10-31"), [{ data: "2026-10-12", anos: 36 }]);
igual("aniversário fora do período", aniversariosNoPeriodo("1990-11-12", "2026-10-01", "2026-10-31"), []);
igual("período que vira o ano", aniversariosNoPeriodo("2020-01-02", "2026-12-28", "2027-01-05"), [{ data: "2027-01-02", anos: 7 }]);
igual("29/02 vira 28/02 em ano comum", aniversariosNoPeriodo("2000-02-29", "2027-02-01", "2027-02-28"), [{ data: "2027-02-28", anos: 27 }]);
igual("29/02 em ano bissexto", aniversariosNoPeriodo("2000-02-29", "2028-02-01", "2028-02-29"), [{ data: "2028-02-29", anos: 28 }]);
igual("o próprio dia de começo não conta", aniversariosNoPeriodo("2026-10-05", "2026-10-01", "2026-10-31"), []);

// 0 = domingo, como ListaCompra.diaSemana. Quintas de outubro de 2026: 1, 8, 15, 22, 29.
igual("rotina toda quinta", diasNaSemana(4, "2026-10-01", "2026-10-31"), ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
igual("rotina de domingo", diasNaSemana(0, "2026-10-01", "2026-10-07"), ["2026-10-04"]);

const item = (o: Partial<ItemDaAgenda>): ItemDaAgenda => ({
  chave: o.titulo ?? "x",
  data: "2026-10-09",
  hora: null,
  assunto: "tarefas",
  titulo: "x",
  detalhe: null,
  href: "/",
  feito: false,
  atrasado: false,
  ...o,
});
const dia = porDia([
  item({ titulo: "Pagar luz", assunto: "financeiro" }),
  item({ titulo: "Evento 19h", assunto: "eventos", hora: "19:00" }),
  item({ titulo: "Evento 12h", assunto: "eventos", hora: "12:00" }),
  item({ titulo: "Comprar", assunto: "compras" }),
  item({ titulo: "Outro dia", data: "2026-10-10" }),
]);
igual(
  "no dia: com hora primeiro, depois pela ordem dos assuntos",
  dia.get("2026-10-09")!.map((i) => i.titulo),
  ["Evento 12h", "Evento 19h", "Comprar", "Pagar luz"],
);
igual("cada dia na sua lista", dia.get("2026-10-10")!.length, 1);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
