import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { CARGA_FORNO, ddmm, JANELA_PRODUCAO } from "@/lib/buffet";
import { cardapioDoDiaCompleto, configuracaoDoBuffet, diaSeguinte, type DiaDoBuffet, type PratoDaProducao } from "@/lib/buffet-dados";
import { cargaDaJanela, DIAS_DA_SEMANA, diaDaSemanaBuffet, fluxoDoDia } from "@/lib/buffet-regras";
import { plural } from "@/lib/format";

import { dataDaTela } from "../data-da-tela";
import { EscolherData } from "../escolher-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fluxo do forno · Cardápio buffet" };

type PratoNoFluxo = PratoDaProducao & { vezes: number };

/** Os pratos do dia, um por prato: o mesmo prato em duas cubas sai do forno uma vez, com "×2". */
function pratosDoDia(dia: DiaDoBuffet | null): PratoNoFluxo[] {
  const porId = new Map<number, PratoNoFluxo>();
  for (const i of dia?.itens ?? []) {
    if (!i.prato) continue;
    const ja = porId.get(i.prato.id);
    if (ja) ja.vezes++;
    else porId.set(i.prato.id, { ...i.prato, vezes: 1 });
  }
  return [...porId.values()];
}

const nomeDoDia = (data: string) => `${DIAS_DA_SEMANA[diaDaSemanaBuffet(data) - 1].toLowerCase()}, ${ddmm(data)}`;

/**
 * O dia no forno combinado, como a aba 4. FLUXO: o almoço de hoje pelas
 * janelas J1 a J5 e o que se adianta hoje (D-1) para o almoço de amanhã.
 * Dentro da janela, as cargas na ordem do forno, com os parâmetros de cada
 * prato.
 */
export default async function FluxoDoFornoPage({ searchParams }: PageProps<"/admin/buffet/forno">) {
  const { data, hoje } = dataDaTela((await searchParams).data);
  const amanha = diaSeguinte(data);
  const [dia, diaDeAmanha, config] = await Promise.all([cardapioDoDiaCompleto(data), cardapioDoDiaCompleto(amanha), configuracaoDoBuffet()]);
  const fluxo = fluxoDoDia(pratosDoDia(dia), pratosDoDia(diaDeAmanha));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Fluxo do forno" />
      <EscolherData data={data} hoje={hoje} base="/admin/buffet/forno" />

      <dl className="card grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-sm sm:grid-cols-4">
        {[
          ["Turno", `${config.inicioTurno} às ${config.fimTurno}`],
          ["Buffet aberto", `${config.aberturaBuffet} às ${config.encerramentoBuffet}`],
          ["Véspera (D-1)", `a partir das ${config.inicioVespera}`],
          ["Forno", `${plural(config.fornos, "combinado", "combinados")} × ${config.gnPorForno} GN`],
          ["Cozinheiros", String(config.cozinheiros)],
          ["Defumação", `ciclo de ${config.cicloDefumacaoHoras} h`],
          ["Limpeza", `${config.cicloLimpezaMin} min`],
        ].map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-[11px] text-[var(--muted-foreground)]">{rotulo}</dt>
            <dd className="font-medium">{valor}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Almoço de {nomeDoDia(data)}</h2>
        {dia ? (
          <Janelas janelas={fluxo.hoje} fornos={config.fornos} gnPorForno={config.gnPorForno} />
        ) : (
          <p className="msg-warn">Nenhum cardápio vale neste dia.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Adiantar hoje para {nomeDoDia(amanha)}</h2>
        {!diaDeAmanha ? (
          <p className="msg-warn">Nenhum cardápio vale amanhã.</p>
        ) : fluxo.paraAmanha.length === 0 ? (
          <Vazio>O cardápio de amanhã não tem nada para adiantar na véspera.</Vazio>
        ) : (
          <Janelas janelas={fluxo.paraAmanha} fornos={config.fornos} gnPorForno={config.gnPorForno} />
        )}
      </section>
    </Pagina>
  );
}

function Janelas({
  janelas,
  fornos,
  gnPorForno,
}: {
  janelas: ReturnType<typeof fluxoDoDia<PratoNoFluxo>>["hoje"];
  fornos: number;
  gnPorForno: number;
}) {
  return (
    <div className="space-y-3">
      {janelas.map(({ janela, cargas }) => {
        const todos = cargas.flatMap((c) => c.pratos);
        if (janela === null)
          return (
            <div key="sem" className="card p-3 text-sm">
              <p className="font-semibold">Sem fluxo definido</p>
              <p className="text-[var(--muted-foreground)]">
                {todos.map((p) => p.nome).join(", ")}.{" "}
                <Link href="/admin/buffet/pratos" className="underline">
                  Complete em Pratos
                </Link>{" "}
                (janela, carga e posto).
              </p>
            </div>
          );
        const info = JANELA_PRODUCAO[janela as keyof typeof JANELA_PRODUCAO];
        const carga = cargaDaJanela(todos, fornos, gnPorForno);
        return (
          <div key={janela} className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-3 py-2">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{info.nome}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {plural(carga.noForno, "prato", "pratos")} no forno · cabem {carga.capacidade} GN
                </span>
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">{info.dica}</p>
              {carga.passa && (
                <p className="msg-warn mt-2 text-xs">
                  Esta janela tem mais pratos no forno que GN disponíveis (contando 1 GN por prato). Divida em cargas ou passe algum para outra
                  janela.
                </p>
              )}
            </div>
            {cargas.map(({ carga: c, pratos }) => {
              const dados = c ? CARGA_FORNO[c as keyof typeof CARGA_FORNO] : null;
              return (
                <div key={c ?? "sem"} className="border-b border-[var(--border)] last:border-b-0">
                  <p className="bg-[var(--muted)] px-3 py-1 text-xs font-semibold">
                    {dados ? `${dados.nome} · ${dados.temperatura} · umidade ${dados.umidade}` : "Carga não definida"}
                  </p>
                  <ul className="divide-y divide-[var(--border)]">
                    {pratos.map((p) => (
                      <li key={p.id} className="px-3 py-2 text-sm">
                        <p className="font-medium">
                          {p.nome}
                          {p.vezes > 1 && <span className="text-[var(--muted-foreground)]"> ×{p.vezes}</span>}
                          {p.defumar && (
                            <span className="selo ml-2" style={{ color: "var(--warn)" }}>
                              defumar
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {[p.modo, p.temperatura, p.umidade && `umidade ${p.umidade}`, p.tempo, p.sonda && `sonda ${p.sonda}`].filter(Boolean).join(" · ") ||
                            "sem parâmetros"}
                        </p>
                        {p.processoD1 && <p className="text-xs">Na véspera: {p.processoD1}</p>}
                        {p.ajuste && <p className="text-xs text-[var(--muted-foreground)]">Ajuste: {p.ajuste}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
