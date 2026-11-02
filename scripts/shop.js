// ============================================================================
// The Micknack Stacks HUB. Runs on this computer, needs nothing and nobody.
// ============================================================================
//
// This is the dashboard, moved off Claude and onto Jamie's own machine. It
// does the jobs the artifact did — set a count, hide a piece, mark one sold
// out, see what is selling and where — and then publishes the result to the
// website the same way every other change gets there.
//
// Nothing here phones home. No account, no subscription, no service that can
// decide to stop existing. Start it, use it, close it.
//
//   npm run shop        (or the bear icon on the desktop)
//
// Four pages: a welcome screen, the inventory, a form for adding a piece
// that was never on Etsy, and the traffic and sales figures. The page itself
// lives in hub-page.js; this file is the plumbing behind it.
//
// Two files hold the answer between runs:
//
//   data/inventory.js       public. Only what the website needs: which
//                           pieces are sold out and which are hidden. No
//                           counts, because a shopper has no business
//                           knowing there are two left.
//
//   data/stock-counts.json  private, gitignored, never published. The real
//                           numbers. Losing it costs nothing that a sync
//                           cannot refill from Etsy.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { execFileSync, spawn } from "node:child_process";
import { page } from "./hub-page.js";

const WORKER = "https://micknack-checkout.jamie-mick18.workers.dev";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = process.env.PORT || 5174;

const COUNTS_PATH = join(ROOT, "data", "stock-counts.json");
const INVENTORY_PATH = join(ROOT, "data", "inventory.js");

// ---------------------------------------------------------------------------
// Reading what the shop already knows
// ---------------------------------------------------------------------------

function windowFile(relative, key) {
  const path = join(ROOT, relative);
  if (!existsSync(path)) return undefined;
  const context = createContext({ window: {} });
  runInContext(readFileSync(path, "utf8"), context, { filename: relative });
  return context.window[key];
}

// The one secret the HUB uses: it lets the worker know an approval really
// came from Jamie. Read fresh each time so adding it to .env takes effect
// without restarting.
function envValue(name) {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return process.env[name] || "";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at === -1) continue;
    if (line.slice(0, at).trim().replace(/^﻿/, "") === name) return line.slice(at + 1).trim();
  }
  return process.env[name] || "";
}

function reviewToken() {
  return envValue("REVIEW_TOKEN");
}

function readCounts() {
  if (!existsSync(COUNTS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(COUNTS_PATH, "utf8")).items || {};
  } catch (err) {
    console.error(`Could not read ${COUNTS_PATH}: ${err.message}`);
    return {};
  }
}

function state() {
  const products = windowFile("data/products.js", "MICKNACK_PRODUCTS") || {};
  const extras = windowFile("data/extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];
  const links = (windowFile("data/stripe-links.js", "MICKNACK_STRIPE_LINKS") || {}).links || {};
  const counts = readCounts();

  const pieces = [];

  for (const listing of products.listings || []) {
    const id = String(listing.listing_id);
    const saved = counts[id] || {};
    pieces.push({
      id,
      title: listing.title,
      price: listing.price,
      image: (listing.images && listing.images[0]) || "",
      on_etsy: listing.etsy_active !== false,
      etsy_state: listing.etsy_state || "",
      etsy_qty: listing.quantity,
      qty: saved.qty === undefined ? listing.quantity : saved.qty,
      hidden: Boolean(saved.hidden),
      note: saved.note || "",
      buyable: Boolean(links[id]),
      source: "etsy",
    });
  }

  for (const extra of extras) {
    const id = String(extra.id);
    const saved = counts[id] || {};
    pieces.push({
      id,
      title: extra.title,
      price: extra.price,
      image: (extra.images && extra.images[0]) || extra.image || "",
      on_etsy: false,
      etsy_qty: null,
      qty: saved.qty === undefined ? 0 : saved.qty,
      hidden: Boolean(saved.hidden),
      note: saved.note || "",
      buyable: Boolean(links[id]),
      source: "here",
      // Only pieces added here can be changed here, so only these carry the
      // rest of the listing around for the edit form to fill itself from.
      description: extra.description || "",
      badge: extra.badge || "",
    });
  }

  pieces.sort((a, b) => a.title.localeCompare(b.title));
  return { pieces, synced_at: products.synced_at || null };
}

// ---------------------------------------------------------------------------
// Writing it back
// ---------------------------------------------------------------------------

// The worker is what the shop actually reads, so anything changed here has
// to reach it. Without this the desktop and the phone wrote to different
// places and could each undo the other — which is how two hidden pieces came
// back as merely sold out.
//
// Failing to reach the worker is reported, never swallowed: a count that did
// not arrive is exactly the thing that must not pass quietly.
async function mirrorToWorker(items) {
  const pass = envValue("HUB_PASSWORD");
  if (!pass) return { ok: false, why: "HUB_PASSWORD is not in .env" };

  const tell = async (action, body) => {
    const res = await fetch(`${WORKER}/hub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass, action, ...body }),
    });
    const answer = await res.json();
    if (!res.ok) throw new Error(answer.error || `worker answered ${res.status}`);
  };

  try {
    const live = await fetch(`${WORKER}/stock`).then((r) => r.json());
    const hidden = new Set(live.hidden || []);
    let sent = 0;

    for (const [id, item] of Object.entries(items)) {
      const qty = Math.max(0, Number(item.qty) || 0);
      if (live.stock[id] !== qty) {
        await tell("setqty", { piece: id, qty });
        sent++;
      }
      if (Boolean(item.hidden) !== hidden.has(id)) {
        await tell("hide", { piece: id, hidden: Boolean(item.hidden) });
        sent++;
      }
    }
    return { ok: true, sent };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

function save(items) {
  // The private file keeps everything.
  writeFileSync(
    COUNTS_PATH,
    JSON.stringify({ items, updated_at: new Date().toISOString() }, null, 1) + "\n"
  );

  // The public one gets only what a shopper's browser needs to know. A piece
  // with a count of zero is sold out; one Jamie has hidden is not shown at
  // all. Everything else has no entry, which the site reads as in stock.
  const lines = [];
  for (const [id, item] of Object.entries(items)) {
    const flags = [];
    if (item.hidden) flags.push("hidden: true");
    else if (Number(item.qty) <= 0) flags.push("sold_out: true");
    if (!flags.length) continue;
    // Six months from now the useful question is not which pieces are hidden
    // but why each one is, so the note travels with the entry.
    const note = (item.note || "").replace(/\s+/g, " ").trim();
    lines.push(`${note ? `  // ${note}\n` : ""}  "${id}": { ${flags.join(", ")} },`);
  }

  const file = `// ============================================================================
// INVENTORY — what's sold out or hidden on the site.
// ============================================================================
//
// Written by the Micknack Stacks HUB (npm run shop). Hand edits here are fine
// but will be overwritten the next time it saves.
//
// The Etsy sync NEVER touches this file.
//
// Stock counts are NOT here, on purpose. They live in data/stock-counts.json,
// which is private and never published. This file carries only what the
// public site needs:
//
//   sold_out: true   Shows a Sold Out label. No Buy button.
//   hidden: true     Not shown on the site at all.
//
// A piece with no entry is treated as in stock.

window.MICKNACK_INVENTORY = {
${lines.sort().join("\n")}
};
`;
  writeFileSync(INVENTORY_PATH, file);
  return { sold_out: lines.filter((l) => l.includes("sold_out")).length, hidden: lines.filter((l) => l.includes("hidden")).length };
}

// ---------------------------------------------------------------------------
// Sending it to the website
// ---------------------------------------------------------------------------

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

// Everything the HUB is allowed to change. Adding a piece writes the catalog
// entry, its photo and its Buy link, so publishing has to carry those too —
// and nothing else, so a half-finished edit elsewhere in the folder cannot
// ride along by accident.
const HUB_FILES = [
  "data/inventory.js",
  "data/extra-products.js",
  "data/stripe-links.js",
  "assets/products",
  "data/stones.js",
  "data/stones.json",
  "assets/stones",
  // Every piece has its own real page under p/, which is what the grid links
  // to and what Instagram reads when a link is shared. These used to be built
  // only by the hourly sync, so a piece added here had a card pointing at a
  // page that did not exist yet.
  "p",
];

function publish() {
  // Rebuilt before the check, so adding, renaming, repricing or hiding a
  // piece all reach its own page in the same breath as the shop.
  try {
    execFileSync(process.execPath, [join(__dirname, "build-share-pages.js")], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
  } catch (err) {
    return { ok: false, message: `Could not build the piece pages: ${err.message}` };
  }

  // Only the ones that exist. assets/stones does not until the first stone
  // photo is added, and git refuses the whole command over one missing path.
  const files = HUB_FILES.filter((file) => existsSync(join(ROOT, file)));

  const changed = git("status", "--porcelain", "--", ...files);
  if (!changed) return { ok: true, message: "Nothing to publish — the site already matches." };

  git("add", ...files);
  git("commit", "-m", "Update the shop from the HUB");

  try {
    git("push", "origin", "main");
  } catch (err) {
    // Almost always the hourly sync having pushed first.
    git("pull", "--rebase", "origin", "main");
    git("push", "origin", "main");
  }
  return { ok: true, message: "Published. The site updates in a minute or two." };
}

// ---------------------------------------------------------------------------
// Traffic: how many people looked, and at what.
// ---------------------------------------------------------------------------

async function traffic() {
  const products = windowFile("data/products.js", "MICKNACK_PRODUCTS") || {};
  const extras = windowFile("data/extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];
  const listings = products.listings || [];

  let stats = { views: 0, favourites: 0 };
  const statsPath = join(ROOT, "data", "etsy-stats.json");
  if (existsSync(statsPath)) {
    try {
      stats = JSON.parse(readFileSync(statsPath, "utf8"));
    } catch (err) {
      /* a half-written file is not worth crashing over */
    }
  }

  // The worker is the only thing that knows about visits and hearts. It is
  // usually there; when it is not, say so rather than showing a confident
  // zero that means "could not ask".
  let views = null;
  let hearts = {};
  let workerError = false;
  try {
    const [v, h] = await Promise.all([
      fetch(`${WORKER}/views`).then((r) => r.json()),
      fetch(`${WORKER}/hearts`).then((r) => r.json()),
    ]);
    views = v;
    hearts = h.counts || {};
  } catch (err) {
    workerError = true;
  }

  if (!views) {
    const local = join(ROOT, "data", "site-views.json");
    views = existsSync(local) ? JSON.parse(readFileSync(local, "utf8")) : { site: 0 };
  }

  const titleOf = (id) => {
    const listing = listings.find((l) => String(l.listing_id) === id);
    if (listing) return listing.title.split("|")[0].trim();
    const extra = extras.find((e) => String(e.id) === id);
    return extra ? extra.title.split("|")[0].trim() : id;
  };

  return {
    etsy_views: stats.views || 0,
    etsy_favourites: stats.favourites || 0,
    site_views: views.site || 0,
    site_hearts: Object.values(hearts).reduce((sum, n) => sum + n, 0),
    worker_error: workerError,
    hearted: Object.entries(hearts)
      .map(([id, n]) => ({ title: titleOf(id), hearts: n }))
      .sort((a, b) => b.hearts - a.hearts)
      .slice(0, 10),
    top: listings
      .filter((l) => l.etsy_active !== false)
      .map((l) => ({
        title: l.title.split("|")[0].trim(),
        views: l.views || 0,
        favourites: l.num_favorers || 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Money, from both shopfronts.
// ---------------------------------------------------------------------------
//
// Deliberately only the few numbers worth glancing at: what is waiting to
// reach the bank, and what the last month took. Anything more belongs in
// Etsy's and Stripe's own pages, which the Welcome screen links to.

async function stripeMoney() {
  const key = envValue("STRIPE_SECRET_KEY_LIVE");
  if (!key) return { ok: false, why: "no live Stripe key in .env" };

  const get = async (path) => {
    const res = await fetch("https://api.stripe.com/v1" + path, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body;
  };

  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const [balance, payouts, charges] = await Promise.all([
      get("/balance"),
      get("/payouts?limit=1"),
      get(`/charges?limit=100&created[gte]=${since}`),
    ]);

    const sum = (rows) => rows.reduce((total, row) => total + (row.amount || 0), 0);
    const paid = (charges.data || []).filter((charge) => charge.paid && !charge.refunded);

    return {
      ok: true,
      available: sum(balance.available || []),
      pending: sum(balance.pending || []),
      month_gross: sum(paid),
      month_orders: paid.length,
      last_payout: (payouts.data || [])[0]
        ? {
            amount: payouts.data[0].amount,
            on: new Date(payouts.data[0].arrival_date * 1000).toISOString().slice(0, 10),
            status: payouts.data[0].status,
          }
        : null,
    };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

async function etsyMoney() {
  const apiKey = envValue("ETSY_API_KEY");
  const refresh = envValue("ETSY_REFRESH_TOKEN");
  if (!apiKey || !refresh) return { ok: false, why: "no Etsy credentials in .env" };

  try {
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
    if (token.error) return { ok: false, why: `Etsy would not sign in (${token.error})` };

    // Etsy refuses a window longer than 31 days, so a month is what it is.
    const max = Math.floor(Date.now() / 1000);
    const min = max - 30 * 86400;
    const shopId = envValue("ETSY_SHOP_ID") || "67609393";
    const res = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/payment-account/ledger-entries` +
        `?min_created=${min}&max_created=${max}&limit=100`,
      { headers: { "x-api-key": apiKey, Authorization: `Bearer ${token.access_token}` } }
    );
    if (!res.ok) return { ok: false, why: `Etsy answered ${res.status}` };
    const ledger = await res.json();
    const rows = ledger.results || [];

    // Etsy's ledger is one line per thing that happened: sales positive, its
    // cut and the postage negative. Grouping them is the only way to see what
    // a month actually left behind.
    const byType = {};
    for (const row of rows) byType[row.ledger_type] = (byType[row.ledger_type] || 0) + row.amount;

    const gross = byType.PAYMENT_GROSS || 0;
    const fees = Object.entries(byType)
      .filter(([type, amount]) => amount < 0 && !/^DISBURSE/i.test(type) && type !== "sales_tax")
      .reduce((total, [, amount]) => total + amount, 0);

    return {
      ok: true,
      balance: rows.length ? rows[0].balance : 0,
      gross,
      fees,
      net: gross + fees,
      paid_out: Math.abs(byType.DISBURSE2 || byType.DISBURSE || 0),
      entries: rows.length,
      capped: Boolean(ledger.count && ledger.count > rows.length),
    };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

// ---------------------------------------------------------------------------
// Orders still to go out.
// ---------------------------------------------------------------------------
//
// Etsy knows which of its own orders are unshipped, so it is simply asked.
// Stripe does not — it takes money and has no idea whether anything was
// posted — so orders taken here are marked off in a file of their own.

const SHIPPED_PATH = join(ROOT, "data", "shipped.json");

function readShipped() {
  if (!existsSync(SHIPPED_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SHIPPED_PATH, "utf8")).orders || {};
  } catch (err) {
    return {};
  }
}

function markShipped(id, shipped) {
  const orders = readShipped();
  if (shipped) orders[id] = new Date().toISOString().slice(0, 10);
  else delete orders[id];
  writeFileSync(SHIPPED_PATH, JSON.stringify({ orders, updated_at: new Date().toISOString() }, null, 1) + "\n");
}

async function orders() {
  const out = { etsy: { ok: false, open: [] }, site: { ok: false, open: [] } };

  // ---- Etsy ----
  const apiKey = envValue("ETSY_API_KEY");
  const refresh = envValue("ETSY_REFRESH_TOKEN");
  if (apiKey && refresh) {
    try {
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
      if (token.error) throw new Error(token.error);

      const shopId = envValue("ETSY_SHOP_ID") || "67609393";
      const res = await fetch(
        `https://api.etsy.com/v3/application/shops/${shopId}/receipts?limit=100&was_shipped=false`,
        { headers: { "x-api-key": apiKey, Authorization: `Bearer ${token.access_token}` } }
      );
      if (!res.ok) throw new Error(`Etsy answered ${res.status}`);
      const body = await res.json();

      out.etsy = {
        ok: true,
        open: (body.results || [])
          .filter((receipt) => !receipt.is_shipped && receipt.is_paid)
          .map((receipt) => ({
            id: String(receipt.receipt_id),
            at: new Date((receipt.created_timestamp || 0) * 1000).toISOString().slice(0, 10),
            name: receipt.name || "",
            where: [receipt.city, receipt.state, receipt.country_iso].filter(Boolean).join(", "),
            cents:
              receipt.grandtotal && receipt.grandtotal.divisor
                ? Math.round((receipt.grandtotal.amount / receipt.grandtotal.divisor) * 100)
                : 0,
            items: (receipt.transactions || []).map((line) => ({
              title: (line.title || "").split("|")[0].trim(),
              qty: line.quantity || 1,
              variation: (line.variations || []).map((v) => v.formatted_value).join(", "),
            })),
          }))
          .sort((a, b) => a.at.localeCompare(b.at)),
      };
    } catch (err) {
      out.etsy = { ok: false, why: err.message, open: [] };
    }
  } else {
    out.etsy = { ok: false, why: "no Etsy credentials in .env", open: [] };
  }

  // ---- The shop's own ----
  const key = envValue("STRIPE_SECRET_KEY_LIVE");
  if (key) {
    try {
      const res = await fetch(
        "https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete&expand[]=data.line_items",
        { headers: { Authorization: `Bearer ${key}` } }
      );
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);
      const shipped = readShipped();

      out.site = {
        ok: true,
        open: (body.data || [])
          .filter((session) => session.payment_status === "paid" && !shipped[session.id])
          .map((session) => {
            const details =
              (session.collected_information && session.collected_information.shipping_details) ||
              session.shipping_details ||
              {};
            const address = details.address || {};
            return {
              id: session.id,
              at: new Date(session.created * 1000).toISOString().slice(0, 10),
              name: details.name || (session.customer_details && session.customer_details.name) || "",
              email: (session.customer_details && session.customer_details.email) || "",
              where: [address.city, address.state, address.country].filter(Boolean).join(", "),
              cents: session.amount_total || 0,
              items: ((session.line_items && session.line_items.data) || []).map((line) => ({
                title: (line.description || "").split("|")[0].trim(),
                qty: line.quantity || 1,
                variation: "",
              })),
            };
          })
          .sort((a, b) => a.at.localeCompare(b.at)),
      };
    } catch (err) {
      out.site = { ok: false, why: err.message, open: [] };
    }
  } else {
    out.site = { ok: false, why: "no live Stripe key in .env", open: [] };
  }

  return out;
}

// Where the orders went. The counting lives in sales-by-state.js so that it
// can also be run on its own from a terminal; here it is run the same way and
// its answer read back.
function sales() {
  const dir = mkdtempSync(join(tmpdir(), "hub-sales-"));
  try {
    execFileSync(process.execPath, [join(__dirname, "sales-by-state.js"), dir], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
    const report = JSON.parse(readFileSync(join(dir, "sales-by-state.json"), "utf8"));
    const etsyHome = (report.etsy.by_place || {}).CO;
    return {
      ok: true,
      report,
      aside: etsyHome
        ? `${etsyHome.orders} Colorado order(s) came through Etsy, which collected the tax on them.`
        : "",
    };
  } catch (err) {
    return { ok: false, message: `Could not count the orders: ${err.message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// The stone shelf
// ---------------------------------------------------------------------------
//
// Nobody can ask for a lavender stone they do not know you keep. This is the
// list they browse before describing what they want, so it lives where Jamie
// can change it without a text editor.

// data/stones.json is the truth; data/stones.js is generated from it.
//
// Two things read this list: the website, which needs plain JavaScript it can
// load from a <script> tag, and the checkout worker, which edits it when
// Jamie changes something from her phone and cannot run JavaScript to find
// out what is in it. A parser for a .js file would be a thing that works
// until the day it does not, so the structured file is the one that counts
// and the script is written out beside it every time.

const STONES_PATH = join(ROOT, "data", "stones.js");
const STONES_DATA = join(ROOT, "data", "stones.json");

function readStoneData() {
  if (existsSync(STONES_DATA)) {
    try {
      const data = JSON.parse(readFileSync(STONES_DATA, "utf8"));
      return {
        stones: Array.isArray(data.stones) ? data.stones : [],
        chains: Array.isArray(data.chains) ? data.chains : [],
        custom: data.custom || { from: "", rings: "" },
      };
    } catch (err) {
      console.error(`Could not read ${STONES_DATA}: ${err.message}`);
    }
  }
  // First run, or someone deleted it: fall back to whatever the script holds
  // so nothing is lost.
  return {
    stones: windowFile("data/stones.js", "MICKNACK_STONES") || [],
    chains: windowFile("data/stones.js", "MICKNACK_CHAINS") || [],
    custom: windowFile("data/stones.js", "MICKNACK_CUSTOM") || { from: "", rings: "" },
  };
}

function stoneScript(data) {
  const stone = (s) =>
    "  { " +
    [
      `id: ${JSON.stringify(String(s.id))}`,
      `name: ${JSON.stringify(String(s.name || "").trim())}`,
      `swatch: ${JSON.stringify(String(s.swatch || "").trim())}`,
      `shape: ${JSON.stringify(String(s.shape || "").trim())}`,
      `finish: ${JSON.stringify(String(s.finish || "").trim())}`,
      `size: ${JSON.stringify(String(s.size || "").trim())}`,
      `image: ${JSON.stringify(String(s.image || ""))}`,
      `note: ${JSON.stringify(String(s.note || "").trim())}`,
      `available: ${s.available === false ? "false" : "true"}`,
    ].join(", ") +
    " },\n";

  const chain = (c) =>
    "  { " +
    [
      `id: ${JSON.stringify(String(c.id))}`,
      `name: ${JSON.stringify(String(c.name || "").trim())}`,
      `mm: ${JSON.stringify(String(c.mm || "").trim())}`,
      `available: ${c.available === false ? "false" : "true"}`,
    ].join(", ") +
    " },\n";

  return `// ============================================================================
// STONES AND CHAINS - what a custom piece can be made from.
// ============================================================================
//
// GENERATED FILE. Edit data/stones.json, or use the HUB's Stones page, which
// writes both. Anything typed here is lost the next time either one saves.
//
// This is the shelf someone browses when they click "Custom pieces are
// welcome". They cannot ask for what they do not know you have.

window.MICKNACK_STONES = [
${data.stones.map(stone).join("")}];

window.MICKNACK_CHAINS = [
${data.chains.map(chain).join("")}];

window.MICKNACK_CUSTOM = { from: ${JSON.stringify(String(data.custom.from || ""))}, rings: ${JSON.stringify(
    String(data.custom.rings || "")
  )} };
`;
}

function writeStoneData(data) {
  data.stones.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  writeFileSync(STONES_DATA, JSON.stringify(data, null, 1) + "\n");
  writeFileSync(STONES_PATH, stoneScript(data));
}

function readStones() {
  return readStoneData().stones;
}

function readChains() {
  return readStoneData().chains;
}

function readCustomSettings() {
  const custom = readStoneData().custom;
  return { from: custom.from || "", rings: custom.rings || "" };
}

function writeCustomSettings(next) {
  const data = readStoneData();
  const from = next.from === undefined ? data.custom.from : String(next.from || "").trim();
  const rings = next.rings === undefined ? data.custom.rings : String(next.rings || "").trim();
  if (from && !/^\d+(\.\d{1,2})?$/.test(from)) {
    throw new Error("The starting price should be a number like 30.00, with no dollar sign.");
  }
  data.custom = { from, rings };
  writeStoneData(data);
  return { from, rings };
}

function saveChain({ id, name, mm, available }) {
  if (!String(name || "").trim()) throw new Error("A chain needs a name.");
  const data = readStoneData();
  let key = String(id || "").trim();
  if (!key) {
    key = slugify(name);
    const taken = new Set(data.chains.map((c) => String(c.id)));
    let n = 2;
    while (taken.has(key)) key = `${slugify(name)}-${n++}`;
  }
  let chain = data.chains.find((c) => String(c.id) === key);
  if (!chain) {
    chain = { id: key, name: "", mm: "", available: true };
    data.chains.push(chain);
  }
  chain.name = String(name).trim();
  chain.mm = String(mm || "").trim();
  chain.available = available !== false;
  writeStoneData(data);
  return { id: key };
}

function removeChain(id) {
  const key = String(id || "").trim();
  const data = readStoneData();
  if (!data.chains.some((c) => String(c.id) === key)) throw new Error("No such chain.");
  data.chains = data.chains.filter((c) => String(c.id) !== key);
  writeStoneData(data);
  return { id: key };
}

function saveStone({ id, name, swatch, shape, finish, size, note, available, photo, clearPhoto }) {
  if (!String(name || "").trim()) throw new Error("A stone needs a name.");
  const data = readStoneData();

  // An id is made from the name once and then left alone, because a saved
  // request refers to the stone by name and the photo is filed under the id.
  let key = String(id || "").trim();
  if (!key) {
    key = slugify(name);
    const taken = new Set(data.stones.map((s) => String(s.id)));
    let n = 2;
    while (taken.has(key)) key = `${slugify(name)}-${n++}`;
  }

  let stone = data.stones.find((s) => String(s.id) === key);
  if (!stone) {
    stone = { id: key, name: "", swatch: "", shape: "", finish: "", size: "", image: "", note: "", available: true };
    data.stones.push(stone);
  }

  stone.name = String(name).trim();
  stone.swatch = String(swatch || "").trim();
  // An iridescent stone is not one colour, and pretending it is makes AB look
  // like flat lilac. The finish says how to draw it; the swatch stays the
  // base colour it shifts around.
  stone.finish = ["ab", "opal"].includes(String(finish || "").trim()) ? String(finish).trim() : "";
  // Several shapes at once is normal: one colour is often cut round AND
  // marquise, and a shopper cares which they can have.
  stone.shape = String(shape || "")
    .split(",")
    .map((bit) => bit.trim())
    .filter(Boolean)
    .join(", ");
  stone.size = String(size || "").trim();
  stone.note = String(note || "").trim();
  stone.available = available !== false;
  if (photo && photo.data) stone.image = writePhoto(key, photo, "stones");
  // Clearing a photo deletes the file too, rather than leaving it orphaned
  // in assets/stones for ever.
  if (clearPhoto && stone.image) {
    const file = join(ROOT, stone.image);
    if (existsSync(file)) rmSync(file, { force: true });
    stone.image = "";
  }

  writeStoneData(data);
  return { id: key };
}

function removeStone(id) {
  const key = String(id || "").trim();
  const data = readStoneData();
  const stone = data.stones.find((s) => String(s.id) === key);
  if (!stone) throw new Error("No such stone.");
  if (stone.image) {
    const file = join(ROOT, stone.image);
    if (existsSync(file)) rmSync(file, { force: true });
  }
  data.stones = data.stones.filter((s) => String(s.id) !== key);
  writeStoneData(data);
  return { id: key };
}

// ---------------------------------------------------------------------------
// Adding a piece that was never on Etsy
// ---------------------------------------------------------------------------

const IMAGE_TYPES = { ".jpg": 1, ".jpeg": 1, ".png": 1, ".webp": 1, ".gif": 1 };

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "piece";
}

// Writing the photo is the same job whether a piece is being added or
// changed, and the file is always named after the piece's id so the site can
// find it without being told. A new photo in a different format replaces the
// old one rather than leaving the stale file behind.
function writePhoto(id, photo, folder = "products") {
  const ext = extname(photo.name || "").toLowerCase();
  if (!IMAGE_TYPES[ext]) throw new Error("That photo needs to be a jpg, png, webp or gif.");
  const buffer = Buffer.from(photo.data, "base64");
  if (buffer.length > 8e6) throw new Error("That photo is bigger than 8MB. Shrink it first.");
  mkdirSync(join(ROOT, "assets", folder), { recursive: true });
  for (const other of Object.keys(IMAGE_TYPES)) {
    if (other === ext) continue;
    const stale = join(ROOT, "assets", folder, `${id}${other}`);
    if (existsSync(stale)) rmSync(stale, { force: true });
  }
  const imagePath = `assets/${folder}/${id}${ext}`;
  writeFileSync(join(ROOT, imagePath), buffer);
  return imagePath;
}

function extraEntry(item) {
  const images = (item.images || []).filter(Boolean);
  return (
    "  {\n" +
    `    id: ${JSON.stringify(String(item.id))},\n` +
    `    title: ${JSON.stringify(String(item.title).trim())},\n` +
    `    price: ${JSON.stringify(String(item.price).trim())},\n` +
    (item.description ? `    description: ${JSON.stringify(String(item.description).trim())},\n` : "") +
    (images.length ? `    images: [${images.map((i) => JSON.stringify(i)).join(", ")}],\n` : "") +
    `    url: ${JSON.stringify(String(item.url || ""))},\n` +
    (item.badge ? `    badge: ${JSON.stringify(String(item.badge).trim())},\n` : "") +
    "  },\n"
  );
}

// The whole list is rewritten rather than patched, because finding one entry
// inside the file with a regular expression is the kind of clever that breaks
// the first time a description contains a brace. The comment header above the
// list is kept; everything between the brackets is ours.
function writeExtras(entries) {
  const path = join(ROOT, "data", "extra-products.js");
  const original = readFileSync(path, "utf8");
  const wasCrlf = original.includes("\r\n");
  const file = original.replace(/\r\n/g, "\n");
  const anchor = "window.MICKNACK_EXTRA_PRODUCTS = [\n";
  const start = file.indexOf(anchor);
  const end = file.lastIndexOf("];");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("data/extra-products.js does not look like itself.");
  }
  const body = entries.map(extraEntry).join("") + "  // Add your items here, between the brackets.\n";
  const next = file.slice(0, start + anchor.length) + body + file.slice(end);
  writeFileSync(path, wasCrlf ? next.replace(/\n/g, "\r\n") : next);
}

// Changing a piece that was never on Etsy. The id never moves, even when the
// name does: it is what the stock count, the Buy link, the hearts and the
// view counter all hang on, so renaming a piece must not quietly orphan them.
//
// Pieces that came from Etsy are deliberately not editable here. The hourly
// sync rewrites them from Etsy every hour, so an edit made here would be
// silently undone — better to say so than to let it look like it worked.
function editPiece({ id, title, price, description, badge, photo }) {
  const extras = windowFile("data/extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];
  const found = extras.find((e) => String(e.id) === String(id));
  if (!found) {
    throw new Error("That piece came from Etsy, so it has to be changed on Etsy.");
  }
  if (!String(title || "").trim()) throw new Error("It needs a name.");
  if (!/^\d+(\.\d{1,2})?$/.test(String(price || "").trim())) {
    throw new Error("The price should be a number like 19.99, with no dollar sign.");
  }

  const wasPrice = String(found.price);
  found.title = String(title).trim();
  found.price = String(price).trim();
  found.description = String(description || "").trim();
  found.badge = String(badge || "").trim();
  if (photo && photo.data) found.images = [writePhoto(String(id), photo)];

  writeExtras(extras);
  return { id: String(id), repriced: wasPrice !== found.price };
}

function addPiece({ title, price, qty, description, badge, photo }) {
  if (!String(title || "").trim()) throw new Error("It needs a name.");
  if (!/^\d+(\.\d{1,2})?$/.test(String(price || "").trim())) {
    throw new Error("The price should be a number like 19.99, with no dollar sign.");
  }

  const extras = windowFile("data/extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];
  const products = windowFile("data/products.js", "MICKNACK_PRODUCTS") || {};

  let id = slugify(title);
  const taken = new Set([
    ...extras.map((e) => String(e.id)),
    ...(products.listings || []).map((l) => String(l.listing_id)),
  ]);
  let n = 2;
  while (taken.has(id)) id = `${slugify(title)}-${n++}`;

  // The photo is written into the same folder every other product photo
  // lives in, so the site finds it with no extra step.
  const imagePath = photo && photo.data ? writePhoto(id, photo) : "";

  extras.unshift({
    id,
    title,
    price,
    description: String(description || "").trim(),
    images: imagePath ? [imagePath] : [],
    badge: String(badge || "").trim(),
  });
  writeExtras(extras);

  // It needs a count like anything else, or the site has no idea whether it
  // is in stock.
  const counts = readCounts();
  counts[id] = { qty: Number(qty) || 0, hidden: false };
  writeFileSync(
    COUNTS_PATH,
    JSON.stringify({ items: counts, updated_at: new Date().toISOString() }, null, 1) + "\n"
  );

  return { id, imagePath };
}

// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // Generous, because a photo arrives here as base64, which is a third
      // bigger again than the file on disk.
      if (raw.length > 16e6) reject(new Error("That is too big to send at once."));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const json = (code, value) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };

  try {
    if (req.url === "/" || req.url.startsWith("/?")) {
      // Never cached. The HUB's whole page — markup and script together —
      // is served from here, so a browser holding yesterday's copy means
      // buttons that quietly do nothing and edits that appear not to save.
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, must-revalidate",
      });
      return res.end(page());
    }

    if (req.url === "/api/state") return json(200, state());

    if (req.url === "/api/save" && req.method === "POST") {
      const { items } = await readBody(req);
      const counted = save(items || {});
      const mirrored = await mirrorToWorker(items || {});
      return json(200, {
        ok: true,
        message:
          `Saved — the shop is already showing it. ` +
          `${counted.sold_out} sold out, ${counted.hidden} hidden.` +
          (mirrored.ok ? "" : ` (The shop itself could not be reached: ${mirrored.why})`),
      });
    }

    if (req.url === "/api/publish" && req.method === "POST") {
      const { items } = await readBody(req);
      save(items || {});
      const mirrored = await mirrorToWorker(items || {});
      const result = publish();
      return json(200, {
        ok: true,
        message: mirrored.ok ? result.message : `${result.message} (${mirrored.why})`,
      });
    }

    // Etsy lowers its own count when something sells there, but nothing tells
    // the HUB, so the two drift apart a sale at a time. This catches it up.
    if (req.url === "/api/match-etsy" && req.method === "POST") {
      const products = windowFile("data/products.js", "MICKNACK_PRODUCTS") || {};
      const counts = readCounts();
      const moved = [];
      for (const listing of products.listings || []) {
        // A piece that left Etsy is skipped, with one exception: one that
        // left because it sold out really is down to none, and that is the
        // whole reason for pressing this.
        if (listing.etsy_active === false && listing.etsy_state !== "sold_out") continue;
        const id = String(listing.listing_id);
        const was = counts[id];
        if (!was) {
          counts[id] = { qty: listing.quantity, hidden: false };
          moved.push(`${listing.title.split("|")[0].trim()} — new, ${listing.quantity}`);
        } else if (was.qty !== listing.quantity) {
          moved.push(`${listing.title.split("|")[0].trim()}: ${was.qty} → ${listing.quantity}`);
          was.qty = listing.quantity;
        }
      }
      save(counts);
      await mirrorToWorker(counts);
      return json(200, {
        ok: true,
        moved,
        message: moved.length
          ? `${moved.length} count(s) brought in line with Etsy. Publish if any of them went to zero.`
          : "Nothing moved — your counts already match Etsy.",
      });
    }

    // Reviews live in the worker, not here, because the form on the website
    // has to reach them from anywhere. The HUB is just the window onto them.
    if (req.url === "/api/reviews" && req.method === "GET") {
      const token = reviewToken();
      if (!token) {
        return json(200, { ok: false, message: "REVIEW_TOKEN is missing from .env, so reviews cannot be read." });
      }
      const res = await fetch(`${WORKER}/reviews/admin`, { headers: { "X-Admin-Token": token } });
      const body = await res.json();
      if (!res.ok) {
        return json(200, {
          ok: false,
          message:
            res.status === 401
              ? "The worker turned that down. Its REVIEW_TOKEN and the one in .env need to match."
              : body.error || `The worker answered ${res.status}.`,
        });
      }
      return json(200, { ok: true, reviews: body.reviews || [] });
    }

    if (req.url === "/api/reviews" && req.method === "POST") {
      const token = reviewToken();
      const { id, action } = await readBody(req);
      const res = await fetch(`${WORKER}/reviews/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": token || "" },
        body: JSON.stringify({ id, action }),
      });
      const body = await res.json();
      return json(200, res.ok ? { ok: true } : { ok: false, message: body.error || "That did not work." });
    }

    // Custom requests live in the worker, like reviews, because the form on
    // the website has to reach them from anywhere.
    if (req.url === "/api/customs" && req.method === "GET") {
      const token = reviewToken();
      if (!token) return json(200, { ok: false, message: "REVIEW_TOKEN is missing from .env." });
      const res = await fetch(`${WORKER}/hub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass: envValue("HUB_PASSWORD"), action: "customs" }),
      });
      const body = await res.json();
      if (!res.ok) {
        return json(200, {
          ok: false,
          message:
            res.status === 401
              ? "Add HUB_PASSWORD to .env — the same one you set on the worker — so the HUB can read requests."
              : body.error || `The worker answered ${res.status}.`,
        });
      }
      return json(200, { ok: true, customs: body.customs || [] });
    }

    if (req.url === "/api/customs" && req.method === "POST") {
      const { id, action } = await readBody(req);
      const res = await fetch(`${WORKER}/hub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass: envValue("HUB_PASSWORD"), action: "custom", id, do: action }),
      });
      const body = await res.json();
      return json(200, res.ok ? { ok: true } : { ok: false, message: body.error || "That did not work." });
    }

    if (req.url === "/api/orders") return json(200, await orders());

    if (req.url === "/api/shipped" && req.method === "POST") {
      const { id, shipped } = await readBody(req);
      markShipped(String(id), shipped !== false);
      return json(200, { ok: true });
    }

    if (req.url === "/api/money") {
      const [etsy, stripe] = await Promise.all([etsyMoney(), stripeMoney()]);
      return json(200, { etsy, stripe });
    }

    if (req.url === "/api/traffic") return json(200, await traffic());

    if (req.url === "/api/sales") return json(200, sales());

    if (req.url === "/api/add" && req.method === "POST") {
      const form = await readBody(req);
      const { id } = addPiece(form);

      // A piece nobody can buy is not much use, so it gets its Stripe link
      // before it goes anywhere near the website.
      let linked = "";
      try {
        execFileSync(process.execPath, [join(__dirname, "create-stripe-links.js"), "--live"], {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 120000,
        });
      } catch (err) {
        linked = " Its Buy button could not be made, so it has no price on it yet.";
      }

      // Adding a piece publishes it. Twice now a piece sat finished in the
      // HUB while the shop knew nothing about it, because adding and
      // publishing were two separate decisions and only the first one felt
      // like one. The counts of OTHER pieces are deliberately left alone
      // here: only this piece's is sent, so a count that Etsy has moved on
      // from is not overwritten by whatever this file happens to hold.
      const counts = readCounts();
      const mirrored = await mirrorToWorker({ [id]: counts[id] || { qty: 0, hidden: false } });
      const result = publish();

      const trouble = [linked, mirrored.ok ? "" : ` Its count did not reach the shop (${mirrored.why}).`]
        .filter(Boolean)
        .join("");

      return json(200, {
        ok: result.ok,
        message: result.ok
          ? `Added "${form.title}" and put it on the website — it shows there in a minute or two.${trouble}`
          : result.message,
        id,
      });
    }

    // Changing a piece that was added here. Etsy pieces are refused by
    // editPiece itself, because the sync would undo any edit within the hour.
    if (req.url === "/api/edit" && req.method === "POST") {
      const form = await readBody(req);
      const { id, repriced } = editPiece(form);
      // A Payment Link's price is frozen when it is made, so a new price
      // means a new link. Everything else leaves the link alone.
      let linked = "";
      if (repriced) {
        try {
          execFileSync(process.execPath, [join(__dirname, "create-stripe-links.js"), "--live"], {
            cwd: ROOT,
            encoding: "utf8",
            timeout: 120000,
          });
          linked = " Its Buy button was remade for the new price.";
        } catch (err) {
          linked = " Its Buy button could NOT be remade for the new price — it will still charge the old one, so do not publish yet.";
        }
      }
      return json(200, {
        ok: true,
        message: `Saved "${form.title}".${linked} Press Save & publish to put the change on the website.`,
        id,
      });
    }

    // Photos of pieces added here live on disk, not on Etsy, so the HUB has
    // to hand them over itself or its own thumbnails come up blank.
    if (req.method === "GET" && /^\/assets\/(products|stones)\//.test(req.url)) {
      const folder = req.url.split("/")[2];
      const name = decodeURIComponent(req.url.split("?")[0].slice(`/assets/${folder}/`.length));
      const ext = extname(name).toLowerCase();
      // Only image names, and only from that one folder: no slashes, no
      // dots leading anywhere else.
      if (/^[A-Za-z0-9._-]+$/.test(name) && !name.includes("..") && IMAGE_TYPES[ext]) {
        const file = join(ROOT, "assets", folder, name);
        if (existsSync(file)) {
          const type = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif"
            : ext === ".webp" ? "image/webp" : "image/jpeg";
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
          res.end(readFileSync(file));
          return;
        }
      }
      res.writeHead(404); res.end();
      return;
    }

    if (req.url === "/api/stones" && req.method === "GET") {
      const settings = readCustomSettings();
      return json(200, {
        ok: true,
        stones: readStones(),
        chains: readChains(),
        from: settings.from,
        rings: settings.rings,
      });
    }

    if (req.url === "/api/stones" && req.method === "POST") {
      const body = await readBody(req);
      const done =
        body.action === "remove"
          ? removeStone(body.id)
          : body.action === "from"
          ? { id: "", ...writeCustomSettings({ from: body.from, rings: body.rings }) }
          : body.action === "chain"
          ? saveChain(body)
          : body.action === "chain-remove"
          ? removeChain(body.id)
          : saveStone(body);
      const result = publish();
      return json(200, {
        ok: result.ok,
        id: done.id,
        message: result.ok
          ? (body.action === "remove" ? "Taken off the shelf" : "Saved") +
            " — the website shows it in a minute or two."
          : result.message,
      });
    }

    // The website's own gem drawings, so the HUB shows a marquise as a
    // marquise rather than keeping a third copy of the same shapes.
    if (req.url.split("?")[0] === "/gems.js" && req.method === "GET") {
      const file = join(ROOT, "js", "gems.js");
      if (existsSync(file)) {
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(readFileSync(file));
        return;
      }
    }

    // The bear, for the tab and the page's own header.
    if (req.url === "/icon.ico" || req.url === "/icon.png") {
      const file = req.url.endsWith(".ico")
        ? join(ROOT, "assets", "micknack-bear.ico")
        : join(ROOT, "assets", "emblem-bear-moon.png");
      if (existsSync(file)) {
        res.writeHead(200, { "Content-Type": req.url.endsWith(".ico") ? "image/x-icon" : "image/png" });
        return res.end(readFileSync(file));
      }
    }

    res.writeHead(404).end("Not here");
  } catch (err) {
    json(500, { ok: false, message: err.message });
  }
});

// Opening the HUB twice is an easy thing to do and should not look like a
// crash. The second one bows out and points at the one already running.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("\n  The HUB is already open:  http://localhost:" + PORT + "\n");
    console.log("  Nothing is wrong — you can close this window.");
    // Worth saying: the one already running may have been started days ago,
    // before whatever changed since. A HUB left open keeps serving the code
    // it started with, which once made a working feature look broken.
    console.log("  If it looks out of date, close every HUB window and open it again.\n");
    process.exit(0);
  }
  console.error("\n  The HUB could not start: " + err.message + "\n");
  process.exit(1);
});

// Only ever answer this machine. There is no password on this thing because
// there is no way in from anywhere else.
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  The HUB is open:  ${url}\n`);
  console.log("  Leave this window open while you use it. Close it when you are done.\n");

  // Open the browser from here rather than from a .cmd wrapper, because
  // Windows refuses to pin a shortcut that points at a batch file, and the
  // desktop icon has to point straight at node for pinning to work.
  if (process.env.HUB_NO_BROWSER) return;
  const opener =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(opener[0], opener[1], { detached: true, stdio: "ignore" }).unref();
  } catch (err) {
    console.log(`  (Open it yourself: ${url})`);
  }
});
