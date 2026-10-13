"use client";

import { Download, Send } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enviarRelatorioDeTeste, salvarRelatorioAgendado } from "@/lib/actions/compras";
import { PERIODOS_DO_RELATORIO } from "@/lib/periodo";
import { DIAS_DA_SEMANA } from "@/lib/relatorio-regras";

import { SaveRow } from "../../save-button";

type Values = {
  ativo: boolean;
  diaSemana: number;
  periodo: string;
  emails: string;
  celular: boolean;
};

/**
 * O relatório de compras por e-mail: quando sai, o que cobre e para quem.
 *
 * "Enviar agora" manda o que está GRAVADO — com mudança não salva, ele avisa
 * em vez de mandar o relatório velho achando que é o novo. "Baixar PDF" usa
 * o período da tela, salvo ou não: é só para ver.
 */
export function RelatorioForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [gravado, setGravado] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [enviando, startEnvio] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const mudou = JSON.stringify(values) !== JSON.stringify(gravado);
  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await salvarRelatorioAgendado(values);
      setError(r.ok ? null : (r.message ?? "Falhou."));
      setSaved(r.ok);
      if (r.ok) setGravado(values);
    });
  }

  function enviarAgora() {
    setResultado(null);
    startEnvio(async () => {
      const r = await enviarRelatorioDeTeste();
      setResultado({ ok: r.ok, texto: r.ok ? (r.mensagem ?? "Enviado.") : (r.message ?? "Não foi enviado.") });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.ativo}
          onChange={(e) => set("ativo", e.target.checked)}
          className="h-5 w-5"
        />
        <span className="text-sm font-medium">Mandar o relatório toda semana</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Dia do envio</span>
          <select value={values.diaSemana} onChange={(e) => set("diaSemana", Number(e.target.value))} className="w-full">
            {DIAS_DA_SEMANA.map((d, i) => (
              <option key={d} value={i}>
                {d}, às 8h
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">O que o relatório cobre</span>
          <select value={values.periodo} onChange={(e) => set("periodo", e.target.value)} className="w-full">
            {PERIODOS_DO_RELATORIO.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.nome}
              </option>
            ))}
          </select>
          <span className="hint">Sempre comparado com o período anterior do mesmo tamanho.</span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">E-mails que recebem</span>
        <Textarea
          rows={3}
          value={values.emails}
          onChange={(e) => set("emails", e.target.value)}
          className="resize-y"
          placeholder="um por linha"
        />
        <span className="hint">Um por linha. O PDF com o relatório completo vai anexo.</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.celular}
          onChange={(e) => set("celular", e.target.checked)}
          className="h-5 w-5"
        />
        <span className="text-sm">
          Avisar nas Notificações, com o link do PDF
          <span className="block text-xs text-[var(--muted-foreground)]">Cada pessoa escolhe celular ou e-mail em Configurações gerais → Minhas notificações.</span>
        </span>
      </label>

      <SaveRow pending={pending} error={error} saved={saved} />

      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-5">
        <Button type="button" variant="outline" className="gap-2" disabled={enviando || mudou} onClick={enviarAgora}>
          <Send aria-hidden className="size-4" />
          {enviando ? "Enviando…" : "Enviar agora para testar"}
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href={`/admin/compras/relatorios/pdf?periodo=${values.periodo}`}>
            <Download aria-hidden className="size-4" />
            Baixar PDF
          </a>
        </Button>
      </div>
      {mudou && <p className="hint">Salve antes de enviar o teste: ele usa o que está gravado.</p>}
      {resultado && (
        <p
          role="status"
          className="text-sm font-medium"
          style={{ color: resultado.ok ? "var(--ok-strong)" : "var(--destructive)" }}
        >
          {resultado.texto}
        </p>
      )}
    </form>
  );
}
