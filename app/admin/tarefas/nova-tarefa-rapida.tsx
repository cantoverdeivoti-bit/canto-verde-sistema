"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";

import { Gaveta } from "@/components/gaveta";
import { Button } from "@/components/ui/button";
import {
  criarTarefa,
  quadrosParaNovaTarefa,
  type QuadroParaNovaTarefa,
} from "@/lib/actions/tarefas";

/** Já está no navegador? Sem efeito nem estado: o servidor diz não, o cliente diz sim. */
const nada = () => () => {};
function useNoNavegador() {
  return useSyncExternalStore(nada, () => true, () => false);
}

/**
 * O "+" do canto: criar tarefa de qualquer tela do módulo, sem ir ao quadro.
 *
 * O quadro já tem o campo "+ nova tarefa" em cada coluna, mas só dentro dele.
 * Quem está na busca, na matriz ou no detalhe de outra tarefa e lembra de uma
 * coisa precisava sair de onde estava, achar o quadro e a coluna; é nesse
 * caminho que a lembrança se perde. O botão fica sempre no mesmo lugar,
 * no canto de baixo, onde o polegar alcança no celular.
 *
 * O painel é uma exceção consciente à regra de que o painel não tem diálogo:
 * criar daqui é justamente não sair da tela em que se está, e um formulário
 * no meio do conteúdo empurraria a tela inteira. É o mesmo arranjo da troca de
 * pessoa na escala (`app/admin/pessoal/escala-da-semana.tsx`): folha que sobe
 * de baixo no celular, cartão no meio no computador.
 *
 * Vai para o `body` por portal porque o conteúdo do painel mora dentro de um
 * `@container`, e contêiner prende `position: fixed` nele mesmo: sem o portal,
 * o botão ficaria no fim da página em vez de no canto da tela.
 *
 * Os campos são os que cabem num lembrete: o que fazer, em que quadro, em que
 * coluna e, se tiver, até quando. Quem faz é quem digita, como no "+" do
 * quadro (RN-010); trocar o responsável, a prioridade ou escrever a descrição
 * é no detalhe, que a confirmação deixa a um toque.
 */
export function NovaTarefaRapida() {
  const noNavegador = useNoNavegador();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [carregando, startCarregar] = useTransition();
  const [carga, setCarga] = useState<Carga | null>(null);

  // Os quadros vêm a cada abertura, no próprio toque: um quadro criado ou uma
  // coluna ocultada desde a última vez já aparece certo.
  function abrir() {
    setAberto(true);
    setCarga(null);
    startCarregar(async () => {
      const r = await quadrosParaNovaTarefa();
      if (!r.ok) return setCarga({ erro: r.message });
      // Estando dentro de um quadro, é nele que a tarefa nasce; fora, no
      // primeiro da lista, que é a mesma ordem da tela de Quadros.
      const doCaminho = Number(/^\/admin\/tarefas\/(\d+)/.exec(pathname)?.[1]);
      const inicial = r.data.quadros.find((q) => q.id === doCaminho) ?? r.data.quadros[0];
      setCarga({ dados: r.data, inicialId: inicial?.id ?? null });
    });
  }

  if (!noNavegador) return null;

  return createPortal(
    <>
      {!aberto && (
        <button
          type="button"
          onClick={abrir}
          aria-label="Nova tarefa"
          title="Nova tarefa"
          className="fixed right-5 bottom-[calc(var(--barra-de-baixo)+max(1.25rem,calc(env(safe-area-inset-bottom)-var(--barra-de-baixo))))] z-40 flex size-14 items-center justify-center rounded-full bg-[var(--botao)] text-[var(--botao-texto)] shadow-lg transition-transform active:scale-95 print:hidden"
        >
          <Plus aria-hidden className="size-7" />
        </button>
      )}
      {aberto && (
        <Painel
          aoFechar={() => setAberto(false)}
          carregando={carregando}
          carga={carga}
          // Uma carga nova remonta o formulário com o quadro inicial dela.
          key={carga && "dados" in carga ? "pronto" : "esperando"}
        />
      )}
    </>,
    document.body,
  );
}

type Carregado = { quadros: QuadroParaNovaTarefa[]; souEu: number };
type Carga = { dados: Carregado; inicialId: number | null } | { erro: string };

function Painel({
  aoFechar,
  carregando,
  carga,
}: {
  aoFechar: () => void;
  carregando: boolean;
  carga: Carga | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();

  const pronto = carga && "dados" in carga ? carga : null;
  const dados = pronto?.dados ?? null;
  const inicial = dados?.quadros.find((q) => q.id === pronto?.inicialId);

  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [projetoId, setProjetoId] = useState<number | null>(inicial?.id ?? null);
  const [colunaId, setColunaId] = useState<number | null>(inicial?.colunas[0]?.id ?? null);
  const [prazo, setPrazo] = useState("");
  const [criada, setCriada] = useState<{ id: number; titulo: string } | null>(null);

  const quadro = dados?.quadros.find((q) => q.id === projetoId) ?? null;

  function trocarQuadro(id: number) {
    setProjetoId(id);
    // A coluna é do quadro: trocar o quadro volta para a primeira dele, em vez
    // de deixar marcada uma coluna que não existe ali.
    setColunaId(dados?.quadros.find((q) => q.id === id)?.colunas[0]?.id ?? null);
  }

  function criar() {
    const texto = titulo.trim();
    if (texto === "" || !dados || projetoId === null || colunaId === null) return;
    setErro(null);
    startTransition(async () => {
      const r = await criarTarefa({
        projetoId,
        colunaId,
        titulo: texto,
        responsavelId: dados.souEu,
        prioridade: "NENHUMA",
        prazo: prazo === "" ? null : prazo,
      });
      if (!r.ok) return setErro(r.message);
      // Fica aberto e limpo para a próxima: quem lembra de uma coisa costuma
      // lembrar de outra logo em seguida. Quadro, coluna e prazo continuam.
      setCriada({ id: r.data.id, titulo: texto });
      setTitulo("");
      // A tela de trás (o quadro, a busca) passa a mostrar o cartão novo.
      router.refresh();
    });
  }

  return (
    <Gaveta rotulo="Nova tarefa" aoFechar={aoFechar} className="overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-[var(--border)] p-4">
          <p className="min-w-0 flex-1 font-semibold">Nova tarefa</p>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-m-1 p-1 text-[var(--muted-foreground)]"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {carregando && !dados && (
          <p className="p-4 text-sm text-[var(--muted-foreground)]">Carregando os quadros…</p>
        )}

        {dados && dados.quadros.length === 0 && (
          <p className="p-4 text-sm">
            Não há quadro em que você possa criar tarefa.{" "}
            <Link href="/admin/tarefas" onClick={aoFechar} className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
              Ver os quadros
            </Link>
          </p>
        )}

        {dados && quadro && (
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              criar();
            }}
          >
            <div>
              <label className="label" htmlFor="rapida-titulo">
                O que precisa ser feito
              </label>
              <input
                id="rapida-titulo"
                className="field"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={250}
                autoFocus
                required
                disabled={pendente}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="label" htmlFor="rapida-quadro">
                  Quadro
                </label>
                <select
                  id="rapida-quadro"
                  className="field"
                  value={quadro.id}
                  onChange={(e) => trocarQuadro(Number(e.target.value))}
                  disabled={pendente}
                >
                  {dados.quadros.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="rapida-coluna">
                  Coluna
                </label>
                <select
                  id="rapida-coluna"
                  className="field"
                  value={colunaId ?? ""}
                  onChange={(e) => setColunaId(Number(e.target.value))}
                  disabled={pendente}
                >
                  {quadro.colunas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="rapida-prazo">
                Prazo <span className="font-normal">(opcional)</span>
              </label>
              <input
                id="rapida-prazo"
                type="date"
                className="field"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                disabled={pendente}
              />
            </div>

            {erro && (
              <p role="alert" className="error">
                {erro}
              </p>
            )}

            {criada && (
              <p role="status" className="text-sm">
                Criada: {criada.titulo}.{" "}
                <Link
                  href={`/admin/tarefas/t/${criada.id}`}
                  onClick={aoFechar}
                  className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  Abrir
                </Link>
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pendente || titulo.trim() === ""}>
              {pendente ? "Criando…" : "Criar tarefa"}
            </Button>
          </form>
        )}

        {carga && "erro" in carga && (
          <p role="alert" className="error p-4">
            {carga.erro}
          </p>
        )}
    </Gaveta>
  );
}
