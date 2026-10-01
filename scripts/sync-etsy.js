// Pulls active listings from your Etsy shop via the Etsy Open API v3
// and writes them to ../data/products.json for the static site to render.
//
// Usage:
//   1. Copy ../.env.example to ../.env and fill in ETSY_API_KEY (and
//      ETSY_SHOP_NAME if your shop name isn't MicknackStacks).
//   2. From the Website folder: npm install && npm run sync
//
// Only public, read-only endpoints are used (findShops, active listings),
// so no OAuth login flow is needed — the API key alone is enough.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getAccessToken, fetchVariations, renderVariationsFile } from "./etsy-variations.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// In CI (e.g. GitHub Actions), ETSY_API_KEY is injected as a real
// environment variable from a secret — no .env file involved. Locally, we
// fall back to reading ../.env so you don't have to export env vars by hand.
function loadEnv() {
  if (process.env.ETSY_API_KEY) {
    return {
      ETSY_API_KEY: process.env.ETSY_API_KEY,
      ETSY_SHOP_NAME: process.env.ETSY_SHOP_NAME,
    };
  }

  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) {
    console.error(
      "Missing .env file. Copy .env.example to .env and add your ETSY_API_KEY first."
    );
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.ETSY_API_KEY;
const SHOP_NAME = env.ETSY_SHOP_NAME || "MicknackStacks";

if (!API_KEY) {
  console.error("ETSY_API_KEY is not set in .env");
  process.exit(1);
}

const BASE = "https://openapi.etsy.com/v3/application";
const headers = { "x-api-key": API_KEY };

// Etsy caps this app at 5 requests/second. Space calls out and retry throttled
// or transient failures; otherwise the burst of per-listing image requests gets
// rejected and those listings silently lose their photos.
const MIN_INTERVAL_MS = 300;
const MAX_ATTEMPTS = 4;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function etsyGet(path) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(`${BASE}${path}`, { headers });
    if (res.ok) return res.json();

    const body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(`Etsy API ${res.status} on ${path}: ${body}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
    console.warn(
      `Etsy API ${res.status} on ${path}, retrying in ${backoff}ms (attempt ${attempt}/${MAX_ATTEMPTS})`
    );
    await sleep(backoff);
  }
}

async function findShopId(shopName) {
  const data = await etsyGet(`/shops?shop_name=${encodeURIComponent(shopName)}`);
  if (!data.results || data.results.length === 0) {
    throw new Error(`No Etsy shop found for name "${shopName}"`);
  }
  return data.results[0].shop_id;
}

async function fetchAllActiveListings(shopId) {
  const listings = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const page = await etsyGet(
      `/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}`
    );
    listings.push(...page.results);
    if (page.results.length < limit) break;
    offset += limit;
  }
  return listings;
}

// The bulk active-listings endpoint ignores `includes=Images`, so photos have
// to be fetched per listing. Returns null (not []) when the request fails, so
// the caller can tell "has no photos" apart from "couldn't fetch photos".
async function fetchListingImages(listingId) {
  try {
    const data = await etsyGet(`/listings/${listingId}/images`);
    return (data.results || [])
      .sort((a, b) => a.rank - b.rank)
      .map((img) => img.url_fullxfull || img.url_570xN)
      .filter(Boolean);
  } catch (err) {
    console.warn(`Could not fetch images for listing ${listingId}: ${err.message}`);
    return null;
  }
}

// Everything the last sync wrote, keyed by listing id.
function loadPreviousCatalog() {
  const previous = new Map();
  const path = join(ROOT, "data", "products.js");
  if (!existsSync(path)) return previous;
  try {
    const text = readFileSync(path, "utf8");
    const data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    for (const listing of data.listings || []) {
      previous.set(String(listing.listing_id), listing);
    }
  } catch (err) {
    console.warn(`Could not read previous products.js: ${err.message}`);
  }
  return previous;
}

// Listing videos come from their own endpoint too. Returns the video's URL,
// "" when the listing has none, or null when the request failed.
async function fetchListingVideo(listingId) {
  try {
    const data = await etsyGet(`/listings/${listingId}/videos`);
    const video = (data.results || []).find(
      (item) => item.video_url && item.video_state !== "removed"
    );
    return video ? video.video_url : "";
  } catch (err) {
    console.warn(`Could not fetch video for listing ${listingId}: ${err.message}`);
    return null;
  }
}

// Photos from the last sync, keyed by listing id. Placeholders are dropped so a
// past failure is never carried forward as if it were real data.
function previousImagesFrom(previous) {
  const images = new Map();
  for (const [id, listing] of previous) {
    const real = (listing.images || []).filter((src) => !src.includes("placeholder"));
    if (real.length) images.set(id, real);
  }
  return images;
}

function normalizeListing(listing, images, video) {
  return {
    listing_id: String(listing.listing_id),
    title: listing.title,
    price: (listing.price.amount / listing.price.divisor).toFixed(2),
    currency_code: listing.price.currency_code,
    url: listing.url,
    description: listing.description,
    images: images.length ? images : ["assets/products/placeholder.svg"],
    video: video || "",
    tags: listing.tags || [],
    // Etsy's own stock count, so the private dashboard can start from it
    // instead of you counting everything by hand.
    quantity: typeof listing.quantity === "number" ? listing.quantity : null,
  };
}

async function main() {
  console.log(`Looking up shop "${SHOP_NAME}"...`);
  const shopId = await findShopId(SHOP_NAME);

  console.log(`Fetching active listings for shop_id ${shopId}...`);
  const rawListings = await fetchAllActiveListings(shopId);
  console.log(`Found ${rawListings.length} active listing(s).`);

  console.log("Fetching listing photos and videos...");
  const previous = loadPreviousCatalog();
  const previousImages = previousImagesFrom(previous);
  const listings = [];
  let failed = 0;
  let withVideo = 0;
  for (const listing of rawListings) {
    const id = String(listing.listing_id);

    let images = await fetchListingImages(listing.listing_id);
    if (images === null) {
      failed++;
      // Keep the last sync's photos rather than downgrading to the placeholder.
      images = previousImages.get(id) || [];
    }

    let video = await fetchListingVideo(listing.listing_id);
    if (video === null) {
      // Same idea for video: a failed call shouldn't drop one we already have.
      video = (previous.get(id) || {}).video || "";
    }
    if (video) withVideo++;

    listings.push(normalizeListing(listing, images, video));
  }
  console.log(`${withVideo} of ${rawListings.length} listing(s) have a video.`);
  if (failed) {
    console.warn(
      `Image fetch failed for ${failed} listing(s); reused previous photos where available.`
    );
  }

  // The site is the permanent record, not a mirror of Etsy. Pieces that leave
  // Etsy (sold out, expired, retired) stay in the catalog and are simply
  // marked etsy_active: false, so nothing ever disappears from the site.
  const now = new Date().toISOString();
  const merged = [];
  const seen = new Set();

  for (const listing of listings) {
    const prior = previous.get(listing.listing_id);
    merged.push({
      ...listing,
      etsy_active: true,
      added_at: (prior && prior.added_at) || now,
    });
    seen.add(listing.listing_id);
  }

  let retired = 0;
  for (const [id, prior] of previous) {
    if (seen.has(id)) continue;
    merged.push({
      ...prior,
      etsy_active: false,
      added_at: prior.added_at || now,
      left_etsy_at: prior.left_etsy_at || now,
    });
    retired++;
  }

  if (retired) {
    console.log(`${retired} piece(s) are no longer active on Etsy; kept on the site.`);
  }

  // How much each piece's Etsy stock moved since the last sync. The site's own
  // counts live in the checkout worker and are adjusted by this much, rather
  // than overwritten, so a sale made here isn't undone by Etsy's older number.
  const deltas = {};
  for (const listing of merged) {
    if (!listing.etsy_active || typeof listing.quantity !== "number") continue;
    const prior = previous.get(listing.listing_id);
    if (!prior || typeof prior.quantity !== "number") continue;
    const change = listing.quantity - prior.quantity;
    if (change !== 0) deltas[listing.listing_id] = change;
  }

  const deltaPath = join(ROOT, "data", "etsy-stock-deltas.json");
  writeFileSync(deltaPath, JSON.stringify({ deltas, computed_at: now }, null, 2));
  const changedCount = Object.keys(deltas).length;
  console.log(
    changedCount
      ? `${changedCount} piece(s) changed stock on Etsy since the last sync.`
      : "No Etsy stock changes since the last sync."
  );

  const output = {
    shop_name: SHOP_NAME,
    shop_url: `https://www.etsy.com/shop/${SHOP_NAME}`,
    synced_at: now,
    listings: merged,
  };

  await syncVariations(merged, now);

  const outPath = join(ROOT, "data", "products.js");
  const banner =
    "// Auto-generated by scripts/sync-etsy.js — do not hand-edit, it will be overwritten.\n";
  writeFileSync(outPath, `${banner}window.MICKNACK_PRODUCTS = ${JSON.stringify(output, null, 2)};\n`);
  console.log(`Wrote ${output.listings.length} listing(s) to ${outPath}`);
}

// Etsy option drop-downs, when the shop owner has connected the app. Without a
// refresh token this does nothing at all and data/variations.js is left as it
// is, so the rest of the sync never depends on it.
//
// A failure here is reported but not fatal: losing tonight.s options is a far
// smaller problem than losing tonight.s listings and photos.
async function syncVariations(listings, now) {
  const refreshToken = env.ETSY_REFRESH_TOKEN;
  if (!refreshToken) {
    // A warning, not a quiet note: this is a degraded run, and it should be
    // visible on the run summary rather than buried in the log.
    console.log(
      "::warning::ETSY_REFRESH_TOKEN is not set, so option drop-downs were not read. " +
        "data/variations.js is unchanged."
    );
    return;
  }

  const clientId = API_KEY.split(":")[0];
  const active = listings.filter((listing) => listing.etsy_active);

  try {
    const accessToken = await getAccessToken({ clientId, refreshToken });
    const variations = await fetchVariations(
      active.map((listing) => listing.listing_id),
      { clientId, apiKey: API_KEY, accessToken, log: (message) => console.log(message) }
    );

    const titles = Object.fromEntries(active.map((listing) => [listing.listing_id, listing.title]));
    const path = join(ROOT, "data", "variations.js");
    writeFileSync(path, renderVariationsFile(variations, titles, { syncedAt: now }));
    console.log(`Wrote options for ${Object.keys(variations).length} piece(s) to ${path}`);
  } catch (err) {
    console.log(`::warning::Could not read Etsy options: ${err.message}`);
    console.log("data/variations.js was left as it is.");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
