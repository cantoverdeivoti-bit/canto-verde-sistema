import { ptBR } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

import {
  diaDaqui,
  diaISO,
  diaNoFuso,
  formatDateString,
  formatDateTime,
  formatDayAndMonth,
  formatDayMonthTime,
  formatDiaCurtoString,
  formatDiaNumerico,
  formatDiaNumericoString,
  formatLongDate,
  formatTime,
} from "../lib/format";

/**
 * As datas de `lib/format.ts` (escritas com `Intl`) contra o date-fns, que
 * era quem as escrevia antes: a mesma saída, data a data, em vários fusos e
 * horários — inclusive perto da meia-noite, onde o fuso muda o dia.
 *
 *   npx tsx scripts/test-datas.ts
 */

let falhas = 0;
let total = 0;
function igual(rotulo: string, novo: string, antigo: string) {
  total += 1;
  if (novo !== antigo) {
    falhas += 1;
    if (falhas <= 15) console.log(`FALHA ${rotulo}: "${novo}" ≠ "${antigo}"`);
  }
}
const f = (d: Date, tz: string, padrao: string) => formatInTimeZone(d, tz, padrao, { locale: ptBR });

const fusos = ["America/Sao_Paulo", "UTC", "America/Manaus"];
// Um ano inteiro, de 7 em 7 horas: passa por todo dia da semana, todo mês e
// pelas horas perto da virada do dia.
const inicio = Date.parse("2026-01-01T00:00:00Z");
for (let t = inicio; t < inicio + 366 * 24 * 3600 * 1000; t += 7 * 3600 * 1000) {
  const d = new Date(t);
  for (const tz of fusos) {
    igual("formatDateTime", formatDateTime(d, tz), f(d, tz, "dd/MM/yyyy 'às' HH:mm"));
    igual("formatTime", formatTime(d, tz), f(d, tz, "HH:mm"));
    igual("formatLongDate", formatLongDate(d, tz), f(d, tz, "EEEE, d 'de' MMMM 'de' yyyy"));
    igual("formatDayAndMonth", formatDayAndMonth(d, tz), f(d, tz, "EEEE, d 'de' MMMM"));
    igual("formatDiaNumerico", formatDiaNumerico(d, tz), f(d, tz, "EEEE, dd/MM"));
    igual("formatDayMonthTime", formatDayMonthTime(d, tz), f(d, tz, "EEEE, d 'de' MMMM 'às' HH:mm"));
    igual("diaNoFuso", diaNoFuso(d, tz), f(d, tz, "yyyy-MM-dd"));
  }
  const dia = diaISO(d);
  igual("formatDateString", formatDateString(dia), f(new Date(`${dia}T12:00:00Z`), "UTC", "EEEE, d 'de' MMMM"));
  igual("formatDiaCurtoString", formatDiaCurtoString(dia), f(new Date(`${dia}T12:00:00Z`), "UTC", "EEE, dd/MM"));
  igual("formatDiaNumericoString", formatDiaNumericoString(dia), f(new Date(`${dia}T12:00:00Z`), "UTC", "EEEE, dd/MM"));
  igual(
    "diaDaqui",
    diaISO(diaDaqui(1, "America/Sao_Paulo", d)),
    diaISO(
      (() => {
        const x = new Date(`${f(d, "America/Sao_Paulo", "yyyy-MM-dd")}T12:00:00.000Z`);
        x.setUTCDate(x.getUTCDate() + 1);
        return x;
      })(),
    ),
  );
}

if (falhas > 0) {
  console.log(`\n${falhas} de ${total} diferentes.`);
  process.exit(1);
}
console.log(`Tudo certo: ${total} datas iguais ao date-fns.`);
