import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { cardapioEscolhido, gruposDoBuffet, pratosParaEscolher, semanaDoCardapio, sugestoesPendentes } from "@/lib/buffet-dados";
import { diaDaSemanaBuffet } from "@/lib/buffet-regras";
import { FUSO_DA_CASA } from "@/lib/format";
import { can } from "@/lib/permissions";

import { EscolherCardapio } from "../escolher-cardapio";
import { CardapioForm } from "./cardapio-form";
import { EditorDoCardapio } from "./editor-do-cardapio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cardápio da semana · Cardápio buffet" };

/**
 * O cardápio-modelo: de segunda a domingo, cada grupo com as posições do
 * buffet e o prato de cada uma. Vale o período inteiro (um trimestre); a troca
 * de um dia só é da Produção do dia, sem mexer aqui.
 */
export default async function CardapioDoBuffetPage({ searchParams }: PageProps<"/admin/buffet/cardapio">) {
  const q = await searchParams;
  const hoje = todayInTimezone(FUSO_DA_CASA);
  // Quem é, a lista de cardápios, os grupos e os pratos não dependem um do
  // outro: saem juntos, e só a semana espera o cardápio escolhido.
  const independentes = Promise.all([guardModule("buffet"), gruposDoBuffet(), pratosParaEscolher()]);
  independentes.catch(() => {});
  const { todos, id, vigenteHoje } = await cardapioEscolhido(q.cardapio, hoje);
  const [semana, sugeridas, [user, grupos, pratos]] = await Promise.all([
    id === null ? null : semanaDoCardapio(id),
    id === null ? [] : sugestoesPendentes({ cardapioId: id }),
    independentes,
  ]);
  const configura = can(user, "buffet", { configure: true });
  const outros = todos.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Cardápio da semana" />
      {id !== null && <EscolherCardapio todos={todos} atual={id} vigenteHoje={vigenteHoje} base="/admin/buffet/cardapio" />}
      {semana ? (
        <EditorDoCardapio
          key={semana.id}
          semana={semana}
          grupos={grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, posicoes: g.posicoes }))}
          pratos={pratos}
          outros={outros}
          diaInicial={id === vigenteHoje ? diaDaSemanaBuffet(hoje) : 1}
          podeApagar={configura}
          sugeridas={sugeridas}
        />
      ) : (
        <>
          <Vazio>Nenhum cardápio ainda. Crie o primeiro com o período em que ele vale (um trimestre, por exemplo) e os temas de cada dia.</Vazio>
          {configura && <CardapioForm id={null} outros={[]} />}
        </>
      )}
    </Pagina>
  );
}
