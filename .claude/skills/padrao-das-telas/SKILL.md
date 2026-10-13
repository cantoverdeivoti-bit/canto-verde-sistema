---
name: padrao-das-telas
description: O padrão visual das telas do admin do Canto Verde (quadrados de ação, cartões de seção, topo com "?", busca em cartão, confirmação na linha). Use sempre que for criar uma tela nova em app/admin, reorganizar ou "deixar no padrão" uma tela existente, ou quando o dono mandar captura pedindo para organizar uma página.
---

# Padrão das telas do admin

O dono aprovou este padrão tela por tela. Vale mais que qualquer gosto próprio:
não invente estilo novo e reaproveite as peças prontas abaixo em vez de
escrever classes soltas.

Parte das regras é conferida sozinha pelo `scripts/test-padrao-das-telas.ts`,
que roda na checagem de toda PR (seção 9).

## 1. Topo da página

`CabecalhoDaPagina` (`components/pagina/index.tsx`):

```tsx
<CabecalhoDaPagina
  voltar={{ href: "/admin/receituario", texto: "Fichas" }} // quando houver tela pai
  titulo="Insumos"
  subtitulo="O preço vem da última compra em Compras." // UMA frase
  ajuda="Sem compra do produto ligado, vale o preço digitado no insumo." // o resto, atrás do "?"
/>
```

- Subtítulo de uma frase só. O resto da explicação vai em `ajuda`, que só aparece se houver `subtitulo`.
- Nada de botões grandes em `acoes`: as ações descem para os quadrados (seção 2).

## 2. Ações em quadrados

`components/botao-quadrado.tsx` (client): `BotaoQuadrado`, `FileiraDeBotoes`, `CartaoDeBotoes`.

O desenho: símbolo verde em cima, texto pequeno embaixo, sem caixa. Ficam 4 por linha no celular e lado a lado, com a mesma largura, no computador.

```tsx
<CartaoDeBotoes>
  <BotaoQuadrado icone={Plus} texto="Novo produto" tom="primario" ativo={aberto} onClick={() => setAberto(!aberto)} />
  <BotaoQuadrado icone={Download} texto="Exportar" href="/admin/compras/exportar" baixar />
  <BotaoQuadrado icone={Printer} texto="Imprimir" href={url} externo />
  <BotaoQuadrado icone={Power} texto="Desativar" tom="perigo" onClick={...} />
</CartaoDeBotoes>
```

- `tom="primario"` é a ação principal da tela, em verde-claro.
- `ativo` diz que o painel daquele quadrado está aberto. Um toque de novo fecha.
- `tom="perigo"` deixa o quadrado vermelho (desativar, apagar, cancelar).
- `href` vira link: `externo` abre em outra aba, e `baixar` serve para arquivo (planilha), sem pré-carregar.
- O quadrado nunca some quando o painel abre. Botão que some faz a tela pular.
- O painel aberto fica DENTRO do mesmo cartão, embaixo dos quadrados, ocupando a linha inteira: `className="col-span-full basis-full border-t border-[var(--border)] p-3"`.
- Os ícones lucide são componentes. Uma página de servidor não pode passar um ícone para um componente client. Nesse caso:
  - crie um componente client pequeno (ex.: `acoes-da-ficha.tsx`) que monta a fileira;
  - ou, para links de navegação, use `GradeDeAtalhos` (`components/grade-de-atalhos.tsx`), que roda no servidor.
- As classes do desenho estão em `components/estilo-do-atalho.ts` (`TILE`, `ICONE_DO_TILE`, `TILE_EM_DESTAQUE`), num arquivo sem "use client" de propósito.
- Ações de cada item de uma lista: um `FileiraDeBotoes` embaixo do item, separado por linha (`basis-full border-t border-[var(--border)] pt-1`).

## 3. Seções em cartões

`CartaoDeSecao` (`components/pagina/index.tsx`): um cartão branco por assunto, com símbolo verde, título e frase curta.

```tsx
<CartaoDeSecao icone={Truck} titulo="Quem vende" frase="A cotação pergunta preço só a quem atende a categoria.">
  ...campos...
</CartaoDeSecao>
```

- Use um cartão por assunto (Cadastro, Contato, Condições, Observações…), nunca um cartão gigante com tudo.
- Dentro de uma `Gaveta`, que já é branca, não use cartão. Cada assunto vira um bloco com linha em cima e título com símbolo:
  `<section className="space-y-3 border-t border-[var(--border)] pt-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Icone className="size-4 text-[var(--primary)]" />Título</h3>…</section>`.

## 4. Formulários

- O rótulo vai SEMPRE em cima do campo (`<span className="mb-1 block font-medium">` ou `.label`), nunca ao lado.
- A dica vai em `.hint`, que já é bloco: fica em linha própria, embaixo do campo.
- Campos curtos ficam em grade: `grid grid-cols-2 gap-3 lg:grid-cols-4`.
- O botão Salvar é verde e fica no fim: `className="border-transparent bg-[var(--botao)] font-semibold text-[var(--botao-texto)]"`, ou o `Button` padrão.
- Barra ou botão preso embaixo da tela (`sticky` ou `fixed` com `bottom-*`) sobe acima da barra de baixo do celular pela variável `--barra-de-baixo`: `bottom-[var(--barra-de-baixo)]`, ou `bottom-[calc(var(--barra-de-baixo)+0.75rem)]` para a barra que flutua. Sem isso, o Salvar fica escondido atrás dela. A variável vale zero no computador e nas telas sem a barra.
- Um `fixed` dentro da tela fica preso ao `@container` do layout, e não à tela. Para prender à tela, use um portal (como `tarefas/nova-tarefa-rapida.tsx`).

## 5. Página de lista: sempre nesta ordem

1. O cartão de quadrados de ação.
2. O cartão de busca: `rounded-xl border border-[var(--border)] bg-[var(--card)] p-2`.
   - Em cima, o campo com a lupa (`Search` em `absolute left-3`, input `h-11 pl-9`).
   - Embaixo, os filtros. Escolha entre duas opções vira botões `.chip` com `aria-pressed`. Lista maior vira `<select className="field">`, ou `SelectQueEnvia` em formulário GET.
3. A contagem, fora do cartão: `<p className="text-sm text-[var(--muted-foreground)]">254 produtos</p>`.
4. A lista.

Lista que pode passar de umas 40 linhas desenha em lotes, com `components/mais-ao-rolar.tsx`:
- em componente client, use `useEmLotes(itens)` e `<MaisAoRolar>`;
- em página de servidor, use `<ListaEmLotes key={filtros}>{itens.map(...)}</ListaEmLotes>`.

A `key` com os filtros faz a lista recomeçar do topo quando a busca muda.

## 6. Confirmar e apagar

- Nunca use `window.confirm`. Use `ConfirmarNaLinha` ou `CaixaDeConfirmacao` (`components/confirmar-na-linha.tsx`): a pergunta aparece na própria linha.
- Ações do servidor passam por `useAcao().rodar` (`lib/use-acao.ts`), que mostra erro e aviso.
- Para apagar de forma reversível, use a lixeira: a ação devolve `lixeiraId`, e o padrão é este:

```ts
let lixeiraId = 0;
rodar(() => apagarX(id), (r) => { lixeiraId = r.lixeiraId ?? 0; }, { aviso: "X na lixeira", desfazer: () => restaurarDaLixeira(lixeiraId) });
```

O item fica 30 dias na lixeira (`lib/lixeira.ts`).

## 7. O que não usar

- Bolinha com iniciais ao lado do nome. Só o avatar da conta, no topo, tem.
- Bolinha em volta de número. O número vai solto (`num-display text-[var(--muted-foreground)]`).
- Fundo cinza atrás de símbolo. É só o símbolo, sobre o branco.
- Quadro de contagem que não ajuda a decidir nada.
- Botão grande só de texto no topo.

## 8. Textos da tela

- Português, curto, direto. Não repita o que o título já diz.
- Nunca use travessão (—) como pontuação. Use dois-pontos, vírgula ou ponto. O "—" sozinho, marcando campo sem valor numa tabela, pode.
- Explicação longa vai atrás do "?" (`ajuda`) ou na dica do campo.

## 9. Antes de entregar

1. `npx tsc --noEmit -p .` e `npx eslint` nos arquivos mexidos.
2. `npx tsx scripts/test-padrao-das-telas.ts`. Ele barra três coisas em código novo: `confirm()`, travessão como pontuação em texto de tela e `<Button>` nas `acoes` do `CabecalhoDaPagina`.
   - O código antigo ainda tem casos, contados por arquivo em `scripts/padrao-das-telas-base.json`. A regra é de catraca: nenhum arquivo pode passar da conta que tem.
   - Quando você arrumar uma tela e a conta cair, rode `npx tsx scripts/test-padrao-das-telas.ts --atualizar` e faça o commit da base junto.
   - Nunca aumente a base para fazer o teste passar: arrume o código.
3. `npm run -s build`.
4. Capturas, com o sistema rodando: `CAPTURAS_URL=http://localhost:3000 CAPTURAS_USUARIO=... CAPTURAS_SENHA=... npm run capturas -- /admin/rota1 /admin/rota2`.
   - Ele fotografa cada tela em 390 px e 1280 px, em `capturas/`, e acusa erro se a página rola para o lado ou se o navegador dá erro.
   - Olhe as fotos: abra os painéis e as gavetas da tela e confira que nada fica cortado. O link que aparecia como "htt…" é o exemplo do que não pode passar.
   - O Playwright não é dependência do projeto. Se faltar: `npm i --no-save playwright && npx playwright install chromium`. Onde já existe um Chromium instalado, aponte `CHROMIUM_PATH` para ele.
5. Commit na branch de trabalho. Publicar só quando o dono disser "Publique".

Telas que já seguem o padrão e servem de modelo:
- `app/admin/compras/products-list.tsx` (quadrados, busca em cartão, Editar em cartões);
- `app/admin/compras/fornecedores/suppliers-list.tsx`;
- `app/admin/receituario/insumos/` (gaveta em blocos);
- `app/admin/comercial/configuracoes/` (atalhos e seções em cartões).
