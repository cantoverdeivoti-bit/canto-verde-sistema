/*
 * O "service worker" do painel: um pedaço de código que o navegador guarda e
 * acorda sozinho quando chega uma notificação, mesmo com o painel fechado.
 * Só faz duas coisas: mostra o pop-up e, no toque, abre a tela do aviso.
 *
 * Mora em /public para ser servido em /sw.js, na raiz: o alcance de um
 * service worker é a pasta de onde ele vem, e daqui ele cobre o painel todo.
 */

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { titulo: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo || "Canto Verde", {
      body: dados.corpo || "",
      icon: "/aviso-icone.png",
      badge: "/aviso-selo.png",
      tag: dados.etiqueta,
      data: { url: dados.url || "/admin/compras/pendencias?aba=avisos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Com o painel já aberto numa aba, usa ela; senão abre uma nova.
      const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const aba of abas) {
        if (new URL(aba.url).origin === self.location.origin && "focus" in aba) {
          await aba.focus();
          if ("navigate" in aba) return aba.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
