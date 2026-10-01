/**
 * Micknack Stacks checkout endpoint (Cloudflare Worker).
 *
 * The shop is static files on GitHub Pages, which can't hold a Stripe secret
 * key, and Stripe removed browser-only checkout — so turning a cart into a
 * Checkout Session has to happen here.
 *
 * This also owns stock, because stock has to live somewhere that can say "no"
 * at the moment of payment:
 *
 *   GET  /stock     what's left of each piece, for the shop to grey out
 *   POST /          create a checkout session (refuses sold-out pieces)
 *   POST /webhook   Stripe tells us a payment succeeded; counts come down
 *   POST /admin     set counts (needs ADMIN_TOKEN)
 *
 * Bindings it needs — see worker/README.md:
 *   STOCK              KV namespace
 *   STRIPE_SECRET_KEY  secret
 *   STRIPE_WEBHOOK_SECRET  secret (for /webhook)
 *   ADMIN_TOKEN        secret (for /admin)
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
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

async function stripe(env, path, params, method = "POST") {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? encodeForm(params) : undefined,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe ${response.status}: ${body.error && body.error.message}`);
  }
  return body;
}

// ---------------------------------------------------------------- stock ----
// KV holds two kinds of key:
//   qty:<piece id>     how many are left ("3")
//   price:<price id>   which piece a Stripe price belongs to
// A piece with no qty key is untracked and always sellable, so nothing is
// accidentally unbuyable just because it was never counted.

async function readQty(env, pieceId) {
  const raw = await env.STOCK.get(`qty:${pieceId}`);
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function pieceForPrice(env, priceId) {
  return env.STOCK.get(`price:${priceId}`);
}

async function allStock(env) {
  const out = {};
  let cursor;
  do {
    const page = await env.STOCK.list({ prefix: "qty:", cursor });
    for (const key of page.keys) {
      const value = await env.STOCK.get(key.name);
      out[key.name.slice(4)] = Number(value);
    }
    cursor = page.cursor;
    if (page.list_complete) break;
  } while (cursor);
  return out;
}

// --------------------------------------------------------------- webhook ----

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Stripe signs each webhook; an unsigned or mis-signed one is someone else
// pretending to be Stripe, and would let them zero out stock at will.
async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=").map((s) => s.trim()))
  );
  if (!parts.t || !parts.v1) return false;

  // Reject anything older than five minutes, so a captured call can't be replayed.
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parts.t}.${payload}`)
  );
  return timingSafeEqual(new Uint8Array(signed), hexToBytes(parts.v1));
}

async function handleWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature");

  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("Bad signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed") {
    return json({ received: true }, 200, {});
  }

  const sessionId = event.data.object.id;
  const lineItems = await stripe(env, `/checkout/sessions/${sessionId}/line_items?limit=100`, null, "GET");

  for (const item of lineItems.data || []) {
    const priceId = item.price && item.price.id;
    if (!priceId) continue;
    const pieceId = await pieceForPrice(env, priceId);
    if (!pieceId) continue;

    const current = await readQty(env, pieceId);
    if (current === null) continue; // untracked piece: nothing to count down
    const next = Math.max(0, current - (item.quantity || 1));
    await env.STOCK.put(`qty:${pieceId}`, String(next));
  }

  return json({ received: true }, 200, {});
}

// ----------------------------------------------------------------- admin ----

async function handleAdmin(request, env, cors) {
  if (request.headers.get("X-Admin-Token") !== env.ADMIN_TOKEN) {
    return json({ error: "Not allowed." }, 401, cors);
  }

  const body = await request.json();
  const quantities = body.quantities || {}; // set outright
  const deltas = body.deltas || {}; // adjust by this much
  const prices = body.prices || {};

  let written = 0;

  for (const [pieceId, qty] of Object.entries(quantities)) {
    if (qty === null) await env.STOCK.delete(`qty:${pieceId}`);
    else await env.STOCK.put(`qty:${pieceId}`, String(Math.max(0, Math.floor(Number(qty) || 0))));
    written++;
  }

  // Etsy sales arrive as changes, never as a fresh total: copying Etsy's count
  // over ours would undo anything sold through this site since the last sync.
  for (const [pieceId, change] of Object.entries(deltas)) {
    const amount = Math.floor(Number(change) || 0);
    if (!amount) continue;
    const current = await readQty(env, pieceId);
    if (current === null) continue; // untracked piece: leave it alone
    await env.STOCK.put(`qty:${pieceId}`, String(Math.max(0, current + amount)));
    written++;
  }

  for (const [priceId, pieceId] of Object.entries(prices)) {
    await env.STOCK.put(`price:${priceId}`, String(pieceId));
    written++;
  }

  return json({ ok: true, written }, 200, cors);
}

// -------------------------------------------------------------- checkout ----

async function handleCheckout(request, env, cors, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: "Could not read the cart." }, 400, cors);
  }

  const requested = (Array.isArray(payload.items) ? payload.items : [])
    .slice(0, MAX_LINES)
    .map((item) => ({
      price: String(item.price_id || ""),
      quantity: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(item.quantity) || 1))),
      options: item.options && typeof item.options === "object" ? item.options : {},
    }))
    .filter((line) => /^price_[A-Za-z0-9]+$/.test(line.price));

  const lines = requested.map(({ price, quantity }) => ({ price, quantity }));

  if (!lines.length) return json({ error: "Your cart is empty." }, 400, cors);

  // Refuse before taking any money: this is the only moment that can actually
  // stop a sold-out piece being bought.
  const unavailable = [];
  for (const line of lines) {
    const pieceId = await pieceForPrice(env, line.price);
    if (!pieceId) continue; // unknown price: not stock-tracked
    const left = await readQty(env, pieceId);
    if (left === null) continue; // untracked
    if (left <= 0) unavailable.push({ id: pieceId, left: 0, wanted: line.quantity });
    else if (left < line.quantity) unavailable.push({ id: pieceId, left, wanted: line.quantity });
  }

  if (unavailable.length) {
    return json(
      {
        error: "sold_out",
        message:
          unavailable.length === 1 && unavailable[0].left === 0
            ? "That piece just sold out. Please remove it from your cart."
            : "Some pieces in your cart aren't available in that quantity any more.",
        items: unavailable,
      },
      409,
      cors
    );
  }

  const siteOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // The buyer's choices ride along as metadata, so the order in Stripe says
  // which length or colour to pack. Stripe caps a value at 500 characters.
  const metadata = {};
  for (const line of requested) {
    const chosen = Object.entries(line.options)
      .map(([name, value]) => `${name}: ${value}`)
      .join(", ");
    if (!chosen) continue;
    const pieceId = (await pieceForPrice(env, line.price)) || line.price;
    metadata[`opt_${String(pieceId).slice(0, 36)}`] = chosen.slice(0, 500);
  }

  try {
    const session = await stripe(env, "/checkout/sessions", {
      mode: "payment",
      line_items: lines,
      metadata,
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
    });
    return json({ url: session.url }, 200, cors);
  } catch (err) {
    console.error(err.message);
    return json({ error: "Checkout couldn't start. Please try again." }, 502, cors);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Stripe signs its own requests; it doesn't send an Origin we'd allow.
    if (path === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    if (path === "/stock" && request.method === "GET") {
      if (!env.STOCK) return json({ stock: {} }, 200, cors);
      return json({ stock: await allStock(env) }, 200, {
        ...cors,
        "Cache-Control": "no-store",
      });
    }

    if (path === "/admin" && request.method === "POST") {
      if (!env.STOCK) return json({ error: "No stock store bound." }, 500, cors);
      return handleAdmin(request, env, cors);
    }

    if (path === "/" && request.method === "POST") {
      if (!env.STRIPE_SECRET_KEY) return json({ error: "Checkout isn't configured yet." }, 500, cors);
      return handleCheckout(request, env, cors, origin);
    }

    return json({ error: "Use POST." }, 405, cors);
  },
};
