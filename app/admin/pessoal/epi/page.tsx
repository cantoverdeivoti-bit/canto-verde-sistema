import { Printer } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { FUSO_DA_CASA } from "@/lib/format";
import { AVISO_EM_DIAS, diasAte } from "@/lib/prazos-pessoal";
import { can } from "@/lib/roles";

import { ListaDeEpi, type PessoaComEpi } from "./lista-de-epi";

export const dynamic = "force-dynamic";
export const metadata = { title: "EPI e uniformes · Departamento pessoal" };

/**
 * O que cada pessoa recebeu de EPI e uniforme, com a troca prevista. Registrar
 * uma entrega substitui a anterior do mesmo item; o termo de entrega sai para
 * imprimir e assinar. O que está perto da troca ou desgastado também aparece
 * em Pendências.
 */
export default async function EpiPage({ searchParams }: PageProps<"/admin/pessoal/epi">) {
  const [user, q] = await Promise.all([guardModule("pessoal"), searchParams]);
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const pessoaPedida = typeof q.pessoa === "string" ? Number(q.pessoa) || null : null;
  const soTroca = q.situacao === "troca";

  const [colaboradores, itens] = await Promise.all([
    prisma.colaborador.findMany({
      where: { ativo: true, pendente: false },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        apelido: true,
        area: true,
        funcao: { select: { nome: true } },
        entregasDeEpi: {
          where: { substituidaEm: null },
          orderBy: { item: { ordem: "asc" } },
          select: {
            id: true,
            data: true,
            quantidade: true,
            tamanho: true,
            proximaTroca: true,
            desgastado: true,
            observacao: true,
            item: { select: { nome: true } },
          },
        },
      },
    }),
    prisma.itemDeEpi.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true, trocaEmDias: true } }),
  ]);

  const pessoas: PessoaComEpi[] = colaboradores.map((c) => ({
    id: c.id,
    nome: c.apelido ?? c.nome,
    detalhe: [c.funcao?.nome, c.area === "COZINHA" ? "Cozinha" : c.area === "SALAO" ? "Salão" : null].filter(Boolean).join(" · "),
    entregas: c.entregasDeEpi.map((e) => {
      const troca = e.proximaTroca ? dateOnlyToString(e.proximaTroca) : null;
      const dias = troca ? diasAte(hoje, troca) : null;
      return {
        id: e.id,
        item: e.item.nome,
        data: dateOnlyToString(e.data),
        quantidade: e.quantidade,
        tamanho: e.tamanho,
        proximaTroca: troca,
        desgastado: e.desgastado,
        observacao: e.observacao,
        situacao: e.desgastado || (dias !== null && dias <= 0) ? "trocar" : dias !== null && dias <= AVISO_EM_DIAS.epi ? "perto" : "ok",
      };
    }),
  }));
  const precisa = (p: PessoaComEpi) => p.entregas.some((e) => e.situacao !== "ok");
  const visiveis = pessoas.filter((p) => (pessoaPedida ? p.id === pessoaPedida : true) && (!soTroca || precisa(p)));
  const comTroca = pessoas.filter(precisa).length;

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="EPI e uniformes"
        subtitulo={
          comTroca > 0
            ? `${comTroca} ${comTroca === 1 ? "pessoa precisa" : "pessoas precisam"} de troca. Peça perto da troca em amarelo, para trocar em vermelho.`
            : "Ninguém com troca pendente."
        }
        acoes={
          pessoaPedida && (
            <Link href="/admin/pessoal/epi" className="text-sm text-[var(--primary)] underline underline-offset-4">
              Ver todos
            </Link>
          )
        }
      />
      <form method="get" className="grid grid-cols-2 gap-2">
        <SelectQueEnvia
          name="pessoa"
          rotulo="Pessoa"
          atual={pessoaPedida ? String(pessoaPedida) : ""}
          opcoes={[{ valor: "", texto: "Todas as pessoas" }, ...pessoas.map((p) => ({ valor: String(p.id), texto: p.nome }))]}
        />
        <SelectQueEnvia
          name="situacao"
          rotulo="Situação"
          atual={soTroca ? "troca" : ""}
          opcoes={[
            { valor: "", texto: "Todas as situações" },
            { valor: "troca", texto: "Precisa de troca" },
          ]}
        />
      </form>
      {itens.length === 0 ? (
        <Vazio>
          Nenhum item de EPI ligado.{" "}
          {can(user, "pessoal", { configure: true }) && (
            <Link href="/admin/pessoal/configuracoes" className="underline">
              Cadastre em Configurações
            </Link>
          )}
        </Vazio>
      ) : visiveis.length === 0 ? (
        <Vazio>Ninguém com esses filtros.</Vazio>
      ) : (
        <ListaDeEpi pessoas={visiveis} itens={itens} hoje={hoje} />
      )}
      <p className="hint flex items-center gap-1.5">
        <Printer aria-hidden className="size-4" />O termo de entrega de cada pessoa sai pelo botão Termo, para imprimir e colher a assinatura.
      </p>
    </Pagina>
  );
}
