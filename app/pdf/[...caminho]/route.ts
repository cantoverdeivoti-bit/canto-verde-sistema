import { NextResponse } from "next/server";

import { dateOnlyToString, getSettings, todayInTimezone } from "@/lib/availability";
import { cardapioDoDiaCompleto, gruposDoBuffet, pesosDoDia, posicoesDoMapa } from "@/lib/buffet-dados";
import { prisma } from "@/lib/db";
import { segundaDaSemana } from "@/lib/escala";
import { carregarSemana } from "@/lib/escala-do-banco";
import { producaoDoCardapio } from "@/lib/eventos-dados";
import { plural } from "@/lib/format";
import { folhaDoBuffetEmPdf } from "@/lib/pdf/buffet-pdf";
import { termoDeEpiEmPdf } from "@/lib/pdf/epi-pdf";
import { escalaEmPdf } from "@/lib/pdf/escala-pdf";
import { fichasEmPdf } from "@/lib/pdf/ficha-pdf";
import { fotoParaPdf } from "@/lib/pdf/foto";
import { mapaDoBuffetEmPdf } from "@/lib/pdf/mapa-pdf";
import { precosEmPdf } from "@/lib/pdf/precos-pdf";
import { processoEmPdf } from "@/lib/pdf/processo-pdf";
import { producaoDoEventoEmPdf } from "@/lib/pdf/producao-evento-pdf";
import { propostaEmPdf } from "@/lib/pdf/proposta-pdf";
import { nomeDoPdf } from "@/lib/pdf-da-pagina";
import { can, getCurrentUser, type CurrentUser } from "@/lib/permissions";
import { fichasParaImprimir, type TipoDeFicha } from "@/lib/receituario-impressao";
import { CANAIS_DE_VENDA } from "@/lib/receituario-regras";
import { vendasComCustos } from "@/lib/receituario-vendas";
import { dateString } from "@/lib/validations";

export const dynamic = "force-dynamic";

type Pedido = { user: CurrentUser; segmentos: string[]; busca: URLSearchParams };
/** O PDF pronto, ou a resposta de erro (sem permissão, folha que não existe). */
type Resultado = Buffer | NextResponse;

const proibido = () => NextResponse.json({ error: "Sem permissão para esta folha." }, { status: 403 });
const naoExiste = () => NextResponse.json({ error: "Folha não encontrada." }, { status: 404 });

/** A foto de cada ficha pronta para o PDF (`lib/pdf/foto.ts`), uma de cada vez para não segurar todas as originais na memória. */
async function fotosDasFichas(ids: number[]): Promise<Map<number, Buffer>> {
  const mapa = new Map<number, Buffer>();
  const comFoto = await prisma.fotoDaFicha.findMany({ where: { fichaId: { in: ids } }, select: { fichaId: true } });
  for (const { fichaId } of comFoto) {
    const f = await prisma.fotoDaFicha.findUnique({ where: { fichaId }, select: { mime: true, dados: true, miniatura: true } });
    const foto = f ? await fotoParaPdf(f.dados, f.mime, f.miniatura) : null;
    if (foto) mapa.set(fichaId, foto);
  }
  return mapa;
}

/** As fichas: uma (`/pdf/receituario/425B`) ou as de uma categoria ou operação (`/pdf/receituario?categoria=...`). */
async function fichas({ user, segmentos, busca }: Pedido): Promise<Resultado> {
  if (!can(user, "receituario")) return proibido();
  // A técnica tem os custos: só para quem configura o módulo. O resto baixa a operacional.
  const tipo: TipoDeFicha = busca.get("tipo") === "tecnica" && can(user, "receituario", { configure: true }) ? "tecnica" : "operacional";
  let itens;
  if (segmentos.length === 2) {
    itens = await fichasParaImprimir({ codigo: segmentos[1].toUpperCase() });
    if (itens.length === 0) return naoExiste();
  } else {
    const categoria = busca.get("categoria") || undefined;
    const operacao = busca.get("operacao") || undefined;
    itens = categoria || operacao ? await fichasParaImprimir({ categoria, operacao }) : [];
  }
  return fichasEmPdf(itens, tipo, await fotosDasFichas(itens.map((i) => i.ficha.id)));
}

/** A lista de preços do balcão (`/pdf/receituario/precos?canal=...`). */
async function precos({ user, busca }: Pedido): Promise<Resultado> {
  if (!can(user, "receituario", { configure: true })) return proibido();
  const canal = CANAIS_DE_VENDA.find((c) => c.chave === busca.get("canal"))?.chave;
  const { itens } = await vendasComCustos();
  const visiveis = itens.filter((i) => i.ativo && i.precoVenda !== null && (!canal || i.canal === canal));
  return precosEmPdf(visiveis, canal, new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
}

/** A folha da cozinha de um dia (`/pdf/buffet/2026-10-13`) ou o mapa dele (`/pdf/buffet/2026-10-13/mapa`). */
async function buffet({ user, segmentos }: Pedido): Promise<Resultado> {
  if (!can(user, "buffet")) return proibido();
  const data = segmentos[1];
  if (!dateString.safeParse(data).success || segmentos.length > 3 || (segmentos[2] !== undefined && segmentos[2] !== "mapa")) return naoExiste();
  if (segmentos[2] === "mapa") {
    const [dia, grupos, posicoes] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), posicoesDoMapa()]);
    return mapaDoBuffetEmPdf(data, dia, grupos, posicoes);
  }
  const [dia, grupos, pesos] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), pesosDoDia(data)]);
  return folhaDoBuffetEmPdf(data, dia, grupos, pesos);
}

/** A escala da semana (`/pdf/escala?semana=2026-10-12`); sem semana, a de hoje. */
async function escala({ user, busca }: Pedido): Promise<Resultado> {
  if (!can(user, "pessoal")) return proibido();
  const { capacity } = await getSettings();
  const pedida = busca.get("semana");
  const segunda = segundaDaSemana(pedida && dateString.safeParse(pedida).success ? pedida : todayInTimezone(capacity.timezone));
  return escalaEmPdf(segunda, capacity.name, await carregarSemana(segunda));
}

/** A ordem de produção de um evento (`/pdf/eventos/producao/12`). */
async function producaoDoEvento({ user, segmentos }: Pedido): Promise<Resultado> {
  if (!can(user, "eventos")) return proibido();
  if (segmentos[1] !== "producao" || segmentos.length !== 3) return naoExiste();
  const e = await prisma.evento.findUnique({
    where: { id: Number(segmentos[2]) || 0 },
    select: { titulo: true, data: true, horaInicio: true, convidados: true, cardapioId: true, cardapio: { select: { nome: true } } },
  });
  if (!e) return naoExiste();
  const producao = e.cardapioId ? await producaoDoCardapio(e.cardapioId, e.convidados) : null;
  const subtitulo = `${dateOnlyToString(e.data).split("-").reverse().join("/")}${e.horaInicio ? `, às ${e.horaInicio}` : ""} · ${plural(e.convidados, "convidado")}${e.cardapio ? ` · ${e.cardapio.nome}` : ""}`;
  return producaoDoEventoEmPdf(e.titulo, subtitulo, producao);
}

/** A proposta para o cliente (`/pdf/proposta/12`). */
async function proposta({ user, segmentos }: Pedido): Promise<Resultado> {
  if (!can(user, "eventos")) return proibido();
  if (segmentos.length !== 2) return naoExiste();
  return (await propostaEmPdf(Number(segmentos[1]) || 0)) ?? naoExiste();
}

/** Um processo do Operacional (`/pdf/operacional/processo/3`). */
async function processo({ user, segmentos }: Pedido): Promise<Resultado> {
  if (!can(user, "operacional")) return proibido();
  const id = Number(segmentos[2]);
  if (segmentos[1] !== "processo" || segmentos.length !== 3 || !Number.isInteger(id)) return naoExiste();
  const p = await prisma.processo.findUnique({
    where: { id },
    select: { titulo: true, objetivo: true, passos: true, observacoes: true, revisadoEm: true, obrigatorio: { select: { funcao: { select: { nome: true } } } } },
  });
  return p ? processoEmPdf(p) : naoExiste();
}

/** O termo de entrega de EPI de uma pessoa (`/pdf/pessoal/epi/3`). */
async function termoDeEpi({ user, segmentos }: Pedido): Promise<Resultado> {
  if (!can(user, "pessoal")) return proibido();
  if (segmentos[1] !== "epi" || segmentos.length !== 3) return naoExiste();
  const c = await prisma.colaborador.findUnique({
    where: { id: Number(segmentos[2]) || 0 },
    select: {
      nome: true,
      cpf: true,
      admissao: true,
      comecouEm: true,
      funcao: { select: { nome: true } },
      entregasDeEpi: {
        orderBy: [{ data: "asc" }, { id: "asc" }],
        select: { data: true, quantidade: true, tamanho: true, item: { select: { nome: true, ca: true } } },
      },
    },
  });
  if (!c) return naoExiste();
  // O CPF segue a trava do cadastro: só quem configura o módulo vê.
  const verCpf = can(user, "pessoal", { configure: true });
  return termoDeEpiEmPdf({
    nome: c.nome,
    cpf: verCpf && c.cpf ? `${c.cpf.slice(0, 3)}.${c.cpf.slice(3, 6)}.${c.cpf.slice(6, 9)}-${c.cpf.slice(9)}` : null,
    inicio: c.admissao ?? c.comecouEm,
    funcao: c.funcao?.nome ?? null,
    entregas: c.entregasDeEpi,
  });
}

/**
 * As folhas em PDF, para baixar: `/pdf/...` é a folha de `/imprimir/...`
 * desenhada com o pdfkit (`lib/pdf/`), sem navegador. Cada folha confere a
 * permissão como a página dela.
 *
 * A guarda de sessão é explícita porque manipulador de rota não passa por
 * layout, e o `proxy.ts` só olha /admin.
 */
export async function GET(request: Request, { params }: RouteContext<"/pdf/[...caminho]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  const segmentos = (await params).caminho.map((s) => decodeURIComponent(s));
  const busca = new URL(request.url).searchParams;
  const pedido = { user, segmentos, busca };

  let resultado: Resultado;
  switch (segmentos[0]) {
    case "receituario":
      resultado = segmentos[1] === "precos" ? (segmentos.length === 2 ? await precos(pedido) : naoExiste()) : segmentos.length <= 2 ? await fichas(pedido) : naoExiste();
      break;
    case "buffet":
      resultado = await buffet(pedido);
      break;
    case "escala":
      resultado = segmentos.length === 1 ? await escala(pedido) : naoExiste();
      break;
    case "eventos":
      resultado = await producaoDoEvento(pedido);
      break;
    case "proposta":
      resultado = await proposta(pedido);
      break;
    case "operacional":
      resultado = await processo(pedido);
      break;
    case "pessoal":
      resultado = await termoDeEpi(pedido);
      break;
    default:
      resultado = naoExiste();
  }
  if (resultado instanceof NextResponse) return resultado;

  return new NextResponse(new Uint8Array(resultado), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeDoPdf(segmentos, busca)}"`,
      "Cache-Control": "no-store",
    },
  });
}
