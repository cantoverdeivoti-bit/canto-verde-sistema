import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { buscarTarefas, quadrosVisiveis } from "@/lib/tarefas-consulta";
import { situacaoDoPrazo } from "@/lib/tarefas-labels";

import { ListaTarefas, type LinhaTarefa } from "./lista-tarefas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar — Tarefas" };

const TETO = 500;

/**
 * A busca e a visão em lista — a mesma tela.
 *
 * Separá-las seria construir duas telas que respondem a mesma pergunta com
 * meia resposta cada: a lista sem busca não serve com centenas de tarefas, e a
 * busca sem os filtros de quadro e pessoa devolve tudo misturado.
 *
 * Os filtros de quadro, pessoa e situação vão pela URL, e não em estado de
 * tela. É o que faz "as atrasadas do delivery" ser um endereço que se manda
 * por WhatsApp — e é como o quadro aponta para cá já recortado.
 */
export default async function BuscaPage({ searchParams }: PageProps<"/admin/tarefas/lista">) {
  const user = await guardModule("tarefas");
  const { q, projeto, responsavel, encerradas, atrasadas } = await searchParams;

  const umNumero = (v: string | string[] | undefined) => {
    const n = Number(Array.isArray(v) ? v[0] : v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const ligado = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) === "1";

  const projetoId = umNumero(projeto);
  const responsavelId = umNumero(responsavel);

  const [tarefas, { capacity }, quadros, pessoas] = await Promise.all([
    buscarTarefas(user, {
      projetoId,
      responsavelId,
      incluirEncerradas: ligado(encerradas),
      soAtrasadas: ligado(atrasadas),
      limite: TETO,
    }),
    getSettings(),
    prisma.projeto.findMany({
      where: { arquivadoEm: null, ...quadrosVisiveis(user) },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.adminUser.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { username: "asc" }],
      select: { id: true, name: true, username: true },
    }),
  ]);

  const agora = new Date();
  const timezone = capacity.timezone;

  const linhas: LinhaTarefa[] = tarefas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    // A descrição não vai para a tela, mas entra na busca: quem procura
    // "botijão" pode ter escrito isso só no detalhe.
    descricao: t.descricao ?? "",
    quadro: t.projeto.nome,
    quadroId: t.projeto.id,
    coluna: t.coluna.nome,
    status: t.status,
    prioridade: t.prioridade,
    responsavel: t.responsavel?.name ?? t.responsavel?.username ?? null,
    prazo: situacaoDoPrazo(t.prazo, t.prazoDiaInteiro, timezone, agora),
  }));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Buscar"
        subtitulo="Todas as tarefas de todos os quadros, numa lista só."
        ajuda={<>Escreva sem acento se for mais rápido: &quot;manutencao&quot; acha &quot;Manutenção&quot;.</>}
      />

      <ListaTarefas
        linhas={linhas}
        quadros={quadros}
        pessoas={pessoas.map((p) => ({ id: p.id, nome: p.name ?? p.username }))}
        inicial={{
          q: (Array.isArray(q) ? q[0] : q) ?? "",
          projetoId,
          responsavelId,
          encerradas: ligado(encerradas),
          atrasadas: ligado(atrasadas),
        }}
        cortado={linhas.length >= TETO}
        souEu={user.id}
      />
    </Pagina>
  );
}
