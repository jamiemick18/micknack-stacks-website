// ============================================================================
// Reconnect the shop's Etsy app, so the sync can keep reading option
// drop-downs. Takes about two minutes, and is needed roughly every 90 days.
// ============================================================================
//
//   node scripts/etsy-connect.js            start: prints the approval link
//   node scripts/etsy-connect.js <code>     finish: swaps the code for a token
//
// Etsy's permission lasts 90 days and cannot be renewed without a person
// clicking Allow, so this cannot be automated away. The sync warns in good
// time rather than failing on the day.
//
// Nothing here ever sees an Etsy password: the approval happens on Etsy's own
// site, and what comes back only reads listings.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STATE_PATH = join(ROOT, ".etsy-connect.json"); // gitignored: holds the verifier
const REDIRECT_URI = "https://micknackstacks.com/oauth.html";
const SCOPE = "listings_r";

function env() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) throw new Error("No .env file here.");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
}

const base64url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function start(clientId) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(12));

  writeFileSync(STATE_PATH, JSON.stringify({ verifier, state, started: new Date().toISOString() }, null, 2));

  const url =
    "https://www.etsy.com/oauth/connect?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

  console.log("\n1. Open this link while signed in to Etsy:\n");
  console.log(url);
  console.log("\n2. Check it asks only to read your listings, then click Allow.");
  console.log("3. Copy the code from the page you land on, then run:\n");
  console.log("   node scripts/etsy-connect.js <code>\n");
}

async function finish(clientId, code) {
  if (!existsSync(STATE_PATH)) {
    throw new Error("Run this with no arguments first to get an approval link.");
  }
  const { verifier } = JSON.parse(readFileSync(STATE_PATH, "utf8"));

  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Etsy said no (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  const token = JSON.parse(text).refresh_token;

  // Written to .env, which is gitignored, and never printed: a refresh token is
  // as good as the permission itself for the next 90 days.
  const path = join(ROOT, ".env");
  let contents = readFileSync(path, "utf8");
  contents = /^ETSY_REFRESH_TOKEN=/m.test(contents)
    ? contents.replace(/^ETSY_REFRESH_TOKEN=.*$/m, `ETSY_REFRESH_TOKEN=${token}`)
    : `${contents.replace(/\s*$/, "")}\nETSY_REFRESH_TOKEN=${token}\n`;
  writeFileSync(path, contents);

  console.log("\nConnected. The token is in .env and was not printed.");
  console.log("Now put the same value in the repository secret ETSY_REFRESH_TOKEN:");
  console.log("  https://github.com/jamiemick18/micknack-stacks-website/settings/secrets/actions");
  console.log("\nTo copy it to the clipboard without it appearing on screen:");
  console.log('  node -e "const fs=require(\'fs\');const m=fs.readFileSync(\'.env\',\'utf8\').match(/^ETSY_REFRESH_TOKEN=(.*)$/m);require(\'child_process\').execSync(\'clip\',{input:m[1]})"');
  console.log(`\nGood until roughly ${new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)}.\n`);
}

const key = env().ETSY_API_KEY;
if (!key) throw new Error("ETSY_API_KEY is not set in .env");
const clientId = key.split(":")[0];

const code = process.argv[2];
await (code ? finish(clientId, code) : start(clientId));
