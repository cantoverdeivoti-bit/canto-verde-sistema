import { zipSync } from "fflate";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { nomeDoMes } from "@/lib/financeiro";
import { csvDasPartidas } from "@/lib/financeiro-calculo";
import { lotesDeAnexos, partidasDoMesNoBanco, planilhaDaDre, planilhaDoMes } from "@/lib/financeiro-planilhas";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * O pacote do mês para o contador, em ZIP.
 *
 * `?parte=0` (o padrão) leva as planilhas, as partidas em CSV e um LEIA-ME.
 * `?parte=1`, `2`... levam os anexos, divididos para cada parte caber no
 * limite de resposta da Vercel (4,5 MB): um ZIP só com tudo passaria disso
 * no primeiro mês com notas fotografadas.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user, "financeiro")) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const busca = new URL(request.url).searchParams;
  const mes = busca.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  const parte = Number(busca.get("parte") ?? "0");
  if (!Number.isInteger(parte) || parte < 0) return NextResponse.json({ error: "Parte inválida." }, { status: 400 });

  const lotes = await lotesDeAnexos(mes);
  const texto = (t: string) => new TextEncoder().encode(t);
  let arquivos: Record<string, Uint8Array>;

  if (parte === 0) {
    const [mesXlsx, dreXlsx, partidas, fechado] = await Promise.all([
      planilhaDoMes(mes),
      planilhaDaDre(mes),
      partidasDoMesNoBanco(mes),
      prisma.mesFechado.findUnique({ where: { mes } }),
    ]);
    const leiaMe = [
      `Canto Verde · ${nomeDoMes(mes)}`,
      fechado ? "Mês fechado no sistema: os números não mudam mais sem reabrir." : "ATENÇÃO: o mês ainda está aberto no sistema e pode mudar.",
      "",
      `${mesXlsx.nome}: lançamentos pela competência e pelo caixa, transferências e resumo por categoria e centro de custo.`,
      `${dreXlsx.nome}: a DRE do mês com os dois anteriores.`,
      `partidas-${mes}.csv: as partidas dobradas do mês pelo caixa (data; débito; crédito; valor; histórico; documento).`,
      lotes.length > 0 ? `Anexos: em ${lotes.length} arquivo(s) à parte, "anexos-${mes}-parte-N.zip".` : "Sem anexos neste mês.",
      "",
    ].join("\r\n");
    arquivos = {
      "LEIA-ME.txt": texto(leiaMe),
      [mesXlsx.nome]: mesXlsx.bytes,
      [dreXlsx.nome]: dreXlsx.bytes,
      [`partidas-${mes}.csv`]: texto(csvDasPartidas(partidas)),
    };
  } else {
    const lote = lotes[parte - 1];
    if (!lote) return NextResponse.json({ error: "Essa parte não existe." }, { status: 404 });
    const dados = await prisma.anexoFinanceiro.findMany({ where: { id: { in: lote.map((a) => a.id) } }, select: { id: true, dados: true } });
    arquivos = Object.fromEntries(lote.map((a) => [a.arquivo, new Uint8Array(dados.find((d) => d.id === a.id)!.dados)]));
  }

  // Nível 0 nos anexos: PDF e JPEG já vêm comprimidos, e comprimir de novo
  // só gasta tempo da função.
  const zip = zipSync(arquivos, { level: parte === 0 ? 6 : 0 });
  const nome = parte === 0 ? `contador-${mes}.zip` : `anexos-${mes}-parte-${parte}.zip`;
  return new Response(zip as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
