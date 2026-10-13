import { prisma } from "../lib/db";
import { hashDoToken, tokenDaChamada, usuarioDoToken } from "../lib/mcp/acesso";
import { novoToken } from "../lib/token";

/**
 * O token do MCP, no banco: válido, revogado, de conta desligada, com
 * formato errado, e de onde ele é lido (cabeçalho ou endereço). Cria uma
 * conta de teste e a apaga no fim. Só no banco local:
 * `source /var/tmp/pgrender/env.sh && npx tsx scripts/test-acesso-do-claude.ts`.
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

const USUARIO = "teste-acesso-claude";

async function main() {
  await prisma.adminUser.deleteMany({ where: { username: USUARIO } });
  const u = await prisma.adminUser.create({
    data: { username: USUARIO, passwordHash: "x", permissions: { create: { moduleSlug: "compras" } } },
  });
  const valido = novoToken();
  const revogado = novoToken();
  await prisma.tokenDeAcesso.createMany({
    data: [
      { userId: u.id, nome: "valido", hash: hashDoToken(valido) },
      { userId: u.id, nome: "revogado", hash: hashDoToken(revogado), revogadoEm: new Date() },
    ],
  });

  const r = await usuarioDoToken(valido);
  igual("token válido: a pessoa, com as permissões", r && { id: r.id, grants: r.grants }, {
    id: u.id,
    grants: [{ moduleSlug: "compras", canConfigure: false }],
  });
  igual("token válido grava o último uso", (await prisma.tokenDeAcesso.findFirst({ where: { nome: "valido", userId: u.id } }))?.usadoEm !== null, true);
  igual("token revogado: nada", await usuarioDoToken(revogado), null);
  igual("token que não existe: nada", await usuarioDoToken(novoToken()), null);
  igual("formato errado: nada", await usuarioDoToken("abc"), null);
  igual("sem token: nada", await usuarioDoToken(undefined), null);

  await prisma.adminUser.update({ where: { id: u.id }, data: { isActive: false } });
  igual("conta desligada: nada", await usuarioDoToken(valido), null);

  const req = (url: string) => new Request(url);
  igual("lê do cabeçalho", tokenDaChamada(req("https://x/api/mcp"), valido), valido);
  igual("lê do fim do endereço", tokenDaChamada(req(`https://x/api/mcp/${valido}`)), valido);
  igual("endereço sem token", tokenDaChamada(req("https://x/api/mcp")), null);
  igual("cabeçalho errado cai no endereço", tokenDaChamada(req(`https://x/api/mcp/${valido}`), "lixo"), valido);

  await prisma.adminUser.delete({ where: { id: u.id } });
}

main()
  .catch(async (e) => {
    console.error(e);
    falhas++;
    await prisma.adminUser.deleteMany({ where: { username: USUARIO } }).catch(() => {});
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (falhas > 0) {
      console.log(`\n${falhas} falha(s).`);
      process.exit(1);
    }
    console.log("\nTudo certo.");
  });
