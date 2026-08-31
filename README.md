# Micknack Stacks — Website

A static storefront that mirrors your Etsy shop (**MicknackStacks**). It's plain
HTML/CSS/JS — no build step, no framework, no server required to view it —
plus one small optional Node script that pulls your active listings from the
Etsy Open API into `data/products.js`.

```
index.html            The page
css/style.css          All styling (brand colors + fonts)
js/app.js              Renders product cards from data/products.js
data/products.js       Your listings (sample data until you run the sync)
assets/                Logo, decorative graphics, sample product images
scripts/sync-etsy.js   Pulls listings from Etsy → data/products.js (needs Node)
scripts/serve.js       Optional local server, only useful if you have Node
```

## 1. Preview it now (sample data)

Just double-click `index.html`, or open it in a browser. That's it — the
listing data is a plain `.js` file loaded like any script tag, so there's
nothing to install and nothing to run.

It already shows placeholder listings (The Aspyn, The Lou, The Maddix) styled
in your Dark Alpine palette, sourced from the inspiration images already in
your `Product` folder.

## 2. Connect your real Etsy listings

This step needs [Node.js](https://nodejs.org) installed on your computer
(free, one-click installer — pick the "LTS" version). It's the only part of
this project that needs anything installed; the site itself never does.

Then, get a free Etsy developer API key — about 5 minutes:

1. Go to **https://www.etsy.com/developers/register** and sign in with your
   Etsy account (the same one that owns the MicknackStacks shop).
2. Create a new app (any name/description is fine, e.g. "Micknack Stacks Website").
3. Etsy gives you a **Keystring** and a **Shared Secret** on the app's page.
   Your API key is both of these joined with a colon:
   `yourkeystring:yoursharedsecret` — the Keystring alone will fail with a
   403 "Invalid API key" error.
4. In this `Website` folder, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Open `.env` and paste your key:
   ```
   ETSY_API_KEY=yourkeystring:yoursharedsecret
   ETSY_SHOP_NAME=MicknackStacks
   ```
6. Run the sync script (no extra installs needed, it only uses Node's
   built-ins):
   ```bash
   node scripts/sync-etsy.js
   ```

This fetches every **active** listing in your shop (title, price, photos,
description, tags) and overwrites `data/products.js`. Refresh `index.html`
in your browser to see your real listings.

Re-run `node scripts/sync-etsy.js` any time you add, edit, or retire a
listing on Etsy — it's a one-way, read-only pull, so nothing you do on this
site ever touches your Etsy shop or listings.

> The `.env` file holds your private API key and is already excluded via
> `.gitignore` — never commit it or share it publicly.

## 3. Put it online

Since it's just static files, any of these work (all have free tiers):

- **Netlify** — drag the `Website` folder onto https://app.netlify.com/drop
- **Vercel** — `vercel deploy` from inside `Website/`
- **GitHub Pages** — push `Website/` to a repo and enable Pages on it

Whichever host you pick, re-run the sync script locally and re-deploy (or
push) whenever you want the live site to pick up new Etsy listings — there's
no live database, so it only updates when you sync.

## Customizing

- **Colors/fonts**: `css/style.css`, top `:root` block.
- **Copy** (tagline, about section): `index.html`.
- **Decorative graphics**: swap files in `assets/` — they're pulled from
  your existing Dark Alpine graphics pack and shop banner.
