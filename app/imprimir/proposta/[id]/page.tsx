import { notFound } from "next/navigation";

import { dateOnlyToString, getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { ETAPA_CARDAPIO, FORMATO_EVENTO, TIPO_EVENTO, noPlural, opcoes } from "@/lib/eventos";
import { resumoDoEvento, valorDoSinal } from "@/lib/eventos-calculo";
import { configuracaoEventos } from "@/lib/eventos-dados";
import { FUSO_DA_CASA, formatAmount, formatDateString, formatMoney, formatPhone } from "@/lib/format";

import { FolhaDeImpressao } from "../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta de evento" };

const ddmmaaaa = (d: string) => d.split("-").reverse().join("/");

/**
 * A proposta que vai para o cliente, numa folha A4, fora do painel. Mostra só
 * preço: custo, margem, linha de custo interno e anotação da casa nunca
 * aparecem aqui. Abre pedindo para imprimir; "Salvar como PDF" gera o arquivo
 * para mandar no WhatsApp.
 */
export default async function PropostaPage({ params }: PageProps<"/imprimir/proposta/[id]">) {
  await guardModule("eventos");
  const { id } = await params;
  const e = await prisma.evento.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      cliente: { select: { nome: true, telefone: true, email: true } },
      linhas: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
      cardapio: {
        select: {
          nome: true,
          descricao: true,
          itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { etapa: true, ficha: { select: { nome: true } } } },
        },
      },
    },
  });
  if (!e) notFound();
  const [{ rules, capacity }, config] = await Promise.all([getSettings(), configuracaoEventos()]);

  const linhas = e.linhas.map((l) => ({
    descricao: l.descricao,
    categoria: l.categoria,
    unidade: l.unidade,
    quantidade: l.quantidade.toNumber(),
    custoUnitario: 0,
    precoUnitario: l.precoUnitario.toNumber(),
  }));
  const resumo = resumoDoEvento(linhas, { convidados: e.convidados, taxaServicoPct: e.taxaServicoPct.toNumber(), impostoPct: 0 });
  const cobradas = linhas.filter((l) => l.precoUnitario > 0 && l.categoria !== "CUSTO_INTERNO");
  const taxa = e.taxaServicoPct.toNumber();
  const sinal = valorDoSinal(resumo.totalCliente, config.sinalPct);
  const pratos = e.cardapio?.itens ?? [];

  return (
    <FolhaDeImpressao margem={14} className="max-w-[190mm] p-6 text-[13px] leading-relaxed">

      <header className="flex items-start justify-between border-b border-black pb-3">
        <div>
          <p className="text-xl font-bold">{capacity.name}</p>
          {rules.endereco && <p>{rules.endereco}</p>}
          {rules.whatsapp && <p>WhatsApp {formatPhone(rules.whatsapp.startsWith("+") ? rules.whatsapp : `+${rules.whatsapp}`)}</p>}
        </div>
        <div className="text-right">
          <p className="font-semibold">Proposta de evento nº {e.id}</p>
          <p>Emitida em {ddmmaaaa(todayInTimezone(FUSO_DA_CASA))}</p>
          {e.validoAte && <p>Válida até {ddmmaaaa(dateOnlyToString(e.validoAte))}</p>}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
        <p>
          <span className="font-semibold">Cliente:</span> {e.cliente.nome}
        </p>
        <p>
          <span className="font-semibold">Evento:</span> {e.titulo}
        </p>
        <p>
          <span className="font-semibold">Data:</span> {formatDateString(dateOnlyToString(e.data))}
        </p>
        <p>
          <span className="font-semibold">Horário:</span> {e.horaInicio ? `${e.horaInicio}${e.horaFim ? ` às ${e.horaFim}` : ""}` : "a combinar"}
        </p>
        <p>
          <span className="font-semibold">Convidados:</span> {e.convidados}
        </p>
        <p>
          <span className="font-semibold">Formato:</span> {TIPO_EVENTO[e.tipo]}, {FORMATO_EVENTO[e.formato].toLowerCase()}
        </p>
      </section>

      {e.cardapio && (
        <section className="mt-5">
          <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold uppercase">Cardápio: {e.cardapio.nome}</h2>
          {e.cardapio.descricao && <p className="mt-2 whitespace-pre-line">{e.cardapio.descricao}</p>}
          {opcoes(ETAPA_CARDAPIO).map((c) => {
            const daCategoria = pratos.filter((p) => p.etapa === c.valor);
            if (daCategoria.length === 0) return null;
            return (
              <p key={c.valor} className="mt-1">
                <span className="font-semibold">{c.texto}:</span> {daCategoria.map((p) => p.ficha.nome).join(", ")}
              </p>
            );
          })}
        </section>
      )}

      <section className="mt-5">
        <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold uppercase">Valores</h2>
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Quantidade</th>
              <th className="py-1 text-right">Valor unitário</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {cobradas.map((l, i) => (
              <tr key={i} className="border-t border-neutral-300">
                <td className="py-1">{l.descricao}</td>
                <td className="py-1 text-right">
                  {formatAmount(l.quantidade)} {noPlural(l.unidade, l.quantidade)}
                </td>
                <td className="py-1 text-right">{formatMoney(l.precoUnitario)}</td>
                <td className="py-1 text-right">{formatMoney(l.quantidade * l.precoUnitario)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {taxa > 0 && (
              <>
                <tr className="border-t border-black">
                  <td colSpan={3} className="py-1 text-right">
                    Subtotal
                  </td>
                  <td className="py-1 text-right">{formatMoney(resumo.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right">
                    Taxa de serviço ({taxa.toLocaleString("pt-BR")}%)
                  </td>
                  <td className="py-1 text-right">{formatMoney(resumo.taxaServico)}</td>
                </tr>
              </>
            )}
            <tr className="border-t border-black text-base font-bold">
              <td colSpan={3} className="py-1.5 text-right">
                Total
              </td>
              <td className="py-1.5 text-right">{formatMoney(resumo.totalCliente)}</td>
            </tr>
            {resumo.precoPorConvidado !== null && (
              <tr>
                <td colSpan={3} className="text-right text-[12px]">
                  por convidado
                </td>
                <td className="text-right text-[12px]">{formatMoney(resumo.precoPorConvidado)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </section>

      {e.observacoesCliente && (
        <section className="mt-5">
          <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold uppercase">Observações</h2>
          <p className="mt-2 whitespace-pre-line">{e.observacoesCliente}</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold uppercase">Condições</h2>
        {config.sinalPct > 0 && (
          <p className="mt-2">
            Para reservar a data: sinal de {config.sinalPct.toLocaleString("pt-BR")}% ({formatMoney(sinal)}).
          </p>
        )}
        {config.condicoes && <p className="mt-2 whitespace-pre-line">{config.condicoes}</p>}
      </section>
    </FolhaDeImpressao>
  );
}
