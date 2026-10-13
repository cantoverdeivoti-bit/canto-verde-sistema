"use client";

import { ArrowRightLeft, Package, Plus, Trash2, Truck } from "lucide-react";
import { useState, useTransition } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteCategory, migrarProdutosDaCategoria, saveCategory } from "@/lib/actions/compras";
import { plural } from "@/lib/format";

export type CategoriaRow = {
  id: number;
  name: string;
  sortOrder: number;
  /** Quantos itens estão nela — é o que a pessoa precisa saber antes de apagar. */
  produtos: number;
  fornecedores: number;
};

/**
 * O cadastro de categorias, em tela própria.
 *
 * Morava recolhido dentro de Produtos, e é dali que ele saiu: categoria é o
 * cadastro de que produto, fornecedor e cotação dependem, e um acordeão numa
 * tela sobre outra coisa escondia atrás de dois cliques o que decide a ordem
 * em que a lista de compras sai.
 *
 * Apagar é permitido aqui, e é a única coisa do módulo que se apaga: os
 * produtos não vão junto, só ficam sem categoria. Por isso o aviso diz quantos
 * itens perdem o rótulo, e não pergunta "tem certeza?" no vazio.
 */
export function CategoriesList({ categorias }: { categorias: CategoriaRow[] }) {
  const [nova, setNova] = useState("");
  // Só o botão na tela; o campo aparece quando ele toca.
  const [criando, setCriando] = useState(false);
  const [nomes, setNomes] = useState<Record<number, string>>({});
  const [confirmando, setConfirmando] = useState<number | null>(null);
  // Qual categoria está esperando confirmação de renome. Separado do estado
  // acima, que é o de apagar: são duas perguntas diferentes, e juntá-las num
  // estado só faria uma responder pela outra.
  const [renomeando, setRenomeando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Migrar: de qual categoria, para qual, e se é o caminho para apagar.
  const [migrando, setMigrando] = useState<number | null>(null);
  const [destino, setDestino] = useState("");
  const [paraApagar, setParaApagar] = useState(false);
  const [pendente, startTransition] = useTransition();

  function nomeDe(c: CategoriaRow) {
    return nomes[c.id] ?? c.name;
  }

  function criar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    // Nasce no fim da lista: quem acabou de criar não deveria ter que pensar
    // em posição, e o fim é onde ela não atrapalha a ordem já arrumada.
    const fim = categorias.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 10;
    startTransition(async () => {
      const r = await saveCategory(null, { name: nova, sortOrder: fim });
      if (r.ok) {
        setNova("");
        setCriando(false);
      } else setErro(r.message ?? "Falhou.");
    });
  }

  /**
   * Sair do campo não grava mais: pergunta.
   *
   * Renomear uma categoria mexe no agrupamento de todos os produtos dela e na
   * ordem em que a lista de compras sai. Era gravação silenciosa ao perder o
   * foco — um toque sem querer bastava.
   */
  function aoSairDoNome(c: CategoriaRow) {
    if (nomeDe(c).trim() === c.name) return setRenomeando(null);
    setRenomeando(c.id);
  }

  /** Descarta o que foi digitado e devolve o nome que está gravado. */
  function cancelarRenome(c: CategoriaRow) {
    setNomes((n) => ({ ...n, [c.id]: c.name }));
    setRenomeando(null);
  }

  function renomear(c: CategoriaRow) {
    const nome = nomeDe(c).trim();
    setRenomeando(null);
    if (nome === c.name) return;
    setErro(null);
    startTransition(async () => {
      const r = await saveCategory(c.id, { name: nome, sortOrder: c.sortOrder });
      if (!r.ok) {
        setErro(r.message ?? "Falhou.");
        // Volta ao que estava: deixar o nome recusado no campo faria parecer
        // que ele foi aceito.
        setNomes((n) => ({ ...n, [c.id]: c.name }));
      }
    });
  }

  function abrirMigracao(c: CategoriaRow, apagarDepois: boolean) {
    setErro(null);
    setAviso(null);
    setConfirmando(null);
    setDestino("");
    setParaApagar(apagarDepois);
    setMigrando(c.id);
  }

  /** Categoria com produto não se apaga: a lixeira abre a migração antes. */
  function aoTocarLixeira(c: CategoriaRow) {
    if (c.produtos > 0) return abrirMigracao(c, true);
    setAviso(null);
    setMigrando(null);
    setConfirmando(c.id);
  }

  function migrar(c: CategoriaRow) {
    const para = Number(destino);
    if (!para) return setErro("Escolha para qual categoria os produtos vão.");
    setErro(null);
    startTransition(async () => {
      const r = await migrarProdutosDaCategoria(c.id, para);
      if (!r.ok) return setErro(r.message ?? "Falhou.");
      setAviso(r.message ?? null);
      setMigrando(null);
      // Veio pela lixeira: agora que está vazia, a pergunta de apagar.
      if (paraApagar) setConfirmando(c.id);
    });
  }

  function apagar(id: number) {
    setErro(null);
    setConfirmando(null);
    startTransition(async () => {
      const r = await deleteCategory(id);
      if (!r.ok) setErro(r.message ?? "Falhou.");
    });
  }

  return (
    <div className="space-y-4">
      {/* Só o quadrado, como o "Novo produto". O campo aparece embaixo dele,
          no mesmo cartão, com o cursor já nele, e some depois de criar. */}
      <CartaoDeBotoes>
        <BotaoQuadrado
          icone={Plus}
          texto="Nova categoria"
          tom="primario"
          ativo={criando}
          onClick={() => {
            setNova("");
            setCriando(!criando);
          }}
        />
        {criando && (
          <form onSubmit={criar} className="col-span-full flex basis-full flex-wrap items-center gap-2 border-t border-[var(--border)] p-3">
            <Input
              aria-label="Nome da nova categoria"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNova("");
                  setCriando(false);
                }
              }}
              placeholder="Nome da categoria, ex: Panificação"
              className="h-9 min-w-0 flex-1 basis-48 bg-[var(--background)] px-2.5"
              autoFocus
            />
            <Button type="submit" disabled={pendente || nova.trim() === ""} className="h-9 px-4">
              Criar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setNova("");
                setCriando(false);
              }}
            >
              Cancelar
            </Button>
          </form>
        )}
      </CartaoDeBotoes>

      {erro && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-xs font-medium text-[var(--ok-strong)]">
          {aviso}
        </p>
      )}

      {categorias.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhuma categoria ainda. Crie as divisões em que você separa a compra:
          hortifrúti, carnes, limpeza.
        </p>
      ) : (
        <section>
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
            {plural(categorias.length, "categoria", "categorias")} · na ordem da lista de compras
          </p>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {categorias.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                {/* A posição: é a ordem em que a lista de compras sai. Só o
                    número, sem bolinha em volta. */}
                <span aria-hidden className="num-display w-5 shrink-0 text-right text-sm text-[var(--muted-foreground)]">
                  {i + 1}
                </span>
                <Input
                  aria-label={`Nome da categoria ${c.name}`}
                  value={nomeDe(c)}
                  onChange={(e) =>
                    setNomes((n) => ({ ...n, [c.id]: e.target.value }))
                  }
                  onBlur={() => aoSairDoNome(c)}
                  // Parece texto até receber o toque: a lista é para ler, e
                  // renomear é de vez em quando.
                  className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-[var(--border)] focus:bg-[var(--background)] sm:max-w-64"
                />
                {confirmando === c.id ? (
                  <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[var(--muted-foreground)]">Apagar {c.name}?</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => apagar(c.id)}
                      disabled={pendente}
                      className="border-transparent bg-[var(--destructive)] font-semibold text-white hover:border-transparent hover:opacity-90"
                    >
                      Apagar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(null)}>
                      Não
                    </Button>
                  </span>
                ) : (
                  <span className="ml-auto flex items-center gap-1">
                    {c.produtos > 0 && (
                      <button
                        type="button"
                        onClick={() => (migrando === c.id ? setMigrando(null) : abrirMigracao(c, false))}
                        disabled={pendente}
                        aria-expanded={migrando === c.id}
                        aria-label={`Migrar os produtos de ${c.name} para outra categoria`}
                        title="Migrar produtos"
                        className={`inline-flex size-8 items-center justify-center rounded-md transition hover:bg-[var(--muted)] hover:text-[var(--primary)] disabled:opacity-40 ${
                          migrando === c.id ? "bg-[var(--muted)] text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        <ArrowRightLeft aria-hidden className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => aoTocarLixeira(c)}
                      disabled={pendente}
                      aria-label={`Apagar a categoria ${c.name}`}
                      title={c.produtos > 0 ? "Apagar categoria (migre os produtos antes)" : "Apagar categoria"}
                      className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--destructive)] disabled:opacity-40"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </span>
                )}

                {/* Os números embaixo do nome, alinhados com ele: os botões ficam na
                    linha do nome, sempre no mesmo lugar. */}
                <span className="flex basis-full flex-wrap items-center gap-1.5 pl-8 text-xs text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-1">
                    <Package aria-hidden className="size-3.5" />
                    {plural(c.produtos, "produto")}
                  </span>
                  {c.fornecedores > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-2 py-1">
                      <Truck aria-hidden className="size-3.5" />
                      {plural(c.fornecedores, "fornecedor", "fornecedores")}
                    </span>
                  )}
                </span>

                {migrando === c.id && (
                  <div className="w-full space-y-2 rounded-lg bg-[var(--muted)] p-2.5 text-sm">
                    {paraApagar && (
                      <p className="font-medium">
                        {c.name} tem {plural(c.produtos, "produto")}. Para apagar, primeiro
                        leve os produtos para outra categoria.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Migrar {plural(c.produtos, "produto")} de <strong>{c.name}</strong> para
                      </span>
                      <select
                        aria-label="Categoria de destino"
                        value={destino}
                        onChange={(e) => setDestino(e.target.value)}
                        className="field h-9 min-w-0 flex-1 basis-40 bg-[var(--background)] py-0"
                      >
                        <option value="">escolha a categoria</option>
                        {categorias
                          .filter((o) => o.id !== c.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={pendente || !destino} onClick={() => migrar(c)}>
                        {paraApagar ? "Migrar e continuar" : "Migrar"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setMigrando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Confirmação embutida, na largura da fileira, no mesmo molde
                    da de apagar — e do resto do projeto. Mostra os dois nomes
                    porque o que se confere é a troca. */}
                {renomeando === c.id && (
                  <div className="w-full rounded-lg bg-[var(--muted)] p-2.5">
                    <p className="text-sm">
                      Renomear <strong>{c.name}</strong> para{" "}
                      <strong>{nomeDe(c).trim() || "vazio"}</strong>?
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" disabled={pendente} onClick={() => renomear(c)}>
                        Confirmar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pendente}
                        onClick={() => cancelarRenome(c)}
                      >
                        Voltar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="hint">
        Mudar o nome pede confirmação: a categoria agrupa os produtos e manda na
        ordem em que a lista de compras sai. Só se apaga categoria vazia: com
        produtos dentro, a lixeira pede para migrá-los antes.
      </p>
    </div>
  );
}
