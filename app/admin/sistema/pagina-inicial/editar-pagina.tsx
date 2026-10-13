"use client";

import { ArrowDown, ArrowUp, Menu } from "lucide-react";
import { useState, useTransition } from "react";

import { IconeNav } from "@/components/icone-nav";
import { Button } from "@/components/ui/button";
import { salvarPaginaInicial } from "@/lib/actions/pagina-inicial";
import { MAXIMO_NA_BARRA } from "@/lib/barra-de-baixo";
import type { NomeDoIcone } from "@/lib/modules";

/** `completo`: o nome inteiro na lista, quando o da barra é curto. */
type Item = { chave: string; nome: string; icone: string; completo?: string };
type Escolha = { numeros: string[]; atalhos: string[]; barra: string[] };
type Lista = keyof Escolha;

/**
 * As três listas, números e atalhos da página inicial e a barra de baixo do
 * celular: cada item com o botão de mostrar e as setas de ordem. Os que
 * aparecem ficam em cima, na ordem escolhida; os escondidos, embaixo. As
 * prévias mudam enquanto mexe, e um Salvar só grava tudo.
 */
export function EditarPagina({
  catalogo: catalogoDaInicial,
  catalogoDaBarra,
  atual,
  padrao,
  personalizada,
}: {
  catalogo: { numeros: Item[]; atalhos: Item[] };
  catalogoDaBarra: Item[];
  atual: Escolha;
  padrao: Escolha;
  personalizada: boolean;
}) {
  const catalogo: Record<Lista, Item[]> = { ...catalogoDaInicial, barra: catalogoDaBarra };
  const [escolha, setEscolha] = useState<Escolha>(atual);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    null,
  );
  const [pendente, startTransition] = useTransition();
  const mudou = JSON.stringify(escolha) !== JSON.stringify(atual);

  const alternar = (lista: Lista, chave: string) => {
    setMsg(null);
    // A barra tem quatro lugares: o quinto é do Menu.
    if (lista === "barra" && !escolha.barra.includes(chave) && escolha.barra.length >= MAXIMO_NA_BARRA) {
      setMsg({ tipo: "erro", texto: `Na barra cabem ${MAXIMO_NA_BARRA} atalhos. Desligue um antes de ligar outro.` });
      return;
    }
    setEscolha((e) => ({
      ...e,
      [lista]: e[lista].includes(chave)
        ? e[lista].filter((c) => c !== chave)
        : [...e[lista], chave],
    }));
  };
  const mover = (lista: Lista, chave: string, dir: -1 | 1) => {
    setMsg(null);
    setEscolha((e) => {
      const l = [...e[lista]];
      const i = l.indexOf(chave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.length) return e;
      [l[i], l[j]] = [l[j], l[i]];
      return { ...e, [lista]: l };
    });
  };

  function salvar(dados: Escolha | null) {
    setMsg(null);
    startTransition(async () => {
      const r = await salvarPaginaInicial(dados);
      if (!r.ok)
        return setMsg({ tipo: "erro", texto: r.message ?? "Não deu certo." });
      if (dados === null) setEscolha(padrao);
      setMsg({
        tipo: "ok",
        texto:
          dados === null
            ? "Voltou ao padrão."
            : "Salvo. A página inicial já mudou.",
      });
    });
  }

  const nomeDe = (lista: Lista, chave: string) =>
    catalogo[lista].find((i) => i.chave === chave);

  const secao = (lista: Lista, titulo: string) => {
    const visiveis = escolha[lista]
      .map((c) => nomeDe(lista, c))
      .filter((i): i is Item => !!i);
    const escondidos = catalogo[lista].filter(
      (i) => !escolha[lista].includes(i.chave),
    );
    return (
      <section>
        <h2 className="section-label mb-2">{titulo}</h2>
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {[...visiveis, ...escondidos].map((i) => {
            const visivel = escolha[lista].includes(i.chave);
            const pos = escolha[lista].indexOf(i.chave);
            const nome = i.completo ?? i.nome;
            return (
              <li
                key={i.chave}
                className={`flex items-center gap-3 px-3 py-2 ${visivel ? "" : "opacity-60"}`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={visivel}
                  aria-label={`${visivel ? "Esconder" : "Mostrar"} ${nome}`}
                  onClick={() => alternar(lista, i.chave)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition ${visivel ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${visivel ? "left-[18px]" : "left-0.5"}`}
                  />
                </button>
                <IconeNav
                  nome={i.icone as NomeDoIcone}
                  className="size-4 shrink-0 text-[var(--primary)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {nome}
                </span>
                {visivel && (
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => mover(lista, i.chave, -1)}
                      disabled={pos === 0}
                      aria-label={`Subir ${nome}`}
                      className="flex size-9 items-center justify-center rounded-lg hover:bg-[var(--muted)] disabled:opacity-30"
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(lista, i.chave, 1)}
                      disabled={pos === escolha[lista].length - 1}
                      aria-label={`Descer ${nome}`}
                      className="flex size-9 items-center justify-center rounded-lg hover:bg-[var(--muted)] disabled:opacity-30"
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <>
      {/* ---- Barra de baixo do celular ---- */}
      <section aria-label="Prévia da barra de baixo" className="rounded-xl border border-dashed border-[var(--border)] p-3">
        <p className="section-label mb-1">Barra de baixo, no celular</p>
        <p className="mb-2 text-sm text-[var(--muted-foreground)]">
          Até {MAXIMO_NA_BARRA} atalhos. O Menu fica sempre no canto direito.
        </p>
        <div className="grid grid-cols-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {Array.from({ length: MAXIMO_NA_BARRA }, (_, n) => {
            const i = nomeDe("barra", escolha.barra[n] ?? "");
            return (
              <span key={n} className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-tight text-[var(--muted-foreground)]">
                {i ? (
                  <>
                    <IconeNav nome={i.icone as NomeDoIcone} className="size-5 text-[var(--primary)]" />
                    <span className="max-w-full truncate">{i.nome}</span>
                  </>
                ) : (
                  <span aria-hidden>·</span>
                )}
              </span>
            );
          })}
          <span className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] leading-tight text-[var(--muted-foreground)]">
            <Menu aria-hidden className="size-5 text-[var(--primary)]" />
            Menu
          </span>
        </div>
      </section>
      {secao("barra", "Atalhos da barra")}

      {/* ---- Página inicial ---- */}
      <section
        aria-label="Prévia da página inicial"
        className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-3"
      >
        <p className="section-label mb-2">Página inicial</p>
        {escolha.numeros.length === 0 && escolha.atalhos.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nada escolhido: a página inicial fica só com Todas as telas.
          </p>
        ) : (
          <>
            {escolha.numeros.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {escolha.numeros.map((c) => (
                  <span
                    key={c}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                  >
                    {nomeDe("numeros", c)?.nome}
                  </span>
                ))}
              </div>
            )}
            {escolha.atalhos.length > 0 && (
              <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                {escolha.atalhos.map((c) => {
                  const i = nomeDe("atalhos", c);
                  return (
                    <span
                      key={c}
                      title={i?.nome}
                      className="flex aspect-square items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                    >
                      {i && (
                        <IconeNav
                          nome={i.icone as NomeDoIcone}
                          className="size-4 text-[var(--primary)]"
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {secao("numeros", "Números")}
      {secao("atalhos", "Atalhos")}


      {msg && (
        <p
          role={msg.tipo === "erro" ? "alert" : "status"}
          className={msg.tipo === "erro" ? "msg-error" : "text-sm"}
          style={msg.tipo === "ok" ? { color: "var(--ok-strong)" } : undefined}
        >
          {msg.texto}
        </p>
      )}

      <div className="sticky bottom-[var(--barra-de-baixo)] flex flex-wrap gap-2 bg-[var(--background)] py-3">
        <Button
          type="button"
          className="h-11 px-6"
          disabled={pendente || !mudou}
          onClick={() => salvar(escolha)}
        >
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        {(personalizada || mudou) && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pendente}
            onClick={() => salvar(null)}
          >
            Voltar ao padrão
          </Button>
        )}
      </div>
    </>
  );
}
