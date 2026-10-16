// ============================================================================
// Gather what the private dashboard shows: the catalog, and today's traffic.
// ============================================================================
//
// Everything here is read from the published site and the checkout worker, so
// this needs no keys and can run anywhere, including the daily cloud routine
// that keeps the dashboard current.
//
// It writes two files and stops. Putting them into the artifact is a separate
// step, because only Claude can write that page's store.
//
//   node scripts/dashboard-data.js [out-dir]     (default: ./dashboard-data)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

const SITE = "https://micknackstacks.com";
const WORKER = "https://micknack-checkout.jamie-mick18.workers.dev";
const OUT = process.argv[2] || "dashboard-data";

async function text(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

// The data files assign to window.*, so they are run rather than parsed.
async function windowFile(path, key) {
  const context = createContext({ window: {} });
  runInContext(await text(SITE + path), context);
  return context.window[key];
}

async function main() {
  const products = await windowFile("/data/products.js", "MICKNACK_PRODUCTS");
  const extras = (await windowFile("/data/extra-products.js", "MICKNACK_EXTRA_PRODUCTS")) || [];
  const stats = JSON.parse(await text(SITE + "/data/etsy-stats.json"));
  const views = JSON.parse(await text(WORKER + "/views"));

  const listings = (products && products.listings) || [];
  if (!listings.length) throw new Error("No listings came back; refusing to write an empty catalog.");

  const now = new Date().toISOString();

  // Every piece the shop has, retired ones included: the dashboard is the one
  // place that still has to show them.
  const pieces = [
    ...listings.map((listing) => ({
      id: String(listing.listing_id),
      title: listing.title,
      price: listing.price,
      image: (listing.images || [])[0] || "",
      source: "etsy",
      on_etsy: listing.etsy_active !== false,
    })),
    ...extras.map((extra) => ({
      id: String(extra.id),
      title: extra.title,
      price: extra.price || "",
      image: (extra.images || [])[0] || "",
      source: "site",
      on_etsy: false,
    })),
  ];

  const active = listings.filter((listing) => listing.etsy_active !== false);

  const traffic = {
    etsy_views: stats.views || 0,
    etsy_favourites: stats.favourites || 0,
    site_views: views.site || 0,
    listings: active.length,
    pieces: active
      .map((listing) => ({
        id: String(listing.listing_id),
        title: listing.title,
        views: listing.views || 0,
        favourites: listing.num_favorers || 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 12),
    updated_at: now,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "catalog.json"), JSON.stringify({ count: pieces.length, pieces, synced_at: now }, null, 1));
  writeFileSync(join(OUT, "traffic.json"), JSON.stringify(traffic, null, 1));

  console.log(`catalog.json: ${pieces.length} piece(s), ${active.length} still on Etsy`);
  console.log(
    `traffic.json: ${traffic.etsy_views} Etsy view(s), ${traffic.site_views} site visit(s), ` +
      `${traffic.etsy_favourites} favourite(s)`
  );
  console.log(`Written to ${OUT}/`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
