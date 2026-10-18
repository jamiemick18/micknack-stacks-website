// Saving a piece for later, the way a favourite works on Etsy.
//
// The list lives in this browser. It is not an account, and nothing about who
// saved what leaves the machine: the only thing sent anywhere is "this piece
// was saved", counted against the piece and never against the person. The
// random id below exists so that saving the same piece twice, or changing
// your mind all afternoon, still counts once.
//
// Everything degrades quietly. With the worker unreachable the heart still
// works and the list still fills; only the shop's own tally misses it.

(function () {
  const ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/hearts";
  const SAVED_KEY = "micknack-saved";
  const VISITOR_KEY = "micknack-visitor";

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback; // private window, or storage turned off
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* the list just will not survive a reload */
    }
  }

  // Made up here, never sent anywhere except with a heart, and good for
  // nothing but telling two sets of hearts apart.
  function visitorId() {
    let id = read(VISITOR_KEY, null);
    if (typeof id !== "string" || !id) {
      id = "v" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      write(VISITOR_KEY, id);
    }
    return id;
  }

  // One checkerboard for the whole page, in a hidden SVG the hearts point at.
  // Squares of 1.5 give about four across the heart: readable at card size,
  // still a check rather than a smudge on a phone.
  function ensurePattern() {
    if (document.getElementById("heart-check")) return;
    const holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    holder.setAttribute("aria-hidden", "true");
    holder.setAttribute("width", "0");
    holder.setAttribute("height", "0");
    holder.style.position = "absolute";
    holder.innerHTML =
      '<defs><pattern id="heart-check" width="3" height="3" patternUnits="userSpaceOnUse">' +
      '<rect width="3" height="3" fill="#ffffff"/>' +
      '<rect width="1.5" height="1.5" fill="#0a0a0a"/>' +
      '<rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#0a0a0a"/>' +
      "</pattern></defs>";
    document.body.appendChild(holder);
  }

  const Saved = {
    ids() {
      const list = read(SAVED_KEY, []);
      return Array.isArray(list) ? list.map(String) : [];
    },

    has(id) {
      return this.ids().includes(String(id));
    },

    count() {
      return this.ids().length;
    },

    toggle(id) {
      const pieceId = String(id);
      const list = this.ids();
      const at = list.indexOf(pieceId);
      const saving = at === -1;

      if (saving) list.unshift(pieceId);
      else list.splice(at, 1);

      write(SAVED_KEY, list);
      document.dispatchEvent(new CustomEvent("saved:changed"));
      tell(pieceId, saving);
      return saving;
    },

    remove(id) {
      if (this.has(id)) this.toggle(id);
    },
  };

  function tell(pieceId, saving) {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piece: pieceId, visitor: visitorId(), saved: saving }),
      keepalive: true, // so it still goes if the click was on the way out
    }).catch(() => {
      /* the shop misses one tally; the shopper notices nothing */
    });
  }

  // The heart itself, used on cards and on a product page.
  function heartButton(pieceId, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heart";
    button.dataset.heart = String(pieceId);
    paint(button, Saved.has(pieceId), title);
    return button;
  }

  function paint(button, on, title) {
    const name = title || "this piece";
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", (on ? "Favorited: " : "Favorite ") + name);
    button.title = on ? "Favorited. Click to remove." : "Add to favorites";
    const heartPath = "M12 20.3S5 16 3.2 12.1A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 8.8 4.5C19 16 12 20.3 12 20.3z";
    button.innerHTML = on
      ? `<svg viewBox="0 0 24 24" aria-hidden="true">
           <path d="${heartPath}" fill="url(#heart-check)" stroke="#b78436" stroke-width="1.6"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true">
           <path d="${heartPath}" fill="none" stroke="currentColor" stroke-width="1.6"/>
         </svg>`;
  }

  // One listener for every heart on the page, whenever they were drawn.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-heart]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const on = Saved.toggle(button.dataset.heart);
    paint(button, on, button.dataset.heartTitle);
  });

  // Cards are written as markup and redrawn whenever the grid changes, so
  // their hearts arrive empty and have to be filled in afterwards.
  function paintAll() {
    ensurePattern();
    document.querySelectorAll("[data-heart]").forEach((button) => {
      paint(button, Saved.has(button.dataset.heart), button.dataset.heartTitle);
    });
    renderSavedLink();
  }

  document.addEventListener("saved:changed", paintAll);

  // The way back to the list, next to the cart.
  function renderSavedLink() {
    const link = document.getElementById("saved-link");
    if (!link) return;
    const count = Saved.count();
    link.textContent = count ? `Favorites (${count})` : "Favorites";
    link.hidden = false;
  }

  window.MICKNACK_SAVED = Saved;
  window.MICKNACK_HEART_BUTTON = heartButton;
  window.MICKNACK_PAINT_HEARTS = paintAll;

  ensurePattern();
  paintAll();
})();
