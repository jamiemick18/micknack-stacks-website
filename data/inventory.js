// ============================================================================
// INVENTORY — what's sold out or hidden on the site.
// ============================================================================
//
// Written by the shop desk (npm run shop). Hand edits here are fine but will
// be overwritten the next time it saves.
//
// The Etsy sync NEVER touches this file.
//
// Stock counts are NOT here, on purpose. They live in data/stock-counts.json,
// which is private and never published. This file carries only what the
// public site needs:
//
//   sold_out: true   Shows a Sold Out label. No Buy button.
//   hidden: true     Not shown on the site at all.
//
// A piece with no entry is treated as in stock.

window.MICKNACK_INVENTORY = {
  // SLIMED Apple Green CZ Ear Chain: hidden from the site 22 October 2026.
  "4579741852": { hidden: true },
  // Summit Ride Huggie Earrings: retired, left Etsy 2 October 2026 and no longer sold here either.
  "4573433368": { hidden: true },
};
