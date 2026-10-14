import { MODULES } from "@/lib/modules";
import type { UserRole } from "@/generated/prisma/client";

/**
 * Papéis e permissões, sem nada de servidor.
 *
 * Mora separado de `lib/permissions.ts` porque a tela de permissões precisa
 * de `ROLE_PRESETS` e `rolePresetMatches` dentro de um componente cliente, e
 * aquele arquivo importa `auth` e `prisma`. Importá-lo do navegador
 * arrastaria o NextAuth e o driver do Postgres para o pacote do cliente.
 *
 * Só o tipo `UserRole` entra aqui, e tipo some na compilação.
 */

export type ModuleGrant = { moduleSlug: string; canConfigure: boolean };

export type CurrentUser = {
  id: number;
  username: string;
  name: string | null;
  role: UserRole;
  grants: ModuleGrant[];
  /** Entrou pelo link de atalhos, sem login. Nenhuma trava aceita por padrão:
      só as páginas e ações marcadas com `{ atalho: true }`. */
  atalho?: boolean;
  /** Passa em todas as travas, sem depender das permissões por módulo. Nunca
      vale para quem entrou pelo link de atalhos. */
  superusuario?: boolean;
  /** A página inicial que a pessoa montou (`lib/pagina-inicial.ts`). Vem
      junto com o usuário para a página inicial não ir ao banco de novo. */
  paginaInicial?: unknown;
};

/** As opções das travas: `configure` exige configurar o módulo; `atalho`
    libera esta página ou ação para quem entrou pelo link de atalhos. */
export type OpcoesDaTrava = { configure?: boolean; atalho?: boolean };

/**
 * "sistema" fica de fora do preset genérico dos outros papéis.
 *
 * Enquanto todo módulo era operacional, `MODULES.filter(m => m.enabled)`
 * bastava. Com "sistema" ligado, esse mesmo filtro passaria a conceder a todo
 * Gerente o poder de criar conta, redefinir senha e promover gente a Dono —
 * o oposto do que o papel promete. Quem administra usuários é só o Dono, e é
 * esta linha que sustenta a promessa.
 */
const OPERACIONAIS = MODULES.filter((m) => m.slug !== "sistema");

const ligados = (canConfigure: boolean): ModuleGrant[] =>
  OPERACIONAIS.filter((m) => m.enabled && !m.soSuperusuario).map((m) => ({
    moduleSlug: m.slug,
    canConfigure,
  }));

/**
 * O que cada papel concede — um atalho de cadastro, não a verdade.
 *
 * A verdade são as linhas em UserModulePermission. Isto só preenche o
 * formulário de uma vez; depois disso, quem manda é o que ficou gravado. Por
 * isso `rolePresetMatches` existe: quando o gravado diverge do preset, a tela
 * diz "ajustado" em vez de mentir sobre o papel.
 */
export const ROLE_PRESETS: Record<UserRole, ModuleGrant[]> = {
  // Dono vê tudo que existe, inclusive módulo ainda desligado — permissão e
  // prontidão são eixos separados. "sistema" entra por aqui, no map, e é o
  // único papel que o recebe.
  DONO: MODULES.map((m) => ({ moduleSlug: m.slug, canConfigure: true })),
  // Gerente opera e configura o que está no ar, mas não mexe em usuários.
  GERENTE: ligados(true),
  // Quem cuida do dinheiro: configura o que compra e paga.
  FINANCEIRO: ligados(true),
  // Quem está no salão: opera o dia, não muda as regras da casa. O
  // Financeiro fica de fora: mostra o saldo do banco e o que a casa deve, e
  // isso não é do caixa. Se o fechamento do dia for dele, o dono libera.
  CAIXA: ligados(false).filter((g) => g.moduleSlug !== "financeiro"),
  // Quem cuida da despensa: conta, recebe e pede — só Compras, sem mexer
  // nas regras dela (categorias, configurações, link de atalhos).
  ESTOQUISTA: [{ moduleSlug: "compras", canConfigure: false }],
};

export const ROLE_LABEL: Record<UserRole, string> = {
  DONO: "Dono",
  GERENTE: "Gerente",
  CAIXA: "Operador de caixa",
  FINANCEIRO: "Financeiro",
  ESTOQUISTA: "Estoquista",
};

/** Na ordem em que aparecem no seletor: do mais amplo ao mais restrito. */
export const ROLES: UserRole[] = ["DONO", "GERENTE", "FINANCEIRO", "CAIXA", "ESTOQUISTA"];

/** O gravado bate com o preset do papel? Se não, a tela mostra "ajustado". */
export function rolePresetMatches(role: UserRole, grants: ModuleGrant[]): boolean {
  const chave = (g: ModuleGrant) => `${g.moduleSlug}:${g.canConfigure}`;
  const preset = new Set(ROLE_PRESETS[role].map(chave));
  // Permissão de módulo que não está no registro (outro ramo, slug antigo)
  // não concede nada, e não deve marcar todo mundo como "ajustado".
  const validas = grants.filter((g) => MODULES.some((m) => m.slug === g.moduleSlug));
  return preset.size === validas.length && validas.every((g) => preset.has(chave(g)));
}

/** Esta pessoa entra neste módulo? `configure` exige o acesso às configurações. */
export function can(
  user: CurrentUser | null,
  moduleSlug: string,
  options?: OpcoesDaTrava,
): boolean {
  if (!user) return false;
  // Pelo link de atalhos, fechado por padrão: o que não pediu para abrir
  // continua fechado, inclusive o que for criado depois.
  if (user.atalho && !options?.atalho) return false;
  // Superusuário entra e configura tudo — inclusive módulo criado depois,
  // que ainda não tem permissão gravada para ninguém. O link de atalhos,
  // acima, nunca chega aqui como superusuário.
  if (user.superusuario && !user.atalho) return true;
  // Módulo só do superusuário: quem chegou até aqui não é, e a permissão
  // gravada não muda isso. Fica antes do grant de propósito: alguém pode ter
  // a linha de permissão de uma época em que o módulo era de todos, ou de um
  // clique na tela de Usuários, e não é ela que decide aqui.
  if (MODULES.find((m) => m.slug === moduleSlug)?.soSuperusuario) return false;
  const grant = user.grants.find((g) => g.moduleSlug === moduleSlug);
  if (!grant) return false;
  return options?.configure ? grant.canConfigure : true;
}

/** Módulos que esta pessoa vê na navegação: prontos E permitidos. */
export function visibleModules(user: CurrentUser | null) {
  if (!user) return [];
  return MODULES.filter((m) => m.enabled && can(user, m.slug));
}

/** Quantos dias o link de atalhos vale depois de gerado (decisão do dono). */
export const ATALHO_VALE_DIAS = 30;

/** Até quando o link gerado em `criadoEm` vale. */
export function atalhoVenceEm(criadoEm: Date): Date {
  return new Date(criadoEm.getTime() + ATALHO_VALE_DIAS * 24 * 60 * 60 * 1000);
}

/**
 * O link venceu? Sem data de criação também conta como vencido: o link sem
 * data é de antes da regra, e o certo é gerar outro.
 */
export function atalhoVencido(criadoEm: Date | null, agora: Date = new Date()): boolean {
  return criadoEm === null || agora >= atalhoVenceEm(criadoEm);
}
