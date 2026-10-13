import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import {
  NOME_DA_AREA,
  custoDaSemana,
  diaDaSemana,
  quemNaCelula,
  segundaDaSemana,
  somarDias,
  textoDoWhatsApp,
  type Area,
  type Aviso,
} from "@/lib/escala";
import { contaDaMaoDeObra, garantirRegistroDoMes } from "@/lib/cmo-do-banco";
import { carregarSemana } from "@/lib/escala-do-banco";
import { dateString } from "@/lib/validations";
import { can } from "@/lib/roles";

import { EscalaDaSemana, type DadosDaEscala } from "./escala-da-semana";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escala · Departamento pessoal" };

const SIGLA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const POR_EXTENSO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * A escala do almoço, uma semana por vez (segunda a domingo). A semana fixa
 * vem da planilha de sempre; a exceção de uma data e as férias se aplicam por
 * cima dela. A tela só mostra e escolhe: a conta mora em `lib/escala.ts`.
 */
export default async function EscalaPage({ searchParams }: PageProps<"/admin/pessoal">) {
  const user = await guardModule("pessoal");
  const podeConfigurar = can(user, "pessoal", { configure: true });
  const { capacity } = await getSettings();
  const hoje = todayInTimezone(capacity.timezone);
  const q = await searchParams;
  const pedida = typeof q.semana === "string" && dateString.safeParse(q.semana).success ? q.semana : hoje;
  const segunda = segundaDaSemana(pedida);
  const domingo = somarDias(segunda, 6);

  const [{ semana, postos, pessoas, terceirizados }] = await Promise.all([
    carregarSemana(segunda),
    // A escala abre toda semana: é o que garante que nenhum mês fique sem o registro do CMO.
    garantirRegistroDoMes(),
  ]);
  // O custo com encargos e o orçamento só para quem configura: mostram salários.
  const conta = podeConfigurar ? await contaDaMaoDeObra(hoje, semana.dias) : null;

  const nome = (id: number) => pessoas.find((p) => p.id === id)?.nome ?? "?";
  const nomeDoPosto = (id: number) => postos.find((p) => p.id === id)?.nome ?? "?";
  const quando = (d: string) => `${POR_EXTENSO[diaDaSemana(d)]} ${ddmm(d)}`;
  const textoDoAviso = (a: Aviso): string => {
    if (a.tipo === "sem-folga") return `${nome(a.colaboradorId)} trabalha os 7 dias, sem folga na semana.`;
    if (a.tipo === "fora-do-dia") {
      return `${quando(a.data)}: ${nome(a.colaboradorId)} está em ${nomeDoPosto(a.postoId)}, mas não é dia de trabalho dele no cadastro.`;
    }
    if (a.tipo === "duplo") {
      return `${quando(a.data)}: ${nome(a.colaboradorId)} está em ${a.postoIds.map(nomeDoPosto).join(" e ")}.`;
    }
    const porque = a.motivo === "ferias" ? "de férias" : a.motivo === "desligado" ? "desligado" : "tirado só neste dia";
    return `${quando(a.data)}: ${nomeDoPosto(a.postoId)} sem ninguém (${nome(a.quem)} ${porque}).`;
  };

  const dados: DadosDaEscala = {
    titulo: `${ddmm(segunda)} a ${ddmm(domingo)}`,
    anterior: somarDias(segunda, -7),
    seguinte: somarDias(segunda, 7),
    atual: segunda === segundaDaSemana(hoje),
    dias: semana.dias.map((d) => ({ data: d, sigla: SIGLA[diaDaSemana(d)], extenso: POR_EXTENSO[diaDaSemana(d)], ddmm: ddmm(d), hoje: d === hoje })),
    areas: (["COZINHA", "SALAO"] as Area[]).map((area) => ({
      area,
      nome: NOME_DA_AREA[area],
      postos: postos
        .filter((p) => p.area === area)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          celulas: semana.celulas.get(p.id)!.map((c) => ({
            colaboradorId: c.colaboradorId,
            terceirizadoId: c.terceirizadoId,
            nome: quemNaCelula(semana, pessoas, c),
            origem: c.origem,
            ausente: c.ausente ? `${nome(c.ausente.colaboradorId)} ${c.ausente.motivo === "ferias" ? "de férias" : "desligado"}` : null,
            fechado: c.fechado,
          })),
        })),
    })),
    folgas: semana.folgas.map((ids) => ids.map(nome)),
    semPosto: semana.semPosto.map((ids) => ids.map(nome)),
    ferias: semana.deFerias.map((ids) => ids.map(nome)),
    avisos: semana.avisos.map(textoDoAviso),
    pessoas: pessoas
      .filter((p) => p.ativo)
      .map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo, area: p.area, diasDeTrabalho: p.diasDeTrabalho ?? [] })),
    terceirizados: terceirizados.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome, area: t.area })),
    custo: conta
      ? {
          ...custoDaSemana(semana, postos, pessoas, conta.custos),
          orcamentoPorDia: conta.orcamentos,
          orcamento: conta.orcamentos.every((o) => o !== null)
            ? Math.round(conta.orcamentos.reduce((s, o) => s + o!, 0) * 100) / 100
            : null,
          meta: conta.meta,
        }
      : null,
    textoWhatsApp: textoDoWhatsApp(semana, postos, pessoas),
    semColaboradores: pessoas.filter((p) => p.ativo).length === 0,
  };

  return <EscalaDaSemana dados={dados} />;
}
