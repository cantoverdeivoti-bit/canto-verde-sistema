"use client";

import {
  Building2,
  MessageCircle,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Power,
  Star,
  StickyNote,
  Tags,
  Truck,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { BotaoQuadrado, CartaoDeBotoes, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSupplier, setSupplierActive, vincularProdutoAoFornecedor } from "@/lib/actions/compras";
import { chave, formatMoney, formatPhone, plural } from "@/lib/format";
import { maskPhoneBR } from "@/lib/phone-mask";

export type SupplierRow = {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  deliveryDays: number | null;
  /** "sexta-feira", "segunda a sexta" — o que ele promete, como ele fala. */
  deliveryWeekdays: string | null;
  paymentTerms: string | null;
  /** Em reais, já como texto: abaixo disso ele não entrega. */
  minOrder: string | null;
  notes: string | null;
  isActive: boolean;
  /** Atacado: a casa vai buscar, sem link de preço. */
  compraNoAtacado: boolean;
  /** O que ele atende. É por aqui que a cotação escolhe a quem perguntar. */
  categoryIds: number[];
  categoryNames: string[];
  /** Montado no servidor: conversa já aberta com quem se pede preço. */
  wa: string | null;
  /** Como a casa chama ele. Nulo = as telas de compra usam a razão social. */
  apelido: string | null;
  /** Produtos ligados a ele à mão (além do que as categorias já trazem). */
  produtoIds: number[];
};

export type ProdutoOpcao = {
  id: number;
  nome: string;
  categoria: string | null;
  /** De quem o produto é exclusivo, se for. */
  exclusivoDe: number | null;
};

export type CategoriaOpcao = { id: number; name: string };

type Draft = {
  name: string;
  apelido: string;
  contactName: string;
  phone: string;
  deliveryDays: string;
  deliveryWeekdays: string;
  paymentTerms: string;
  minOrder: string;
  notes: string;
};

const VAZIO: Draft = {
  name: "",
  apelido: "",
  contactName: "",
  phone: "",
  deliveryDays: "",
  deliveryWeekdays: "",
  paymentTerms: "",
  minOrder: "",
  notes: "",
};

/**
 * Cadastro de fornecedor. Edição no lugar, como no cadastro de produto.
 *
 * Desativa em vez de apagar: a cotação de ontem precisa saber de quem era
 * aquele preço.
 */
export function SuppliersList({
  items,
  categorias,
  produtos,
  convite,
}: {
  items: SupplierRow[];
  categorias: CategoriaOpcao[];
  produtos: ProdutoOpcao[];
  /** O botão de cadastro por link, para os dois caminhos ficarem lado a lado. */
  convite?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<number | "novo" | null>(null);
  const [draft, setDraft] = useState<Draft>(VAZIO);
  // Fora do Draft de propósito: ele é todo de texto, porque campo é texto, e
  // uma lista de números no meio obrigaria o ajudante `campo` a atender dois
  // tipos para servir um caso.
  const [cats, setCats] = useState<number[]>([]);
  const [atacado, setAtacado] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Vindo da lupa do topo (`?q=`), abre já buscando o fornecedor, inativo ou não.
  const qDaLupa = useSearchParams().get("q") ?? "";
  const [showInactive, setShowInactive] = useState(qDaLupa !== "");
  const [busca, setBusca] = useState(qDaLupa);
  const [qAnterior, setQAnterior] = useState(qDaLupa);
  if (qDaLupa !== qAnterior) {
    setQAnterior(qDaLupa);
    if (qDaLupa) {
      setBusca(qDaLupa);
      setShowInactive(true);
    }
  }
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  // "Vincular produto": o fornecedor com o painel aberto, a busca dele, e os
  // vínculos já mexidos nesta visita (a tela muda na hora, o banco logo atrás).
  const [vinculando, setVinculando] = useState<number | null>(null);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [vinculos, setVinculos] = useState<Record<number, number[]>>({});
  const [erroVinculo, setErroVinculo] = useState<string | null>(null);

  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  function vinculadosDe(s: SupplierRow) {
    return vinculos[s.id] ?? s.produtoIds;
  }

  function alternarVinculo(s: SupplierRow, produtoId: number, vincular: boolean) {
    const antes = vinculadosDe(s);
    const depois = vincular ? [...antes, produtoId] : antes.filter((id) => id !== produtoId);
    setErroVinculo(null);
    setVinculos((v) => ({ ...v, [s.id]: depois }));
    if (vincular) setBuscaProduto("");
    startTransition(async () => {
      const r = await vincularProdutoAoFornecedor(s.id, produtoId, vincular);
      if (!r.ok) {
        setErroVinculo(r.message ?? "Falhou.");
        setVinculos((v) => ({ ...v, [s.id]: antes }));
      }
    });
  }

  /**
   * Um texto por fornecedor, já sem acento, para procurar dentro.
   *
   * O telefone entra duas vezes, cru e formatado. Quem
   * procura por telefone digita o pedaço que lembra — "99515" do jeito que
   * aparece na tela, ou "5199515" seguido, do jeito que está no banco — e as
   * duas formas têm que achar o mesmo fornecedor.
   */
  const indiceDeBusca = useMemo(
    () =>
      new Map(
        items.map((s) => [
          s.id,
          chave(
            [
              s.name,
              s.apelido ?? "",
              s.contactName ?? "",
              s.phone ?? "",
              s.phone ? formatPhone(s.phone) : "",
              s.categoryNames.join(" "),
            ].join(" "),
          ),
        ]),
      ),
    [items],
  );

  const termo = chave(busca);
  const naLista = showInactive ? items : items.filter((s) => s.isActive);
  const visible = naLista.filter(
    (s) =>
      (termo === "" || indiceDeBusca.get(s.id)?.includes(termo)) &&
      (filtroCategoria === "todas" ||
        (filtroCategoria === "sem"
          ? s.categoryIds.length === 0
          : s.categoryIds.includes(Number(filtroCategoria)))),
  );
  const inactiveCount = items.length - items.filter((s) => s.isActive).length;
  const filtrando = termo !== "" || filtroCategoria !== "todas";

  function abrirNovo() {
    setDraft(VAZIO);
    setCats([]);
    setAtacado(false);
    setEditing("novo");
    setError(null);
  }

  function abrirEdicao(s: SupplierRow) {
    setDraft({
      name: s.name,
      apelido: s.apelido ?? "",
      contactName: s.contactName ?? "",
      // Guardado em E.164, mostrado como se digita.
      phone: s.phone ? formatPhone(s.phone) : "",
      deliveryDays: s.deliveryDays === null ? "" : String(s.deliveryDays),
      deliveryWeekdays: s.deliveryWeekdays ?? "",
      paymentTerms: s.paymentTerms ?? "",
      minOrder: s.minOrder ?? "",
      notes: s.notes ?? "",
    });
    setCats(s.categoryIds);
    setAtacado(s.compraNoAtacado);
    setEditing(s.id);
    setError(null);
  }

  function alternarCategoria(id: number) {
    setCats((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const id = editing === "novo" ? null : (editing as number);
    startTransition(async () => {
      const result = await saveSupplier(id, {
        ...draft,
        isActive: true,
        compraNoAtacado: atacado,
        categoryIds: cats,
      });
      if (result.ok) setEditing(null);
      else setError(result.message ?? "Falhou.");
    });
  }

  function limparFiltros() {
    setBusca("");
    setFiltroCategoria("todas");
  }

  /** Um campo de texto do formulário, rótulo em cima, largura da grade. */
  function campo(
    label: string,
    key: keyof Draft,
    props: React.ComponentProps<typeof Input> = {},
    classeDaCelula = "",
  ) {
    return (
      <label className={`block text-xs ${classeDaCelula}`}>
        <span className="mb-1 block font-medium">{label}</span>
        <Input
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          {...props}
          className={`h-9 w-full bg-[var(--background)] px-2.5 ${props.className ?? ""}`}
        />
      </label>
    );
  }

  /** Um bloco do formulário: cartão branco com símbolo e título, os campos numa grade. */
  function bloco(icone: LucideIcon, titulo: string, conteudo: React.ReactNode, frase?: string) {
    return (
      <CartaoDeSecao icone={icone} titulo={titulo} frase={frase}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{conteudo}</div>
      </CartaoDeSecao>
    );
  }

  const form = (
    // Novo: acima da lista. Editando: ocupa a linha dele dentro da lista. Nos
    // dois casos, um cartão branco por assunto, como as outras telas.
    <form onSubmit={salvar} className={editing === "novo" ? "mt-4 space-y-3" : "space-y-3 p-3"}>
      <p className="text-base font-semibold">
        {editing === "novo" ? "Novo fornecedor" : `Editar ${draft.apelido || draft.name}`}
      </p>

      {bloco(
        Building2,
        "Identificação",
        <>
          {campo("Razão social", "name", { autoFocus: true, required: true }, "sm:col-span-2")}
          {/* Como a casa chama ele: é o que as colunas estreitas da cotação
              mostram no lugar da razão social. */}
          {campo("Apelido", "apelido", { placeholder: "como a casa chama" })}
          {/* Atacado: ninguém do outro lado digita preço. Os exclusivos dele
              viram lista de compra com o valor estimado pela última compra. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] p-3 sm:col-span-2 lg:col-span-4">
            <input
              type="checkbox"
              checked={atacado}
              onChange={(e) => setAtacado(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span className="text-sm">
              <span className="font-semibold">Compra no atacado</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                A casa vai buscar. Sem link de preço: a lista sai com o valor estimado pela última compra.
              </span>
            </span>
          </label>
        </>,
      )}

      {bloco(
        Phone,
        "Contato",
        <>
          {campo("Quem atende", "contactName")}
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Telefone (WhatsApp)</span>
            <Input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: maskPhoneBR(e.target.value) }))}
              inputMode="tel"
              placeholder="(51) 99999-9999"
              className="h-9 w-full bg-[var(--background)] px-2.5"
            />
          </label>
        </>,
      )}

      {/* As condições que ele impõe. Texto livre nos dias e no pagamento
          porque o que se negocia raramente cabe numa caixinha: "quarta ou
          sexta", "7,14,21,28", "a combinar". */}
      {bloco(
        Truck,
        "Condições",
        <>
          {campo("Dias de entrega", "deliveryWeekdays", { placeholder: "segunda a sexta" })}
          {campo("Prazo de entrega (dias)", "deliveryDays", { inputMode: "numeric" })}
          {campo("Pedido mínimo (R$)", "minOrder", { inputMode: "decimal" })}
          {campo("Prazo de pagamento", "paymentTerms", { placeholder: "14 dias" })}
        </>,
        "O que ele entrega, quando e como cobra.",
      )}

      {/* Mesmas categorias que o fornecedor vê no formulário do convite. É o
          que a cotação usa para escolher a quem perguntar preço — sem nenhuma
          marcada, ele fica de fora de toda cotação por categoria. */}
      <CartaoDeSecao icone={Tags} titulo="O que ele fornece" frase="A cotação pergunta preço só a quem atende a categoria.">
        {categorias.length === 0 ? (
          <p className="hint m-0">Nenhuma categoria cadastrada ainda. Crie em Categorias.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => alternarCategoria(c.id)}
                aria-pressed={cats.includes(c.id)}
                className="chip px-3 py-1.5 text-sm"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </CartaoDeSecao>

      <CartaoDeSecao icone={StickyNote} titulo="Observações">
        {campo("Observações", "notes")}
      </CartaoDeSecao>

      {error && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-9 border-transparent bg-[var(--botao)] px-6 font-semibold text-[var(--botao-texto)] hover:border-transparent hover:opacity-90"
        >
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={() => setEditing(null)}>
          Cancelar
        </Button>
        <p className="hint m-0 ml-auto">Só a razão social é obrigatória.</p>
      </div>
    </form>
  );

  return (
    <>
      {/* Os dois caminhos de cadastro, lado a lado: um que você digita e um
          que o fornecedor digita. Nenhum dos dois some quando o outro abre —
          botão que desaparece faz a barra pular sob o cursor. */}
      <div className="mt-6">
        <CartaoDeBotoes>
          <BotaoQuadrado
            icone={Plus}
            texto="Novo fornecedor"
            tom="primario"
            ativo={editing === "novo"}
            onClick={() => (editing === "novo" ? setEditing(null) : abrirNovo())}
          />
          {convite}
        </CartaoDeBotoes>
      </div>

      {editing === "novo" && form}

      {/* Busca e filtros numa fileira própria, abaixo das ações. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Input
            type="search"
            aria-label="Buscar fornecedor"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, contato ou telefone"
            // O espaço do "limpar" só é reservado quando ele existe, senão a
            // dica sai cortada.
            className={`h-9 w-full ${busca !== "" ? "pr-16" : ""}`}
          />
          {busca !== "" && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              limpar
            </button>
          )}
        </div>
        <select
          aria-label="Filtrar por categoria"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="field h-9 w-full bg-[var(--surface)] py-0 sm:w-56"
        >
          <option value="todas">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="sem">Sem categoria</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <p className="text-[var(--muted-foreground)]">
          {plural(visible.length, "fornecedor", "fornecedores")}
        </p>
        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="text-[var(--primary)] underline-offset-4 hover:underline"
          >
            {showInactive ? "esconder desativados" : `mostrar ${plural(inactiveCount, "desativado")}`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        filtrando ? (
          // Vazio por busca é outra coisa que vazio por cadastro. Dizer
          // "nenhum fornecedor ainda" aqui faria parecer que a lista sumiu.
          <p className="mt-6 text-sm text-[var(--muted-foreground)]">
            Nenhum fornecedor com esse filtro.{" "}
            {!showInactive && inactiveCount > 0 && (
              <>
                Pode estar entre os{" "}
                <button
                  type="button"
                  onClick={() => setShowInactive(true)}
                  className="text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  {plural(inactiveCount, "desativado")}
                </button>
                .{" "}
              </>
            )}
            <button
              type="button"
              onClick={limparFiltros}
              className="text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Limpar os filtros
            </button>
            .
          </p>
        ) : (
          <p className="mt-6 text-sm text-[var(--muted-foreground)]">
            Nenhum fornecedor ainda. Cadastre de quem você compra — a cotação
            pergunta o preço para todos de uma vez.
          </p>
        )
      ) : (
        <ul className="card mt-3 divide-y divide-[var(--border)] overflow-hidden">
          {visible.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="bg-[var(--background)]">
                {form}
              </li>
            ) : (
              <li
                key={s.id}
                className={`flex flex-wrap items-start gap-x-6 gap-y-3 px-3 py-3 ${
                  s.isActive ? "" : "opacity-55"
                }`}
              >
                {/* Quem é: o nome da casa em destaque, a razão social
                    embaixo, depois como falar com ele e o que atende. */}
                <div className="min-w-0 flex-1 basis-64 space-y-1">
                  <p className="text-[15px] font-semibold leading-snug">
                    {s.apelido ?? s.name}
                    {s.compraNoAtacado && <span className="selo ml-2">atacado</span>}
                    {!s.isActive && (
                      <span className="selo ml-2 text-[var(--muted-foreground)]">desativado</span>
                    )}
                  </p>
                  {s.apelido && <p className="text-xs text-[var(--muted-foreground)]">{s.name}</p>}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[var(--muted-foreground)]">
                    {s.contactName && (
                      <span className="inline-flex items-center gap-1">
                        <User aria-hidden className="size-3.5" />
                        {s.contactName}
                      </span>
                    )}
                    {s.phone && (
                      <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone aria-hidden className="size-3.5" />
                        {formatPhone(s.phone)}
                      </a>
                    )}
                    {!s.contactName && !s.phone && "sem contato cadastrado"}
                  </p>
                  {/* Sem categoria ele existe mas nunca é perguntado. Dizer
                      isso na lista evita o fornecedor cadastrado que fica
                      calado por meses sem ninguém entender por quê. */}
                  {s.categoryNames.length > 0 ? (
                    <ul className="flex flex-wrap gap-1 pt-0.5">
                      {s.categoryNames.map((n) => (
                        <li key={n} className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-xs">
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--warn)]">sem categoria — não entra nas cotações</p>
                  )}
                </div>

                {/* As condições dele, com rótulo, na ordem em que pesam na
                    decisão: quando entrega, quanto exige, quando cobra. */}
                <dl className="grid min-w-0 flex-1 basis-56 grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <dt className="text-[var(--muted-foreground)]">Entrega</dt>
                    <dd className="font-medium">
                      {s.deliveryWeekdays ||
                        (s.deliveryDays !== null ? `em ${plural(s.deliveryDays, "dia")}` : "—")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-foreground)]">Mínimo</dt>
                    <dd className="num-display font-medium">
                      {s.minOrder ? formatMoney(Number(s.minOrder)) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted-foreground)]">Pagamento</dt>
                    <dd className="font-medium">{s.paymentTerms || "—"}</dd>
                  </div>
                </dl>

                {/* As ações dele numa fileira de quadrados, embaixo de tudo. */}
                <div className="basis-full border-t border-[var(--border)] pt-1">
                  <FileiraDeBotoes>
                    {s.wa && (
                      <BotaoQuadrado icone={MessageCircle} texto="WhatsApp" href={s.wa} externo dica={`Conversar com ${s.apelido ?? s.name}`} />
                    )}
                    <BotaoQuadrado
                      icone={PackagePlus}
                      texto="Vincular produto"
                      ativo={vinculando === s.id}
                      onClick={() => {
                        setBuscaProduto("");
                        setErroVinculo(null);
                        setVinculando((v) => (v === s.id ? null : s.id));
                      }}
                    />
                    <BotaoQuadrado icone={Pencil} texto="Editar" desligado={pending} onClick={() => abrirEdicao(s)} />
                    <BotaoQuadrado
                      icone={Power}
                      texto={s.isActive ? "Desativar" : "Reativar"}
                      tom={s.isActive ? "perigo" : "normal"}
                      desligado={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setSupplierActive(s.id, !s.isActive);
                        })
                      }
                    />
                  </FileiraDeBotoes>
                </div>

                {vinculando === s.id && (
                  <PainelDeProdutos
                    fornecedor={s}
                    vinculados={vinculadosDe(s)}
                    produtos={produtos}
                    produtoPorId={produtoPorId}
                    busca={buscaProduto}
                    aoBuscar={setBuscaProduto}
                    aoAlternar={(id, vincular) => alternarVinculo(s, id, vincular)}
                    erro={erroVinculo}
                    pendente={pending}
                  />
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}

/**
 * Os produtos de um fornecedor, e a busca para ligar mais. Os exclusivos dele
 * aparecem com a estrela e não se tiram daqui — o exclusivo se muda no
 * cadastro do produto.
 */
function PainelDeProdutos({
  fornecedor,
  vinculados,
  produtos,
  produtoPorId,
  busca,
  aoBuscar,
  aoAlternar,
  erro,
  pendente,
}: {
  fornecedor: SupplierRow;
  vinculados: number[];
  produtos: ProdutoOpcao[];
  produtoPorId: Map<number, ProdutoOpcao>;
  busca: string;
  aoBuscar: (v: string) => void;
  aoAlternar: (produtoId: number, vincular: boolean) => void;
  erro: string | null;
  pendente: boolean;
}) {
  const nome = fornecedor.apelido ?? fornecedor.name;
  const exclusivos = produtos.filter((p) => p.exclusivoDe === fornecedor.id);
  const ligados = vinculados
    .map((id) => produtoPorId.get(id))
    .filter((p): p is ProdutoOpcao => p !== undefined && p.exclusivoDe !== fornecedor.id);
  const jaTem = new Set([...vinculados, ...exclusivos.map((p) => p.id)]);
  const termo = chave(busca);
  const achados =
    termo.length < 2
      ? []
      : produtos.filter((p) => !jaTem.has(p.id) && chave(p.nome).includes(termo)).slice(0, 8);

  return (
    <div className="w-full space-y-3 rounded-lg bg-[var(--muted)] p-3 text-sm">
      <p className="font-semibold">Produtos de {nome}</p>

      <div className="max-w-md">
        <Input
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const primeiro = achados[0];
            if (primeiro && primeiro.exclusivoDe === null) aoAlternar(primeiro.id, true);
          }}
          placeholder="Buscar produto para vincular"
          aria-label={`Buscar produto para vincular a ${nome}`}
          className="h-9 w-full bg-[var(--background)]"
          autoFocus
        />
        {achados.length > 0 && (
          <ul className="mt-1 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--background)]">
            {achados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pendente || p.exclusivoDe !== null}
                  onClick={() => aoAlternar(p.id, true)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{p.nome}</span>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    {p.exclusivoDe !== null ? "exclusivo de outro fornecedor" : (p.categoria ?? "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {termo.length >= 2 && achados.length === 0 && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Nenhum produto com esse nome para vincular.
          </p>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}

      {exclusivos.length + ligados.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">Nenhum produto vinculado ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {exclusivos.map((p) => (
            <li
              key={p.id}
              title="Exclusivo — muda-se no cadastro do produto"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--warn)] bg-[var(--surface)] px-2.5 py-1 text-[13px]"
            >
              <Star aria-hidden className="size-3.5 fill-[var(--warn)] text-[var(--warn)]" />
              {p.nome}
            </li>
          ))}
          {ligados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pendente}
                onClick={() => aoAlternar(p.id, false)}
                className="chip inline-flex items-center gap-2"
              >
                {p.nome}
                <span aria-hidden className="text-[var(--muted-foreground)]">×</span>
                <span className="sr-only">— desvincular de {nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {fornecedor.categoryNames.length > 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Além destes, ele recebe cotação de tudo que é de{" "}
          {fornecedor.categoryNames.join(", ")}.
        </p>
      )}
    </div>
  );
}
