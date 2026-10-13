import type { MetadataRoute } from "next";

/**
 * O que o celular precisa para pôr o painel na tela de início como um app.
 * No iPhone é obrigatório para as notificações chegarem; no Android é opcional
 * (o Chrome já avisa sem instalar), mas abre sem a barra do navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Canto Verde",
    short_name: "Canto Verde",
    // A identidade do app instalado era o start_url antigo: fica fixa, senão
    // o Android trata a troca abaixo como outro app.
    id: "/admin",
    // Abre numa página estática com a rodinha (app/abrir), que pinta na hora
    // e segue para /admin: o logotipo parado do celular fica bem mais curto.
    start_url: "/abrir",
    display: "standalone",
    background_color: "#e7eae9",
    theme_color: "#00461e",
    icons: [
      { src: "/aviso-icone.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
