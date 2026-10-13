// Base completa de propósito: a reduzida (import sem "/max") aceita números
// impossíveis — "+55519951507", com nove dígitos nacionais, passava por
// válido e virava reserva que ninguém consegue contatar. Só o servidor
// importa este módulo, então a metadata maior não vai para o navegador.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { z } from "zod";

import { lerNumeroBR } from "@/lib/format";
import { emailValido, lerEmails } from "@/lib/relatorio-regras";

/** "HH:MM" em 24h — formato usado em business_hours e no formulário público. */
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const timeString = z
  .string()
  .regex(TIME_RE, { error: "Horário inválido (use HH:MM)" });

/** "YYYY-MM-DD" — data local do restaurante, sem timezone embutido. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" });

/**
 * Normaliza um telefone brasileiro para E.164 (+5551999999999).
 * Retorna null se o número não for válido.
 */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input, "BR");
  return parsed?.isValid() ? parsed.number : null;
}

// ---------------------------------------------------------------------------
// Reserva (formulário público e criação pelo admin)
// ---------------------------------------------------------------------------

export const reservationInputSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(3, { error: "Informe o nome completo" })
    .max(120),
  customerPhone: z
    .string()
    .trim()
    .min(1, { error: "Informe um telefone para contato" })
    .refine((v) => normalizePhone(v) !== null, {
      error: "Telefone inválido. Ex.: (51) 99999-9999",
    }),
  customerEmail: z.union([z.email({ error: "E-mail inválido" }), z.literal("")]).optional(),
  partySize: z.coerce
    .number()
    .int({ error: "Número de pessoas inválido" })
    .positive({ error: "Número de pessoas inválido" }),
  date: dateString,
  time: timeString,
  notes: z.string().trim().max(500, { error: "Observação muito longa" }).optional(),
});

export type ReservationInput = z.infer<typeof reservationInputSchema>;

// ---------------------------------------------------------------------------
// Domínio 1 — Regras de reserva
// ---------------------------------------------------------------------------

const advanceUnit = z.enum(["MINUTES", "HOURS", "DAYS", "WEEKS", "MONTHS"]);

/** Texto opcional de uma linha: vazio vira nulo. */
const textoOpcional = (max: number, erro: string) =>
  z
    .string()
    .trim()
    .max(max, { error: erro })
    .transform((v) => v || null);

/**
 * O número de WhatsApp como o wa.me quer: só dígitos, com o 55 do país.
 * "(51) 99999-9999" vira "5551999999999". Nulo quando não parece telefone.
 */
export function numeroDoWhatsApp(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  const comPais = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^55\d{10,11}$/.test(comPais) ? comPais : null;
}

export const reservationRulesSchema = z
  .object({
    isActive: z.boolean(),
    maxAdvanceValue: z.coerce.number().int().positive(),
    maxAdvanceUnit: advanceUnit,
    minAdvanceValue: z.coerce.number().int().min(0),
    minAdvanceUnit: advanceUnit,
    delayToleranceMinutes: z.coerce.number().int().min(0).max(240),
    minPartySize: z.coerce.number().int().positive(),
    maxPartySize: z.coerce.number().int().positive(),
    autoApproveUpTo: z.coerce.number().int().positive(),
    manualIfOverLimit: z.boolean(),
    waitlistEnabled: z.boolean(),
    // O textarea manda "" quando o dono apaga o aviso; vira null para que
    // "sem aviso" seja ausência de valor, não uma string vazia guardada.
    bookingNotice: z
      .string()
      .trim()
      .max(2000, { error: "O aviso pode ter no máximo 2000 caracteres" })
      .transform((v) => v || null),
    // O que a página de reserva mostra da casa. Vazio vira nulo: a linha some.
    endereco: textoOpcional(200, "O endereço pode ter no máximo 200 caracteres"),
    sobreACasa: textoOpcional(200, "A frase sobre a casa pode ter no máximo 200 caracteres"),
    whatsapp: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        const n = numeroDoWhatsApp(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "WhatsApp: digite o número com DDD, ex.: (51) 99999-9999" });
          return z.NEVER;
        }
        return n;
      }),
    fotoUrl: z
      .string()
      .trim()
      .max(500, { error: "O link da foto pode ter no máximo 500 caracteres" })
      .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), { error: "A foto precisa ser um link que começa com https://" })
      .transform((v) => v || null),
  })
  // A tríade de aprovação só faz sentido se estiver ordenada. Sem esta checagem
  // dá para salvar "auto-aprova até 10" com "máximo 8" e criar um limite morto.
  .refine((v) => v.minPartySize <= v.maxPartySize, {
    error: "O mínimo de pessoas não pode ser maior que o máximo",
    path: ["minPartySize"],
  })
  .refine((v) => v.autoApproveUpTo <= v.maxPartySize, {
    error:
      "A aprovação automática não pode ultrapassar o tamanho máximo de grupo",
    path: ["autoApproveUpTo"],
  });

// ---------------------------------------------------------------------------
// Domínio 2 — Capacidade física
// ---------------------------------------------------------------------------

export const capacitySettingsSchema = z.object({
  name: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  // Sem default e sem permitir zero: o sistema não opera sem saber a lotação.
  totalCapacity: z.coerce
    .number()
    .int()
    .positive({ error: "Informe quantos lugares o salão tem" }),
  defaultDurationMinutes: z.coerce.number().int().min(15).max(600),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  slotIntervalMinutes: z.coerce.number().int().min(5).max(240),
  minSlotsWarningThreshold: z.coerce.number().int().min(0).max(50),
});

export const businessHoursRowSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    shiftName: z.string().trim().max(40).optional(),
    opensAt: timeString,
    closesAt: timeString,
    isActive: z.boolean(),
  })
  .refine((v) => v.opensAt < v.closesAt, {
    error: "O fechamento precisa ser depois da abertura",
    path: ["closesAt"],
  });

export const specialDateSchema = z
  .object({
    date: dateString,
    isClosed: z.boolean(),
    opensAt: timeString.optional().or(z.literal("")),
    closesAt: timeString.optional().or(z.literal("")),
    capacityOverride: z.coerce.number().int().positive().optional().nullable(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.isClosed || (v.opensAt && v.closesAt), {
    error: "Para um dia com horário especial, informe abertura e fechamento",
    path: ["opensAt"],
  });

// ---------------------------------------------------------------------------
// Domínio 3 — Notificação
// ---------------------------------------------------------------------------

export const notificationSettingsSchema = z.object({
  restaurantEmail: z.email({ error: "E-mail inválido" }),
  notifyRestaurant: z.boolean(),
  notifyCustomer: z.boolean(),
  channel: z.enum(["EMAIL_AUTO", "MANUAL"]),
  sendReminderHours: z.coerce.number().int().min(1).max(168).nullable(),
});

// ---------------------------------------------------------------------------
// Login do admin
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().min(1, { error: "Informe o usuário" }),
  password: z.string().min(1, { error: "Informe a senha" }),
});

// ---------------------------------------------------------------------------
// Compras — cadastros
// ---------------------------------------------------------------------------

/** Campo opcional de texto: "" vira null, para "não informado" ser ausência. */
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null);

/**
 * Campo opcional de número: vazio é "não informado", não zero.
 *
 * A ordem dos ramos é o que faz funcionar. `z.coerce.number()` converte ""
 * em 0, e como a união devolve o primeiro ramo que passa, um campo em branco
 * virava zero antes de o ramo do vazio ser sequer tentado. Na tela isso
 * aparecia como "entrega em 0 dias" num fornecedor que nunca informou prazo —
 * um número inventado pelo sistema, com cara de resposta dele.
 *
 * O `trim` na entrada cobre o campo com espaços, que cai na mesma armadilha.
 */
const optionalNumber = (opcoes: { max: number; inteiro?: boolean }) => {
  const numero = opcoes.inteiro
    ? z.coerce.number().int().min(0).max(opcoes.max)
    : z.coerce.number().min(0).max(opcoes.max);
  return z
    .preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        const t = v.trim();
        /* "250,00" é como se escreve dinheiro nesta casa, e `z.coerce.number`
           devolvia NaN — que a tela mostrava como "Invalid input" sem dizer
           onde. Só quando HÁ vírgula: é a mesma regra de `lerNumeroBR`, e é o
           que mantém "1.5" valendo um e meio para quem digita com ponto. */
        return t.includes(",") ? (lerNumeroBR(t) ?? t) : t;
      },
      z.union([z.literal(""), z.null(), z.undefined(), numero]),
    )
    .transform((v) => (typeof v === "number" ? v : null));
};

/**
 * Categoria virou cadastro, então o que trafega é o id — e id vindo do
 * cliente é palpite até o banco confirmar. O schema garante a forma; quem
 * garante que a categoria existe é a chave estrangeira, e é ela que recusa
 * um id inventado.
 *
 * Vazio é resposta válida: produto sem categoria é estado normal.
 */
const categoryRef = z
  .union([
    z.literal(""),
    z.null(),
    z.undefined(),
    z.coerce.number().int().positive(),
  ])
  .transform((v) => (typeof v === "number" ? v : null));

/** Uma lista de categorias, como o fornecedor marca no formulário. */
const categoryRefs = z.array(z.coerce.number().int().positive()).max(60);

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da categoria" })
    .max(40, { error: "Nome de categoria muito longo" }),
  // Sem ordem informada, a categoria nova vai para o fim da lista — quem
  // acabou de criar não deveria ter que pensar em posição.
  //
  // Vazio antes do número, pela mesma razão do `optionalNumber` acima: a
  // união devolve o primeiro ramo que passa, e `z.coerce.number()` aceita ""
  // convertendo para zero. Aqui o resultado seria zero de qualquer jeito, mas
  // deixar a ordem errada é deixar a armadilha armada para quem copiar isto.
  sortOrder: z
    .union([z.literal(""), z.undefined(), z.coerce.number().int().min(0).max(9999)])
    .transform((v) => (typeof v === "number" ? v : 0)),
});

/**
 * A mensagem que o fornecedor lê ao abrir o link, e nada mais.
 *
 * Vazio vira null como no aviso da reserva — mas o significado é outro: lá
 * null é "sem aviso"; aqui é "usa o texto padrão", porque uma página de
 * cotação sem instrução nenhuma não é uma opção.
 */
export const cotacaoSettingsSchema = z.object({
  mensagemFornecedor: z
    .string()
    .trim()
    .max(2000, { error: "A mensagem pode ter no máximo 2000 caracteres" })
    .transform((v) => v || null),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, { error: "Informe o nome do fornecedor" }).max(120),
  /* Como a casa chama ele, para as telas estreitas de compra. Vazio vira
     nulo e a razão social continua valendo. 40 e não 120: é apelido, não um
     segundo nome — sem o limite, alguém cola a razão social aqui e o
     problema volta pela porta que veio consertá-lo. */
  apelido: optionalText(40),
  contactName: optionalText(120),
  // Mesmo tratamento do telefone de cliente: aceita vazio, mas se vier algo
  // tem que ser discável — é por aqui que o pedido de cotação sai.
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizePhone(v) !== null, {
      error: "Telefone inválido. Ex.: (51) 99999-9999",
    })
    .transform((v) => (v ? normalizePhone(v) : null)),
  // CNPJ, e-mail e endereço saíram do cadastro a pedido do dono. Fora do
  // schema, o que vier é descartado e as colunas ficam como estão no banco.
  deliveryDays: optionalNumber({ max: 365, inteiro: true }),
  // Texto livre de propósito: o fornecedor promete "quarta ou sexta" e cobra
  // em "7,14,21,28". Caixinhas obrigariam quem cadastra a mentir para caber.
  deliveryWeekdays: optionalText(120),
  paymentTerms: optionalText(120),
  minOrder: optionalNumber({ max: 999999 }),
  notes: optionalText(500),
  isActive: z.boolean(),
  /* Opcional: o painel de fornecedor da cotação e o cadastro rápido não
     conhecem este campo, e ausente o Prisma não mexe — senão salvar de lá
     desligaria o atacado sem ninguém ver. */
  compraNoAtacado: z.boolean().optional(),
  /// O que ele atende. Vazio é aceito aqui, ao contrário do cadastro por
  /// convite: quem digita aqui dentro pode voltar depois e completar.
  categoryIds: categoryRefs.default([]),
});

export const productUnit = z.enum([
  "UN", "KG", "G", "L", "ML", "CX", "PCT", "MACO", "DZ", "FD",
]);

/** Quantidade de estoque: aceita vazio, decimal com até 3 casas. */
const stockAmount = optionalNumber({ max: 999999 });

/**
 * Tamanho do lote de compra: vazio é "sem lote", e zero não existe.
 *
 * `optionalNumber` aceita zero porque para estoque zero é resposta legítima —
 * "acabou". Aqui zero seria divisor: a sugestão divide a falta pelo lote, e um
 * lote zero viraria NaN percorrendo a cotação inteira.
 *
 * O refinamento vem DEPOIS do transform de propósito. Ele olha o valor já
 * normalizado, número ou nulo, sem encostar na ordem dos ramos da união que faz
 * `optionalNumber` funcionar — a mesma ordem cujo comentário conta a história
 * do "entrega em 0 dias".
 */
const lotAmount = optionalNumber({ max: 999999 }).refine(
  (v) => v === null || v > 0,
  { error: "O lote precisa ser maior que zero. Deixe em branco se não há lote." },
);

export const productSchema = z
  .object({
    // Único quando existe: o banco tem o índice, mas a mensagem sai daqui.
    code: optionalText(40),
    name: z.string().trim().min(2, { error: "Informe o nome do produto" }).max(120),
    // O detalhe que não cabe no nome. Generoso em tamanho porque é aqui que
    // vai parar a exigência da casa — calibre, corte, como o item é usado — e
    // cortar isso em 120 como o nome faria a pessoa abreviar o que precisa
    // ser exato.
    description: optionalText(600),
    // Limpa e sem repetição: a mesma marca duas vezes na lista viraria duas
    // opções idênticas na tela do fornecedor. O teto de dez é generoso — o
    // produto que aceita mais de dez marcas na prática aceita qualquer uma,
    // e para isso existe o "aceita similar".
    preferredBrands: z
      .array(z.string().trim().max(120))
      .max(10, { error: "No máximo dez marcas por produto" })
      .transform((marcas) => [...new Set(marcas.filter(Boolean))])
      .default([]),
    acceptsSimilarBrand: z.boolean(),
    /* Estrelas de qualidade no recebimento. Opcional pelo mesmo motivo das
       especificações logo abaixo: a planilha e o cadastro rápido não sabem
       dela, e um default apagaria a marcação a cada importação. */
    avaliarQualidade: z.boolean().optional(),
    // Opcional, e não `.default([])`: a importação de planilha e a criação
    // vinda do ERP usam este mesmo schema sem saber de especificação, e um
    // default vazio apagaria as do produto a cada importação.
    especificacoes: z
      .array(
        z.object({
          texto: z.string().trim().min(1).max(80),
          obrigatoria: z.boolean(),
        }),
      )
      .max(8, { error: "No máximo oito especificações por produto" })
      .optional(),
    currentStock: z.coerce.number().min(0).max(999999),
    unit: productUnit,
    categoryId: categoryRef,
    minStock: stockAmount,
    idealStock: stockAmount,
    /* Sem regra cruzada com o ideal, de propósito. Querer ter 10 na prateleira
       e comprar de 12 em 12 é a situação normal, não erro de cadastro — e é
       por elas serem independentes que o arredondamento de meio lote existe.
       Um refine aqui ainda recusaria linhas em massa na importação de planilha
       e na criação vinda do ERP, que usam este mesmo schema. */
    lotSize: lotAmount,
    isActive: z.boolean(),
  })
  // Ideal abaixo do mínimo faria a sugestão de compra pedir quantidade
  // negativa. Barra aqui em vez de deixar a conta explodir depois.
  .refine(
    (v) => v.minStock === null || v.idealStock === null || v.idealStock >= v.minStock,
    { error: "O estoque ideal não pode ser menor que o mínimo", path: ["idealStock"] },
  );

/**
 * O produto que o estoquista achou na prateleira e não estava no cadastro.
 *
 * Mais apertado que `productSchema` de propósito, e pela mesma razão do
 * cadastro do fornecedor por link: isto entra por uma porta sem senha. O
 * `lancarContagem` só escreve em linha que já existe; esta ação CRIA linha, e
 * o que ela aceita é o que qualquer um com o link pode gravar.
 *
 * O nome tem o mesmo teto de 120 do cadastro — a sugestão não pode guardar o
 * que o produto não guardaria e ficar impossível de aprovar depois.
 *
 * A quantidade é obrigatória e não usa `optionalNumber`: ele parou no meio do
 * corredor para digitar isto justamente porque contou. Vazio aqui não é "não
 * olhei", é formulário pela metade.
 */
export const produtoNovoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do produto" })
    .max(120)
    // Este é o primeiro caminho em que alguém sem senha escolhe um texto que
    // vira `Product.name` e depois vira célula de planilha. O `celula()` de
    // lib/planilha.ts protege aspas, ponto e vírgula e quebra de linha, mas
    // não o `=` inicial que o Excel lê como fórmula. Barrar aqui é uma linha;
    // mexer no exportador por causa disto seria consertar no lugar errado.
    .refine((n) => !/^[=+\-@]/.test(n), {
      error: "O nome não pode começar com =, +, - ou @",
    }),
  unit: productUnit,
  categoryId: categoryRef,
  // Lido com `lerNumeroBR`, e não com `coerce`: é o mesmo campo, na mesma
  // tela, que o da contagem — quem digita "1.234,5" numa caixa digita igual
  // na outra, e um aceitar e o outro recusar seria defeito com cara de regra.
  quantidade: z
    .preprocess(
      (v) => (typeof v === "string" ? lerNumeroBR(v) : v),
      z.number({ error: "Informe quanto tem" }).min(0).max(999999),
    ),
});

/**
 * A correção que o estoquista propõe para um item que já existe.
 *
 * O nome tem a mesma régua de `produtoNovoSchema`, e pelo mesmo motivo: é
 * texto escolhido por alguém sem senha que pode virar `Product.name` e depois
 * célula de planilha, onde o Excel leria `=` como fórmula.
 *
 * Diferente de lá, aqui não há quantidade — ela já foi contada na linha do
 * item, e pedir de novo seria duas respostas para a mesma pergunta.
 *
 * A observação é opcional porque o caso comum é mexer num campo e pronto. Mas
 * a ação exige que ALGO tenha mudado, senão a tela aceita um envio que não
 * diz nada e o dono recebe uma correção idêntica ao cadastro.
 */
export const correcaoProdutoSchema = z.object({
  produtoId: z.coerce.number().int().positive(),
  nome: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do produto" })
    .max(120)
    .refine((n) => !/^[=+\-@]/.test(n), {
      error: "O nome não pode começar com =, +, - ou @",
    }),
  unit: productUnit,
  categoryId: categoryRef,
  observacoes: optionalText(500),
  /** "Não usamos mais": pede para desativar o produto. */
  desativar: z.boolean().optional().default(false),
});

export type CorrecaoProdutoInput = z.infer<typeof correcaoProdutoSchema>;

/**
 * A correção sugerida na cotação: a mesma, mais estoque ideal e lote de
 * compra — os dois números do cadastro que decidem a sugestão de compra.
 * Vazio é "não mexe".
 */
export const correcaoNaCotacaoSchema = correcaoProdutoSchema.extend({
  idealStock: optionalNumber({ max: 999999 }),
  lotSize: optionalNumber({ max: 999999 }).refine((v) => v === null || v > 0, {
    error: "O lote precisa ser maior que zero",
  }),
});

/**
 * O que o próprio fornecedor preenche pelo link de convite.
 *
 * Mais exigente que o cadastro manual de propósito: quem digita aqui dentro
 * sabe o que está fazendo e pode deixar campo em branco para completar
 * depois; quem preenche de fora tem uma chance só, e telefone é o que torna
 * o fornecedor alcançável para cotar.
 */
export const supplierSelfRegistrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da empresa" })
    .max(120),
  contactName: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome de quem atende" })
    .max(120),
  phone: z
    .string()
    .trim()
    .min(1, { error: "Informe um telefone para contato" })
    .refine((v) => normalizePhone(v) !== null, {
      error: "Telefone inválido. Ex.: (51) 99999-9999",
    })
    .transform((v) => normalizePhone(v)!),
  // CNPJ, e-mail e endereço saíram do cadastro a pedido do dono. Fora do
  // schema, o que vier é descartado e as colunas ficam como estão no banco.
  deliveryDays: optionalNumber({ max: 365, inteiro: true }),
  // Quem melhor sabe as condições é ele. Perguntar aqui poupa o comprador de
  // digitar depois o que já foi dito no convite.
  deliveryWeekdays: optionalText(120),
  paymentTerms: optionalText(120),
  minOrder: optionalNumber({ max: 999999 }),
  notes: optionalText(500),
  categoryIds: categoryRefs.refine((v) => v.length > 0, {
    error: "Escolha ao menos uma categoria que você atende",
  }),
});

// ---------------------------------------------------------------------------
// Compras — cotação
// ---------------------------------------------------------------------------

/**
 * Um item contado — quantidade de um produto que você viu na prateleira.
 *
 * Zero é resposta válida, e não é detalhe: "acabou" é justamente o caso em
 * que mais se precisa comprar. Recusar zero obrigaria quem conta a deixar o
 * campo em branco para o item que mais falta.
 */
export const contagemItemSchema = z.object({
  produtoId: z.coerce.number().int().positive(),
  quantidadeContada: z.coerce
    .number({ error: "Quantidade inválida" })
    .min(0, { error: "A quantidade contada não pode ser negativa" })
    .max(999999),
});

export type ContagemItem = z.infer<typeof contagemItemSchema>;

/** Muitos itens contados de uma vez. */
export const contagemSchema = z.object({
  itens: z.array(contagemItemSchema).min(1, { error: "Conte pelo menos um item" }).max(500),
});

export type Contagem = z.infer<typeof contagemSchema>;

/**
 * Um item nessa cotação que você vai enviar pro fornecedor.
 *
 * Aqui o positivo é exigido de verdade: pedir preço de zero quilo de tomate
 * é pergunta sem resposta.
 */
export const cotacaoItemSchema = z.object({
  produtoId: z.coerce.number().int().positive(),
  quantidadeSolicitada: z.coerce
    .number({ error: "Quantidade inválida" })
    .positive({ error: "A quantidade a comprar precisa ser maior que zero" })
    .max(999999),
});

export type CotacaoItem = z.infer<typeof cotacaoItemSchema>;

/** A lista de itens que você quer cotar. */
export const cotacaoSchema = z.object({
  itens: z.array(cotacaoItemSchema).min(1, { error: "Escolha pelo menos um item" }).max(2000),
});

export type CotacaoInput = z.infer<typeof cotacaoSchema>;

/**
 * Preço que um fornecedor deu pra um item.
 *
 * Preço zero é recusado: item que ele não vende se deixa em branco, e o
 * formulário nem manda a linha. Um zero aqui venceria toda comparação sendo
 * o mais barato de todos, e a casa geraria pedido de algo que ninguém vende.
 */
/**
 * O que o fornecedor responde sobre um item.
 *
 * Ele informa a EMBALAGEM DELE e o preço dela — "fardo com 12 un por R$ 30" —
 * e o servidor calcula o preço por unidade da casa. Antes disto o link pedia o
 * preço unitário e empurrava a divisão para a cabeça dele, sem guardar quanto
 * tinha dentro; três fornecedores respondiam três coisas que não se comparavam.
 *
 * A marca deixou de ser opcional. Preço sem marca é preço de coisa nenhuma: na
 * conferência da entrega, ninguém sabe se o que chegou é o que foi cotado.
 */
/**
 * O link do fornecedor manda o preço da UNIDADE DA CASA (o kg, a un): ele
 * digitava o do kg no campo da caixa, e a divisão pelo conteúdo fazia R$ 36,50
 * o kg virar R$ 1,83 (decisão do dono: o fornecedor digita sempre o da
 * unidade). O preço da embalagem sai daqui, multiplicado; quem ainda manda o
 * da embalagem (página antiga aberta) continua valendo.
 */
function precoDaEmbalagemPelaUnidade(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  const conteudo = Number(o.conteudo);
  const vezes = (u: unknown) => {
    const n = typeof u === "string" ? lerNumeroBR(u) : typeof u === "number" ? u : null;
    return n === null || !Number.isFinite(n) || !Number.isFinite(conteudo) ? undefined : Math.round(n * conteudo * 100) / 100;
  };
  if (o.precoUnitario !== undefined && o.precoUnitario !== null && o.precoUnitario !== "") {
    o.precoEmbalagem = vezes(o.precoUnitario) ?? o.precoEmbalagem;
  }
  if (o.descontoPrecoUnitario !== undefined && o.descontoPrecoUnitario !== null && o.descontoPrecoUnitario !== "") {
    o.descontoPrecoEmbalagem = vezes(o.descontoPrecoUnitario) ?? o.descontoPrecoEmbalagem;
  }
  return o;
}

const precoBase = z.object({
  embalagem: z
    .string()
    .trim()
    .min(1, { error: "Diga como você vende (fardo, caixa, bombona)" })
    .max(60),
  conteudo: z.coerce
    .number({ error: "Conteúdo inválido" })
    .positive({ error: "Quanto vem na embalagem precisa ser maior que zero" })
    .max(999999),
  precoEmbalagem: z.coerce
    .number({ error: "Preço inválido" })
    .positive({ error: "O preço precisa ser maior que zero" })
    .max(9999999),
  /* O preço da unidade da casa, como ele digitou. Presente, é ele que vale
     (sem o arredondamento da embalagem); ausente, sai da embalagem. */
  precoUnitario: optionalNumber({ max: 9999999 }),
  quantidadeSolicitada: z.coerce.number().positive(),
  prazoEntregaDias: optionalNumber({ max: 365, inteiro: true }),
  marca: z
    .string()
    .trim()
    .min(1, { error: "Informe a marca que você está oferecendo" })
    .max(120),
  observacoes: optionalText(500),
  /* Preço por volume, opcional: "acima de 10, fica R$ 115". Na mesma medida
     de `precoEmbalagem`. As regras entre os dois campos ficam no `superRefine`
     abaixo. */
  descontoAcimaDe: optionalNumber({ max: 999999 }),
  descontoPrecoEmbalagem: optionalNumber({ max: 9999999 }),
  /* Sim ou não para cada especificação do produto, pelo texto. Quem confere
     se as obrigatórias vieram com "sim" é `salvarResposta`, que conhece o
     cadastro — daqui só sai o formato. */
  especificacoes: z
    .array(z.object({ texto: z.string().max(80), atende: z.boolean() }))
    .max(8)
    .default([]),
}).superRefine((d, ctx) => {
  if (d.precoUnitario !== null && d.precoUnitario <= 0) {
    ctx.addIssue({ code: "custom", message: "O preço precisa ser maior que zero" });
  }
  const acima = d.descontoAcimaDe;
  const preco = d.descontoPrecoEmbalagem;
  if (acima === null && preco === null) return;
  if (acima === null || preco === null || acima <= 0 || preco <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "No preço por quantidade, preencha a quantidade e o valor",
    });
    return;
  }
  // Desconto que não desconta é engano de digitação, e ia aparecer na tela
  // da casa como se fosse oferta.
  if (preco >= d.precoEmbalagem) {
    ctx.addIssue({
      code: "custom",
      message: "O valor com desconto precisa ser menor que o valor normal",
    });
  }
});

export const precoSchema = z.preprocess(precoDaEmbalagemPelaUnidade, precoBase);

/** O fornecedor dizendo que não tem, ou que não trabalha com aquilo. */
export const recusaSchema = z.object({
  estatus: z.enum(["SEM_ESTOQUE", "NAO_TRABALHA"]),
  observacoes: optionalText(500),
});

/**
 * O fornecedor oferecendo algo que a casa nunca pediu.
 *
 * Apertado pela mesma razão de `produtoNovoSchema`, e um degrau mais: aquele
 * é o estoquista da casa, este é gente de fora com um link, sem senha, e com
 * interesse comercial no que escreve. Nada daqui vira cadastro sem alguém da
 * casa autorizar.
 *
 * O `=` inicial é barrado aqui pelo mesmo motivo de lá: este nome pode virar
 * `Product.name` e depois célula de planilha, onde o Excel leria fórmula.
 *
 * A embalagem repete a gramática de `precoSchema` de propósito. É a mesma
 * pergunta, feita na mesma tela, ao mesmo fornecedor — duas grafias dela
 * seriam duas regras para uma coisa só.
 */
export const ofertaNovaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do produto" })
    .max(120)
    .refine((n) => !/^[=+\-@]/.test(n), {
      error: "O nome não pode começar com =, +, - ou @",
    }),
  unit: productUnit,
  embalagem: z
    .string()
    .trim()
    .min(1, { error: "Diga como você vende (fardo, caixa, bombona)" })
    .max(60),
  conteudo: z.coerce
    .number({ error: "Conteúdo inválido" })
    .positive({ error: "Quanto vem na embalagem precisa ser maior que zero" })
    .max(999999),
  precoEmbalagem: z.coerce
    .number({ error: "Preço inválido" })
    .positive({ error: "O preço precisa ser maior que zero" })
    .max(9999999),
  marca: z
    .string()
    .trim()
    .min(1, { error: "Informe a marca que você está oferecendo" })
    .max(120),
  observacoes: optionalText(500),
});

export type OfertaNovaInput = z.infer<typeof ofertaNovaSchema>;

/**
 * O que o dono confirma na hora de aceitar a oferta.
 *
 * Só nome, unidade e gaveta — o resto do cadastro (preço, marca, embalagem)
 * pertence à oferta e não ao produto. E os três são editáveis de propósito:
 * "AZEITE EXTRA VIRGEM ANDORINHA 500ML CX" é nome de catálogo de fornecedor,
 * não nome de prateleira desta casa.
 */
export const ofertaAutorizadaSchema = z.object({
  nome: ofertaNovaSchema.shape.nome,
  unit: productUnit,
  categoryId: categoryRef,
});

export type PrecoInput = z.infer<typeof precoSchema>;

/** Resposta completa do fornecedor — preços de todos os itens. */
export const cotacaoFornecedorRespostaSchema = z.object({
  precos: z.record(z.coerce.number().int(), precoSchema),
});

export type CotacaoFornecedorResposta = z.infer<typeof cotacaoFornecedorRespostaSchema>;

/**
 * Preço que o fornecedor exclusivo confirma para um item de pedido direto.
 *
 * Sem quantidade: quem decide quanto comprar é a casa, na contagem — o link
 * só pergunta quanto ele cobra. Preço zero é recusado pela mesma razão de
 * `precoSchema`: quem não tem o item deixa o campo em branco.
 */
export const precoPedidoDiretoSchema = z.object({
  precoUnitario: z.coerce
    .number({ error: "Preço inválido" })
    .positive({ error: "O preço precisa ser maior que zero" })
    .max(9999999),
  marca: optionalText(120),
  observacoes: optionalText(500),
});

export type PrecoPedidoDiretoInput = z.infer<typeof precoPedidoDiretoSchema>;

/**
 * O que chegou de fato, item a item do pedido.
 *
 * A chave é o id do PedidoCompraItem. Nulo é "ainda não conferi este" e não
 * mexe em nada; zero é resposta diferente, e quer dizer que o item não veio.
 *
 * O teto da quantidade é o mesmo da contagem de propósito. Esta quantidade é
 * somada ao estoque, e sem limite um dígito a mais digitado na conferência
 * infla a prateleira em silêncio — o número continua plausível na tela e só
 * a próxima contagem desmentiria, semanas depois.
 *
 * `precoUnitario` só existe aqui para o item que chegou sem preço
 * confirmado — pedido direto cujo fornecedor nunca respondeu o link. Nada
 * trava a conferência por causa disso: quem recebe digita o preço da nota
 * na hora, e o pedido segue.
 */
export const recebimentoSchema = z.object({
  itens: z
    .record(
      z.string().regex(/^\d+$/),
      z.union([
        z.null(),
        z.object({
          quantidade: z.coerce
            .number({ error: "Quantidade inválida" })
            .min(0, { error: "A quantidade recebida não pode ser negativa" })
            .max(999999, { error: "Quantidade recebida grande demais" }),
          precoUnitario: z.coerce
            .number({ error: "Preço inválido" })
            .positive({ error: "O preço precisa ser maior que zero" })
            .max(9999999)
            .optional(),
          /** O ✕ da conferência: por que veio menos (ou nada). */
          problema: z.enum(["FALTA", "DEVOLVIDO", "AVARIA"]).optional(),
        }),
      ]),
    )
    .refine((r) => Object.values(r).some((v) => v !== null), {
      error: "Informe o que chegou de ao menos um item",
    }),
  /** A conferência da bonificação combinada: veio (e quanto, se é mercadoria) ou não veio. */
  bonificacoes: z
    .record(
      z.string().regex(/^\d+$/),
      z.object({
        veio: z.boolean(),
        quantidade: z.coerce
          .number({ error: "Quantidade da bonificação inválida" })
          .positive({ error: "A quantidade da bonificação precisa ser maior que zero" })
          .max(999999, { error: "Quantidade da bonificação grande demais" })
          .optional(),
      }),
    )
    .default({}),
  /**
   * O que veio sem estar no pedido, incluído na conferência. Preço da nota
   * obrigatório (decisão do dono): sem ele o estoque entraria sem custo e a
   * divergência não diria quanto vale.
   */
  extras: z
    .array(
      z.object({
        produtoId: z.coerce.number().int().positive(),
        quantidade: z.coerce
          .number({ error: "Quantidade do item incluído inválida" })
          .positive({ error: "A quantidade do item incluído precisa ser maior que zero" })
          .max(999999, { error: "Quantidade do item incluído grande demais" }),
        preco: z.coerce
          .number({ error: "Informe o preço da nota do item incluído" })
          .positive({ error: "Informe o preço da nota do item incluído" })
          .max(9999999),
      }),
    )
    .max(100, { error: "Itens incluídos demais" })
    .default([]),
});

export type RecebimentoInput = z.infer<typeof recebimentoSchema>;

// ---------------------------------------------------------------------------
// Sistema — usuários e permissões
// ---------------------------------------------------------------------------

const roleEnum = z.enum(["DONO", "GERENTE", "CAIXA", "FINANCEIRO", "ESTOQUISTA"]);

/**
 * O login, não um e-mail.
 *
 * Sem espaço e sem maiúscula porque é o que a pessoa digita no formulário de
 * entrada, muitas vezes no celular, com o teclado corrigindo por conta
 * própria. Um login com espaço no meio é um login que ninguém acerta duas
 * vezes seguidas.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: "O usuário precisa ter pelo menos 3 caracteres" })
  .max(40, { error: "Usuário muito longo" })
  .regex(/^[a-z0-9._-]+$/, {
    error: "Use só letras, números, ponto, hífen ou sublinhado — sem espaço",
  });

/**
 * Senha nova.
 *
 * Mínimo de três caracteres, por decisão do dono. É painel interno de uma
 * casa pequena, e senha comprida demais vira papel colado no monitor — o
 * que protege menos que uma curta que a pessoa lembra.
 *
 * A exigência de misturar letras e números saiu junto: com três caracteres
 * ela não acrescenta força nenhuma, e só transformaria "123" num erro que
 * ninguém entende.
 *
 * O teto de 72 fica, e não é capricho: o bcrypt trunca em 72 bytes e ignora
 * o resto em silêncio. Sem o limite, quem digitasse uma frase longa teria
 * uma senha que só funciona pela metade, e entraria com um pedaço dela sem
 * nunca saber.
 */
export const passwordSchema = z
  .string()
  .min(3, { error: "A senha precisa ter pelo menos 3 caracteres" })
  .max(72, { error: "A senha pode ter no máximo 72 caracteres" });

const grantsField = z.array(
  z.object({
    moduleSlug: z.string().trim().min(1).max(40),
    canConfigure: z.boolean(),
  }),
).max(20);

/**
 * Conta nova já nasce com as permissões que a pessoa escolheu na tela.
 *
 * A lista vem do formulário, não do papel: o papel é o rótulo de quem a
 * pessoa é na casa, e quem decide o que ela alcança é quem está criando a
 * conta. Vazio é aceito — conta que ainda não abre nada é estado legítimo,
 * e a tela avisa antes de salvar.
 */
export const createUserSchema = z.object({
  username: usernameSchema,
  /** Como a pessoa se chama ("Maria Souza"). Vazio = a tela mostra o usuário. */
  name: optionalText(60).optional(),
  role: roleEnum,
  password: passwordSchema,
  grants: grantsField.default([]),
});

/**
 * O nome, o login e o papel.
 *
 * O login pode mudar: a sessão é presa ao id, e não a ele. A senha tem ação
 * própria. O nome é outra coisa:
 * é como a casa chama a pessoa, e muda (casou, errou a grafia, entrou
 * "joel" e é "Joel Silva"). Vazio volta a mostrar o usuário.
 *
 * O papel é opcional para a conta de superusuário, que muda só o nome.
 */
export const updateUserSchema = z.object({
  /** O login novo. Troca como a pessoa entra — a sessão aberta continua valendo. */
  username: usernameSchema.optional(),
  name: optionalText(60).optional(),
  role: roleEnum.optional(),
});

export const resetPasswordSchema = z.object({ password: passwordSchema });

const grantSchema = z.object({
  moduleSlug: z.string().trim().min(1).max(40),
  canConfigure: z.boolean(),
});

/** Uma linha por módulo, no máximo — nunca passa do tamanho de MODULES. */
export const userGrantsSchema = z.object({
  grants: z.array(grantSchema).max(20),
});

/**
 * O relatório de compras por e-mail. Os e-mails chegam como o texto da caixa
 * (um por linha) e são conferidos um a um: um endereço errado no meio da
 * lista faria o Resend recusar o envio inteiro na terça de manhã, sem
 * ninguém olhando.
 */
export const relatorioAgendadoSchema = z
  .object({
    ativo: z.boolean(),
    diaSemana: z.number().int().min(0).max(6),
    periodo: z.enum(["semana-passada", "7", "14", "mes-passado", "mes"]),
    emails: z.string().max(2000),
    celular: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const lista = lerEmails(v.emails);
    const errado = lista.find((e) => !emailValido(e));
    if (errado) ctx.addIssue({ code: "custom", message: `E-mail inválido: ${errado}`, path: ["emails"] });
    if (lista.length > 10) ctx.addIssue({ code: "custom", message: "No máximo 10 e-mails", path: ["emails"] });
    if (v.ativo && lista.length === 0 && !v.celular) {
      ctx.addIssue({ code: "custom", message: "Ligado sem e-mail e sem aviso nas Notificações, ele não chegaria a ninguém", path: ["emails"] });
    }
  })
  .transform((v) => ({ ...v, emails: lerEmails(v.emails).join("\n") }));

/**
 * Uma bonificação combinada. Mercadoria (unidades a mais, brinde) pede
 * produto e quantidade; dinheiro (desconto na nota, crédito) pede valor.
 * Os números chegam como o texto do campo, com vírgula.
 */
const numeroPositivo = (rotulo: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (lerNumeroBR(v) ?? Number.NaN)) : v),
    z
      .number({ error: `${rotulo}: digite um número` })
      .positive({ error: `${rotulo} tem que ser maior que zero` })
      .max(999999, { error: `${rotulo} grande demais` })
      .optional(),
  );

export const bonificacaoSchema = z
  .object({
    cotacaoId: z.number().int().positive().nullable(),
    pedidoCompraId: z.number().int().positive().nullable(),
    fornecedorId: z.number().int().positive().nullable(),
    tipo: z.enum(["UNIDADES", "BRINDE", "DESCONTO_NA_NOTA", "CREDITO"]),
    produtoId: z.number().int().positive().nullable(),
    quantidade: numeroPositivo("Quantidade"),
    valor: numeroPositivo("Valor"),
    nota: z
      .string()
      .trim()
      .max(300, { error: "A nota pode ter no máximo 300 caracteres" })
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if ((v.cotacaoId === null) === (v.pedidoCompraId === null)) {
      ctx.addIssue({ code: "custom", message: "A bonificação é da cotação ou do pedido.", path: ["pedidoCompraId"] });
    }
    if (v.cotacaoId !== null && v.fornecedorId === null) {
      ctx.addIssue({ code: "custom", message: "Falta o fornecedor.", path: ["fornecedorId"] });
    }
    const mercadoria = v.tipo === "UNIDADES" || v.tipo === "BRINDE";
    if (mercadoria && v.produtoId === null) ctx.addIssue({ code: "custom", message: "Escolha o produto.", path: ["produtoId"] });
    if (mercadoria && v.quantidade === undefined) ctx.addIssue({ code: "custom", message: "Digite a quantidade.", path: ["quantidade"] });
    if (!mercadoria && v.valor === undefined) ctx.addIssue({ code: "custom", message: "Digite o valor.", path: ["valor"] });
  });

// ---------------------------------------------------------------------------
// Departamento pessoal
// ---------------------------------------------------------------------------

/** Valor em reais digitado como a casa digita ("1.850,00", "120"). Vazio = nulo. */
const dinheiroOpcional = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = lerNumeroBR(v.replace(/^R\$\s*/i, ""));
      if (n === null || n < 0 || n > 999999) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: digite um valor, ex.: 1.850,00` });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    });

/**
 * O CPF confere quando os dois últimos dígitos batem com a conta dos nove
 * primeiros. Onze dígitos iguais passam na conta, mas não existem.
 */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Telefone que pode ficar vazio. Preenchido, vira E.164. */
const telefoneOpcional = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: digite com DDD, ex.: (51) 99999-9999` });
        return z.NEVER;
      }
      return e164;
    });

/** CPF que pode ficar vazio. Preenchido, guarda só os 11 dígitos. */
export const cpfOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    if (!cpfValido(v)) {
      ctx.addIssue({ code: "custom", message: "CPF não confere. Confira os números." });
      return z.NEVER;
    }
    return v.replace(/\D/g, "");
  });

/** Data de nascimento: vazia ou de alguém entre 14 e 100 anos. */
const nascimentoOpcional = z
  .union([dateString, z.literal("")])
  .transform((v) => v || null)
  .refine(
    (v) => {
      if (v === null) return true;
      const ano = Number(v.slice(0, 4));
      const agora = new Date().getFullYear();
      return ano >= agora - 100 && ano <= agora - 14;
    },
    { error: "Data de nascimento: confira o ano." },
  );

/** O que só a casa decide: tipo, equipe, função, como aparece na escala e os valores. */
const camposDaCasa = {
  apelido: textoOpcional(40, "O apelido pode ter no máximo 40 letras."),
  tipo: z.enum(["CLT", "FIXO", "FREELANCER"], { error: "Escolha CLT, fixo ou free lancer." }),
  area: z
    .enum(["COZINHA", "SALAO", ""])
    .transform((v) => (v === "" ? null : v)),
  /** O id da função cadastrada, como o select manda. Vazio = sem função. */
  funcaoId: z
    .string()
    .regex(/^\d*$/, { error: "Escolha a função da lista." })
    .transform((v) => (v === "" ? null : Number(v))),
  /** O dia em que começou na casa, em qualquer tipo. */
  comecouEm: z.union([dateString, z.literal("")]).transform((v) => v || null),
  /** Só CLT: o dia em que a carteira foi assinada. */
  admissao: z.union([dateString, z.literal("")]).transform((v) => v || null),
  salario: dinheiroOpcional("Salário"),
  diaria: dinheiroOpcional("Diária"),
};

/**
 * O que só vale para um jeito é apagado no outro: salário por mês no CLT e no
 * fixo, diária no free, carteira assinada só no CLT (o fixo é sem registro).
 */
function limparPeloTipo<
  T extends { tipo: "CLT" | "FIXO" | "FREELANCER"; diaria: number | null; admissao: string | null; salario: number | null },
>(v: T): T {
  if (v.tipo === "FREELANCER") return { ...v, admissao: null, salario: null };
  return { ...v, diaria: null, admissao: v.tipo === "CLT" ? v.admissao : null };
}

/** A carteira não é assinada antes do primeiro dia na casa. */
const datasEmOrdem: [(v: { comecouEm: string | null; admissao: string | null }) => boolean, { error: string; path: string[] }] = [
  (v) => !v.comecouEm || !v.admissao || v.admissao >= v.comecouEm,
  { error: "A carteira não pode ser assinada antes do dia em que começou.", path: ["admissao"] },
];

/** Uma data do formulário: "2026-10-11" ou vazio (nulo). */
const dataOpcionalDoForm = z.union([dateString, z.literal("")]).transform((v) => v || null);

/**
 * O colaborador como o formulário manda: tudo texto. O CPF é opcional no
 * envio: quem não configura o módulo não vê o campo, e sem ele o CPF que
 * estava no banco fica como estava.
 */
/** A empresa terceirizada (garçons de fora): um cadastro à parte do colaborador. */
export const terceirizadoSchema = z.object({
  nome: z.string().trim().min(2, { error: "Digite o nome da empresa." }).max(80, { error: "Nome muito longo." }),
  telefone: telefoneOpcional("Telefone"),
  valorPorPessoa: dinheiroOpcional("Valor por pessoa"),
  area: z.union([z.enum(["COZINHA", "SALAO"]), z.literal("")]).transform((v) => v || null),
  observacoes: textoOpcional(500, "As observações podem ter no máximo 500 letras."),
});
export type TerceirizadoInput = z.input<typeof terceirizadoSchema>;

export const colaboradorSchema = z
  .object({
    nome: z.string().trim().min(2, { error: "Digite o nome." }).max(80, { error: "Nome muito longo." }),
    telefone: telefoneOpcional("Telefone"),
    ativo: z.boolean(),
    /** Só vale desligado. Vazio = hoje. */
    desligadoEm: z.union([dateString, z.literal("")]).transform((v) => v || null),
    observacoes: textoOpcional(500, "As observações podem ter no máximo 500 letras."),
    cpf: cpfOpcional.optional(),
    nascimento: nascimentoOpcional,
    endereco: textoOpcional(200, "O endereço pode ter no máximo 200 letras."),
    emergenciaNome: textoOpcional(80, "O nome do contato de emergência pode ter no máximo 80 letras."),
    emergenciaTelefone: telefoneOpcional("Telefone de emergência"),
    /**
     * A diária do free em cada dia da semana, de domingo (0) a sábado (6),
     * quando é diferente da de sempre. Vazio = a de sempre. Sem o campo, o
     * que está no banco fica como está.
     */
    diariasPorDia: z.array(dinheiroOpcional("Diária do dia")).length(7).optional(),
    /** Os dias da semana (0 = domingo) em que trabalha. Vazio = sem dia marcado. Sem o campo, fica como está. */
    diasDeTrabalho: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .transform((dias) => [...new Set(dias)].sort((a, b) => a - b))
      .optional(),
    /** CLT: o último dia da experiência. Sem o campo, fica como está. */
    experienciaAte: dataOpcionalDoForm.optional(),
    /** O último ASO e até quando ele vale. */
    asoFeitoEm: dataOpcionalDoForm.optional(),
    asoValidoAte: dataOpcionalDoForm.optional(),
    manipulaAlimentos: z.boolean().optional(),
    /** CLT de jovem aprendiz e o fim do contrato dele. */
    aprendiz: z.boolean().optional(),
    contratoAte: dataOpcionalDoForm.optional(),
    /** Desligado: como saiu e por quê. Vazio = não informado. */
    motivoDesligamento: z
      .union([
        z.enum(["PEDIDO_DEMISSAO", "SEM_JUSTA_CAUSA", "JUSTA_CAUSA", "FIM_EXPERIENCIA", "FIM_CONTRATO", "ACORDO", "ABANDONO", "OUTRO"]),
        z.literal(""),
      ])
      .transform((v) => v || null)
      .optional(),
    razaoDesligamento: textoOpcional(40, "O motivo pode ter no máximo 40 letras.").optional(),
    detalheDesligamento: textoOpcional(300, "O detalhe do desligamento pode ter no máximo 300 letras.").optional(),
    ...camposDaCasa,
  })
  .transform(limparPeloTipo)
  .refine(...datasEmOrdem)
  .refine((v) => !v.experienciaAte || !v.admissao || v.experienciaAte > v.admissao, {
    error: "A experiência termina depois da carteira assinada.",
    path: ["experienciaAte"],
  })
  .refine((v) => !v.contratoAte || !v.admissao || v.contratoAte > v.admissao, {
    error: "O contrato termina depois da carteira assinada.",
    path: ["contratoAte"],
  })
  .refine((v) => !v.asoValidoAte || !v.asoFeitoEm || v.asoValidoAte >= v.asoFeitoEm, {
    error: "O ASO não pode valer até antes do dia em que foi feito.",
    path: ["asoValidoAte"],
  });

export type ColaboradorInput = z.input<typeof colaboradorSchema>;

/**
 * O que a própria pessoa preenche pelo link. Nome, telefone e CPF são
 * obrigatórios: sem eles o cadastro não serve para contratar.
 */
export const cadastroPeloLinkSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(5, { error: "Digite o nome completo." })
    .max(80, { error: "Nome muito longo." }),
  telefone: z
    .string()
    .trim()
    .min(1, { error: "Digite o seu telefone." })
    .transform((v, ctx) => {
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Telefone: digite com DDD, ex.: (51) 99999-9999" });
        return z.NEVER;
      }
      return e164;
    }),
  cpf: z
    .string()
    .trim()
    .min(1, { error: "Digite o seu CPF." })
    .pipe(cpfOpcional),
  nascimento: nascimentoOpcional,
  endereco: textoOpcional(200, "O endereço pode ter no máximo 200 letras."),
  emergenciaNome: textoOpcional(80, "O nome do contato de emergência pode ter no máximo 80 letras."),
  emergenciaTelefone: telefoneOpcional("Telefone de emergência"),
});

export type CadastroPeloLinkInput = z.input<typeof cadastroPeloLinkSchema>;

/**
 * Quem já é da equipe atualizando o próprio cadastro pelo link. O mesmo
 * formulário, mas o CPF pode vir em branco: a página é pública e não mostra
 * o CPF guardado, então em branco ele fica como está.
 */
export const atualizacaoPeloLinkSchema = cadastroPeloLinkSchema.extend({ cpf: cpfOpcional });

export type AtualizacaoPeloLink = z.output<typeof atualizacaoPeloLinkSchema>;

/** O que a casa completa ao aprovar um cadastro que veio pelo link. */
export const aprovacaoSchema = z.object(camposDaCasa).transform(limparPeloTipo).refine(...datasEmOrdem);

export type AprovacaoInput = z.input<typeof aprovacaoSchema>;

/** O nome de uma função: "Garçom", "Auxiliar de cozinha". */
export const nomeDeFuncao = z
  .string()
  .trim()
  .min(2, { error: "Digite o nome da função." })
  .max(60, { error: "A função pode ter no máximo 60 letras." });

/**
 * Um encargo ou benefício como o formulário manda. O valor é % na forma
 * "% do salário" e R$ nas outras. O % não vale para o free (ele não tem
 * salário), então o tipo sai da lista nesse caso.
 */
export const itemDeCustoSchema = z
  .object({
    nome: z.string().trim().min(2, { error: "Digite o nome." }).max(60, { error: "Nome muito longo." }),
    natureza: z.enum(["ENCARGO", "BENEFICIO", "DESCONTO"], { error: "Escolha encargo, benefício ou desconto." }),
    forma: z.enum(["PERCENTUAL_SALARIO", "POR_MES", "POR_DIA"], { error: "Escolha a forma." }),
    valor: z.string().trim(),
    tipos: z.array(z.enum(["CLT", "FIXO", "FREELANCER"])),
  })
  .transform((v, ctx) => {
    const n = lerNumeroBR(v.valor.replace(/^R\$\s*/i, "").replace("%", "").trim());
    const pct = v.forma === "PERCENTUAL_SALARIO";
    if (n === null || n <= 0 || n > (pct ? 100 : 99999)) {
      ctx.addIssue({ code: "custom", message: pct ? "Valor: digite um % entre 0 e 100, ex.: 8,33" : "Valor: digite em reais, ex.: 12,00" });
      return z.NEVER;
    }
    const tipos = [...new Set(v.tipos)].filter((t) => !(pct && t === "FREELANCER"));
    return { ...v, valor: Math.round(n * 100) / 100, tipos };
  });

export type ItemDeCustoInput = z.input<typeof itemDeCustoSchema>;

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/** Um número digitado como a casa digita ("1.850,50", "6"), dentro de um intervalo. Vazio vira `vazio`. */
const numeroBR = (rotulo: string, opcoes: { min: number; max: number; vazio?: number | null; exemplo: string; casas?: number }) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "" && opcoes.vazio !== undefined) return opcoes.vazio;
      const n = lerNumeroBR(v.replace(/^R\$\s*/i, "").replace("%", "").trim());
      if (n === null || n < opcoes.min || n > opcoes.max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: digite um número, ex.: ${opcoes.exemplo}` });
        return z.NEVER;
      }
      const fator = 10 ** (opcoes.casas ?? 2);
      return Math.round(n * fator) / fator;
    });

const dinheiro = (rotulo: string, vazio?: number | null) =>
  numeroBR(rotulo, { min: 0, max: 9999999, vazio, exemplo: "120,00" }) as z.ZodType<number, string>;
const percentual = (rotulo: string) =>
  numeroBR(rotulo, { min: 0, max: 100, exemplo: "10" }) as z.ZodType<number, string>;
const dataOpcional = z.union([dateString, z.literal("")]).transform((v) => v || null);
const horaOpcional = z.union([timeString, z.literal("")]).transform((v) => v || null);

/** CPF (11) ou CNPJ (14), só os dígitos. Vazio vale. */
const documentoOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const d = v.replace(/\D/g, "");
    if (d === "") return null;
    if (d.length !== 11 && d.length !== 14) {
      ctx.addIssue({ code: "custom", message: "CPF tem 11 números e CNPJ tem 14. Confira." });
      return z.NEVER;
    }
    if (d.length === 11 && !cpfValido(d)) {
      ctx.addIssue({ code: "custom", message: "CPF não confere. Confira os números." });
      return z.NEVER;
    }
    return d;
  });

const emailOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    if (!emailValido(v)) {
      ctx.addIssue({ code: "custom", message: "E-mail: confira o endereço." });
      return z.NEVER;
    }
    return v.toLowerCase();
  });

export const clienteEventoSchema = z.object({
  nome: z.string().trim().min(2, { error: "Digite o nome do cliente." }).max(100, { error: "Nome muito longo." }),
  tipo: z.enum(["PESSOA", "EMPRESA"]),
  documento: documentoOpcional,
  telefone: telefoneOpcional("Telefone"),
  email: emailOpcional,
  origem: z
    .enum(["INSTAGRAM", "WHATSAPP", "INDICACAO", "CLIENTE_DO_ALMOCO", "PASSOU_NA_FRENTE", "SITE", "OUTRO", ""])
    .transform((v) => (v === "" ? null : v)),
  observacoes: textoOpcional(1000, "As observações podem ter no máximo 1000 letras."),
  proximoContato: dataOpcional,
});

export type ClienteEventoInput = z.input<typeof clienteEventoSchema>;

export const interacaoSchema = z.object({
  tipo: z.enum(["LIGACAO", "WHATSAPP", "EMAIL", "VISITA", "REUNIAO", "NOTA"]),
  texto: z.string().trim().min(2, { error: "Escreva o que foi conversado." }).max(2000, { error: "Texto muito longo." }),
  /** O próximo contato, se a conversa marcou um. Vazio deixa como estava. */
  proximoContato: dataOpcional,
});

export type InteracaoInput = z.input<typeof interacaoSchema>;

export const cardapioSchema = z.object({
  nome: z.string().trim().min(2, { error: "Digite o nome do cardápio." }).max(100, { error: "Nome muito longo." }),
  descricao: textoOpcional(2000, "A descrição pode ter no máximo 2000 letras."),
  precoPorPessoa: dinheiro("Preço por pessoa", null) as z.ZodType<number | null, string>,
});

export type CardapioInput = z.input<typeof cardapioSchema>;

export const porcoesPorPessoa = numeroBR("Porções por pessoa", { min: 0.01, max: 100, exemplo: "1 ou 0,5" }) as z.ZodType<number, string>;

export const eventoSchema = z.object({
  titulo: z.string().trim().min(3, { error: "Dê um nome ao evento, ex.: Aniversário da Ana." }).max(120, { error: "Nome muito longo." }),
  tipo: z.enum(["ANIVERSARIO", "CASAMENTO", "CORPORATIVO", "FORMATURA", "CONFRATERNIZACAO", "RELIGIOSO", "OUTRO"]),
  data: dateString,
  horaInicio: horaOpcional,
  horaFim: horaOpcional,
  convidados: z.coerce
    .number({ error: "Convidados: digite um número." })
    .int({ error: "Convidados: digite um número inteiro." })
    .min(1, { error: "Convidados: pelo menos 1." })
    .max(5000, { error: "Convidados: confira o número." }),
  formato: z.enum(["SENTADO", "EM_PE"]),
  taxaServicoPct: percentual("Taxa de serviço"),
  impostoPct: percentual("Imposto"),
  observacoesCliente: textoOpcional(3000, "O texto para o cliente pode ter no máximo 3000 letras."),
  observacoesInternas: textoOpcional(3000, "As anotações internas podem ter no máximo 3000 letras."),
});

export type EventoInput = z.input<typeof eventoSchema>;

/** O orçamento novo: o cliente existente (id) ou um cliente criado ali mesmo (nome e telefone). */
export const novoEventoSchema = z
  .object({
    clienteId: z.string(),
    clienteNome: z.string().trim().max(100),
    clienteTelefone: telefoneOpcional("Telefone do cliente"),
    titulo: eventoSchema.shape.titulo,
    tipo: eventoSchema.shape.tipo,
    data: dateString,
    horaInicio: horaOpcional,
    horaFim: horaOpcional,
    convidados: eventoSchema.shape.convidados,
    formato: eventoSchema.shape.formato,
    cardapioId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.clienteId === "" && v.clienteNome.length < 2)
      ctx.addIssue({ code: "custom", message: "Escolha um cliente ou digite o nome de um novo." });
  });

export type NovoEventoInput = z.input<typeof novoEventoSchema>;

export const linhaDoEventoSchema = z.object({
  categoria: z.enum(["ESPACO", "CARDAPIO", "BEBIDA", "EQUIPE", "DECORACAO", "TERCEIRO", "CUSTO_INTERNO", "OUTRO"]),
  descricao: z.string().trim().min(2, { error: "Descreva o item." }).max(160, { error: "Descrição muito longa." }),
  quantidade: numeroBR("Quantidade", { min: 0.01, max: 100000, exemplo: "30" }) as z.ZodType<number, string>,
  unidade: z.string().trim().min(1, { error: "Diga a unidade, ex.: pessoa." }).max(20),
  custoUnitario: dinheiro("Custo", 0),
  precoUnitario: dinheiro("Preço", 0),
});

export type LinhaDoEventoInput = z.input<typeof linhaDoEventoSchema>;

export const pagamentoSchema = z.object({
  valor: numeroBR("Valor", { min: 0.01, max: 9999999, exemplo: "500,00" }) as z.ZodType<number, string>,
  data: dateString,
  forma: textoOpcional(40, "A forma pode ter no máximo 40 letras."),
  descricao: textoOpcional(80, "A descrição pode ter no máximo 80 letras."),
});

export type PagamentoInput = z.input<typeof pagamentoSchema>;

export const tarefaDoEventoSchema = z.object({
  texto: z.string().trim().min(2, { error: "Escreva a tarefa." }).max(160, { error: "Tarefa muito longa." }),
  etapa: z.enum(["ANTES", "NO_DIA", "DEPOIS"]),
  prazo: dataOpcional,
  responsavel: textoOpcional(60, "O responsável pode ter no máximo 60 letras."),
});

export type TarefaDoEventoInput = z.input<typeof tarefaDoEventoSchema>;

export const itemDeModeloSchema = z.object({
  texto: tarefaDoEventoSchema.shape.texto,
  etapa: tarefaDoEventoSchema.shape.etapa,
  /** Dias em relação ao evento: "-7", "0", "2". Vazio = sem prazo. */
  dias: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace("−", "-"));
      if (!Number.isInteger(n) || n < -365 || n > 365) {
        ctx.addIssue({ code: "custom", message: "Dias: um número inteiro, ex.: -7 para uma semana antes." });
        return z.NEVER;
      }
      return n;
    }),
});

export type ItemDeModeloInput = z.input<typeof itemDeModeloSchema>;

export const configuracaoEventosSchema = z.object({
  margemAlvoPct: percentual("Margem alvo"),
  impostoPct: percentual("Imposto"),
  taxaServicoPct: percentual("Taxa de serviço"),
  sinalPct: percentual("Sinal"),
  validadeDias: z.coerce
    .number({ error: "Validade: digite os dias." })
    .int({ error: "Validade: um número inteiro de dias." })
    .min(1, { error: "Validade: pelo menos 1 dia." })
    .max(180, { error: "Validade: no máximo 180 dias." }),
  capacidadeSentados: z.coerce
    .number({ error: "Lugares sentados: digite um número." })
    .int({ error: "Lugares sentados: número inteiro." })
    .min(1, { error: "Lugares sentados: pelo menos 1." })
    .max(5000),
  capacidadeEmPe: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5000) {
        ctx.addIssue({ code: "custom", message: "Lotação em pé: um número inteiro, ou deixe vazio." });
        return z.NEVER;
      }
      return n;
    }),
  valorLocacao: dinheiro("Valor da locação", null) as z.ZodType<number | null, string>,
  condicoes: textoOpcional(3000, "As condições podem ter no máximo 3000 letras."),
});

export type ConfiguracaoEventosInput = z.input<typeof configuracaoEventosSchema>;

// ---------------------------------------------------------------------------
// Módulo Tarefas
// ---------------------------------------------------------------------------

/**
 * O teto de 250 é o do PRD (RN-001), e existe por um motivo prático: o título
 * é o que aparece no cartão do kanban e na lista do celular. Acima disso não é
 * título, é descrição — e o campo de descrição está logo abaixo.
 */
const tituloTarefa = z
  .string()
  .trim()
  .min(1, { error: "Escreva o que precisa ser feito" })
  .max(250, { error: "Título longo demais — o resto cabe na descrição" });

const prioridadeEnum = z.enum(["NENHUMA", "BAIXA", "MEDIA", "ALTA"]);

/**
 * Data de calendário vinda do campo do navegador, ou nada.
 *
 * Só o formato que `<input type="date">` manda. Qualquer outra coisa chegou
 * por caminho que não é a tela, e data inválida vira `Invalid Date`, que o
 * Prisma grava como nulo sem reclamar — é a mesma guarda de
 * `definirEntregaPrevista`, em lib/actions/pedido.ts.
 */
const diaOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
  .nullable()
  .optional();

export const criarProjetoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, { error: "Dê um nome ao quadro" })
    .max(60, { error: "Nome longo demais" }),
  descricao: z.string().trim().max(2000).nullable().optional(),
  setorId: z.number().int().positive().nullable().optional(),
  privado: z.boolean().default(false),
});

export const criarTarefaSchema = z.object({
  projetoId: z.number().int().positive(),
  colunaId: z.number().int().positive(),
  titulo: tituloTarefa,
  responsavelId: z.number().int().positive().nullable().optional(),
  prioridade: prioridadeEnum.default("NENHUMA"),
  prazo: diaOpcional,
});

export const atualizarTarefaSchema = z.object({
  titulo: tituloTarefa.optional(),
  descricao: z.string().trim().max(20000).nullable().optional(),
  prioridade: prioridadeEnum.optional(),
  responsavelId: z.number().int().positive().nullable().optional(),
  prazo: diaOpcional,
  documentoUrl: z
    .string()
    .trim()
    .url({ error: "Cole o endereço completo, começando com https://" })
    .max(2000)
    .nullable()
    .optional(),
});

/**
 * O que a máquina de estados pode exigir no meio de um movimento.
 *
 * Vem junto do próprio movimento, e não como um salvar em separado antes:
 * mover para AGUARDANDO sem dizer o que se espera é o buraco que o N07 fecha,
 * e deixar gravar o campo numa ação e mover em outra reabriria o buraco pela
 * metade — o cartão ficaria com previsão e sem movimento, ou o contrário.
 */
export const moverTarefaSchema = z.object({
  colunaDestinoId: z.number().int().positive(),
  responsavelId: z.number().int().positive().nullable().optional(),
  aguardandoDescricao: z
    .string()
    .trim()
    .min(1, { error: "Diga o que está esperando" })
    .max(500)
    .nullable()
    .optional(),
  aguardandoPrevisao: diaOpcional,
  documentoUrl: z.string().trim().url().max(2000).nullable().optional(),
});

export const cancelarTarefaSchema = z.object({
  motivo: z.enum([
    "DUPLICADA",
    "NAO_E_MAIS_NECESSARIA",
    "FORA_DO_ESCOPO",
    "SEM_RECURSOS",
    "OUTRO",
  ]),
  texto: z.string().trim().max(500).nullable().optional(),
});

export const comentarioSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, { error: "Escreva alguma coisa" })
    .max(5000, { error: "Comentário longo demais" }),
});

export const membroProjetoSchema = z.object({
  userId: z.number().int().positive(),
  papel: z.enum(["GESTOR", "EDITOR", "EXECUTOR", "LEITOR"]),
});

/** Subtarefa nasce só com o título; o resto se ajusta no detalhe dela. */
export const subtarefaSchema = z.object({
  titulo: tituloTarefa,
});

/** Nulo solta a tarefa do pai e ela volta a ser cartão do quadro. */
export const vincularPaiSchema = z.object({
  paiId: z.number().int().positive().nullable(),
});

/**
 * O teto é o da coluna (30). Etiqueta é rótulo de uma ou duas palavras; o que
 * passa disso é descrição. A recusa de nome de pessoa (RN-020) é na ação, que
 * conhece a equipe.
 */
export const etiquetaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, { error: "Escreva a etiqueta" })
    .max(30, { error: "Etiqueta de até 30 letras" }),
});

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

/** "2026-10". */
const mesString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido" });
const idObrigatorio = (erro: string) => z.number({ error: erro }).int().positive({ error: erro });
const idOpcional = z.number().int().positive().nullable();
const valorPositivo = (rotulo: string) =>
  numeroBR(rotulo, { min: 0.01, max: 9999999, exemplo: "120,00" }) as z.ZodType<number, string>;
const inteiroEntre = (rotulo: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = Number(v);
      if (v === "" || !Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: um número inteiro de ${min} a ${max}.` });
        return z.NEVER;
      }
      return n;
    });

const tipoLancamento = z.enum(["PAGAR", "RECEBER"]);
/** "1.1.1.02", "3101": o código como o escritório escreve. Vazio vale. */
const codigoContabil = z
  .string()
  .trim()
  .max(20, { error: "O código contábil pode ter no máximo 20 caracteres." })
  .regex(/^[0-9A-Za-z.\-/]*$/, { error: "O código contábil leva só números, letras, ponto e traço." })
  .transform((v) => v || null);

export const contaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome à conta." }).max(40, { error: "Nome muito longo." }),
  tipo: z.enum(["CAIXA", "BANCO", "CARTEIRA"]),
  /** Pode ser negativo: conta no cheque especial. */
  saldoInicial: numeroBR("Saldo inicial", { min: -9999999, max: 9999999, vazio: 0, exemplo: "1.500,00" }) as z.ZodType<number, string>,
  saldoInicialEm: dateString,
  codigoContabil,
});
export type ContaFinanceiraInput = z.input<typeof contaFinanceiraSchema>;

/** Os grupos da DRE, na ordem do relatório (o primeiro nível do plano de contas). */
const grupoDre = z.enum([
  "RECEITA_VENDAS",
  "OUTRAS_RECEITAS",
  "TAXA_SERVICO",
  "IMPOSTOS",
  "TAXAS_E_APPS",
  "CMV",
  "PESSOAL",
  "OCUPACAO",
  "OPERACIONAL",
  "ADMINISTRATIVO",
  "MARKETING",
  "FINANCEIRO",
  "FORA_DO_RESULTADO",
]);

/** O segundo nível: o grupo só se escolhe ao criar (ver `salvarSubgrupo`). */
export const subgrupoFinanceiroSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome ao subgrupo." }).max(60, { error: "Nome muito longo." }),
  grupo: grupoDre,
});
export type SubgrupoFinanceiroInput = z.input<typeof subgrupoFinanceiroSchema>;

/**
 * O terceiro nível. O grupo da DRE vem do subgrupo; a natureza (receita ou
 * despesa) é conferida contra o grupo na ação, que sabe qual é.
 */
export const categoriaFinanceiraSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome à categoria." }).max(60, { error: "Nome muito longo." }),
  tipo: tipoLancamento,
  subgrupoId: idObrigatorio("Escolha o subgrupo."),
  codigoContabil,
  centroPadraoId: idOpcional,
});
export type CategoriaFinanceiraInput = z.input<typeof categoriaFinanceiraSchema>;

export const formaRecebimentoSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome à forma." }).max(40, { error: "Nome muito longo." }),
  tipo: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO", "VOUCHER", "OUTRO"]),
  taxaPct: percentual("Taxa"),
  prazoDias: inteiroEntre("Prazo", 0, 120),
  contaId: idObrigatorio("Escolha em que conta o dinheiro cai."),
});
export type FormaRecebimentoInput = z.input<typeof formaRecebimentoSchema>;

export const lancamentoSchema = z.object({
  tipo: tipoLancamento,
  descricao: z.string().trim().min(2, { error: "Descreva o lançamento." }).max(120, { error: "Descrição muito longa." }),
  categoriaId: idObrigatorio("Escolha a categoria."),
  contaId: idOpcional,
  fornecedorId: idOpcional,
  centroCustoId: idOpcional,
  valor: valorPositivo("Valor"),
  vencimento: dateString,
  competencia: mesString,
  documento: textoOpcional(60, "O documento pode ter no máximo 60 letras."),
  observacao: textoOpcional(1000, "A observação pode ter no máximo 1000 letras."),
  /** Só na criação: 1 = à vista. */
  parcelas: inteiroEntre("Parcelas", 1, 60),
});
export type LancamentoInput = z.input<typeof lancamentoSchema>;

export const baixaSchema = z.object({
  pagoEm: dateString,
  contaId: idObrigatorio("Escolha a conta."),
  jurosMulta: dinheiro("Juros e multa", 0),
  desconto: dinheiro("Desconto", 0),
});
export type BaixaInput = z.input<typeof baixaSchema>;

export const recorrenciaSchema = z
  .object({
    tipo: tipoLancamento,
    descricao: lancamentoSchema.shape.descricao,
    categoriaId: idObrigatorio("Escolha a categoria."),
    contaId: idOpcional,
    fornecedorId: idOpcional,
    centroCustoId: idOpcional,
    valor: valorPositivo("Valor"),
    diaVencimento: inteiroEntre("Dia do vencimento", 1, 31),
    inicio: mesString,
    fim: z.union([mesString, z.literal("")]).transform((v) => v || null),
  })
  .refine((v) => v.fim === null || v.fim >= v.inicio, { error: "O último mês vem depois do primeiro." });
export type RecorrenciaInput = z.input<typeof recorrenciaSchema>;

export const fechamentoSchema = z.object({
  data: dateString,
  taxaServico: dinheiro("Taxa de serviço", 0),
  observacao: textoOpcional(1000, "A observação pode ter no máximo 1000 letras."),
  itens: z
    .array(z.object({ formaId: idObrigatorio("Forma inválida."), valor: dinheiro("Valor", 0) }))
    .max(40),
});
export type FechamentoInput = z.input<typeof fechamentoSchema>;

export const transferenciaSchema = z
  .object({
    origemId: idObrigatorio("Escolha de onde sai."),
    destinoId: idObrigatorio("Escolha para onde vai."),
    valor: valorPositivo("Valor"),
    data: dateString,
    observacao: textoOpcional(120, "A observação pode ter no máximo 120 letras."),
  })
  .refine((v) => v.origemId !== v.destinoId, { error: "Origem e destino são a mesma conta." });
export type TransferenciaInput = z.input<typeof transferenciaSchema>;

export const centroCustoSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome ao centro." }).max(40, { error: "Nome muito longo." }),
});
export type CentroCustoInput = z.input<typeof centroCustoSchema>;

/** O extrato como o navegador leu do OFX (`lib/ofx.ts`). */
export const extratoImportadoSchema = z.object({
  arquivo: z.string().trim().min(1).max(160),
  conta: z.string().trim().max(40).nullable(),
  de: dateString.nullable(),
  ate: dateString.nullable(),
  saldoFinal: z.number().finite().nullable(),
  saldoEm: dateString.nullable(),
  transacoes: z
    .array(
      z.object({
        chave: z.string().min(1).max(200),
        data: dateString,
        valor: z.number().finite().refine((n) => n !== 0 && Math.abs(n) < 100_000_000, { error: "Valor inválido no extrato." }),
        descricao: z.string().max(200),
      }),
    )
    .min(1, { error: "O extrato não tem transações." })
    .max(5000, { error: "Extrato grande demais: importe um mês por vez." }),
});
export type ExtratoImportadoInput = z.input<typeof extratoImportadoSchema>;

export const lancamentoDaLinhaSchema = z.object({
  descricao: z.string().trim().min(2, { error: "Descreva o lançamento." }).max(120, { error: "Descrição muito longa." }),
  categoriaId: z.number({ error: "Escolha a categoria." }).int().positive({ error: "Escolha a categoria." }),
  centroCustoId: z.number().int().positive().nullable(),
});
export type LancamentoDaLinhaInput = z.input<typeof lancamentoDaLinhaSchema>;

// ---------------------------------------------------------------------------
// Cardápio buffet
// ---------------------------------------------------------------------------

const opcionalCurto = (max: number) => z.string().trim().max(max, { error: `Use no máximo ${max} caracteres.` }).transform((v) => v || null);

export const pratoBuffetSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome ao prato." }).max(100, { error: "Nome muito longo." }),
  grupoId: z.number({ error: "Escolha o grupo." }).int().positive({ error: "Escolha o grupo." }),
  categoria: opcionalCurto(40),
  /** Vazio: a ficha ainda não deu o custo. */
  custoKg: numeroBR("Custo por kg", { min: 0, max: 99999, vazio: null, exemplo: "18,50", casas: 4 }) as z.ZodType<number | null, string>,
  codFicha: opcionalCurto(20),
  alertaCusto: opcionalCurto(500),
  viabilidade: z.enum(["TOTAL", "PARCIAL", "NAO_RECOMENDADO", "NAO_APLICAVEL"]).nullable(),
  modo: opcionalCurto(60),
  temperatura: opcionalCurto(30),
  umidade: opcionalCurto(30),
  tempo: opcionalCurto(40),
  sonda: opcionalCurto(20),
  posto: z.enum(["FORNO_COMBINADO", "COMBINADO_APOIO", "FOGAO_FRITADEIRA", "PRACA_FRIA"]).nullable(),
  carga: z.enum(["DEFUMACAO", "NOTURNO", "VAPOR", "BRASEADO", "MEDIO", "ASSADO", "AR_SECO", "SEM_FORNO"]).nullable(),
  janela: z.enum(["D1_VESPERA", "D1_NOITE", "J1", "J2", "J3", "J4_SERVICO", "J5_POS_SERVICO"]).nullable(),
  ajuste: opcionalCurto(1000),
  corForno: z.enum(["VERDE", "AZUL", "NENHUMA"]),
  defumar: z.boolean(),
  processoD1: opcionalCurto(200),
});
export type PratoBuffetInput = z.input<typeof pratoBuffetSchema>;

export const grupoBuffetSchema = z.object({
  nome: z.string().trim().min(2, { error: "Dê um nome ao grupo." }).max(40, { error: "Nome muito longo." }),
  cor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, { error: "A cor é um código como #22b14c." }),
  posicoes: z.number().int().min(1, { error: "O grupo precisa de pelo menos 1 posição." }).max(60, { error: "No máximo 60 posições." }),
  metaCustoKg: numeroBR("Meta de custo/kg", { min: 0, max: 99999, vazio: null, exemplo: "18,00" }) as z.ZodType<number | null, string>,
});
export type GrupoBuffetInput = z.input<typeof grupoBuffetSchema>;

export const cardapioBuffetSchema = z
  .object({
    nome: z.string().trim().min(2, { error: "Dê um nome ao cardápio." }).max(60, { error: "Nome muito longo." }),
    inicio: dateString,
    fim: dateString,
    temas: z.array(z.string().trim().max(40, { error: "Tema muito longo." })).length(7),
  })
  .refine((v) => v.fim >= v.inicio, { error: "O fim vem depois do início." });
export type CardapioBuffetInput = z.input<typeof cardapioBuffetSchema>;

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Hora no formato 07:30." });
export const configuracaoBuffetSchema = z.object({
  limiteClasseA: percentual("Classe A"),
  limiteClasseB: percentual("Classe B"),
  inicioTurno: hora,
  aberturaBuffet: hora,
  encerramentoBuffet: hora,
  fimTurno: hora,
  inicioVespera: hora,
  fornos: z.number().int().min(0).max(20),
  gnPorForno: z.number().int().min(1).max(40),
  cozinheiros: z.number().int().min(0).max(50),
  cicloDefumacaoHoras: z.number().int().min(0).max(24),
  cicloLimpezaMin: z.number().int().min(0).max(240),
});
export type ConfiguracaoBuffetInput = z.input<typeof configuracaoBuffetSchema>;

export const trocaBuffetSchema = z.object({
  data: dateString,
  grupoId: z.number().int().positive(),
  posicao: z.number().int().min(1, { error: "Posição inválida." }),
  /** Nulo: a posição fica sem prato só nesse dia. */
  pratoId: z.number().int().positive().nullable(),
  motivo: opcionalCurto(200),
});
export type TrocaBuffetInput = z.input<typeof trocaBuffetSchema>;

const quilos = (rotulo: string) =>
  numeroBR(rotulo, { min: 0, max: 9999, vazio: null, exemplo: "12,5", casas: 3 }) as z.ZodType<number | null, string>;
export const pesoBuffetSchema = z
  .object({
    data: dateString,
    grupoId: z.number().int().positive(),
    posicao: z.number().int().min(1),
    /** Vazio nos dois apaga o lançamento. */
    kgProduzido: quilos("Kg feito"),
    kgSobra: quilos("Sobra"),
  })
  .refine((v) => v.kgProduzido !== null || v.kgSobra === null, { error: "Lance o kg feito antes da sobra." })
  .refine((v) => v.kgSobra === null || v.kgProduzido === null || v.kgSobra <= v.kgProduzido, {
    error: "A sobra não pode passar do que foi feito.",
  });
export type PesoBuffetInput = z.input<typeof pesoBuffetSchema>;
