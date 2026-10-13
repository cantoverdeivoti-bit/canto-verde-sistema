"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { BotaoQuadrado } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import {
  analisarPlanilha,
  aplicarPlanilha,
  type Diagnostico,
} from "@/lib/actions/compras-import";
import { plural } from "@/lib/format";

/**
 * Importar planilha em dois passos: conferir, depois aplicar.
 *
 * O primeiro passo não grava nada. Operação em massa sem conferência é como
 * apagar arquivo sem olhar o nome — e um catálogo errado só aparece na semana
 * seguinte, quando a cotação sai torta.
 */
export function ImportPanel() {
  const [aberto, setAberto] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [trocarEstoque, setTrocarEstoque] = useState(false);
  const [pendente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function analisar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setResultado(null);
    startTransition(async () => {
      setDiag(await analisarPlanilha(formData));
    });
  }

  function aplicar() {
    if (!diag) return;
    startTransition(async () => {
      const r = await aplicarPlanilha([...diag.novas, ...diag.atualizacoes], { trocarEstoque });
      if (r.ok) {
        setResultado(
          `Pronto: ${plural(r.criados ?? 0, "produto criado", "produtos criados")}, ` +
            `${plural(r.atualizados ?? 0, "atualizado")}.`,
        );
        setDiag(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setResultado(r.message ?? "Falhou.");
      }
    });
  }

  function fechar() {
    setAberto(false);
    setDiag(null);
    setResultado(null);
  }

  const aplicaveis = diag ? diag.novas.length + diag.atualizacoes.length : 0;

  return (
    <>
      {/* Dois quadrados na fileira de ações da lista de produtos. O de
          importar alterna o painel, e o `aria-expanded` diz em que pé está. */}
      <BotaoQuadrado icone={Download} texto="Exportar" href="/admin/compras/exportar" baixar dica="Baixar a planilha dos produtos" />
      <BotaoQuadrado
        icone={Upload}
        texto="Importar"
        ativo={aberto}
        onClick={() => (aberto ? fechar() : setAberto(true))}
        dica="Importar planilha"
      />

      {/* `col-span-full basis-full` porque o painel é filho da fileira de
          quadrados: ocupa a linha inteira, embaixo deles, dentro do cartão. */}
      {aberto && (
        <div className="col-span-full basis-full space-y-3 border-t border-[var(--border)] p-3">
          <form onSubmit={analisar} className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-0.5 block font-medium">
                Arquivo (.csv ou .xlsx)
              </span>
              <input
                ref={inputRef}
                type="file"
                name="arquivo"
                accept=".csv,.xlsx,text/csv"
                required
                className="field h-[30px] px-1.5 py-0 text-sm"
              />
            </label>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? "Lendo…" : "Conferir"}
            </Button>
            <button
              type="button"
              onClick={fechar}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              cancelar
            </button>
          </form>

          <p className="hint">
            Conferir não grava nada, só mostra o que aconteceria. As colunas são
            as mesmas da exportação; se estiver em dúvida, exporte primeiro e
            use aquele arquivo como modelo. Linha com código já cadastrado
            atualiza o produto; sem código, vira produto novo.
          </p>

          {diag && !diag.ok && diag.message && (
            <p role="alert" className="msg-error">
              {diag.message}
            </p>
          )}

          {diag?.ok && (
            <div className="space-y-3 border-t border-[var(--border)] pt-3">
              <p className="text-sm">
                <span className="num-display">{diag.novas.length}</span>{" "}
                {diag.novas.length === 1 ? "novo" : "novos"} ·{" "}
                <span className="num-display">{diag.atualizacoes.length}</span>{" "}
                {diag.atualizacoes.length === 1
                  ? "atualização"
                  : "atualizações"}
                {diag.erros.length > 0 && (
                  <>
                    {" · "}
                    <span
                      className="num-display font-semibold"
                      style={{ color: "var(--destructive)" }}
                    >
                      {diag.erros.length}
                    </span>{" "}
                    <span style={{ color: "var(--destructive)" }}>
                      {diag.erros.length === 1 ? "com erro" : "com erro"}
                    </span>
                  </>
                )}
              </p>

              {diag.erros.length > 0 && (
                <ul className="space-y-1 text-xs text-[var(--muted-foreground)]">
                  {diag.erros.slice(0, 12).map((e) => (
                    <li key={e.linha}>
                      <span className="num-display">linha {e.linha}</span> —{" "}
                      {e.motivo}
                    </li>
                  ))}
                  {diag.erros.length > 12 && (
                    <li>e mais {diag.erros.length - 12}…</li>
                  )}
                </ul>
              )}

              {diag.atualizacoes.length > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={trocarEstoque}
                    onChange={(e) => setTrocarEstoque(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Trocar o estoque atual dos produtos que já existem pelo da planilha
                    <span className="block text-xs text-[var(--muted-foreground)]">
                      Desmarcado, o estoque fica como está. Uma planilha antiga desfaria as contagens feitas depois
                      dela.
                    </span>
                  </span>
                </label>
              )}

              {aplicaveis > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" size="sm" onClick={aplicar} disabled={pendente}>
                    {pendente ? "Aplicando…" : `Aplicar ${aplicaveis}`}
                  </Button>
                  {diag.erros.length > 0 && (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      As linhas com erro são deixadas de fora.
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Nenhuma linha aproveitável. Corrija a planilha e confira de
                  novo.
                </p>
              )}
            </div>
          )}

          {resultado && (
            <p role="status" className="text-sm font-medium">
              {resultado}
            </p>
          )}
        </div>
      )}
    </>
  );
}
