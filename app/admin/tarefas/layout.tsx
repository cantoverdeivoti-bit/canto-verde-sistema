import { guardModule } from "@/lib/auth-guard";

import { NovaTarefaRapida } from "./nova-tarefa-rapida";

/**
 * A guarda do módulo mora no layout, não em cada página.
 *
 * Cobre por prefixo, então rota nova dentro de /admin/tarefas nasce protegida
 * sem ninguém lembrar de nada — o mesmo arranjo do módulo Compras. Sem
 * `configure: true` aqui: configurar é criar quadro e mexer em colunas, e
 * exigir isso no layout trancaria o quadro inteiro para quem só executa.
 *
 * Não há uma segunda guarda para "só superusuário": quem decide isso é o
 * `can()` que `guardModule` já chama, lendo `soSuperusuario` em
 * `lib/modules.ts`. Escrever a regra aqui também seria tê-la em dois lugares,
 * e as ações, que não passam por layout, ficariam com uma só.
 *
 * O "+" do canto mora aqui também, e só aqui: aparece em toda tela do módulo
 * e em nenhuma de fora dele, que é o combinado com o dono.
 */
export default async function TarefasLayout({
  children,
}: LayoutProps<"/admin/tarefas">) {
  await guardModule("tarefas");
  return (
    <>
      {children}
      <NovaTarefaRapida />
    </>
  );
}
