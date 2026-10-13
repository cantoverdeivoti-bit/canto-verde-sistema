import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

import { fichaParaEditar, opcoesDoEditor } from "../../dados-do-editor";
import { EditorDeFicha } from "../../editor-de-ficha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar ficha · Receituário" };

export default async function EditarFichaPage({ params }: PageProps<"/admin/receituario/[codigo]/editar">) {
  await guardModule("receituario", { configure: true });
  const codigo = decodeURIComponent((await params).codigo).toUpperCase();
  const ficha = await fichaParaEditar(codigo);
  if (!ficha) notFound();
  const { insumos, fichas, etiquetas } = await opcoesDoEditor(ficha.id);
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina voltar={{ href: `/admin/receituario/${codigo}`, texto: ficha.nome }} titulo="Editar ficha" />
      <EditorDeFicha id={ficha.id} inicial={ficha.inicial} insumos={insumos} fichas={fichas} etiquetas={etiquetas} />
    </Pagina>
  );
}
