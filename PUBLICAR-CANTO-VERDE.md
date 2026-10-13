# Publicar o sistema do Canto Verde

O Canto Verde começa com banco **novo e vazio**: não se copia nada do Ponto
Zero Sete. As migrations criam as tabelas e a última delas
(`20261201120000_canto_verde_comeca_zerado`) tira o buffet, as receitas e os
insumos da casa de origem e põe os postos da escala do fim de semana.

São quatro passos: banco, código, Vercel e primeiro acesso.

## 1. Banco no Supabase

1. Em supabase.com, crie um projeto novo chamado `canto-verde`, região **São Paulo**.
2. Guarde a senha do banco.
3. Em **Project Settings > Database > Connection string**, copie dois endereços:
   - o **pooler** do mesmo tipo que o Ponto Zero Sete usa hoje (confira na Vercel dele): vai em `DATABASE_URL`;
   - **Session pooler** (porta 5432): vai em `DIRECT_URL`.

## 2. Código no GitHub

Crie um repositório **privado** (ex.: `canto-verde-sistema`) e suba esta pasta:

```bash
git init
git add .
git commit -m "Sistema do Canto Verde"
git branch -M master
git remote add origin https://github.com/SEU_USUARIO/canto-verde-sistema.git
git push -u origin master
```

O `.gitignore` já deixa de fora `node_modules`, `.next` e o `.env`.

## 3. Projeto na Vercel

1. **Add New > Project**, importe o repositório.
2. Antes do Deploy, preencha **Environment Variables**:

| Variável | O que pôr |
|---|---|
| `DATABASE_URL` | Pooler do Supabase, do mesmo tipo que o Ponto Zero Sete usa |
| `DIRECT_URL` | Session pooler do Supabase (porta 5432) |
| `AUTH_SECRET` | Segredo novo: `openssl rand -base64 32` |
| `CRON_SECRET` | Outro segredo novo, gerado do mesmo jeito |
| `APP_URL` | `https://canto-verde.vercel.app` (ou o domínio próprio) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` | Par novo: `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:cantoverdeivoti@gmail.com` |
| `RESEND_API_KEY`, `RESEND_FROM` | Opcional. Sem eles, só não sai e-mail |

3. Região das funções: **São Paulo (gru1)**. O `vercel.json` já pede.
4. **Deploy**. No build de produção, o `scripts/migrar-em-producao.mjs` roda
   `prisma migrate deploy` sozinho e cria todas as tabelas no banco vazio.

## 4. Primeiro acesso (uma vez, no computador)

O banco tem as tabelas, mas ainda não tem a casa nem o usuário admin. Quem cria
os dois é o seed:

```bash
npm install
# .env com DATABASE_URL e DIRECT_URL do Supabase do Canto Verde, mais:
#   ADMIN_USERNAME="admin"
#   ADMIN_INITIAL_PASSWORD="uma-senha-forte"
#   SEED_TOTAL_CAPACITY="100"
npx prisma db seed
```

Depois, em `https://canto-verde.vercel.app/admin`, entre com esse usuário e:

- confira a lotação e a grade (sábado e domingo, 11:30) em **Comercial > Configurações**;
- cadastre equipe, fornecedores, produtos e fichas, que começam vazios;
- em cada celular, toque em **Avisar neste celular** e ponha o app na tela de início;
- ponha o link da página de reserva na bio do Instagram (@cantoverdeivoti).

## Se der erro

- **Build para em "migrations: FALHOU"**: o `DIRECT_URL` está errado ou é a
  conexão direta (só IPv6). Use o Session pooler, porta 5432.
- **Login não entra**: o seed não rodou ou rodou em outro banco. Confira o `.env`.
- **Domínio próprio**: Vercel > **Settings > Domains**, e atualize `APP_URL`.
