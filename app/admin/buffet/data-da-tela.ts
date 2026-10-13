import { todayInTimezone } from "@/lib/availability";
import { FUSO_DA_CASA } from "@/lib/format";
import { dateString } from "@/lib/validations";

/** A data do endereço (`?data=`), ou hoje no fuso da casa. */
export function dataDaTela(doEndereco: string | string[] | undefined) {
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const data = typeof doEndereco === "string" && dateString.safeParse(doEndereco).success ? doEndereco : hoje;
  return { data, hoje };
}
