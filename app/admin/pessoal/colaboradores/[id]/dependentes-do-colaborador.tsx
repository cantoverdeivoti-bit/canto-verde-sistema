"use client";

import { Baby, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarDependente, salvarDependente } from "@/lib/actions/documentos-pessoal";
import { PARENTESCOS } from "@/lib/documentos-admissao";
import { mascaraCpf } from "@/lib/pessoal";
import { useAcao } from "@/lib/use-acao";

export type DependenteNaTela = { id: number; nome: string; parentesco: string; nascimento: string | null; cpf: string | null };

function idade(nascimento: string): number {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const anos = Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4));
  return hoje.slice(5) < nascimento.slice(5) ? anos - 1 : anos;
}

/**
 * Filhos, cônjuge e outros dependentes: o que o salário-família, o imposto de
 * renda e o plano pedem. O "Novo dependente" abre o formulário embaixo dele;
 * o "Editar" de cada um, embaixo da própria linha.
 */
export function DependentesDoColaborador({ colaboradorId, dependentes }: { colaboradorId: number; dependentes: DependenteNaTela[] }) {
  const [editando, setEditando] = useState<DependenteNaTela | "novo" | null>(null);
  // O dependente com a pergunta de apagar aberta embaixo da linha.
  const [apagando, setApagando] = useState<number | null>(null);
  const { erro, pendente, rodar } = useAcao();

  // O formulário abre embaixo de quem o abriu, separado por um fio.
  const formulario = (d: DependenteNaTela | null) => (
    <div className="border-t border-[var(--border)] pt-3">
      <FormDoDependente
        key={d === null ? "novo" : d.id}
        inicial={d}
        salvar={(v) => rodar(() => salvarDependente(colaboradorId, d === null ? null : d.id, v), () => setEditando(null))}
        cancelar={() => setEditando(null)}
        pendente={pendente}
      />
    </div>
  );

  return (
    <CartaoDeSecao icone={Baby} titulo="Dependentes" frase="Para salário-família, imposto de renda e plano.">
      <FileiraDeBotoes>
        <BotaoQuadrado
          icone={Plus}
          texto="Novo dependente"
          tom="primario"
          ativo={editando === "novo"}
          onClick={() => setEditando(editando === "novo" ? null : "novo")}
        />
      </FileiraDeBotoes>
      {editando === "novo" && formulario(null)}
      {dependentes.length === 0 && editando !== "novo" && <p className="text-sm text-[var(--muted-foreground)]">Nenhum dependente cadastrado.</p>}
      {dependentes.length > 0 && (
        <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {dependentes.map((d) => {
            const editandoEste = editando !== null && editando !== "novo" && editando.id === d.id;
            return (
              <li key={d.id} className="space-y-2 py-3 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.nome}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {d.parentesco}
                    {d.nascimento && ` · ${idade(d.nascimento)} anos`}
                    {d.cpf && ` · CPF ${mascaraCpf(d.cpf)}`}
                  </p>
                </div>
                {/* As ações dele numa fileira de quadrados, embaixo, separada por um fio. */}
                <div className="border-t border-[var(--border)] pt-1">
                  <FileiraDeBotoes>
                    <BotaoQuadrado
                      icone={Pencil}
                      texto="Editar"
                      ativo={editandoEste}
                      onClick={() => {
                        setApagando(null);
                        setEditando(editandoEste ? null : d);
                      }}
                    />
                    <BotaoQuadrado
                      icone={Trash2}
                      texto="Apagar"
                      tom="perigo"
                      desligado={pendente}
                      onClick={() => setApagando(apagando === d.id ? null : d.id)}
                    />
                  </FileiraDeBotoes>
                </div>
                {apagando === d.id && (
                  <CaixaDeConfirmacao
                    pergunta={`Apagar ${d.nome} dos dependentes?`}
                    pendente={pendente}
                    aoConfirmar={() => rodar(() => apagarDependente(colaboradorId, d.id), () => setApagando(null))}
                    aoVoltar={() => setApagando(null)}
                  />
                )}
                {editandoEste && formulario(d)}
              </li>
            );
          })}
        </ul>
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </CartaoDeSecao>
  );
}

function FormDoDependente({
  inicial,
  salvar,
  cancelar,
  pendente,
}: {
  inicial: DependenteNaTela | null;
  salvar: (v: { nome: string; parentesco: (typeof PARENTESCOS)[number]; nascimento: string; cpf: string }) => void;
  cancelar: () => void;
  pendente: boolean;
}) {
  const [v, setV] = useState({
    nome: inicial?.nome ?? "",
    parentesco: (inicial?.parentesco ?? "Filho(a)") as (typeof PARENTESCOS)[number],
    nascimento: inicial?.nascimento ?? "",
    cpf: inicial?.cpf ? mascaraCpf(inicial.cpf) : "",
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        salvar(v);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="label">Nome</span>
        <Input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} maxLength={80} required autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Parentesco</span>
          <select value={v.parentesco} onChange={(e) => setV({ ...v, parentesco: e.target.value as (typeof PARENTESCOS)[number] })} className="field w-full">
            {PARENTESCOS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Nascimento</span>
          <Input type="date" value={v.nascimento} onChange={(e) => setV({ ...v, nascimento: e.target.value })} />
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="label">CPF</span>
          <Input inputMode="numeric" value={v.cpf} onChange={(e) => setV({ ...v, cpf: e.target.value })} placeholder="000.000.000-00" maxLength={14} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={pendente || v.nome.trim().length < 2}>
          Salvar
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={cancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
