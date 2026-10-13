"use client";

import { HandCoins, Receipt } from "lucide-react";
import { useState, useTransition } from "react";

import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { definirItemDoColaborador } from "@/lib/actions/pessoal";
import {
  custoDoItem,
  descreverItem,
  linhaDoCmo,
  recebeItem,
  valorDoItem,
  type ItemDeCusto,
  type PessoaDoCmo,
} from "@/lib/cmo";
import { formatMoney } from "@/lib/format";

import { NovoBeneficio } from "../../novo-beneficio";

const paraCampo = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Os encargos, benefícios e descontos desta pessoa: cada item ligado, com o botão de
 * recebe ou não e o valor dela. O padrão vem do tipo (quem recebe) e do
 * cadastro (quanto); mudar aqui grava uma exceção, e "voltar ao padrão"
 * apaga a parte que mudou. Dois cartões: o que custa para a casa e o que sai
 * do salário da pessoa.
 */
export function ItensDoColaborador({ pessoa, itens }: { pessoa: PessoaDoCmo; itens: ItemDeCusto[] }) {
  // O erro aparece no cartão do item que deu errado.
  const [erro, setErro] = useState<{ desconto: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [pendente, startTransition] = useTransition();
  const ligados = itens.filter((i) => i.ativo);
  const linha = linhaDoCmo(pessoa, itens);

  // A exceção de "quem recebe" só existe quando difere do tipo; a linha pode existir só pelo valor.
  const recebeDiferente = (i: ItemDeCusto) => {
    const e = pessoa.excecoes[i.id];
    return e !== undefined && e !== i.tipos.includes(pessoa.tipo) ? e : null;
  };
  const valorProprio = (i: ItemDeCusto) => (pessoa.valores[i.id] === undefined ? null : paraCampo(pessoa.valores[i.id]));

  function definir(i: ItemDeCusto, recebe: boolean | null, valor: string | null, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await definirItemDoColaborador(pessoa.id, i.id, recebe, valor);
      if (!r.ok) return setErro({ desconto: i.natureza === "DESCONTO", texto: r.message ?? "Não deu certo." });
      depois?.();
    });
  }

  /** Uma linha: ligar/desligar para a pessoa, o valor dela e o quanto dá no mês. */
  const linhaDoItem = (i: ItemDeCusto) => {
    const recebe = recebeItem(i, pessoa);
    const diferente = recebeDiferente(i);
    const proprio = valorProprio(i);
    const etiqueta = diferente === null ? "pelo tipo" : diferente ? "só para esta pessoa" : "tirado desta pessoa";
    const custo = custoDoItem(i, pessoa);
    return (
      <li key={i.id} className={`py-2.5 first:pt-0 last:pb-0 ${recebe ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={recebe}
            aria-label={`${recebe ? "Tirar" : "Pôr"} ${i.nome}`}
            disabled={pendente}
            onClick={() => {
              const novo = !recebe;
              // Se o novo valor é o do tipo, a exceção de "quem recebe" não precisa existir.
              definir(i, novo === i.tipos.includes(pessoa.tipo) ? null : novo, proprio);
            }}
            className={`relative h-6 w-10 shrink-0 rounded-full transition ${recebe ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
          >
            <span
              aria-hidden
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${recebe ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{i.nome}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {descreverItem(i.forma, valorDoItem(i, pessoa))}
              {proprio !== null && " (valor desta pessoa)"} · {etiqueta}
            </p>
            <p className="text-xs">
              {recebe && editando !== i.id && (
                <button
                  type="button"
                  onClick={() => {
                    setTexto(paraCampo(valorDoItem(i, pessoa)));
                    setEditando(i.id);
                  }}
                  className="mr-2 text-[var(--primary)] underline underline-offset-2"
                >
                  mudar valor
                </button>
              )}
              {(diferente !== null || proprio !== null) && (
                <button
                  type="button"
                  onClick={() => definir(i, null, null)}
                  className="text-[var(--primary)] underline underline-offset-2"
                >
                  voltar ao padrão
                </button>
              )}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums">{recebe && custo > 0 ? formatMoney(custo) : "—"}</span>
        </div>
        {editando === i.id && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              inputMode="decimal"
              aria-label={`Valor de ${i.nome} para esta pessoa`}
              className="h-9 min-h-9! w-28"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              disabled={pendente}
              // O valor igual ao do cadastro não vira exceção.
              onClick={() =>
                definir(i, diferente, texto.trim() === paraCampo(i.valor) ? null : texto, () => setEditando(null))
              }
            >
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        )}
      </li>
    );
  };

  const lista = (doGrupo: ItemDeCusto[], vazio: string) =>
    doGrupo.length === 0 ? (
      <p className="text-sm text-[var(--muted-foreground)]">{vazio}</p>
    ) : (
      // Sem borda nem fundo próprios: a lista já está dentro do cartão.
      <ul className="divide-y divide-[var(--border)]">{doGrupo.map(linhaDoItem)}</ul>
    );

  const erroDo = (desconto: boolean) =>
    erro?.desconto === desconto && (
      <p role="alert" className="msg-error">
        {erro.texto}
      </p>
    );

  return (
    <>
      <CartaoDeSecao icone={HandCoins} titulo="Encargos e benefícios" frase="O padrão vem do tipo; mudar aqui vale só para esta pessoa.">
        {lista(
          ligados.filter((i) => i.natureza !== "DESCONTO"),
          "Nenhum encargo ou benefício ligado no cadastro.",
        )}
        <NovoBeneficio aoCriar={(b) => definirItemDoColaborador(pessoa.id, b.id, true).then(() => undefined)} />
        {erroDo(false)}
        <p className="border-t border-[var(--border)] pt-3 text-sm">
          Custo de um mês para a casa: <strong className="tabular-nums">{formatMoney(linha.total)}</strong>
          <span className="text-[var(--muted-foreground)]">
            {" "}
            ({pessoa.tipo === "FREELANCER" ? `${formatMoney(linha.diarias)} de diárias` : `${formatMoney(linha.salario)} de salário`}
            {linha.encargos > 0 && ` + ${formatMoney(linha.encargos)} de encargos`}
            {linha.beneficios > 0 && ` + ${formatMoney(linha.beneficios)} de benefícios`})
          </span>
        </p>
      </CartaoDeSecao>

      <CartaoDeSecao icone={Receipt} titulo="Descontos do salário" frase="Saem do salário da pessoa, não do custo da casa.">
        {lista(
          ligados.filter((i) => i.natureza === "DESCONTO"),
          "Nenhum desconto ligado. Cadastre INSS, sindicato e outros em Cadastros → Encargos e descontos.",
        )}
        {erroDo(true)}
        {linha.descontos > 0 && (
          <p className="border-t border-[var(--border)] pt-3 text-sm">
            Líquido de um mês: <strong className="tabular-nums">{formatMoney(linha.liquido)}</strong>
            <span className="text-[var(--muted-foreground)]">
              {" "}
              ({pessoa.tipo === "FREELANCER" ? `${formatMoney(linha.diarias)} de diárias` : `${formatMoney(linha.salario)} de salário`}
              {` − ${formatMoney(linha.descontos)} de descontos`})
            </span>
          </p>
        )}
      </CartaoDeSecao>
    </>
  );
}
