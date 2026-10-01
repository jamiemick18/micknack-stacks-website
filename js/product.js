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
      video: extra.video || "",
      variations: Array.isArray(extra.variations) ? extra.variations : [],
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
    video: listing.video || "",
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

  const stock = window.MICKNACK_STOCK.of(product.id);
  const soldOut = stock.soldOut;

  // A video, when there is one, leads the gallery.
  const media = [];
  if (product.video) media.push({ type: "video", src: product.video });
  const images = product.images.length
    ? product.images
    : ["assets/products/placeholder.svg"];
  images.forEach((src) => media.push({ type: "image", src }));

  const first = media[0];
  const mainSlot =
    first.type === "video"
      ? `<video id="gallery-video" src="${first.src}" controls playsinline preload="metadata"${
          images[0] ? ` poster="${images[0]}"` : ""
        }></video>`
      : `<img id="gallery-image" src="${first.src}" alt="${escapeHtml(product.title)}" />`;

  const gallery = `
    <div class="gallery">
      <div class="gallery-main" id="gallery-main">
        ${mainSlot}
        ${
          soldOut
            ? `<span class="card-badge">Sold out</span>`
            : product.badge
            ? `<span class="card-badge">${escapeHtml(product.badge)}</span>`
            : ""
        }
      </div>
      ${
        media.length > 1
          ? `<div class="gallery-thumbs">
              ${media
                .map(
                  (item, i) =>
                    `<button type="button" class="gallery-thumb${i === 0 ? " is-active" : ""}"
                       data-type="${item.type}" data-src="${item.src}">
                       ${
                         item.type === "video"
                           ? `<video src="${item.src}" muted playsinline preload="metadata"></video><span class="play-mark" aria-hidden="true">▶</span>`
                           : `<img src="${item.src}" alt="View ${i + 1} of ${escapeHtml(product.title)}" loading="lazy" />`
                       }
                     </button>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;

  const buyUrl = !soldOut && stripeEnabled ? stripeLinks[product.id]?.url : undefined;
  const actions = [];
  if (soldOut) {
    actions.push(`<span class="btn btn-muted btn-lg">Sold out</span>`);
  } else if (buyUrl) {
    const priceId = (stripeLinks[product.id] || {}).price_id || "";
    actions.push(
      priceId
        ? `<button type="button" class="btn btn-primary btn-lg" data-add-to-cart
             data-id="${escapeHtml(product.id)}"
             data-price-id="${escapeHtml(priceId)}"
             data-title="${escapeHtml(product.title)}"
             data-price="${escapeHtml(product.price || "")}"
             data-image="${escapeHtml(images[0] || "")}">Add to cart</button>`
        : `<a class="btn btn-primary btn-lg" href="${buyUrl}" target="_blank" rel="noopener">Buy Now</a>`
    );
  }

  // Drop-downs the buyer picks from, the way Etsy's options work. Every one
  // has to be chosen before the piece can go in the cart. data/variations.js
  // wins, so an Etsy piece can be given options without touching its listing.
  const variations =
    (window.MICKNACK_VARIATIONS || {})[product.id] ||
    (Array.isArray(product.variations) ? product.variations : []);
  const optionsBlock =
    variations.length && !soldOut
      ? `<div class="product-options">
           ${variations
             .map((variation, i) => {
               const id = `option-${i}`;
               return `<div class="option-field">
                   <label for="${id}">${escapeHtml(variation.name)}</label>
                   <select id="${id}" data-option-name="${escapeHtml(variation.name)}">
                     <option value="">Choose ${escapeHtml(variation.name.toLowerCase())}</option>
                     ${(variation.options || [])
                       .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
                       .join("")}
                   </select>
                 </div>`;
             })
             .join("")}
           <p class="option-error" data-option-error hidden></p>
         </div>`
      : "";
  if (product.etsyUrl) {
    actions.push(
      `<a class="btn ${buyUrl && !soldOut ? "btn-secondary" : "btn-primary"} btn-lg" href="${product.etsyUrl}" target="_blank" rel="noopener">Buy on Etsy</a>`
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
        ${soldOut ? `<p class="shipping-note">This piece is sold out right now.</p>` : ""}
        <div data-options-for="${escapeHtml(product.id)}">
          ${optionsBlock}
          <div class="product-actions">${actions.join("")}</div>
        </div>
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

  // Thumbnail clicks swap what's in the main slot, photo or video.
  const mainBox = document.getElementById("gallery-main");
  detail.querySelectorAll(".gallery-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      const badge = mainBox.querySelector(".card-badge");
      const type = button.dataset.type;
      const src = button.dataset.src;
      mainBox.querySelectorAll("img, video").forEach((node) => node.remove());

      if (type === "video") {
        const video = document.createElement("video");
        video.id = "gallery-video";
        video.src = src;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        mainBox.prepend(video);
      } else {
        const img = document.createElement("img");
        img.id = "gallery-image";
        img.src = src;
        img.alt = product.title;
        mainBox.prepend(img);
      }
      if (badge) mainBox.appendChild(badge);

      detail
        .querySelectorAll(".gallery-thumb")
        .forEach((b) => b.classList.toggle("is-active", b === button));
    });
  });
}

const STOCK_ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/stock";

const id = new URLSearchParams(location.search).get("id");
const product = id ? findProduct(id) : null;

// Redraw once the worker says what's actually left.
window.MICKNACK_STOCK.loadLive(STOCK_ENDPOINT).then((ok) => {
  if (ok && product && !window.MICKNACK_STOCK.of(product.id).hidden) renderProduct(product);
});

// A hidden piece is treated as if it isn't on the site.
if (product && !window.MICKNACK_STOCK.of(product.id).hidden) {
  renderProduct(product);
} else {
  renderNotFound();
}
