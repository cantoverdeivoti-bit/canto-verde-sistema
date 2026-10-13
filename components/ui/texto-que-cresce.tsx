"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Uma caixa de texto de UMA linha de conteúdo que, quando o texto não cabe,
 * quebra e cresce para baixo em vez de esconder o fim.
 *
 * Para nome de produto: "Refrigerante coca-cola zero lata 350ml" cortado em
 * "Refrigerante coca-cola ze" deixava dois itens parecidos iguais na tela.
 *
 * Continua sendo uma linha só no dado: Enter não quebra (faz o que o campo
 * pediria — o `onKeyDown` de quem usa, ou enviar o formulário), e colar
 * texto com quebras vira espaço.
 */
export function TextoQueCresce({
  className,
  onChange,
  onKeyDown,
  value,
  ...props
}: Omit<React.ComponentProps<"textarea">, "rows">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const ajustar = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // A altura inclui a borda (border-box); o scrollHeight, não.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, []);

  // A cada texto novo, e quando a largura muda (girar o celular, abrir a
  // lateral): a mesma frase pode passar a caber, ou deixar de caber.
  React.useLayoutEffect(ajustar, [value, ajustar]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let largura = el.clientWidth;
    const observador = new ResizeObserver(() => {
      if (el.clientWidth === largura) return;
      largura = el.clientWidth;
      ajustar();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [ajustar]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        if (e.target.value.includes("\n")) e.target.value = e.target.value.replace(/\s*\n\s*/g, " ");
        onChange?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key !== "Enter") return;
        // Quem usa já tratou o Enter (confirmar o nome, por exemplo)? Então
        // só não deixa quebrar a linha. Se não, age como um campo comum:
        // envia o formulário em que está.
        const tratado = e.defaultPrevented;
        e.preventDefault();
        if (!tratado) e.currentTarget.form?.requestSubmit();
      }}
      className={cn(
        "block w-full min-w-0 resize-none overflow-hidden rounded-lg border border-input bg-[var(--surface)] px-3 py-1 text-[15px] leading-snug text-foreground transition outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
