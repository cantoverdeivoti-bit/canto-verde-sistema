"use client";

import { Check, KeyRound, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { useState, useTransition } from "react";

import { CabecalhoDaPagina, Lista } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createUser,
  resetUserPassword,
  saveUserGrants,
  setUserActive,
  updateUser,
} from "@/lib/actions/usuarios";
import { plural } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";
import { MODULES } from "@/lib/modules";
import {
  ROLES,
  ROLE_LABEL,
  ROLE_PRESETS,
  rolePresetMatches,
  type ModuleGrant,
} from "@/lib/roles";
import type { UserRole } from "@/generated/prisma/client";

export type UserRow = {
  id: number;
  username: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  /** Já formatado no fuso da casa pelo servidor. */
  ultimoAcesso: string | null;
  grants: ModuleGrant[];
  /** Acesso a tudo, sem depender das permissões; não se edita nem desativa. */
  superusuario: boolean;
};

/**
 * Quem entra no painel, e o que cada um alcança.
 *
 * Mesmo padrão do cadastro de fornecedores: edição no lugar, ação de linha
 * como texto, e nada de diálogo do navegador. O que é próprio daqui são as
 * três recusas que a tela precisa espelhar do servidor — desativar a si
 * mesmo, rebaixar o último Dono, e tirar o próprio acesso às Configurações. As
 * ações já recusam; a tela esconde o controle, porque oferecer um botão que
 * sempre falha é pior que não oferecer.
 */
export function UsersList({
  items,
  meuId,
}: {
  items: UserRow[];
  meuId: number | null;
}) {
  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [papel, setPapel] = useState<UserRole>("CAIXA");
  const [nome, setNome] = useState("");
  const [grants, setGrants] = useState<ModuleGrant[]>([]);
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [trocandoSenha, setTrocandoSenha] = useState<number | null>(null);
  const [senhaNova, setSenhaNova] = useState("");
  const [pendenteForm, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Desativar e reativar passam pela ação padrão: aviso embaixo e Desfazer.
  // Desativar agia no primeiro toque, sem volta à vista, e a pessoa era
  // barrada no clique seguinte.
  const ativacao = useAcao();
  const pendente = pendenteForm || ativacao.pendente;

  const donosAtivos = items.filter((u) => u.role === "DONO" && u.isActive).length;

  // Conta nova começa sem permissão nenhuma, e quem cria escolhe uma a uma.
  // Preencher pelo papel escondia a decisão: a pessoa saía da tela sem ter
  // olhado o que acabou de conceder. O botão "usar o padrão" continua ali
  // para quem quer o caminho curto — só que agora é um clique visível.
  function abrirNovo() {
    setPapel("CAIXA");
    setGrants([]);
    setNome("");
    setNovoUsuario("");
    setNovaSenha("");
    setEditando("novo");
    setErro(null);
  }

  function abrirEdicao(u: UserRow) {
    setPapel(u.role);
    setNome(u.name ?? "");
    setNovoUsuario(u.username);
    setGrants(u.grants);
    setTrocandoSenha(null);
    setEditando(u.id);
    setErro(null);
  }

  /**
   * O papel é rótulo, não interruptor.
   *
   * Trocá-lo não mexe nas fichas. Antes arrastava as permissões junto, e o
   * efeito era uma tela que decidia sozinha: bastava mudar o seletor para
   * conceder ou tirar acesso sem ninguém ter pedido. Quem escolhe o que a
   * pessoa alcança é quem está na tela, ficha por ficha.
   */
  function trocarPapel(novo: UserRole) {
    setPapel(novo);
  }

  function temAcesso(slug: string) {
    return grants.some((g) => g.moduleSlug === slug);
  }
  function temConfigura(slug: string) {
    return grants.some((g) => g.moduleSlug === slug && g.canConfigure);
  }

  function alternarAcesso(slug: string) {
    setGrants((atual) =>
      atual.some((g) => g.moduleSlug === slug)
        ? atual.filter((g) => g.moduleSlug !== slug)
        : [...atual, { moduleSlug: slug, canConfigure: false }],
    );
  }

  function alternarConfigura(slug: string) {
    setGrants((atual) =>
      atual.map((g) =>
        g.moduleSlug === slug ? { ...g, canConfigure: !g.canConfigure } : g,
      ),
    );
  }

  // Permissão para um módulo que não existe mais no registro — sobra de um
  // slug renomeado. Não concede nada, porque ninguém consulta esse nome, mas
  // fica no banco confundindo quem for ler. Dizer que existe e que some ao
  // salvar é melhor que apagar em silêncio.
  const orfas = grants.filter((g) => !MODULES.some((m) => m.slug === g.moduleSlug));

  function salvar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    startTransition(async () => {
      if (editando === "novo") {
        const r = await createUser({
          username: novoUsuario,
          name: nome,
          role: papel,
          password: novaSenha,
          grants: grants.filter((g) => MODULES.some((m) => m.slug === g.moduleSlug)),
        });
        if (!r.ok) return setErro(r.message ?? "Falhou.");
        setEditando(null);
        return;
      }

      const id = editando as number;
      // Superusuário muda só o nome: papel e permissões não valem para ele.
      if (editandoSuper) {
        const r = await updateUser(id, { name: nome, username: novoUsuario });
        if (!r.ok) return setErro(r.message ?? "Falhou.");
        setEditando(null);
        return;
      }
      // Duas ações porque são duas decisões: quem a pessoa é, e o que ela
      // alcança. Perfil primeiro — se ele for recusado (rebaixar o último
      // Dono, por exemplo), as permissões nem chegam a ser tocadas.
      const perfil = await updateUser(id, { role: papel, name: nome, username: novoUsuario });
      if (!perfil.ok) return setErro(perfil.message ?? "Falhou.");

      const permissoes = await saveUserGrants(
        id,
        { grants: grants.filter((g) => MODULES.some((m) => m.slug === g.moduleSlug)) },
      );
      if (!permissoes.ok) return setErro(permissoes.message ?? "Falhou.");

      setEditando(null);
    });
  }

  function redefinirSenha(id: number) {
    setErro(null);
    startTransition(async () => {
      const r = await resetUserPassword(id, { password: senhaNova });
      if (!r.ok) return setErro(r.message ?? "Falhou.");
      setTrocandoSenha(null);
      setSenhaNova("");
    });
  }

  function alternarAtivo(u: UserRow) {
    setErro(null);
    const nome = u.name ?? u.username;
    ativacao.rodar(
      () => setUserActive(u.id, !u.isActive),
      undefined,
      u.isActive
        ? { aviso: `${nome}: conta desativada`, desfazer: () => setUserActive(u.id, true) }
        : { aviso: `${nome}: conta reativada` },
    );
  }

  const ehNovo = editando === "novo";
  const editandoSuper = !ehNovo && items.some((u) => u.id === editando && u.superusuario);

  /** Uma ficha de permissão: um quadrado com ✓, alinhado na coluna. */
  const ficha = (ligada: boolean, rotulo: string, aoTocar: () => void, desligada = false) => (
    <button
      type="button"
      aria-pressed={ligada}
      aria-label={rotulo}
      title={rotulo}
      disabled={desligada}
      onClick={aoTocar}
      className={`mx-auto inline-flex size-8 items-center justify-center rounded-md border transition disabled:opacity-30 ${
        ligada
          ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
          : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
      }`}
    >
      {ligada && <Check aria-hidden className="size-4" />}
    </button>
  );

  const formulario = (
    <form onSubmit={salvar} className="space-y-4">
      {/* Nome sempre; conta nova também usuário e senha; papel, menos para o
          superusuário. */}
      <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Nome</span>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            maxLength={60}
            placeholder="ex.: Maria Souza"
            className="h-10 w-full"
          />
        </label>
        <label className="block text-xs">
            <span className="mb-1 block font-medium">{ehNovo ? "Usuário" : "Usuário (login)"}</span>
            <Input
              value={novoUsuario}
              onChange={(e) => setNovoUsuario(e.target.value)}
              required
              placeholder="ex.: maria"
              className="h-10 w-full"
            />
            {/* Trocar o login não derruba quem está dentro: só muda como
                a pessoa entra da próxima vez. */}
            {!ehNovo && (
              <span className="mt-1 block text-[var(--muted-foreground)]">
                É com ele que a pessoa entra. A senha continua a mesma.
              </span>
            )}
          </label>
        {ehNovo && (
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Senha</span>
            <Input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              placeholder="mínimo 3 caracteres"
              className="h-10 w-full"
            />
          </label>
        )}
        {!editandoSuper && (
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Papel</span>
          <select
            value={papel}
            onChange={(e) => trocarPapel(e.target.value as UserRole)}
            className="field h-10 w-full py-0"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        )}
      </div>

      {editandoSuper && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Superusuário alcança tudo: aqui mudam só o nome e o login.
        </p>
      )}

      {/* As permissões numa tabela: módulo à esquerda, as duas fichas em
          colunas fixas, para os quadrados ficarem um embaixo do outro. */}
      {!editandoSuper && (
      <fieldset>
        <legend className="sr-only">O que esta pessoa alcança</legend>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm font-semibold">O que esta pessoa alcança</p>
          <button
            type="button"
            onClick={() => setGrants(ROLE_PRESETS[papel])}
            className="text-xs text-[var(--primary)] underline-offset-4 hover:underline"
          >
            usar o padrão de {ROLE_LABEL[papel]}
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]">
          <div className="grid grid-cols-[1fr_5rem_5rem] items-center border-b border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted-foreground)]">
            <span>Módulo</span>
            <span className="text-center">Acesso</span>
            <span className="text-center">Configura</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {MODULES.map((m) => {
              const acesso = temAcesso(m.slug);
              return (
                <li key={m.slug} className="grid grid-cols-[1fr_5rem_5rem] items-center px-3 py-1.5">
                  <span className="text-sm">
                    {m.name}
                    {!m.enabled && (
                      <span className="block text-[11px] text-[var(--muted-foreground)]">em preparação</span>
                    )}
                    {m.enabled && m.soSuperusuario && (
                      <span className="block text-[11px] text-[var(--muted-foreground)]">só superusuário</span>
                    )}
                  </span>
                  {ficha(acesso, `Acesso a ${m.name}`, () => alternarAcesso(m.slug))}
                  {ficha(temConfigura(m.slug), `Configura ${m.name}`, () => alternarConfigura(m.slug), !acesso)}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          <strong>Acesso</strong> abre o módulo. <strong>Configura</strong> deixa mudar as regras dele.
        </p>

        {/* Sem nenhuma ficha marcada a conta entra e não vê nada — nem um
            módulo na lateral. É estado legítimo, para quem vai completar
            depois, mas silencioso demais para deixar passar sem dizer. */}
        {grants.length === 0 && (
          <p className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
            Nenhum módulo marcado: esta conta vai entrar e não enxergar nada.
          </p>
        )}
        {orfas.length > 0 && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Sobrou permissão para {plural(orfas.length, "módulo")} que não existe neste
            sistema ({orfas.map((g) => g.moduleSlug).join(", ")}). Não dá acesso a nada, e sai
            quando você salvar.
          </p>
        )}
      </fieldset>
      )}

      {erro && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? "Salvando…" : ehNovo ? "Criar conta" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
          voltar
        </Button>
      </div>
    </form>
  );

  /**
   * Um botão de ação da conta: ícone E texto. Eram só ícones, e no celular
   * — sem a dica que aparece ao passar o mouse — o de reativar parecia
   * enfeite: a conta desativada ficava sem saída visível.
   */
  const acao = (
    rotulo: string,
    Icone: typeof Pencil,
    aoTocar: () => void,
    perigo = false,
    ativo = false,
  ) => (
    <button
      type="button"
      title={rotulo}
      aria-pressed={ativo}
      onClick={aoTocar}
      disabled={pendente}
      className={`inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold transition disabled:opacity-40 ${
        perigo
          ? "hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
          : "hover:border-[var(--primary)] hover:text-[var(--foreground)]"
      } ${ativo ? "bg-[var(--muted)] text-[var(--foreground)]" : "bg-[var(--background)] text-[var(--muted-foreground)]"}`}
    >
      <Icone aria-hidden className="size-3.5" />
      {rotulo}
    </button>
  );

  return (
    <>
      <CabecalhoDaPagina
        titulo="Usuários"
        subtitulo={plural(items.filter((u) => u.isActive).length, "conta ativa", "contas ativas")}
        acoes={
          <button
            type="button"
            onClick={() => (ehNovo ? setEditando(null) : abrirNovo())}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--botao)] hover:text-[var(--botao-texto)]"
          >
            <UserPlus aria-hidden className="size-4" />
            Nova conta
          </button>
        }
      />

      {(ativacao.erro || (erro && editando === null && trocandoSenha === null)) && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {ativacao.erro ?? erro}
        </p>
      )}

      {ehNovo && (
        <section className="rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 font-semibold">Nova conta</h2>
          {formulario}
        </section>
      )}

      <Lista>
        {items.map((u) => {
          const aberto = editando === u.id || trocandoSenha === u.id;
          const nome = u.name ?? u.username;
          return (
            <li key={u.id}>
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3"
                style={aberto ? { background: "color-mix(in oklch, var(--primary) 7%, var(--background))" } : undefined}
              >
                {/* A inicial, para achar a pessoa de relance na lista. */}
                <span
                  aria-hidden
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase text-[var(--primary)] ${u.isActive ? "" : "opacity-50"}`}
                  style={{ background: "color-mix(in oklch, var(--primary) 10%, var(--background))" }}
                >
                  {nome.charAt(0)}
                </span>
                <div className={`min-w-0 flex-1 ${u.isActive ? "" : "opacity-60"}`}>
                  <p className="flex flex-wrap items-center gap-x-2 font-semibold leading-snug">
                    {nome}
                    {u.id === meuId && (
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                        você
                      </span>
                    )}
                    {!u.isActive && (
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                        desativada
                      </span>
                    )}
                  </p>
                  {/* O usuário só quando difere do nome — contas antigas têm
                      nome próprio gravado. */}
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {u.name && u.name !== u.username && <span className="font-mono">{u.username} · </span>}
                    {u.superusuario ? (
                      <span className="font-semibold text-[var(--primary)]">Superusuário · acesso a tudo</span>
                    ) : (
                      ROLE_LABEL[u.role]
                    )}
                    {/* "Não bate com o padrão", não "alguém mexeu": um módulo
                        novo no registro também tira a conta do preset. */}
                    {!u.superusuario && !rolePresetMatches(u.role, u.grants) && (
                      <span title={`As permissões não batem com o padrão de ${ROLE_LABEL[u.role]}`}> (ajustado)</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {u.ultimoAcesso ? `entrou ${u.ultimoAcesso}` : "nunca entrou"}
                  </p>
                </div>
                {/* No celular os botões descem para a linha de baixo, à
                    direita, e o nome fica com a largura toda. */}
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
                  {/* Superusuário também edita — mas só o nome. */}
                  {acao(
                    "Editar",
                    Pencil,
                    () => (editando === u.id ? setEditando(null) : abrirEdicao(u)),
                    false,
                    editando === u.id,
                  )}
                  {acao(
                    "Senha",
                    KeyRound,
                    () => {
                      setSenhaNova("");
                      setEditando(null);
                      setTrocandoSenha(trocandoSenha === u.id ? null : u.id);
                    },
                    false,
                    trocandoSenha === u.id,
                  )}
                  {/* A própria conta e o último Dono ativo não têm o botão: o
                      servidor recusa, e um botão que sempre falha só ensina a
                      desconfiar da tela. O lugar fica, para os ícones das
                      outras linhas continuarem alinhados. */}
                  {u.id !== meuId &&
                    !u.superusuario &&
                    !(u.role === "DONO" && u.isActive && donosAtivos <= 1) &&
                    (u.isActive ? (
                      acao("Desativar", UserX, () => alternarAtivo(u), true)
                    ) : (
                      /* Desativada: o caminho de volta em destaque, verde. */
                      <button
                        type="button"
                        onClick={() => alternarAtivo(u)}
                        disabled={pendente}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--botao)] px-3 text-xs font-semibold text-[var(--botao-texto)] hover:opacity-90 disabled:opacity-40"
                      >
                        <UserCheck aria-hidden className="size-3.5" />
                        Reativar
                      </button>
                    ))}
                </div>
              </div>

              {editando === u.id && (
                <div className="border-t border-[var(--border)] px-3 py-4">{formulario}</div>
              )}

              {trocandoSenha === u.id && (
                <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] px-3 py-3">
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium">Nova senha de {nome}</span>
                    <Input
                      type="password"
                      value={senhaNova}
                      onChange={(e) => setSenhaNova(e.target.value)}
                      placeholder="mínimo 3 caracteres"
                      className="h-10 w-56"
                      autoFocus
                    />
                  </label>
                  <Button
                    type="button"
                    disabled={pendente || senhaNova === ""}
                    onClick={() => redefinirSenha(u.id)}
                  >
                    Trocar senha
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setTrocandoSenha(null);
                      setSenhaNova("");
                    }}
                  >
                    voltar
                  </Button>
                  {erro && (
                    <p role="alert" className="w-full text-xs font-medium" style={{ color: "var(--destructive)" }}>
                      {erro}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </Lista>
    </>
  );
}
