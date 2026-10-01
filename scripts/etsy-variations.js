// ============================================================================
// VARIATIONS — reading Etsy's option drop-downs, so data/variations.js keeps
// itself in step with the listings.
// ============================================================================
//
// The listings themselves come back with an API key alone, but a listing's
// options do not: they need a shop owner's permission. So this half runs on an
// OAuth token, and only when one is configured. Without it the sync carries on
// exactly as before and leaves data/variations.js alone, which is why adding
// this can't break the nightly run.
//
// Set up again, if the token ever lapses: see worker/README.md, "Reconnecting
// Etsy". The connection lasts 90 days.

const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const API = "https://openapi.etsy.com/v3/application";

// Etsy allows this app 5 requests a second; the sync already spends most of
// that on photos, so these are spaced the same way.
const MIN_INTERVAL_MS = 300;
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Swap the stored refresh token for an access token good for an hour.
//
// Etsy hands back a fresh refresh token each time, but the stored one stays
// valid for its full 90 days, so there's nothing to write back. That matters:
// a GitHub Actions run can't update its own secrets.
export async function getAccessToken({ clientId, refreshToken }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    // 400 here almost always means the 90 days are up.
    throw new Error(
      `Etsy refused the refresh token (HTTP ${res.status}). ` +
        `Reconnect with scripts/etsy-connect.js. Etsy said: ${text.slice(0, 200)}`
    );
  }
  return JSON.parse(text).access_token;
}

async function getJson(url, headers, attempt = 1) {
  const res = await fetch(url, { headers });
  if (res.ok) return res.json();

  // A listing with no options at all answers 404 on this endpoint.
  if (res.status === 404) return null;

  const retryable = res.status === 429 || res.status >= 500;
  if (!retryable || attempt === MAX_ATTEMPTS) {
    const body = await res.text();
    throw new Error(`Etsy API ${res.status} on ${url}: ${body.slice(0, 200)}`);
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
  return getJson(url, headers, attempt + 1);
}

// "6mm" and "6 mm" are the same choice written two ways, and the shop has both
// on Etsy. The site shows one of them, with the space, so a buyer comparing two
// pieces side by side does not wonder what the difference is.
//
// Deliberately narrow: only a bare measurement is touched, so a gauge like 18G
// and anything wordier are left exactly as Etsy has them.
export function tidyChoice(value) {
  return String(value)
    .trim()
    .replace(
      /^(\d+(?:\.\d+)?)\s*(mm|cm)$/i,
      (match, number, unit) => `${number} ${unit.toLowerCase()}`
    );
}

// Turn Etsy's inventory shape into the drop-downs the site renders.
//
// Etsy describes a listing as every sellable combination: a piece with two
// lengths is two products, each carrying its own property values. The site
// wants the reverse — each property once, with its choices in Etsy's order.
export function optionsFromInventory(inventory) {
  if (!inventory || !Array.isArray(inventory.products)) return [];

  const byName = new Map();
  for (const product of inventory.products) {
    for (const value of product.property_values || []) {
      const name = (value.property_name || "").trim();
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      const choices = byName.get(name);
      for (const choice of value.values || []) {
        const clean = tidyChoice(choice);
        if (clean && !choices.includes(clean)) choices.push(clean);
      }
    }
  }

  return [...byName.entries()]
    .filter(([, options]) => options.length > 0)
    .map(([name, options]) => ({ name, options }));
}

// Ask Etsy for every listing's options. Listings are done one at a time on
// purpose: in a burst, Etsy starts refusing, and a refused listing would look
// exactly like a listing with no options and quietly drop its drop-downs.
export async function fetchVariations(listingIds, { clientId, apiKey, accessToken, log = () => {} }) {
  const headers = { "x-api-key": apiKey, Authorization: `Bearer ${accessToken}` };
  const variations = {};
  let withOptions = 0;

  for (const id of listingIds) {
    await sleep(MIN_INTERVAL_MS);
    const inventory = await getJson(`${API}/listings/${id}/inventory`, headers);
    const options = optionsFromInventory(inventory);
    if (options.length) {
      variations[id] = options;
      withOptions++;
    }
  }

  log(`${withOptions} of ${listingIds.length} listing(s) have options on Etsy.`);
  return variations;
}

// The file the site loads. Written in the same shape it has always had, with a
// title against each piece so it stays readable to a person.
export function renderVariationsFile(variations, titles, { syncedAt }) {
  const lines = [
    "// ============================================================================",
    "// VARIATIONS — the drop-downs a buyer picks from, like Etsy's options.",
    "// ============================================================================",
    "//",
    "// Auto-generated by scripts/sync-etsy.js from the live Etsy listings.",
    "// Do not hand-edit: the next sync overwrites it. Change the options on the",
    "// Etsy listing instead and they appear here.",
    "//",
    "// Stock counts the PIECE, not each option: choosing 6 mm or 8 mm draws on the",
    "// same count. All options of a piece share its price.",
    "//",
    `// Last read from Etsy: ${syncedAt}`,
    "",
    "window.MICKNACK_VARIATIONS = {",
  ];

  for (const [id, options] of Object.entries(variations)) {
    const title = (titles[id] || "").slice(0, 60);
    if (title) lines.push(`  // ${title}`);
    const rendered = options
      .map(
        (option) =>
          `{ name: ${JSON.stringify(option.name)}, options: [${option.options
            .map((choice) => JSON.stringify(choice))
            .join(", ")}] }`
      )
      .join(", ");
    lines.push(`  ${JSON.stringify(String(id))}: [${rendered}],`);
  }

  lines.push("};", "");
  return lines.join("\n");
}
