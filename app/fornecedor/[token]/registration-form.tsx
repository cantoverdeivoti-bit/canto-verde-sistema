"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { enviarCadastro } from "@/lib/actions/fornecedor-convite";
import { maskPhoneBR } from "@/lib/phone-mask";
export type CategoriaOpcao = { id: number; name: string };

/**
 * O formulário que o fornecedor preenche.
 *
 * Pede mais que o cadastro interno: quem digita lá dentro pode voltar depois,
 * quem preenche daqui tem uma chance só. Telefone e ao menos uma categoria são
 * obrigatórios porque sem eles o cadastro não serve para cotar — que é a
 * única razão de ele existir.
 */
export function RegistrationForm({
  token,
  categorias,
}: {
  token: string;
  categorias: CategoriaOpcao[];
}) {
  const [pronto, setPronto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [deliveryWeekdays, setDeliveryWeekdays] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);

  function alternarCategoria(id: number) {
    setCategoryIds((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  function enviar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await enviarCadastro(token, {
        name,
        contactName,
        phone,
        deliveryDays,
        deliveryWeekdays,
        paymentTerms,
        minOrder,
        notes,
        categoryIds,
      });
      if (r.ok) setPronto(r.nome);
      else setErro(r.message);
    });
  }

  if (pronto) {
    return (
      <div className="space-y-4">
        <p className="phrase">Cadastro recebido, {pronto}.</p>
        <p className="text-[var(--muted-foreground)]">
          Já estamos com os seus dados. Quando precisarmos de preço, chamamos
          no telefone que você deixou.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <label className="label" htmlFor="name">
          Nome da empresa
        </label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="contactName">
          Com quem falamos
        </label>
        <Input
          id="contactName"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="phone">
          Telefone
        </label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(maskPhoneBR(e.target.value))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(51) 99999-9999"
          required
        />
        <p className="hint">É por aqui que pedimos preço, no WhatsApp.</p>
      </div>

      <div>
        <label className="label" htmlFor="deliveryDays">
          Prazo de entrega em dias{" "}
          <span className="font-normal text-[var(--muted-foreground)]">
            (opcional)
          </span>
        </label>
        <Input
          id="deliveryDays"
          value={deliveryDays}
          onChange={(e) => setDeliveryDays(e.target.value)}
          inputMode="numeric"
          className="w-28"
        />
      </div>

      {/* As condições da casa dele. Perguntadas aqui porque quem sabe é ele, e
          porque o comprador que digitasse isso depois estaria copiando o que
          já foi dito uma vez. */}
      <div>
        <label className="label" htmlFor="deliveryWeekdays">
          Em que dias você entrega{" "}
          <span className="font-normal text-[var(--muted-foreground)]">
            (opcional)
          </span>
        </label>
        <Input
          id="deliveryWeekdays"
          value={deliveryWeekdays}
          onChange={(e) => setDeliveryWeekdays(e.target.value)}
          placeholder="segunda a sexta"
        />
      </div>

      <div>
        <label className="label" htmlFor="paymentTerms">
          Prazo de pagamento{" "}
          <span className="font-normal text-[var(--muted-foreground)]">
            (opcional)
          </span>
        </label>
        <Input
          id="paymentTerms"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
          placeholder="14 dias"
        />
      </div>

      <div>
        <label className="label" htmlFor="minOrder">
          Pedido mínimo em reais{" "}
          <span className="font-normal text-[var(--muted-foreground)]">
            (opcional)
          </span>
        </label>
        <Input
          id="minOrder"
          value={minOrder}
          onChange={(e) => setMinOrder(e.target.value)}
          inputMode="decimal"
          className="w-32"
        />
      </div>

      <fieldset>
        <legend className="label">O que você fornece</legend>
        <p className="hint mb-2">
          Marque tudo que se aplica. É o que decide quando te chamamos.
        </p>
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarCategoria(c.id)}
              aria-pressed={categoryIds.includes(c.id)}
              className="chip"
            >
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="notes">
          Alguma observação{" "}
          <span className="font-normal text-[var(--muted-foreground)]">
            (opcional)
          </span>
        </label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-y"
          placeholder="Dias de entrega, pedido mínimo, o que for útil."
        />
      </div>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pendente}>
        {pendente ? "Enviando…" : "Enviar cadastro"}
      </Button>
    </form>
  );
}
