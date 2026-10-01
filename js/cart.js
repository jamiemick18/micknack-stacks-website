// The shopping cart: kept in this browser, checked out through the Cloudflare
// worker in worker/checkout-worker.js.
//
// The Cloudflare Worker that turns a cart into a Stripe checkout page.
// See worker/README.md if this ever needs redeploying.
const CHECKOUT_ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev";

const CART_KEY = "micknack-cart";

const Cart = {
  items() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  },

  save(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (err) {
      /* a blocked store just means the cart doesn't survive a reload */
    }
    document.dispatchEvent(new CustomEvent("cart:changed"));
  },

  count() {
    return this.items().reduce((total, item) => total + item.quantity, 0);
  },

  total() {
    return this.items().reduce(
      (sum, item) => sum + Number(item.price || 0) * item.quantity,
      0
    );
  },

  add(piece) {
    const items = this.items();
    const existing = items.find((item) => item.id === piece.id);
    if (existing) existing.quantity = Math.min(20, existing.quantity + 1);
    else items.push({ ...piece, quantity: 1 });
    this.save(items);
  },

  setQuantity(id, quantity) {
    const items = this.items()
      .map((item) => (item.id === id ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0);
    this.save(items);
  },

  remove(id) {
    this.save(this.items().filter((item) => item.id !== id));
  },

  clear() {
    this.save([]);
  },
};

window.MICKNACK_CART = Cart;

function formatMoney(amount) {
  return "$" + Number(amount).toFixed(2);
}

// The cart count in the header, on every page.
function renderCartLink() {
  const link = document.getElementById("cart-link");
  if (!link) return;
  const count = Cart.count();
  link.textContent = count ? `Cart (${count})` : "Cart";
}

document.addEventListener("cart:changed", renderCartLink);
// Another tab may have changed the cart.
window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) {
    renderCartLink();
    if (typeof renderCartPage === "function") renderCartPage();
  }
});

// Add to cart, wherever the button appears.
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-to-cart]");
  if (!button) return;
  event.preventDefault();

  Cart.add({
    id: button.dataset.id,
    price_id: button.dataset.priceId,
    title: button.dataset.title,
    price: button.dataset.price,
    image: button.dataset.image || "",
  });

  const original = button.textContent;
  button.textContent = "Added";
  button.classList.add("is-added");
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove("is-added");
  }, 1400);
});

renderCartLink();
