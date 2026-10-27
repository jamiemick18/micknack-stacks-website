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
function reviewToken() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return "";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*REVIEW_TOKEN\s*=\s*(.+)$/.exec(line);
    if (match) return match[1].trim();
  }
  return "";
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
    });
  }

  pieces.sort((a, b) => a.title.localeCompare(b.title));
  return { pieces, synced_at: products.synced_at || null };
}

// ---------------------------------------------------------------------------
// Writing it back
// ---------------------------------------------------------------------------

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
];

function publish() {
  const changed = git("status", "--porcelain", "--", ...HUB_FILES);
  if (!changed) return { ok: true, message: "Nothing to publish — the site already matches." };

  git("add", ...HUB_FILES);
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
  let imagePath = "";
  if (photo && photo.data) {
    const ext = extname(photo.name || "").toLowerCase();
    if (!IMAGE_TYPES[ext]) throw new Error("That photo needs to be a jpg, png, webp or gif.");
    const buffer = Buffer.from(photo.data, "base64");
    if (buffer.length > 8e6) throw new Error("That photo is bigger than 8MB. Shrink it first.");
    mkdirSync(join(ROOT, "assets", "products"), { recursive: true });
    imagePath = `assets/products/${id}${ext}`;
    writeFileSync(join(ROOT, imagePath), buffer);
  }

  const entry =
    "  {\n" +
    `    id: ${JSON.stringify(id)},\n` +
    `    title: ${JSON.stringify(String(title).trim())},\n` +
    `    price: ${JSON.stringify(String(price).trim())},\n` +
    (description ? `    description: ${JSON.stringify(String(description).trim())},\n` : "") +
    (imagePath ? `    images: [${JSON.stringify(imagePath)}],\n` : "") +
    `    url: "",\n` +
    (badge ? `    badge: ${JSON.stringify(String(badge).trim())},\n` : "") +
    "  },\n";

  const path = join(ROOT, "data", "extra-products.js");
  const original = readFileSync(path, "utf8");
  const crlf = original.includes("\r\n");
  let file = original.replace(/\r\n/g, "\n");
  const anchor = "window.MICKNACK_EXTRA_PRODUCTS = [\n";
  if (!file.includes(anchor)) throw new Error("data/extra-products.js does not look like itself.");
  file = file.replace(anchor, anchor + entry);
  writeFileSync(path, crlf ? file.replace(/\n/g, "\r\n") : file);

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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }

    if (req.url === "/api/state") return json(200, state());

    if (req.url === "/api/save" && req.method === "POST") {
      const { items } = await readBody(req);
      const counted = save(items || {});
      return json(200, {
        ok: true,
        message: `Saved. ${counted.sold_out} sold out, ${counted.hidden} hidden. Publish when you want the site to show it.`,
      });
    }

    if (req.url === "/api/publish" && req.method === "POST") {
      const { items } = await readBody(req);
      save(items || {});
      return json(200, publish());
    }

    // Etsy lowers its own count when something sells there, but nothing tells
    // the HUB, so the two drift apart a sale at a time. This catches it up.
    if (req.url === "/api/match-etsy" && req.method === "POST") {
      const products = windowFile("data/products.js", "MICKNACK_PRODUCTS") || {};
      const counts = readCounts();
      const moved = [];
      for (const listing of products.listings || []) {
        if (listing.etsy_active === false) continue;
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

    if (req.url === "/api/traffic") return json(200, await traffic());

    if (req.url === "/api/sales") return json(200, sales());

    if (req.url === "/api/add" && req.method === "POST") {
      const form = await readBody(req);
      const { id } = addPiece(form);
      // A piece nobody can buy is not much use, so it gets its Stripe link
      // here. Nothing is sent to the website, though: the form promises that
      // publishing is a separate decision, and it should stay one.
      let linked = "";
      try {
        execFileSync(process.execPath, [join(__dirname, "create-stripe-links.js"), "--live"], {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 120000,
        });
        linked = " with a Buy button";
      } catch (err) {
        linked = ", though its Buy button could not be made yet";
      }
      return json(200, {
        ok: true,
        message: `Added "${form.title}"${linked}. Press Save & publish to put it on the website.`,
        id,
      });
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
    console.log("  Nothing is wrong — you can close this window.\n");
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
