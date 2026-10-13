"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActionState } from "react";

import { login, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = { error: null };

/**
 * O navegador não preenche nada aqui.
 *
 * O painel roda num aparelho compartilhado no balcão. Com as etiquetas que este
 * formulário trazia — `username` e `current-password` — o Chrome guardava a
 * conta do dono e a entregava a quem sentasse na cadeira. O sistema tem contas
 * e papéis por pessoa, e isso não serve de nada se é o navegador quem escolhe
 * a conta.
 *
 * `new-password` no campo de senha, e não `off`: o Chrome ignora `off` em tela
 * de login há anos, mas respeita `new-password` para não oferecer o que já
 * está guardado.
 *
 * Isto impede o preenchimento silencioso. NÃO apaga a senha que o navegador já
 * salvou, nem o impede de oferecer para salvar de novo — essas duas coisas se
 * resolvem nas configurações do Chrome do aparelho.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} autoComplete="off" className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          Usuário
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="off"
          autoFocus
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Senha
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="msg-error"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>

    </form>
  );
}
