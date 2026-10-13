import type { Metadata } from "next";
import { Archivo, DM_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// Uma família só, esticada. O eixo `wdth` do Archivo vai a 125: o display é
// o mesmo tipo da interface, aberto até virar placa esmaltada. Casa de
// almoço não tem serifada de vitrine — tem letreiro e comanda.
const archivo = Archivo({
  variable: "--font-ui",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Os números são o produto: horário, lugares, telefone. Em mono eles
// alinham em coluna e leem como comanda, que é de onde vieram.
const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Reservas",
  description: "Reserve sua mesa online.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={cn("h-full antialiased font-sans", archivo.variable, dmMono.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
