"use client";

import { BookOpen, Check, ClipboardPaste, Copy, Download, FileText, RotateCcw } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chave } from "@/lib/format";
import { casarIngredientes, lerReceita } from "@/lib/receituario-importar";

import { EditorDeFicha, type OpcaoDeFicha, type OpcaoDeInsumo, type ValorInicial } from "../editor-de-ficha";

/**
 * Os dois passos (baixar o padrão, colar a resposta) e, lida a resposta, o
 * Editar ficha já preenchido. A leitura é toda aqui no navegador: nada vai
 * ao servidor até a pessoa salvar a ficha.
 */
export function ImportarReceita({
  padrao,
  insumos,
  fichas,
  etiquetas,
}: {
  /** O texto do padrão, para ver e copiar aqui mesmo (`lib/receituario-padrao.ts`). */
  padrao: string;
  insumos: OpcaoDeInsumo[];
  fichas: OpcaoDeFicha[];
  etiquetas: string[];
}) {
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [lida, setLida] = useState<{ inicial: ValorInicial; semPar: number; vez: number } | null>(null);

  function ler() {
    const r = lerReceita(texto);
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros([]);
    const x = r.receita;
    const linhas = casarIngredientes(
      x.ingredientes,
      insumos.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidadeUso })),
      fichas.map((f) => ({ id: f.id, nome: f.nome, unidade: f.unidadeRendimento, codigo: f.codigo })),
    );
    const n = (v: number) => String(v).replace(".", ",");
    const inicial: ValorInicial = {
      codigo: "",
      nome: x.nome,
      categoria: x.categoria,
      tipo: x.tipo,
      operacoes: x.operacoes,
      // Só as etiquetas da casa: a inventada pela IA não acha filtro depois.
      etiquetas: etiquetas.filter((e) => x.etiquetas.some((y) => chave(y) === chave(e))),
      porcoes: String(x.porcoes),
      rendimentoTotal: x.rendimento ? n(x.rendimento.quantidade) : "",
      unidadeRendimento: x.rendimento?.unidade ?? "g",
      tempoPreparo: x.tempoPreparo,
      passos: x.passos.length ? x.passos : [""],
      observacoes: x.observacoes,
      alergenicos: x.alergenicos,
      viabilidade: x.forno?.viabilidade ?? "",
      modoForno: x.forno?.modo ?? "",
      temperatura: x.forno?.temperatura ?? "",
      umidade: x.forno?.umidade ?? "",
      tempoForno: x.forno?.tempo ?? "",
      sonda: x.forno?.sonda ?? "",
      ajusteForno: x.forno?.ajuste ?? "",
      utensilios: x.utensilios,
      pontoDeControle: x.pontoDeControle,
      armazenamento: x.armazenamento,
      montagem: x.montagem,
      custoManualPorcao: "",
      ingredientes: linhas,
    };
    setLida({ inicial, semPar: linhas.filter((l) => l.insumoId === null && l.subFichaId === null).length, vez: (lida?.vez ?? 0) + 1 });
  }

  if (lida) {
    return (
      <>
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
          <p className="font-semibold">Receita lida. Confira e salve.</p>
          {lida.semPar > 0 ? (
            <p style={{ color: "var(--warn)" }}>
              {lida.semPar === 1
                ? "1 ingrediente precisa ser ligado a um insumo da casa: ele está com a busca aberta."
                : `${lida.semPar} ingredientes precisam ser ligados a um insumo da casa: eles estão com a busca aberta.`}
            </p>
          ) : (
            <p className="text-[var(--muted-foreground)]">Todos os ingredientes foram ligados aos insumos da casa.</p>
          )}
          <FileiraDeBotoes>
            <BotaoQuadrado icone={RotateCcw} texto="Ler outra" onClick={() => setLida(null)} />
          </FileiraDeBotoes>
        </div>
        <EditorDeFicha key={lida.vez} id={null} inicial={lida.inicial} insumos={insumos} fichas={fichas} etiquetas={etiquetas} />
      </>
    );
  }

  return (
    <>
      <CartaoDeSecao icone={Download} titulo="1. O padrão" frase="A estrutura da receita que a IA preenche.">
        <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs leading-relaxed whitespace-pre-wrap">{padrao}</pre>
        <p className="hint">
          Para o Gem do Gemini, baixe o Documento do Gem: instruções, este padrão e a lista de insumos de hoje, para a IA escrever os nomes iguais ao cadastro. Baixe de novo quando cadastrar insumos.
        </p>
        <div className="border-t border-[var(--border)] pt-1">
          <FileiraDeBotoes>
            <BotaoQuadrado
              icone={copiado ? Check : Copy}
              texto={copiado ? "Copiado" : "Copiar"}
              tom="primario"
              onClick={async () => {
                await navigator.clipboard.writeText(padrao);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            />
            <BotaoQuadrado icone={FileText} texto="Baixar" href="/admin/receituario/importar/padrao" baixar />
            <BotaoQuadrado icone={BookOpen} texto="Documento do Gem" href="/admin/receituario/importar/assistente" baixar />
          </FileiraDeBotoes>
        </div>
      </CartaoDeSecao>

      <CartaoDeSecao icone={ClipboardPaste} titulo="2. Cole a resposta da IA" frase="A resposta inteira serve: o sistema acha o bloco da receita.">
        <label className="block">
          <span className="label">Resposta da IA</span>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} placeholder='{ "nome": "...", "categoria": "...", ... }' className="font-mono text-sm" />
        </label>
        <label className="block">
          <span className="label">Ou o arquivo que a IA gerou</span>
          <input
            type="file"
            accept=".json,.txt,.md,application/json,text/plain,text/markdown"
            onChange={async (e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) setTexto(await arquivo.text());
            }}
            className="block w-full text-sm"
          />
        </label>
        {erros.length > 0 && (
          <div role="alert" className="msg-error space-y-1">
            <p className="font-semibold">A receita não entrou:</p>
            <ul className="list-disc pl-5">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <Button type="button" className="h-11 px-6" disabled={!texto.trim()} onClick={ler}>
          Ler receita
        </Button>
      </CartaoDeSecao>
    </>
  );
}
