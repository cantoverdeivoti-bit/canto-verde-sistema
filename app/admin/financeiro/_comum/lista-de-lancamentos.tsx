"use client";

import { Banknote, CircleX, Paperclip, Pencil, Plus, Receipt, Repeat, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao, ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apagarLancamento,
  baixarEmLote,
  baixarLancamento,
  cancelarLancamento,
  estornarBaixa,
} from "@/lib/actions/financeiro";
import { corDoTom } from "@/lib/cotacao-labels";
import { ORIGEM_LANCAMENTO, SITUACAO, textoDaSituacao, type Situacao } from "@/lib/financeiro";
import { situacaoDe, somar, valorLiquido } from "@/lib/financeiro-calculo";
import type { LancamentoNaTela, OpcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { chave, formatDiaCurtoString, formatMoney, lerNumeroBR, plural } from "@/lib/format";

import { restaurarDaLixeira } from "@/lib/actions/lixeira";
import { useAcao } from "@/lib/use-acao";
import { AnexosDoLancamento } from "./anexos-do-lancamento";
import { LancamentoForm } from "./lancamento-form";

type Filtro = "todos" | "abertos" | "vencidos" | "pagos";
// Num select sem rótulo à vista, "Todos" sozinho não diz do quê: por isso
// "Todas as situações", como o "Todas as categorias" ao lado.
const FILTROS: { chave: Filtro; nome: string }[] = [
  { chave: "todos", nome: "Todas as situações" },
  { chave: "abertos", nome: "Em aberto" },
  { chave: "vencidos", nome: "Vencidos" },
  { chave: "pagos", nome: "Baixados" },
];

const passa = (f: Filtro, s: Situacao) =>
  f === "todos" ||
  (f === "abertos" && (s === "aberto" || s === "hoje" || s === "vencido")) ||
  (f === "vencidos" && s === "vencido") ||
  (f === "pagos" && s === "pago");

/** "2026-10-14" vira "14/10". */
const diaEMes = (data: string) => data.split("-").reverse().slice(0, 2).join("/");

/**
 * A lista do mês com o que dá para fazer em cada linha. Tocar na linha abre
 * o detalhe e as ações: na tela do celular não cabem cinco botões por conta.
 */
export function ListaDeLancamentos({
  tipo,
  itens,
  opcoes,
  hoje,
  mes,
  abrirNovo,
  fechado = false,
}: {
  tipo: "PAGAR" | "RECEBER";
  itens: LancamentoNaTela[];
  opcoes: OpcoesDoFinanceiro;
  hoje: string;
  mes: string;
  abrirNovo: boolean;
  /** O mês está entregue ao contador: o servidor recusa mudanças nele. */
  fechado?: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [categoriaId, setCategoriaId] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | "novo" | null>(abrirNovo ? "novo" : null);
  const [marcados, setMarcados] = useState<number[]>([]);
  const pagar = tipo === "PAGAR";

  // Mês fechado: o que tem competência nele não se edita, cancela, apaga
  // nem estorna (o servidor recusa). Pagar hoje, num mês aberto, ainda vale.
  const travado = (l: LancamentoNaTela) => fechado && l.competencia.startsWith(mes);
  const comSituacao = itens.map((l) => ({ ...l, situacao: situacaoDe(l, hoje) }));
  const visiveis = comSituacao.filter(
    (l) =>
      passa(filtro, l.situacao) &&
      (categoriaId === "" || l.categoria.id === Number(categoriaId)) &&
      (busca === "" || chave(`${l.descricao} ${l.fornecedor?.nome ?? ""} ${l.documento}`).includes(chave(busca))),
  );
  const validos = comSituacao.filter((l) => l.situacao !== "cancelado");
  const doMes = validos.filter((l) => l.vencimento.startsWith(mes));
  const emAberto = validos.filter((l) => l.status === "ABERTO");
  const vencidos = emAberto.filter((l) => l.situacao === "vencido");
  const categoriasUsadas = opcoes.categorias.filter((c) => itens.some((l) => l.categoria.id === c.id));
  const marcaveis = visiveis.filter((l) => l.status === "ABERTO" && !travado(l)).map((l) => l.id);
  // A baixa em lote só vê o que está na tela: uma marcação escondida pelo
  // filtro não é paga sem ninguém ver.
  const marcadosNaTela = marcados.filter((id) => marcaveis.includes(id));

  return (
    <div className="space-y-4">
      {fechado && (
        <p className="msg-warn">
          Este mês está fechado para o contador: nada com data nele se muda. Anexar ainda vale. Para mudar, reabra o mês na tela Contador.
        </p>
      )}
      {/* Os totais ficam no alto, antes da busca, e não mudam com ela: são
          do mês, não do filtro. */}
      <section aria-label="Totais" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total rotulo="Vence no mês" valor={somar(doMes.map((l) => l.valor))} />
        <Total rotulo={pagar ? "Já pago" : "Já recebido"} valor={somar(validos.map((l) => l.valorPago ?? 0))} />
        <Total rotulo="Em aberto" valor={somar(emAberto.map((l) => (pagar ? l.valor : l.liquido)))} />
        <Total rotulo="Vencido" valor={somar(vencidos.map((l) => (pagar ? l.valor : l.liquido)))} alerta={vencidos.length > 0} />
      </section>

      {/* A conta nova abre dentro do mesmo cartão, embaixo dos quadrados. No
          mês fechado o quadrado fica apagado em vez de sumir: a tela não pula
          ao passar de um mês para o outro. */}
      <CartaoDeBotoes>
        <BotaoQuadrado
          icone={Plus}
          texto={pagar ? "Nova conta a pagar" : "Nova conta a receber"}
          tom="primario"
          ativo={aberto === "novo"}
          desligado={fechado}
          dica={fechado ? "Mês fechado para o contador" : undefined}
          onClick={() => setAberto(aberto === "novo" ? null : "novo")}
        />
        <BotaoQuadrado icone={Repeat} texto="Contas fixas" href="/admin/financeiro/contas-fixas" />
        {aberto === "novo" && (
          <div className="col-span-full basis-full border-t border-[var(--border)] p-3">
            <LancamentoForm tipo={tipo} opcoes={opcoes} hoje={hoje} fechar={() => setAberto(null)} />
          </div>
        )}
      </CartaoDeBotoes>

      {/* A busca num cartão: o campo com a lupa em cima, os filtros embaixo.
          Todo filtro desmarca a baixa em lote, para não pagar o que saiu da tela. */}
      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setMarcados([]);
            }}
            // Conta a receber não tem fornecedor: o campo só aparece no lançamento a pagar.
            placeholder={pagar ? "Descrição, fornecedor ou documento" : "Descrição ou documento"}
            aria-label="Buscar"
            className="h-11 w-full pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          <select
            aria-label="Situação"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value as Filtro);
              setMarcados([]);
            }}
            className="field h-9 min-w-0 flex-1 py-0 text-sm sm:w-48 sm:flex-none"
          >
            {FILTROS.map((f) => (
              <option key={f.chave} value={f.chave}>
                {f.nome}
              </option>
            ))}
          </select>
          {categoriasUsadas.length > 1 && (
            <select
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value);
                setMarcados([]);
              }}
              aria-label="Filtrar por categoria"
              className="field h-9 min-w-0 flex-1 py-0 text-sm sm:w-56 sm:flex-none"
            >
              <option value="">Todas as categorias</option>
              {categoriasUsadas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {itens.length === 0
            ? pagar
              ? "Nada a pagar com vencimento neste mês. Lance as contas que chegarem, ou cadastre as que se repetem em Contas fixas."
              : "Nada a receber neste mês. Os repasses do cartão aparecem aqui depois do fechamento do dia."
            : "Nenhum lançamento com esse filtro."}
        </p>
      ) : (
        <>
          {/* A contagem é o resultado da busca. Sem nada na tela, a frase de
              cima já diz isso, e "0 lançamentos" junto seria repetir. */}
          <p className="text-sm text-[var(--muted-foreground)]">{plural(visiveis.length, "lançamento")}</p>

          {marcadosNaTela.length > 0 && (
            <BaixaEmLote ids={marcadosNaTela} itens={visiveis} opcoes={opcoes} hoje={hoje} pagar={pagar} limpar={() => setMarcados([])} />
          )}

          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {marcaveis.length > 1 && (
              <li className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={marcaveis.every((id) => marcados.includes(id))}
                  onChange={(e) => setMarcados(e.target.checked ? marcaveis : [])}
                  aria-label="Marcar todos em aberto"
                />
                marcar todos em aberto para baixar de uma vez
              </li>
            )}
            {visiveis.map((l) => (
              <Linha
                key={l.id}
                l={l}
                opcoes={opcoes}
                hoje={hoje}
                aberta={aberto === l.id}
                alternar={() => setAberto(aberto === l.id ? null : l.id)}
                marcado={marcados.includes(l.id)}
                travado={travado(l)}
                marcar={(sim) => setMarcados((m) => (sim ? [...m, l.id] : m.filter((x) => x !== l.id)))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Total({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className="num-display text-lg" style={alerta ? { color: "var(--destructive)" } : undefined}>
        {formatMoney(valor)}
      </p>
    </div>
  );
}

type ComSituacao = LancamentoNaTela & { situacao: Situacao };

/** O que abre embaixo dos quadrados da linha. Um por vez. */
type Painel = "baixa" | "editar" | "cancelar" | "estornar";

function Linha({
  l,
  opcoes,
  hoje,
  aberta,
  alternar,
  marcado,
  marcar,
  travado,
}: {
  l: ComSituacao;
  opcoes: OpcoesDoFinanceiro;
  hoje: string;
  aberta: boolean;
  alternar: () => void;
  marcado: boolean;
  marcar: (sim: boolean) => void;
  /** Competência num mês fechado para o contador: só pagar e anexar. */
  travado: boolean;
}) {
  // Um estado só para os painéis: abrir um fecha o outro, e tocar de novo no
  // mesmo quadrado fecha o dele.
  const [painel, setPainel] = useState<Painel | null>(null);
  const alternarPainel = (p: Painel) => setPainel((atual) => (atual === p ? null : p));
  const { erro, pendente, rodar } = useAcao();
  const pagar = l.tipo === "PAGAR";
  const s = SITUACAO[l.situacao];
  const detalhes = [
    l.categoria.nome,
    l.fornecedor?.nome,
    l.parcela && l.totalParcelas ? `parcela ${l.parcela}/${l.totalParcelas}` : null,
    l.centro?.nome,
    l.conta?.nome,
  ].filter(Boolean);

  // Quem pode o quê. O que veio do fechamento do dia se corrige lá, e o mês
  // fechado só deixa pagar.
  const emAberto = l.status === "ABERTO";
  const podeMexer = emAberto && l.origem !== "FECHAMENTO" && !travado;
  const podeApagar = emAberto && l.origem === "MANUAL" && !travado;
  const podeEstornar = l.status === "PAGO" && !travado;
  const podeReabrir = l.status === "CANCELADO" && !travado;
  const temAcao = emAberto || podeEstornar || podeReabrir || l.fechamentoData !== null;

  return (
    <li id={`l${l.id}`} className={l.situacao === "cancelado" ? "opacity-60" : ""}>
      <div className="flex min-h-14 items-center gap-2 px-3 py-2">
        {l.status === "ABERTO" && !travado ? (
          <input type="checkbox" className="size-4 shrink-0" checked={marcado} onChange={(e) => marcar(e.target.checked)} aria-label={`Marcar ${l.descricao}`} />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <button type="button" onClick={alternar} aria-expanded={aberta} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="w-20 shrink-0 text-xs leading-tight">
            <span className="block" style={{ color: l.situacao === "vencido" ? "var(--destructive)" : undefined }}>
              {l.vencimento === hoje ? "hoje" : formatDiaCurtoString(l.vencimento)}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className={`flex items-center gap-1 font-semibold ${l.situacao === "cancelado" ? "line-through" : ""}`}>
              <span className="truncate">{l.descricao}</span>
              {l.anexos.length > 0 && <Paperclip aria-label={`${l.anexos.length} anexo(s)`} className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />}
            </span>
            <span className="block truncate text-xs text-[var(--muted-foreground)]">{detalhes.join(" · ")}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="num-display block text-sm">{formatMoney(l.valor)}</span>
            {l.taxa > 0 && <span className="block text-[11px] text-[var(--muted-foreground)]">líquido {formatMoney(l.liquido)}</span>}
            <span className="selo mt-0.5" style={{ color: corDoTom(s.tom) }}>
              {textoDaSituacao(l.situacao, l.tipo)}
            </span>
          </span>
        </button>
      </div>

      {/* O detalhe aberto fica no branco da lista, sem o fundo cinza: os
          quadrados são só símbolo e texto, e pedem o branco atrás. */}
      {aberta && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Dado rotulo="Competência" valor={l.competencia.split("-").reverse().join("/")} />
            <Dado rotulo="Origem" valor={ORIGEM_LANCAMENTO[l.origem]} />
            {l.documento && <Dado rotulo="Documento" valor={l.documento} />}
            {l.taxa > 0 && <Dado rotulo="Taxa da maquininha" valor={formatMoney(l.taxa)} />}
            {l.pagoEm && <Dado rotulo={pagar ? "Pago em" : "Recebido em"} valor={formatDiaCurtoString(l.pagoEm)} />}
            {l.valorPago !== null && <Dado rotulo="Valor da baixa" valor={formatMoney(l.valorPago)} />}
            {l.jurosMulta > 0 && <Dado rotulo="Juros e multa" valor={formatMoney(l.jurosMulta)} />}
            {l.desconto > 0 && <Dado rotulo="Desconto" valor={formatMoney(l.desconto)} />}
          </dl>
          {l.observacao && <p className="whitespace-pre-line">{l.observacao}</p>}
          <AnexosDoLancamento lancamentoId={l.id} anexos={l.anexos} />

          {/* Os quadrados não somem quando um painel abre: o painel desce
              embaixo deles e o quadrado fica aceso. */}
          {temAcao && (
            <div className="basis-full border-t border-[var(--border)] pt-1">
              <FileiraDeBotoes>
                {emAberto && (
                  <BotaoQuadrado icone={Banknote} texto={pagar ? "Pagar" : "Receber"} tom="primario" ativo={painel === "baixa"} onClick={() => alternarPainel("baixa")} />
                )}
                {podeMexer && (
                  <>
                    <BotaoQuadrado icone={Pencil} texto="Editar" ativo={painel === "editar"} onClick={() => alternarPainel("editar")} />
                    <BotaoQuadrado icone={CircleX} texto="Cancelar" tom="perigo" ativo={painel === "cancelar"} onClick={() => alternarPainel("cancelar")} />
                  </>
                )}
                {podeApagar && (
                  <BotaoQuadrado
                    icone={Trash2}
                    texto="Apagar"
                    tom="perigo"
                    desligado={pendente}
                    onClick={() => {
                      // Vai para a lixeira, sem pergunta: o Desfazer da faixa traz de volta.
                      let lixeiraId = 0;
                      rodar(
                        () => apagarLancamento(l.id),
                        (r) => {
                          lixeiraId = r.lixeiraId ?? 0;
                        },
                        { aviso: "Lançamento na lixeira", desfazer: () => restaurarDaLixeira(lixeiraId) },
                      );
                    }}
                  />
                )}
                {podeEstornar && (
                  <BotaoQuadrado icone={Undo2} texto="Desfazer a baixa" ativo={painel === "estornar"} onClick={() => alternarPainel("estornar")} />
                )}
                {podeReabrir && (
                  <BotaoQuadrado icone={RotateCcw} texto="Reabrir" desligado={pendente} onClick={() => rodar(() => cancelarLancamento(l.id, false))} />
                )}
                {l.fechamentoData && (
                  <BotaoQuadrado icone={Receipt} texto="Ver o fechamento" href={`/admin/financeiro/fechamento?data=${l.fechamentoData}`} />
                )}
              </FileiraDeBotoes>
            </div>
          )}

          {painel === "baixa" && emAberto && (
            <div className="border-t border-[var(--border)] pt-3">
              <BaixaForm l={l} opcoes={opcoes} hoje={hoje} fechar={() => setPainel(null)} />
            </div>
          )}
          {painel === "editar" && podeMexer && (
            <div className="border-t border-[var(--border)] pt-3">
              <LancamentoForm tipo={l.tipo} opcoes={opcoes} hoje={hoje} existente={l} fechar={() => setPainel(null)} />
            </div>
          )}
          {(painel === "cancelar" || painel === "estornar") && (
            <CaixaDeConfirmacao
              pergunta={painel === "cancelar" ? "Cancelar? Ele sai das contas e fica no histórico." : "Desfazer a baixa? O saldo da conta volta junto."}
              confirmar={painel === "cancelar" ? "Cancelar" : "Desfazer"}
              pendente={pendente}
              aoConfirmar={() =>
                rodar(
                  () => (painel === "cancelar" ? cancelarLancamento(l.id, true) : estornarBaixa(l.id)),
                  () => setPainel(null),
                )
              }
              aoVoltar={() => setPainel(null)}
            />
          )}
          {erro && (
            <p role="alert" className="msg-error">
              {erro}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted-foreground)]">{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

/** Pagar ou receber uma conta: o dia, a conta e, se houver, juros e desconto. */
function BaixaForm({ l, opcoes, hoje, fechar }: { l: ComSituacao; opcoes: OpcoesDoFinanceiro; hoje: string; fechar: () => void }) {
  const [v, setV] = useState({
    // O repasse do cartão caiu no dia em que venceu; a conta atrasada foi
    // paga hoje. É o palpite que menos se corrige.
    pagoEm: l.tipo === "RECEBER" && l.vencimento <= hoje ? l.vencimento : hoje,
    contaId: l.conta?.id ?? opcoes.contas[0]?.id ?? null,
    jurosMulta: "",
    desconto: "",
  });
  const { erro, pendente, rodar } = useAcao();
  const final = valorLiquido({
    valor: l.valor,
    taxa: l.taxa,
    jurosMulta: lerNumeroBR(v.jurosMulta) ?? 0,
    desconto: lerNumeroBR(v.desconto) ?? 0,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.contaId === null) return;
        rodar(() => baixarLancamento(l.id, { ...v, contaId: v.contaId! }), fechar);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label>
          <span className="label">{l.tipo === "PAGAR" ? "Pago em" : "Recebido em"}</span>
          <Input type="date" value={v.pagoEm} max={hoje} onChange={(e) => setV((a) => ({ ...a, pagoEm: e.target.value }))} className="w-full" required />
        </label>
        <label>
          <span className="label">Conta</span>
          <select value={v.contaId ?? ""} onChange={(e) => setV((a) => ({ ...a, contaId: Number(e.target.value) }))} className="field w-full" required>
            {opcoes.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Juros/multa</span>
          <Input inputMode="decimal" value={v.jurosMulta} onChange={(e) => setV((a) => ({ ...a, jurosMulta: e.target.value }))} placeholder="0,00" className="w-full" />
        </label>
        <label>
          <span className="label">Desconto</span>
          <Input inputMode="decimal" value={v.desconto} onChange={(e) => setV((a) => ({ ...a, desconto: e.target.value }))} placeholder="0,00" className="w-full" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* O Button padrão já é o verde de salvar. */}
        <Button type="submit" disabled={pendente || v.contaId === null}>
          {l.tipo === "PAGAR" ? "Pagar" : "Receber"} {formatMoney(final)}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Voltar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </form>
  );
}

/**
 * Baixar vários de uma vez: a conferência do extrato. Cada lançamento vai para
 * a conta que já tem; a escolhida aqui vale só para quem não tem nenhuma.
 */
function BaixaEmLote({
  ids,
  itens,
  opcoes,
  hoje,
  pagar,
  limpar,
}: {
  ids: number[];
  itens: LancamentoNaTela[];
  opcoes: OpcoesDoFinanceiro;
  hoje: string;
  pagar: boolean;
  limpar: () => void;
}) {
  const escolhidos = itens.filter((l) => ids.includes(l.id) && l.status === "ABERTO");
  const semConta = escolhidos.some((l) => l.conta === null);
  const [data, setData] = useState(hoje);
  const [contaId, setContaId] = useState<number | null>(opcoes.contas[0]?.id ?? null);
  const { erro, pendente, rodar } = useAcao();
  const total = somar(escolhidos.map((l) => l.liquido));

  return (
    <div className="card space-y-3 p-3">
      <p className="text-sm font-semibold">
        {plural(escolhidos.length, "lançamento marcado", "lançamentos marcados")} · {formatMoney(total)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">{pagar ? "Pagos em" : "Recebidos em"}</span>
          <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className="w-full" />
        </label>
        {semConta && (
          <label>
            <span className="label">Conta (para quem não tem)</span>
            <select value={contaId ?? ""} onChange={(e) => setContaId(Number(e.target.value))} className="field w-full">
              {opcoes.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {/* Pagar vários de uma vez não tem Desfazer: a pergunta aparece ali
          mesmo, com o dia e o total, antes de gravar. */}
      <ConfirmarNaLinha
        pergunta={`${pagar ? "Pagar" : "Receber"} ${plural(escolhidos.length, "lançamento")} em ${diaEMes(data)}, sem juros nem desconto?`}
        confirmar={`${pagar ? "Pagar" : "Receber"} ${formatMoney(total)}`}
        pendente={pendente}
        aoConfirmar={() => rodar(() => baixarEmLote(escolhidos.map((l) => l.id), data, semConta ? contaId : null), limpar)}
      >
        {(abrir) => (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pendente || escolhidos.length === 0} onClick={abrir}>
              {pagar ? "Pagar" : "Receber"} {escolhidos.length === 1 ? "este" : `os ${escolhidos.length}`}
            </Button>
            <Button type="button" variant="ghost" onClick={limpar}>
              Desmarcar
            </Button>
          </div>
        )}
      </ConfirmarNaLinha>
      <p className="hint">Só entram os marcados que estão na tela. Sem juros nem desconto: se algum teve diferença, baixe esse sozinho.</p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
