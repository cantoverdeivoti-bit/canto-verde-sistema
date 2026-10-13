import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { saldosDasContas } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA } from "@/lib/format";

import { ListaDeContas } from "./lista-de-contas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas e saldos · Financeiro" };

/**
 * Onde o dinheiro fica. O saldo inicial é o ponto de partida: o que havia na
 * conta no dia em que ela passou a ser controlada aqui. Daí em diante, o
 * saldo é calculado pelas baixas e transferências.
 */
export default async function ContasPage() {
  await guardModule("financeiro", { configure: true });
  const contas = await saldosDasContas();
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Contas e saldos"
        subtitulo="Os bancos e o caixa da casa, com o saldo de cada um."
        ajuda="Para o saldo bater com o extrato, acerte o saldo inicial de cada conta com o valor do extrato num dia e lance tudo daquele dia em diante."
      />
      <ListaDeContas contas={contas} hoje={todayInTimezone(FUSO_DA_CASA)} />
    </Pagina>
  );
}
