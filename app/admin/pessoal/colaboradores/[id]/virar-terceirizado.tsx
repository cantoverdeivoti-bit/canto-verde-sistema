"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { BotaoQuadrado } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { virarTerceirizado } from "@/lib/actions/pessoal";
import { useAcao } from "@/lib/use-acao";

/**
 * O free que na verdade é uma empresa (a Serve bem cadastrada como pessoa):
 * passa para Terceirizados com os postos da escala, e o colaborador fica
 * desligado. O quadrado abre, embaixo, a explicação e a pergunta.
 *
 * Quem abre e fecha é a fileira (`AcoesDoColaborador`), para ficar um painel
 * aberto por vez.
 */
export function VirarTerceirizado({
  colaboradorId,
  nome,
  aberto,
  setAberto,
}: {
  colaboradorId: number;
  nome: string;
  aberto: boolean;
  setAberto: (aberto: boolean) => void;
}) {
  const { erro, setErro, pendente, rodar } = useAcao();
  const router = useRouter();

  return (
    <>
      <BotaoQuadrado
        icone={Building2}
        texto="Virar terceirizado"
        ativo={aberto}
        onClick={() => {
          setErro(null);
          setAberto(!aberto);
        }}
        dica="É uma empresa terceirizada?"
      />

      {/* Embaixo de todos os quadrados, como o painel do link. */}
      {aberto && (
        <div className="order-last col-span-full basis-full space-y-2 border-t border-[var(--border)] p-3">
          <p className="text-sm">
            <span className="font-semibold">É uma empresa terceirizada?</span>{" "}
            <span className="text-[var(--muted-foreground)]">
              Passa {nome} para Terceirizados, com os postos da escala. Lá pode ficar em vários postos no mesmo dia, sem aviso.
            </span>
          </p>
          <CaixaDeConfirmacao
            pergunta={`Passar ${nome} para Terceirizados? O cadastro de colaborador fica desligado.`}
            confirmar={pendente ? "Passando…" : "Passar"}
            pendente={pendente}
            aoConfirmar={() =>
              rodar(() => virarTerceirizado(colaboradorId), () => router.push("/admin/pessoal/terceirizados"), {
                aviso: `${nome} agora está em Terceirizados`,
              })
            }
            aoVoltar={() => setAberto(false)}
          />
          {erro && (
            <p role="alert" className="msg-error">
              {erro}
            </p>
          )}
        </div>
      )}
    </>
  );
}
