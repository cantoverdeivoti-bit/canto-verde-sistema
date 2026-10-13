import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { gerarRecorrenciasDoDia, lancamentosDoMes, opcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA } from "@/lib/format";

import { ListaDeLancamentos } from "./lista-de-lancamentos";
import { mesDoEndereco, SeletorDeMes } from "./seletor-de-mes";

/**
 * Contas a pagar e contas a receber são a mesma tela com o sinal trocado.
 * O mês é o do vencimento; os vencidos em aberto de antes aparecem junto.
 */
export async function PaginaDeLancamentos({
  tipo,
  busca,
}: {
  tipo: "PAGAR" | "RECEBER";
  busca: Record<string, string | string[] | undefined>;
}) {
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const atual = hoje.slice(0, 7);
  const mes = mesDoEndereco(busca.mes, atual);
  await gerarRecorrenciasDoDia(hoje);
  const [itens, opcoes, fechado] = await Promise.all([
    lancamentosDoMes(tipo, mes, hoje),
    opcoesDoFinanceiro(),
    prisma.mesFechado.findUnique({ where: { mes } }),
  ]);
  const pagar = tipo === "PAGAR";
  const caminho = pagar ? "/admin/financeiro/pagar" : "/admin/financeiro/receber";
  // Os vencidos de antes só vêm junto até o mês de hoje (`lancamentosDoMes`):
  // num mês que ainda não chegou, a lista é só a dele.
  const atrasados = `${pagar ? "As contas vencidas" : "Os vencidos"} de meses anteriores e ainda em aberto aparecem junto, no mês de hoje e nos que já passaram.`;

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo={pagar ? "Contas a pagar" : "Contas a receber"}
        subtitulo={pagar ? "O que a casa deve, pelo vencimento." : "O que a casa tem a receber, pelo vencimento."}
        ajuda={pagar ? atrasados : `Os repasses do cartão entram sozinhos depois do fechamento do dia. ${atrasados}`}
      />
      <SeletorDeMes caminho={caminho} mes={mes} atual={atual} />
      <ListaDeLancamentos
        key={mes}
        tipo={tipo}
        itens={itens}
        opcoes={opcoes}
        hoje={hoje}
        mes={mes}
        abrirNovo={busca.novo === "1"}
        fechado={fechado !== null}
      />
    </Pagina>
  );
}
