import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { configDoReceituario } from "@/lib/receituario-dados";

import { AtualizarBuffet, CoresDasCategorias, Etiquetas, FormDaConfig } from "./form-da-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações · Receituário" };

/** A meta de food cost e o markup que dão o preço sugerido em todas as fichas, as etiquetas que a ficha oferece e as cores das categorias. */
export default async function ConfiguracoesReceituarioPage() {
  await guardModule("receituario", { configure: true });
  const [c, fichas] = await Promise.all([
    configDoReceituario(),
    prisma.fichaTecnica.findMany({ where: { NOT: { etiquetas: { isEmpty: true } } }, select: { etiquetas: true } }),
  ]);
  const usos: Record<string, number> = {};
  for (const f of fichas) for (const e of f.etiquetas) usos[e] = (usos[e] ?? 0) + 1;
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Configurações do receituário"
        subtitulo="Preço sugerido, etiquetas e cores das fichas."
        ajuda="Mudar a meta de food cost ou o markup muda o preço sugerido de todas as fichas de uma vez."
      />
      <FormDaConfig metaFoodCost={c.metaFoodCost} markup={c.markup} />
      <Etiquetas inicial={c.etiquetas} usos={usos} />
      <CoresDasCategorias inicial={c.chavesDasCores} />
      <AtualizarBuffet />
    </Pagina>
  );
}
