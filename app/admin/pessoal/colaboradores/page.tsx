import { ArrowDownAZ, ArrowUpZA, MessageCircle, Phone, Plus, Search } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString } from "@/lib/availability";
import { linksAbertos } from "@/lib/convites-colaborador";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";
import { linkDoWhatsAppDoColaborador } from "@/lib/pessoal";
import { TIPO } from "@/lib/tipos-de-contrato";

import { LinkDeCadastro } from "./link-de-cadastro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Colaboradores · Departamento pessoal" };

const FILTROS = [
  { chave: "", texto: "Ativos" },
  { chave: "clt", texto: "CLT" },
  { chave: "fixo", texto: "Fixo" },
  { chave: "free", texto: "Free" },
  { chave: "desligados", texto: "Desligados" },
] as const;

/**
 * Quem trabalha na casa: CLT e free lancer, ativos primeiro. Desligar não
 * apaga: a pessoa some da escala e das listas de escolha, e o que ela já fez
 * na escala continua lá.
 */
export default async function ColaboradoresPage({ searchParams }: PageProps<"/admin/pessoal/colaboradores">) {
  await guardModule("pessoal");
  const q = await searchParams;
  const busca = typeof q.q === "string" ? q.q.trim() : "";
  const filtro = typeof q.filtro === "string" ? q.filtro : "";
  const deZaA = q.ordem === "za";

  // Os pendentes moram em Pendências até alguém aprovar.
  const [todos, abertos] = await Promise.all([
    prisma.colaborador.findMany({
      where: { pendente: false },
      select: { id: true, nome: true, apelido: true, telefone: true, tipo: true, funcao: { select: { nome: true } }, ativo: true, desligadoEm: true },
    }),
    linksAbertos(),
  ]);

  const chave = busca.toLocaleLowerCase("pt-BR");
  const lista = todos
    .filter((c) =>
      filtro === "desligados"
        ? !c.ativo
        : c.ativo &&
          (filtro === "clt" ? c.tipo === "CLT" : filtro === "fixo" ? c.tipo === "FIXO" : filtro === "free" ? c.tipo === "FREELANCER" : true),
    )
    .filter((c) => !chave || `${c.nome} ${c.apelido ?? ""} ${c.funcao?.nome ?? ""}`.toLocaleLowerCase("pt-BR").includes(chave))
    // Pelo nome que aparece na linha (o apelido, quando tem), sem diferença
    // entre maiúscula e minúscula: "dalila" fica junto de "Daniele".
    .sort((a, b) => (deZaA ? -1 : 1) * (a.apelido ?? a.nome).localeCompare(b.apelido ?? b.nome, "pt-BR", { sensitivity: "base" }));

  const ativos = todos.filter((c) => c.ativo);
  const endereco = (ordem: "az" | "za") => {
    const p = new URLSearchParams();
    if (filtro) p.set("filtro", filtro);
    if (busca) p.set("q", busca);
    if (ordem === "za") p.set("ordem", "za");
    const s = p.toString();
    return `/admin/pessoal/colaboradores${s ? `?${s}` : ""}`;
  };

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Colaboradores"
        subtitulo={
          <>
            {plural(ativos.filter((c) => c.tipo === "CLT").length, "CLT", "CLT")} ·{" "}
            {plural(ativos.filter((c) => c.tipo === "FIXO").length, "fixo", "fixos")} ·{" "}
            {plural(ativos.filter((c) => c.tipo === "FREELANCER").length, "free lancer", "free lancers")} ativos
          </>
        }
        acoes={
          <>
            <LinkDeCadastro abertos={abertos} />
            <Button asChild className="h-10">
              <Link href="/admin/pessoal/colaboradores/novo">
                <Plus aria-hidden className="size-4" />
                Novo
              </Link>
            </Button>
          </>
        }
      />

      <form method="get" className="space-y-2">
        {deZaA && <input type="hidden" name="ordem" value="za" />}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input name="q" type="search" defaultValue={busca} placeholder="Nome ou função" className="w-full pl-9" aria-label="Buscar colaborador" />
          </div>
          <Button type="submit" variant="outline" className="h-11 shrink-0">
            Buscar
          </Button>
        </div>
        <div className="flex gap-2">
          <SelectQueEnvia name="filtro" rotulo="Filtrar colaboradores" atual={filtro} opcoes={FILTROS.map((f) => ({ valor: f.chave, texto: f.texto }))} className="field h-11 min-w-0 flex-1 py-0" />
          <Button asChild variant="outline" className="h-11 shrink-0 gap-1.5">
            <Link href={endereco(deZaA ? "az" : "za")} aria-label={deZaA ? "Ordem de Z a A; tocar para A a Z" : "Ordem de A a Z; tocar para Z a A"}>
              {deZaA ? <ArrowUpZA aria-hidden className="size-4" /> : <ArrowDownAZ aria-hidden className="size-4" />}
              {deZaA ? "Z-A" : "A-Z"}
            </Link>
          </Button>
        </div>
      </form>

      {lista.length === 0 ? (
        <Vazio>
          {todos.length === 0
            ? "Ninguém cadastrado ainda. Comece pelo botão Novo."
            : busca
              ? `Ninguém com "${busca}" aqui.`
              : "Ninguém neste filtro."}
        </Vazio>
      ) : (
        <Lista>
          {lista.map((c) => {
            const wa = linkDoWhatsAppDoColaborador(c.telefone);
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-1.5">
                <Link href={`/admin/pessoal/colaboradores/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{c.apelido ?? c.nome}</span>
                      <span className="selo shrink-0" style={TIPO[c.tipo].selo}>
                        {TIPO[c.tipo].curto}
                      </span>
                    </span>
                    {!c.ativo && c.desligadoEm && (
                      <span className="block text-xs" style={{ color: "var(--destructive)" }}>
                        desligado em {dateOnlyToString(c.desligadoEm).split("-").reverse().join("/")}
                      </span>
                    )}
                  </span>
                </Link>
                {c.telefone && (
                  <div className="flex shrink-0 gap-1">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir conversa com ${c.nome} no WhatsApp (nova aba)`}
                        title="WhatsApp"
                        className="flex size-9 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-strong)] hover:opacity-80"
                      >
                        <MessageCircle aria-hidden className="size-5" />
                      </a>
                    )}
                    <a
                      href={`tel:${c.telefone}`}
                      aria-label={`Ligar para ${c.nome}`}
                      title="Ligar"
                      className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
                    >
                      <Phone aria-hidden className="size-[18px]" />
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </Lista>
      )}
    </Pagina>
  );
}
