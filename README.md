# Micknack Stacks — Website

Live at **https://jamiemick18.github.io/micknack-stacks-website/**

A plain HTML/CSS/JS storefront. It copies your Etsy listings automatically, and
you can also add pieces by hand that aren't on Etsy at all.

```
index.html              The page itself
css/style.css           Colors, fonts, layout
js/app.js               Builds the product cards
data/products.js        Etsy listings (written by the sync, don't hand-edit)
data/extra-products.js  Pieces you add by hand (the sync never touches this)
assets/                 Logo, graphics, product photos you upload
scripts/sync-etsy.js    Fetches listings from Etsy
scripts/serve.js        Local preview server
.github/workflows/      The automation (sync daily, publish the site)
```

## How it updates itself

Every morning around 7am Colorado time, GitHub fetches your active Etsy
listings, saves them to `data/products.js`, and republishes the site. You don't
have to do anything.

**To update it right now instead of waiting:** go to
[the sync workflow](https://github.com/jamiemick18/micknack-stacks-website/actions/workflows/sync-etsy.yml),
click **Run workflow**, then the green **Run workflow** button. Give it about
two minutes.

Only listings that are **Active** on Etsy show up. Drafts are ignored.

## Adding a piece that isn't on Etsy

Use this for anything you don't want to pay Etsy's $0.20 listing fee for:
pieces that didn't sell, one-offs, things you're testing. There's no limit and
no cost.

All of it can be done on github.com in your browser:

**1. Upload the photo**

- Open the [assets/products folder](https://github.com/jamiemick18/micknack-stacks-website/tree/main/assets/products)
- **Add file** → **Upload files**, drag your photo in, then **Commit changes**
- Note the file name, e.g. `rose-studs.jpg`

**2. Add the item**

- Open [data/extra-products.js](https://github.com/jamiemick18/micknack-stacks-website/blob/main/data/extra-products.js)
- Click the pencil icon to edit
- Paste a block like this between the `[` and `]` brackets:

```js
  {
    id: "rose-studs",
    title: "Black Rose Studs | Gold Flatback",
    price: "15.99",
    description: "A short description. The first line or so shows on the card.",
    images: ["assets/products/rose-studs.jpg"],
    url: "",
    badge: "Only here",
  },
```

- **Commit changes**. The site updates in about a minute.

**What each line does**

| Field | Required? | Notes |
|---|---|---|
| `id` | Yes | Any short nickname, no spaces, unique |
| `title` | Yes | Shown on the card |
| `price` | No | Number only, no `$`. Leave it out to hide the price |
| `description` | No | First ~110 characters show on the card |
| `images` | No | Your uploaded photo, or a web link |
| `url` | No | Where the button goes. Empty means no button |
| `button_label` | No | Button wording. Defaults to "Buy Now" |
| `badge` | No | Small label on the photo, e.g. "Only here" |

Items with no `url` show a "Coming soon" label instead of a button. When you're
ready to sell directly, put a Stripe payment link in `url` and it becomes a
working Buy button.

Keep the commas and quote marks exactly as shown. If the page ever goes blank
after an edit, a comma or quote is usually missing — undo that commit on GitHub
and the site comes right back.

## Changing the words or colors

- **Headline, tagline, About text**: [index.html](https://github.com/jamiemick18/micknack-stacks-website/blob/main/index.html)
- **Colors and fonts**: `css/style.css`, the `:root` block at the top
- **Logo and graphics**: replace files in `assets/`

## For developers

Local preview (needs [Node.js](https://nodejs.org)):

```bash
node scripts/serve.js     # http://localhost:5173
```

Run the Etsy sync locally: copy `.env.example` to `.env` and set
`ETSY_API_KEY` to your Etsy app's **Keystring and Shared Secret joined by a
colon** (`keystring:sharedsecret` — the keystring alone returns 403). Then:

```bash
node scripts/sync-etsy.js
```

In GitHub Actions the same value comes from the `ETSY_API_KEY` repository
secret. `.env` is gitignored and must never be committed.

Notes on the automation:

- `sync-etsy.yml` commits changes, then calls `deploy-pages.yml` directly,
  because a push made with `GITHUB_TOKEN` does not trigger other workflows.
- Both workflows check out `ref: main` rather than the triggering commit, so a
  sync publishes the data it just wrote instead of the previous run's.
- Photos need a separate API call per listing (the bulk endpoint ignores
  `includes=Images`), so requests are spaced out and retried to stay under
  Etsy's 5 requests/second limit.
