/**
 * Micknack Stacks checkout endpoint (Cloudflare Worker).
 *
 * The shop is static files on GitHub Pages, which can't talk to Stripe with a
 * secret key. Stripe also removed browser-only checkout, so a cart of several
 * pieces has to be turned into a Checkout Session somewhere server-side. This
 * is that somewhere: it takes a cart, asks Stripe for a checkout page, and
 * returns its URL.
 *
 * Deploy: see worker/README.md. Needs one secret, STRIPE_SECRET_KEY.
 *
 * Prices are never sent by the browser — only Stripe price ids are — so a
 * tampered cart cannot change what anything costs.
 */

const ALLOWED_ORIGINS = [
  "https://micknackstacks.com",
  "https://www.micknackstacks.com",
  "https://jamiemick18.github.io",
  "http://localhost:5173",
];

const SHIPPING_CENTS = 500; // flat $5.00, charged once per order
const MAX_LINES = 40;
const MAX_QTY = 20;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Stripe takes form-encoded bodies with bracketed nesting.
function encodeForm(obj, prefix = "", out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) =>
        typeof item === "object"
          ? encodeForm(item, `${name}[${i}]`, out)
          : out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(item)}`)
      );
    } else if (typeof value === "object") {
      encodeForm(value, name, out);
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  return out.join("&");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, cors);
    if (!env.STRIPE_SECRET_KEY) return json({ error: "Checkout isn't configured yet." }, 500, cors);

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return json({ error: "Could not read the cart." }, 400, cors);
    }

    // Accept only what we need: a Stripe price id and a sane quantity.
    const lines = (Array.isArray(payload.items) ? payload.items : [])
      .slice(0, MAX_LINES)
      .map((item) => ({
        price: String(item.price_id || ""),
        quantity: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(item.quantity) || 1))),
      }))
      .filter((line) => /^price_[A-Za-z0-9]+$/.test(line.price));

    if (!lines.length) return json({ error: "Your cart is empty." }, 400, cors);

    const siteOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const params = {
      mode: "payment",
      line_items: lines,
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Shipping",
            type: "fixed_amount",
            fixed_amount: { amount: SHIPPING_CENTS, currency: "usd" },
          },
        },
      ],
      success_url: `${siteOrigin}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}/cart.html`,
    };

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeForm(params),
    });

    const session = await response.json();
    if (!response.ok) {
      // Stripe's own message is for us, not the shopper.
      console.error("Stripe error:", session.error && session.error.message);
      return json({ error: "Checkout couldn't start. Please try again." }, 502, cors);
    }

    return json({ url: session.url }, 200, cors);
  },
};
