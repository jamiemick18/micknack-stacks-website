// The cart page: what's in the cart, and the button that starts checkout.

const cartRoot = document.getElementById("cart-contents");
document.getElementById("year").textContent = new Date().getFullYear();

const SHIPPING = 5;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function money(amount) {
  return "$" + Number(amount).toFixed(2);
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

  const subtotal = Cart.total();

  cartRoot.innerHTML = `
    <ul class="cart-lines">
      ${items
        .map(
          (item) => `
        <li class="cart-line" data-id="${escapeHtml(item.id)}">
          <a class="cart-thumb" href="product.html?id=${encodeURIComponent(item.id)}">
            <img src="${escapeHtml(item.image)}" alt="" loading="lazy" />
          </a>
          <div class="cart-line-meta">
            <a class="cart-title" href="product.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
            <div class="cart-price">${money(item.price)} each</div>
          </div>
          <div class="cart-line-controls">
            <label class="sr-only" for="qty-${escapeHtml(item.id)}">Quantity</label>
            <input class="cart-qty" id="qty-${escapeHtml(item.id)}" type="number" min="0" max="20" step="1" value="${item.quantity}" data-qty="${escapeHtml(item.id)}" />
            <div class="cart-line-total">${money(Number(item.price) * item.quantity)}</div>
            <button type="button" class="cart-remove" data-remove="${escapeHtml(item.id)}">Remove</button>
          </div>
        </li>`
        )
        .join("")}
    </ul>

    <div class="cart-summary">
      <div class="cart-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="cart-row"><span>Shipping</span><span>${money(SHIPPING)}</span></div>
      <div class="cart-row cart-total"><span>Total</span><span>${money(subtotal + SHIPPING)}</span></div>
      <p class="cart-note">One flat $5 shipping charge, however many pieces you order. Ships from Colorado.</p>
      <button type="button" class="btn btn-primary btn-lg" id="checkout">Checkout</button>
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
        items: items.map((item) => ({ price_id: item.price_id, quantity: item.quantity })),
      }),
    });
    const data = await response.json();

    // Something in the cart sold out between adding it and paying.
    if (response.status === 409) {
      const names = (data.items || [])
        .map((entry) => {
          const line = window.MICKNACK_CART.items().find((item) => item.id === entry.id);
          const title = line ? line.title : "a piece";
          return entry.left === 0 ? `${title} (sold out)` : `${title} (only ${entry.left} left)`;
        })
        .join("; ");
      error.textContent = `${data.message} ${names}`.trim();
      error.hidden = false;
      checkout.disabled = false;
      checkout.textContent = "Checkout";
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
