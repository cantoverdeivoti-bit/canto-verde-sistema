import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { dadosDaConciliacao, opcoesDoFinanceiro } from "@/lib/financeiro-dados";

import { Conciliacao } from "./conciliacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação bancária · Financeiro" };

/**
 * O extrato do banco contra o que foi lançado. Cada linha do extrato precisa
 * de uma explicação: um pagamento, um recebimento, uma transferência ou uma
 * tarifa. Linha sem explicação é dinheiro que o sistema não sabe que mexeu.
 */
export default async function ConciliacaoPage({ searchParams }: PageProps<"/admin/financeiro/conciliacao">) {
  const q = await searchParams;
  const contas = await prisma.contaFinanceira.findMany({
    where: { ativo: true },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, tipo: true, contaNoBanco: true, _count: { select: { linhasExtrato: { where: { status: "PENDENTE" } } } } },
  });
  // Abre no banco: a gaveta do caixa não tem extrato.
  const conta = contas.find((c) => String(c.id) === q.conta) ?? contas.find((c) => c.tipo === "BANCO") ?? contas[0];
  if (!conta)
    return (
      <Pagina largura="media">
        <CabecalhoDaPagina titulo="Conciliação bancária" />
        <Vazio>Cadastre uma conta em Contas e saldos.</Vazio>
      </Pagina>
    );
  const [dados, opcoes] = await Promise.all([dadosDaConciliacao(conta.id), opcoesDoFinanceiro()]);

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Conciliação bancária"
        subtitulo="Importe o extrato do banco e confira linha por linha."
        ajuda={
          <>
            Exporte o extrato em OFX (no internet banking, às vezes aparece como &quot;Money&quot;) e importe aqui. Cada linha
            é casada com o lançamento que a explica.
          </>
        }
      />
      <nav aria-label="Conta" className="flex flex-wrap gap-1.5">
        {contas.map((c) => (
          <Link
            key={c.id}
            href={`/admin/financeiro/conciliacao?conta=${c.id}`}
            aria-current={c.id === conta.id ? "page" : undefined}
            className={`chip px-3 py-1.5 text-sm ${c.id === conta.id ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)]" : ""}`}
          >
            {c.nome}
            {c._count.linhasExtrato > 0 && <span className="ml-1 opacity-70">{c._count.linhasExtrato}</span>}
          </Link>
        ))}
      </nav>
      <Conciliacao
        key={conta.id}
        conta={{ id: conta.id, nome: conta.nome, contaNoBanco: conta.contaNoBanco }}
        outrasContas={contas.filter((c) => c.id !== conta.id).map((c) => ({ id: c.id, nome: c.nome, contaNoBanco: c.contaNoBanco }))}
        dados={dados}
        opcoes={opcoes}
      />
    </Pagina>
  );
}
