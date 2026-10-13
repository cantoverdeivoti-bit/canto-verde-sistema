import { abrePeloAtalho } from "../lib/auth.config";
import { ATALHO_VALE_DIAS, atalhoVencido, can, type CurrentUser } from "../lib/roles";

/**
 * A trava do link de atalhos, sem banco: quem entra pelo link só passa onde a
 * página ou a ação pediu `{ atalho: true }` — e nunca em configurar nem em
 * outro módulo. Quem está logado de verdade não muda de comportamento.
 */

let falhas = 0;
function check(rotulo: string, ok: boolean) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}`);
}

const atalho: CurrentUser = {
  id: 1,
  username: "atalho",
  name: "Atalhos",
  role: "GERENTE",
  grants: [{ moduleSlug: "compras", canConfigure: false }],
  atalho: true,
};
const dono: CurrentUser = {
  id: 1,
  username: "dono",
  name: "Dono",
  role: "DONO",
  grants: [
    { moduleSlug: "compras", canConfigure: true },
    { moduleSlug: "reservas", canConfigure: true },
  ],
};

check("atalho: Compras sem marcar → fechado", can(atalho, "compras") === false);
check("atalho: Compras marcado atalho → aberto", can(atalho, "compras", { atalho: true }) === true);
check("atalho: configurar Compras, mesmo marcado → fechado", can(atalho, "compras", { atalho: true, configure: true }) === false);
check("atalho: outro módulo marcado → fechado", can(atalho, "reservas", { atalho: true }) === false);
check("atalho: sistema → fechado", can(atalho, "sistema", { atalho: true }) === false);
check("dono: Compras sem marcar → aberto", can(dono, "compras") === true);
check("dono: Compras marcado atalho → aberto", can(dono, "compras", { atalho: true }) === true);
check("dono: configurar Compras → aberto", can(dono, "compras", { configure: true }) === true);
check("ninguém → fechado", can(null, "compras", { atalho: true }) === false);

// Superusuário: tudo, sem permissão gravada — inclusive módulo que ainda não existe.
const superusuario: CurrentUser = { id: 2, username: "chefe", name: null, role: "DONO", grants: [], superusuario: true };
check("superusuário: configurar sistema sem permissão gravada → aberto", can(superusuario, "sistema", { configure: true }) === true);
check("superusuário: módulo novo, sem permissão de ninguém → aberto", can(superusuario, "modulo-novo", { configure: true }) === true);
// O link de atalhos nunca é superusuário, mesmo que a marca venha junto por engano.
check("link de atalhos com a marca de superusuário → continua fechado", can({ ...atalho, superusuario: true }, "reservas", { atalho: true }) === false);
check("link de atalhos com a marca → não configura Compras", can({ ...atalho, superusuario: true }, "compras", { atalho: true, configure: true }) === false);

// Os endereços que o link abre: contar, receber e Requisição (decisão do dono),
// mais a página de UM pedido, de onde o pedido da Requisição sai pelo WhatsApp.
for (const aberto of [
  "/admin/compras/contagem",
  "/admin/compras/recebimentos",
  "/admin/compras/recebimentos/sem-pedido",
  "/admin/compras/listas",
  "/admin/compras/listas/nova",
  "/admin/compras/listas/3",
  "/admin/compras/listas/7/pedido",
  "/admin/compras/pedidos/42",
  "/admin/compras/pedidos/42/lista",
]) {
  check(`link abre ${aberto}`, abrePeloAtalho(aberto));
}
for (const fechado of [
  "/admin/compras",
  "/admin/compras/pedidos",
  "/admin/compras/pedidos/42/outra",
  "/admin/compras/cotacao",
  "/admin/compras/cotacao/5",
  "/admin/compras/conferir",
  "/admin/compras/enviar",
  "/admin/compras/pedido-manual",
  "/admin/compras/pendencias",
  "/admin/compras/relatorios",
  "/admin/compras/listasx",
]) {
  check(`link NÃO abre ${fechado}`, !abrePeloAtalho(fechado));
}

// Validade: trinta dias depois de gerado.
const criado = new Date("2026-10-01T12:00:00.000Z");
const dia = 24 * 60 * 60 * 1000;
check("validade é de 30 dias", ATALHO_VALE_DIAS === 30);
check("link de ontem vale", !atalhoVencido(criado, new Date(criado.getTime() + dia)));
check("no 29º dia ainda vale", !atalhoVencido(criado, new Date(criado.getTime() + 29 * dia)));
check("no 30º dia venceu", atalhoVencido(criado, new Date(criado.getTime() + 30 * dia)));
check("link sem data de criação conta como vencido", atalhoVencido(null));

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
