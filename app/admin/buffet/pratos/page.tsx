import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { guardModule } from "@/lib/auth-guard";
import { gruposDoBuffet, sugestoesPendentes } from "@/lib/buffet-dados";
import { can } from "@/lib/permissions";
import { plural } from "@/lib/format";
import { custoKgPorCodigo } from "@/lib/receituario-buffet";

import { ListaDePratos } from "./lista-de-pratos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratos · Cardápio buffet" };

/**
 * Os pratos do buffet, com o custo por kg e o jeito de fazer no forno
 * combinado. O prato com o código de uma ficha do Receituário usa o custo/kg
 * dela (que segue o preço das compras); sem ficha, o custo é digitado.
 */
export default async function PratosDoBuffetPage() {
  const user = await guardModule("buffet");
  const [pratos, grupos, sugeridos, custosDasFichas] = await Promise.all([
    prisma.pratoBuffet.findMany({
      orderBy: [{ nome: "asc" }],
      omit: { createdAt: true, updatedAt: true },
      include: { _count: { select: { itens: true } } },
    }),
    gruposDoBuffet(),
    sugestoesPendentes({ pratos: true }),
    custoKgPorCodigo(),
  ]);
  // O forno escrito na ficha, para a gaveta do prato avisar quando o do prato diverge.
  const codigos = [...new Set(pratos.flatMap((p) => (p.codFicha ? [p.codFicha.trim().toUpperCase()] : [])))];
  const fornos = await prisma.fichaTecnica.findMany({
    where: { codigo: { in: codigos } },
    select: { codigo: true, modoForno: true, temperatura: true, umidade: true, tempoForno: true, sonda: true, ajusteForno: true },
  });
  const fornoDa = new Map(
    fornos.map((f) => [f.codigo, { modo: f.modoForno, temperatura: f.temperatura, umidade: f.umidade, tempo: f.tempoForno, sonda: f.sonda, ajuste: f.ajusteForno }]),
  );
  const fichas = Object.fromEntries([...custosDasFichas].map(([codigo, f]) => [codigo, { nome: f.nome, porKg: f.porKg, forno: fornoDa.get(codigo) ?? null }]));
  const itens = pratos.map(({ _count, custoKg, ...p }) => ({
    ...p,
    custoKg: custoKg?.toNumber() ?? null,
    noCardapio: _count.itens,
  }));
  const ligados = itens.filter((p) => p.ativo).length;
  const semCusto = itens.filter((p) => p.ativo && p.custoKg === null).length;

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Pratos"
        subtitulo={
          <>
            {plural(ligados, "prato ligado", "pratos ligados")}
            {semCusto > 0 && `, ${semCusto} sem custo/kg`}. O custo/kg é o que entra na média do painel.
          </>
        }
      />
      <ListaDePratos
        itens={itens}
        grupos={grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor }))}
        fichas={fichas}
        sugeridos={sugeridos}
        mudaDireto={can(user, "buffet", { configure: true })}
      />
    </Pagina>
  );
}
