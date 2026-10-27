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
//   npm run shop        (or double-click shop.cmd)
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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { execFileSync } from "node:child_process";

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

function publish() {
  const changed = git("status", "--porcelain", "--", "data/inventory.js");
  if (!changed) return { ok: true, message: "Nothing to publish — the site already matches." };

  git("add", "data/inventory.js");
  git("commit", "-m", "Update what's sold out and hidden");

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
// The page itself. Built here rather than kept as a file in the repo, because
// every file in the repo is published to the open web and this one is nobody
// else's business.
// ---------------------------------------------------------------------------

function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Micknack Stacks HUB</title>
<style>
  :root {
    --ink: #0f0d0b; --paper: #faf6ef; --card: #fffaf4;
    --gold: #b78436; --line: rgba(15,13,11,.13); --muted: #6b6259;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.5 "Helvetica Neue", Arial, sans-serif;
  }
  header {
    position: sticky; top: 0; z-index: 5; background: var(--paper);
    border-bottom: 1px solid var(--line); padding: 16px 20px;
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
  }
  h1 {
    font: 400 1.15rem/1 "Cormorant Garamond", Georgia, serif;
    letter-spacing: .16em; text-transform: uppercase; margin: 0; flex: 1;
  }
  .count { color: var(--muted); font-size: .8rem; }
  button {
    font: inherit; border-radius: 999px; padding: 9px 18px; cursor: pointer;
    border: 1px solid var(--ink); background: var(--ink); color: var(--paper);
  }
  button.ghost { background: none; color: var(--ink); }
  button:disabled { opacity: .4; cursor: default; }
  #note { padding: 0 20px; color: var(--muted); font-size: .85rem; min-height: 22px; }
  main { padding: 12px 20px 60px; display: grid; gap: 10px; }
  .row {
    background: var(--card); border: 1px solid var(--line); border-radius: 4px;
    padding: 10px 12px; display: grid;
    grid-template-columns: 54px 1fr auto auto auto; gap: 12px; align-items: center;
  }
  .row.off { opacity: .5; }
  img { width: 54px; height: 54px; object-fit: cover; border-radius: 3px; background: #eee; }
  .title { font-size: .92rem; }
  .meta { color: var(--muted); font-size: .75rem; margin-top: 2px; }
  .note {
    display: none; margin-top: 6px; width: 100%; max-width: 440px;
    font: inherit; font-size: .8rem; padding: 5px 8px; background: #fff;
    border: 1px solid var(--line); border-radius: 3px;
  }
  .warn { color: #9a3412; }
  input[type=number] {
    width: 68px; padding: 7px 8px; font: inherit; text-align: center;
    border: 1px solid var(--line); border-radius: 3px; background: #fff;
  }
  .pill {
    font-size: .68rem; letter-spacing: .1em; text-transform: uppercase;
    border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px;
    color: var(--muted); white-space: nowrap;
  }
  .pill.sold { color: #9a3412; border-color: #9a3412; }
  @media (max-width: 720px) {
    .row { grid-template-columns: 44px 1fr auto; }
    img { width: 44px; height: 44px; }
    .pill { display: none; }
  }
</style>
</head>
<body>
<header>
  <h1>Micknack Stacks HUB</h1>
  <span class="count" id="summary"></span>
  <button class="ghost" id="revert">Undo changes</button>
  <button id="save">Save</button>
  <button id="publish">Save &amp; publish</button>
</header>
<p id="note">Loading…</p>
<main id="list"></main>

<script>
let pieces = [];
let original = "";

const note = (text, bad) => {
  const el = document.getElementById("note");
  el.textContent = text;
  el.className = bad ? "warn" : "";
};

function summarise() {
  const sold = pieces.filter(p => !p.hidden && Number(p.qty) <= 0).length;
  const hidden = pieces.filter(p => p.hidden).length;
  document.getElementById("summary").textContent =
    pieces.length + " pieces · " + sold + " sold out · " + hidden + " hidden";
}

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const p of pieces) {
    const row = document.createElement("div");
    row.className = "row" + (p.hidden ? " off" : "");

    const img = document.createElement("img");
    img.src = p.image; img.alt = "";
    img.onerror = () => { img.style.visibility = "hidden"; };

    const cell = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = p.title.split("|")[0].trim();
    const meta = document.createElement("div");
    meta.className = "meta";
    const bits = ["$" + p.price];
    if (!p.on_etsy) bits.push("not on Etsy");
    else if (p.etsy_qty !== p.qty) bits.push("Etsy says " + p.etsy_qty);
    if (!p.buyable) bits.push("no Buy button yet");
    meta.textContent = bits.join(" · ");
    cell.append(title, meta);

    const qty = document.createElement("input");
    qty.type = "number"; qty.min = "0"; qty.value = p.qty;
    qty.title = "How many you have";
    qty.addEventListener("input", () => { p.qty = Number(qty.value); summarise(); paint(row, p); });

    const pill = document.createElement("span");
    pill.className = "pill";

    const hide = document.createElement("button");
    hide.className = "ghost";
    hide.addEventListener("click", () => {
      p.hidden = !p.hidden;
      row.className = "row" + (p.hidden ? " off" : "");
      paint(row, p); summarise();
    });

    const note = document.createElement("input");
    note.type = "text";
    note.className = "note";
    note.placeholder = "why? (optional — kept with the piece)";
    note.value = p.note || "";
    note.addEventListener("input", () => { p.note = note.value; });
    cell.append(note);

    row.append(img, cell, qty, pill, hide);
    list.append(row);
    paint(row, p);
  }
  summarise();
}

function paint(row, p) {
  const pill = row.querySelector(".pill");
  const hide = row.querySelector("button");
  // The note only matters for a piece that is off sale, so it only appears
  // then rather than putting an empty box against all fifty-three.
  const off = p.hidden || Number(p.qty) <= 0;
  row.querySelector(".note").style.display = off ? "block" : "none";
  hide.textContent = p.hidden ? "Show" : "Hide";
  if (p.hidden) { pill.textContent = "hidden"; pill.className = "pill"; }
  else if (Number(p.qty) <= 0) { pill.textContent = "sold out"; pill.className = "pill sold"; }
  else { pill.textContent = "on sale"; pill.className = "pill"; }
}

async function load() {
  const res = await fetch("/api/state");
  const data = await res.json();
  pieces = data.pieces;
  original = JSON.stringify(pieces);
  render();
  note("Set a count, or hide a piece. Nothing reaches the website until you publish.");
}

function body() {
  const items = {};
  for (const p of pieces) {
    items[p.id] = { qty: Number(p.qty), hidden: Boolean(p.hidden) };
    if (p.note) items[p.id].note = p.note;
  }
  return JSON.stringify({ items });
}

async function send(path, label) {
  for (const b of document.querySelectorAll("header button")) b.disabled = true;
  note(label + "…");
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    const data = await res.json();
    note(data.message, !data.ok);
    if (data.ok) original = JSON.stringify(pieces);
  } catch (err) {
    note("That did not work: " + err.message, true);
  }
  for (const b of document.querySelectorAll("header button")) b.disabled = false;
}

document.getElementById("save").addEventListener("click", () => send("/api/save", "Saving"));
document.getElementById("publish").addEventListener("click", () => send("/api/publish", "Publishing"));
document.getElementById("revert").addEventListener("click", () => {
  pieces = JSON.parse(original); render();
  note("Back to the last saved version.");
});

window.addEventListener("beforeunload", (e) => {
  if (JSON.stringify(pieces) !== original) { e.preventDefault(); e.returnValue = ""; }
});

load();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2e6) reject(new Error("too much data"));
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

    res.writeHead(404).end("Not here");
  } catch (err) {
    json(500, { ok: false, message: err.message });
  }
});

// Only ever answer this machine. There is no password on this thing because
// there is no way in from anywhere else.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  The HUB is open:  http://localhost:${PORT}\n`);
  console.log("  Leave this window open while you use it. Close it when you are done.\n");
});
