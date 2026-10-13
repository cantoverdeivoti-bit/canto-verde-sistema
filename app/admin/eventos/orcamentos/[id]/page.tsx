import { ChefHat } from "lucide-react";
import { notFound } from "next/navigation";

import { CartaoDeSecao, Pagina } from "@/components/pagina";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { resumoDoEvento, situacaoDoPagamento, valorDoSinal } from "@/lib/eventos-calculo";
import { cardapiosComCusto, configuracaoEventos, outrosEventosNaData, producaoDoCardapio } from "@/lib/eventos-dados";
import { formatPct } from "@/lib/eventos-calculo";
import { FUSO_DA_CASA, formatMoney, plural } from "@/lib/format";
import { whatsappNumberLink } from "@/lib/whatsapp";

import { AcoesDaProducao } from "./acoes-da-producao";
import { CabecalhoDoEvento } from "./cabecalho-do-evento";
import { ChecklistDoEvento } from "./checklist-do-evento";
import { DadosDoEvento } from "./dados-do-evento";
import { LinhasDoEvento } from "./linhas-do-evento";
import { Pagamentos } from "./pagamentos";
import { ListasDaProducao } from "./producao-do-evento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamento · Eventos" };

const pctNoCampo = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default async function EventoPage({ params }: PageProps<"/admin/eventos/orcamentos/[id]">) {
  const { id } = await params;
  const e = await prisma.evento.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      cardapio: { select: { id: true, nome: true } },
      linhas: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
      pagamentos: { orderBy: [{ data: "asc" }, { id: "asc" }] },
      checklist: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
    },
  });
  if (!e) notFound();

  const [config, cardapios, modelos, outros, producao] = await Promise.all([
    configuracaoEventos(),
    cardapiosComCusto({ ativo: true }),
    prisma.modeloChecklist.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, _count: { select: { itens: true } } } }),
    e.status === "REALIZADO" || e.status === "PERDIDO" || e.status === "CANCELADO" ? [] : outrosEventosNaData(e.data, e.id),
    // O que fazer e comprar: só com cardápio escolhido e convidados.
    e.cardapioId && e.convidados > 0 ? producaoDoCardapio(e.cardapioId, e.convidados) : null,
  ]);

  const hoje = todayInTimezone(FUSO_DA_CASA);
  const data = dateOnlyToString(e.data);
  const linhas = e.linhas.map((l) => ({
    id: l.id,
    categoria: l.categoria,
    descricao: l.descricao,
    quantidade: l.quantidade.toNumber(),
    unidade: l.unidade,
    custoUnitario: l.custoUnitario.toNumber(),
    precoUnitario: l.precoUnitario.toNumber(),
    porConvidado: l.porConvidado,
    doCardapio: l.doCardapio,
  }));
  const resumo = resumoDoEvento(linhas, {
    convidados: e.convidados,
    taxaServicoPct: e.taxaServicoPct.toNumber(),
    impostoPct: e.impostoPct.toNumber(),
  });
  const pagamentos = e.pagamentos.map((p) => ({
    id: p.id,
    valor: p.valor.toNumber(),
    data: dateOnlyToString(p.data),
    forma: p.forma,
    descricao: p.descricao,
  }));
  const pago = situacaoDoPagamento(resumo.totalCliente, pagamentos.map((p) => p.valor));
  const encerrado = e.status === "PERDIDO" || e.status === "CANCELADO";

  // Os avisos que a casa precisa ver antes de confirmar ou ao abrir. Avisam, não travam.
  const avisos: string[] = [];
  const limite = e.formato === "SENTADO" ? config.capacidadeSentados : config.capacidadeEmPe;
  if (!encerrado && limite !== null && e.convidados > limite)
    avisos.push(`${e.convidados} convidados passa da lotação de ${limite} ${e.formato === "SENTADO" ? "lugares sentados" : "pessoas em pé"}.`);
  for (const o of outros)
    avisos.push(`Já existe evento confirmado nesta data: ${o.titulo}${o.horaInicio ? `, às ${o.horaInicio}` : ""}.`);
  if (e.status === "ENVIADO" && e.validoAte && dateOnlyToString(e.validoAte) < hoje)
    avisos.push("A validade do orçamento venceu. Confirme o preço com o cliente antes de fechar.");
  if ((e.status === "RASCUNHO" || e.status === "ENVIADO") && data < hoje) avisos.push("A data do evento já passou.");
  if (e.status === "CONFIRMADO" && data < hoje) avisos.push("A data passou. Marque como realizado.");
  if (!encerrado && linhas.some((l) => l.precoUnitario === 0 && l.categoria === "CARDAPIO"))
    avisos.push("A comida está sem preço: o cardápio não tem preço por pessoa. Ponha o preço na linha.");
  if (!encerrado && resumo.lucro < 0) avisos.push("O evento dá prejuízo com estes números.");

  const sinal = valorDoSinal(resumo.totalCliente, config.sinalPct);
  const primeiroNome = e.cliente.nome.trim().split(/\s+/)[0];
  const textoWhats = [
    `Olá, ${primeiroNome}! Segue o orçamento de ${e.titulo}.`,
    `${plural(e.convidados, "convidado")}, total de ${formatMoney(resumo.totalCliente)}.`,
    e.validoAte ? `O valor vale até ${dateOnlyToString(e.validoAte).split("-").reverse().join("/")}.` : "",
    "Mando a proposta completa em PDF. Qualquer dúvida, é só me chamar.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const whats = whatsappNumberLink(e.cliente.telefone);

  return (
    <Pagina largura="larga">
      <CabecalhoDoEvento
        evento={{
          id: e.id,
          titulo: e.titulo,
          status: e.status,
          tipo: e.tipo,
          data,
          horaInicio: e.horaInicio,
          horaFim: e.horaFim,
          convidados: e.convidados,
          formato: e.formato,
          validoAte: e.validoAte ? dateOnlyToString(e.validoAte) : null,
          motivoPerda: e.motivoPerda,
          motivoPerdaTexto: e.motivoPerdaTexto,
          cliente: { id: e.cliente.id, nome: e.cliente.nome },
        }}
        avisos={avisos}
        whatsapp={whats ? `${whats}?text=${encodeURIComponent(textoWhats)}` : null}
      />

      <section aria-label="Resumo financeiro" className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Numero rotulo="Total do cliente" valor={formatMoney(resumo.totalCliente)} destaque />
        <Numero rotulo="Custo" valor={formatMoney(resumo.custo)} />
        <Numero rotulo="Lucro" valor={formatMoney(resumo.lucro)} alerta={resumo.lucro < 0} />
        <Numero rotulo="Margem" valor={formatPct(resumo.margemPct)} alerta={resumo.margemPct !== null && resumo.margemPct < config.margemAlvoPct} />
        <Numero rotulo="Por convidado" valor={resumo.precoPorConvidado === null ? "—" : formatMoney(resumo.precoPorConvidado)} />
        <Numero rotulo="Custo por convidado" valor={resumo.custoPorConvidado === null ? "—" : formatMoney(resumo.custoPorConvidado)} />
        <Numero rotulo={`Taxa de serviço (${pctNoCampo(e.taxaServicoPct.toNumber())}%)`} valor={formatMoney(resumo.taxaServico)} />
        <Numero rotulo={`Imposto (${pctNoCampo(e.impostoPct.toNumber())}%)`} valor={formatMoney(resumo.imposto)} />
        <p className="col-span-full text-xs text-[var(--muted-foreground)]">
          Receita da casa {formatMoney(resumo.subtotal)}. A taxa de serviço entra no total do cliente e vai para a equipe, por
          isso fica fora do lucro. Margem alvo: {pctNoCampo(config.margemAlvoPct)}%.
        </p>
      </section>

      <LinhasDoEvento
        eventoId={e.id}
        convidados={e.convidados}
        linhas={linhas}
        cardapios={cardapios.map((c) => ({ id: c.id, nome: c.nome, precoPorPessoa: c.precoPorPessoa, custoPorPessoa: c.custoPorPessoa }))}
        cardapioAtual={e.cardapio}
      />

      {producao && producao.pratos.length > 0 && (
        <CartaoDeSecao icone={ChefHat} titulo="Produção" frase={`O cardápio para ${plural(e.convidados, "convidado")}: o que fazer e o que comprar.`}>
          <ListasDaProducao producao={producao} />
          <AcoesDaProducao eventoId={e.id} />
        </CartaoDeSecao>
      )}

      <Pagamentos
        eventoId={e.id}
        pagamentos={pagamentos}
        recebido={pago.recebido}
        saldo={pago.saldo}
        sugestao={pagamentos.length === 0 ? { valor: sinal, descricao: "Sinal", rotulo: `sinal de ${pctNoCampo(config.sinalPct)}%` } : { valor: pago.saldo, descricao: "Saldo", rotulo: "o saldo" }}
        hoje={hoje}
      />

      <ChecklistDoEvento
        eventoId={e.id}
        tarefas={e.checklist.map((t) => ({
          id: t.id,
          texto: t.texto,
          etapa: t.etapa,
          prazo: t.prazo ? dateOnlyToString(t.prazo) : null,
          responsavel: t.responsavel,
          feito: t.feito,
        }))}
        modelos={modelos.map((m) => ({ id: m.id, nome: m.nome, itens: m._count.itens }))}
        hoje={hoje}
      />

      <DadosDoEvento
        // A validade muda por fora (ao marcar como enviado): a chave refaz o formulário com ela.
        key={e.validoAte ? dateOnlyToString(e.validoAte) : "sem-validade"}
        eventoId={e.id}
        inicial={{
          titulo: e.titulo,
          tipo: e.tipo,
          data,
          horaInicio: e.horaInicio ?? "",
          horaFim: e.horaFim ?? "",
          convidados: String(e.convidados),
          formato: e.formato,
          taxaServicoPct: pctNoCampo(e.taxaServicoPct.toNumber()),
          impostoPct: pctNoCampo(e.impostoPct.toNumber()),
          observacoesCliente: e.observacoesCliente ?? "",
          observacoesInternas: e.observacoesInternas ?? "",
        }}
        validoAte={e.validoAte ? dateOnlyToString(e.validoAte) : ""}
        podeApagar={e.status !== "CONFIRMADO" && e.status !== "REALIZADO"}
      />
    </Pagina>
  );
}

function Numero({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className={`num-display ${destaque ? "text-xl" : "text-lg"}`} style={alerta ? { color: "var(--destructive)" } : undefined}>
        {valor}
      </p>
    </div>
  );
}
