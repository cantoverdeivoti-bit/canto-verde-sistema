import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { CARGA_FORNO, ddmm, JANELA_PRODUCAO } from "@/lib/buffet";
import { cardapioDoDiaCompleto, configuracaoDoBuffet, diaSeguinte, gruposDoBuffet } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA, diaDaSemanaBuffet, prePreparos } from "@/lib/buffet-regras";
import { plural } from "@/lib/format";

import { BotaoImprimir } from "../botao-imprimir";
import { dataDaTela } from "../data-da-tela";
import { EscolherData } from "../escolher-data";
import { SoNaImpressao } from "../so-na-impressao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pré-preparos · Cardápio buffet" };

const nomeDoDia = (data: string) => `${DIAS_DA_SEMANA[diaDaSemanaBuffet(data) - 1].toLowerCase()}, ${ddmm(data)}`;
const diaAnterior = (data: string) => new Date(new Date(`${data}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

/**
 * O que adiantar para o almoço de um dia: os pratos do cardápio da data (com
 * as trocas) que têm etapa na véspera, à tarde ou à noite, ou que o cadastro
 * manda adiantar ("o que se adianta na véspera", defumação). Abre no almoço
 * de amanhã, que é o que se prepara hoje. A tela é a folha: imprime numa A4
 * com o quadrado para marcar e o espaço de quem fez.
 */
export default async function PrePreparosPage({ searchParams }: PageProps<"/admin/buffet/pre-preparos">) {
  const q = await searchParams;
  const { data: escolhida, hoje } = dataDaTela(q.data);
  const data = q.data ? escolhida : diaSeguinte(hoje);
  const [dia, grupos, config] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), configuracaoDoBuffet()]);
  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.nome]));
  const pratos = (dia?.itens ?? []).flatMap((i) => (i.prato ? [{ ...i.prato, grupo: nomeDoGrupo.get(i.grupoId) ?? "" }] : []));
  const lista = prePreparos(pratos);
  const total = lista.reduce((s, g) => s + g.pratos.length, 0);

  return (
    <Pagina largura="media">
      <div className="nao-imprimir space-y-3">
        <CabecalhoDaPagina titulo="Pré-preparos" />
        <div className="flex flex-wrap items-center gap-2">
          <EscolherData data={data} hoje={hoje} base="/admin/buffet/pre-preparos" />
          {total > 0 && (
            <span className="sm:ml-auto">
              <BotaoImprimir />
            </span>
          )}
        </div>
      </div>

      <SoNaImpressao>
        <div className="space-y-3 text-[var(--foreground)] print:text-black">
          <div className="border-b border-[var(--border)] pb-2 print:border-black">
            <p className="text-base font-bold">Pré-preparos para o almoço de {nomeDoDia(data)}</p>
            <p className="text-xs text-[var(--muted-foreground)] print:text-black">
              Fazer na véspera, {nomeDoDia(diaAnterior(data))}, a partir das {config.inicioVespera}.
              {dia?.tema && ` Tema do dia: ${dia.tema}.`} {total > 0 && plural(total, "prato", "pratos")}
            </p>
          </div>

          {!dia ? (
            <p className="msg-warn">
              Nenhum cardápio vale neste dia. <Link href="/admin/buffet/cardapio" className="underline">Ver o cardápio</Link>.
            </p>
          ) : total === 0 ? (
            <Vazio>
              Nenhum prato deste dia tem pré-preparo. Para incluir, preencha em Pratos a janela de véspera ou &quot;o que se adianta na véspera&quot;.
            </Vazio>
          ) : (
            lista.map((g) => (
              <section key={g.janela ?? "outros"} style={{ breakInside: "avoid" }}>
                <h2 className="mb-1 text-sm font-semibold">
                  {g.janela ? JANELA_PRODUCAO[g.janela].nome : "Outros pré-preparos"}
                  <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)] print:text-black">
                    · {g.janela ? JANELA_PRODUCAO[g.janela].dica : "o que o cadastro do prato manda adiantar"}
                  </span>
                </h2>
                <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)] print:rounded-none print:border-black">
                  {g.pratos.map((p) => {
                    const forno = [p.carga && CARGA_FORNO[p.carga].nome, p.temperatura, p.umidade && `umidade ${p.umidade}`, p.tempo, p.sonda && `sonda ${p.sonda}`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={p.id} className="flex items-start gap-2.5 px-3 py-1.5 text-sm print:py-1 print:text-[11px]">
                        <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded border-2 border-[var(--muted-foreground)] print:border-black" />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{p.nome}</span>
                          <span className="text-xs text-[var(--muted-foreground)] print:text-black"> · {p.grupo}</span>
                          {(p.processoD1 || p.defumar) && (
                            <span className="block">
                              {[p.defumar && "Defumar", p.processoD1].filter(Boolean).join(" · ")}
                            </span>
                          )}
                          {forno && <span className="block text-xs text-[var(--muted-foreground)] print:text-black">{forno}</span>}
                        </span>
                        <span className="hidden shrink-0 self-end pb-0.5 text-[10px] print:block">feito por ________</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </SoNaImpressao>
    </Pagina>
  );
}
