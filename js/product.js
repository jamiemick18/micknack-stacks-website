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
    // Blank once the listing leaves Etsy, so Buy on Etsy disappears with it.
    etsyUrl: listing.etsy_active === false ? "" : listing.url || "",
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
  // Only when this piece cannot be bought here: otherwise a shopper already
  // on the page would be sent to Etsy to finish a sale that could happen
  // right where they are.
  if (product.etsyUrl && !buyUrl && !soldOut) {
    actions.push(
      `<a class="btn btn-primary btn-lg" href="${product.etsyUrl}" target="_blank" rel="noopener">Buy on Etsy</a>`
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
        <div class="product-title-row">
          <h1>${escapeHtml(product.title)}</h1>
          <button type="button" class="heart product-heart" data-heart="${escapeHtml(product.id)}"
                  data-heart-title="${escapeHtml(product.title)}"></button>
        </div>
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

// A share page at /p/<id>.html sets this before the scripts run, so it does
// not need a query string. product.html?id=... still works.
// Three more pieces from the same shelf, so a product page is somewhere to
// carry on from rather than a dead end. Stacking is the whole idea, after all.
function renderAlsoLike(product, all) {
  const host = document.getElementById("also-like");
  if (!host) return;

  const shelfOf = window.MICKNACK_CATEGORY_OF || {};
  const mine = shelfOf[String(product.id)];
  const stock = window.MICKNACK_STOCK;

  const candidates = all
    .filter((piece) => String(piece.id) !== String(product.id))
    .filter((piece) => !stock.of(String(piece.id)).hidden)
    .filter((piece) => !stock.of(String(piece.id)).soldOut)
    .map((piece) => ({
      piece,
      // Same shelf first, then anything else, so there is always something.
      rank: shelfOf[String(piece.id)] === mine ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map((entry) => entry.piece);

  if (candidates.length < 2) return; // one lonely suggestion is not a row

  host.innerHTML =
    `<h2 class="also-heading">Completes the stack</h2>` +
    `<div class="also-row">` +
    candidates
      .map(
        (piece) => `
        <a class="also-card" href="/p/${encodeURIComponent(piece.id)}.html">
          <img src="${escapeHtml((piece.images || [])[0] || "/assets/products/placeholder.svg")}"
               alt="" loading="lazy" />
          <span class="also-title">${escapeHtml((piece.title || "").split("|")[0].trim())}</span>
          ${piece.price ? `<span class="also-price">${escapeHtml(piece.price)}</span>` : ""}
        </a>`
      )
      .join("") +
    `</div>`;
  host.hidden = false;
}

// Everything the shop sells, Etsy pieces and site-only ones alike.
function allPieces() {
  const listings = (window.MICKNACK_PRODUCTS && window.MICKNACK_PRODUCTS.listings) || [];
  const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS) ? window.MICKNACK_EXTRA_PRODUCTS : [];
  return [
    ...listings.map((l) => ({ id: String(l.listing_id), title: l.title, price: l.price, images: l.images })),
    ...extras.map((e) => ({ id: String(e.id), title: e.title, price: e.price, images: e.images })),
  ];
}

const id =
  window.MICKNACK_PRODUCT_ID || new URLSearchParams(location.search).get("id");
const product = id ? findProduct(id) : null;

// Redraw once the worker says what's actually left.
window.MICKNACK_STOCK.loadLive(STOCK_ENDPOINT).then((ok) => {
  if (ok && product && !window.MICKNACK_STOCK.of(product.id).hidden) renderProduct(product);
});

// A hidden piece is treated as if it isn't on the site.
if (product && !window.MICKNACK_STOCK.of(product.id).hidden) {
  renderProduct(product);
  renderAlsoLike(product, allPieces());
  if (window.MICKNACK_PAINT_HEARTS) window.MICKNACK_PAINT_HEARTS();
} else {
  renderNotFound();
}
