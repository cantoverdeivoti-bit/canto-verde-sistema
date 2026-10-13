# Como instalar uma cópia do sistema

Este guia leva o sistema, com os dados de hoje, para outro lugar: uma conta nova na Vercel, com um banco novo no Supabase. São três partes: copiar os dados, configurar e publicar.

## O que você precisa

- **Uma conta no Supabase** (supabase.com): é onde fica o banco de dados, que guarda tudo do sistema (produtos, fichas, pessoas, fotos). Crie um projeto novo, de preferência na região São Paulo.
- **Uma conta na Vercel** (vercel.com): é o servidor que deixa o sistema no ar.
- **Uma conta no GitHub** (github.com): é onde o código fica guardado, e de onde a Vercel publica.
- **Um computador com:**
  - o Node 22 (nodejs.org), que roda o código;
  - o PostgreSQL 17 (postgresql.org/download), que copia o banco. Para isso basta a parte de linha de comando: `pg_dump` e `pg_restore`.

## 1. Copiar os dados

O banco de hoje vai inteiro para o banco novo: usuários e senhas, produtos, fichas com fotos, fornecedores, pessoas com CPF, financeiro.

**Cuidado:** o arquivo da cópia tem dados pessoais. Guarde num lugar seguro e apague quando terminar.

Você vai precisar de dois endereços de conexão:
- o do banco de hoje, no Supabase do sistema atual;
- o do banco novo, no projeto que você criou.

Em cada um, vá em **Project Settings > Database > Connection string**, escolha **Session pooler** e copie o endereço. Ele começa com `postgresql://` e tem a senha do banco no lugar de `[YOUR-PASSWORD]`.

No computador, abra o terminal na pasta do sistema e rode:

```bash
# 1. Tira a cópia do banco de hoje (só a parte do sistema, a "public").
pg_dump "ENDERECO_DO_BANCO_DE_HOJE" --schema=public --no-owner --no-privileges --format=custom --file=copia.dump

# 2. Coloca a cópia no banco novo.
pg_restore --no-owner --no-privileges --dbname="ENDERECO_DO_BANCO_NOVO" copia.dump
```

No fim, pode aparecer um aviso sobre `schema "public" already exists`. Ele é esperado e pode ser ignorado. Qualquer outro erro, pare e confira.

A cópia já leva o registro das atualizações do banco (as "migrations"), então o banco novo fica pronto para esta versão do código.

## 2. Colocar o código no GitHub

1. Descompacte o .zip numa pasta.
2. No GitHub, crie um repositório novo e **privado**.
3. Suba a pasta para ele. Pelo site, use "uploading an existing file". No terminal:

```bash
git init
git add .
git commit -m "Cópia do sistema"
git branch -M master
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin master
```

## 3. Publicar na Vercel

1. Na Vercel, clique em **Add New > Project** e importe o repositório.
2. Antes de publicar, abra **Environment Variables** e preencha as variáveis abaixo. O arquivo `.env.example` explica cada uma.

| Variável | O que pôr |
|---|---|
| `DATABASE_URL` | O endereço do banco novo, do mesmo tipo que o sistema de hoje usa. Confira na Vercel do sistema atual, em **Settings > Environment Variables**, e troque só o projeto e a senha |
| `DIRECT_URL` | O endereço do banco novo, **Session pooler** (porta 5432) |
| `AUTH_SECRET` | Um segredo **novo**. Gere com `npx auth secret` ou `openssl rand -base64 32`. Nunca use o do sistema atual |
| `APP_URL` | O endereço do sistema novo, como `https://nome-do-sistema.vercel.app` |
| `CRON_SECRET` | Outro segredo novo, gerado do mesmo jeito. Protege as tarefas automáticas |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` | Um par **novo**, gerado com `npx web-push generate-vapid-keys`. São os avisos no celular |
| `RESEND_API_KEY` e `RESEND_FROM` | A chave do Resend (resend.com), que manda e-mail. Opcional: sem ela, o sistema funciona e só não manda e-mail |

3. Na Vercel, em **Settings > General**, deixe a região das funções em **São Paulo (gru1)**. O arquivo `vercel.json` já pede isso.
4. Clique em **Deploy**. A primeira publicação leva alguns minutos.

As tarefas automáticas (o lembrete das reservas e o relatório da semana) já vêm configuradas no `vercel.json`.

## 4. Depois de publicar

- **Entre com o mesmo usuário e senha de hoje.** Eles vieram com os dados.
- **Todo mundo vai entrar de novo.** O segredo novo (`AUTH_SECRET`) encerra as sessões antigas, e os links de atalho da equipe precisam ser gerados de novo.
- **Os avisos no celular** precisam ser ativados de novo em cada aparelho, no botão "Avisar neste celular".
- **Se for outro negócio**, troque o nome e os dados da casa nas configurações.
- **Para trocar a senha do admin pelo terminal**, aponte o `.env` para o banco novo e rode `npx tsx scripts/set-admin-password.ts`.
- **O domínio próprio**, se houver, se liga na Vercel em **Settings > Domains**.

## Se for instalar fora da Vercel

Num servidor próprio com Node 22:

```bash
npm ci                     # instala as dependências
npx prisma migrate deploy  # confere o banco (fora da Vercel, as migrations não rodam sozinhas)
npm run build              # monta o sistema
npm run start              # sobe na porta 3000
```

As variáveis vão num arquivo `.env` na pasta, no formato do `.env.example`. As tarefas automáticas precisam de um agendador do servidor (cron) que chame:
- `/api/cron/reminders` todo dia às 15h UTC;
- `/api/cron/relatorio-semanal` todo dia às 11h UTC.

Cada chamada leva o cabeçalho `Authorization: Bearer` seguido do `CRON_SECRET`.
