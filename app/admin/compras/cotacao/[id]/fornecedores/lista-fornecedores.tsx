"use client";

import { Check, Copy, Link, Link2, MessageCircle, Pencil, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { BotaoQuadrado, CartaoDeBotoes, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { Lista } from "@/components/pagina";
import { desvincularFornecedor, gerarLinkCotacao } from "@/lib/actions/cotacao";
import { CHAMADO_LABEL, corDoTom } from "@/lib/cotacao-labels";
import { plural } from "@/lib/format";
import type { FornecedorDaCotacao } from "@/lib/cotacao-fornecedores";

import { FornecedorPanel } from "../fornecedor-panel";
import { VincularFornecedor, type ForaDaLista } from "../vincular-fornecedor";

/**
 * A quem mandar o link desta cotação.
 *
 * Saiu de dentro da tela da cotação e virou passo próprio, a pedido do dono.
 * Lá ela era um `details` que nascia aberto no topo: com nove fornecedores
 * eram uns 400px de lista de cadastro empurrando o mapa de preços para fora
 * da primeira tela — e o mapa é o que a pessoa vai olhar durante toda a
 * semana, enquanto chamar fornecedor se faz uma vez.
 *
 * As duas coisas também acontecem em momentos diferentes: aqui o trabalho é
 * mandar link e esperar; lá é decidir de quem comprar. Empilhá-las numa
 * página só era pedir para rolar por cima de uma para chegar na outra.
 *
 * Os botões de cadastrar e vincular ficam nas DUAS telas, e é de propósito:
 * o fornecedor que falta costuma aparecer justamente enquanto se compara
 * preço, e mandar a pessoa voltar um passo para cadastrá-lo seria perder de
 * vista a comparação que motivou o cadastro.
 */
export function ListaFornecedores({
  cotacaoId,
  fechada,
  fornecedores,
  categorias,
  categoriasDaCotacao,
  foraDaLista,
  prazoTexto = null,
  totalItens,
}: {
  cotacaoId: number;
  fechada: boolean;
  fornecedores: FornecedorDaCotacao[];
  categorias: { id: number; name: string }[];
  categoriasDaCotacao: number[];
  foraDaLista: ForaDaLista[];
  /** "quarta-feira, 24 de setembro às 18:00", para a mensagem. Nulo = sem prazo. */
  prazoTexto?: string | null;
  /** Quantos itens a cotação tem — o "de 120" do "cobre 48 de 120". */
  totalItens: number;
}) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  /* Qual fornecedor está com o painel aberto, e se o de cadastrar está.
     Um por vez, e os dois se excluem: o painel carrega o fornecedor inteiro
     do servidor ao abrir, e dois rascunhos vivos do mesmo cadastro é como se
     perde uma edição sem ninguém ver. */
  const [editando, setEditando] = useState<number | null>(null);
  /* O painel aberto no cartão de cima: cadastrar ou vincular. Um por vez, e
     fecha o de editar, pelo mesmo motivo. */
  const [painel, setPainel] = useState<"novo" | "vincular" | null>(null);
  /** Qual fornecedor está com a pergunta de tirar o convite aberta. */
  const [tirando, setTirando] = useState<number | null>(null);

  function abrirPainel(qual: "novo" | "vincular") {
    setPainel((a) => (a === qual ? null : qual));
    setEditando(null);
  }

  function link(token: string) {
    return `${window.location.origin}/comprador/cotacao/${token}`;
  }

  function chamar(fornecedorId: number) {
    setErro(null);
    startTransition(async () => {
      const r = await gerarLinkCotacao(cotacaoId, fornecedorId);
      if (!r.ok) setErro(r.message);
    });
  }

  /* Os já chamados em cima (é deles que se espera resposta), depois quem
     cobre mais itens — a ordem de quem vale a pena chamar. */
  const ordenados = [...fornecedores].sort(
    (a, b) => Number(b.chamado !== null) - Number(a.chamado !== null) || b.cobre - a.cobre,
  );
  const aChamar = ordenados.filter((f) => f.chamado === null && f.cobre > 0);

  /** Um link para cada um que ainda não foi chamado, em sequência. */
  function chamarTodos() {
    setErro(null);
    startTransition(async () => {
      for (const f of aChamar) {
        const r = await gerarLinkCotacao(cotacaoId, f.id);
        if (!r.ok) return setErro(`${f.apelido ?? f.nome}: ${r.message}`);
      }
    });
  }

  function desvincular(cotacaoFornecedorId: number) {
    setErro(null);
    startTransition(async () => {
      const r = await desvincularFornecedor(cotacaoId, cotacaoFornecedorId);
      if (!r.ok) setErro(r.message);
      setTirando(null);
    });
  }

  async function copiar(f: FornecedorDaCotacao) {
    if (!f.chamado) return;
    try {
      await navigator.clipboard.writeText(link(f.chamado.token));
      setCopiado(f.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o endereço e copie à mão.");
    }
  }

  function whatsapp(f: FornecedorDaCotacao) {
    if (!f.chamado || !f.wa) return;
    const prazo = prazoTexto ? ` Responda até ${prazoTexto}.` : "";
    const texto = `Olá! Estamos cotando a compra da semana. Confira os itens e digite seu preço por aqui: ${link(f.chamado.token)}${prazo}`;
    window.open(`${f.wa}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  const chamados = ordenados.filter((f) => f.chamado !== null);
  const semLink = ordenados.filter((f) => f.chamado === null);

  /** Um fornecedor: o nome inteiro em cima, o apelido, quanto cobre e o estado embaixo, e os quadrados. */
  function linha(f: FornecedorDaCotacao) {
    const chamado = f.chamado;
    const estado = chamado ? CHAMADO_LABEL[chamado.estatus] : null;
    return (
      <li key={f.id} className="px-3 pt-3 pb-1">
        {/* A razão social inteira, que é o que deixa conferir se é a empresa
            certa, e o apelido embaixo, que é como ela aparece na cotação. O
            "cobre" diz se vale a pena chamar. O resto do cadastro fica no
            Editar: a pergunta desta tela é "a quem eu mando o link?". */}
        <p className="font-medium">{f.nome}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted-foreground)]">
          {f.apelido && <span>{f.apelido}</span>}
          <span className={f.cobre > 0 ? "" : "opacity-60"}>
            cobre {f.cobre} de {plural(totalItens, "item", "itens")}
          </span>
          {estado && (
            <span className="selo" style={{ color: corDoTom(estado.tom) }}>
              {estado.texto}
            </span>
          )}
        </p>

        <div className="mt-2 border-t border-[var(--border)] pt-1">
          <FileiraDeBotoes>
            {/* Com a cotação fechada, os botões de link saem: o link leva a
                uma página que só diz "esta cotação já foi fechada". */}
            {!fechada && chamado && (
              <>
                <BotaoQuadrado
                  icone={copiado === f.id ? Check : Copy}
                  texto={copiado === f.id ? "Copiado" : "Copiar link"}
                  onClick={() => copiar(f)}
                />
                {/* Sem telefone não há conversa para abrir. */}
                <BotaoQuadrado
                  icone={MessageCircle}
                  texto="WhatsApp"
                  desligado={!f.wa}
                  dica={f.wa ? `Mandar o link para ${f.apelido ?? f.nome}` : "Este fornecedor não tem telefone cadastrado"}
                  onClick={() => whatsapp(f)}
                />
                {/* Tirar o convite, e só de quem ainda não respondeu: é o
                    desfazer do Vincular. O preço de quem respondeu se recusa
                    na comparação, não aqui. */}
                {chamado.estatus !== "RESPONDIDA" && (
                  <BotaoQuadrado icone={X} texto="Tirar" tom="perigo" desligado={pendente} onClick={() => setTirando(tirando === f.id ? null : f.id)} />
                )}
              </>
            )}
            {!fechada && !chamado && (
              <BotaoQuadrado icone={Link2} texto="Gerar link" tom="primario" desligado={pendente} onClick={() => chamar(f.id)} />
            )}
            {/* O Editar fica sempre, inclusive com a cotação fechada:
                corrigir um telefone continua valendo. */}
            <BotaoQuadrado
              icone={Pencil}
              texto="Editar"
              ativo={editando === f.id}
              onClick={() => {
                setPainel(null);
                setEditando((a) => (a === f.id ? null : f.id));
              }}
            />
          </FileiraDeBotoes>
        </div>

        {tirando === f.id && chamado && (
          <div className="pb-2">
            <CaixaDeConfirmacao
              pergunta={`Tirar ${f.apelido ?? f.nome} desta cotação? O link dele deixa de valer.`}
              confirmar="Tirar"
              pendente={pendente}
              aoConfirmar={() => desvincular(chamado.id)}
              aoVoltar={() => setTirando(null)}
            />
          </div>
        )}

        {editando === f.id && (
          <div className="pb-2">
            <FornecedorPanel
              supplierId={f.id}
              categorias={categorias}
              categoriasDaCotacao={categoriasDaCotacao}
              aoFechar={() => setEditando(null)}
            />
          </div>
        )}
      </li>
    );
  }

  return (
    /* `data-sem-relevo`: os quadrados ficam sem a sombra dos botões da
       cotação (ver `globals.css`). */
    <div data-sem-relevo className="mt-3 space-y-3">
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Cadastrar e vincular são parecidos e diferentes: "Cadastrar" cria
          quem não existe; "Vincular" chama quem existe e a lista não
          alcançou. Somem com a cotação fechada: ninguém novo é chamado
          nesta rodada. */}
      {!fechada && (
        <CartaoDeBotoes>
          {aChamar.length > 0 && (
            <BotaoQuadrado
              icone={Link2}
              texto={pendente ? "Gerando…" : `Gerar todos (${aChamar.length})`}
              tom="primario"
              desligado={pendente}
              dica="Um link para cada fornecedor que ainda não foi chamado"
              onClick={chamarTodos}
            />
          )}
          <BotaoQuadrado icone={UserPlus} texto="Cadastrar" ativo={painel === "novo"} onClick={() => abrirPainel("novo")} />
          {foraDaLista.length > 0 && (
            <BotaoQuadrado icone={Link} texto="Vincular" ativo={painel === "vincular"} dica="Chamar quem a lista não trouxe" onClick={() => abrirPainel("vincular")} />
          )}
          {painel === "novo" && (
            <div className="col-span-full basis-full border-t border-[var(--border)] p-3">
              <FornecedorPanel supplierId={null} categorias={categorias} categoriasDaCotacao={categoriasDaCotacao} aoFechar={() => setPainel(null)} />
            </div>
          )}
          {painel === "vincular" && (
            <div className="col-span-full basis-full border-t border-[var(--border)] p-3">
              <VincularFornecedor cotacaoId={cotacaoId} disponiveis={foraDaLista} aoFechar={() => setPainel(null)} />
            </div>
          )}
        </CartaoDeBotoes>
      )}

      {fornecedores.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhum fornecedor atende as categorias desta lista. Cadastre um, ou vincule alguém que já existe.
        </p>
      ) : (
        fechada && <p className="hint">Quem foi chamado nesta rodada. Os links não valem mais: a cotação está fechada.</p>
      )}

      {/* Os chamados em cima, porque é deles que se espera resposta; depois
          quem ainda não tem link, de quem cobre mais para quem cobre menos. */}
      {chamados.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm text-[var(--muted-foreground)]">Chamados</h3>
          <Lista>{chamados.map(linha)}</Lista>
        </section>
      )}
      {semLink.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm text-[var(--muted-foreground)]">Ainda sem link</h3>
          <Lista>{semLink.map(linha)}</Lista>
        </section>
      )}
    </div>
  );
}
