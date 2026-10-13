"use server";

import { requireModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { registrarAviso } from "@/lib/avisos";
import { bonificacaoPorExtenso, eMercadoria } from "@/lib/bonificacoes";
import { divergenciaDoItem } from "@/lib/pendencias";
import { erroDaNota } from "@/lib/qualidade-regra";
import { diaDaqui, formatAmount, formatDiaNumericoString, formatMoney, plural, UNIT_LABEL } from "@/lib/format";
import { foraDoLote, somaDoPedido } from "@/lib/pedido";
import { precoPedidoDiretoSchema, recebimentoSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Quem compra: mexer no pedido antes de mandar e mandar ao fornecedor é de
 * quem configura Compras (decisão do dono). O estoquista conta e recebe; o
 * pedido que sai da contagem espera o comprador.
 */
const COMPRADOR = { configure: true } as const;
const naoEnviado = (estatus: string) => estatus === "CRIADO" || estatus === "AGUARDANDO_FORNECEDOR";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * O pedido de compra: o documento que sai de casa.
 *
 * Separado de `lib/actions/cotacao.ts`, que passou de mil e seiscentas linhas
 * carregando dois assuntos. A cotação é a PERGUNTA — quem vende, por quanto,
 * qual é o mais barato. O pedido é a RESPOSTA já decidida, e o que acontece
 * com ela depois: o fornecedor confirma o preço, a data muda, a mercadoria
 * chega e vira estoque.
 *
 * Os dois se tocam num ponto só — `gerarPedidosAprovados` cria pedido a
 * partir da cotação — e aquele continua lá, porque é decisão de cotação.
 *
 * O pedido DIRETO, de fornecedor exclusivo, nunca passa por cotação nenhuma:
 * não há o que comparar quando só um pode vender. É ele que tem `token`, e é
 * por isso que este arquivo tem uma ação que roda sem login.
 *
 * Nesta mudança o docstring de `receberPedido` voltou para cima da própria
 * função: ele estava órfão, acima de `definirEntregaPrevista`, e quem lesse
 * "a mercadoria chegou" veria por baixo uma função que só mexe numa data.
 */

/**
 * Fornecedor exclusivo confirmou os preços do pedido direto.
 *
 * Chamada de `/comprador/pedido/<token>`, sem login — mesma porta que
 * `salvarResposta` usa para cotação. O pedido já existe desde que o link foi
 * gerado; aqui só o preço de cada item é preenchido ou corrigido.
 *
 * Tudo ou nada, como em `salvarResposta`: todo preço enviado é validado
 * antes de qualquer escrita.
 *
 * Confirmação parcial é permitida — o fornecedor que só sabe metade dos
 * preços hoje volta e completa depois. O `precoTotal` acompanha o que já foi
 * respondido, em vez de esperar a resposta ficar completa.
 *
 * O estatus NÃO muda aqui, e o parágrafo que dizia o contrário saiu. O pedido
 * direto nasce feito desde que ficou claro que o exclusivo não preenche o
 * link — não há nada a promover. `AGUARDANDO_FORNECEDOR` ficou no enum só por
 * causa das linhas antigas.
 */
export async function confirmarPedidoDireto(
  token: string,
  precos: Record<string, unknown>,
  /** O dia em que ele entrega ("2026-10-01"), escolhido na página. Nulo não mexe. */
  entregaEm: string | null = null,
  /**
   * Os itens que ele marcou "Em falta". É o estado da tela inteira: o item
   * que não está aqui deixa de estar em falta — foi ele que desmarcou.
   */
  emFalta: number[] = [],
): Promise<Result<{ id: number }>> {
  // Só o formato do campo, e dentro de um mês: é o dia da semana que ele
  // escolhe entre os próximos, e qualquer outra coisa chegou por fora da tela.
  if (entregaEm !== null) {
    const valido = /^\d{4}-\d{2}-\d{2}$/.test(entregaEm);
    const dias = valido ? (new Date(`${entregaEm}T12:00:00Z`).getTime() - Date.now()) / 86_400_000 : NaN;
    if (!valido || !(dias > -2 && dias < 32)) return { ok: false, message: "Dia de entrega inválido." };
  }
  try {
    const pedido = await prisma.pedidoCompra.findUnique({
      where: { token },
      include: { itens: { include: { produto: { select: { name: true, unit: true } } } } },
    });

    if (!pedido) {
      return { ok: false, message: "Link expirado ou inválido" };
    }
    if (pedido.entregaConfirmada || pedido.estatus === "CANCELADO") {
      return {
        ok: false,
        message: "Este pedido já foi encerrado. Obrigado pela resposta!",
      };
    }

    const itens = new Map(pedido.itens.map((i) => [i.id, i]));
    const entradas: Array<{
      pedidoCompraItemId: number;
      precoUnitario: Prisma.Decimal;
      marca: string | null;
      observacoes: string | null;
    }> = [];

    for (const [chave, precoData] of Object.entries(precos)) {
      const pedidoCompraItemId = Number(chave);
      if (!itens.has(pedidoCompraItemId)) {
        return { ok: false, message: "Um dos itens não pertence a este pedido" };
      }

      const parsed = precoPedidoDiretoSchema.safeParse(precoData);
      if (!parsed.success) {
        return {
          ok: false,
          message: `${parsed.error.issues[0]?.message ?? "Preço inválido"} (nenhum preço foi gravado)`,
        };
      }

      entradas.push({
        pedidoCompraItemId,
        precoUnitario: new Prisma.Decimal(parsed.data.precoUnitario),
        marca: parsed.data.marca,
        observacoes: parsed.data.observacoes,
      });
    }

    const faltando = new Set(emFalta.filter((id) => Number.isInteger(id)));
    for (const id of faltando) {
      if (!itens.has(id)) return { ok: false, message: "Um dos itens não pertence a este pedido" };
    }
    // Em falta e com preço ao mesmo tempo é a tela desencontrada: vale o preço.
    for (const e of entradas) faltando.delete(e.pedidoCompraItemId);

    if (entradas.length === 0 && faltando.size === 0) {
      return { ok: false, message: "Informe o preço de ao menos um item, ou marque o que está em falta" };
    }

    await prisma.$transaction(async (tx) => {
      for (const e of entradas) {
        await tx.pedidoCompraItem.update({
          where: { id: e.pedidoCompraItemId },
          data: {
            precoUnitario: e.precoUnitario,
            marca: e.marca,
            observacoes: e.observacoes,
            emFalta: false,
          },
        });
      }
      /* Em falta: o preço que ele tenha dado antes sai — item em falta não
         soma no total. E quem não está mais na lista volta a esperar preço. */
      if (faltando.size > 0) {
        await tx.pedidoCompraItem.updateMany({
          where: { pedidoCompraId: pedido.id, id: { in: [...faltando] } },
          data: { emFalta: true, precoUnitario: null, marca: null },
        });
      }
      await tx.pedidoCompraItem.updateMany({
        where: { pedidoCompraId: pedido.id, emFalta: true, id: { notIn: [...faltando] } },
        data: { emFalta: false },
      });

      const todos = await tx.pedidoCompraItem.findMany({
        where: { pedidoCompraId: pedido.id },
        select: { quantidadeSolicitada: true, precoUnitario: true },
      });

      /* O total acompanha o que já foi respondido, e não espera a resposta
         ficar completa.

         Antes esta soma só acontecia quando TODO item tivesse preço, porque
         era ela que promovia o pedido de "aguardando fornecedor" para
         "criado". O pedido nasce feito agora, então não há nada a promover —
         e travar o total em zero até o último item era mostrar R$ 0,00 num
         pedido que já tinha metade dos preços na mão.

         Item sem preço soma zero, que aqui não é preço: é parcela que ainda
         não existe. O total cresce conforme ele responde, e o que faltar sai
         da nota na conferência. */
      const precoTotal = somaDoPedido(todos);
      await tx.pedidoCompra.update({
        where: { id: pedido.id },
        data: {
          precoTotal,
          // O dia que ele disse que entrega vira a previsão do pedido — é o
          // que aparece em Receber pedidos. Meio-dia UTC, a convenção de `diaDaqui`.
          ...(entregaEm !== null ? { dataEntregaPrevista: new Date(`${entregaEm}T12:00:00Z`) } : {}),
        },
      });

      /* Os avisos para a casa, dentro da mesma transação: a resposta e o
         aviso dela nascem juntos. Um "respondeu" por envio; e um "em falta"
         só com o que PASSOU a faltar agora — reenviar a mesma falta não
         avisa de novo. */
      const partes = [
        entradas.length > 0 &&
          `${plural(entradas.length, "item com preço", "itens com preço")} · ${formatMoney(Number(precoTotal))}`,
        faltando.size > 0 && `${faltando.size} em falta`,
        entregaEm !== null && `entrega ${formatDiaNumericoString(entregaEm)}`,
      ].filter(Boolean);
      await registrarAviso(tx, {
        tipo: "PEDIDO_RESPONDIDO",
        fornecedorId: pedido.fornecedorId,
        pedidoId: pedido.id,
        titulo: `respondeu o pedido #${pedido.id}`,
        detalhe: partes.join(" · "),
      });
      const novasFaltas = [...faltando].filter((id) => !itens.get(id)!.emFalta).map((id) => itens.get(id)!);
      if (novasFaltas.length > 0) {
        await registrarAviso(tx, {
          tipo: "ITEM_EM_FALTA",
          fornecedorId: pedido.fornecedorId,
          pedidoId: pedido.id,
          titulo:
            novasFaltas.length === 1
              ? `não tem ${novasFaltas[0].produto.name}`
              : `não tem ${novasFaltas.length} itens do pedido #${pedido.id}`,
          detalhe: novasFaltas
            .map((i) => `${formatAmount(i.quantidadeSolicitada.toNumber())} ${UNIT_LABEL[i.produto.unit]} de ${i.produto.name}`)
            .join(" · "),
          itens: novasFaltas.map((i) => ({
            produtoId: i.produtoId,
            nome: i.produto.name,
            quantidade: i.quantidadeSolicitada.toNumber(),
          })),
          pedeAcao: true,
        });
      }
      // Não falta mais nada neste pedido: o aviso de falta que esperava a
      // casa perdeu o objeto — ele achou o item, ou se enganou.
      if (faltando.size === 0) {
        await tx.avisoCompra.updateMany({
          where: { pedidoId: pedido.id, tipo: "ITEM_EM_FALTA", resolvidoEm: null },
          data: { resolvidoEm: new Date() },
        });
      }
      // Um `update` por item: num pedido grande, os cinco segundos padrão não
      // bastam, e estourar perdia a resposta inteira do fornecedor.
    }, { timeout: 30_000 });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: { id: pedido.id } };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Erro ao salvar resposta" };
  }
}

/**
 * Quando este pedido deve chegar.
 *
 * A previsão nasce do prazo que o fornecedor deu ao cotar, e prazo prometido
 * envelhece: ele liga dizendo que o caminhão quebrou, que adiantou, que só
 * na terça. Sem um jeito de corrigir, a agenda da semana viraria ficção uma
 * semana depois de ser desenhada — e agenda em que ninguém confia é pior do
 * que agenda nenhuma, porque ocupa o topo da tela.
 *
 * Vazio limpa a data. "Não sei quando chega" é resposta legítima, e é
 * diferente de chutar um dia para a linha não ficar em branco.
 */
export async function definirEntregaPrevista(
  pedidoId: number,
  dia: string | null,
): Promise<Result<null>> {
  await requireModule("compras", { atalho: true });

  // Só o formato que o campo de data do navegador manda. Qualquer outra coisa
  // chegou por caminho que não é a tela, e data inválida aqui silenciosamente
  // vira Invalid Date, que o Prisma grava como nulo sem reclamar.
  if (dia !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return { ok: false, message: "Data inválida" };
  }

  try {
    const pedido = await prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      select: { entregaConfirmada: true },
    });
    if (!pedido) return { ok: false, message: "Pedido não encontrado" };
    if (pedido.entregaConfirmada) {
      return { ok: false, message: "Este pedido já foi recebido" };
    }

    await prisma.pedidoCompra.update({
      where: { id: pedidoId },
      // Meio-dia UTC, a mesma convenção de `diaDaqui`: à meia-noite a data
      // volta um dia para quem está a oeste de Greenwich.
      data: { dataEntregaPrevista: dia === null ? null : new Date(`${dia}T12:00:00Z`) },
    });

    // Todas as telas de Compras: a data aparece em Recebimentos, na lista de
    // pedidos e na página do pedido, que é de onde ela é mudada.
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Erro ao salvar a previsão" };
  }
}

/**
 * A mercadoria chegou. Conferir o que veio e dar entrada.
 *
 * Três coisas acontecem juntas, e por isso numa transação só: o que chegou
 * é registrado, o estoque sobe, e o preço pago vira histórico. Se qualquer
 * uma falhasse sozinha, o estoque mentiria sobre o que existe na prateleira.
 *
 * Recebido em branco significa "não conferi este item ainda" e não zera nada.
 * Zero é resposta diferente: quer dizer que o item não veio.
 *
 * `precoUnitario` no item recebido só é usado quando o próprio
 * `PedidoCompraItem` está sem preço — pedido direto cujo fornecedor nunca
 * confirmou pelo link. Nada trava a conferência por isso: quem recebe digita
 * o preço da nota ali mesmo. Item sem preço gravado e sem preço digitado
 * agora não pode ser dado como recebido — sem os dois, não existe o que
 * escrever em `historicoPrecosCompra`.
 */
export async function receberPedido(
  pedidoId: number,
  recebido: Record<
    string,
    { quantidade: number; precoUnitario?: number; problema?: "FALTA" | "DEVOLVIDO" | "AVARIA" } | null
  >,
  /**
   * As estrelas de quem recebe, por item: obrigatórias no produto marcado
   * para avaliar qualidade que chegou (quantidade maior que zero).
   */
  avaliacoes: Record<string, { nota: number; comentario: string }> = {},
  /**
   * A bonificação combinada, conferida junto: veio (com a quantidade, se é
   * mercadoria) ou não veio. A que ficar sem resposta conta como não veio e
   * vai para Pendências, como o item que ninguém tocou.
   */
  bonificacoes: Record<string, { veio: boolean; quantidade?: number }> = {},
  /**
   * O que veio sem estar no pedido. Vira linha do pedido com "pediu 0", e
   * por isso conta como divergência (veio a mais) em Pendências e no aviso,
   * sem nenhum campo novo no banco.
   */
  extras: { produtoId: number; quantidade: number; preco: number }[] = [],
): Promise<Result<{ itensRecebidos: number }>> {
  const quemRecebe = await requireModule("compras", { atalho: true });

  // Validado como toda entrada do módulo. Esta quantidade é somada ao
  // estoque, e sem o teto um dígito a mais na conferência inflaria a
  // prateleira em silêncio — o número continuaria plausível na tela.
  const parsed = recebimentoSchema.safeParse({ itens: recebido, bonificacoes, extras });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Quantidade inválida" };
  }

  try {
    const pedido = await prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      select: {
        fornecedorId: true,
        entregaConfirmada: true,
        itens: {
          select: {
            id: true,
            produtoId: true,
            quantidadeSolicitada: true,
            precoUnitario: true,
            marca: true,
            produto: { select: { name: true, unit: true, avaliarQualidade: true } },
          },
        },
        // O crédito não se confere na entrega: fica de fora.
        bonificacoes: {
          where: { estado: "COMBINADA", tipo: { not: "CREDITO" } },
          select: {
            id: true,
            tipo: true,
            produtoId: true,
            quantidade: true,
            valor: true,
            produto: { select: { name: true, unit: true } },
          },
        },
      },
    });
    if (!pedido) return { ok: false, message: "Pedido não encontrado" };

    if (pedido.entregaConfirmada) {
      return { ok: false, message: "Este pedido já teve a entrada registrada" };
    }

    const entradas: Array<{
      item: (typeof pedido.itens)[number];
      quantidade: Prisma.Decimal;
      /** Nulo só quando nada veio e o pedido não tinha preço: não há o que pagar. */
      precoUnitario: Prisma.Decimal | null;
      problema: "FALTA" | "DEVOLVIDO" | "AVARIA" | undefined;
    }> = [];

    for (const item of pedido.itens) {
      const entrada = parsed.data.itens[String(item.id)];
      if (entrada === null || entrada === undefined) continue;

      // O preço pago: o da nota, quando quem confere corrigiu (o ⚠ da
      // conferência), ou o combinado. Vai para `precoPago` e para o
      // histórico; o combinado (`precoUnitario`) fica como estava, para a
      // diferença aparecer.
      const preco = entrada.precoUnitario ?? item.precoUnitario;
      if ((preco === null || preco === undefined) && entrada.quantidade > 0) {
        return {
          ok: false,
          message:
            "Este item ainda não tem preço confirmado pelo fornecedor — informe o preço para dar entrada.",
        };
      }

      entradas.push({
        item,
        quantidade: new Prisma.Decimal(entrada.quantidade),
        precoUnitario: preco === null || preco === undefined ? null : new Prisma.Decimal(preco),
        problema: entrada.problema,
      });
    }

    if (entradas.length === 0) {
      return { ok: false, message: "Informe o que chegou de ao menos um item" };
    }

    /* Os incluídos: o mesmo produto duas vezes vira uma linha só (o banco
       aceita um produto por pedido), e o que já está no pedido se acerta no
       "Veio" da linha dele, não como incluído. */
    const incluidos = new Map<number, { quantidade: Prisma.Decimal; preco: Prisma.Decimal }>();
    for (const x of parsed.data.extras) {
      const ja = incluidos.get(x.produtoId);
      incluidos.set(x.produtoId, {
        quantidade: (ja?.quantidade ?? new Prisma.Decimal(0)).plus(x.quantidade),
        preco: new Prisma.Decimal(x.preco),
      });
    }
    const doPedido = new Map(pedido.itens.map((i) => [i.produtoId, i.produto.name]));
    for (const produtoId of incluidos.keys()) {
      const nome = doPedido.get(produtoId);
      if (nome) return { ok: false, message: `${nome} já está no pedido: acerte o que veio na linha dele.` };
    }
    const produtosIncluidos =
      incluidos.size === 0
        ? []
        : await prisma.product.findMany({
            where: { id: { in: [...incluidos.keys()] }, isActive: true },
            select: { id: true, name: true, unit: true },
          });
    if (produtosIncluidos.length !== incluidos.size) {
      return { ok: false, message: "Um dos produtos incluídos não existe ou foi desativado." };
    }

    /* As estrelas: todo item marcado para avaliar que chegou precisa da nota
       de quem recebeu — a tela já cobra, e aqui a regra vale de novo porque a
       ação é uma porta por si. O que não veio (quantidade zero) não se avalia. */
    const notas: { item: (typeof pedido.itens)[number]; nota: number; comentario: string | null }[] = [];
    for (const e of entradas) {
      if (!e.item.produto.avaliarQualidade || !e.quantidade.greaterThan(0)) continue;
      const a = avaliacoes[String(e.item.id)];
      const erro = erroDaNota(a?.nota, a?.comentario ?? "", e.item.produto.name);
      if (erro) return { ok: false, message: erro };
      const texto = a!.comentario.trim();
      notas.push({ item: e.item, nota: a!.nota, comentario: texto === "" ? null : texto });
    }

    const agora = new Date();
    const tudoVeio =
      entradas.length === pedido.itens.length &&
      entradas.every((e) => e.quantidade.greaterThanOrEqualTo(e.item.quantidadeSolicitada));

    // A trava contra entrada dupla é a condição do próprio UPDATE, não a
    // checagem lá em cima: entre ler "ainda não recebido" e gravar existe uma
    // janela, e dois cliques ao mesmo tempo passariam os dois pela leitura e
    // dobrariam o estoque. Aqui o banco decide — quem chegar segundo atualiza
    // zero linhas e a transação inteira volta atrás.
    const jaEra = await prisma
      .$transaction(async (tx) => {
        const trava = await tx.pedidoCompra.updateMany({
          where: { id: pedidoId, entregaConfirmada: false },
          data: {
            estatus: tudoVeio ? "ENTREGUE" : "PARCIAL_ENTREGUE",
            entregaConfirmada: true,
            dataEntregaReal: agora,
          },
        });
        if (trava.count === 0) throw new Error("ENTRADA_DUPLICADA");

        /* Um comando por tabela, e não três por item: com 30 itens eram ~95
           idas ao banco dentro da transação, perto do limite de tempo dela.

           Os itens, de uma vez: o que chegou, o preço pago (o da nota, ou o
           combinado), o combinado só quando estava vazio (pedido direto que o
           fornecedor não confirmou — o da nota vira o combinado também), e o
           motivo do ✕ em campo próprio, sem apagar a observação do fornecedor. */
        await tx.$executeRaw`
          UPDATE "pedido_compra_itens" AS i
          SET "quantidadeRecebida" = v.q,
              "precoPago" = COALESCE(v.p, i."precoPago"),
              "precoUnitario" = COALESCE(i."precoUnitario", v.p),
              "problemaRecebimento" = v.prob::"ProblemaRecebimento",
              "updatedAt" = NOW()
          FROM (VALUES ${Prisma.join(
            entradas.map(
              (e) =>
                Prisma.sql`(${e.item.id}::int, ${e.quantidade.toString()}::numeric, ${e.precoUnitario?.toString() ?? null}::numeric, ${e.problema ?? null}::text)`,
            ),
          )}) AS v(id, q, p, prob)
          WHERE i.id = v.id`;

        /* Os incluídos viram linhas do pedido com "pediu 0": o que veio e o
           preço da nota, que é também o combinado (não houve outro). Depois
           seguem o caminho dos outros: estoque e histórico de preço. */
        const criados =
          produtosIncluidos.length === 0
            ? []
            : await tx.pedidoCompraItem.createManyAndReturn({
                data: produtosIncluidos.map((p) => {
                  const x = incluidos.get(p.id)!;
                  return {
                    pedidoCompraId: pedidoId,
                    produtoId: p.id,
                    quantidadeSolicitada: 0,
                    quantidadeRecebida: x.quantidade,
                    precoUnitario: x.preco,
                    precoPago: x.preco,
                  };
                }),
                select: { id: true, produtoId: true },
              });

        // O estoque sobe e o preço vira histórico só do que chegou com preço.
        const comEntrada = [
          ...entradas
            .filter((e) => e.quantidade.greaterThan(0) && e.precoUnitario !== null)
            .map((e) => ({ itemId: e.item.id, produtoId: e.item.produtoId, quantidade: e.quantidade, preco: e.precoUnitario! })),
          ...criados.map((c) => {
            const x = incluidos.get(c.produtoId)!;
            return { itemId: c.id, produtoId: c.produtoId, quantidade: x.quantidade, preco: x.preco };
          }),
        ];
        if (comEntrada.length > 0) {
          // Um produto aparece uma vez só por pedido (@@unique pedido+produto),
          // então cada linha do VALUES acerta um produto só.
          await tx.$executeRaw`
            UPDATE "products" AS p
            SET "currentStock" = p."currentStock" + v.q, "updatedAt" = NOW()
            FROM (VALUES ${Prisma.join(
              comEntrada.map((e) => Prisma.sql`(${e.produtoId}::int, ${e.quantidade.toString()}::numeric)`),
            )}) AS v(id, q)
            WHERE p.id = v.id`;
          await tx.historicoPrecosCompra.createMany({
            data: comEntrada.map((e) => ({
              produtoId: e.produtoId,
              fornecedorId: pedido.fornecedorId,
              precoUnitario: e.preco,
              dataCompra: agora,
              pedidoCompraItemId: e.itemId,
            })),
          });
        }

        // Pedido direto que chegou antes de o fornecedor responder nasceu
        // com total zero — o preço só existiu agora, digitado na
        // conferência. Sem isto o cartão mostraria "R$ 0,00" para uma
        // compra que custou dinheiro. A conta sai do que já está na mão, sem
        // reler os itens.
        if (pedido.itens.some((i) => i.precoUnitario === null)) {
          const precoPorItem = new Map(entradas.map((e) => [e.item.id, e.precoUnitario]));
          const precoTotal = somaDoPedido(
            pedido.itens.map((i) => ({
              quantidadeSolicitada: i.quantidadeSolicitada,
              precoUnitario: i.precoUnitario ?? precoPorItem.get(i.id) ?? null,
            })),
          );
          await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { precoTotal } });
        }

        /* A bonificação: o que veio vira RECEBIDA e, se é mercadoria, soma no
           estoque pela quantidade que veio — sem histórico de preço, porque
           veio de graça e o último custo despencaria. O que não veio vai
           para Pendências. */
        const bonificacaoQueNaoVeio: string[] = [];
        for (const b of pedido.bonificacoes) {
          const conferida = parsed.data.bonificacoes[String(b.id)];
          const mostrar = {
            tipo: b.tipo,
            produto: b.produto ? { nome: b.produto.name, unidade: b.produto.unit } : null,
            quantidade: b.quantidade?.toNumber() ?? null,
            valor: b.valor?.toNumber() ?? null,
          };
          if (!conferida?.veio) {
            await tx.bonificacao.update({ where: { id: b.id }, data: { estado: "NAO_VEIO" } });
            bonificacaoQueNaoVeio.push(`bonificação não veio: ${bonificacaoPorExtenso(mostrar)}`);
            continue;
          }
          if (eMercadoria(b.tipo) && b.produtoId !== null) {
            const q = new Prisma.Decimal(conferida.quantidade ?? b.quantidade ?? 0);
            await tx.bonificacao.update({
              where: { id: b.id },
              data: { estado: "RECEBIDA", quantidadeRecebida: q, recebidaEm: agora, estoqueSomado: true },
            });
            await tx.product.update({ where: { id: b.produtoId }, data: { currentStock: { increment: q } } });
          } else {
            await tx.bonificacao.update({ where: { id: b.id }, data: { estado: "RECEBIDA", recebidaEm: agora } });
          }
        }

        // As estrelas de quem recebeu, junto com a entrada. Pelo link de
        // atalhos a pessoa não tem conta: fica sem autor, e não em nome do dono.
        if (notas.length > 0) {
          await tx.avaliacaoQualidade.createMany({
            data: notas.map((n) => ({
              produtoId: n.item.produtoId,
              pedidoCompraItemId: n.item.id,
              fornecedorId: pedido.fornecedorId,
              marca: n.item.marca,
              origem: "RECEBIMENTO" as const,
              nota: n.nota,
              comentario: n.comentario,
              autorId: quemRecebe.atalho ? null : quemRecebe.id,
            })),
          });
        }

        /* O aviso da entrega, com a mesma régua de Pendências
           (`divergenciaDoItem`): item que ninguém tocou na conferência
           conta como não veio. Tudo certo é um aviso verde; com diferença,
           o aviso lista o quê — mas quem pede ação é a divergência, que já
           conta no menu, e não o aviso. */
        const porItem = new Map(entradas.map((e) => [e.item.id, e]));
        const diferentes = pedido.itens.flatMap((i) => {
          const e = porItem.get(i.id);
          const combinado = i.precoUnitario?.toNumber() ?? e?.precoUnitario?.toNumber() ?? null;
          const d = divergenciaDoItem({
            quantidadeSolicitada: i.quantidadeSolicitada.toNumber(),
            quantidadeRecebida: e ? e.quantidade.toNumber() : null,
            precoUnitario: combinado,
            precoPago: e?.precoUnitario?.toNumber() ?? null,
            problema: e?.problema ?? null,
          });
          if (!d) return [];
          const un = UNIT_LABEL[i.produto.unit];
          const partes = [
            d.faltou > 0 && `faltou ${formatAmount(d.faltou)} ${un}`,
            d.sobrou > 0 && `veio ${formatAmount(d.sobrou)} ${un} a mais`,
            d.diferencaPreco !== 0 && `preço ${d.diferencaPreco > 0 ? "+" : "−"}${formatMoney(Math.abs(d.diferencaPreco))}`,
            d.problema === "AVARIA" && "avaria",
            d.problema === "DEVOLVIDO" && "devolvido",
          ].filter(Boolean);
          return [`${i.produto.name}: ${partes.join(", ") || "falta"}`];
        });
        // O que veio sem estar no pedido: sempre diferença, com o valor.
        for (const p of produtosIncluidos) {
          const x = incluidos.get(p.id)!;
          diferentes.push(
            `${p.name}: veio fora do pedido, ${formatAmount(x.quantidade.toNumber())} ${UNIT_LABEL[p.unit]} × ${formatMoney(x.preco.toNumber())}`,
          );
        }
        diferentes.push(...bonificacaoQueNaoVeio);
        await registrarAviso(tx, {
          tipo: diferentes.length === 0 ? "RECEBIDO_OK" : "RECEBIDO_COM_DIFERENCA",
          fornecedorId: pedido.fornecedorId,
          pedidoId,
          titulo:
            diferentes.length === 0
              ? `entregou o pedido #${pedidoId} — tudo certo`
              : `entregou o pedido #${pedidoId} com ${plural(diferentes.length, "diferença", "diferenças")}`,
          detalhe:
            diferentes.length === 0
              ? plural(entradas.length, "item conferido", "itens conferidos")
              : diferentes.join(" · "),
        });
        return false;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "ENTRADA_DUPLICADA") return true;
        throw err;
      });

    if (jaEra) {
      return { ok: false, message: "Este pedido já teve a entrada registrada" };
    }

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: { itensRecebidos: entradas.length } };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Erro ao registrar o recebimento" };
  }
}

/**
 * Fecha os avisos de "item em falta" que perderam o objeto: o pedido foi
 * cancelado ou encerrado como não entregue, ou a falta foi comprada de outro.
 * Sem isso eles ficavam abertos para sempre, contando no número do menu.
 */
async function resolverFaltas(
  onde: { pedidoId: number } | { id: number },
  db: Pick<typeof prisma, "avisoCompra"> = prisma,
) {
  const agora = new Date();
  await db.avisoCompra.updateMany({
    where: { ...onde, tipo: "ITEM_EM_FALTA", resolvidoEm: null },
    data: { resolvidoEm: agora },
  });
}

/**
 * Cancelar um pedido de compra.
 *
 * O buraco que fechava por último: `CANCELADO` era lido em três lugares e
 * escrito em nenhum. Pedido criado por engano ficava para sempre em
 * Recebimentos cobrando uma conferência que nunca ia acontecer, e a única
 * saída era comprar o que não se queria.
 *
 * Sempre, inclusive depois de recebido. Recebido, o cancelamento DESFAZ a
 * entrada — decisão do dono (27/09): o que tinha entrado sai do estoque, e os
 * preços que aquela entrada gravou no histórico são apagados. Entradas
 * antigas, gravadas antes do histórico lembrar o item, só devolvem o estoque.
 * A confirmação diz isso ANTES do clique.
 *
 * A trava vai na condição do próprio UPDATE, como em `receberPedido`: duas
 * abas passariam as duas por uma leitura prévia, e `updateMany` com
 * `estatus: { not: "CANCELADO" }` deixa o banco decidir quem chegou primeiro.
 *
 * O link do fornecedor morre junto sem código novo — `confirmarPedidoDireto`
 * já recusa pedido cancelado.
 *
 * Não existe "reabrir": não há coluna que diga de onde ele voltou. Criar
 * outro é uma ação; desfazer seria um estado que ninguém modelou.
 */
export async function cancelarPedido(pedidoId: number): Promise<Result<null>> {
  const quem = await requireModule("compras", { atalho: true });

  try {
    const pedido = await prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      select: { id: true, entregaConfirmada: true, estatus: true },
    });
    if (!pedido) return { ok: false, message: "Pedido não encontrado." };
    // Desistir de um pedido que ainda não foi ao fornecedor é decisão de compra.
    // O que já foi e não veio, o recebimento continua podendo encerrar.
    if (naoEnviado(pedido.estatus) && !can(quem, "compras", COMPRADOR)) {
      return { ok: false, message: "Só quem compra cancela um pedido que ainda não foi enviado." };
    }
    // Cancelar o que já chegou tira a mercadoria do estoque: pelo link de
    // atalhos, sem senha, não (decisão do dono).
    if (quem.atalho && pedido.entregaConfirmada) {
      return { ok: false, message: "Cancelar pedido já recebido pede login." };
    }

    const feito = await prisma.$transaction(async (tx) => {
      // A trava primeiro: quem chegar segundo não estorna de novo.
      const trava = await tx.pedidoCompra.updateMany({
        where: { id: pedidoId, estatus: { not: "CANCELADO" }, ...(quem.atalho ? { entregaConfirmada: false } : {}) },
        data: { estatus: "CANCELADO" },
      });
      if (trava.count === 0) return false;

      // Recebido: o que entrou sai do estoque, e os preços que essa entrada
      // gravou saem do histórico — um comando cada, direto dos itens.
      await tx.$executeRaw`
        UPDATE "products" AS p
        SET "currentStock" = p."currentStock" - i."quantidadeRecebida", "updatedAt" = NOW()
        FROM "pedido_compra_itens" AS i
        JOIN "pedidos_compra" AS pc ON pc.id = i."pedidoCompraId"
        WHERE i."pedidoCompraId" = ${pedidoId}
          AND pc."entregaConfirmada" = true
          AND i."quantidadeRecebida" > 0
          AND p.id = i."produtoId"`;
      await tx.$executeRaw`
        DELETE FROM "historico_precos_compra" AS h
        USING "pedido_compra_itens" AS i
        WHERE h."pedidoCompraItemId" = i.id AND i."pedidoCompraId" = ${pedidoId}`;

      /* A bonificação deste pedido: o que ela mesma somou no estoque sai
         (somado por produto — o UPDATE ... FROM usa uma linha só por
         produto), e ela volta a combinada. Se o pedido renascer pela
         cotação, ela renasce junto. */
      await tx.$executeRaw`
        UPDATE "products" AS p
        SET "currentStock" = p."currentStock" - b.q, "updatedAt" = NOW()
        FROM (
          SELECT "produtoId", SUM("quantidadeRecebida") AS q
          FROM "bonificacoes"
          WHERE "pedidoCompraId" = ${pedidoId} AND "estoqueSomado" = true AND "quantidadeRecebida" > 0
          GROUP BY "produtoId"
        ) AS b
        WHERE p.id = b."produtoId"`;
      await tx.bonificacao.updateMany({
        where: { pedidoCompraId: pedidoId, estado: { in: ["RECEBIDA", "NAO_VEIO"] } },
        data: {
          estado: "COMBINADA",
          quantidadeRecebida: null,
          recebidaEm: null,
          estoqueSomado: false,
          entradaSemPedidoId: null,
        },
      });
      // Esta era uma entrada "chegou sem pedido" que trouxe a bonificação de
      // outro pedido: o estoque já saiu com os itens; a bonificação volta a
      // "não veio", para Pendências cobrar de novo.
      await tx.bonificacao.updateMany({
        where: { entradaSemPedidoId: pedidoId },
        data: { estado: "NAO_VEIO", quantidadeRecebida: null, recebidaEm: null, entradaSemPedidoId: null },
      });
      // Pedido cancelado não tem mais falta para resolver.
      await resolverFaltas({ pedidoId }, tx);
      return true;
    });
    if (!feito) {
      return { ok: false, message: "Este pedido já estava cancelado." };
    }

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[cancelarPedido] falha:", err);
    return { ok: false, message: "Não foi possível cancelar o pedido." };
  }
}

/**
 * O fornecedor não entregou e não vai entregar: o pedido sai de Recebimentos
 * encerrado, e a casa deixa pra lá (decisão do dono).
 *
 * É um cancelamento, com a data em `naoEntregueEm`: o relatório de
 * fornecedores conta a falha dele nesse dia, em vez de o pedido sumir das
 * contas como um cancelamento da casa. Só pedido ainda não recebido — o que
 * chegou se resolve na conferência.
 */
export async function naoFoiEntregue(pedidoId: number): Promise<Result<null>> {
  await requireModule("compras", { atalho: true });
  try {
    const r = await prisma.pedidoCompra.updateMany({
      where: { id: pedidoId, entregaConfirmada: false, estatus: { not: "CANCELADO" } },
      data: { estatus: "CANCELADO", naoEntregueEm: new Date() },
    });
    if (r.count === 0) return { ok: false, message: "Este pedido já foi recebido ou cancelado." };
    await resolverFaltas({ pedidoId });
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[naoFoiEntregue] falha:", err);
    return { ok: false, message: "Não foi possível encerrar o pedido." };
  }
}

// ---------------------------------------------------------------------------
// Pedido manual
// ---------------------------------------------------------------------------

/**
 * O pedido que a casa faz de cabeça: escolhe o fornecedor, os produtos e as
 * quantidades, e digita o preço combinado por telefone.
 *
 * **Nunca amarrado a contagem nem a cotação.** Sem `contagemId` e sem
 * `cotacaoId` ele é o "avulso" que as telas já sabem rotular — e uma
 * contagem ligada a ele pareceria gasta, travando a compra da semana.
 *
 * Sem link do fornecedor: o preço é da casa, e o que falta ele completa na
 * página do pedido ou quem recebe digita da nota. A entrega prevista sai do
 * prazo do cadastro, como no pedido direto.
 */
export async function criarPedidoManual(
  fornecedorId: number,
  itens: { produtoId: number; quantidade: number; precoUnitario: number | null }[],
  /** Veio do "Comprar de outro": a falta foi comprada, o aviso sai de Pendências. */
  avisoId: number | null = null,
): Promise<Result<{ id: number }>> {
  await requireModule("compras");

  if (itens.length === 0) return { ok: false, message: "Acrescente ao menos um produto." };
  if (itens.length > 200) return { ok: false, message: "Produtos demais num pedido só." };

  // Produto repetido vira uma linha, com as quantidades somadas: a regra de um
  // produto por pedido é do banco, e aqui ela é a coisa óbvia.
  const porProduto = new Map<number, { quantidade: number; precoUnitario: number | null }>();
  for (const i of itens) {
    if (!Number.isInteger(i.produtoId)) return { ok: false, message: "Produto inválido." };
    if (!quantidadeValida(i.quantidade)) return { ok: false, message: "Quantidade inválida." };
    if (i.precoUnitario !== null && !precoValido(i.precoUnitario)) {
      return { ok: false, message: "Preço inválido." };
    }
    const antes = porProduto.get(i.produtoId);
    porProduto.set(i.produtoId, {
      quantidade: (antes?.quantidade ?? 0) + i.quantidade,
      precoUnitario: i.precoUnitario ?? antes?.precoUnitario ?? null,
    });
  }

  try {
    const [fornecedor, produtos] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: fornecedorId },
        select: { isActive: true, deliveryDays: true },
      }),
      prisma.product.findMany({
        where: { id: { in: [...porProduto.keys()] }, isActive: true },
        select: { id: true, name: true, lotSize: true },
      }),
    ]);
    if (!fornecedor || !fornecedor.isActive) {
      return { ok: false, message: "Fornecedor não encontrado." };
    }
    if (produtos.length !== porProduto.size) {
      return { ok: false, message: "Um dos produtos não existe mais ou foi desativado." };
    }
    for (const p of produtos) {
      const lote = p.lotSize === null ? null : p.lotSize.toNumber();
      const recusa = foraDoLote(p.name, porProduto.get(p.id)!.quantidade, lote);
      if (recusa) return { ok: false, message: recusa };
    }

    const linhas = [...porProduto].map(([produtoId, v]) => ({
      produtoId,
      quantidadeSolicitada: new Prisma.Decimal(v.quantidade),
      precoUnitario: v.precoUnitario === null ? null : new Prisma.Decimal(v.precoUnitario),
    }));

    const pedido = await prisma.pedidoCompra.create({
      data: {
        fornecedorId,
        dataEntregaPrevista:
          fornecedor.deliveryDays === null ? null : diaDaqui(fornecedor.deliveryDays),
        precoTotal: somaDoPedido(linhas),
        itens: { createMany: { data: linhas } },
      },
      select: { id: true },
    });
    if (avisoId !== null && Number.isInteger(avisoId)) {
      await resolverFaltas({ id: avisoId });
    }

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: { id: pedido.id } };
  } catch (err) {
    console.error("[criarPedidoManual] falha:", err);
    return { ok: false, message: "Não foi possível criar o pedido." };
  }
}

/**
 * Chegou mercadoria sem pedido: brinde, troca ou compra feita na porta.
 *
 * Vira um registro de pedido que já nasce recebido — com fornecedor, itens e
 * o motivo — para o estoque subir e a entrada aparecer em Recebimentos junto
 * com as outras. Sem isso, quem recebe teria que criar um pedido manual e
 * conferir em seguida o que acabou de digitar.
 *
 * Só a compra de balcão tem preço, e só ela vira histórico de custo. Brinde e
 * troca entram a zero: gravar zero no histórico faria o último custo do
 * produto despencar por causa de uma caixa que veio de graça.
 *
 * Bonificação pode dizer qual bonificação combinada ela é (`bonificacaoId`):
 * a que não veio com o pedido, ou que veio separada. Ela vira recebida pela
 * quantidade desta entrada, sem somar estoque de novo — a entrada já somou.
 */
export async function registrarChegadaSemPedido(
  fornecedorId: number,
  motivo: "BONIFICACAO" | "TROCA" | "BALCAO",
  itens: { produtoId: number; quantidade: number; precoUnitario: number | null }[],
  bonificacaoId: number | null = null,
  /** A chave da nota do mercado lida pelo QR (`lib/actions/nota-mercado.ts`). Única: a mesma nota não entra duas vezes. */
  notaChave: string | null = null,
): Promise<Result<{ id: number }>> {
  await requireModule("compras", { atalho: true });

  if (notaChave !== null && (motivo !== "BALCAO" || !/^\d{44}$/.test(notaChave))) {
    return { ok: false, message: "Nota fiscal inválida." };
  }
  if (!["BONIFICACAO", "TROCA", "BALCAO"].includes(motivo)) {
    return { ok: false, message: "Escolha o motivo." };
  }
  if (!Number.isInteger(fornecedorId)) return { ok: false, message: "Escolha o fornecedor." };
  if (itens.length === 0) return { ok: false, message: "Acrescente ao menos um produto." };
  if (itens.length > 200) return { ok: false, message: "Produtos demais numa entrada só." };
  if (bonificacaoId !== null && (motivo !== "BONIFICACAO" || !Number.isInteger(bonificacaoId))) {
    return { ok: false, message: "Só a entrada de bonificação se liga a uma bonificação combinada." };
  }

  const comPreco = motivo === "BALCAO";
  const porProduto = new Map<number, { quantidade: number; preco: number }>();
  for (const i of itens) {
    if (!Number.isInteger(i.produtoId)) return { ok: false, message: "Produto inválido." };
    if (!quantidadeValida(i.quantidade)) return { ok: false, message: "Quantidade inválida." };
    if (comPreco && (i.precoUnitario === null || !precoValido(i.precoUnitario))) {
      return { ok: false, message: "Compra de balcão precisa do preço de cada item." };
    }
    const antes = porProduto.get(i.produtoId);
    porProduto.set(i.produtoId, {
      quantidade: (antes?.quantidade ?? 0) + i.quantidade,
      preco: comPreco ? i.precoUnitario! : 0,
    });
  }

  try {
    const [fornecedor, produtos] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: fornecedorId }, select: { isActive: true } }),
      prisma.product.count({ where: { id: { in: [...porProduto.keys()] }, isActive: true } }),
    ]);
    if (!fornecedor || !fornecedor.isActive) {
      return { ok: false, message: "Fornecedor não encontrado." };
    }
    if (produtos !== porProduto.size) {
      return { ok: false, message: "Um dos produtos não existe mais ou foi desativado." };
    }

    // A bonificação combinada que esta entrada traz: do mesmo fornecedor, de
    // mercadoria, ainda por vir, e com o produto dela na entrada.
    const bonificacao =
      bonificacaoId === null
        ? null
        : await prisma.bonificacao.findFirst({
            where: {
              id: bonificacaoId,
              fornecedorId,
              tipo: { in: ["UNIDADES", "BRINDE"] },
              estado: { in: ["COMBINADA", "NAO_VEIO"] },
              pedidoCompra: { is: { estatus: { not: "CANCELADO" } } },
            },
            select: { id: true, produtoId: true, produto: { select: { name: true } } },
          });
    if (bonificacaoId !== null && !bonificacao) {
      return { ok: false, message: "Essa bonificação já foi resolvida ou não é deste fornecedor." };
    }
    if (bonificacao && !porProduto.has(bonificacao.produtoId!)) {
      return {
        ok: false,
        message: `A bonificação escolhida é de ${bonificacao.produto?.name ?? "outro produto"}: acrescente ele na entrada.`,
      };
    }

    const linhas = [...porProduto].map(([produtoId, v]) => ({
      produtoId,
      quantidadeSolicitada: new Prisma.Decimal(v.quantidade),
      quantidadeRecebida: new Prisma.Decimal(v.quantidade),
      precoUnitario: new Prisma.Decimal(v.preco),
      precoPago: new Prisma.Decimal(v.preco),
    }));
    const agora = new Date();

    const id = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoCompra.create({
        data: {
          fornecedorId,
          motivoSemPedido: motivo,
          notaChave,
          estatus: "ENTREGUE",
          entregaConfirmada: true,
          dataEntregaReal: agora,
          precoTotal: somaDoPedido(linhas),
          itens: { createMany: { data: linhas } },
        },
        select: { id: true, itens: { select: { id: true, produtoId: true } } },
      });

      // O estoque sobe de uma vez, um produto por linha do VALUES.
      await tx.$executeRaw`
        UPDATE "products" AS p
        SET "currentStock" = p."currentStock" + v.q, "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(
          linhas.map((l) => Prisma.sql`(${l.produtoId}::int, ${l.quantidadeRecebida.toString()}::numeric)`),
        )}) AS v(id, q)
        WHERE p.id = v.id`;

      if (comPreco) {
        await tx.historicoPrecosCompra.createMany({
          data: pedido.itens.map((i) => ({
            produtoId: i.produtoId,
            fornecedorId,
            precoUnitario: new Prisma.Decimal(porProduto.get(i.produtoId)!.preco),
            dataCompra: agora,
            pedidoCompraItemId: i.id,
          })),
        });
      }

      if (bonificacao) {
        // A condição do estado vai no próprio UPDATE: duas entradas ao mesmo
        // tempo não dão a mesma bonificação por recebida duas vezes.
        const ligada = await tx.bonificacao.updateMany({
          where: { id: bonificacao.id, estado: { in: ["COMBINADA", "NAO_VEIO"] } },
          data: {
            estado: "RECEBIDA",
            quantidadeRecebida: new Prisma.Decimal(porProduto.get(bonificacao.produtoId!)!.quantidade),
            recebidaEm: agora,
            estoqueSomado: false,
            entradaSemPedidoId: pedido.id,
          },
        });
        if (ligada.count === 0) throw new Error("BONIFICACAO_JA_RESOLVIDA");
      }
      return pedido.id;
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && err.message === "BONIFICACAO_JA_RESOLVIDA") {
      return { ok: false, message: "Essa bonificação acabou de ser resolvida por outra pessoa." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "Esta nota já deu entrada no estoque." };
    }
    console.error("[registrarChegadaSemPedido] falha:", err);
    return { ok: false, message: "Não foi possível registrar a entrada." };
  }
}

// ---------------------------------------------------------------------------
// Editar o pedido
// ---------------------------------------------------------------------------

/**
 * Quem pode ter itens mudados pela tela do pedido.
 *
 * Pedido de cotação não: os números dele são os que o fornecedor cotou, e
 * mudar aqui faria o pedido e a cotação contarem duas histórias. Cancelado e
 * recebido também não. Enviado fica travado até alguém tocar em "Voltar a
 * editar" — o fornecedor já tem o pedido na mão, e mudar em silêncio faria o
 * que chega não bater com o que está na tela.
 */
function porQueNaoEdita(p: {
  cotacaoId: number | null;
  estatus: string;
  entregaConfirmada: boolean;
}): string | null {
  if (p.cotacaoId !== null) {
    return "Este pedido saiu de uma cotação: os números dele são os que o fornecedor cotou. Mude pela cotação.";
  }
  if (p.estatus === "CANCELADO") return "Este pedido foi cancelado.";
  if (p.entregaConfirmada) return "Este pedido já teve a entrada registrada.";
  if (p.estatus === "ENVIADO") {
    return "Este pedido já foi enviado ao fornecedor. Toque em “Voltar a editar” para mudar.";
  }
  return null;
}

/** Quantidade de pedido: positiva, finita e com teto, como as outras. */
function quantidadeValida(q: number): boolean {
  return Number.isFinite(q) && q > 0 && q <= 999999;
}

function precoValido(p: number): boolean {
  return Number.isFinite(p) && p > 0 && p <= 9999999;
}

/** Refaz o total dentro da transação — a disciplina de `somaDoPedido`. */
async function refazerTotal(tx: Prisma.TransactionClient, pedidoId: number) {
  const itens = await tx.pedidoCompraItem.findMany({
    where: { pedidoCompraId: pedidoId },
    select: { quantidadeSolicitada: true, precoUnitario: true },
  });
  await tx.pedidoCompra.update({
    where: { id: pedidoId },
    data: { precoTotal: somaDoPedido(itens) },
  });
}

/**
 * Muda a quantidade e/ou o preço de um item do pedido.
 *
 * O preço aqui é o da casa — combinado por telefone. `null` apaga (volta a
 * "o fornecedor ainda vai dizer"); ausente não mexe.
 */
export async function mudarItemDoPedido(
  itemId: number,
  mudanca: { quantidade?: number; precoUnitario?: number | null },
): Promise<Result<null>> {
  await requireModule("compras", COMPRADOR);

  if (mudanca.quantidade !== undefined && !quantidadeValida(mudanca.quantidade)) {
    return { ok: false, message: "Quantidade inválida." };
  }
  if (
    mudanca.precoUnitario !== undefined &&
    mudanca.precoUnitario !== null &&
    !precoValido(mudanca.precoUnitario)
  ) {
    return { ok: false, message: "Preço inválido." };
  }

  try {
    const item = await prisma.pedidoCompraItem.findUnique({
      where: { id: itemId },
      include: {
        pedidoCompra: {
          select: { id: true, cotacaoId: true, estatus: true, entregaConfirmada: true },
        },
        produto: { select: { name: true, lotSize: true } },
      },
    });
    if (!item) return { ok: false, message: "Item não encontrado." };
    const bloqueio = porQueNaoEdita(item.pedidoCompra);
    if (bloqueio) return { ok: false, message: bloqueio };

    if (mudanca.quantidade !== undefined) {
      const lote = item.produto.lotSize === null ? null : item.produto.lotSize.toNumber();
      const recusa = foraDoLote(item.produto.name, mudanca.quantidade, lote);
      if (recusa) return { ok: false, message: recusa };
    }

    await prisma.$transaction(async (tx) => {
      await tx.pedidoCompraItem.update({
        where: { id: itemId },
        data: {
          ...(mudanca.quantidade !== undefined && {
            quantidadeSolicitada: new Prisma.Decimal(mudanca.quantidade),
          }),
          ...(mudanca.precoUnitario !== undefined && {
            precoUnitario:
              mudanca.precoUnitario === null ? null : new Prisma.Decimal(mudanca.precoUnitario),
          }),
        },
      });
      await refazerTotal(tx, item.pedidoCompra.id);
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[mudarItemDoPedido] falha:", err);
    return { ok: false, message: "Não foi possível salvar." };
  }
}

/**
 * Tira um item do pedido. O último não sai: pedido sem item é pedido
 * cancelado, e para isso existe o botão que diz isso.
 *
 * A contagem é DENTRO da transação — duas abas tirando itens ao mesmo tempo
 * passariam as duas por uma leitura de fora e deixariam o pedido vazio.
 */
export async function tirarItemDoPedido(itemId: number): Promise<Result<null>> {
  await requireModule("compras", COMPRADOR);

  try {
    const item = await prisma.pedidoCompraItem.findUnique({
      where: { id: itemId },
      include: {
        pedidoCompra: {
          select: { id: true, cotacaoId: true, estatus: true, entregaConfirmada: true },
        },
      },
    });
    if (!item) return { ok: false, message: "Item não encontrado." };
    const bloqueio = porQueNaoEdita(item.pedidoCompra);
    if (bloqueio) return { ok: false, message: bloqueio };

    const ultimo = await prisma
      .$transaction(async (tx) => {
        const quantos = await tx.pedidoCompraItem.count({
          where: { pedidoCompraId: item.pedidoCompra.id },
        });
        if (quantos <= 1) throw new Error("ULTIMO_ITEM");
        await tx.pedidoCompraItem.delete({ where: { id: itemId } });
        await refazerTotal(tx, item.pedidoCompra.id);
        return false;
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "ULTIMO_ITEM") return true;
        throw err;
      });

    if (ultimo) {
      return {
        ok: false,
        message: "Este é o único item do pedido. Cancele o pedido, se é isso que você quer.",
      };
    }

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[tirarItemDoPedido] falha:", err);
    return { ok: false, message: "Não foi possível tirar o item." };
  }
}

/**
 * Acrescenta um produto ao pedido. Se ele já está no pedido, a quantidade
 * soma na linha que existe — a regra de um produto por pedido é do banco, e
 * aqui ela vira a coisa óbvia em vez de um erro.
 *
 * Aceita produto que não é deste fornecedor, de propósito: compra urgente é
 * o que o pedido manual veio resolver. A tela avisa; a ação não impede.
 */
export async function acrescentarItemNoPedido(
  pedidoId: number,
  produtoId: number,
  quantidade: number,
  precoUnitario: number | null = null,
): Promise<Result<null>> {
  await requireModule("compras", COMPRADOR);

  if (!quantidadeValida(quantidade)) return { ok: false, message: "Quantidade inválida." };
  if (precoUnitario !== null && !precoValido(precoUnitario)) {
    return { ok: false, message: "Preço inválido." };
  }

  try {
    const [pedido, produto] = await Promise.all([
      prisma.pedidoCompra.findUnique({
        where: { id: pedidoId },
        select: {
          id: true,
          cotacaoId: true,
          estatus: true,
          entregaConfirmada: true,
          itens: { where: { produtoId }, select: { id: true, quantidadeSolicitada: true } },
        },
      }),
      prisma.product.findUnique({
        where: { id: produtoId },
        select: { name: true, lotSize: true, isActive: true },
      }),
    ]);
    if (!pedido) return { ok: false, message: "Pedido não encontrado." };
    if (!produto || !produto.isActive) return { ok: false, message: "Produto não encontrado." };
    const bloqueio = porQueNaoEdita(pedido);
    if (bloqueio) return { ok: false, message: bloqueio };

    const existente = pedido.itens[0];
    const total = existente ? existente.quantidadeSolicitada.toNumber() + quantidade : quantidade;
    const lote = produto.lotSize === null ? null : produto.lotSize.toNumber();
    const recusa = foraDoLote(produto.name, total, lote);
    if (recusa) return { ok: false, message: recusa };

    await prisma.$transaction(async (tx) => {
      if (existente) {
        await tx.pedidoCompraItem.update({
          where: { id: existente.id },
          data: {
            quantidadeSolicitada: new Prisma.Decimal(total),
            ...(precoUnitario !== null && { precoUnitario: new Prisma.Decimal(precoUnitario) }),
          },
        });
      } else {
        await tx.pedidoCompraItem.create({
          data: {
            pedidoCompraId: pedidoId,
            produtoId,
            quantidadeSolicitada: new Prisma.Decimal(quantidade),
            precoUnitario: precoUnitario === null ? null : new Prisma.Decimal(precoUnitario),
          },
        });
      }
      await refazerTotal(tx, pedidoId);
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[acrescentarItemNoPedido] falha:", err);
    return { ok: false, message: "Não foi possível acrescentar o produto." };
  }
}

/**
 * Marca (ou desmarca) que o pedido foi enviado ao fornecedor.
 *
 * `ENVIADO` e `dataEnvio` existiam desde o começo e nunca eram escritos: o
 * cartão não sabia distinguir "montei o pedido" de "o fornecedor já tem".
 * É uma ação, e não um efeito do botão do WhatsApp: abrir a conversa não é
 * enviar — a pessoa pode fechar sem mandar.
 *
 * Desmarcar existe porque engano acontece, e travar sem saída faria cancelar
 * e refazer o pedido inteiro. A trava vai na condição do UPDATE, como nas
 * outras ações.
 */
export async function marcarEnviado(pedidoId: number, enviado: boolean): Promise<Result<null>> {
  await requireModule("compras", COMPRADOR);

  try {
    const feito = await prisma.pedidoCompra.updateMany({
      where: enviado
        ? {
            id: pedidoId,
            entregaConfirmada: false,
            estatus: { in: ["CRIADO", "AGUARDANDO_FORNECEDOR"] },
          }
        : { id: pedidoId, entregaConfirmada: false, estatus: "ENVIADO" },
      data: enviado
        ? { estatus: "ENVIADO", dataEnvio: new Date() }
        : { estatus: "CRIADO", dataEnvio: null },
    });
    if (feito.count === 0) {
      return {
        ok: false,
        message: enviado
          ? "Este pedido não pode ser marcado como enviado: já foi enviado, recebido ou cancelado."
          : "Este pedido não está marcado como enviado.",
      };
    }
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[marcarEnviado] falha:", err);
    return { ok: false, message: "Não foi possível salvar." };
  }
}
