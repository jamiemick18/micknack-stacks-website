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

  async loadLive(endpoint) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data || typeof data.stock !== "object") return false;
      this.live = data.stock;
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

    // A live count answers the only question the shop asks: can this be bought?
    if (this.live && typeof this.live[key] === "number") {
      const qty = this.live[key];
      const hidden = Boolean(raw && typeof raw === "object" && raw.hidden) || raw === "hidden";
      return { qty, hidden, soldOut: qty <= 0, tracked: true };
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
