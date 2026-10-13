"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarConfiguracaoEventos } from "@/lib/actions/eventos";
import type { ConfiguracaoEventosInput } from "@/lib/validations";

import { SaveRow } from "../../save-button";

type Campos = Required<{ [K in keyof ConfiguracaoEventosInput]: string }>;

const CAMPOS: { chave: Exclude<keyof Campos, "condicoes">; rotulo: string; sufixo: string; dica: string }[] = [
  { chave: "margemAlvoPct", rotulo: "Margem alvo", sufixo: "%", dica: "O lucro que a casa quer sobre o preço. Usada no preço sugerido dos cardápios." },
  { chave: "impostoPct", rotulo: "Imposto", sufixo: "%", dica: "Sobre o faturamento, como o Simples. Zero até você informar." },
  { chave: "taxaServicoPct", rotulo: "Taxa de serviço", sufixo: "%", dica: "Somada ao total do cliente. Vai para a equipe, não entra na receita." },
  { chave: "sinalPct", rotulo: "Sinal para confirmar", sufixo: "%", dica: "Quanto do total se pede para segurar a data." },
  { chave: "validadeDias", rotulo: "Validade do orçamento", sufixo: "dias", dica: "Conta a partir do dia em que o orçamento é marcado como enviado." },
  { chave: "capacidadeSentados", rotulo: "Lugares sentados", sufixo: "pessoas", dica: "Acima disso, o evento sentado mostra um aviso." },
  { chave: "capacidadeEmPe", rotulo: "Lotação em pé", sufixo: "pessoas", dica: "Para coquetel. Vazio: sem aviso." },
  { chave: "valorLocacao", rotulo: "Locação do espaço", sufixo: "R$", dica: "Entra como primeira linha de todo orçamento novo. Vazio: não entra." },
];

export function ConfiguracaoForm({ inicial }: { inicial: Campos }) {
  const [v, setV] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        setSalvo(false);
        startTransition(async () => {
          const r = await salvarConfiguracaoEventos(v);
          if (!r.ok) setErro(r.message ?? "Não deu certo.");
          else setSalvo(true);
        });
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.chave} className="block">
            <span className="label">{c.rotulo}</span>
            <div className="flex items-center gap-2">
              {c.sufixo === "R$" && <span className="text-sm text-[var(--muted-foreground)]">R$</span>}
              <Input
                inputMode="decimal"
                value={v[c.chave]}
                onChange={(e) => setV((a) => ({ ...a, [c.chave]: e.target.value }))}
                className="w-32"
              />
              {c.sufixo !== "R$" && <span className="text-sm text-[var(--muted-foreground)]">{c.sufixo}</span>}
            </div>
            <span className="hint block">{c.dica}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="label">Condições da proposta</span>
        <Textarea
          value={v.condicoes}
          onChange={(e) => setV((a) => ({ ...a, condicoes: e.target.value }))}
          rows={6}
          maxLength={3000}
          placeholder="Ex.: A data fica reservada com o sinal. Cancelamento até 30 dias antes devolve o sinal. O número final de convidados é confirmado 7 dias antes."
        />
        <span className="hint block">Sai no fim de toda proposta impressa, abaixo dos valores.</span>
      </label>
      <SaveRow pending={pendente} error={erro} saved={salvo} />
    </form>
  );
}
