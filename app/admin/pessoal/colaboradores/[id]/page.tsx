import { notFound, redirect } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString } from "@/lib/availability";
import { dadosDoCmo, hojeDaCasa } from "@/lib/cmo-do-banco";
import { prisma } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { opcoesDeFuncao } from "@/lib/funcoes";
import { linkDoWhatsAppDoColaborador, mascaraCpf } from "@/lib/pessoal";
import { can } from "@/lib/roles";
import { TIPO } from "@/lib/tipos-de-contrato";

import { ColaboradorForm } from "../colaborador-form";
import { AcoesDoColaborador } from "./acoes-do-colaborador";
import { DependentesDoColaborador } from "./dependentes-do-colaborador";
import { DocumentosDoColaborador } from "./documentos-do-colaborador";
import { ItensDoColaborador } from "./itens-do-colaborador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Colaborador · Departamento pessoal" };

const paraCampo = (n: { toNumber(): number } | null) => (n === null ? "" : n.toNumber().toFixed(2).replace(".", ","));
/** "2026-03-09" -> "09/03/2026". */
const dataCurta = (d: Date) => dateOnlyToString(d).split("-").reverse().join("/");

export default async function ColaboradorPage({ params }: PageProps<"/admin/pessoal/colaboradores/[id]">) {
  const user = await guardModule("pessoal");
  const { id } = await params;
  const c = await prisma.colaborador.findUnique({
    where: { id: Number(id) || 0 },
    include: { diariasDoDia: { select: { diaSemana: true, valor: true } } },
  });
  if (!c) notFound();
  if (c.pendente) redirect("/admin/pessoal/pendencias");
  const podeValores = can(user, "pessoal", { configure: true });
  const [funcoes, cmo, documentos, dependentes] = await Promise.all([
    opcoesDeFuncao(c.funcaoId),
    // Os encargos e benefícios mostram valores: só para quem configura.
    podeValores ? dadosDoCmo(await hojeDaCasa()) : null,
    // Documentos e dependentes são dados pessoais: a mesma trava do CPF.
    podeValores
      ? prisma.documentoDoColaborador.findMany({
          where: { colaboradorId: c.id },
          select: { id: true, tipo: true, naoSeAplica: true, entregueEm: true, mime: true },
        })
      : [],
    podeValores
      ? prisma.dependente.findMany({ where: { colaboradorId: c.id }, orderBy: { createdAt: "asc" }, select: { id: true, nome: true, parentesco: true, nascimento: true, cpf: true } })
      : [],
  ]);
  const pessoaDoCmo = cmo?.pessoas.find((p) => p.id === c.id) ?? null;
  const nome = c.apelido ?? c.nome;
  const whatsApp = linkDoWhatsAppDoColaborador(c.telefone);
  // A frase do alto: o contrato e em que pé está ("Carteira assinada, na casa desde 09/03/2026.").
  const situacao = !c.ativo
    ? `desligado${c.desligadoEm ? ` em ${dataCurta(c.desligadoEm)}` : ""}`
    : c.comecouEm
      ? `na casa desde ${dataCurta(c.comecouEm)}`
      : "ativo";

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo={c.nome}
        voltar={{ href: "/admin/pessoal/colaboradores", texto: "Colaboradores" }}
        subtitulo={`${TIPO[c.tipo].longo}, ${situacao}.`}
      />
      {/* As ações da pessoa no alto, a um toque, sem rolar a ficha inteira. */}
      <AcoesDoColaborador
        colaboradorId={c.id}
        nome={nome}
        whatsApp={whatsApp}
        podeAtualizar={c.ativo}
        podeVirarTerceirizado={c.ativo && c.tipo === "FREELANCER"}
      />
      <ColaboradorForm
        id={c.id}
        podeValores={podeValores}
        funcoes={funcoes}
        inicial={{
          nome: c.nome,
          apelido: c.apelido ?? "",
          telefone: c.telefone ? formatPhone(c.telefone) : "",
          tipo: c.tipo,
          area: c.area ?? "",
          funcaoId: c.funcaoId === null ? "" : String(c.funcaoId),
          ativo: c.ativo,
          comecouEm: c.comecouEm ? dateOnlyToString(c.comecouEm) : "",
          admissao: c.admissao ? dateOnlyToString(c.admissao) : "",
          experienciaAte: c.experienciaAte ? dateOnlyToString(c.experienciaAte) : "",
          asoFeitoEm: c.asoFeitoEm ? dateOnlyToString(c.asoFeitoEm) : "",
          asoValidoAte: c.asoValidoAte ? dateOnlyToString(c.asoValidoAte) : "",
          manipulaAlimentos: c.manipulaAlimentos,
          aprendiz: c.aprendiz,
          contratoAte: c.contratoAte ? dateOnlyToString(c.contratoAte) : "",
          motivoDesligamento: c.motivoDesligamento ?? "",
          razaoDesligamento: c.razaoDesligamento ?? "",
          detalheDesligamento: c.detalheDesligamento ?? "",
          // Sem acesso aos valores, o salário nem desce para a página.
          salario: podeValores ? paraCampo(c.salario) : "",
          diaria: paraCampo(c.diaria),
          diasDeTrabalho: c.diasDeTrabalho,
          diariasPorDia: [0, 1, 2, 3, 4, 5, 6].map((d) => paraCampo(c.diariasDoDia.find((x) => x.diaSemana === d)?.valor ?? null)),
          observacoes: c.observacoes ?? "",
          // O CPF segue a trava do salário.
          cpf: podeValores && c.cpf ? mascaraCpf(c.cpf) : "",
          nascimento: c.nascimento ? dateOnlyToString(c.nascimento) : "",
          endereco: c.endereco ?? "",
          emergenciaNome: c.emergenciaNome ?? "",
          emergenciaTelefone: c.emergenciaTelefone ? formatPhone(c.emergenciaTelefone) : "",
          desligadoEm: c.desligadoEm ? dateOnlyToString(c.desligadoEm) : "",
        }}
      />
      {cmo && pessoaDoCmo && <ItensDoColaborador pessoa={pessoaDoCmo} itens={cmo.itens} />}
      {podeValores && (
        <>
          <DocumentosDoColaborador
            colaboradorId={c.id}
            documentos={documentos.map((d) => ({ id: d.id, tipo: d.tipo, naoSeAplica: d.naoSeAplica, temArquivo: d.mime !== null, entregueEm: dateOnlyToString(d.entregueEm) }))}
          />
          <DependentesDoColaborador
            colaboradorId={c.id}
            dependentes={dependentes.map((d) => ({ ...d, nascimento: d.nascimento ? dateOnlyToString(d.nascimento) : null }))}
          />
        </>
      )}
    </Pagina>
  );
}
