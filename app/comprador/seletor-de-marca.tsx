"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

import { Obrigatorio, classeObrigatoria } from "./obrigatorio";

/** Valor interno do "outra": nenhuma marca de verdade se chama assim. */
const OUTRA = "__outra__";

/**
 * Qual das marcas pedidas o fornecedor está oferecendo.
 *
 * Some quando o produto não pede marca nenhuma — a casa que escreveu "tanto
 * faz" não quer uma pergunta a mais na tela de quem responde. Com
 * `obrigatoria`, não some nunca: quem pergunta assim decidiu que preço sem
 * marca não é proposta, porque na entrega a marca aparece de qualquer jeito e
 * aí é tarde para discordar.
 *
 * "Outra" só aparece quando o cadastro diz que aceita similar. Sem isso, a
 * opção convidaria o fornecedor a oferecer o que a casa já decidiu que não
 * serve, e a recusa viria depois, na entrega.
 *
 * Compartilhado entre a cotação e o pedido direto: é a mesma pergunta feita
 * ao mesmo fornecedor, e duas grafias dela seriam duas telas diferentes para
 * quem responde.
 */
export function SeletorDeMarca({
  marcas,
  aceitaSimilar,
  valor,
  aoMudar,
  obrigatoria = false,
}: {
  marcas: string[];
  aceitaSimilar: boolean;
  valor: string;
  aoMudar: (marca: string) => void;
  obrigatoria?: boolean;
}) {
  const [outra, setOutra] = useState(valor !== "" && !marcas.includes(valor));

  if (marcas.length === 0) {
    // A casa não pediu marca nenhuma. Se a resposta exige uma, ele escreve a
    // dele; se não exige, a pergunta nem aparece.
    if (!obrigatoria) return null;
    return (
      <label className="text-sm">
        <span className="mb-1.5 block text-base font-semibold">
          Marca do produto{obrigatoria && <Obrigatorio />}
        </span>
        <Input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder="qual marca?"
          enterKeyHint="next"
          maxLength={120}
          aria-required
          className={`h-8 w-full text-lg ${classeObrigatoria(valor)}`}
        />
      </label>
    );
  }

  return (
    <div>
      <label className="text-sm">
        <span className="mb-1.5 block text-base font-semibold">
          Marca do produto{obrigatoria && <Obrigatorio />}
        </span>
        <select
          value={outra ? OUTRA : valor}
          onChange={(e) => {
            if (e.target.value === OUTRA) {
              setOutra(true);
              aoMudar("");
              return;
            }
            setOutra(false);
            aoMudar(e.target.value);
          }}
          aria-required={obrigatoria}
          /* Com "outra" escolhida, a lista já está respondida: quem fica
             rosado é a caixa de texto que aparece embaixo. */
          className={`field h-8 w-full py-0 ${
            obrigatoria ? classeObrigatoria(outra ? OUTRA : valor) : ""
          } ${!obrigatoria || outra || valor !== "" ? "bg-[var(--surface)]" : ""}`}
        >
          <option value="">escolha a marca</option>
          {marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {aceitaSimilar && <option value={OUTRA}>outra marca</option>}
        </select>
      </label>

      {outra && (
        <Input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder="qual marca?"
          enterKeyHint="next"
          maxLength={120}
          aria-label="Qual outra marca"
          aria-required={obrigatoria}
          className={`mt-2 h-8 w-full ${obrigatoria ? classeObrigatoria(valor) : ""}`}
        />
      )}
    </div>
  );
}
