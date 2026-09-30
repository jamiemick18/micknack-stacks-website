const grid = document.getElementById("product-grid");
const syncNote = document.getElementById("sync-note");
document.getElementById("year").textContent = new Date().getFullYear();

// Stripe payment links, written by scripts/create-stripe-links.js.
// Test links only accept Stripe's fake cards, so they're shown on localhost
// only. Publishing them would give real shoppers a checkout that can't take
// their money.
let allCards = [];

const stripeData = window.MICKNACK_STRIPE_LINKS || {};
const stripeLinks = stripeData.links || {};
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const stripeEnabled =
  stripeData.mode === "live" || (stripeData.mode === "test" && isLocalhost);

function formatPrice(price, currency) {
  const symbols = { USD: "$", CAD: "CA$", GBP: "£", EUR: "€", AUD: "AU$" };
  const code = currency || "USD";
  return `${symbols[code] || code + " "}${price}`;
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len).trim() + "…" : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Etsy listings and hand-added pieces render identically; they only differ in
// where they come from and what their button says.
function toCard(item, { key, buttonLabel, badge }) {
  // Quantities live in data/inventory.js and are never shown to shoppers;
  // they only decide whether a piece can be bought.
  const stock = window.MICKNACK_STOCK.of(key);
  const buyUrl = !stock.soldOut && stripeEnabled ? stripeLinks[key]?.url : undefined;
  return {
    id: key,
    priceId: (stripeLinks[key] || {}).price_id || "",
    soldOut: stock.soldOut,
    hidden: stock.hidden,
    title: item.title,
    price: item.price,
    currency_code: item.currency_code,
    description: item.description,
    image: (item.images && item.images[0]) || "assets/products/placeholder.svg",
    url: item.url || "",
    // With no link there's nothing to buy yet, so don't promise a purchase.
    buttonLabel: item.button_label || (item.url ? buttonLabel : "Coming soon"),
    badge: stock.soldOut ? "Sold out" : item.badge || badge || "",
    // Searched against, never displayed on the card.
    keywords: [item.title, item.description, (item.tags || []).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    buyUrl: buyUrl || "",
    // Clicking the card opens our own product page rather than sending people
    // straight to Etsy or Stripe.
    detailUrl: `product.html?id=${encodeURIComponent(key)}`,
  };
}

function renderCard(card) {
  const thumbInner = `<img src="${card.image}" alt="${escapeHtml(card.title)}" loading="lazy" />
            ${card.badge ? `<span class="card-badge">${escapeHtml(card.badge)}</span>` : ""}`;

  // Same tab: this is our own page, not an outside link.
  const thumb = `<a class="thumb" href="${card.detailUrl}">${thumbInner}</a>`;

  const actions = [];
  if (card.soldOut) {
    actions.push(`<span class="btn btn-muted">Sold out</span>`);
    if (card.url) {
      actions.push(
        `<a class="btn btn-secondary" href="${card.url}" target="_blank" rel="noopener">View on Etsy</a>`
      );
    }
  } else if (card.buyUrl && card.priceId) {
    actions.push(
      `<button type="button" class="btn btn-primary" data-add-to-cart
         data-id="${escapeHtml(card.id)}"
         data-price-id="${escapeHtml(card.priceId)}"
         data-title="${escapeHtml(card.title)}"
         data-price="${escapeHtml(card.price || "")}"
         data-image="${escapeHtml(card.image)}">Add to cart</button>`
    );
    if (card.url) {
      actions.push(
        `<a class="btn btn-secondary" href="${card.url}" target="_blank" rel="noopener">View on Etsy</a>`
      );
    }
  } else if (card.url) {
    actions.push(
      `<a class="btn btn-primary" href="${card.url}" target="_blank" rel="noopener">${escapeHtml(card.buttonLabel)}</a>`
    );
  } else {
    actions.push(`<span class="btn btn-muted">${escapeHtml(card.buttonLabel)}</span>`);
  }

  return `
    <article class="product-card">
      ${thumb}
      <div class="card-body">
        <h3><a class="card-title-link" href="${card.detailUrl}">${escapeHtml(card.title)}</a></h3>
        ${card.price ? `<div class="price">${formatPrice(card.price, card.currency_code)}</div>` : ""}
        <p class="desc">${escapeHtml(truncate(card.description, 110))}</p>
        <div class="card-actions">${actions.join("")}</div>
      </div>
    </article>
  `;
}

function renderProducts(etsyData, extras) {
  const etsyListings = (etsyData && etsyData.listings) || [];

  const cards = [
    // Pieces only on this site go first: they can't be found anywhere else.
    ...extras.map((item) =>
      toCard(item, { key: String(item.id), buttonLabel: "Buy Now" })
    ),
    ...etsyListings.map((item) =>
      toCard(item, { key: String(item.listing_id), buttonLabel: "View on Etsy" })
    ),
  ].filter((card) => !card.hidden);

  const parts = [];
  if (etsyData && etsyData.synced_at) {
    const date = new Date(etsyData.synced_at);
    parts.push(
      `Synced from Etsy on ${date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`
    );
  }
  if (extras.length) {
    parts.push(`${extras.length} piece${extras.length === 1 ? "" : "s"} only here`);
  }
  if (stripeEnabled && stripeData.mode === "test") {
    parts.push("Stripe TEST mode — local preview only");
  }
  syncNote.textContent = parts.join(" · ");
  syncNote.style.display = parts.length ? "" : "none";

  if (cards.length === 0) {
    grid.innerHTML = `<div class="empty-state">No pieces to show yet. Check back soon!</div>`;
    return;
  }

  allCards = cards;
  applySearch();
}

// Searching filters the cards already on the page, so results are instant.
function applySearch() {
  const input = document.getElementById("shop-search");
  const countEl = document.getElementById("search-count");
  const term = input ? input.value.trim().toLowerCase() : "";

  const matches = term
    ? allCards.filter((card) => term.split(/\s+/).every((word) => card.keywords.includes(word)))
    : allCards;

  if (countEl) {
    countEl.textContent = `${matches.length} ${matches.length === 1 ? "piece" : "pieces"}`;
    countEl.hidden = !term;
  }

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state">
        <p>Nothing matches “${escapeHtml(term)}”.</p>
        <a class="btn btn-secondary" href="#" id="clear-search">Show everything</a>
      </div>`;
    const clear = document.getElementById("clear-search");
    if (clear) {
      clear.addEventListener("click", (event) => {
        event.preventDefault();
        if (input) input.value = "";
        applySearch();
      });
    }
    return;
  }

  grid.innerHTML = matches.map(renderCard).join("");
}

// Missing extra-products.js shouldn't take the whole shop down with it.
const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS)
  ? window.MICKNACK_EXTRA_PRODUCTS
  : [];

const searchInput = document.getElementById("shop-search");
if (searchInput) searchInput.addEventListener("input", applySearch);

if (window.MICKNACK_PRODUCTS || extras.length) {
  renderProducts(window.MICKNACK_PRODUCTS, extras);
} else {
  grid.innerHTML = `<div class="empty-state">Couldn't find product data. Make sure data/products.js is loaded before js/app.js.</div>`;
}
