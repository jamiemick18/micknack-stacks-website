const grid = document.getElementById("product-grid");
const syncNote = document.getElementById("sync-note");
document.getElementById("year").textContent = new Date().getFullYear();

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
function toCard(item, { buttonLabel, badge }) {
  return {
    title: item.title,
    price: item.price,
    currency_code: item.currency_code,
    description: item.description,
    image: (item.images && item.images[0]) || "assets/products/placeholder.svg",
    url: item.url || "",
    // With no link there's nothing to buy yet, so don't promise a purchase.
    buttonLabel: item.button_label || (item.url ? buttonLabel : "Coming soon"),
    badge: item.badge || badge || "",
  };
}

function renderCard(card) {
  const thumbInner = `<img src="${card.image}" alt="${escapeHtml(card.title)}" loading="lazy" />
            ${card.badge ? `<span class="card-badge">${escapeHtml(card.badge)}</span>` : ""}`;

  // Without a link there is nothing to click, so render a plain div instead of
  // a dead anchor.
  const thumb = card.url
    ? `<a class="thumb" href="${card.url}" target="_blank" rel="noopener">${thumbInner}</a>`
    : `<div class="thumb">${thumbInner}</div>`;

  const action = card.url
    ? `<a class="btn btn-primary" href="${card.url}" target="_blank" rel="noopener">${escapeHtml(card.buttonLabel)}</a>`
    : `<span class="btn btn-muted">${escapeHtml(card.buttonLabel)}</span>`;

  return `
    <article class="product-card">
      ${thumb}
      <div class="card-body">
        <h3>${escapeHtml(card.title)}</h3>
        ${card.price ? `<div class="price">${formatPrice(card.price, card.currency_code)}</div>` : ""}
        <p class="desc">${escapeHtml(truncate(card.description, 110))}</p>
        ${action}
      </div>
    </article>
  `;
}

function renderProducts(etsyData, extras) {
  const etsyListings = (etsyData && etsyData.listings) || [];

  const cards = [
    // Pieces only on this site go first: they can't be found anywhere else.
    ...extras.map((item) => toCard(item, { buttonLabel: "Buy Now" })),
    ...etsyListings.map((item) => toCard(item, { buttonLabel: "View on Etsy" })),
  ];

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
  syncNote.textContent = parts.join(" · ");
  syncNote.style.display = parts.length ? "" : "none";

  if (cards.length === 0) {
    grid.innerHTML = `<div class="empty-state">No pieces to show yet. Check back soon!</div>`;
    return;
  }

  grid.innerHTML = cards.map(renderCard).join("");
}

// Missing extra-products.js shouldn't take the whole shop down with it.
const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS)
  ? window.MICKNACK_EXTRA_PRODUCTS
  : [];

if (window.MICKNACK_PRODUCTS || extras.length) {
  renderProducts(window.MICKNACK_PRODUCTS, extras);
} else {
  grid.innerHTML = `<div class="empty-state">Couldn't find product data. Make sure data/products.js is loaded before js/app.js.</div>`;
}
