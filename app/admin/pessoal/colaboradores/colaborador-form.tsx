"use client";

import { CalendarClock, CalendarDays, ChevronRight, IdCard, Power, Stethoscope, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAviso } from "@/components/aviso-do-topo";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarColaborador } from "@/lib/actions/pessoal";
import type { OpcaoDeFuncao } from "@/lib/funcoes";
import { MOTIVO_DESLIGAMENTO, RAZOES_DO_DESLIGAMENTO } from "@/lib/desligamento";
import { somarDias as somarDiasNaData } from "@/lib/escala";
import { mascaraCpf } from "@/lib/pessoal";
import { maskPhoneBR } from "@/lib/phone-mask";
import type { ColaboradorInput } from "@/lib/validations";

import { EscolhaDeContrato } from "../escolha-de-contrato";

/** O formulário inteiro em texto, como os campos guardam. */
export type ColaboradorNoForm = ColaboradorInput;

export const COLABORADOR_VAZIO: ColaboradorNoForm = {
  nome: "",
  apelido: "",
  telefone: "",
  tipo: "CLT",
  area: "",
  funcaoId: "",
  ativo: true,
  comecouEm: "",
  admissao: "",
  experienciaAte: "",
  asoFeitoEm: "",
  asoValidoAte: "",
  manipulaAlimentos: false,
  aprendiz: false,
  contratoAte: "",
  motivoDesligamento: "",
  razaoDesligamento: "",
  detalheDesligamento: "",
  salario: "",
  diaria: "",
  diariasPorDia: ["", "", "", "", "", "", ""],
  diasDeTrabalho: [],
  observacoes: "",
  cpf: "",
  nascimento: "",
  endereco: "",
  emergenciaNome: "",
  emergenciaTelefone: "",
  desligadoEm: "",
};

/** A semana começando na segunda, como a escala; o índice é o dia (0 = domingo). */
const DIAS_DA_SEMANA: [number, string][] = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [0, "Dom"],
];

/**
 * Cadastro de um colaborador, um cartão por assunto: contrato, situação, na
 * escala, datas e pagamento, saúde ocupacional, dados pessoais. Os campos de
 * cada tipo aparecem só no tipo dele: carteira assinada no CLT, salário no
 * CLT e no fixo, diária no free. O salário só aparece para quem configura o
 * módulo (`podeValores`), e o CPF segue a mesma trava.
 */
export function ColaboradorForm({
  id,
  inicial,
  podeValores,
  funcoes,
}: {
  id: number | null;
  inicial: ColaboradorNoForm;
  podeValores: boolean;
  /** As funções cadastradas (Departamento pessoal → Funções). */
  funcoes: OpcaoDeFuncao[];
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const mostrar = useAviso();
  const [pendente, startTransition] = useTransition();
  const muda = <K extends keyof ColaboradorNoForm>(k: K, valor: ColaboradorNoForm[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
  };

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      // Sem acesso, o CPF não vai: o que está no banco fica como está.
      const r = await salvarColaborador(id, podeValores ? v : { ...v, cpf: undefined });
      if (!r.ok) return setErro(r.message);
      if (id === null) router.push("/admin/pessoal/colaboradores");
      else mostrar("Salvo");
    });
  }

  const porMes = v.tipo !== "FREELANCER";
  // Sem campo de dinheiro (salário escondido de quem não configura), o cartão é só de datas.
  const temValor = !porMes || podeValores;
  const rotulo = "mb-1 block text-sm font-medium";

  return (
    <form onSubmit={salvar} className="space-y-4">
      {/* O tipo primeiro: ele decide o resto do formulário. */}
      <CartaoDeSecao icone={IdCard} titulo="Contrato" frase="O tipo decide os campos do resto do cadastro.">
        <EscolhaDeContrato valor={v.tipo} onChange={(t) => muda("tipo", t)} legenda="Tipo" />
      </CartaoDeSecao>

      {/* Ativo ou desligado: só para quem já existe. Desligado sai da escala,
          das listas de escolha e da projeção do CMO; o histórico fica. */}
      {id !== null && (
        <Bloco icone={Power} titulo="Situação" frase="Desligado sai da escala e das listas; o histórico fica.">
          <div role="group" aria-label="Situação" className="col-span-2 grid grid-cols-2 gap-2">
            {(
              [
                [true, "Ativo"],
                [false, "Desligado"],
              ] as const
            ).map(([ativo, texto]) => (
              <button
                key={texto}
                type="button"
                aria-pressed={v.ativo === ativo}
                onClick={() => {
                  muda("ativo", ativo);
                  // Ao desligar, a data começa em hoje; dá para trocar.
                  if (!ativo && !v.desligadoEm) muda("desligadoEm", new Date().toLocaleDateString("sv-SE"));
                }}
                className={`h-11 rounded-xl border text-sm font-semibold ${
                  v.ativo === ativo
                    ? ativo
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--destructive)] bg-[var(--danger-soft)] text-[var(--destructive)]"
                    : "border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          {!v.ativo && (
            <>
              <label className="block">
                <span className={rotulo}>Desligado em</span>
                <Input type="date" value={v.desligadoEm} onChange={(e) => muda("desligadoEm", e.target.value)} />
              </label>
              <label className="block">
                <span className={rotulo}>Como saiu</span>
                <select value={v.motivoDesligamento ?? ""} onChange={(e) => muda("motivoDesligamento", e.target.value as ColaboradorNoForm["motivoDesligamento"])} className="field w-full">
                  <option value="">Não informado</option>
                  {(Object.keys(MOTIVO_DESLIGAMENTO) as (keyof typeof MOTIVO_DESLIGAMENTO)[]).map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_DESLIGAMENTO[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={rotulo}>Por quê</span>
                <select value={v.razaoDesligamento ?? ""} onChange={(e) => muda("razaoDesligamento", e.target.value)} className="field w-full">
                  <option value="">Não informado</option>
                  {RAZOES_DO_DESLIGAMENTO.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className={rotulo}>Detalhe</span>
                <Input value={v.detalheDesligamento ?? ""} onChange={(e) => muda("detalheDesligamento", e.target.value)} maxLength={300} placeholder="O que ele disse na saída" />
                <span className="hint">O motivo entra na rotatividade, em Relatórios.</span>
              </label>
            </>
          )}
        </Bloco>
      )}

      <Bloco icone={CalendarDays} titulo="Na escala" frase="Como aparece e em que dias trabalha.">
        <label className="col-span-2">
          <span className={rotulo}>Nome</span>
          <Input value={v.nome} onChange={(e) => muda("nome", e.target.value)} required maxLength={80} />
        </label>
        <label>
          <span className={rotulo}>Apelido</span>
          <Input value={v.apelido} onChange={(e) => muda("apelido", e.target.value)} maxLength={40} />
          <span className="hint">Aparece na escala.</span>
        </label>
        <label>
          <span className={rotulo}>Telefone</span>
          <Input value={v.telefone} onChange={(e) => muda("telefone", e.target.value)} inputMode="tel" placeholder="(51) 99999-9999" />
        </label>
        <label>
          <span className={rotulo}>Equipe</span>
          <select value={v.area} onChange={(e) => muda("area", e.target.value as ColaboradorNoForm["area"])} className="field w-full">
            <option value="">Cozinha e salão</option>
            <option value="COZINHA">Cozinha</option>
            <option value="SALAO">Salão</option>
          </select>
        </label>
        <label>
          <span className={rotulo}>Função</span>
          <select value={v.funcaoId} onChange={(e) => muda("funcaoId", e.target.value)} className="field w-full">
            <option value="">Sem função</option>
            {funcoes.map((f) => (
              <option key={f.id} value={String(f.id)}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <DiasDeTrabalho dias={v.diasDeTrabalho ?? []} onChange={(dias) => muda("diasDeTrabalho", dias)} />
      </Bloco>

      <Bloco
        icone={temValor ? Wallet : CalendarClock}
        titulo={temValor ? "Datas e pagamento" : "Datas"}
        frase={temValor ? "Datas do contrato e quanto ganha." : "Quando começou e os prazos do contrato."}
      >
        <label>
          <span className={rotulo}>Começou na casa</span>
          <Input type="date" value={v.comecouEm} onChange={(e) => muda("comecouEm", e.target.value)} />
          {v.tipo === "FIXO" && <span className="hint">As férias contam desta data.</span>}
        </label>
        {v.tipo === "CLT" && (
          <label>
            <span className={rotulo}>Carteira assinada</span>
            <Input type="date" value={v.admissao} onChange={(e) => muda("admissao", e.target.value)} />
            <span className="hint">As férias contam desta data.</span>
          </label>
        )}
        {v.tipo === "CLT" && (
          // A linha inteira: o rótulo e a dica são longos; a data fica na metade.
          <div className="col-span-2">
            <label className="flex h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.aprendiz ?? false}
                onChange={(e) => muda("aprendiz", e.target.checked)}
                className="size-5 accent-[var(--primary)]"
              />
              Jovem aprendiz
            </label>
            {v.aprendiz && (
              <label className="mt-1 block">
                <span className={rotulo}>Fim do contrato de aprendizagem</span>
                <span className="grid grid-cols-2 gap-3">
                  <Input type="date" value={v.contratoAte ?? ""} onChange={(e) => muda("contratoAte", e.target.value)} />
                </span>
                <span className="hint">Até 2 anos. Avisa em Pendências 30 dias antes. O FGTS dele (2%) se ajusta nos valores da pessoa.</span>
              </label>
            )}
          </div>
        )}
        {v.tipo === "CLT" && (
          // A data na metade e, ao lado, os atalhos de 45 e 90 dias.
          <div className="col-span-2">
            <label htmlFor="experiencia-ate" className={rotulo}>
              Fim da experiência
            </label>
            <div className="grid grid-cols-2 items-center gap-3">
              <Input id="experiencia-ate" type="date" value={v.experienciaAte ?? ""} onChange={(e) => muda("experienciaAte", e.target.value)} />
              {v.admissao && (
                <div className="flex gap-1.5">
                  {[45, 90].map((dias) => (
                    <button
                      key={dias}
                      type="button"
                      className="chip px-2.5 py-1 text-xs"
                      onClick={() => muda("experienciaAte", somarDiasNaData(v.admissao!, dias - 1))}
                    >
                      {dias} dias
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="hint">Avisa em Pendências 10 dias antes, para efetivar, prorrogar ou encerrar.</span>
          </div>
        )}
        {porMes ? (
          podeValores && (
            <label>
              <span className={rotulo}>Salário por mês</span>
              <Input value={v.salario} onChange={(e) => muda("salario", e.target.value)} inputMode="decimal" placeholder="R$ 0,00" />
            </label>
          )
        ) : (
          <>
            <label>
              <span className={rotulo}>Diária de sempre</span>
              <Input value={v.diaria} onChange={(e) => muda("diaria", e.target.value)} inputMode="decimal" placeholder="R$ 0,00" />
            </label>
            <DiariasPorDia
              valores={v.diariasPorDia ?? COLABORADOR_VAZIO.diariasPorDia!}
              deSempre={v.diaria}
              onChange={(valores) => muda("diariasPorDia", valores)}
            />
          </>
        )}
      </Bloco>

      <Bloco icone={Stethoscope} titulo="Saúde ocupacional" frase="O ASO e o prazo do próximo exame.">
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.manipulaAlimentos ?? false}
            onChange={(e) => muda("manipulaAlimentos", e.target.checked)}
            className="size-5 accent-[var(--primary)]"
          />
          Manipula alimentos
        </label>
        <label>
          <span className={rotulo}>Último ASO</span>
          <Input type="date" value={v.asoFeitoEm ?? ""} onChange={(e) => muda("asoFeitoEm", e.target.value)} />
        </label>
        <label>
          <span className={rotulo}>ASO vale até</span>
          <Input type="date" value={v.asoValidoAte ?? ""} onChange={(e) => muda("asoValidoAte", e.target.value)} />
        </label>
        <span className="hint col-span-2 mt-0">O prazo do próximo exame vem do PCMSO, o programa de saúde do médico do trabalho. Avisa em Pendências 30 dias antes.</span>
      </Bloco>

      <Bloco icone={UserRound} titulo="Dados pessoais" frase="Documento, endereço e contato de emergência.">
        {podeValores && (
          <label>
            <span className={rotulo}>CPF</span>
            <Input value={v.cpf ?? ""} onChange={(e) => muda("cpf", mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
          </label>
        )}
        <label>
          <span className={rotulo}>Nascimento</span>
          <Input type="date" value={v.nascimento} onChange={(e) => muda("nascimento", e.target.value)} />
        </label>
        <label className="col-span-2">
          <span className={rotulo}>Endereço</span>
          <Input value={v.endereco} onChange={(e) => muda("endereco", e.target.value)} maxLength={200} />
        </label>
        {/* Um rótulo só para o nome e o telefone: dois rótulos longos, cada um
            na metade da linha, quebravam em alturas diferentes no celular. */}
        <fieldset className="col-span-2">
          <legend className={rotulo}>Contato de emergência</legend>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={v.emergenciaNome}
              onChange={(e) => muda("emergenciaNome", e.target.value)}
              maxLength={80}
              placeholder="Nome"
              aria-label="Nome do contato de emergência"
            />
            <Input
              value={v.emergenciaTelefone}
              onChange={(e) => muda("emergenciaTelefone", maskPhoneBR(e.target.value))}
              inputMode="tel"
              placeholder="(51) 99999-9999"
              aria-label="Telefone de emergência"
            />
          </div>
        </fieldset>
        <label className="col-span-2">
          <span className={rotulo}>Observações</span>
          <Textarea value={v.observacoes} onChange={(e) => muda("observacoes", e.target.value)} maxLength={500} rows={3} />
        </label>
      </Bloco>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" className="h-11 px-6" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Cadastrar" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Um assunto do cadastro num cartão branco, com símbolo, título e frase. Os
 * campos em duas colunas, também no celular: o campo curto fica na metade, e
 * o longo (nome, endereço, dias) pede `col-span-2`.
 */
function Bloco({ icone, titulo, frase, children }: { icone: LucideIcon; titulo: string; frase: string; children: React.ReactNode }) {
  return (
    <CartaoDeSecao icone={icone} titulo={titulo} frase={frase}>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </CartaoDeSecao>
  );
}

/**
 * O free que ganha diferente em algum dia (mais no sábado, mais no domingo).
 * Fechado quando nenhum dia tem valor próprio; dia vazio usa a de sempre.
 */
function DiariasPorDia({
  valores,
  deSempre,
  onChange,
}: {
  valores: string[];
  deSempre: string;
  onChange: (valores: string[]) => void;
}) {
  const algum = valores.some((x) => x.trim() !== "");
  return (
    <details open={algum} className="group/dias col-span-2 rounded-xl border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-[var(--muted-foreground)] transition-transform group-open/dias:rotate-90" />
        Valor diferente em algum dia?
      </summary>
      <div className="border-t border-[var(--border)] p-3">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {DIAS_DA_SEMANA.map(([dia, sigla]) => (
            <label key={dia} className="block">
              <span className="mb-1 block text-xs font-medium">{sigla}</span>
              <Input
                value={valores[dia]}
                onChange={(e) => onChange(valores.map((x, i) => (i === dia ? e.target.value : x)))}
                inputMode="decimal"
                placeholder={deSempre.trim() || "R$"}
                aria-label={`Diária de ${sigla}`}
                className="px-2"
              />
            </label>
          ))}
        </div>
        <p className="hint mt-2">Dia em branco usa a diária de sempre.</p>
      </div>
    </details>
  );
}

/**
 * Os dias em que a pessoa trabalha. A escala usa para separar folga de quem
 * ficou sem posto, pôr quem trabalha no dia primeiro na lista e avisar de
 * quem foi escalado fora dos dias dele. Nenhum marcado: vale qualquer dia.
 */
function DiasDeTrabalho({ dias, onChange }: { dias: number[]; onChange: (dias: number[]) => void }) {
  const alternar = (dia: number) => onChange(dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia]);
  return (
    <fieldset className="col-span-2">
      <legend className="mb-1 block text-sm font-medium">
        Dias que trabalha{" "}
        <span className="font-normal text-[var(--muted-foreground)]">{dias.length === 0 ? "(nenhum marcado: qualquer dia)" : ""}</span>
      </legend>
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_DA_SEMANA.map(([dia, sigla]) => (
          <button
            key={dia}
            type="button"
            aria-pressed={dias.includes(dia)}
            onClick={() => alternar(dia)}
            className={`h-10 rounded-lg border text-sm font-semibold ${
              dias.includes(dia)
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
            }`}
          >
            {sigla}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
