"use client";

/**
 * Um filtro numa caixa só: escolher já envia o formulário em volta, sem
 * botão de Buscar. Fica dentro de um `<form method="get">`.
 */
export function SelectQueEnvia({
  name,
  opcoes,
  atual,
  rotulo,
  className = "field h-11 min-w-0 py-0",
}: {
  name: string;
  opcoes: readonly { valor: string; texto: string }[];
  atual: string;
  rotulo: string;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={atual} aria-label={rotulo} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}
