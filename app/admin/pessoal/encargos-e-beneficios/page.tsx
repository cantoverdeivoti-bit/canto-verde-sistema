import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { projecaoDoMes } from "@/lib/cmo";
import { dadosDoCmo, hojeDaCasa } from "@/lib/cmo-do-banco";
import { prisma } from "@/lib/db";
import { can } from "@/lib/roles";

import { ListaDeItens } from "./lista-de-itens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Encargos, benefícios e descontos · Departamento pessoal" };

/**
 * O cadastro dos encargos (13º, FGTS) e benefícios (vale-transporte, plano de
 * saúde) que entram no CMO. Cada item vale para os tipos marcados; a exceção
 * de cada pessoa fica na ficha dela.
 */
export default async function EncargosEBeneficiosPage() {
  const user = await guardModule("pessoal");
  const podeConfigurar = can(user, "pessoal", { configure: true });

  const [{ pessoas, itens }, excecoes] = await Promise.all([
    dadosDoCmo(await hojeDaCasa()),
    prisma.itemDoColaborador.groupBy({ by: ["itemId"], _count: { _all: true } }),
  ]);
  const quantas = new Map(excecoes.map((e) => [e.itemId, e._count._all]));

  // O custo de um mês de cada item com a equipe de hoje; o desligado conta como se estivesse ligado.
  const linhas = itens.map((i) => {
    const p = projecaoDoMes({ pessoas, itens: [{ ...i, ativo: true }], faturamentoMensal: null });
    const doMes = i.natureza === "DESCONTO" ? p.descontos : p.encargos + p.beneficios;
    return { ...i, excecoes: quantas.get(i.id) ?? 0, custoNoMes: podeConfigurar ? doMes : null };
  });

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Encargos, benefícios e descontos"
        subtitulo="O que entra no CMO além do salário e da diária."
        ajuda="Descontos saem do salário do colaborador. Cada item vale para os tipos marcados; na ficha de cada colaborador dá para tirar ou pôr um item só para ele, e mudar o valor."
      />
      <ListaDeItens itens={linhas} podeConfigurar={podeConfigurar} />
    </Pagina>
  );
}
