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
  const shelf = (window.MICKNACK_CATEGORY_OF || {})[key] || "";
  const listedAt = item.created || item.added_at || null;
  // Taken off Etsy: the piece stays here, but its Etsy link does not. The
  // listing is gone, so the button would land on "this item is unavailable".
  const url = item.etsy_active === false ? "" : item.url || "";
  // Only an Etsy listing gets a button that says Etsy on it.
  const etsyUrl = item.listing_id !== undefined ? url : "";
  const buyUrl = !stock.soldOut && stripeEnabled ? stripeLinks[key]?.url : undefined;
  // A piece with drop-downs cannot be added from here: there would be no
  // length on the order. The card sends people to the piece to choose first.
  const variations =
    (window.MICKNACK_VARIATIONS || {})[key] ||
    (Array.isArray(item.variations) ? item.variations : []);
  return {
    hasOptions: variations.length > 0,
    shelf,
    listedAt,
    // A piece on its way out should never be announced as new.
    retired: item.etsy_active === false,
    id: key,
    priceId: (stripeLinks[key] || {}).price_id || "",
    soldOut: stock.soldOut,
    hidden: stock.hidden,
    title: item.title,
    price: item.price,
    currency_code: item.currency_code,
    description: item.description,
    image: (item.images && item.images[0]) || "assets/products/placeholder.svg",
    url,
    etsyUrl,
    // With no link there's nothing to buy yet, so don't promise a purchase.
    buttonLabel: item.button_label || (url ? buttonLabel : "Coming soon"),
    badge: stock.soldOut ? "Sold out" : item.badge || badge || "",
    // Searched against, never displayed on the card.
    keywords: [item.title, item.description, (item.tags || []).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    buyUrl: buyUrl || "",
    // Clicking the card opens our own product page rather than sending people
    // straight to Etsy or Stripe.
    detailUrl: `p/${encodeURIComponent(key)}.html`,
  };
}

function renderCard(card) {
  const thumbInner = `<img src="${card.image}" alt="${escapeHtml(card.title)}" loading="lazy" />
            ${card.badge ? `<span class="card-badge">${escapeHtml(card.badge)}</span>` : ""}
            ${card.isNew && !card.badge ? `<span class="card-badge is-new">New</span>` : ""}`;

  // Same tab: this is our own page, not an outside link.
  const thumb = `<a class="thumb" href="${card.detailUrl}">${thumbInner}</a>
    <button type="button" class="heart card-heart" data-heart="${escapeHtml(card.id)}"
            data-heart-title="${escapeHtml(card.title)}" aria-label="Save ${escapeHtml(card.title)}"></button>`;

  const actions = [];
  if (card.soldOut) {
    actions.push(`<span class="btn btn-muted">Sold out</span>`);
    if (card.etsyUrl) {
      actions.push(
        `<a class="btn btn-secondary" href="${card.etsyUrl}" target="_blank" rel="noopener">View on Etsy</a>`
      );
    }
  } else if (card.buyUrl && card.priceId && card.hasOptions) {
    actions.push(
      `<a class="btn btn-primary" href="${card.detailUrl}">Choose options</a>`
    );
    if (card.etsyUrl) {
      actions.push(
        `<a class="btn btn-secondary" href="${card.etsyUrl}" target="_blank" rel="noopener">View on Etsy</a>`
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
    if (card.etsyUrl) {
      actions.push(
        `<a class="btn btn-secondary" href="${card.etsyUrl}" target="_blank" rel="noopener">View on Etsy</a>`
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

// What counts as new.
//
// Anything listed in the last fortnight, however many that is, so a drop is
// always marked. After a fortnight a piece keeps the label only while it is
// still among the ten newest, so a quiet month leaves the shop looking
// stocked rather than stale, and a busy week does not brand half the grid.
const NEW_DAYS = 14;
const NEW_KEEP = 10;

function markNew(cards) {
  const dated = cards
    .filter((card) => card.listedAt && !card.retired)
    .sort((a, b) => new Date(b.listedAt) - new Date(a.listedAt));

  const newest = new Set(dated.slice(0, NEW_KEEP).map((card) => card.id));
  const cutoff = Date.now() - NEW_DAYS * 86400000;

  cards.forEach((card) => {
    const listed = card.listedAt ? new Date(card.listedAt).getTime() : 0;
    card.isNew =
      Boolean(listed) && !card.retired && (listed > cutoff || newest.has(card.id));
  });
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

  markNew(cards);

  allCards = cards;
  renderShelves();
  applySearch();
}

// The shelf currently chosen above the grid; empty means everything.
let shelfFilter = "";

// Searching and the shelf chips narrow the cards already on the page, so
// both are instant and they combine rather than fight.
function applySearch() {
  const input = document.getElementById("shop-search");
  const countEl = document.getElementById("search-count");
  const term = input ? input.value.trim().toLowerCase() : "";

  const onShelf = shelfFilter
    ? allCards.filter((card) => card.shelf === shelfFilter)
    : allCards;

  const matches = term
    ? onShelf.filter((card) => term.split(/\s+/).every((word) => card.keywords.includes(word)))
    : onShelf;

  if (countEl) {
    countEl.textContent = `${matches.length} ${matches.length === 1 ? "piece" : "pieces"}`;
    countEl.hidden = !term && !shelfFilter;
  }

  if (!matches.length) {
    const shelfName = (window.MICKNACK_CATEGORIES || []).find((c) => c.id === shelfFilter);
    const said = term
      ? `Nothing matches “${escapeHtml(term)}”${shelfName ? ` in ${escapeHtml(shelfName.label)}` : ""}.`
      : "Nothing on this shelf just now.";
    grid.innerHTML = `<div class="empty-state">
        <p>${said}</p>
        <a class="btn btn-secondary" href="#" id="clear-search">Show everything</a>
      </div>`;
    const clear = document.getElementById("clear-search");
    if (clear) {
      clear.addEventListener("click", (event) => {
        event.preventDefault();
        if (input) input.value = "";
        shelfFilter = "";
        renderShelves();
        applySearch();
      });
    }
    return;
  }

  grid.innerHTML = matches.map(renderCard).join("");
  if (window.MICKNACK_PAINT_HEARTS) window.MICKNACK_PAINT_HEARTS();
}

// Missing extra-products.js shouldn't take the whole shop down with it.
const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS)
  ? window.MICKNACK_EXTRA_PRODUCTS
  : [];

// Only shelves with something on them get a chip: a filter that leads to an
// empty grid is just a disappointment with a label.
function renderShelves() {
  const host = document.getElementById("shelf-filters");
  if (!host) return;

  const shelves = (window.MICKNACK_CATEGORIES || []).filter((shelf) =>
    allCards.some((card) => card.shelf === shelf.id)
  );
  if (shelves.length < 2) return; // one shelf is not a choice

  const chips = [{ id: "", label: "All" }, ...shelves];
  host.innerHTML = chips
    .map((shelf) => {
      const count = shelf.id
        ? allCards.filter((card) => card.shelf === shelf.id).length
        : allCards.length;
      const on = shelfFilter === shelf.id;
      return `<button type="button" class="shelf-chip${on ? " is-on" : ""}"
               data-shelf="${escapeHtml(shelf.id)}" aria-pressed="${on}">
               ${escapeHtml(shelf.label)} <span class="shelf-n">${count}</span>
             </button>`;
    })
    .join("");
  host.hidden = false;
}

const shelfHost = document.getElementById("shelf-filters");
if (shelfHost) {
  shelfHost.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-shelf]");
    if (!chip) return;
    shelfFilter = chip.dataset.shelf;
    renderShelves();
    applySearch();
  });
}

const searchInput = document.getElementById("shop-search");
if (searchInput) searchInput.addEventListener("input", applySearch);

// Ask the checkout worker what's actually left, then redraw. The page renders
// first from the published file, so a slow or missing worker never blocks it.
const STOCK_ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/stock";
window.MICKNACK_STOCK.loadLive(STOCK_ENDPOINT).then((ok) => {
  if (ok && (window.MICKNACK_PRODUCTS || extras.length)) {
    renderProducts(window.MICKNACK_PRODUCTS, extras);
  }
});

if (window.MICKNACK_PRODUCTS || extras.length) {
  renderProducts(window.MICKNACK_PRODUCTS, extras);
} else {
  grid.innerHTML = `<div class="empty-state">Couldn't find product data. Make sure data/products.js is loaded before js/app.js.</div>`;
}
