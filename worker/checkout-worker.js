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
 *   GET  /views     how many have looked, here and on Etsy
 *   POST /views     count one more visit here
 *   GET  /hearts    how many have saved each piece
 *   POST /hearts    save or unsave one, counted but not attributed
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
  const etsyViews = body.etsy_views; // Etsy own view count, read by the sync

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

  if (typeof etsyViews === "number" && etsyViews >= 0) {
    await env.STOCK.put("views:etsy", String(Math.floor(etsyViews)));
    written++;
  }

  for (const [priceId, pieceId] of Object.entries(prices)) {
    await env.STOCK.put(`price:${priceId}`, String(pieceId));
    written++;
  }

  return json({ ok: true, written }, 200, cors);
}

// ---------------------------------------------------------------- hearts ----

// How many people have saved each piece, and nothing else.
//
// The browser sends a random id it made up for itself, which exists for one
// reason: so hearting the same piece twice, or hearting and unhearting all
// afternoon, counts once. It is never stored against an email, a name, an
// address or a basket, and two ids cannot be told apart or joined up. What
// comes out is a number per piece.
//
// KV holds  heart:<piece>            the count
//           saved:<visitor>:<piece>  that this browser has it saved

const HEART_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function readHearts(env) {
  const counts = {};
  let cursor;
  do {
    const page = await env.STOCK.list({ prefix: "heart:", cursor });
    for (const key of page.keys) {
      const piece = key.name.slice("heart:".length);
      const value = await env.STOCK.get(key.name);
      const count = Math.max(0, parseInt(value || "0", 10) || 0);
      if (count > 0) counts[piece] = count;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return counts;
}

async function handleHeart(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Could not read that." }, 400, cors);
  }

  const piece = String(body.piece || "");
  const visitor = String(body.visitor || "");
  const saving = body.saved !== false;

  if (!HEART_ID.test(piece) || !HEART_ID.test(visitor)) {
    return json({ error: "Not a piece we know." }, 400, cors);
  }

  const marker = `saved:${visitor}:${piece}`;
  const already = await env.STOCK.get(marker);

  // Nothing to do: saving what is already saved, or removing what is not.
  if (Boolean(already) === saving) {
    const current = await env.STOCK.get(`heart:${piece}`);
    return json({ saved: Math.max(0, parseInt(current || "0", 10) || 0) }, 200, cors);
  }

  const current = Math.max(0, parseInt((await env.STOCK.get(`heart:${piece}`)) || "0", 10) || 0);
  const next = Math.max(0, current + (saving ? 1 : -1));

  await env.STOCK.put(`heart:${piece}`, String(next));
  if (saving) {
    // A year is long enough to stop double counting and short enough that a
    // browser nobody uses any more stops taking up room.
    await env.STOCK.put(marker, "1", { expirationTtl: 31536000 });
  } else {
    await env.STOCK.delete(marker);
  }

  return json({ saved: next }, 200, { ...cors, "Cache-Control": "no-store" });
}

// ----------------------------------------------------------------- views ----

// Two numbers: visits to the shop own pages, counted here, and Etsy own count,
// pushed in by the sync. Kept apart so neither can overwrite the other, and
// added together only when they are read.
async function readViews(env) {
  const [site, etsy] = await Promise.all([
    env.STOCK.get("views:site"),
    env.STOCK.get("views:etsy"),
  ]);
  const siteCount = Math.max(0, parseInt(site || "0", 10) || 0);
  const etsyCount = Math.max(0, parseInt(etsy || "0", 10) || 0);
  return { site: siteCount, etsy: etsyCount, total: siteCount + etsyCount };
}

async function countView(env, cors) {
  const current = await readViews(env);
  const next = current.site + 1;
  await env.STOCK.put("views:site", String(next));
  return json({ site: next, etsy: current.etsy, total: next + current.etsy }, 200, {
    ...cors,
    "Cache-Control": "no-store",
  });
}

// --------------------------------------------------------------- reviews ----

// Kind words from people who bought here rather than on Etsy.
//
// Nothing written here appears on the shop until Jamie has read it and said
// yes. That is the whole design: a form that publishes itself is a form that
// publishes whatever the internet feels like saying that day.
//
// KV holds  review:<id>   the review, with a status of pending or approved
//           rvlimit:<ip>  that this address has written recently
//
// The email address, if one is given, is never sent back out: it is there so
// Jamie can reply, not so the world can read it.

const REVIEW_MAX = 1200;
const REVIEW_NAME_MAX = 60;
const REVIEW_WINDOW_SECONDS = 600;

function cleanText(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

async function readReviews(env, { approvedOnly }) {
  const out = [];
  let cursor;
  do {
    const page = await env.STOCK.list({ prefix: "review:", cursor });
    for (const key of page.keys) {
      const raw = await env.STOCK.get(key.name);
      if (!raw) continue;
      let review;
      try {
        review = JSON.parse(raw);
      } catch (err) {
        continue;
      }
      if (approvedOnly && review.status !== "approved") continue;
      out.push(
        approvedOnly
          ? { id: review.id, name: review.name, rating: review.rating, text: review.text, piece: review.piece, date: review.date }
          : review
      );
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  out.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return out;
}

async function handleReview(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Could not read that." }, 400, cors);
  }

  // A hidden field no person ever sees. Something that fills in every box on
  // the page has told on itself.
  if (cleanText(body.website, 40)) return json({ ok: true }, 200, cors);

  const rating = Math.round(Number(body.rating));
  const text = cleanText(body.text, REVIEW_MAX);
  const name = cleanText(body.name, REVIEW_NAME_MAX);
  const email = cleanText(body.email, 160);
  const piece = cleanText(body.piece, 160);

  if (!(rating >= 1 && rating <= 5)) return json({ error: "Please pick a star rating." }, 400, cors);
  if (text.length < 4) return json({ error: "Please write a little more." }, 400, cors);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "That email address does not look right." }, 400, cors);
  }

  // One review per address per ten minutes. Enough to stop a script, not
  // enough to stop a couple writing one each on the same wifi.
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (ip) {
    const key = `rvlimit:${ip}`;
    if (await env.STOCK.get(key)) {
      return json({ error: "Thank you — that came through already." }, 429, cors);
    }
    await env.STOCK.put(key, "1", { expirationTtl: REVIEW_WINDOW_SECONDS });
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const review = {
    id,
    status: "pending",
    name: name || "Anonymous",
    email,
    rating,
    text,
    piece,
    date: new Date().toISOString().slice(0, 10),
  };
  await env.STOCK.put(`review:${id}`, JSON.stringify(review));

  return json({ ok: true, message: "Thank you. Jamie reads every one before it goes up." }, 200, cors);
}

// Approving, hiding and deleting all happen from the HUB, behind the same
// admin token the stock push uses.
async function handleReviewAdmin(request, env, cors) {
  // A secret of its own, so moderating reviews from the HUB never needs the
  // one that can rewrite stock. Falls back to the stock secret only if no
  // separate one was ever set.
  const expected = env.REVIEW_TOKEN || env.ADMIN_TOKEN;
  if (!expected || request.headers.get("X-Admin-Token") !== expected) {
    return json({ error: "Not allowed." }, 401, cors);
  }
  if (request.method === "GET") {
    return json({ reviews: await readReviews(env, { approvedOnly: false }) }, 200, {
      ...cors,
      "Cache-Control": "no-store",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: "Could not read that." }, 400, cors);
  }

  const id = cleanText(body.id, 64);
  const action = cleanText(body.action, 20);
  if (!id) return json({ error: "Which review?" }, 400, cors);

  const key = `review:${id}`;
  const raw = await env.STOCK.get(key);
  if (!raw) return json({ error: "That review is not here." }, 404, cors);

  if (action === "delete") {
    await env.STOCK.delete(key);
    return json({ ok: true, status: "deleted" }, 200, cors);
  }
  if (action !== "approve" && action !== "hide") {
    return json({ error: "Approve, hide or delete." }, 400, cors);
  }

  const review = JSON.parse(raw);
  review.status = action === "approve" ? "approved" : "pending";
  await env.STOCK.put(key, JSON.stringify(review));
  return json({ ok: true, status: review.status }, 200, cors);
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
  //
  // Stock belongs to the piece, not to each option of it, so a cart holding
  // 3 × 6mm and 3 × 8mm of the same piece wants six of it — add the lines of a
  // piece together before comparing, or each would pass on its own.
  const wantedPerPiece = new Map();
  for (const line of lines) {
    const pieceId = await pieceForPrice(env, line.price);
    if (!pieceId) continue; // unknown price: not stock-tracked
    wantedPerPiece.set(pieceId, (wantedPerPiece.get(pieceId) || 0) + line.quantity);
  }

  const unavailable = [];
  for (const [pieceId, wanted] of wantedPerPiece) {
    const left = await readQty(env, pieceId);
    if (left === null) continue; // untracked
    if (left < wanted) unavailable.push({ id: pieceId, left: Math.max(0, left), wanted });
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

    if (path === "/hearts" && request.method === "GET") {
      if (!env.STOCK) return json({ counts: {} }, 200, cors);
      return json({ counts: await readHearts(env) }, 200, {
        ...cors,
        "Cache-Control": "no-store",
      });
    }

    if (path === "/hearts" && request.method === "POST") {
      if (!env.STOCK) return json({ saved: 0 }, 200, cors);
      return handleHeart(request, env, cors);
    }

    if (path === "/views" && (request.method === "GET" || request.method === "POST")) {
      if (!env.STOCK) return json({ site: 0, etsy: 0, total: 0 }, 200, cors);
      if (request.method === "POST") return countView(env, cors);
      return json(await readViews(env), 200, { ...cors, "Cache-Control": "no-store" });
    }

    if (path === "/reviews" && request.method === "GET") {
      if (!env.STOCK) return json({ reviews: [] }, 200, cors);
      return json({ reviews: await readReviews(env, { approvedOnly: true }) }, 200, {
        ...cors,
        "Cache-Control": "no-store",
      });
    }

    if (path === "/reviews" && request.method === "POST") {
      if (!env.STOCK) return json({ error: "Reviews aren't set up yet." }, 500, cors);
      return handleReview(request, env, cors);
    }

    if (path === "/reviews/admin" && (request.method === "GET" || request.method === "POST")) {
      if (!env.STOCK) return json({ error: "No store bound." }, 500, cors);
      return handleReviewAdmin(request, env, cors);
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
