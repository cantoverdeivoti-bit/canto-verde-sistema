"use client";

import { Copy, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  adicionarAoCardapio,
  apagarCardapio,
  duplicarCardapio,
  ligarCardapio,
  mudarEtapa,
  mudarPorcoes,
  salvarCardapio,
  tirarDoCardapio,
} from "@/lib/actions/eventos";
import { ETAPA_CARDAPIO, etapaDaFicha, opcoes } from "@/lib/eventos";
import { cmvPct, formatPct, precoSugerido } from "@/lib/eventos-calculo";
import type { CardapioComCusto } from "@/lib/eventos-dados";
import { chave, formatAmount, formatMoney, lerNumeroBR, plural, precoNoCampo } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";

/** Uma ficha do Receituário para pôr no cardápio. */
export type FichaParaEscolher = { id: number; codigo: string; nome: string; categoria: string; eventos: boolean; custoPorcao: number };

const ETAPAS = opcoes(ETAPA_CARDAPIO);
const ORDEM = ETAPAS.map((c) => c.valor);

/**
 * O cardápio por inteiro: nome, texto para o cliente, preço, as fichas do
 * Receituário com a etapa do menu e as porções por pessoa e, ao lado, a conta
 * do custo.
 */
export function EditorDeCardapio({
  cardapio,
  fichas,
  verFicha,
  margemAlvoPct,
  impostoPct,
  eventos,
}: {
  cardapio: CardapioComCusto;
  fichas: FichaParaEscolher[];
  /** Quem tem o Receituário abre a ficha pelo nome do prato. */
  verFicha: boolean;
  margemAlvoPct: number;
  impostoPct: number;
  eventos: number;
}) {
  const router = useRouter();
  const [dados, setDados] = useState({
    nome: cardapio.nome,
    descricao: cardapio.descricao ?? "",
    precoPorPessoa: precoNoCampo(cardapio.precoPorPessoa),
  });
  const [escolhida, setEscolhida] = useState<FichaParaEscolher | null>(null);
  const [etapa, setEtapa] = useState("");
  const [porcoes, setPorcoes] = useState("1");
  const { erro, pendente, rodar } = useAcao();

  // A conta acompanha o preço enquanto se digita, antes de salvar.
  const precoDigitado = dados.precoPorPessoa.trim() === "" ? null : lerNumeroBR(dados.precoPorPessoa);
  const custo = cardapio.custoPorPessoa;
  const cmv = cmvPct(custo, precoDigitado);
  const sugerido = precoSugerido(custo, margemAlvoPct, impostoPct);
  const abaixo = precoDigitado !== null && sugerido !== null && precoDigitado < sugerido;
  const itens = [...cardapio.itens].sort((a, b) => ORDEM.indexOf(a.etapa) - ORDEM.indexOf(b.etapa));

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarCardapio(cardapio.id, dados));
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="sr-only">Nome do cardápio</span>
          <Input value={dados.nome} onChange={(e) => setDados((d) => ({ ...d, nome: e.target.value }))} maxLength={100} className="text-lg font-semibold" />
        </label>
        <label className="block">
          <span className="label">Descrição para o cliente</span>
          <Textarea
            value={dados.descricao}
            onChange={(e) => setDados((d) => ({ ...d, descricao: e.target.value }))}
            rows={3}
            maxLength={2000}
            placeholder="Sai na proposta. Ex.: Entrada, prato principal com duas opções e sobremesa."
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Preço por pessoa (R$)</span>
            <Input inputMode="decimal" value={dados.precoPorPessoa} onChange={(e) => setDados((d) => ({ ...d, precoPorPessoa: e.target.value }))} placeholder="0,00" className="w-36" />
          </label>
          <Button type="submit" disabled={pendente}>
            Salvar
          </Button>
          {sugerido !== null && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDados((d) => ({ ...d, precoPorPessoa: precoNoCampo(sugerido) }))}
              title={`Margem de ${formatPct(margemAlvoPct)} e imposto de ${formatPct(impostoPct)}, das configurações`}
            >
              Usar o sugerido: {formatMoney(sugerido)}
            </button>
          )}
        </div>
      </form>

      <section aria-label="Conta do cardápio" className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Numero rotulo="Custo por pessoa" valor={formatMoney(custo)} />
        <Numero rotulo="Preço por pessoa" valor={precoDigitado === null ? "—" : formatMoney(precoDigitado)} />
        <Numero rotulo="CMV" valor={formatPct(cmv)} alerta={abaixo} />
        <Numero rotulo="Sobra por pessoa" valor={precoDigitado === null ? "—" : formatMoney(precoDigitado - custo)} />
      </section>
      {abaixo && (
        <p className="msg-warn">
          O preço está abaixo do sugerido: só a comida já tira a margem de {formatPct(margemAlvoPct)} das configurações. E o
          evento ainda tem equipe, bebida e salão.
        </p>
      )}

      <section>
        <h2 className="section-label mb-2">Pratos · porções por pessoa</h2>
        {itens.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhum prato ainda. Busque a ficha abaixo.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {itens.map((i) => (
              <ItemDoCardapio key={i.id} item={i} verFicha={verFicha} rodar={rodar} pendente={pendente} />
            ))}
          </ul>
        )}
        {cardapio.semPreco > 0 && (
          <p className="hint mt-1" style={{ color: "var(--warn)" }}>
            {plural(cardapio.semPreco, "prato tem", "pratos têm")} insumo sem preço na ficha: o custo por pessoa está abaixo do real.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!escolhida) return;
            rodar(() => adicionarAoCardapio(cardapio.id, escolhida.id, etapa, porcoes), () => {
              setEscolhida(null);
              setPorcoes("1");
            });
          }}
          className="mt-3 space-y-2"
        >
          <span className="label">Pôr prato</span>
          <EscolherFicha
            fichas={fichas}
            escolhida={escolhida}
            escolher={(f) => {
              setEscolhida(f);
              if (f) setEtapa(etapaDaFicha(f.categoria));
            }}
          />
          {escolhida && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="label">Etapa do menu</span>
                <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="field">
                  {ETAPAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.texto}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Por pessoa</span>
                <Input inputMode="decimal" value={porcoes} onChange={(e) => setPorcoes(e.target.value)} className="w-24" />
              </label>
              <Button type="submit" className="h-11" disabled={pendente}>
                Pôr
              </Button>
            </div>
          )}
        </form>
        {fichas.length === 0 && (
          <p className="hint">
            Não há ficha ligada no Receituário.
            {verFicha && (
              <>
                {" "}
                Cadastre em{" "}
                <Link href="/admin/receituario" className="underline">
                  Receituário
                </Link>
                .
              </>
            )}
          </p>
        )}
      </section>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <CartaoDeBotoes>
        <BotaoQuadrado
          icone={Copy}
          texto="Duplicar"
          desligado={pendente}
          onClick={() => rodar(() => duplicarCardapio(cardapio.id), (r) => r.ok && router.push(`/admin/eventos/cardapios/${r.data.id}`))}
        />
        <BotaoQuadrado icone={Power} texto={cardapio.ativo ? "Desligar" : "Ligar"} desligado={pendente} onClick={() => rodar(() => ligarCardapio(cardapio.id, !cardapio.ativo))} />
        <ConfirmarNaLinha
          pergunta="Apagar este cardápio de vez?"
          confirmar="Apagar de vez"
          pendente={pendente}
          aoConfirmar={() => rodar(() => apagarCardapio(cardapio.id), () => router.push("/admin/eventos/cardapios"))}
        >
          {(abrir) => <BotaoQuadrado icone={Trash2} texto="Apagar" tom="perigo" onClick={abrir} />}
        </ConfirmarNaLinha>
      </CartaoDeBotoes>
      <p className="hint">
        {cardapio.ativo ? "Desligado, ele sai da lista de escolha do orçamento." : "Desligado: não aparece para escolher no orçamento."}{" "}
        {eventos > 0 && `Usado em ${plural(eventos, "orçamento")}: apagar não muda os valores deles.`}
      </p>
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className="num-display text-lg" style={alerta ? { color: "var(--warn)" } : undefined}>
        {valor}
      </p>
    </div>
  );
}

/** A busca de ficha por nome ou código. Sem texto, mostra as que já servem em evento. */
function EscolherFicha({
  fichas,
  escolhida,
  escolher,
}: {
  fichas: FichaParaEscolher[];
  escolhida: FichaParaEscolher | null;
  escolher: (f: FichaParaEscolher | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(false);
  if (escolhida) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">
          {escolhida.nome} <span className="text-xs font-normal text-[var(--muted-foreground)]">{escolhida.codigo}</span>
        </span>
        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatMoney(escolhida.custoPorcao)}/porção</span>
        <button type="button" className="shrink-0 text-xs text-[var(--muted-foreground)] underline" onClick={() => escolher(null)}>
          trocar
        </button>
      </div>
    );
  }
  const k = chave(busca);
  const achados = (k ? fichas.filter((f) => chave(`${f.codigo} ${f.nome}`).includes(k)) : fichas.filter((f) => f.eventos)).slice(0, 12);
  return (
    <div className="space-y-1">
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onFocus={() => setAberta(true)}
        placeholder="Buscar ficha por nome ou código"
        aria-label="Buscar ficha do Receituário"
      />
      {(aberta || k) && achados.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
          {!k && <li className="px-3 pt-1.5 text-xs text-[var(--muted-foreground)]">As que já servem em evento</li>}
          {achados.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                onClick={() => {
                  escolher(f);
                  setBusca("");
                  setAberta(false);
                }}
              >
                <span className="w-11 shrink-0 font-mono text-xs text-[var(--muted-foreground)]">{f.codigo}</span>
                <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{formatMoney(f.custoPorcao)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {k && achados.length === 0 && <p className="hint">Nenhuma ficha com esse nome.</p>}
    </div>
  );
}

function ItemDoCardapio({
  item,
  verFicha,
  rodar,
  pendente,
}: {
  item: CardapioComCusto["itens"][number];
  verFicha: boolean;
  rodar: ReturnType<typeof useAcao>["rodar"];
  pendente: boolean;
}) {
  const [porcoes, setPorcoes] = useState(formatAmount(item.porcoesPorPessoa));
  const mudou = lerNumeroBR(porcoes) !== item.porcoesPorPessoa;
  const f = item.ficha;
  return (
    <li className="space-y-1.5 px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {verFicha ? (
              <Link href={`/admin/receituario/${f.codigo}`} className="underline-offset-4 hover:underline">
                {f.nome}
              </Link>
            ) : (
              f.nome
            )}
            {!f.ativo && <span className="ml-1 text-xs font-normal text-[var(--warn)]">(ficha desligada)</span>}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {formatMoney(f.custoPorcao)} por porção
            {f.semPreco > 0 && <span style={{ color: "var(--warn)" }}> · {plural(f.semPreco, "insumo sem preço", "insumos sem preço")}</span>}
          </p>
        </div>
        <p className="num-display shrink-0 pt-0.5 text-right text-sm">{formatMoney(f.custoPorcao * item.porcoesPorPessoa)}</p>
        <button
          type="button"
          onClick={() => rodar(() => tirarDoCardapio(item.id))}
          disabled={pendente}
          aria-label={`Tirar ${f.nome} do cardápio`}
          title="Tirar do cardápio"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={item.etapa}
          onChange={(e) => rodar(() => mudarEtapa(item.id, e.target.value))}
          disabled={pendente}
          aria-label={`Etapa do menu de ${f.nome}`}
          className="field min-w-0 flex-1 sm:max-w-56"
        >
          {ETAPAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.texto}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => mudarPorcoes(item.id, porcoes));
          }}
          className="flex shrink-0 items-center gap-1.5"
        >
          <Input
            inputMode="decimal"
            value={porcoes}
            onChange={(e) => setPorcoes(e.target.value)}
            onBlur={() => mudou && rodar(() => mudarPorcoes(item.id, porcoes))}
            aria-label={`Porções por pessoa de ${f.nome}`}
            className="w-16 text-right"
          />
          <span className="text-xs text-[var(--muted-foreground)]">por pessoa</span>
        </form>
      </div>
    </li>
  );
}
