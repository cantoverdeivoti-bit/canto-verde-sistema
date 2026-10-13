import {
  comEscolha,
  emailValido,
  escolhaDe,
  eventosPermitidos,
  lerPreferencias,
  PADRAO,
} from "../lib/notificacoes";

/**
 * A regra das Minhas notificações, sem banco: padrão, escolha por evento e
 * canal, JSON quebrado e permissão. Roda com
 * `npx tsx scripts/test-notificacoes.ts`.
 */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

igual("padrão: celular ligado, e-mail desligado", escolhaDe({}, "reserva-nova"), PADRAO);

let prefs = comEscolha({}, "compras-atrasado", "email", true);
igual("ligar o e-mail mantém o celular do padrão", escolhaDe(prefs, "compras-atrasado"), { celular: true, email: true });
// A divergência saiu do recebimento: herda a escolha dele até a pessoa mexer nela.
const recebiaSoEmail = { "compras-recebimento": { celular: false, email: true } };
igual("divergência herda do recebimento", escolhaDe(recebiaSoEmail, "compras-divergencia"), { celular: false, email: true });
igual("divergência com escolha própria", escolhaDe({ ...recebiaSoEmail, "compras-divergencia": { celular: true } }, "compras-divergencia"), { celular: true, email: true });
prefs = comEscolha(prefs, "compras-atrasado", "celular", false);
igual("desligar o celular mantém o e-mail", escolhaDe(prefs, "compras-atrasado"), { celular: false, email: true });
igual("outro evento continua no padrão", escolhaDe(prefs, "reserva-nova"), PADRAO);

igual("JSON quebrado vira padrão", lerPreferencias("x"), {});
igual("lista vira padrão", lerPreferencias([1, 2]), {});
igual(
  "evento que não existe e valor errado são ignorados",
  lerPreferencias({ "nao-existe": { celular: false }, "reserva-nova": { celular: "sim", email: true } }),
  { "reserva-nova": { email: true } },
);
igual(
  "JSON gravado volta igual",
  escolhaDe(lerPreferencias(JSON.parse(JSON.stringify(prefs))), "compras-atrasado"),
  { celular: false, email: true },
);

const garcom = (m: string) => m === "comercial" || m === "pessoal";
igual(
  "permissão: sem Compras não vê avisos de Compras",
  eventosPermitidos(garcom).map((e) => e.chave),
  ["reserva-nova", "reserva-cancelada", "pessoal-cadastro"],
);
igual("sem módulo nenhum, nenhum aviso", eventosPermitidos(() => false).length, 0);
const estoquista = (modulo: string, configurar: boolean) => modulo === "compras" && !configurar;
igual(
  "quem não configura Compras não recebe o pedido da rotina para enviar",
  eventosPermitidos(estoquista).some((e) => e.chave === "compras-pedido-para-enviar"),
  false,
);
igual(
  "quem configura Compras recebe",
  eventosPermitidos((m) => m === "compras").some((e) => e.chave === "compras-pedido-para-enviar"),
  true,
);

igual("e-mail certo", emailValido("dono@cantoverde.com.br"), true);
igual("e-mail sem arroba", emailValido("dono.cantoverde.com"), false);
igual("e-mail com espaço", emailValido("dono @x.com"), false);
igual("e-mail sem domínio", emailValido("dono@x"), false);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
