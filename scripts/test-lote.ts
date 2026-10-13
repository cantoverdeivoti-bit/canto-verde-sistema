import {
  arredondarAoLote,
  faltaParaOLote,
  lotesDe,
  serveNoLote,
} from "../lib/lote";

/**
 * O lote de compra, sem tocar no banco.
 *
 * `lib/lote.ts` é puro de propósito, então o teste dele também é: roda em
 * meio segundo, sem servidor e sem Postgres, e por isso dá para rodar antes de
 * qualquer tela existir.
 *
 * Os números da primeira tabela são os do dono, ditos por ele: a água tem lote
 * de 12 e a sugestão nunca pode dar 13.
 */

let falhas = 0;
function check(label: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

function arredonda(falta: number, lote: number | null, esperado: number) {
  const deu = arredondarAoLote(falta, lote);
  check(
    `falta ${falta}, lote ${lote ?? "nenhum"} → ${esperado}`,
    deu === esperado,
    deu === esperado ? "" : `deu ${deu}`,
  );
}

console.log("— arredondar ao lote mais perto —");
arredonda(13, 12, 12); // o caso que motivou tudo
arredonda(19, 12, 24);
arredonda(6, 12, 12); // meio lote arredonda para cima
arredonda(5, 12, 0); // menos de meio lote não vira compra
arredonda(1, 12, 0);
arredonda(30, 12, 36);
arredonda(24, 12, 24); // já fecha, fica como está
arredonda(0.3, 0.5, 0.5); // lote fracionário
arredonda(2.5, 0.5, 2.5);
arredonda(100, null, 100); // sem lote, a falta passa inteira
arredonda(100.5, null, 100.5);

console.log("\n— lote inválido não derruba a conta —");
arredonda(13, 0, 13); // zero não é lote: devolve a falta, não NaN
arredonda(13, -5, 13);
check("NaN de falta não vira número", Number.isNaN(arredondarAoLote(NaN, 12)));

console.log("\n— serve no lote —");
check("13 não fecha lote de 12", serveNoLote(13, 12) === false);
check("24 fecha lote de 12", serveNoLote(24, 12) === true);
check("12 fecha lote de 12", serveNoLote(12, 12) === true);
check("qualquer número fecha sem lote", serveNoLote(9.37, null) === true);
// A armadilha do ponto flutuante: `0.3 % 0.1` dá 0,0999… em IEEE, e sem a
// aritmética em milésimos a tela recusaria 0,3 num produto de lote 0,1.
check("0,3 fecha lote de 0,1 (IEEE)", serveNoLote(0.3, 0.1) === true);
check("0,7 fecha lote de 0,1 (IEEE)", serveNoLote(0.7, 0.1) === true);
check("2,5 fecha lote de 0,5", serveNoLote(2.5, 0.5) === true);
check("2,6 não fecha lote de 0,5", serveNoLote(2.6, 0.5) === false);

console.log("\n— quantos lotes —");
check("24 são 2 lotes de 12", lotesDe(24, 12) === 2);
check("12 é 1 lote de 12", lotesDe(12, 12) === 1);
check("13 não é lote nenhum de 12", lotesDe(13, 12) === null);
check("sem lote não conta lote", lotesDe(24, null) === null);
check("2,5 são 5 lotes de 0,5", lotesDe(2.5, 0.5) === 5);

/*
 * As duas identidades que amarram as irmãs.
 *
 * `arredondarAoLote` e `serveNoLote` são funções separadas de propósito, e o
 * que garante que não divergem é isto aqui. Se uma destas duas linhas quebrar,
 * alguém mexeu numa e não na outra.
 */
console.log("\n— as irmãs concordam —");
const lotes = [null, 1, 12, 0.5, 2.5, 100];
const faltas = [0.1, 0.3, 1, 5, 6, 7, 12, 13, 19, 24, 30, 99.999, 1000];
let arredondadoSempreFecha = true;
let concordamEmTodoX = true;
for (const lote of lotes) {
  for (const x of faltas) {
    const r = arredondarAoLote(x, lote);
    if (!serveNoLote(r, lote)) {
      arredondadoSempreFecha = false;
      console.log(`   quebrou: falta ${x}, lote ${lote}, arredondou para ${r}`);
    }
    if (serveNoLote(x, lote) !== (r === x)) {
      concordamEmTodoX = false;
      console.log(`   quebrou: x ${x}, lote ${lote}, serve=${serveNoLote(x, lote)}, r=${r}`);
    }
  }
}
check("o que foi arredondado sempre fecha o lote", arredondadoSempreFecha);
check("fecha o lote se e só se o arredondamento não mexe", concordamEmTodoX);

/*
 * Quanto falta para fechar o lote.
 *
 * A tabela é a fala do dono virada do avesso: ele disse que 13 não pode
 * existir num fardo de 12; isto diz quanto falta para chegar aos 24.
 *
 * `abaixo` nulo dentro do primeiro lote é a parte que importa: abaixo de 12
 * não existe compra menor, e oferecer zero seria oferecer "não comprar" no
 * lugar onde ele está tentando comprar.
 */
console.log("\n— quanto falta para o lote —");
function falta(
  q: number,
  lote: number,
  esperado: { falta: number; acima: number; abaixo: number | null },
) {
  const r = faltaParaOLote(q, lote);
  const ok =
    r !== null &&
    r.falta === esperado.falta &&
    r.acima === esperado.acima &&
    r.abaixo === esperado.abaixo;
  check(
    `${q} num lote de ${lote}`,
    ok,
    r === null
      ? "veio nulo"
      : `faltam ${r.falta} para ${r.acima}, abaixo ${r.abaixo}`,
  );
}

falta(13, 12, { falta: 11, acima: 24, abaixo: 12 });
falta(215, 12, { falta: 1, acima: 216, abaixo: 204 });
falta(1, 12, { falta: 11, acima: 12, abaixo: null });
falta(11, 12, { falta: 1, acima: 12, abaixo: null });
falta(0.3, 0.5, { falta: 0.2, acima: 0.5, abaixo: null });
falta(0.7, 0.5, { falta: 0.3, acima: 1, abaixo: 0.5 });

check("número que fecha não tem falta", faltaParaOLote(24, 12) === null);
check("sem lote não tem falta", faltaParaOLote(13, null) === null);

/* A identidade que amarra esta às irmãs: somar o que falta fecha o lote. */
let somarAFaltaFecha = true;
for (const lote of [1, 12, 0.5, 2.5, 100]) {
  for (const x of [0.1, 0.3, 1, 5, 7, 13, 19, 99.999, 1000]) {
    const r = faltaParaOLote(x, lote);
    if (r === null) continue;
    if (!serveNoLote(x + r.falta, lote) || r.acima !== x + r.falta) {
      somarAFaltaFecha = false;
      console.log(`   quebrou: x ${x}, lote ${lote}, falta ${r.falta}`);
    }
  }
}
check("somar o que falta chega no lote de cima", somarAFaltaFecha);

console.log(falhas === 0 ? "\nO lote está certo." : `\n${falhas} falha(s).`);
process.exitCode = falhas === 0 ? 0 : 1;
