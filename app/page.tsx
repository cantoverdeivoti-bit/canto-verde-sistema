import { redirect } from "next/navigation";

// O Canto Verde recebe reservas no sistema próprio da casa. Este endereço
// leva direto ao painel de gerenciamento.
export default function Inicio() {
  redirect("/admin");
}
