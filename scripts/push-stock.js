// ============================================================================
// Tell the checkout worker what it needs to know about stock, after a sync.
// ============================================================================
//
// Three things go over, in one call:
//
//   prices      which piece each Stripe price belongs to. Without this the
//               worker cannot tell what a cart line is, so it waves the line
//               through: no sold-out check, and no count coming down after the
//               sale. That is how a newly listed piece used to arrive.
//
//   deltas      how far Etsy's count moved since the last sync. Sent as a
//               change, never a total, so a sale made on the site is not
//               undone by Etsy's older number.
//
//   quantities  a first count for pieces the worker has never heard of, taken
//               from Etsy. Only ever for pieces it is not already tracking:
//               a count Jamie has set by hand is never overwritten.
//
// Usage: node scripts/push-stock.js [--dry-run]
//   WORKER_URL and WORKER_ADMIN_TOKEN come from the environment.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

// The data files assign to window.*, so they can be loaded by a plain script
// tag with no server. Here that means running them rather than parsing them.
function loadWindowFile(relativePath) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return {};
  const context = createContext({ window: {} });
  runInContext(readFileSync(path, "utf8"), context);
  return context.window;
}

function readJson(relativePath, fallback) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return fallback;
  }
}

async function main() {
  const workerUrl = (process.env.WORKER_URL || "").replace(/\/+$/, "");
  const token = process.env.WORKER_ADMIN_TOKEN;

  if (!workerUrl || (!token && !DRY_RUN)) {
    console.log("::warning::WORKER_URL or WORKER_ADMIN_TOKEN is not set, so the shop's stock was left alone.");
    return;
  }

  const links = loadWindowFile("data/stripe-links.js").MICKNACK_STRIPE_LINKS || {};
  const products = loadWindowFile("data/products.js").MICKNACK_PRODUCTS || {};
  const listings = (products.listings || []).filter((listing) => listing.etsy_active);

  const prices = {};
  for (const [pieceId, link] of Object.entries(links.links || {})) {
    if (link && link.price_id) prices[link.price_id] = String(pieceId);
  }

  const deltas = readJson("data/etsy-stock-deltas.json", { deltas: {} }).deltas || {};

  // What the worker already tracks. A piece missing from here has no count at
  // all, which the worker reads as "always available" — fine for a piece sold
  // only on Etsy, wrong for one now buyable here.
  let tracked = {};
  try {
    const res = await fetch(`${workerUrl}/stock`, { cache: "no-store" });
    if (res.ok) tracked = (await res.json()).stock || {};
    else console.log(`::warning::Could not read current stock (HTTP ${res.status}); no first counts will be sent.`);
  } catch (err) {
    console.log(`::warning::Could not reach the worker to read stock: ${err.message}`);
  }

  const quantities = {};
  for (const listing of listings) {
    const id = String(listing.listing_id);
    const sellableHere = Object.values(prices).includes(id);
    const known = Object.prototype.hasOwnProperty.call(tracked, id);
    if (sellableHere && !known && typeof listing.quantity === "number") {
      quantities[id] = listing.quantity;
    }
  }

  const payload = { prices, deltas, quantities };
  console.log(
    `Sending ${Object.keys(prices).length} price mapping(s), ` +
      `${Object.keys(deltas).length} stock change(s), ` +
      `${Object.keys(quantities).length} first count(s).`
  );
  for (const [id, qty] of Object.entries(quantities)) {
    const listing = listings.find((l) => String(l.listing_id) === id);
    console.log(`  first count: ${qty} of ${(listing?.title || id).slice(0, 50)}`);
  }

  if (DRY_RUN) {
    console.log("Dry run; nothing was sent.");
    return;
  }

  const res = await fetch(`${workerUrl}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": token },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`Worker replied ${res.status}: ${text.slice(0, 200)}`);

  if (!res.ok) {
    console.log("::error::The checkout worker refused the stock update.");
    process.exit(1);
  }
  console.log("Stock link to the checkout worker is healthy.");
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  process.exit(1);
});
