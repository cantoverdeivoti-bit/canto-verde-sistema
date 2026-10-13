/**
 * O destaque dos campos obrigatórios nos links do fornecedor.
 *
 * Dois sinais, e de propósito: o asterisco no rótulo diz "este é
 * obrigatório" antes de ele começar, e o fundo rosado diz "este ainda está
 * vazio" enquanto ele preenche. O fundo some quando o campo é preenchido —
 * sobra só o que falta, e é para lá que o olho vai. Antes, obrigatório e
 * opcional eram iguais, e ele só descobria o que faltava ao tocar em Salvar.
 *
 * Sem o atributo `required` do navegador: o formulário é um só para todos os
 * itens, e o navegador barraria o envio inteiro por causa de um item que ele
 * abriu e desistiu, com um balão que nem diz qual.
 */
export function Obrigatorio() {
  return (
    <span aria-hidden className="text-[var(--primary)]">
      {/* Espaço que não quebra: o * não cai sozinho na linha de baixo
          quando a pergunta é comprida. */}
      {" "}*
    </span>
  );
}

/** Borda vinho sempre; fundo rosado enquanto vazio. */
export function classeObrigatoria(valor: string): string {
  return `border-[var(--primary)]/50 ${valor.trim() === "" ? "bg-[var(--primary-soft)]" : ""}`;
}
