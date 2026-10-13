"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { criarProjeto } from "@/lib/actions/tarefas";

/**
 * Um quadro novo, em três campos.
 *
 * Não pergunta quais colunas: elas vêm do modelo da empresa e são as mesmas
 * para todo quadro (RF-060). É a pergunta que o TickTick faz e que produziu os
 * sete conjuntos diferentes de colunas que o diagnóstico encontrou.
 */
export function NovoQuadro({ setores }: { setores: { id: number; nome: string }[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [setorId, setSetorId] = useState("");
  const [privado, setPrivado] = useState(false);

  function criar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarProjeto({
        nome,
        descricao: descricao.trim() || null,
        setorId: setorId === "" ? null : Number(setorId),
        privado,
      });
      if (!r.ok) return setErro(r.message);
      setNome("");
      setDescricao("");
      setSetorId("");
      setPrivado(false);
      // Só o `push`, sem `refresh` antes. Os dois juntos correm: o refresh
      // recarrega a lista, termina DEPOIS da navegação e devolve a pessoa para
      // a tela de onde ela acabou de sair. E o refresh não era preciso — a
      // lista é `force-dynamic` e vem nova quando alguém voltar a ela.
      router.push(`/admin/tarefas/${r.data.id}`);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        criar();
      }}
    >
      <div>
        <label className="label" htmlFor="quadro-nome">
          Nome do quadro
        </label>
        <input
          id="quadro-nome"
          className="field"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="MANUTENÇÃO"
          maxLength={60}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="quadro-descricao">
          Para que serve <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="quadro-descricao"
          className="field"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Conserto e preventiva de equipamento"
        />
      </div>

      {setores.length > 0 && (
        <div>
          <label className="label" htmlFor="quadro-setor">
            Setor <span className="font-normal">(opcional)</span>
          </label>
          <select
            id="quadro-setor"
            className="field"
            value={setorId}
            onChange={(e) => setSetorId(e.target.value)}
          >
            <option value="">sem setor</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={privado}
          onChange={(e) => setPrivado(e.target.checked)}
        />
        Só quem for membro vê este quadro
      </label>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <Button type="submit" disabled={pendente || nome.trim() === ""}>
        {pendente ? "Criando…" : "Criar quadro"}
      </Button>
      <p className="hint">
        O quadro nasce com as oito colunas da casa: BACKLOG, LAPIDAR, A FAZER, EM
        ANDAMENTO, AGUARDANDO, ROTINA, DOCUMENTADO e CONCLUÍDO.
      </p>
    </form>
  );
}
