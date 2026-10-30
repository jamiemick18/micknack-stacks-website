// How the site reads data/inventory.js. Shared by the collection grid, the
// product page and the dashboard so they can never disagree.
//
// Quantities are yours alone: the public pages use them only to decide whether
// a piece can be bought, and never print the number.

window.MICKNACK_STOCK = {
  // Live counts from the checkout worker, once they arrive. These win over
  // data/inventory.js, because the worker is what actually sells things: it
  // counts down on every purchase, so it knows before the file does.
  live: null,

  // Pieces hidden from the HUB on a phone. They arrive with the counts and
  // take effect at once, without waiting for anyone to publish a file.
  liveHidden: null,

  async loadLive(endpoint) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data || typeof data.stock !== "object") return false;
      this.live = data.stock;
      if (Array.isArray(data.hidden)) this.liveHidden = new Set(data.hidden);
      return true;
    } catch (err) {
      // The shop still works from the published file if the worker is down.
      return false;
    }
  },

  /**
   * Returns {qty, hidden, soldOut, tracked} for a piece.
   *
   * A piece with no entry is in stock but untracked, so a piece is never
   * hidden or unsellable just because it hasn't been counted yet.
   * Older shorthand entries still work: a bare number is a quantity, and the
   * strings "hidden" and "sold_out" mean what they say.
   */
  of(key) {
    const inventory = window.MICKNACK_INVENTORY || {};
    const raw = inventory[key];

    // The worker is the shop's one source of truth about stock. It is what
    // counts a sale down at checkout, what Jamie's phone writes to, and what
    // the sync corrects when something sells out on Etsy — so when it answers,
    // it wins outright. data/inventory.js below is a mirror of it, used only
    // when the worker cannot be reached.
    //
    // It used to be the other way round for sold-out pieces, because the
    // worker's number went stale when something sold its last one on Etsy.
    // That is fixed at the source now: the sync zeroes those. Two stores that
    // could each override the other is what let a hidden piece quietly come
    // back as merely sold out.
    const hiddenLive = Boolean(this.liveHidden && this.liveHidden.has(key));

    if (this.live && typeof this.live[key] === "number") {
      const qty = this.live[key];
      return { qty, hidden: hiddenLive, soldOut: qty <= 0, tracked: true };
    }

    // The worker knows nothing about this piece, but may still have hidden it.
    if (hiddenLive) {
      const qty = raw && typeof raw === "object" && typeof raw.qty === "number" ? raw.qty : null;
      return { qty, hidden: true, soldOut: qty !== null && qty <= 0, tracked: qty !== null };
    }

    if (raw === undefined || raw === null) {
      return { qty: null, hidden: false, soldOut: false, tracked: false };
    }
    if (typeof raw === "number") {
      return { qty: raw, hidden: false, soldOut: raw <= 0, tracked: true };
    }
    if (typeof raw === "string") {
      return {
        qty: null,
        hidden: raw === "hidden",
        soldOut: raw === "sold_out",
        tracked: false,
      };
    }

    // The public file normally carries only sold_out/hidden flags; the real
    // counts stay in the private dashboard. A qty here still works.
    const qty = typeof raw.qty === "number" ? raw.qty : null;
    return {
      qty,
      hidden: Boolean(raw.hidden),
      soldOut: Boolean(raw.sold_out) || (qty !== null && qty <= 0),
      tracked: qty !== null,
    };
  },
};
