/**
 * Registro de módulos do ecossistema.
 *
 * Cada produto interno (comercial hoje; suprimentos, comandas, o que vier) é um módulo: um slug que vira o prefixo de rota `/admin/<slug>`,
 * e uma lista de seções que a barra lateral renderiza quando o módulo está
 * ativo. Para adicionar um módulo novo:
 *
 *   1. adicione a entrada aqui (enabled: false até estar pronto);
 *   2. crie as rotas em `app/admin/<slug>/...`;
 *   3. pronto — a home e a barra lateral leem deste arquivo.
 *
 * Nada além deste registro precisa saber quantos módulos existem.
 */

/** Os símbolos da navegação. O desenho de cada um mora em `components/icone-nav.tsx`. */
export type NomeDoIcone =
  | "agenda"
  | "programacao"
  | "pessoas"
  | "ajustes"
  | "produtos"
  | "categorias"
  | "fornecedores"
  | "contagem"
  | "listas"
  | "cotacao"
  | "carrinho"
  | "pedidos"
  | "manual"
  | "recebimentos"
  | "usuarios"
  | "financeiro"
  | "comandas"
  | "fidelidade"
  | "cadastros"
  | "relatorios"
  | "movimentacoes"
  | "historico"
  | "estoque"
  | "atalhos"
  | "pendencias"
  | "pessoal"
  | "escala"
  | "ferias"
  | "colaboradores"
  | "terceirizados"
  | "funcoes"
  | "encargos"
  | "notificacoes"
  | "inicio"
  | "chave"
  | "eventos"
  | "orcamentos"
  | "cardapios"
  | "receitas"
  | "checklist"
  | "tarefas"
  | "busca"
  | "matriz"
  | "fechamento"
  | "pagar"
  | "receber"
  | "transferencias"
  | "fluxo"
  | "dre"
  | "contas"
  | "formas"
  | "recorrencias"
  | "centros"
  | "contador"
  | "conciliacao"
  | "buffet"
  | "painel"
  | "producao"
  | "forno"
  | "mapa"
  | "operacional"
  | "processos"
  | "treinamento"
  | "epi"
  | "precos";

export type ModuleSection = {
  /** Caminho completo, ex.: "/admin/comercial/configuracoes". */
  href: string;
  label: string;
  icone: NomeDoIcone;
  /** Seções com o mesmo grupo aparecem juntas, dentro de uma linha que abre
      e fecha — "Cadastros" guarda Produtos, Categorias e Fornecedores. A
      lista continua plana: quem só quer as seções (a home, a raiz do
      módulo) não precisa saber de grupo. */
  grupo?: { nome: string; icone: NomeDoIcone };
  /** Um número no cartão, contado em `lib/contadores.ts`. */
  contador?: "pendencias" | "cadastrosPendentes" | "sugestoesBuffet" | "treinamentosPendentes";
  /** A tela pede "configurar" o módulo: o cartão some de quem não configura. */
  soQuemConfigura?: true;
};

const CADASTROS = { nome: "Cadastros", icone: "cadastros" } as const;
const MOVIMENTACOES = { nome: "Movimentações", icone: "movimentacoes" } as const;
const RELATORIOS = { nome: "Relatórios", icone: "relatorios" } as const;

export type EcosystemModule = {
  slug: string;
  name: string;
  /** Uma frase, na voz do produto: o que este módulo resolve. */
  description: string;
  /** Módulo desligado aparece na home como "em preparação" e fora da lateral. */
  enabled: boolean;
  /** Só o superusuário alcança este módulo, mesmo que alguém tenha a
      permissão gravada. `can()` em `lib/roles.ts` é quem aplica, e por ser lá
      a trava vale ao mesmo tempo para a navegação, para o layout e para as
      ações: não há um caminho que esqueça de perguntar. */
  soSuperusuario?: boolean;
  icone: NomeDoIcone;
  sections: ModuleSection[];
};

export const MODULES: EcosystemModule[] = [
  {
    slug: "comercial",
    name: "Reservas",
    description: "Quem vem hoje, quem já veio, e as regras da casa.",
    enabled: true,
    icone: "agenda",
    // A agenda mora na raiz do módulo, não numa subrota. É a tela que o dono
    // abre dezenas de vezes por serviço, e um clique a mais todo dia é caro.
    //
    // "Reservas do dia", e não "Agenda": a Agenda é a de toda a casa, no
    // menu principal, junto do Painel central.
    sections: [
      { href: "/admin/comercial", label: "Reservas do dia", icone: "agenda" },
      { href: "/admin/comercial/crm", label: "CRM", icone: "pessoas" },
      { href: "/admin/comercial/configuracoes", label: "Configurações", icone: "ajustes" },
    ],
  },

  {
    slug: "compras",
    name: "Compras",
    description:
      "O ciclo do insumo: o que está faltando, quanto custa em cada fornecedor, o que foi comprado e o que entrou.",
    enabled: true,
    icone: "carrinho",
    // O dia a dia em cima (pendências), depois o trabalho da semana na ordem
    // em que acontece, o que se consulta, o que se cadastra e, por fim, os
    // ajustes. A mesma ordem vale para os cartões dos atalhos do módulo e
    // para a lista "Todas as telas" da página inicial.
    sections: [
      // O que espera por alguém: aprovar, resolver, completar cadastro. O
      // número ao lado é só o que pede decisão.
      { href: "/admin/compras/pendencias", label: "Pendências", icone: "pendencias", contador: "pendencias" },
      // Movimentações: tudo que faz mercadoria andar, na ordem da semana.
      // Contar vem primeiro — é por aqui que a semana de compra começa.
      { href: "/admin/compras/contagem", label: "Contar estoque", icone: "contagem", grupo: MOVIMENTACOES },
      // O que se pede sempre ao mesmo fornecedor num dia da semana (eram as
      // "listas de compra"; a rota continua /listas).
      { href: "/admin/compras/listas", label: "Compras de rotina", icone: "listas", grupo: MOVIMENTACOES },
      { href: "/admin/compras/cotacao", label: "Fazer cotação", icone: "cotacao", grupo: MOVIMENTACOES },
      // A compra que não nasce da contagem: o que acabou no meio da semana, a
      // encomenda por telefone.
      { href: "/admin/compras/pedido-manual", label: "Pedido manual", icone: "manual", grupo: MOVIMENTACOES },
      // Onde os pedidos de todas as origens esperam para ser mandados: vem
      // depois de cotar e pedir, e antes de receber.
      { href: "/admin/compras/pedidos", label: "Pedidos", icone: "pedidos", grupo: MOVIMENTACOES },
      // Quem recebe mercadoria não procura a rodada que originou o pedido;
      // procura o nome do fornecedor.
      { href: "/admin/compras/recebimentos", label: "Receber pedidos", icone: "recebimentos", grupo: MOVIMENTACOES },
      // Um item só: abre no Painel, e as abas (cotações, pedidos, preços,
      // fornecedores, contagens, balanço, consumo) fazem o resto. Fica
      // marcado em qualquer aba, porque o menu marca pelo começo do endereço.
      { href: "/admin/compras/relatorios", label: "Relatórios", icone: "relatorios" },
      // Cadastros depois do trabalho: cadastra-se uma vez, conta-se e
      // pede-se toda semana.
      { href: "/admin/compras", label: "Produtos", icone: "produtos", grupo: CADASTROS },
      { href: "/admin/compras/categorias", label: "Categorias", icone: "categorias", grupo: CADASTROS },
      { href: "/admin/compras/fornecedores", label: "Fornecedores", icone: "fornecedores", grupo: CADASTROS },
      { href: "/admin/compras/configuracoes", label: "Configurações", icone: "ajustes", soQuemConfigura: true },
    ],
  },

  {
    slug: "pessoal",
    name: "Departamento pessoal",
    description: "Quem trabalha em cada posto do almoço, quem folga e quem sai de férias.",
    enabled: true,
    icone: "pessoal",
    // A escala na raiz: é a tela que se abre toda semana. Férias depois, e o
    // cadastro por último, como em Compras. Pendências logo abaixo da escala:
    // é o que espera alguém decidir, mas não pode ser a primeira, porque a
    // primeira seção é onde o módulo abre.
    sections: [
      { href: "/admin/pessoal", label: "Escala", icone: "escala" },
      { href: "/admin/pessoal/pendencias", label: "Pendências", icone: "pendencias", contador: "cadastrosPendentes" },
      { href: "/admin/pessoal/ferias", label: "Férias", icone: "ferias" },
      { href: "/admin/pessoal/epi", label: "EPI e uniformes", icone: "epi" },
      { href: "/admin/pessoal/relatorios", label: "Relatórios", icone: "relatorios" },
      { href: "/admin/pessoal/colaboradores", label: "Colaboradores", icone: "colaboradores", grupo: CADASTROS },
      // A empresa que manda garçons quando falta alguém: entra na escala, mas não é colaborador.
      { href: "/admin/pessoal/terceirizados", label: "Terceirizados", icone: "terceirizados", grupo: CADASTROS },
      { href: "/admin/pessoal/funcoes", label: "Funções", icone: "funcoes", grupo: CADASTROS },
      { href: "/admin/pessoal/encargos-e-beneficios", label: "Encargos e descontos", icone: "encargos", grupo: CADASTROS },
      { href: "/admin/pessoal/configuracoes", label: "Configurações", icone: "ajustes", soQuemConfigura: true },
    ],
  },

  {
    slug: "eventos",
    name: "Eventos",
    description: "O salão à noite para festa, jantar de empresa e formatura: do orçamento ao evento realizado.",
    enabled: true,
    icone: "eventos",
    // A agenda na raiz: é o que se abre para saber o que vem pela frente.
    // Orçamentos logo depois, porque é onde o trabalho da semana acontece, e
    // o CRM junto. Os cadastros (receitas, cardápios, checklists) se fazem uma
    // vez e se usam em todo orçamento.
    sections: [
      { href: "/admin/eventos", label: "Próximos eventos", icone: "agenda" },
      { href: "/admin/eventos/orcamentos", label: "Orçamentos", icone: "orcamentos" },
      { href: "/admin/eventos/clientes", label: "CRM", icone: "pessoas" },
      { href: "/admin/eventos/cardapios", label: "Cardápios", icone: "cardapios", grupo: CADASTROS },
      { href: "/admin/eventos/receitas", label: "Receitas", icone: "receitas", grupo: CADASTROS },
      { href: "/admin/eventos/checklists", label: "Checklists", icone: "checklist", grupo: CADASTROS },
      { href: "/admin/eventos/configuracoes", label: "Configurações", icone: "ajustes", soQuemConfigura: true },
    ],
  },

  {
    slug: "tarefas",
    name: "Tarefas",
    description:
      "O que precisa ser feito, quem vai fazer e em que pé está — com o histórico de cada cartão.",
    /* Do superusuário, por decisão do dono: admin e jonathan usam o
       módulo, e ninguém mais o vê. A conversa com a equipe sobre largar o
       TickTick ainda não aconteceu, e até lá o quadro é ferramenta de quem
       administra a casa, não da equipe.

       `enabled: true` porque o módulo está pronto e quem pode usá-lo usa; a
       restrição é `soSuperusuario`, que `can()` aplica para todo mundo. */
    enabled: true,
    soSuperusuario: true,
    icone: "tarefas",
    // Três seções fixas, e nenhuma delas é um quadro: os quadros vêm do banco
    // e mudam quando alguém cria um, e a barra lateral lê deste arquivo, que é
    // código. A lista deles é renderizada pela própria tela de Quadros.
    //
    // Buscar vem antes de Matriz porque é o que se usa todo dia; a matriz é
    // uma leitura de vez em quando, para decidir por onde começar.
    sections: [
      { href: "/admin/tarefas", label: "Quadros", icone: "tarefas" },
      { href: "/admin/tarefas/lista", label: "Buscar", icone: "busca" },
      { href: "/admin/tarefas/matriz", label: "Matriz", icone: "matriz" },
    ],
  },

  {
    slug: "financeiro",
    name: "Financeiro",
    description: "O dinheiro que entra e o que sai, e o que sobra no fim do mês.",
    enabled: true,
    icone: "financeiro",
    // O painel na raiz: saldo e o que vence é o que se olha todo dia. Depois
    // o trabalho do dia (fechar o PDV, pagar, receber), os relatórios do mês
    // e os cadastros, como nos outros módulos. Contas, categorias e formas
    // mudam as contas de todo mundo: só quem configura mexe.
    sections: [
      { href: "/admin/financeiro", label: "Painel", icone: "financeiro" },
      { href: "/admin/financeiro/fechamento", label: "Fechamento do dia", icone: "fechamento", grupo: MOVIMENTACOES },
      { href: "/admin/financeiro/pagar", label: "Contas a pagar", icone: "pagar", grupo: MOVIMENTACOES },
      { href: "/admin/financeiro/receber", label: "Contas a receber", icone: "receber", grupo: MOVIMENTACOES },
      { href: "/admin/financeiro/transferencias", label: "Transferências", icone: "transferencias", grupo: MOVIMENTACOES },
      { href: "/admin/financeiro/conciliacao", label: "Conciliação bancária", icone: "conciliacao", grupo: MOVIMENTACOES },
      { href: "/admin/financeiro/fluxo-de-caixa", label: "Fluxo de caixa", icone: "fluxo", grupo: RELATORIOS },
      { href: "/admin/financeiro/dre", label: "DRE", icone: "dre", grupo: RELATORIOS },
      { href: "/admin/financeiro/contador", label: "Contador", icone: "contador", grupo: RELATORIOS },
      { href: "/admin/financeiro/contas-fixas", label: "Contas fixas", icone: "recorrencias", grupo: CADASTROS },
      { href: "/admin/financeiro/contas", label: "Contas e saldos", icone: "contas", grupo: CADASTROS, soQuemConfigura: true },
      { href: "/admin/financeiro/categorias", label: "Plano de contas", icone: "categorias", grupo: CADASTROS, soQuemConfigura: true },
      { href: "/admin/financeiro/formas", label: "Formas de recebimento", icone: "formas", grupo: CADASTROS, soQuemConfigura: true },
      { href: "/admin/financeiro/centros", label: "Centros de custo", icone: "centros", grupo: CADASTROS, soQuemConfigura: true },
    ],
  },

  {
    slug: "buffet",
    name: "Cardápio buffet",
    description: "O buffet do almoço: o cardápio da semana, o custo por kg de cada dia e os pratos da casa.",
    enabled: true,
    icone: "buffet",
    // O painel na raiz: o custo por kg da semana é o que se confere. Depois o
    // trabalho do dia, o cardápio, que se monta uma vez por trimestre, e os
    // pratos, que se cadastram uma vez. Grupos, temas e limites mudam o painel de todo
    // mundo: só quem configura mexe.
    sections: [
      { href: "/admin/buffet", label: "Painel", icone: "painel" },
      // O que o colaborador mudou e espera aprovação; para ele, o que mandou e em que pé está.
      { href: "/admin/buffet/sugestoes", label: "Sugestões", icone: "pendencias", contador: "sugestoesBuffet" },
      // O dia da cozinha: o que vai no buffet, como sai do forno e onde fica.
      { href: "/admin/buffet/producao", label: "Produção do dia", icone: "producao" },
      { href: "/admin/buffet/forno", label: "Fluxo do forno", icone: "forno" },
      { href: "/admin/buffet/pre-preparos", label: "Pré-preparos", icone: "checklist" },
      { href: "/admin/buffet/mapa", label: "Mapa do buffet", icone: "mapa" },
      { href: "/admin/buffet/cardapio", label: "Cardápio da semana", icone: "cardapios" },
      { href: "/admin/buffet/pratos", label: "Pratos", icone: "receitas", grupo: CADASTROS },
      { href: "/admin/buffet/configuracoes", label: "Configurações", icone: "ajustes", soQuemConfigura: true },
    ],
  },

  {
    slug: "receituario",
    name: "Receituário",
    description: "As receitas da casa num lugar só: ficha técnica com custo e ficha operacional para a cozinha.",
    enabled: true,
    icone: "receitas",
    // As fichas na raiz: é o que a cozinha abre. Os insumos são o cadastro
    // de preço, visitado de vez em quando.
    sections: [
      { href: "/admin/receituario", label: "Fichas", icone: "receitas" },
      // Encomenda e delivery: o preço de venda com o custo de hoje.
      { href: "/admin/receituario/precos", label: "Lista de preços", icone: "precos", soQuemConfigura: true },
      { href: "/admin/receituario/insumos", label: "Insumos", icone: "produtos", soQuemConfigura: true },
      { href: "/admin/receituario/configuracoes", label: "Configurações", icone: "ajustes", soQuemConfigura: true },
    ],
  },
  {
    slug: "operacional",
    name: "Operacional",
    description: "Os checklists para pendurar no lugar, o que cada função faz, os processos da casa e quem já foi treinado.",
    enabled: true,
    icone: "operacional",
    // As funções na raiz, os checklists (listas soltas para imprimir) logo
    // depois. Os processos e o treinamento vêm no fim, porque se montam uma
    // vez e se consultam.
    sections: [
      { href: "/admin/operacional", label: "Funções", icone: "funcoes" },
      { href: "/admin/operacional/checklists", label: "Checklists", icone: "checklist" },
      { href: "/admin/operacional/processos", label: "Processos", icone: "processos" },
      { href: "/admin/operacional/treinamento", label: "Treinamento", icone: "treinamento", contador: "treinamentosPendentes" },
    ],
  },

  // --- exemplos de próximos módulos (placeholders deliberados) ------------
  // Troque enabled para true quando as rotas existirem em app/admin/<slug>.
  {
    slug: "comandas",
    name: "Comandas",
    description: "Pedidos da mesa até a cozinha, sem papel.",
    enabled: false,
    icone: "comandas",
    sections: [],
  },
  {
    slug: "fidelidade",
    name: "Fidelidade",
    description: "Quem volta sempre merece saber que a casa percebeu.",
    enabled: false,
    icone: "fidelidade",
    sections: [],
  },

  // Por último de propósito: os outros são o trabalho da casa, este é quem
  // pode fazer o trabalho. Fica no pé da lateral, perto do "Sair".
  {
    // O slug continua "sistema" com o rótulo "Configurações gerais", como
    // "comercial" se chama "Reservas". O nome é da tela; o slug está gravado
    // em toda linha de permissão no banco, e renomeá-lo custaria uma
    // migração de dados — foi o que "suprimentos" virando "compras" cobrou.
    slug: "sistema",
    name: "Configurações gerais",
    description: "Quem entra na casa, e o que cada um pode ver e mudar.",
    enabled: true,
    icone: "ajustes",
    sections: [
      { href: "/admin/sistema/usuarios", label: "Usuários", icone: "usuarios", soQuemConfigura: true },
      // Cada pessoa edita a sua: a guarda de "configurar" fica só em Usuários.
      { href: "/admin/sistema/pagina-inicial", label: "Página inicial", icone: "inicio" },
      { href: "/admin/sistema/notificacoes", label: "Minhas notificações", icone: "notificacoes" },
      { href: "/admin/sistema/acesso-do-claude", label: "Acesso do Claude", icone: "chave" },
    ],
  },
];

/**
 * A tela de atalhos do módulo: é para onde o módulo leva no menu. Os cartões
 * dela são as seções (`components/atalhos-do-modulo.tsx`), que não aparecem
 * mais como lista no menu.
 */
export const atalhosDo = (slug: string) => `/admin/${slug}/atalhos`;

/**
 * As seções como a lista do menu mostra: "Atalhos" primeiro, depois as do
 * módulo. Atalhos fica fora de `sections` porque os cartões saem de lá, e a
 * tela de atalhos não teria por que mostrar um cartão para ela mesma.
 */
export function secoesDoMenu(m: EcosystemModule): ModuleSection[] {
  return [{ href: atalhosDo(m.slug), label: "Atalhos", icone: "atalhos" }, ...m.sections];
}

/**
 * Módulo dono do caminho atual, ex.: "/admin/comercial/crm" -> comercial.
 *
 * Ancorado: um `startsWith` cru faria "/admin/comercialX" casar com
 * "comercial". Hoje nenhum slug é prefixo de outro, mas isto aqui decide
 * navegação e um dia decidirá permissão — o palpite sai caro depois.
 */
export function moduleForPath(pathname: string): EcosystemModule | undefined {
  return MODULES.find((m) => {
    if (!m.enabled) return false;
    const base = `/admin/${m.slug}`;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

export type ItemDeNavegacao =
  | { tipo: "secao"; secao: ModuleSection }
  | { tipo: "grupo"; nome: string; icone: NomeDoIcone; secoes: ModuleSection[] };

/** As seções como a navegação desenha: soltas, ou juntas no grupo delas. */
export function agruparSecoes(secoes: ModuleSection[]): ItemDeNavegacao[] {
  const itens: ItemDeNavegacao[] = [];
  for (const s of secoes) {
    if (!s.grupo) {
      itens.push({ tipo: "secao", secao: s });
      continue;
    }
    const grupo = itens.find(
      (i): i is Extract<ItemDeNavegacao, { tipo: "grupo" }> => i.tipo === "grupo" && i.nome === s.grupo!.nome,
    );
    if (grupo) grupo.secoes.push(s);
    else itens.push({ tipo: "grupo", nome: s.grupo.nome, icone: s.grupo.icone, secoes: [s] });
  }
  return itens;
}

/** "/admin/compras/relatorios/consumo" -> "/admin/compras/relatorios". */
function pastaDa(caminho: string) {
  return caminho.split("/").slice(0, 4).join("/");
}

/**
 * O grupo a que uma tela pertence, mesmo quando ela não é item do menu: uma
 * tela na pasta de um item de grupo fica com o grupo dele. Vale só para pasta
 * própria (quatro níveis), para "/admin/compras" não virar o grupo de tudo.
 */
export function grupoDaTela(secoes: ModuleSection[], caminho: string) {
  const pasta = pastaDa(caminho);
  return (
    secoes.find((s) => s.grupo && s.href.split("/").length >= 4 && pastaDa(s.href) === pasta)?.grupo ?? null
  );
}
