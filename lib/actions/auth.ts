"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });
    return { error: null };
  } catch (error) {
    // `signIn` sinaliza o redirecionamento de sucesso lançando — precisa
    // atravessar este catch em vez de virar mensagem de erro.
    if (isRedirect(error)) throw error;

    if (error instanceof AuthError) {
      return { error: "Usuário ou senha incorretos." };
    }

    console.error("[login] falha:", error);
    return { error: "Não foi possível entrar. Tente novamente." };
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/admin/login" });
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
