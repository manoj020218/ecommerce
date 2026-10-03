/* App push notifications (2026-10-03). Loaded into the main service worker
   via workbox importScripts (vite.config.js). Shows the notification and
   opens the right page when tapped. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_error) {
    data = { title: "Jenix India", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Jenix India";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" }
  };
  if (data.image) options.image = data.image;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
