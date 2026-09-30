// Renders the full product page at product.html?id=<listing id>.
// Reads the same data files the collection grid uses, so nothing extra has to
// be generated when a listing is added.

const detail = document.getElementById("product-detail");
document.getElementById("year").textContent = new Date().getFullYear();

const stripeData = window.MICKNACK_STRIPE_LINKS || {};
const stripeLinks = stripeData.links || {};
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const stripeEnabled =
  stripeData.mode === "live" || (stripeData.mode === "test" && isLocalhost);

const SHIPPING_NOTE = "Flat $5 shipping, ships from Colorado";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatPrice(price, currency) {
  const symbols = { USD: "$", CAD: "CA$", GBP: "£", EUR: "€", AUD: "AU$" };
  const code = currency || "USD";
  return `${symbols[code] || code + " "}${price}`;
}

function findProduct(id) {
  const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS)
    ? window.MICKNACK_EXTRA_PRODUCTS
    : [];

  const extra = extras.find((item) => String(item.id) === id);
  if (extra) {
    return {
      id: String(extra.id),
      title: extra.title,
      price: extra.price,
      currency_code: extra.currency_code,
      description: extra.description,
      images: extra.images || [],
      tags: extra.tags || [],
      etsyUrl: extra.url || "",
      badge: extra.badge || "",
      buttonLabel: extra.button_label || "",
    };
  }

  const listings = (window.MICKNACK_PRODUCTS && window.MICKNACK_PRODUCTS.listings) || [];
  const listing = listings.find((item) => String(item.listing_id) === id);
  if (!listing) return null;

  return {
    id: String(listing.listing_id),
    title: listing.title,
    price: listing.price,
    currency_code: listing.currency_code,
    description: listing.description,
    images: listing.images || [],
    tags: listing.tags || [],
    etsyUrl: listing.url || "",
    badge: "",
    buttonLabel: "",
  };
}

function renderNotFound() {
  detail.innerHTML = `
    <div class="empty-state">
      <p>We couldn't find that piece. It may have sold or been retired.</p>
      <a class="btn btn-primary" href="index.html#shop">See the collection</a>
    </div>
  `;
}

function renderProduct(product) {
  document.title = `${product.title} | Micknack Stacks`;

  const images = product.images.length
    ? product.images
    : ["assets/products/placeholder.svg"];

  const gallery = `
    <div class="gallery">
      <div class="gallery-main">
        <img id="gallery-image" src="${images[0]}" alt="${escapeHtml(product.title)}" />
        ${product.badge ? `<span class="card-badge">${escapeHtml(product.badge)}</span>` : ""}
      </div>
      ${
        images.length > 1
          ? `<div class="gallery-thumbs">
              ${images
                .map(
                  (src, i) =>
                    `<button type="button" class="gallery-thumb${i === 0 ? " is-active" : ""}" data-src="${src}">
                       <img src="${src}" alt="View ${i + 1} of ${escapeHtml(product.title)}" loading="lazy" />
                     </button>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;

  const buyUrl = stripeEnabled ? stripeLinks[product.id]?.url : undefined;
  const actions = [];
  if (buyUrl) {
    actions.push(
      `<a class="btn btn-primary btn-lg" href="${buyUrl}" target="_blank" rel="noopener">Buy Now</a>`
    );
  }
  if (product.etsyUrl) {
    actions.push(
      `<a class="btn ${buyUrl ? "btn-secondary" : "btn-primary"} btn-lg" href="${product.etsyUrl}" target="_blank" rel="noopener">Buy on Etsy</a>`
    );
  }
  if (!actions.length) {
    actions.push(
      `<span class="btn btn-muted btn-lg">${escapeHtml(product.buttonLabel || "Coming soon")}</span>`
    );
  }

  const tags = product.tags.length
    ? `<div class="product-tags">
         <h2 class="detail-heading">Tagged</h2>
         <ul>${product.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
       </div>`
    : "";

  detail.innerHTML = `
    <div class="product-layout">
      ${gallery}
      <div class="product-info">
        <h1>${escapeHtml(product.title)}</h1>
        ${product.price ? `<div class="product-price">${formatPrice(product.price, product.currency_code)}</div>` : ""}
        ${buyUrl ? `<p class="shipping-note">${SHIPPING_NOTE}</p>` : ""}
        <div class="product-actions">${actions.join("")}</div>
        ${
          product.description
            ? `<div class="product-description">
                 <h2 class="detail-heading">Details</h2>
                 <p>${escapeHtml(product.description)}</p>
               </div>`
            : ""
        }
        ${tags}
      </div>
    </div>
  `;

  // Thumbnail clicks swap the main photo.
  const mainImage = document.getElementById("gallery-image");
  detail.querySelectorAll(".gallery-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      mainImage.src = button.dataset.src;
      detail
        .querySelectorAll(".gallery-thumb")
        .forEach((b) => b.classList.toggle("is-active", b === button));
    });
  });
}

const id = new URLSearchParams(location.search).get("id");
const product = id ? findProduct(id) : null;

if (product) {
  renderProduct(product);
} else {
  renderNotFound();
}
