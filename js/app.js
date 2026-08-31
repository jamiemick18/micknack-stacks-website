const grid = document.getElementById("product-grid");
const syncNote = document.getElementById("sync-note");
document.getElementById("year").textContent = new Date().getFullYear();

function formatPrice(price, currency) {
  const symbols = { USD: "$", CAD: "CA$", GBP: "£", EUR: "€", AUD: "AU$" };
  return `${symbols[currency] || currency + " "}${price}`;
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

function renderProducts(data) {
  const listings = (data && data.listings) || [];

  if (data && data.synced_at) {
    const date = new Date(data.synced_at);
    syncNote.textContent = `Synced from Etsy on ${date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
  } else {
    syncNote.textContent = "Showing sample layout — run the Etsy sync to load your real listings";
  }

  if (listings.length === 0) {
    grid.innerHTML = `<div class="empty-state">No active listings found. Check back soon!</div>`;
    return;
  }

  grid.innerHTML = listings
    .map((item) => {
      const img = item.images && item.images[0] ? item.images[0] : "assets/products/placeholder.svg";
      return `
        <article class="product-card">
          <a class="thumb" href="${item.url}" target="_blank" rel="noopener">
            <img src="${img}" alt="${escapeHtml(item.title)}" loading="lazy" />
          </a>
          <div class="card-body">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="price">${formatPrice(item.price, item.currency_code)}</div>
            <p class="desc">${escapeHtml(truncate(item.description, 110))}</p>
            <a class="btn btn-primary" href="${item.url}" target="_blank" rel="noopener">View on Etsy</a>
          </div>
        </article>
      `;
    })
    .join("");
}

if (window.MICKNACK_PRODUCTS) {
  renderProducts(window.MICKNACK_PRODUCTS);
} else {
  grid.innerHTML = `<div class="empty-state">Couldn't find product data. Make sure data/products.js is loaded before js/app.js.</div>`;
}
