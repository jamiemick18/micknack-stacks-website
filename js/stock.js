// How the site reads data/inventory.js. Shared by the collection grid, the
// product page and the dashboard so they can never disagree.
//
// Quantities are yours alone: the public pages use them only to decide whether
// a piece can be bought, and never print the number.

window.MICKNACK_STOCK = {
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

    const qty = typeof raw.qty === "number" ? raw.qty : null;
    return {
      qty,
      hidden: Boolean(raw.hidden),
      soldOut: qty !== null && qty <= 0,
      tracked: qty !== null,
    };
  },
};
