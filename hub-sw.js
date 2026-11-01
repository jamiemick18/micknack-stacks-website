// The HUB's service worker. Its only job is notifications.
//
// The push that wakes it carries nothing: the worker sends a knock, not a
// message. Carrying a payload would mean encrypting it to each phone's own
// key by hand, and a mistake there is a notification that silently never
// arrives. So this asks what sort of thing happened and words it itself.
//
// /push/latest answers with a kind and a time and nothing else — never a
// name, an email, or anything a customer wrote.

const WORKER = "https://micknack-checkout.jamie-mick18.workers.dev";

const WORDS = {
  custom: { title: "New custom request", body: "Someone has described a piece they want." },
  review: { title: "New review waiting", body: "Read it before it goes up." },
  order: { title: "You sold something", body: "An order came through your own site." },
  test: { title: "Notifications are on", body: "This is what they will look like." },
};

self.addEventListener("install", (event) => {
  // Take over straight away rather than waiting for every HUB tab to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let said = { title: "Something new in your HUB", body: "Tap to take a look." };
      try {
        const res = await fetch(`${WORKER}/push/latest?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          if (WORDS[body.kind]) said = WORDS[body.kind];
        }
      } catch (err) {
        // Offline, or the worker is having a moment. A vague notification is
        // still worth far more than none: it gets her to look.
      }

      await self.registration.showNotification(said.title, {
        body: said.body,
        icon: "/assets/emblem-bear-moon.png",
        badge: "/assets/emblem-bear-moon.png",
        tag: "micknack-hub",
        renotify: true,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (client.url.includes("/hub.html")) return client.focus();
      }
      return self.clients.openWindow("/hub.html");
    })()
  );
});
