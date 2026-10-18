// Favorited items: everything hearted, ready to go into the cart.
//
// Saved pieces are only ids in this browser, so the details are looked up in
// the catalog the page already loads. A piece that has since sold out, been
// hidden or left the shop is still shown, but said plainly rather than left
// as a button that does nothing.

const savedRoot = document.getElementById("saved-contents");
document.getElementById("year").textContent = new Date().getFullYear();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function money(amount) {
  return "$" + Number(amount).toFixed(2);
}

const stripeLinks = (window.MICKNACK_STRIPE_LINKS || {}).links || {};

// Every piece the shop sells, by id.
function catalog() {
  const listings = (window.MICKNACK_PRODUCTS && window.MICKNACK_PRODUCTS.listings) || [];
  const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS) ? window.MICKNACK_EXTRA_PRODUCTS : [];
  const byId = {};

  listings.forEach((listing) => {
    byId[String(listing.listing_id)] = {
      id: String(listing.listing_id),
      title: listing.title,
      price: listing.price,
      image: (listing.images || [])[0] || "assets/products/placeholder.svg",
      gone: listing.etsy_active === false,
    };
  });

  extras.forEach((extra) => {
    byId[String(extra.id)] = {
      id: String(extra.id),
      title: extra.title,
      price: extra.price,
      image: (extra.images || [])[0] || "assets/products/placeholder.svg",
      gone: false,
    };
  });

  return byId;
}

// What can be done with a saved piece right now.
function stateOf(piece) {
  const stock = window.MICKNACK_STOCK.of(piece.id);
  const link = stripeLinks[piece.id] || {};
  const variations =
    (window.MICKNACK_VARIATIONS || {})[piece.id] ||
    (Array.isArray(piece.variations) ? piece.variations : []);

  if (stock.hidden) return { kind: "gone", why: "No longer available." };
  if (stock.soldOut) return { kind: "sold", why: "Sold out." };
  if (!link.price_id) return { kind: "elsewhere", why: "Not buyable here yet." };
  if (variations.length) return { kind: "options", why: "Choose a " + variations[0].name.toLowerCase() };
  return { kind: "ready", priceId: link.price_id };
}

function render() {
  const pieces = catalog();
  const ids = window.MICKNACK_SAVED.ids();

  if (!ids.length) {
    savedRoot.innerHTML = `
      <div class="empty-state">
        <p>No favorites yet. Tap the heart on a piece to keep it here.</p>
        <a class="btn btn-primary" href="index.html#shop">Browse the collection</a>
      </div>`;
    return;
  }

  const rows = ids.map((id) => pieces[id]).filter(Boolean);
  const missing = ids.length - rows.length;
  const states = new Map(rows.map((piece) => [piece.id, stateOf(piece)]));
  const readyNow = rows.filter((piece) => states.get(piece.id).kind === "ready");
  const needOptions = rows.filter((piece) => states.get(piece.id).kind === "options");

  const addAll =
    readyNow.length > 1
      ? `<button type="button" class="btn btn-primary" id="add-all">
           Add all ${readyNow.length} to cart
         </button>`
      : "";

  const note = needOptions.length
    ? `<p class="saved-note">${needOptions.length} ${
        needOptions.length === 1 ? "piece needs" : "pieces need"
      } a choice making first, so ${needOptions.length === 1 ? "it is" : "they are"} not included.</p>`
    : "";

  savedRoot.innerHTML = `
    ${addAll || note ? `<div class="saved-actions">${addAll}${note}</div>` : ""}
    <ul class="saved-list">
      ${rows
        .map((piece) => {
          const state = states.get(piece.id);
          const detail = `p/${encodeURIComponent(piece.id)}.html`;

          const action =
            state.kind === "ready"
              ? `<button type="button" class="btn btn-primary btn-sm" data-add-to-cart
                   data-id="${escapeHtml(piece.id)}"
                   data-price-id="${escapeHtml(state.priceId)}"
                   data-title="${escapeHtml(piece.title)}"
                   data-price="${escapeHtml(piece.price || "")}"
                   data-image="${escapeHtml(piece.image)}">Add to cart</button>`
              : state.kind === "options"
              ? `<a class="btn btn-primary btn-sm" href="${detail}">Choose options</a>`
              : `<span class="saved-why">${escapeHtml(state.why)}</span>`;

          return `
        <li class="saved-row">
          <a class="saved-thumb" href="${detail}">
            <img src="${escapeHtml(piece.image)}" alt="" loading="lazy" />
          </a>
          <div class="saved-meta">
            <a class="saved-title" href="${detail}">${escapeHtml(piece.title)}</a>
            ${piece.price ? `<div class="saved-price">${money(piece.price)}</div>` : ""}
          </div>
          <div class="saved-controls">
            ${action}
            <button type="button" class="saved-remove" data-unsave="${escapeHtml(piece.id)}">Remove</button>
          </div>
        </li>`;
        })
        .join("")}
    </ul>
    ${
      missing
        ? `<p class="saved-note">${missing} favorited ${
            missing === 1 ? "piece is" : "pieces are"
          } no longer in the shop and have been left out.</p>`
        : ""
    }
    <a class="saved-keep" href="index.html#shop">Keep looking</a>
  `;

  const all = document.getElementById("add-all");
  if (all) {
    all.addEventListener("click", () => {
      readyNow.forEach((piece) => {
        const state = states.get(piece.id);
        window.MICKNACK_CART.add({
          id: piece.id,
          price_id: state.priceId,
          title: piece.title,
          price: piece.price,
          image: piece.image,
          options: {},
        });
      });
      all.textContent = `Added ${readyNow.length} to cart`;
      all.disabled = true;
    });
  }
}

savedRoot.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-unsave]");
  if (!remove) return;
  window.MICKNACK_SAVED.remove(remove.dataset.unsave);
});

document.addEventListener("saved:changed", render);

// Redraw once the worker says what is actually left, so a piece that sold
// while it sat on this list says so.
window.MICKNACK_STOCK.loadLive("https://micknack-checkout.jamie-mick18.workers.dev/stock").then(
  (ok) => {
    if (ok) render();
  }
);

render();
