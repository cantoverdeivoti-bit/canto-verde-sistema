import { IrParaOPainel } from "./ir-para-o-painel";

export const dynamic = "force-static";
export const metadata = { title: "Canto Verde" };

/**
 * Onde o app instalado abre (`start_url` do manifest). A tela de abertura do
 * celular (o ícone no fundo verde) é do sistema e não aceita animação: ela
 * fica até a primeira página pintar. Esta página é estática, sem banco nem
 * login, então pinta quase na hora, com a rodinha girando enquanto o painel
 * de verdade carrega por trás. Antes o celular segurava o logotipo parado até
 * o painel inteiro chegar, e parecia travado.
 */
export default function AbrirPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-[#e7eae9]">
      <span aria-hidden className="size-12 animate-spin rounded-full border-4 border-[#186618]/20 border-t-[#186618]" />
      <p role="status" className="text-sm font-medium text-[#186618]">
        Abrindo o painel…
      </p>
      <IrParaOPainel />
    </main>
  );
}
