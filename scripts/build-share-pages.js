// ============================================================================
// A real page per piece, so a shared link shows the piece.
// ============================================================================
//
// The shop renders a piece with JavaScript from product.html?id=..., which is
// fine for a person and useless to everything else: Instagram, TikTok, Facebook
// and iMessage fetch a link and read the HTML as it arrives, without running a
// line of script. They would all find the same generic title, no photo and no
// price, whichever piece was being shared.
//
// So each piece gets its own file at /p/<id>.html: the same page, with its own
// title, description and Open Graph tags already in the HTML, and the piece's
// id set before the scripts run. Nothing is duplicated by hand; this is built
// from product.html on every sync.
//
//   node scripts/build-share-pages.js

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://micknackstacks.com";
const OUT = join(ROOT, "p");

function dataFile(name, key) {
  const path = join(ROOT, "data", name);
  if (!existsSync(path)) return null;
  const context = createContext({ window: {} });
  runInContext(readFileSync(path, "utf8"), context);
  return context.window[key];
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// One line of plain prose for the share card, out of the listing's own words.
function blurb(piece) {
  const text = String(piece.description || "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = text.split(/(?<=[.!?])\s/)[0] || text;
  const short = sentence.length > 160 ? sentence.slice(0, 157).trim() + "…" : sentence;
  return short || "Draped chain ear cuffs and stacking jewelry, designed and loved from Colorado.";
}

// The share page lives in /p/, so every relative path in the template has to
// become absolute or it would look for /p/css/style.css.
function absolutePaths(html) {
  return html.replace(/\b(src|href)="(?!https?:|\/\/|\/|#|mailto:|data:)([^"]+)"/g, '$1="/$2"');
}

function pageFor(template, piece, id) {
  const title = piece.title || "Micknack Stacks";
  const image = (piece.images || [])[0] || "/assets/hero-banner.webp";
  const absoluteImage = /^https?:/i.test(image) ? image : SITE + "/" + image.replace(/^\/+/, "");
  const url = `${SITE}/p/${id}.html`;
  const description = blurb(piece);
  const price = piece.price ? String(piece.price) : "";

  const head = [
    `  <title>${escapeAttr(title)} | Micknack Stacks</title>`,
    `  <meta name="description" content="${escapeAttr(description)}" />`,
    `  <link rel="canonical" href="${escapeAttr(url)}" />`,
    "",
    "  <!-- What Instagram, TikTok, Facebook and iMessage read when this is shared. -->",
    `  <meta property="og:type" content="product" />`,
    `  <meta property="og:site_name" content="Micknack Stacks" />`,
    `  <meta property="og:title" content="${escapeAttr(title)}" />`,
    `  <meta property="og:description" content="${escapeAttr(description)}" />`,
    `  <meta property="og:image" content="${escapeAttr(absoluteImage)}" />`,
    `  <meta property="og:image:alt" content="${escapeAttr(title)}" />`,
    `  <meta property="og:url" content="${escapeAttr(url)}" />`,
    price ? `  <meta property="product:price:amount" content="${escapeAttr(price)}" />` : "",
    price ? `  <meta property="product:price:currency" content="USD" />` : "",
    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `  <meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `  <meta name="twitter:image" content="${escapeAttr(absoluteImage)}" />`,
  ]
    .filter(Boolean)
    .join("\n");

  let html = absolutePaths(template);

  // Swap the template's generic title and description for this piece's.
  html = html.replace(
    /  <title>[\s\S]*?<\/title>\n  <meta name="description"[^>]*\/>/,
    head
  );

  // The scripts read this instead of the query string.
  html = html.replace(
    "<body>",
    `<body>\n  <script>window.MICKNACK_PRODUCT_ID = ${JSON.stringify(String(id))};</script>`
  );

  return html;
}

function main() {
  // Line endings normalized first: the template is stored with Windows ones,
  // and the patterns below are written with plain newlines, so without this
  // they quietly match nothing and every page keeps the generic title.
  const template = readFileSync(join(ROOT, "product.html"), "utf8").replace(/\r\n/g, "\n");
  const products = dataFile("products.js", "MICKNACK_PRODUCTS") || { listings: [] };
  const extras = dataFile("extra-products.js", "MICKNACK_EXTRA_PRODUCTS") || [];

  // A hidden piece is off the site, so it should have nothing to share either:
  // a link to one would show a page that then refuses to render it.
  const inventory = dataFile("inventory.js", "MICKNACK_INVENTORY") || {};
  const hidden = (id) => Boolean((inventory[String(id)] || {}).hidden);

  const pieces = [
    ...(products.listings || []).map((listing) => [String(listing.listing_id), listing]),
    ...extras.map((extra) => [String(extra.id), extra]),
  ].filter(([id]) => !hidden(id));

  if (!pieces.length) {
    console.log("::warning::No pieces found; share pages left alone.");
    return;
  }

  // Rebuilt from scratch each time, so a piece that goes stops having a page.
  if (existsSync(OUT)) {
    for (const file of readdirSync(OUT)) {
      if (file.endsWith(".html")) rmSync(join(OUT, file));
    }
  }
  mkdirSync(OUT, { recursive: true });

  for (const [id, piece] of pieces) {
    writeFileSync(join(OUT, `${id}.html`), pageFor(template, piece, id));
  }

  console.log(`Wrote ${pieces.length} share page(s) to p/`);
}

main();
