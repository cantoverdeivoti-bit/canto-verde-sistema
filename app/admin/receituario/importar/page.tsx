import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { textoDoPadrao } from "@/lib/receituario-padrao";

import { opcoesDoEditor } from "../dados-do-editor";
import { ImportarReceita } from "./importar-receita";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar receita · Receituário" };

/**
 * A receita feita por IA entra aqui: baixa-se o padrão, entrega-se à IA e
 * cola-se a resposta. A ficha abre no Editar ficha já preenchida, para
 * conferir e salvar; nada é gravado sem a pessoa salvar.
 */
export default async function ImportarReceitaPage() {
  await guardModule("receituario", { configure: true });
  const { insumos, fichas, etiquetas } = await opcoesDoEditor(null);
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        voltar={{ href: "/admin/receituario", texto: "Fichas" }}
        titulo="Importar receita"
        subtitulo="Traga para cá a receita que a IA escreveu."
        ajuda="Baixe o padrão, entregue à IA junto com o seu pedido e cole aqui a resposta dela. A ficha abre preenchida para você conferir e salvar."
      />
      <ImportarReceita padrao={textoDoPadrao()} insumos={insumos} fichas={fichas} etiquetas={etiquetas} />
    </Pagina>
  );
}
