import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

import { FormDoProcesso } from "../form-do-processo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo processo · Operacional" };

export default async function NovoProcessoPage() {
  await guardModule("operacional", { configure: true });
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Novo processo" voltar={{ href: "/admin/operacional/processos", texto: "Processos" }} />
      <FormDoProcesso id={null} inicial={{ titulo: "", objetivo: "", passos: [""], observacoes: "" }} />
    </Pagina>
  );
}
