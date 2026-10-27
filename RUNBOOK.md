# Running Micknack Stacks without Claude

Everything the shop needs is in this folder or already running on its own.
Nothing here requires a Claude subscription, an account with anybody, or a
person who writes code. This page is the whole manual.

If you read nothing else: **the website keeps running whether or not anyone
touches it.** It syncs itself from Etsy every hour. The only time you need
anything below is when you want to change something yourself.

---

## The one thing you'll use regularly: the shop desk

Double-click **`shop.cmd`** in this folder. A black window opens (leave it
open) and your browser shows the shop desk.

There you can:

- **Set how many you have** of each piece. Put a count in the box.
- **Hide a piece** so it does not appear on the site at all.
- **Say why**, when a piece is hidden or sold out, so you remember later.

A piece at **0** shows as *Sold Out* on the site, with no Buy button. A piece
you hide is not shown at all.

Then press **Save & publish**. The site updates in a minute or two.

*Save* on its own keeps your changes on this computer without touching the
website — useful if you are halfway through counting.

When you are finished, close the black window.

### Where your numbers live

- `data/stock-counts.json` — your real counts. Private, never published.
- `data/inventory.js` — only which pieces are sold out or hidden. This is the
  one the website reads.

Shoppers never see your counts. They only ever see "Sold Out" or nothing.

---

## What happens by itself

**Every hour**, GitHub runs the Etsy sync. It:

- picks up new listings, new photos, price and title changes
- notices what sold on Etsy and lowers the counts to match
- creates a Buy button for any new piece
- rebuilds the share pages used by Instagram and TikTok links
- refreshes the reviews shown on your site

You do not have to do anything for any of that. If you add a piece to Etsy at
2pm, it is on your website by 3pm with a working Buy button.

**Checkout** runs on Stripe and a small Cloudflare worker. Both are already
live and need nothing from you.

---

## Things you might want occasionally

Open a terminal in this folder for these. (In File Explorer, right-click
inside the folder and choose "Open in Terminal".)

### See where your sales are going

```
npm run sales
```

Lists every order by state, Etsy and your own site kept separate, and tells
you whether anything needs doing about sales tax.

### Force a sync right now instead of waiting for the hour

```
npm run sync
```

### Preview the site on this computer before anybody sees it

```
npm run serve
```

Then open http://localhost:5173

### Add a piece that is not on Etsy

Open `data/extra-products.js` in Notepad. The instructions are written at the
top of that file. Put the photo in `assets/products/` first.

---

## The one date to keep: your Etsy connection

Your Etsy connection expires roughly every **90 days**. Last renewed
**23 October 2026**, so the next one is due around **21 January 2027**.

If it lapses, the site keeps working — it just stops picking up new listings
and view counts until you renew.

To renew:

1. In a terminal here, run `node scripts/etsy-connect.js`
2. Open the link it prints, sign in to Etsy, click Allow
3. Copy the code from the page you land on
4. Run `node scripts/etsy-connect.js THECODE` (paste the code in place of
   THECODE)
5. It prints a command that copies the new token to your clipboard. Run it.
6. Go to the repository on GitHub → **Settings** → **Secrets and variables**
   → **Actions** → edit `ETSY_REFRESH_TOKEN` → paste → **Update secret**

Step 6 matters. Without it the hourly sync keeps using the old connection.

To check it worked: wait for the next hourly sync, then look at
`data/etsy-stats.json`. If `views` has a number in it, the connection is good
— view counts only come through when Etsy recognises you as the shop owner.

---

## Sales tax, in one paragraph

You are a sole proprietor in Colorado Springs. Etsy collects and remits sales
tax on Etsy orders itself, so those need nothing from you. Sales through your
own site are yours to handle, but tax is owed where the **customer** is, and
you only have to collect somewhere you are registered. You are registered
nowhere, and the only state you have a duty in is Colorado, where you have
had no direct orders. So there is nothing to collect today.

**What changes it:** a Colorado customer ordering from your own website. At
that point you need a Colorado Dept. of Revenue sales tax licence and a City
of Colorado Springs licence (free), and Stripe needs switching on to collect.
`npm run sales` watches for exactly this and will tell you.

---

## If something looks broken

**The site is showing an old version.** GitHub Pages takes a minute or two.
Hard-refresh with Ctrl+Shift+R.

**A new Etsy piece has no Buy button.** It gets one on the next hourly sync.
If it has been several hours, run `npm run sync`.

**"Save & publish" gave an error.** Usually the hourly sync pushed at the same
moment. Press it again.

**The sync has stopped working.** Check the Etsy connection above — that is
almost always it.

**Everything is broken and you do not know why.** Every change ever made is
in the repository's history on GitHub, and any of it can be put back. Nothing
is ever truly lost.

---

## What you are paying for

| What | Cost |
|---|---|
| Website hosting (GitHub Pages) | free |
| Hourly sync (GitHub Actions) | free |
| Checkout worker (Cloudflare) | free |
| Domain name | yearly, through your registrar |
| Stripe | per sale only — no monthly fee |

No subscription is required to run any of this.
