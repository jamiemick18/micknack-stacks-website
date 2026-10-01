// ============================================================================
// VARIATIONS — the drop-downs a buyer picks from, like Etsy's options.
// ============================================================================
//
// The Etsy sync NEVER touches this file. Etsy's own variations can't be read
// with our API key (that needs a full login), so pieces synced from Etsy get
// their options here instead.
//
// The key is the piece's id: the Etsy listing number, or the id you gave a
// piece added through the listing builder.
//
// Every option on a piece must be chosen before it can be added to the cart,
// and the choice travels with the order so you know what to pack.
//
// All options of a piece share one price. If a choice should cost more, it
// needs its own listing for now.
//
// Example:
//
//   "4584458361": [
//     { name: "Post length", options: ["6mm", "8mm"] },
//     { name: "Sold as", options: ["Single", "Pair"] }
//   ],

window.MICKNACK_VARIATIONS = {
  // "4584458361": [{ name: "Post length", options: ["6mm", "8mm"] }],
};
