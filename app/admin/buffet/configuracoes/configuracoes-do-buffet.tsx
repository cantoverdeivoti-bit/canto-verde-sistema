"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarConfiguracaoBuffet, salvarGrupo } from "@/lib/actions/buffet";
import type { ConfiguracaoBuffetInput } from "@/lib/validations";

import { useAcao } from "@/lib/use-acao";

type Grupo = { id: number; nome: string; cor: string; posicoes: number; metaCustoKg: number | null };
type Config = Omit<ConfiguracaoBuffetInput, "limiteClasseA" | "limiteClasseB"> & { limiteClasseA: number; limiteClasseB: number };

const decimal = (n: number | null) => (n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false }));

export function ConfiguracoesDoBuffet({ grupos, config }: { grupos: Grupo[]; config: Config }) {
  return (
    <>
      <section>
        <h2 className="section-label mb-1">Grupos</h2>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          Na ordem do percurso do cliente. Posições são as cubas do grupo no buffet; a meta é o custo/kg que a média do grupo não deve
          passar.
        </p>
        <div className="space-y-2">
          {grupos.map((g) => (
            <GrupoForm key={g.id} grupo={g} />
          ))}
        </div>
      </section>
      <ConfiguracaoForm config={config} />
    </>
  );
}

function GrupoForm({ grupo }: { grupo: Grupo }) {
  const [v, setV] = useState({ nome: grupo.nome, cor: grupo.cor, posicoes: grupo.posicoes, metaCustoKg: decimal(grupo.metaCustoKg) });
  const { erro, pendente, rodar } = useAcao();
  const mudou = v.nome !== grupo.nome || v.cor !== grupo.cor || v.posicoes !== grupo.posicoes || v.metaCustoKg !== decimal(grupo.metaCustoKg);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarGrupo(grupo.id, v), undefined, { aviso: `${v.nome} salvo` });
      }}
      className="card p-3"
      style={{ borderLeft: `4px solid ${v.cor}` }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem_auto] sm:items-end">
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} required maxLength={40} />
        </label>
        <label>
          <span className="label">Cor</span>
          <input type="color" value={v.cor} onChange={(e) => setV({ ...v, cor: e.target.value })} className="field h-11 p-1" />
        </label>
        <label>
          <span className="label">Posições</span>
          <Input type="number" min={1} max={60} value={v.posicoes} onChange={(e) => setV({ ...v, posicoes: Number(e.target.value) })} required />
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Meta R$/kg</span>
          <Input inputMode="decimal" value={v.metaCustoKg} onChange={(e) => setV({ ...v, metaCustoKg: e.target.value })} placeholder="sem meta" />
        </label>
        <Button type="submit" disabled={pendente || !mudou} className="col-span-2 sm:col-span-1">
          Salvar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </form>
  );
}

function ConfiguracaoForm({ config }: { config: Config }) {
  const [v, setV] = useState<ConfiguracaoBuffetInput>({
    ...config,
    limiteClasseA: decimal(config.limiteClasseA * 100),
    limiteClasseB: decimal(config.limiteClasseB * 100),
  });
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof ConfiguracaoBuffetInput>(k: K, valor: ConfiguracaoBuffetInput[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
  };
  const hora = (k: "inicioTurno" | "aberturaBuffet" | "encerramentoBuffet" | "fimTurno" | "inicioVespera", rotulo: string) => (
    <label>
      <span className="label">{rotulo}</span>
      <Input type="time" value={v[k]} onChange={(e) => muda(k, e.target.value)} required />
    </label>
  );
  const inteiro = (k: "fornos" | "gnPorForno" | "cozinheiros" | "cicloDefumacaoHoras" | "cicloLimpezaMin", rotulo: string, max: number) => (
    <label>
      <span className="label">{rotulo}</span>
      <Input type="number" min={0} max={max} value={v[k]} onChange={(e) => muda(k, Number(e.target.value))} required />
    </label>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarConfiguracaoBuffet(v), undefined, { aviso: "Salvo" });
      }}
      className="space-y-6"
    >
      <section>
        <h2 className="section-label mb-1">Classe A, B e C</h2>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          O peso do prato é o custo/kg dele dividido pela soma do custo/kg dos pratos do dia. Daí para cima, é Classe A (o que mais pesa
          no custo) ou B; abaixo da B, é C.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <label>
            <span className="label">Classe A a partir de (%)</span>
            <Input inputMode="decimal" value={v.limiteClasseA} onChange={(e) => muda("limiteClasseA", e.target.value)} required />
          </label>
          <label>
            <span className="label">Classe B a partir de (%)</span>
            <Input inputMode="decimal" value={v.limiteClasseB} onChange={(e) => muda("limiteClasseB", e.target.value)} required />
          </label>
        </div>
      </section>

      <section>
        <h2 className="section-label mb-1">Horários da operação</h2>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">São a régua das janelas de produção (D-1, J1 a J5) no fluxo do forno.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {hora("inicioTurno", "Início do turno")}
          {hora("aberturaBuffet", "Abertura do buffet")}
          {hora("encerramentoBuffet", "Encerramento do buffet")}
          {hora("fimTurno", "Fim do turno")}
          {hora("inicioVespera", "Início da véspera (D-1)")}
        </div>
      </section>

      <section>
        <h2 className="section-label mb-1">Forno combinado e equipe</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {inteiro("fornos", "Fornos combinados", 20)}
          {inteiro("gnPorForno", "GN por forno", 40)}
          {inteiro("cozinheiros", "Cozinheiros no turno", 50)}
          {inteiro("cicloDefumacaoHoras", "Ciclo de defumação (h)", 24)}
          {inteiro("cicloLimpezaMin", "Ciclo de limpeza (min)", 240)}
        </div>
      </section>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
