import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A versão no ar, no rodapé do menu: os 7 primeiros caracteres do commit
  // (a Vercel preenche VERCEL_GIT_COMMIT_SHA no build) e a hora do build.
  // Serve para conferir pelo celular se uma publicação entrou mesmo: as PRs
  // #39 e #40 falharam na Vercel e o site ficou horas na versão anterior.
  env: {
    NEXT_PUBLIC_VERSAO: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    NEXT_PUBLIC_PUBLICADO_EM: new Date().toISOString(),
  },
  // O pdfkit lê os arquivos das fontes (Helvetica.afm…) da própria pasta em
  // node_modules. Empacotado pelo Next, o caminho some e o PDF quebra; fora
  // do pacote, a Vercel leva a pasta junto.
  serverExternalPackages: ["pdfkit", "sharp"],
  async redirects() {
    // Histórico de rotas do painel. As configurações moraram em
    // /admin/configuracoes, depois em três abas, depois numa página única —
    // e o módulo inteiro se chamava "reservas" antes de virar "comercial".
    // Favorito e histórico de navegador não podem quebrar em nenhuma geração.
    //
    // Cada regra aponta direto para o destino FINAL, sem cadeia: quem tem um
    // 308 antigo gravado no navegador vai sozinho até /admin/reservas/... e
    // precisa de um salto só a partir dali.
    //
    // Tudo aqui é 307 (permanent: false). O painel é autenticado e noindex,
    // então não há SEO a preservar — e um 308 fica gravado no navegador de
    // quem visitou, para sempre. Renomear "clientes" para "crm" no mesmo dia
    // já mostrou o custo disso.
    const config = "/admin/comercial/configuracoes";
    return [
      // Geração 1: as configurações fora do módulo.
      { source: "/admin/configuracoes/capacidade", destination: config, permanent: false },
      { source: "/admin/configuracoes/regras", destination: config, permanent: false },
      { source: "/admin/configuracoes/notificacoes", destination: config, permanent: false },

      // Geração 2: três abas dentro do módulo "reservas".
      { source: "/admin/reservas/capacidade", destination: config, permanent: false },
      { source: "/admin/reservas/regras", destination: config, permanent: false },
      { source: "/admin/reservas/avisos", destination: config, permanent: false },
      { source: "/admin/reservas/clientes", destination: "/admin/comercial/crm", permanent: false },

      // Geração 3: o módulo "reservas" virou "comercial".
      { source: "/admin/reservas/configuracoes", destination: config, permanent: false },
      { source: "/admin/reservas/crm", destination: "/admin/comercial/crm", permanent: false },
      { source: "/admin/reservas", destination: "/admin/comercial", permanent: false },

      // Geração 4: as três seções ainda abriam sozinhas, sem título. Agora
      // levam à seção certa da página única.
      { source: "/admin/comercial/capacidade", destination: `${config}#capacidade`, permanent: false },
      { source: "/admin/comercial/regras", destination: `${config}#regras`, permanent: false },
      { source: "/admin/comercial/avisos", destination: `${config}#avisos`, permanent: false },
    ];
  },
};

export default nextConfig;
