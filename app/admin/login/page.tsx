import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Painel de reservas" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-16">
      <h1 className="text-xl font-semibold">Painel de reservas</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Entre para ver e gerenciar as reservas.
      </p>

      <div className="card mt-6 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
