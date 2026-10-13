import { NextResponse } from "next/server";

import { detectarTipo, nomeDoAnexo, TETO_DO_ANEXO } from "@/lib/anexos";
import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";
import { papelNaTarefa } from "@/lib/tarefas-acesso";
import { podeNaTarefa } from "@/lib/tarefas-permissoes";

export const dynamic = "force-dynamic";

/**
 * Sobe um anexo de uma tarefa: a foto do serviço feito, o PDF do orçamento.
 *
 * Rota, e não ação de servidor, pelo mesmo motivo dos anexos do Financeiro:
 * a ação aceita até 1 MB no corpo, e foto e PDF passam disso. A guarda é
 * explícita porque rota não passa pelo layout do módulo: o módulo (que traz
 * a trava de superusuário), e depois a permissão de anexar nesta tarefa.
 *
 * Só foto e PDF. XML, que o Financeiro aceita por causa da nota fiscal, aqui
 * não tem para quê.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "tarefas")) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Arquivo grande demais ou envio interrompido. Tente de novo." },
      { status: 400 },
    );
  }
  const tarefaId = Number(form.get("tarefaId"));
  const arquivo = form.get("arquivo");
  if (!Number.isInteger(tarefaId) || tarefaId <= 0 || !(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ ok: false, message: "Escolha um arquivo." }, { status: 400 });
  }
  if (arquivo.size > TETO_DO_ANEXO) {
    return NextResponse.json(
      { ok: false, message: "O arquivo passa de 4 MB. Mande uma foto ou um PDF menor." },
      { status: 413 },
    );
  }

  const acesso = await papelNaTarefa(user, tarefaId);
  if (!acesso) {
    return NextResponse.json(
      { ok: false, message: "Essa tarefa não existe mais. Recarregue a página." },
      { status: 404 },
    );
  }
  if (!podeNaTarefa(acesso.papel, "anexar", acesso.ehMinha)) {
    return NextResponse.json(
      { ok: false, message: "Você não tem permissão para anexar neste quadro." },
      { status: 403 },
    );
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipo(bytes);
  if (!tipo || tipo.mime === "application/xml") {
    return NextResponse.json(
      { ok: false, message: "Só foto (JPG, PNG, WEBP) ou PDF." },
      { status: 415 },
    );
  }

  const nome = nomeDoAnexo(arquivo.name, tipo);
  const anexo = await prisma.$transaction(async (tx) => {
    const criado = await tx.anexoTarefa.create({
      data: { tarefaId, nome, mime: tipo.mime, tamanho: bytes.length, dados: bytes, criadoPorId: user.id },
      select: { id: true },
    });
    // O log junto, na mesma transação, como toda escrita do módulo: anexo sem
    // linha no histórico é prova sem autor.
    await tx.logAtividade.create({
      data: {
        entidade: "tarefa",
        entidadeId: tarefaId,
        acao: "anexou",
        valorDepois: nome,
        usuarioId: user.id,
        origem: "APP",
      },
    });
    return criado;
  });

  return NextResponse.json({ ok: true, id: anexo.id });
}
