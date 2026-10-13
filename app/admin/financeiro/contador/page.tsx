import { Download, Lock } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { CHAVE_CATEGORIA, nomeDoMes } from "@/lib/financeiro";
import { diaDoMes, somarDias, somarMeses } from "@/lib/financeiro-calculo";
import { competenciaDo } from "@/lib/financeiro-dados";
import { lotesDeAnexos } from "@/lib/financeiro-planilhas";
import { FUSO_DA_CASA, formatDiaCurtoString, formatMoney, plural } from "@/lib/format";
import { can } from "@/lib/permissions";

import { mesDoEndereco, SeletorDeMes } from "../_comum/seletor-de-mes";
import { FecharMes } from "./fechar-mes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contador · Financeiro" };

/**
 * O que vai para o escritório de contabilidade no fim do mês: primeiro o que
 * falta arrumar (sem isso, o contador liga perguntando), depois os arquivos
 * e, por fim, fechar o mês para os números não mudarem depois de entregues.
 *
 * Abre no mês passado: é o que se entrega no começo de cada mês.
 */
export default async function ContadorPage({ searchParams }: PageProps<"/admin/financeiro/contador">) {
  const user = await guardModule("financeiro");
  const q = await searchParams;
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const mes = mesDoEndereco(q.mes, somarMeses(hoje.slice(0, 7), -1));
  const de = toDateOnly(`${mes}-01`);
  const ate = toDateOnly(diaDoMes(mes, 31));
  const doMes = { OR: [{ competencia: competenciaDo(mes) }, { pagoEm: { gte: de, lte: ate } }], status: { not: "CANCELADO" as const } };

  const [fechado, semAnexo, semAnexoTotal, usados, contasUsadas, transferencias, fechamentos, sistema, encargos, vencidosPorTipo, lotes, extrato] = await Promise.all([
    prisma.mesFechado.findUnique({ where: { mes }, include: { fechadoPor: { select: { name: true, username: true } } } }),
    prisma.lancamento.findMany({
      where: { tipo: "PAGAR", status: "PAGO", pagoEm: { gte: de, lte: ate }, origem: { not: "FECHAMENTO" }, anexos: { none: {} } },
      orderBy: { pagoEm: "asc" },
      take: 8,
      select: { id: true, descricao: true, valor: true, pagoEm: true },
    }),
    prisma.lancamento.count({ where: { tipo: "PAGAR", status: "PAGO", pagoEm: { gte: de, lte: ate }, origem: { not: "FECHAMENTO" }, anexos: { none: {} } } }),
    prisma.lancamento.groupBy({ by: ["categoriaId"], where: doMes }),
    prisma.lancamento.groupBy({ by: ["contaId"], where: { status: "PAGO", pagoEm: { gte: de, lte: ate } } }),
    prisma.transferencia.findMany({ where: { data: { gte: de, lte: ate } }, select: { origemId: true, destinoId: true } }),
    prisma.fechamentoDoDia.findMany({ where: { data: { gte: de, lte: ate } }, select: { data: true } }),
    prisma.categoriaFinanceira.findMany({
      where: { chave: { in: [CHAVE_CATEGORIA.taxasDeCartao, CHAVE_CATEGORIA.jurosEMultas, CHAVE_CATEGORIA.descontos] } },
      select: { chave: true, nome: true, codigoContabil: true },
    }),
    prisma.lancamento.aggregate({ where: { status: "PAGO", pagoEm: { gte: de, lte: ate } }, _sum: { taxa: true, jurosMulta: true, desconto: true } }),
    prisma.lancamento.groupBy({
      by: ["tipo"],
      where: { status: "ABERTO", competencia: competenciaDo(mes), vencimento: { lt: toDateOnly(hoje) } },
      _count: { _all: true },
    }),
    lotesDeAnexos(mes),
    prisma.linhaExtrato.count({ where: { status: "PENDENTE", data: { gte: de, lte: ate } } }),
  ]);

  const idsDeConta = new Set([...contasUsadas.map((c) => c.contaId), ...transferencias.flatMap((t) => [t.origemId, t.destinoId])]);
  const [categoriasSemCodigo, contasSemCodigo] = await Promise.all([
    prisma.categoriaFinanceira.findMany({ where: { id: { in: usados.map((u) => u.categoriaId) }, codigoContabil: null }, select: { nome: true } }),
    prisma.contaFinanceira.findMany({
      where: { id: { in: [...idsDeConta].filter((x): x is number => x !== null) }, codigoContabil: null },
      select: { nome: true },
    }),
  ]);
  // A contrapartida de sistema só faz falta se o mês teve aquele valor.
  const usou: Record<string, number> = {
    [CHAVE_CATEGORIA.taxasDeCartao]: encargos._sum.taxa?.toNumber() ?? 0,
    [CHAVE_CATEGORIA.jurosEMultas]: encargos._sum.jurosMulta?.toNumber() ?? 0,
    [CHAVE_CATEGORIA.descontos]: encargos._sum.desconto?.toNumber() ?? 0,
  };
  const sistemaSemCodigo = sistema.filter((c) => !c.codigoContabil && (usou[c.chave!] ?? 0) > 0).map((c) => ({ nome: c.nome }));

  const ultimoDia = diaDoMes(mes, 31) < hoje ? diaDoMes(mes, 31) : hoje;
  const vencidosDe = (tipo: "PAGAR" | "RECEBER") => vencidosPorTipo.find((v) => v.tipo === tipo)?._count._all ?? 0;
  const vencidos = vencidosDe("PAGAR") + vencidosDe("RECEBER");
  const fechados = new Set(fechamentos.map((f) => dateOnlyToString(f.data)));
  const diasSemFechamento: string[] = [];
  for (let d = `${mes}-01`; d <= ultimoDia; d = somarDias(d, 1)) if (!fechados.has(d)) diasSemFechamento.push(d);

  const semCodigo = [...categoriasSemCodigo, ...sistemaSemCodigo];
  // Dia sem fechamento conta como pendência: pode ser dia fechado da casa,
  // mas também pode ser venda que não entrou. Quem fecha o mês confirma.
  const pendencias = semAnexoTotal + semCodigo.length + contasSemCodigo.length + vencidos + extrato + diasSemFechamento.length;
  const configura = can(user, "financeiro", { configure: true });
  const futuro = mes > hoje.slice(0, 7);

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Contador" />
      <SeletorDeMes caminho="/admin/financeiro/contador" mes={mes} atual={somarMeses(hoje.slice(0, 7), -1)} rotuloDoAtual="mês passado" />

      {fechado && (
        <p className="msg-warn flex items-start gap-2">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Fechado em {formatDiaCurtoString(fechado.fechadoEm.toISOString().slice(0, 10))}
            {fechado.fechadoPor && ` por ${fechado.fechadoPor.name ?? fechado.fechadoPor.username}`}. Nada com data em {nomeDoMes(mes)} muda até reabrir.
          </span>
        </p>
      )}

      <section>
        <h2 className="section-label mb-2">Antes de enviar</h2>
        {futuro ? (
          <Vazio>Este mês ainda não começou.</Vazio>
        ) : pendencias === 0 ? (
          <p className="text-sm">Nada pendente: todo pagamento tem anexo, toda conta usada tem código contábil, o extrato está conciliado e todos os dias têm fechamento.</p>
        ) : (
          <Lista className="text-sm">
            {semAnexoTotal > 0 && (
              <Pendencia titulo={`${plural(semAnexoTotal, "pagamento", "pagamentos")} sem nota ou comprovante`}>
                {semAnexo.map((l) => (
                  <Link key={l.id} href={`/admin/financeiro/pagar?mes=${dateOnlyToString(l.pagoEm!).slice(0, 7)}#l${l.id}`} className="block truncate underline">
                    {l.descricao} · {formatMoney(l.valor.toNumber())}
                  </Link>
                ))}
                {semAnexoTotal > semAnexo.length && <span>e mais {semAnexoTotal - semAnexo.length}</span>}
              </Pendencia>
            )}
            {semCodigo.length > 0 && (
              <Pendencia titulo={`${plural(semCodigo.length, "categoria", "categorias")} sem código contábil`} link={configura ? "/admin/financeiro/categorias" : undefined}>
                <span>{semCodigo.map((c) => c.nome).join(", ")}</span>
                <span>Sem o código, a partida sai com a conta em branco no CSV.</span>
              </Pendencia>
            )}
            {contasSemCodigo.length > 0 && (
              <Pendencia titulo={`${plural(contasSemCodigo.length, "conta", "contas")} sem código contábil`} link={configura ? "/admin/financeiro/contas" : undefined}>
                <span>{contasSemCodigo.map((c) => c.nome).join(", ")}</span>
              </Pendencia>
            )}
            {extrato > 0 && (
              <Pendencia titulo={`${plural(extrato, "linha do extrato", "linhas do extrato")} sem conciliar`} link="/admin/financeiro/conciliacao">
                <span>Dinheiro que o banco mostra e o sistema ainda não explicou.</span>
              </Pendencia>
            )}
            {vencidos > 0 && (
              <Pendencia titulo={`${plural(vencidos, "conta do mês vencida", "contas do mês vencidas")} e ainda em aberto`}>
                <span className="flex flex-wrap gap-x-3">
                  {vencidosDe("PAGAR") > 0 && (
                    <Link href={`/admin/financeiro/pagar?mes=${mes}`} className="underline">
                      {vencidosDe("PAGAR")} a pagar
                    </Link>
                  )}
                  {vencidosDe("RECEBER") > 0 && (
                    <Link href={`/admin/financeiro/receber?mes=${mes}`} className="underline">
                      {vencidosDe("RECEBER")} a receber
                    </Link>
                  )}
                </span>
                <span>Se já foram pagas ou recebidas, falta dar baixa; o caixa do contador sai sem elas.</span>
              </Pendencia>
            )}
            {diasSemFechamento.length > 0 && (
              <Pendencia titulo={`${plural(diasSemFechamento.length, "dia", "dias")} sem fechamento do PDV`} link="/admin/financeiro/fechamento">
                <span>
                  {diasSemFechamento.slice(0, 10).map((d) => formatDiaCurtoString(d)).join("; ")}
                  {diasSemFechamento.length > 10 && "…"}
                </span>
                <span>Se a casa abriu nesses dias, a venda deles não está na conta.</span>
              </Pendencia>
            )}
          </Lista>
        )}
      </section>

      <section>
        <h2 className="section-label mb-2">Arquivos</h2>
        <Lista className="text-sm">
          <Arquivo href={`/admin/financeiro/contador/pacote?mes=${mes}`} titulo="Planilhas e partidas" detalhe="lançamentos do mês, DRE e o CSV de partidas para importar" />
          {lotes.map((lote, i) => (
            <Arquivo
              key={i}
              href={`/admin/financeiro/contador/pacote?mes=${mes}&parte=${i + 1}`}
              titulo={lotes.length === 1 ? "Anexos" : `Anexos, parte ${i + 1} de ${lotes.length}`}
              detalhe={`${plural(lote.length, "arquivo")}, ${(lote.reduce((s, a) => s + a.tamanho, 0) / 1_000_000).toFixed(1).replace(".", ",")} MB`}
            />
          ))}
        </Lista>
        {lotes.length === 0 && <p className="hint">Nenhum anexo neste mês.</p>}
      </section>

      {configura && !futuro && (fechado !== null || mes < hoje.slice(0, 7)) && <FecharMes mes={mes} fechado={fechado !== null} pendencias={pendencias} />}
    </Pagina>
  );
}

function Pendencia({ titulo, link, children }: { titulo: string; link?: string; children: React.ReactNode }) {
  return (
    <li className="space-y-1 px-3 py-2.5">
      <p className="flex items-baseline justify-between gap-2 font-semibold">
        <span>{titulo}</span>
        {link && (
          <Link href={link} className="nav-link shrink-0">
            resolver
          </Link>
        )}
      </p>
      <div className="flex flex-col gap-0.5 text-xs text-[var(--muted-foreground)]">{children}</div>
    </li>
  );
}

function Arquivo({ href, titulo, detalhe }: { href: string; titulo: string; detalhe: string }) {
  return (
    <li>
      <a href={href} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
        <Download aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{titulo}</span>
          <span className="block text-xs text-[var(--muted-foreground)]">{detalhe}</span>
        </span>
      </a>
    </li>
  );
}
