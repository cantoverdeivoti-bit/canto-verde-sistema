---
name: Canto Verde
description: "Sistema de reservas do Canto Verde, restaurante em Ivoti/RS. Letreiro esmaltado: verde-mata, trigo, branco e terra."
sourceUrl: "app/globals.css"

colors:
  vinho: "#2f4a2b"
  dourado: "#eab142"
  ocre: "#8a6410"
  preto: "#0e1217"
  branco: "#ffffff"
  superficie: "#faf8f5"
  linha: "#e4ded7"
  texto-apoio: "#5f5a58"
  vinho-claro: "#edf2ea"
  alarme: "#a8202f"
  alarme-fundo: "#fbe9ea"


typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.45rem, 5.6vw, 2.05rem)"
    fontWeight: 640
    lineHeight: 1.3
    letterSpacing: "-0.02em"
    fontVariation: "wdth 118, wght 640"
  display-compact:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 3.6vw, 1.25rem)"
    fontWeight: 640
    lineHeight: 1.5
    fontVariation: "wdth 118, wght 640"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.22em"
    textTransform: "uppercase"
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontWeight: 500
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"

rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"

spacing:
  base: "4px"
  scale: ["4px", "8px", "12px", "16px", "20px", "24px", "32px", "40px", "56px"]

components:
  button-primary:
    backgroundColor: "{colors.vinho}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.md}"
    padding: "14px 20px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.preto}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  chip:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.preto}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  chip-selected:
    backgroundColor: "{colors.vinho}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.md}"
  field:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.preto}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.lg}"
---

# Design System: Canto Verde

> **Duas paletas desde 02/10.** O que está abaixo vale para a **página pública
> de reservas** (o que o cliente vê). O **painel** — `/admin`, atalhos e os
> links do estoquista e do fornecedor — usa a paleta da Stone, a pedido do
> dono: topo verde-escuro `#00461E`, fundo cinza `#E7EAE9`, cartões brancos,
> botão cheio em limão `#00D700` com texto verde-escuro, e texto/ícone/link em
> verde `#186618`. Os valores e as razões moram em `app/globals.css`
> (`:root:has(.tema-painel)` e `.faixa-escura`). Regra que não muda: o limão
> só enche botão; como texto sobre claro ele dá 1.9:1.

## Overview

**Creative North Star: "O Letreiro Esmaltado"**

A casa tem quatro cores e elas vêm de fachada: preto, dourado, branco e
vinho. O sistema se comporta como sinalização — pouca coisa por tela, grande,
legível de relance por quem está com pressa. O dono lê a agenda andando pelo
salão; o cliente reserva no ônibus. Nenhum dos dois tem tempo de decifrar.

A tipografia é uma família só, esticada. O Archivo tem eixo de largura até
125, então o display não é outra fonte: é a mesma letra da interface aberta
até virar placa. Isso mantém a tela coesa e evita a serifada de vitrine que
não pertence a uma casa de almoço. Os números — horário, lugares, telefone —
saem em mono, alinham em coluna sem tabela e leem como comanda, que é de onde
vieram.

A superfície é plana. Não há sombra em lugar nenhum: profundidade vem de
linha fina e de troca de fundo, nunca de elevação simulada. A única exceção é
um sublinhado interno que marca o que está ativo, e ele é traço, não sombra.

Um tema só, claro. O painel é usado em serviço, num balcão de dia, e a página
pública precisa ser a mesma coisa que o dono vê quando confere.

**Key Characteristics:**
- Quatro cores, cada uma com um papel; nada mais tem cor
- Uma família de texto esticada no eixo de largura, mais um mono só para números
- Superfície plana: linha e fundo, nunca sombra
- Um ponto de identidade forte por tela; o resto em silêncio
- Contraste medido, não estimado: todo par de texto passa AA

## Colors

Quatro cores de fachada e os neutros que as sustentam. A regra que organiza
tudo veio de medição, não de gosto: o dourado dá 1.93:1 sobre branco.

### Primary
- **Vinho** (`#2f4a2b`): o acento. Marca o que está escolhido, o que é link e
  o que é ação principal. Um passo aberto em relação ao vinho da marca, para
  não colar no preto do texto quando os dois aparecem na mesma linha.

### Secondary
- **Dourado** (`#eab142`): a cor da marca, do logotipo. **Não é usada como
  cor de interface** — sobre branco dá 1.93:1. Quem exerce o papel dela na
  tela é o ocre abaixo.
- **Ocre** (`#8a6410`): o mesmo dourado escurecido até virar texto legível no
  claro (5.37:1). É o que carrega "pendente", "atrasada", "telefone
  incompleto".

### Tertiary
- **Alarme** (`#a8202f`): destrutivo — cancelar, recusar, não compareceu, erro
  de formulário. É o vinho aberto e mais saturado: separa do acento pelo
  brilho, porque a paleta não tem um quinto tom para gastar.

### Neutral
- **Preto** (`#0e1217`): o texto. 18.79:1 sobre branco.
- **Branco** (`#ffffff`): o fundo do tema claro.
- **Superfície** (`#faf8f5`): campos, cartões e o texto que vai por cima de
  botão preenchido. Botão preenchido usa este token, nunca `white` cravado.
- **Texto de apoio** (`#5f5a58`): legenda, dica, informação secundária.
  6.80:1.
- **Linha** (`#e4ded7`): borda e divisória. Nunca carrega significado
  sozinha.

### Named Rules

**A Regra do Dourado.** O dourado da marca não vira cor de interface. Sobre
branco ele dá 1.93:1. Onde a tela precisa do papel dele — pendência, atraso —
quem entra é o ocre `#8a6410`.

**A Regra dos Quatro Papéis.** Vinho = escolhido. Dourado/ocre = pendente.
Alarme = destrutivo. Preto = texto. Uma cor fora desses quatro papéis é um
erro, não uma variação.


## Typography

**Display Font:** Archivo (system-ui, sans-serif)
**Body Font:** Archivo (system-ui, sans-serif)
**Label/Mono Font:** DM Mono (ui-monospace, monospace)

**Character:** Uma família só, esticada. O display é o mesmo Archivo da
interface aberto no eixo `wdth` até 118 e pesado a 640 — a largura carrega a
ênfase, então o corpo pode ser menor que numa serifada e ainda dominar a
tela. O mono entra apenas nos números, onde alinha em coluna e lê como
comanda.

### Hierarchy
- **Display** (wdth 118 / wght 640, `clamp(1.45rem, 5.6vw, 2.05rem)`, 1.3): a
  frase da reserva e os títulos de página pública.
- **Headline** (600, 18px, 1.4): título de tela no painel.
- **Body** (400, 15px, 1.5): texto corrido e campos.
- **Label** (600, 12px, tracking 0.22em, caixa alta): rótulo de seção e
  sobrelinha. Curto sempre — caixa alta longa não se lê.
- **Mono** (500, tabular, tracking -0.03em): horário, lugares, telefone,
  contagens.

### Named Rules

**A Regra do Mono.** O mono aparece só em número que importa. É por ser raro
que ele significa "isto é um dado, não uma palavra". Usá-lo em texto corrido
apaga o sinal.

**A Regra dos Dois-Pontos.** Em corpo grande o mono dá avanço inteiro ao `:` e
o horário lê "11 : 30". Feche com margem negativa no próprio caractere, não
com tracking na linha toda.

## Layout

Coluna única centrada. A tela pública tem largura máxima de 36rem (`max-w-xl`)
e o painel 56rem (`max-w-4xl`), ambos com 20px de respiro lateral. O painel
ganha uma barra lateral de 14rem a partir de `lg`, grudada no topo; abaixo
disso ela vira menu recolhido.

O ritmo vertical anda em passos de 4px, concentrado em 16 / 20 / 32 / 40 / 56.
Seções separadas por 56px com linha no topo; itens de lista por 14px com
divisória pontilhada.

A densidade muda com o papel: a tela pública respira (o cliente decide uma vez
e vai embora), o painel aperta (o dono varre vinte linhas de relance).

## Elevation & Depth

**Não há sombra neste sistema.** Nenhum `box-shadow` de elevação, nenhum
cartão flutuando. Profundidade é dita por linha de 1px e por troca de fundo
entre `#ffffff` e `#faf8f5`.

Existem dois `box-shadow`, e os dois são traço desenhado, não elevação: o
sublinhado interno que marca item ativo e slot preenchido, e o anel de 1px
que contorna o dia de hoje no calendário.

### Named Rules

**A Regra da Superfície Plana.** Sombra não é usada para hierarquia. Se um
elemento precisa se destacar, ele muda de fundo, ganha linha ou muda de peso —
nunca levanta.

## Shapes

Cantos suavemente arredondados, em três passos: 6px em marcador pequeno, 8px
no que se toca (botão, campo, ficha, dia do calendário) e 12px em cartão e no
cartão. Nada é totalmente reto e nada é pílula: 8px é o valor padrão e a exceção
precisa de motivo.

Bordas são de 1px e da cor `linha`. O dia disponível no calendário carrega um
ponto de 5px abaixo do número — forma, não cor, para não depender de matiz.

## Components

### Buttons
- **Shape:** cantos de 8px (`rounded-lg`)
- **Primary:** fundo vinho, texto na cor superfície, 14px/20px de respiro,
  peso 600. **Nunca `text-white` cravado** — o token acompanha o fundo, o
  literal não.
- **Hover / Focus:** opacidade 90% no hover; anel de 2px do acento a 40% no
  foco. Transição padrão.
- **Ghost:** fundo superfície com borda `linha`, que passa a vinho no hover.
  Densidade menor (6px/12px) — é botão de linha, não de página.
- **Ações de linha:** no painel, ação não é botão preenchido; é texto em vinho
  com sublinhado no hover. Destrutiva usa alarme. Confirmação é embutida na
  própria linha, nunca em diálogo do navegador.

### Chips
- **Style:** borda `linha` sobre superfície, cantos de 8px, numerais
  tabulares.
- **State:** selecionada preenche em vinho com texto na cor superfície.
  Seleção usa preenchimento **e** `aria-pressed` — cor nunca sozinha.

### Cards / Containers
- **Corner Style:** 12px
- **Background:** superfície
- **Shadow Strategy:** nenhuma; ver Elevation & Depth
- **Border:** 1px `linha`
- Nas telas de configuração o cartão é substituído por rótulo de seção: menos
  caixa, mais leitura.

### Inputs / Fields
- **Style:** fundo superfície, borda `linha` de 1px, cantos de 8px, texto de
  15px
- **Focus:** borda vira vinho e ganha anel de 2px do acento a 25%
- **Error:** a mensagem vai abaixo do campo em alarme, 12px, peso 500

### Navigation
- Link em texto de apoio, 14px, que escurece no hover. O item ativo fica em
  vinho, ganha fundo do acento a 9% e um sublinhado interno de 0.14em — a
  assinatura do sistema.

## Do's and Don'ts

### Do:
- **Do** usar `var(--surface)` como texto de botão preenchido, nunca `white`
  cravado — é o token que acompanha o fundo.
- **Do** medir o contraste antes de escolher um tom novo. Todo par de texto
  neste sistema passa AA e os números estão anotados no CSS.
- **Do** derivar número da configuração ou dos dados. Um valor escrito à mão
  vira mentira no dia em que o modelo muda.
- **Do** dar forma além da cor a qualquer estado: ponto, preenchimento,
  risco, `aria-pressed`.
- **Do** dar margem negativa aos dois-pontos do mono em corpo grande, em vez
  de apertar a linha inteira abaixo do piso de -0.04em.

### Don't:
- **Don't** usar o dourado da marca como cor de interface. 1.93:1 sobre branco.
- **Don't** adicionar `box-shadow` de elevação. Este sistema é plano.
- **Don't** introduzir uma quinta cor. Se um estado novo precisa de cor, ele
  precisa primeiro de um dos quatro papéis existentes.
- **Don't** trazer serifada de display. A ênfase vem da largura do Archivo,
  não de outra família.
- **Don't** usar mono em texto corrido — ele significa "número" por ser raro.
- **Don't** escrever plural entre parênteses: `3 reserva(s)`. A tela sabe o
  número, então sabe a palavra; use o utilitário `plural()`.
