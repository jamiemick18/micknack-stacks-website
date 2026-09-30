# Checkout worker

The little piece of code that turns a cart into a Stripe checkout page. The
shop itself is static files, which can't hold a Stripe secret key, so this runs
on Cloudflare — the same account your domain already uses. It's free: the plan
covers 100,000 requests a day.

## Setting it up (once)

1. Go to **https://dash.cloudflare.com** → **Compute (Workers)** → **Create** →
   **Start with Hello World** → name it `micknack-checkout` → **Deploy**.
2. Click **Edit code**, delete everything in the editor, and paste in all of
   `checkout-worker.js` from this folder. **Deploy** again.
3. Go to the Worker's **Settings** → **Variables and Secrets** → **Add**:
   - Type: **Secret**
   - Name: `STRIPE_SECRET_KEY`
   - Value: your live Stripe key (the `rk_live_…` one already in `.env`)
   - **Deploy**
4. Copy the Worker's URL from its overview page. It looks like
   `https://micknack-checkout.<something>.workers.dev`.
5. Put that URL in `js/cart.js`, as `CHECKOUT_ENDPOINT` at the top.

## Checking it works

Add something to the cart on the site and press Checkout. You should land on
Stripe's payment page with every piece listed and **one** $5 shipping charge.

If checkout says it couldn't start, open the Worker in Cloudflare and look at
**Logs** — Stripe's actual complaint is printed there. The usual causes are a
missing or mistyped `STRIPE_SECRET_KEY`, or a test key being used against live
prices.

## What it will and won't do

- Prices come from Stripe, never from the browser, so a tampered cart can't
  change what anything costs.
- It only accepts Stripe price ids and quantities from 1 to 20.
- It doesn't check stock. If a piece sells out between adding it to a cart and
  paying, the order still goes through.
