"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarCardapio } from "@/lib/actions/eventos";

import { useAcao } from "@/lib/use-acao";

/** Só o nome: o resto se monta na tela do cardápio. */
export function NovoCardapio() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarCardapio(null, { nome, descricao: "", precoPorPessoa: "" }),
          (r) => r.ok && router.push(`/admin/eventos/cardapios/${r.data.id}`),
        );
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Novo cardápio, ex.: Jantar 3 tempos" maxLength={100} aria-label="Nome do novo cardápio" className="min-w-0 flex-1" />
        <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={pendente || nome.trim().length < 2}>
          <Plus aria-hidden className="size-4" />
          Criar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </form>
  );
}
