// ============================================================================
// INVENTORY — what's sold out or hidden on the site.
// ============================================================================
//
// The Etsy sync NEVER touches this file.
//
// Your stock counts are NOT here. They live in your private dashboard, which
// only you can open. This file carries only what the public site needs:
//
//   sold_out: true   Shows a Sold Out label. No Buy button.
//   hidden: true     Not shown on the site at all.
//
// A piece with no entry is treated as in stock.
//
// To change it: open the dashboard, set your counts, then either copy what it
// generates over this file, or tell Claude "update my stock."

window.MICKNACK_INVENTORY = {
  // "4566134771": { sold_out: true },
  // "rose-studs": { hidden: true },
};
