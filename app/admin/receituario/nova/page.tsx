import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

import { FICHA_EM_BRANCO, opcoesDoEditor } from "../dados-do-editor";
import { EditorDeFicha } from "../editor-de-ficha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova ficha · Receituário" };

export default async function NovaFichaPage() {
  await guardModule("receituario", { configure: true });
  const { insumos, fichas, etiquetas } = await opcoesDoEditor(null);
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina voltar={{ href: "/admin/receituario", texto: "Fichas" }} titulo="Nova ficha" />
      <EditorDeFicha id={null} inicial={FICHA_EM_BRANCO} insumos={insumos} fichas={fichas} etiquetas={etiquetas} />
    </Pagina>
  );
}
