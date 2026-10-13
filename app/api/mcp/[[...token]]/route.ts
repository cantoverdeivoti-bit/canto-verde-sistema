import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { tokenDaChamada, usuarioDoToken } from "@/lib/mcp/acesso";
import { registrarFerramentas } from "@/lib/mcp/ferramentas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * O servidor MCP do app: o Claude (ou outro assistente que fale MCP)
 * consulta o restaurante por aqui, só para ler.
 *
 * O login é o token criado em Configurações gerais → Acesso do Claude, no
 * cabeçalho `Authorization: Bearer` ou no fim do endereço
 * (`/api/mcp/<token>`), para o conector que não deixa pôr cabeçalho. Sem
 * token válido, nada responde. Fora do `proxy.ts`, que só cobre `/admin`.
 */
const servidor = createMcpHandler(registrarFerramentas, {
  serverInfo: { name: "canto-verde", version: "1.0.0" },
  instructions:
    "Dados do restaurante Canto Verde (Ivoti/RS): reservas, compras, estoque e equipe. Só leitura. Datas em AAAA-MM-DD, no fuso de Brasília.",
});

const handler = withMcpAuth(
  servidor,
  async (req, bearer) => {
    const usuario = await usuarioDoToken(tokenDaChamada(req, bearer));
    if (!usuario) return undefined;
    return { token: "", clientId: `usuario-${usuario.id}`, scopes: ["ler"], extra: { usuario } };
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };
