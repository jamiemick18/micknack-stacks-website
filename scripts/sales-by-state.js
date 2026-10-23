// ============================================================================
// Where the orders are going, and which shopfront they came through.
// ============================================================================
//
// This exists for one reason: sales tax. Jamie owes nothing today because
// every order has shipped outside Colorado and no single state is anywhere
// near its economic nexus threshold. Both of those facts can stop being true
// quietly, one order at a time, and nobody notices until a state writes a
// letter. So the shop counts.
//
// Two shopfronts, counted separately, because they are not the same thing:
//
//   etsy   Etsy is a marketplace facilitator. It collects and remits the
//          sales tax on these itself, under its own registration. Jamie has
//          no collection duty on them. They are still counted, because some
//          states count marketplace sales toward a seller's own nexus
//          threshold even when the marketplace did the collecting.
//
//   site   micknackstacks.com, where Jamie is the seller of record and the
//          duty is hers alone. These are the ones that matter.
//
// What it writes is counts and totals per state. No names, no addresses, no
// order contents: the question is "how many and where", and nothing more
// personal than that needs to leave Stripe or Etsy to answer it.
//
// Usage: node scripts/sales-by-state.js [out-dir]   (default: ./sales-data)

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = process.argv[2] || join(ROOT, "sales-data");

// Colorado is home. One order here and the licences stop being optional, so
// it gets a threshold of one rather than a threshold at all.
const HOME_STATE = "CO";

// Most states draw the line at $100,000 or 200 orders in a year, but not all
// of them, and the exceptions move. These are deliberately lower: the point
// is to raise a flag early enough to go and read the actual rule, not to
// decide anything. A number that looks authoritative would be worse than one
// that plainly says "go and check".
const WATCH_ORDERS = 150;
const WATCH_DOLLARS = 75000;

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return process.env;
  const env = { ...process.env };
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const at = line.indexOf("=");
    env[line.slice(0, at).trim().replace(/^﻿/, "")] = line.slice(at + 1).trim();
  }
  return env;
}

const env = loadEnv();

// ---------------------------------------------------------------------------
// The shop's own sales, from Stripe.
// ---------------------------------------------------------------------------

async function stripe(path, key) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body;
}

async function siteOrders() {
  const key = env.STRIPE_SECRET_KEY_LIVE;
  if (!key) {
    console.log("No live Stripe key, so the shop's own sales were not counted.");
    return null;
  }

  const orders = [];
  let starting_after = null;
  for (;;) {
    const query = new URLSearchParams({ limit: "100", status: "complete" });
    if (starting_after) query.set("starting_after", starting_after);
    const page = await stripe(`/checkout/sessions?${query}`, key);

    for (const session of page.data) {
      if (session.payment_status !== "paid") continue;
      // Stripe has moved where it keeps the shipping address; accept either.
      const shipping =
        (session.collected_information && session.collected_information.shipping_details) ||
        session.shipping_details ||
        null;
      const address = shipping && shipping.address;
      orders.push({
        at: new Date(session.created * 1000).toISOString(),
        cents: session.amount_total || 0,
        country: (address && address.country) || "??",
        state: (address && address.state) || "",
      });
    }

    if (!page.has_more || !page.data.length) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return orders;
}

// ---------------------------------------------------------------------------
// Etsy's sales. Needs the transactions_r scope, which the listings-only
// token does not carry: without it this returns null and says so rather than
// reporting zero, because zero would be a lie.
// ---------------------------------------------------------------------------

async function etsyOrders() {
  const apiKey = env.ETSY_API_KEY;
  const refresh = env.ETSY_REFRESH_TOKEN;
  if (!apiKey || !refresh) {
    console.log("No Etsy credentials, so Etsy's sales were not counted.");
    return null;
  }

  const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: apiKey.split(":")[0],
      refresh_token: refresh,
    }),
  });
  const token = await tokenRes.json();
  if (token.error) {
    console.log(`Etsy would not refresh the token (${token.error}), so its sales were not counted.`);
    return null;
  }

  const shopId = env.ETSY_SHOP_ID || "67609393";
  const headers = { "x-api-key": apiKey, Authorization: `Bearer ${token.access_token}` };
  const orders = [];
  let offset = 0;

  for (;;) {
    const res = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/receipts?limit=100&offset=${offset}`,
      { headers }
    );
    const page = await res.json();

    if (res.status === 403 && /transactions_r/.test(JSON.stringify(page))) {
      console.log(
        "Etsy's orders need the transactions_r permission, which this connection does not have.\n" +
          "  Re-run scripts/etsy-connect.js to grant it; until then only the shop's own sales are counted."
      );
      return null;
    }
    if (!res.ok) {
      console.log(`Etsy answered ${res.status} for receipts, so its sales were not counted.`);
      return null;
    }

    for (const receipt of page.results || []) {
      const total = receipt.grandtotal || receipt.total_price || {};
      orders.push({
        at: new Date((receipt.created_timestamp || 0) * 1000).toISOString(),
        cents: total.amount && total.divisor ? Math.round((total.amount / total.divisor) * 100) : 0,
        country: receipt.country_iso || "??",
        state: receipt.state || "",
      });
    }

    offset += 100;
    if (!page.results || page.results.length < 100 || offset >= (page.count || 0)) break;
  }
  return orders;
}

// ---------------------------------------------------------------------------

// A state is only meaningful for US orders; anywhere else is counted by
// country, since no US state has a claim on it.
function keyFor(order) {
  if (order.country && order.country !== "US") return order.country;
  return (order.state || "").trim().toUpperCase() || "US (state not given)";
}

function tally(orders) {
  const out = {};
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  for (const order of orders) {
    const key = keyFor(order);
    const row = (out[key] = out[key] || { orders: 0, cents: 0, orders_12mo: 0, cents_12mo: 0 });
    row.orders += 1;
    row.cents += order.cents;
    if (Date.parse(order.at) >= cutoff) {
      row.orders_12mo += 1;
      row.cents_12mo += order.cents;
    }
  }
  return out;
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const site = await siteOrders();
  const etsy = await etsyOrders();

  const report = {
    generated_at: new Date().toISOString(),
    site: site ? { counted: true, orders: site.length, by_place: tally(site) } : { counted: false },
    etsy: etsy ? { counted: true, orders: etsy.length, by_place: tally(etsy) } : { counted: false },
    flags: [],
  };

  // Only the shop's own sales carry a collection duty, so those are what the
  // flags watch. Etsy's are reported beside them for context.
  const own = report.site.by_place || {};
  const etsyHome = (report.etsy.by_place || {})[HOME_STATE];
  for (const [place, row] of Object.entries(own)) {
    if (place === HOME_STATE) {
      report.flags.push({
        place,
        level: "act",
        why: `${row.orders} order(s) shipped to Colorado. Colorado is home, so a state sales tax licence and a City of Colorado Springs licence are both needed, and collection should be switched on in Stripe.`,
      });
    } else if (row.orders_12mo >= WATCH_ORDERS || row.cents_12mo >= WATCH_DOLLARS * 100) {
      report.flags.push({
        place,
        level: "check",
        why: `${row.orders_12mo} order(s) and ${money(row.cents_12mo)} into ${place} in the last 12 months. Close enough to a typical nexus threshold to go and read that state's actual rule.`,
      });
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "sales-by-state.json"), JSON.stringify(report, null, 1));

  // ---- the same thing, readable ----
  const line = (label, row) =>
    `  ${label.padEnd(22)} ${String(row.orders).padStart(4)} order(s)  ${money(row.cents).padStart(11)}`;

  for (const [channel, label] of [["site", "micknackstacks.com"], ["etsy", "Etsy"]]) {
    const data = report[channel];
    console.log(`\n${label}`);
    if (!data.counted) {
      console.log("  not counted this run");
      continue;
    }
    if (!data.orders) {
      console.log("  no orders yet");
      continue;
    }
    Object.entries(data.by_place)
      .sort((a, b) => b[1].orders - a[1].orders)
      .forEach(([place, row]) => console.log(line(place, row)));
    console.log(`  ${"TOTAL".padEnd(22)} ${String(data.orders).padStart(4)} order(s)`);
  }

  console.log("\nSales tax");
  if (!report.flags.length) {
    console.log("  Nothing to do: nothing has shipped to Colorado through the site, and no");
    console.log("  state is close to a nexus threshold.");
    // A Colorado order through Etsy is not nothing — it is proof that Colorado
    // buyers find the shop — but Etsy collected the tax on it, so it carries no
    // duty. Saying "no Colorado orders" would be untrue and would hide the one
    // thing most likely to change the answer.
    if (etsyHome) {
      console.log(
        `  (${etsyHome.orders} Colorado order(s) came through Etsy, which collected the tax on them.` +
          " The\n  same buyer ordering direct next time is what starts the clock.)"
      );
    }
  } else {
    report.flags.forEach((f) => console.log(`  [${f.level.toUpperCase()}] ${f.why}`));
  }

  console.log(`\nWritten to ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
