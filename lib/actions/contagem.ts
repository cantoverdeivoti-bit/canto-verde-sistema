"use server";


import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { pedidoDaLista } from "@/lib/lista-compra";
import { novoToken } from "@/lib/token";
import { chave, lerNumeroBR } from "@/lib/format";
import { correcaoProdutoSchema, produtoNovoSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { avisarContagemFinalizada } from "@/lib/notificar";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

/**
 * Abrir uma contagem e gerar o link do estoquista.
 *
 * As linhas de item nascem AQUI, todas com `quantidadeContada` nula, e não na
 * hora em que ele digita. É o que faz o link saber o que mostrar mesmo depois
 * de o catálogo mudar: a contagem é um recorte congelado do que existia
 * quando ela começou, e um produto cadastrado no meio dela não aparece de
 * repente na mão de quem já passou por aquela prateleira.
 */
export async function abrirContagem(
  responsavelId: number,
  categoryIds: number[],
  expiraEm: string,
): Promise<Result<{ id: number; token: string }>> {
  await requireModule("compras", { atalho: true });

  if (!Number.isInteger(responsavelId)) {
    return { ok: false, message: "Escolha quem vai contar." };
  }
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return { ok: false, message: "Escolha ao menos uma categoria para contar." };
  }

  // A trava do prazo mora aqui, e não só no botão desabilitado: a action é
  // endpoint chamável, e um prazo no passado abriria um link nascido morto.
  const limite = new Date(expiraEm);
  const agora = new Date();
  const seteDias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(limite.getTime())) {
    return { ok: false, message: "Prazo inválido." };
  }
  if (limite <= agora) {
    return { ok: false, message: "O prazo precisa ser no futuro." };
  }
  if (limite > seteDias) {
    return { ok: false, message: "O prazo não pode passar de sete dias." };
  }

  const responsavel = await prisma.adminUser.findFirst({
    where: { id: responsavelId, isActive: true },
    select: { id: true },
  });
  if (!responsavel) {
    return { ok: false, message: "Esta pessoa não está mais ativa no sistema." };
  }

  // Só ativos: mandar o estoquista procurar na prateleira um item que a casa
  // parou de comprar é trabalho jogado fora.
  const produtos = await prisma.product.findMany({
    where: { isActive: true, categoryId: { in: categoryIds } },
    select: { id: true },
  });

  if (produtos.length === 0) {
    return {
      ok: false,
      message: "Nenhum produto ativo nessas categorias — não há o que contar.",
    };
  }

  try {
    const contagem = await prisma.contagem.create({
      data: {
        // A URL é a credencial. A medida mora em `lib/token.ts`, uma só para
        // as três portas sem senha do sistema.
        token: novoToken(),
        expiresAt: limite,
        categoryIds,
        responsavelId,
        itens: {
          // Um INSERT só: são centenas de produtos numa contagem inteira.
          createMany: { data: produtos.map((p) => ({ produtoId: p.id })) },
        },
      },
      select: { id: true, token: true },
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: contagem };
  } catch (err) {
    console.error("[abrirContagem] falha:", err);
    return { ok: false, message: "Não foi possível abrir a contagem." };
  }
}

/**
 * A porta do estoquista, conferida do mesmo jeito nas três ações que ela abre.
 *
 * Ação de servidor é endpoint HTTP: quem tem o token chama quando quiser, e a
 * tela ter escondido o botão não impede nada. Existe, não fechou e não venceu
 * é a regra inteira, e ela precisa ser a mesma nas três — escrita três vezes,
 * uma delas ia divergir.
 *
 * Não é exportada de propósito: num arquivo "use server" tudo que sai vira
 * endpoint, e esta é conferência interna, não ação.
 */
async function contagemAberta(
  token: string,
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const contagem = await prisma.contagem.findUnique({
    where: { token },
    select: { id: true, concluida: true, expiresAt: true },
  });

  if (!contagem) return { ok: false, message: "Link inválido." };
  if (contagem.concluida) {
    return { ok: false, message: "Esta contagem já foi finalizada." };
  }
  if (contagem.expiresAt < new Date()) {
    return { ok: false, message: "O prazo deste link venceu." };
  }
  return { ok: true, id: contagem.id };
}

/**
 * Quantos produtos novos um link pode lançar.
 *
 * `lancarContagem` só escreve em linha que já existe, então o estrago que ela
 * permite é limitado pelo catálogo. Esta CRIA linha, sem senha. O teto é o que
 * separa "achei três coisas na prateleira" de "alguém com o link encheu a
 * tabela" — e trinta é folgado para uma volta na despensa.
 */
const TETO_DE_PRODUTOS_NOVOS = 30;

/**
 * O estoquista lança o que viu na prateleira.
 *
 * Grava item a item, e não tudo no fim: ele conta andando, com o celular numa
 * mão, e uma aba fechada sem querer no meio do corredor não pode custar a
 * despensa inteira. Vazio apaga o número — é como ele diz "me enganei, não
 * contei este".
 */
export async function lancarContagem(
  token: string,
  produtoId: number,
  quantidade: string | null,
): Promise<Simples> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;
  const contagem = { id: aberta.id };

  // `lerNumeroBR` e não um `replace` de vírgula: o comentário dele nasceu
  // desta tela. Trocar só a vírgula fazia "1.234,5" virar "1.234.5" e cair
  // como quantidade inválida — e ninguém digita mil e duzentos quilos de
  // outro jeito.
  let valor: Prisma.Decimal | null = null;
  if (quantidade !== null && quantidade.trim() !== "") {
    const n = lerNumeroBR(quantidade);
    if (n === null || n < 0) {
      return { ok: false, message: "Quantidade inválida." };
    }
    valor = new Prisma.Decimal(n);
  }

  try {
    const gravou = await prisma.$transaction(async (tx) => {
      // `FOR SHARE` na contagem: se o Finalizar está em curso, este número
      // espera ele terminar e é recusado, em vez de cair depois de o estoque
      // ter sido escrito — ficando na contagem e fora do estoque. E o
      // Finalizar espera este terminar antes de ler os itens.
      const aberta = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM "contagens" WHERE id = ${contagem.id} AND concluida = false FOR SHARE`;
      if (aberta.length === 0) return false;
      await tx.contagemItem.update({
        where: { contagemId_produtoId: { contagemId: contagem.id, produtoId } },
        data: { quantidadeContada: valor },
      });
      return true;
    });
    if (!gravou) return { ok: false, message: "Esta contagem já foi finalizada." };
    return { ok: true };
  } catch (err) {
    console.error("[lancarContagem] falha:", err);
    return { ok: false, message: "Não gravou. Tente de novo." };
  }
}

/**
 * O estoquista achou na prateleira um produto que está desativado, e o
 * reativa dali mesmo, a pedido do dono: o produto volta ao cadastro e entra
 * nesta contagem, pronto para ele digitar quanto tem.
 *
 * Fura o recorte congelado da contagem (ver `registrarProdutoNovo`) de
 * propósito, e só neste caso: quem acrescenta o item é quem está diante da
 * prateleira, e não uma mudança de cadastro chegando por trás dele.
 *
 * Sem login: a porta é o token. Só produto desativado — reativar um ativo não
 * faz nada, e o id que chega de fora não abre nenhuma outra porta.
 */
export async function reativarNaContagem(token: string, produtoId: number): Promise<Simples> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;
  if (!Number.isInteger(produtoId)) return { ok: false, message: "Produto inválido." };

  const produto = await prisma.product.findUnique({
    where: { id: produtoId },
    select: { isActive: true },
  });
  if (!produto) return { ok: false, message: "Produto não encontrado." };
  if (produto.isActive) return { ok: false, message: "Este produto já está ativo." };

  try {
    await prisma.$transaction([
      prisma.product.update({ where: { id: produtoId }, data: { isActive: true } }),
      prisma.contagemItem.upsert({
        where: { contagemId_produtoId: { contagemId: aberta.id, produtoId } },
        create: { contagemId: aberta.id, produtoId },
        update: {},
      }),
    ]);
  } catch (err) {
    console.error("[reativarNaContagem] falha:", err);
    return { ok: false, message: "Não deu para reativar. Tente de novo." };
  }

  revalidatePath(`/estoquista/contagem/${token}`);
  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/** Uma sugestão como a tela do estoquista precisa dela de volta. */
export type ProdutoNovoLancado = {
  id: number;
  nome: string;
  unit: string;
  categoria: string | null;
  quantidade: number;
};

/**
 * O estoquista achou na prateleira algo que não está no cadastro.
 *
 * Não vira produto aqui: vira uma afirmação sobre a prateleira, esperando o
 * dono. E não vira `ContagemItem` nenhum — a contagem é um recorte congelado
 * de propósito, e furar isso faria um item aparecer na mão de quem já passou
 * por aquela prateleira.
 */
export async function registrarProdutoNovo(
  token: string,
  raw: unknown,
): Promise<Result<ProdutoNovoLancado>> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;

  const parsed = produtoNovoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const { nome, unit, categoryId, quantidade } = parsed.data;

  // Id de categoria vindo do navegador é palpite. Aqui um palpite errado não
  // pode derrubar o lançamento: sugestão sem gaveta ainda é sugestão útil, e
  // o dono escolhe a gaveta na hora de autorizar de qualquer jeito.
  let gaveta: number | null = null;
  if (categoryId !== null) {
    const existe = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    gaveta = existe?.id ?? null;
  }

  try {
    const criado = await prisma.$transaction(async (tx) => {
      // O teto conferido dentro da transação, e contando TUDO — não só o que
      // está pendente. Fora dela, dois toques na mesma tela passariam os dois;
      // contando só pendente, o dono recusando lixo devolveria o orçamento a
      // quem mandou o lixo.
      const quantos = await tx.contagemProdutoNovo.count({
        where: { contagemId: aberta.id },
      });
      if (quantos >= TETO_DE_PRODUTOS_NOVOS) throw new Error("CHEIO");

      // Duas linhas com o mesmo nome na mesma contagem viram dois produtos
      // iguais lá na frente. Comparado com a mesma régua da busca, porque
      // "Tomate" e "tomate " são a mesma coisa para quem está no corredor.
      const irmaos = await tx.contagemProdutoNovo.findMany({
        where: { contagemId: aberta.id },
        select: { nome: true },
      });
      if (irmaos.some((i) => chave(i.nome) === chave(nome))) {
        throw new Error("REPETIDO");
      }

      return tx.contagemProdutoNovo.create({
        data: {
          contagemId: aberta.id,
          nome,
          unit,
          categoryId: gaveta,
          quantidade: new Prisma.Decimal(quantidade),
        },
        select: {
          id: true,
          nome: true,
          unit: true,
          quantidade: true,
          category: { select: { name: true } },
        },
      });
    });

    return {
      ok: true,
      data: {
        id: criado.id,
        nome: criado.nome,
        unit: criado.unit,
        categoria: criado.category?.name ?? null,
        quantidade: criado.quantidade.toNumber(),
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "CHEIO") {
      return {
        ok: false,
        message: `Já foram lançados ${TETO_DE_PRODUTOS_NOVOS} produtos novos nesta contagem.`,
      };
    }
    if (err instanceof Error && err.message === "REPETIDO") {
      return { ok: false, message: "Você já lançou esse produto nesta contagem." };
    }
    console.error("[registrarProdutoNovo] falha:", err);
    return { ok: false, message: "Não gravou. Tente de novo." };
  }
}

/**
 * Ele diz que o cadastro está errado, com a prateleira na mão.
 *
 * O oposto de `registrarProdutoNovo`: lá o produto não existe, aqui existe e
 * está descrito errado. Quem conta é quem vê a embalagem, e até agora a única
 * saída era avisar por fora do sistema — o que quer dizer não avisar.
 *
 * Nada muda no cadastro por isto. A correção espera o dono aprovar, igual à
 * sugestão de produto novo, e é ele quem aplica.
 *
 * O item precisa ser DESTA contagem. Sem isso, um link de estoquista vira uma
 * porta para propor correção em qualquer produto do catálogo só sabendo o id
 * — e propor é barato, mas a tela de aprovação é atenção do dono.
 *
 * Exige que algo tenha mudado de verdade. O formulário nasce preenchido com o
 * cadastro, então enviar sem mexer em nada é o caso comum de quem abriu por
 * engano; aceitar seria encher a lista de pendências com cópias do que já é.
 */
export async function sugerirCorrecao(
  token: string,
  raw: unknown,
): Promise<Simples> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;

  const parsed = correcaoProdutoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const { produtoId, nome, unit, categoryId, observacoes, desativar } = parsed.data;

  try {
    const item = await prisma.contagemItem.findUnique({
      where: { contagemId_produtoId: { contagemId: aberta.id, produtoId } },
      select: {
        produto: { select: { name: true, unit: true, categoryId: true } },
      },
    });
    if (!item) return { ok: false, message: "Este item não é desta contagem." };

    // Gaveta vinda do navegador é palpite, e palpite errado não derruba o
    // aviso: a correção sem gaveta ainda diz o que interessa, e é o dono quem
    // escolhe na hora de aprovar.
    const gaveta =
      categoryId === null
        ? null
        : ((
            await prisma.category.findUnique({
              where: { id: categoryId },
              select: { id: true },
            })
          )?.id ?? null);

    const atual = item.produto;
    const mexeu =
      chave(nome) !== chave(atual.name) ||
      unit !== atual.unit ||
      gaveta !== atual.categoryId ||
      observacoes !== null ||
      desativar;
    if (!mexeu) {
      return {
        ok: false,
        message: "Nada mudou. Ajuste um campo ou escreva o que está errado.",
      };
    }

    // Upsert pela chave única: mandar de novo corrige a sugestão anterior em
    // vez de empilhar três versões da mesma reclamação na tela do dono. Volta
    // a PENDENTE de propósito — ele mudou de ideia depois de o dono recusar, e
    // a nova proposta merece ser olhada de novo.
    const valores = { nome, unit, categoryId: gaveta, observacoes, desativar, status: "PENDENTE" as const };
    await prisma.contagemProdutoCorrecao.upsert({
      where: { contagemId_produtoId: { contagemId: aberta.id, produtoId } },
      create: { contagemId: aberta.id, produtoId, ...valores },
      update: { ...valores, decididoEm: null, decididoPorId: null },
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true };
  } catch (err) {
    console.error("[sugerirCorrecao] falha:", err);
    return { ok: false, message: "Não gravou. Tente de novo." };
  }
}

/**
 * Ele acha que o ideal de um produto numa Requisição está errado: "na quinta
 * o abacaxi precisa de 30, não de 25". Nada muda até o dono aceitar em
 * Pendências.
 *
 * O produto precisa ser desta contagem e estar na Requisição — a mesma porta
 * de `sugerirCorrecao`: o link não deixa propor ideal de qualquer produto
 * sabendo o id. Sugerir de novo troca a pendente, em vez de empilhar.
 */
export async function sugerirIdealNaRequisicao(
  token: string,
  dados: { listaId: number; produtoId: number; ideal: string; motivo: string },
): Promise<Simples> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;

  const ideal = lerNumeroBR(dados.ideal.trim());
  if (ideal === null || !Number.isFinite(ideal) || ideal < 0 || ideal > 999999) {
    return { ok: false, message: "Digite o ideal." };
  }
  const motivo = dados.motivo.trim().slice(0, 300) || null;
  if (!Number.isInteger(dados.listaId) || !Number.isInteger(dados.produtoId)) {
    return { ok: false, message: "Dados inválidos." };
  }

  try {
    const [item, naLista] = await Promise.all([
      prisma.contagemItem.findUnique({
        where: { contagemId_produtoId: { contagemId: aberta.id, produtoId: dados.produtoId } },
        select: { produto: { select: { idealStock: true } } },
      }),
      prisma.listaCompraItem.findFirst({
        where: { listaId: dados.listaId, produtoId: dados.produtoId, lista: { ativa: true } },
        select: { idealStock: true },
      }),
    ]);
    if (!item) return { ok: false, message: "Este item não é desta contagem." };
    if (!naLista) return { ok: false, message: "Este produto não está nesta compra de rotina." };

    const antes = naLista.idealStock;
    if (Math.abs(antes.toNumber() - ideal) < 0.0005) {
      return { ok: false, message: "É o mesmo ideal de hoje." };
    }

    const valores = {
      contagemId: aberta.id,
      idealAntes: antes,
      idealSugerido: new Prisma.Decimal(ideal.toFixed(3)),
      motivo,
    };
    const pendente = await prisma.sugestaoIdealRequisicao.findFirst({
      where: { listaId: dados.listaId, produtoId: dados.produtoId, status: "PENDENTE" },
      select: { id: true },
    });
    if (pendente) {
      await prisma.sugestaoIdealRequisicao.update({ where: { id: pendente.id }, data: valores });
    } else {
      await prisma.sugestaoIdealRequisicao.create({
        data: { listaId: dados.listaId, produtoId: dados.produtoId, ...valores },
      });
    }
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true };
  } catch (err) {
    console.error("[sugerirIdealNaRequisicao] falha:", err);
    return { ok: false, message: "Não gravou. Tente de novo." };
  }
}

/**
 * Ele desfaz o que acabou de lançar.
 *
 * Apaga de verdade, e não marca recusado: aqui ele está desfazendo o próprio
 * erro de digitação três segundos depois. `cancelarContagem` preserva porque
 * lá se está mexendo no trabalho de outra pessoa.
 *
 * Uma instrução só, com o `contagemId` e o estado na cláusula — ler e depois
 * escrever abriria a janela para apagar o que o dono acabou de autorizar, e
 * deixaria um link apagar linha de outra contagem só sabendo o id.
 */
export async function removerProdutoNovo(
  token: string,
  id: number,
): Promise<Simples> {
  const aberta = await contagemAberta(token);
  if (!aberta.ok) return aberta;

  const r = await prisma.contagemProdutoNovo.deleteMany({
    where: { id, contagemId: aberta.id, status: "PENDENTE" },
  });

  if (r.count === 0) {
    return { ok: false, message: "O dono já decidiu sobre este — não dá para tirar." };
  }
  return { ok: true };
}

/**
 * O estoquista fecha a contagem.
 *
 * É aqui que o estoque passa a valer — e só do que ele olhou. Item deixado em
 * branco não vira zero: o estoque dele fica como estava, porque "não contei"
 * não é informação sobre a prateleira.
 *
 * Fechar e atualizar o estoque acontecem na mesma transação. Se o estoque
 * falhasse depois de a contagem fechar, o link morreria com o trabalho dentro
 * e sem efeito nenhum, e não haveria como refazer.
 */
export async function finalizarContagem(token: string): Promise<Simples> {
  const contagem = await prisma.contagem.findUnique({
    where: { token },
    select: {
      id: true,
      concluida: true,
      expiresAt: true,
      listaCompraId: true,
      itens: { select: { produtoId: true, quantidadeContada: true } },
    },
  });

  if (!contagem) return { ok: false, message: "Link inválido." };
  if (contagem.concluida) {
    return { ok: false, message: "Esta contagem já foi finalizada." };
  }
  if (contagem.expiresAt < new Date()) {
    return { ok: false, message: "O prazo deste link venceu." };
  }

  const contados = contagem.itens.filter((i) => i.quantidadeContada !== null);
  if (contados.length === 0) {
    return {
      ok: false,
      message: "Nenhum item foi contado ainda: conte ao menos um antes de finalizar.",
    };
  }

  const r = await fecharContagem(contagem.id, contagem.listaCompraId);
  // Quem cuida das compras fica sabendo no celular: a contagem geral com a
  // lista de compra a um toque, a da compra de rotina com o pedido que saiu dela.
  if (r.ok) {
    try {
      after(() => avisarContagemFinalizada(contagem.id));
    } catch {}
  }
  return r;
}

/**
 * Fecha a contagem e grava o estoque do que foi contado, numa transação só.
 * É o miolo de `finalizarContagem` (o estoquista, pelo link) e de
 * `finalizarPeloDono` (quem cuida das compras, quando ele parou no meio).
 */
async function fecharContagem(contagemId: number, listaCompraId: number | null): Promise<Simples> {
  let recado: string | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        // A trava é a própria condição: se outra aba fechou primeiro, o count
        // volta zero e ninguém escreve estoque duas vezes.
        const travou = await tx.contagem.updateMany({
          where: { id: contagemId, concluida: false },
          data: { concluida: true },
        });
        if (travou.count === 0) throw new Error("JA_FINALIZADA");

        // Os itens lidos DEPOIS da trava, e não os de antes da transação: um
        // número que o estoquista digitou no último segundo, gravando enquanto
        // ele apertava Finalizar, entra no estoque. `lancarContagem` segura a
        // contagem com `FOR SHARE`, então a trava acima esperou ele terminar.
        const contados = (
          await tx.contagemItem.findMany({
            where: { contagemId: contagemId, quantidadeContada: { not: null } },
            select: { produtoId: true, quantidadeContada: true },
          })
        );
        if (contados.length === 0) throw new Error("NADA_CONTADO");

        /**
         * Um `UPDATE` só para todos os produtos contados.
         *
         * Era um `update` por item, em laço. Numa contagem de verdade são 330
         * idas ao banco, uma de cada vez, através do pooler — e isso passa dos
         * cinco segundos que o Prisma dá para uma transação. O estoquista
         * percorria a despensa inteira, apertava Finalizar e o botão voltava,
         * três vezes seguidas, com a contagem intacta e nenhum estoque escrito.
         *
         * `updatedAt` vai na mão porque `@updatedAt` é coisa do cliente do
         * Prisma: SQL cru passa por baixo dele.
         */
        const valores = Prisma.join(
          contados.map(
            (i) => Prisma.sql`(${i.produtoId}::int, ${i.quantidadeContada!.toString()}::numeric)`,
          ),
        );
        await tx.$executeRaw`
          UPDATE "products" AS p
             SET "currentStock" = v.contado,
                 "updatedAt" = now()
            FROM (VALUES ${valores}) AS v(id, contado)
           WHERE p.id = v.id
        `;

        // Contagem de compra de rotina: a compra direta nasce aqui, na mesma
        // transação do estoque. O número que acabou de ser gravado é o que
        // decide quanto pedir, e um sem o outro deixaria a lista contada e
        // nada pedido. A contagem geral só grava o estoque: a rotina tem a
        // contagem dela e não depende desta.
        if (listaCompraId !== null) {
          recado = (await pedidoDaLista(tx, contagemId, listaCompraId)).recado;
          if (recado) await tx.contagem.update({ where: { id: contagemId }, data: { recado } });
        }
      },
      // Folgado: o pooler tem dias ruins, e fechar a contagem é o momento em
      // que o trabalho de uma volta inteira na despensa vira estoque.
      { timeout: 30_000 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "JA_FINALIZADA") {
      return { ok: false, message: "Esta contagem já foi finalizada." };
    }
    if (err instanceof Error && err.message === "NADA_CONTADO") {
      return {
        ok: false,
        message: "Nenhum item foi contado ainda: conte ao menos um antes de finalizar.",
      };
    }
    console.error("[finalizarContagem] falha:", err);
    return { ok: false, message: "Não foi possível finalizar." };
  }

  revalidatePath("/admin/compras", "layout");
  limparContadores();
  // O recado dos pedidos da compra de rotina: é o que diz a quem
  // contou que o trabalho já virou compra.
  return { ok: true, message: recado };
}

/** Fecha o link antes da hora, sem gravar estoque. Para contagem abandonada. */
export async function cancelarContagem(id: number): Promise<Simples> {
  await requireModule("compras", { atalho: true });

  const c = await prisma.contagem.findUnique({
    where: { id },
    select: { concluida: true, cotacaoId: true },
  });
  if (!c) return { ok: false, message: "Contagem não encontrada." };
  if (c.cotacaoId !== null) {
    return { ok: false, message: "Esta contagem já virou cotação." };
  }

  // Vence o link em vez de apagar a contagem: o que o estoquista digitou é
  // trabalho dele, e some junto se a linha for embora.
  // A marca de cancelada é o que impede o estoquista de reabrir pelo link —
  // vencida ele reabre, cancelada não.
  const agora = new Date();
  await prisma.contagem.update({
    where: { id },
    data: { expiresAt: agora, canceladaEm: agora },
  });

  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/**
 * Quem cuida das compras fecha a contagem pelo estoquista, com o que ele já
 * contou: ele parou no meio, ou o link venceu antes de ele apertar Finalizar.
 * O estoque sobe só do que foi contado; o resto fica como estava, igual a
 * quando o próprio estoquista finaliza.
 */
export async function finalizarPeloDono(id: number): Promise<Simples> {
  await requireModule("compras", { atalho: true });
  const c = await prisma.contagem.findUnique({
    where: { id },
    select: { id: true, concluida: true, canceladaEm: true, listaCompraId: true },
  });
  if (!c) return { ok: false, message: "Contagem não encontrada." };
  if (c.concluida) return { ok: false, message: "Esta contagem já foi finalizada." };
  if (c.canceladaEm) return { ok: false, message: "Esta contagem foi descartada." };
  return fecharContagem(c.id, c.listaCompraId);
}

/**
 * Mais prazo para o link do estoquista, a partir de quem cuida das compras:
 * soma horas ao prazo de agora (ou a partir de agora, se já venceu). Mesma
 * regra de `mudarPrazoDaContagem`: no máximo sete dias adiante.
 */
export async function estenderContagem(id: number, horas: number): Promise<Simples> {
  await requireModule("compras", { atalho: true });
  if (![6, 12, 24].includes(horas)) return { ok: false, message: "Prazo inválido." };
  const c = await prisma.contagem.findUnique({
    where: { id },
    select: { concluida: true, canceladaEm: true, processadaEm: true, expiresAt: true },
  });
  if (!c) return { ok: false, message: "Contagem não encontrada." };
  if (c.concluida || c.processadaEm) return { ok: false, message: "Esta contagem já foi finalizada." };
  if (c.canceladaEm) return { ok: false, message: "Esta contagem foi descartada." };

  const agora = Date.now();
  const base = Math.max(c.expiresAt.getTime(), agora);
  const limite = Math.min(base + horas * 60 * 60 * 1000, agora + 7 * 24 * 60 * 60 * 1000);
  await prisma.contagem.update({ where: { id }, data: { expiresAt: new Date(limite) } });
  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/**
 * O estoquista escolhe até quando vai a contagem, pelo próprio link — para
 * ganhar tempo quando a despensa não coube no prazo, ou reabrir o link que
 * venceu no meio. O que ele já contou continua lá.
 *
 * Sem login: a porta é o token. Não serve para contagem finalizada nem para
 * a que o dono cancelou. O novo prazo segue a regra de quem abre a contagem:
 * no futuro, e no máximo sete dias adiante.
 */
export async function mudarPrazoDaContagem(token: string, novoFim: string): Promise<Simples> {
  const contagem = await prisma.contagem.findUnique({
    where: { token },
    select: { id: true, concluida: true, canceladaEm: true, processadaEm: true },
  });
  if (!contagem) return { ok: false, message: "Link inválido." };
  if (contagem.concluida || contagem.processadaEm) {
    return { ok: false, message: "Esta contagem já foi finalizada." };
  }
  if (contagem.canceladaEm) {
    return { ok: false, message: "Esta contagem foi cancelada. Peça um link novo." };
  }

  const limite = new Date(novoFim);
  const agora = new Date();
  if (Number.isNaN(limite.getTime())) return { ok: false, message: "Horário inválido." };
  if (limite.getTime() <= agora.getTime() + 5 * 60 * 1000) {
    return { ok: false, message: "Escolha um horário daqui a pelo menos 5 minutos." };
  }
  if (limite.getTime() > agora.getTime() + 7 * 24 * 60 * 60 * 1000) {
    return { ok: false, message: "O prazo não pode passar de sete dias." };
  }

  await prisma.contagem.update({ where: { id: contagem.id }, data: { expiresAt: limite } });
  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/**
 * Apagar a contagem de vez.
 *
 * Irmã de `cancelarContagem`, e o degrau seguinte dela: lá o link vence e a
 * linha fica, porque o que o estoquista digitou é trabalho dele. Aqui a linha
 * some. Serve para a contagem que não vai a lugar nenhum — aberta por engano,
 * duplicada, de teste — e que fica na lista para sempre pedindo uma decisão
 * que ninguém vai tomar.
 *
 * Recusa a que já virou compra. A cotação e os pedidos continuariam existindo
 * (`PedidoCompra.contagemId` é `SetNull`, e a cotação não depende da contagem
 * para nada), mas ficariam sem a origem — e a origem é o que responde "de onde
 * saiu esse número". Quem quer desfazer uma compra mexe na compra.
 *
 * O cascade leva junto os itens contados e os produtos novos que o estoquista
 * lançou e o dono ainda não decidiu. É por isso que a tela avisa antes.
 *
 * O que NÃO desfaz: finalizar a contagem copiou o contado para
 * `Product.currentStock`, e apagar não devolve o estoque ao que era. Continua
 * valendo o que foi contado, que é a informação mais nova que a casa tem sobre
 * a prateleira.
 */
export async function apagarContagem(id: number): Promise<Simples> {
  await requireModule("compras");

  const c = await prisma.contagem.findUnique({
    where: { id },
    select: {
      cotacaoId: true,
      pedidosCompraDiretos: { select: { id: true } },
      processadaEm: true,
    },
  });
  if (!c) return { ok: false, message: "Contagem não encontrada." };
  if (c.processadaEm !== null || c.cotacaoId !== null || c.pedidosCompraDiretos.length > 0) {
    return {
      ok: false,
      message:
        "Esta contagem já virou compra. Apagá-la deixaria a cotação sem origem — mexa na cotação, não aqui.",
    };
  }

  try {
    // A condição repetida na escrita, e não só na leitura acima: entre uma e
    // outra cabe alguém montar a compra noutra aba, e aí o `delete` levaria a
    // origem de uma cotação recém-criada.
    const r = await prisma.contagem.deleteMany({
      where: { id, processadaEm: null, cotacaoId: null, pedidosCompraDiretos: { none: {} } },
    });
    if (r.count === 0) {
      return { ok: false, message: "Esta contagem virou compra agora mesmo." };
    }
  } catch (err) {
    console.error("[apagarContagem] falha:", err);
    return { ok: false, message: "Não consegui apagar. Tente de novo." };
  }

  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/**
 * O dono corrige, na conferência, um número que o estoquista errou.
 *
 * Escreve DUAS coisas: o contado da contagem e o estoque do produto. Esta
 * contagem já foi finalizada — é pré-requisito da tela onde isto é chamado — e
 * finalizar copiou o contado para `Product.currentStock`. Mexer só num dos
 * dois faria a sugestão usar um número e o cadastro guardar outro.
 *
 * E o custo, dito em voz alta: a contagem deixa de ser o registro fiel do que
 * o estoquista viu na prateleira. O projeto vinha protegendo isso — link
 * vencido não reabre, justamente para não dar por boa uma contagem mexida
 * depois. Aqui quem mexe é o dono, logado, olhando a lista de compra, e a tela
 * avisa antes. É escolha dele, não descuido.
 */
export async function corrigirContado(
  contagemId: number,
  produtoId: number,
  quantidade: number,
): Promise<Simples> {
  await requireModule("compras");

  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return { ok: false, message: "Quantidade inválida." };
  }

  const contagem = await prisma.contagem.findUnique({
    where: { id: contagemId },
    select: { concluida: true },
  });
  if (!contagem) return { ok: false, message: "Contagem não encontrada." };
  if (!contagem.concluida) {
    // Contagem aberta é do estoquista, e ele ainda está andando por ela.
    return { ok: false, message: "Esta contagem ainda não foi finalizada." };
  }

  const nova = new Prisma.Decimal(quantidade.toFixed(3));

  try {
    await prisma.$transaction(async (tx) => {
      // `FOR UPDATE`: duas correções do mesmo item ao mesmo tempo leriam o
      // mesmo "antes" e somariam a diferença duas vezes.
      const [antes] = await tx.$queryRaw<{ contado: Prisma.Decimal | null }[]>`
        SELECT "quantidadeContada" AS contado FROM "contagem_itens"
        WHERE "contagemId" = ${contagemId} AND "produtoId" = ${produtoId}
        FOR UPDATE`;
      if (!antes) throw new Error("item fora da contagem");

      await tx.contagemItem.update({
        where: { contagemId_produtoId: { contagemId, produtoId } },
        data: { quantidadeContada: nova },
      });

      // O estoque anda pela DIFERENÇA, e não vira o número corrigido. Entre
      // finalizar a contagem e corrigir pode ter chegado mercadoria; gravar o
      // contado por cima apagava essa entrada do estoque. Sem contado antes,
      // finalizar não tinha escrito nada, e o número corrigido é a contagem.
      if (antes.contado === null) {
        await tx.product.update({ where: { id: produtoId }, data: { currentStock: nova } });
      } else {
        await tx.product.update({
          where: { id: produtoId },
          data: { currentStock: { increment: nova.minus(antes.contado) } },
        });
      }
    });
  } catch (err) {
    console.error("[corrigirContado] falha:", err);
    return { ok: false, message: "Não foi possível corrigir." };
  }

  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true };
}

/**
 * O produto inteiro, para o painel de correção poder devolvê-lo inteiro.
 *
 * `saveProduct` grava todos os campos do `productSchema`, então mandar um
 * campo faltando não o deixa em paz: apaga ele. Carregar aqui, na hora de
 * abrir o painel, evita que a lista de 126 linhas arraste descrição e marcas
 * de todo mundo só porque dez serão editados — e o que ele edita é o estado de
 * agora, não o de quando a tela abriu.
 */
export async function produtoParaCorrigir(
  produtoId: number,
): Promise<Result<{
  code: string;
  name: string;
  description: string;
  preferredBrands: string[];
  acceptsSimilarBrand: boolean;
  categoryId: string;
  unit: string;
  currentStock: string;
  minStock: string;
  idealStock: string;
  lotSize: string;
  isActive: boolean;
  fornecedorIds: number[];
  exclusivoId: string;
}>> {
  await requireModule("compras");

  const p = await prisma.product.findUnique({
    where: { id: produtoId },
    select: {
      code: true,
      name: true,
      description: true,
      preferredBrands: true,
      acceptsSimilarBrand: true,
      categoryId: true,
      unit: true,
      currentStock: true,
      minStock: true,
      idealStock: true,
      lotSize: true,
      isActive: true,
      exclusiveSupplierId: true,
      suppliers: { select: { supplierId: true } },
    },
  });
  if (!p) return { ok: false, message: "Produto não encontrado." };

  // Tudo como texto, que é o que campo devolve — e vírgula, que é como se
  // digita número aqui.
  const numero = (v: Prisma.Decimal | null) =>
    v === null ? "" : String(v).replace(".", ",");

  return {
    ok: true,
    data: {
      code: p.code ?? "",
      name: p.name,
      description: p.description ?? "",
      preferredBrands: p.preferredBrands,
      acceptsSimilarBrand: p.acceptsSimilarBrand,
      categoryId: p.categoryId === null ? "" : String(p.categoryId),
      unit: p.unit,
      currentStock: numero(p.currentStock),
      minStock: numero(p.minStock),
      idealStock: numero(p.idealStock),
      lotSize: numero(p.lotSize),
      isActive: p.isActive,
      fornecedorIds: p.suppliers.map((s) => s.supplierId),
      exclusivoId:
        p.exclusiveSupplierId === null ? "" : String(p.exclusiveSupplierId),
    },
  };
}
