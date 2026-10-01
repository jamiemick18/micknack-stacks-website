// The cart page: what's in the cart, what's still available, and the button
// that starts checkout.
//
// Availability is checked when the page opens, not only when someone presses
// Checkout, so a sold-out piece is obvious before they try to pay.

const cartRoot = document.getElementById("cart-contents");
document.getElementById("year").textContent = new Date().getFullYear();

const SHIPPING = 5;
const STOCK_ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/stock";

// id -> how many are left. Null until the worker answers; a piece that isn't
// listed is untracked and always available.
let stockMap = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function money(amount) {
  return "$" + Number(amount).toFixed(2);
}

function availableFor(id) {
  if (!stockMap || typeof stockMap[id] !== "number") return null; // untracked
  return stockMap[id];
}

// Lines that can't be bought as they stand.
//
// Stock belongs to the piece, not to each option of it: two lines of the same
// piece in different lengths draw on one count, so they're added together.
function problemLines() {
  const items = window.MICKNACK_CART.items();

  const wantedPerPiece = {};
  items.forEach((item) => {
    wantedPerPiece[item.id] = (wantedPerPiece[item.id] || 0) + item.quantity;
  });

  return items
    .map((item) => {
      const left = availableFor(item.id);
      if (left === null) return null;
      const wanted = wantedPerPiece[item.id];
      if (left <= 0) return { item, left: 0, wanted, kind: "sold_out" };
      if (wanted > left) return { item, left, wanted, kind: "too_many" };
      return null;
    })
    .filter(Boolean);
}

function fixCart() {
  const Cart = window.MICKNACK_CART;
  const problems = problemLines();

  // Sold out: the piece goes, in every option.
  problems
    .filter((p) => p.kind === "sold_out")
    .forEach((p) => Cart.remove(Cart.lineId(p.item)));

  // Too many: trim from the last line of that piece backwards until the
  // piece's lines add up to what's in stock.
  const overPieces = [...new Set(problems.filter((p) => p.kind === "too_many").map((p) => p.item.id))];
  overPieces.forEach((pieceId) => {
    const left = availableFor(pieceId);
    const lines = Cart.items().filter((item) => item.id === pieceId);
    let total = lines.reduce((sum, item) => sum + item.quantity, 0);

    for (let i = lines.length - 1; i >= 0 && total > left; i--) {
      const line = lines[i];
      const canKeep = Math.max(0, line.quantity - (total - left));
      total -= line.quantity - canKeep;
      if (canKeep === 0) Cart.remove(Cart.lineId(line));
      else Cart.setQuantity(Cart.lineId(line), canKeep);
    }
  });
}

function optionsLine(item) {
  const entries = Object.entries(item.options || {});
  if (!entries.length) return "";
  return `<div class="cart-options">${entries
    .map(([name, value]) => `${escapeHtml(name)}: ${escapeHtml(value)}`)
    .join(" &middot; ")}</div>`;
}

function renderCartPage() {
  const Cart = window.MICKNACK_CART;
  const items = Cart.items();

  if (!items.length) {
    cartRoot.innerHTML = `
      <div class="empty-state">
        <p>Your cart is empty.</p>
        <a class="btn btn-primary" href="index.html#shop">Browse the collection</a>
      </div>`;
    return;
  }

  const problems = problemLines();
  const problemIds = new Set(problems.map((p) => p.item.id));
  const subtotal = Cart.total();

  // One entry per piece, not per line: a piece in two options is still one
  // problem to the shopper.
  const problemsByPiece = [...new Map(problems.map((p) => [p.item.id, p])).values()];

  const banner = problems.length
    ? `<div class="cart-alert">
         <p class="cart-alert-title">${
           problemsByPiece.length === 1
             ? "One piece in your cart isn't available."
             : `${problemsByPiece.length} pieces in your cart aren't available.`
         }</p>
         <ul>
           ${problemsByPiece
             .map(
               (p) =>
                 `<li><strong>${escapeHtml(p.item.title)}</strong> — ${
                   p.kind === "sold_out"
                     ? "just sold out"
                     : `only ${p.left} left, your cart has ${p.wanted}${
                         p.wanted !== p.item.quantity ? " across its options" : ""
                       }`
                 }</li>`
             )
             .join("")}
         </ul>
         <button type="button" class="btn btn-primary" id="fix-cart">
           ${problems.every((p) => p.kind === "sold_out")
             ? problems.length === 1
               ? "Remove it and continue"
               : "Remove them and continue"
             : "Fix my cart"}
         </button>
       </div>`
    : "";

  cartRoot.innerHTML = `
    ${banner}
    <ul class="cart-lines">
      ${items
        .map((item) => {
          const line = Cart.lineId(item);
          const left = availableFor(item.id);
          const flagged = problemIds.has(item.id);
          const note =
            left !== null && left > 0 && left <= 2 && !flagged
              ? `<span class="cart-flag low">Only ${left} left</span>`
              : "";
          const problem = problems.find((p) => p.item.id === item.id);
          const problemChip = problem
            ? `<span class="cart-flag gone">${
                problem.kind === "sold_out" ? "Sold out" : `Only ${problem.left} left`
              }</span>`
            : "";

          return `
        <li class="cart-line${flagged ? " is-problem" : ""}" data-id="${escapeHtml(line)}">
          <a class="cart-thumb" href="product.html?id=${encodeURIComponent(item.id)}">
            <img src="${escapeHtml(item.image)}" alt="" loading="lazy" />
          </a>
          <div class="cart-line-meta">
            <a class="cart-title" href="product.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
            ${optionsLine(item)}
            <div class="cart-price">${money(item.price)} each ${problemChip}${note}</div>
          </div>
          <div class="cart-line-controls">
            <label class="sr-only" for="qty-${escapeHtml(line)}">Quantity</label>
            <input class="cart-qty" id="qty-${escapeHtml(line)}" type="number" min="0" max="20" step="1" value="${item.quantity}" data-qty="${escapeHtml(line)}" />
            <div class="cart-line-total">${money(Number(item.price) * item.quantity)}</div>
            <button type="button" class="cart-remove" data-remove="${escapeHtml(line)}">Remove</button>
          </div>
        </li>`;
        })
        .join("")}
    </ul>

    <div class="cart-summary">
      <div class="cart-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="cart-row"><span>Shipping</span><span>${money(SHIPPING)}</span></div>
      <div class="cart-row cart-total"><span>Total</span><span>${money(subtotal + SHIPPING)}</span></div>
      <p class="cart-note">One flat $5 shipping charge, however many pieces you order. Ships from Colorado.</p>
      <button type="button" class="btn btn-primary btn-lg" id="checkout"${problems.length ? " disabled" : ""}>Checkout</button>
      <p class="cart-error" id="checkout-error" hidden></p>
      <a class="cart-keep" href="index.html#shop">Keep shopping</a>
    </div>
  `;
}

cartRoot.addEventListener("change", (event) => {
  const input = event.target.closest("[data-qty]");
  if (!input) return;
  const quantity = Math.min(20, Math.max(0, Math.floor(Number(input.value) || 0)));
  window.MICKNACK_CART.setQuantity(input.dataset.qty, quantity);
});

cartRoot.addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    window.MICKNACK_CART.remove(remove.dataset.remove);
    return;
  }

  if (event.target.closest("#fix-cart")) {
    fixCart();
    return;
  }

  const checkout = event.target.closest("#checkout");
  if (!checkout) return;

  const error = document.getElementById("checkout-error");
  const items = window.MICKNACK_CART.items();

  const missingPrices = items.filter((item) => !item.price_id);
  if (missingPrices.length) {
    error.textContent =
      "Some pieces in your cart can't be bought here yet. Remove them, or use Buy on Etsy.";
    error.hidden = false;
    return;
  }

  if (!CHECKOUT_ENDPOINT) {
    error.textContent =
      "Checkout isn't switched on yet. Please email micknackstacks@gmail.com and I'll take your order.";
    error.hidden = false;
    return;
  }

  checkout.disabled = true;
  checkout.textContent = "Starting checkout…";
  error.hidden = true;

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item) => ({
          price_id: item.price_id,
          quantity: item.quantity,
          options: item.options || {},
        })),
      }),
    });
    const data = await response.json();

    // Something sold out between opening the cart and paying. Fold the
    // worker's answer into what we know and redraw, so the offending lines are
    // marked and the fix button appears.
    if (response.status === 409) {
      stockMap = stockMap || {};
      (data.items || []).forEach((entry) => {
        stockMap[entry.id] = entry.left;
      });
      renderCartPage();
      const refreshed = document.getElementById("checkout-error");
      refreshed.textContent = "Nothing has been charged.";
      refreshed.hidden = false;
      return;
    }

    if (!response.ok || !data.url) throw new Error(data.error || "Checkout failed");
    window.location.href = data.url;
  } catch (err) {
    error.textContent =
      "Checkout couldn't start. Try again, or email micknackstacks@gmail.com.";
    error.hidden = false;
    checkout.disabled = false;
    checkout.textContent = "Checkout";
  }
});

document.addEventListener("cart:changed", renderCartPage);
renderCartPage();

// Ask what's left, then redraw. The cart works without an answer; it just
// can't warn in advance.
fetch(STOCK_ENDPOINT, { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : null))
  .then((data) => {
    if (!data || typeof data.stock !== "object") return;
    stockMap = data.stock;
    renderCartPage();
  })
  .catch(() => {});
