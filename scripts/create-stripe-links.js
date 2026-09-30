// Creates a Stripe Payment Link for every priced item in the catalog and
// writes the results to data/stripe-links.js, which the site reads to show
// "Buy Now" buttons.
//
// Why Payment Links: the site is static files on GitHub Pages with no server,
// and Stripe Checkout Sessions need a backend to create them. Payment Links
// are plain URLs Stripe hosts, so they work from a static page and cost
// nothing to keep around.
//
// Usage:
//   node scripts/create-stripe-links.js          # test mode, from .env
//   node scripts/create-stripe-links.js --live    # uses STRIPE_SECRET_KEY_LIVE
//
// Safe to re-run. It only creates a link when an item has no link yet, or
// when its price changed (in which case the old link is deactivated).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LIVE = process.argv.includes("--live");
const SITE_URL = "https://micknackstacks.com/";
const SHIPPING_COUNTRIES = ["US"];
const SHIPPING_AMOUNT_CENTS = 500; // flat $5.00 shipping
const SHIPPING_LABEL = "Shipping";

// A payment link's options are fixed once created, so changing them means
// building new links. Bump this when the options below change (shipping,
// redirect, address collection) and existing links get rebuilt on next run.
const CONFIG_VERSION = 2;

function loadEnv() {
  const env = { ...process.env };
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!env[key]) env[key] = trimmed.slice(eq + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const SECRET_KEY = LIVE ? env.STRIPE_SECRET_KEY_LIVE : env.STRIPE_SECRET_KEY;

if (!SECRET_KEY) {
  console.error(
    `Missing ${LIVE ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY"} in .env`
  );
  process.exit(1);
}
// Stripe issues sk_ for standard secret keys and rk_ for restricted ones; the
// "full access except sensitive operations" option gives an rk_ key, which is
// the recommended choice here and works fine for everything this script does.
const isLiveKey = /^(sk|rk)_live_/.test(SECRET_KEY);
if (LIVE && !isLiveKey) {
  console.error("--live was passed but STRIPE_SECRET_KEY_LIVE is not a live key (sk_live_ or rk_live_).");
  process.exit(1);
}
if (!LIVE && isLiveKey) {
  console.error("STRIPE_SECRET_KEY looks like a LIVE key. Refusing to run without --live.");
  process.exit(1);
}

// Stripe's API takes form-encoded bodies with bracketed nesting, e.g.
// line_items[0][price]=price_123
function encodeForm(obj, prefix = "", out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) =>
        typeof v === "object"
          ? encodeForm(v, `${name}[${i}]`, out)
          : out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(v)}`)
      );
    } else if (typeof value === "object") {
      encodeForm(value, name, out);
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  return out.join("&");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stripe(path, params, method = "POST") {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params ? encodeForm(params) : undefined,
    });
    const body = await res.json();
    if (res.ok) return body;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 4) {
      throw new Error(`Stripe ${res.status} on ${path}: ${body.error?.message || "unknown error"}`);
    }
    await sleep(1000 * 2 ** (attempt - 1));
  }
}

// products.js and extra-products.js are plain scripts that assign to `window`.
// Running them in a tiny sandbox beats regex-parsing, and tolerates comments
// and trailing commas.
function loadWindowGlobal(file, key) {
  const path = join(ROOT, "data", file);
  if (!existsSync(path)) return undefined;
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(path, "utf8"), context, { filename: file });
  return context.window[key];
}

function loadCatalog() {
  const etsy = loadWindowGlobal("products.js", "MICKNACK_PRODUCTS");
  const extras = loadWindowGlobal("extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];

  const items = [];
  for (const item of extras) {
    items.push({
      key: String(item.id),
      name: item.title,
      price: item.price,
      image: (item.images || [])[0],
      source: "site",
    });
  }
  for (const listing of (etsy && etsy.listings) || []) {
    items.push({
      key: String(listing.listing_id),
      name: listing.title,
      price: listing.price,
      image: (listing.images || [])[0],
      source: "etsy",
    });
  }
  // Only items with a price can be sold.
  return items.filter((i) => i.price && Number(i.price) > 0);
}

function loadExistingLinks() {
  const raw = loadWindowGlobal("stripe-links.js", "MICKNACK_STRIPE_LINKS");
  if (!raw) return {};
  if (!raw.links) return raw; // older flat format
  // Test and live links are different objects in different accounts, so when
  // switching modes start fresh rather than trying to reuse or deactivate the
  // other mode's links with the wrong key.
  return raw.mode === (LIVE ? "live" : "test") ? raw.links : {};
}

function writeLinks(links) {
  const out = join(ROOT, "data", "stripe-links.js");
  const banner =
    "// Auto-generated by scripts/create-stripe-links.js — do not hand-edit.\n" +
    "// TEST links only accept Stripe test cards, so the site shows Buy buttons\n" +
    "// from test links on localhost only. Live links show everywhere.\n";
  const payload = {
    mode: LIVE ? "live" : "test",
    generated_at: new Date().toISOString(),
    links,
  };
  writeFileSync(
    out,
    `${banner}window.MICKNACK_STRIPE_LINKS = ${JSON.stringify(payload, null, 2)};\n`
  );
  return out;
}

// One flat shipping rate is shared by every link. Reused across runs so
// rebuilding links doesn't pile up duplicate rates in the dashboard.
let shippingRateId;
async function getShippingRateId() {
  if (shippingRateId) return shippingRateId;

  const existing = await stripe("/shipping_rates?limit=100", undefined, "GET");
  const match = (existing.data || []).find(
    (rate) =>
      rate.active &&
      rate.display_name === SHIPPING_LABEL &&
      rate.fixed_amount?.amount === SHIPPING_AMOUNT_CENTS &&
      rate.fixed_amount?.currency === "usd"
  );
  if (match) {
    shippingRateId = match.id;
    return shippingRateId;
  }

  const created = await stripe("/shipping_rates", {
    display_name: SHIPPING_LABEL,
    type: "fixed_amount",
    fixed_amount: { amount: SHIPPING_AMOUNT_CENTS, currency: "usd" },
  });
  shippingRateId = created.id;
  return shippingRateId;
}

async function createLinkFor(item, existing) {
  // When only the link options changed, keep the product and price we already
  // made rather than leaving orphans behind.
  const reuse = existing && existing.price === item.price && existing.price_id;

  let productId = reuse ? existing.product_id : undefined;
  let priceId = reuse ? existing.price_id : undefined;

  if (!reuse) {
    const product = await stripe("/products", {
      name: item.name.slice(0, 250),
      images: item.image && item.image.startsWith("http") ? [item.image] : undefined,
      metadata: { micknack_id: item.key, source: item.source },
    });
    productId = product.id;

    const price = await stripe("/prices", {
      product: product.id,
      currency: "usd",
      unit_amount: Math.round(Number(item.price) * 100),
    });
    priceId = price.id;
  }

  const link = await stripe("/payment_links", {
    line_items: [{ price: priceId, quantity: 1 }],
    // Physical goods need somewhere to ship to.
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    shipping_options: [{ shipping_rate: await getShippingRateId() }],
    after_completion: { type: "redirect", redirect: { url: SITE_URL } },
    metadata: { micknack_id: item.key },
  });

  return {
    url: link.url,
    price: item.price,
    shipping_cents: SHIPPING_AMOUNT_CENTS,
    config: CONFIG_VERSION,
    link_id: link.id,
    price_id: priceId,
    product_id: productId,
  };
}

async function main() {
  console.log(`Mode: ${LIVE ? "LIVE" : "TEST"}`);
  const items = loadCatalog();
  const links = loadExistingLinks();
  console.log(`Catalog has ${items.length} priced item(s).`);

  let created = 0;
  let replaced = 0;
  let unchanged = 0;

  for (const item of items) {
    const existing = links[item.key];
    if (existing && existing.price === item.price && existing.config === CONFIG_VERSION) {
      unchanged++;
      continue;
    }

    if (existing) {
      // A Payment Link's price is fixed, so a price change means a new link.
      try {
        await stripe(`/payment_links/${existing.link_id}`, { active: false });
      } catch (err) {
        console.warn(`Could not deactivate old link for ${item.key}: ${err.message}`);
      }
    }

    links[item.key] = await createLinkFor(item, existing);
    existing ? replaced++ : created++;
    console.log(`  ${existing ? "updated" : "created"}: ${item.name.slice(0, 55)}`);
  }

  // Deactivate links for items that left the catalog entirely.
  const liveKeys = new Set(items.map((i) => i.key));
  let removed = 0;
  for (const key of Object.keys(links)) {
    if (liveKeys.has(key)) continue;
    try {
      await stripe(`/payment_links/${links[key].link_id}`, { active: false });
    } catch (err) {
      console.warn(`Could not deactivate link for removed item ${key}: ${err.message}`);
    }
    delete links[key];
    removed++;
  }

  const out = writeLinks(links);
  console.log(
    `\ncreated ${created}, updated ${replaced}, unchanged ${unchanged}, removed ${removed}`
  );
  console.log(`Wrote ${Object.keys(links).length} link(s) to ${out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
