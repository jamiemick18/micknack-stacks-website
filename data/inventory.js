// ============================================================================
// INVENTORY — how many of each piece you have, and what's hidden.
// ============================================================================
//
// The Etsy sync NEVER touches this file. Anything you set here sticks.
//
// Change these from the dashboard instead of editing by hand:
//   https://micknackstacks.com/manage.html
//
// Shoppers never see these numbers. The site only uses them to decide whether
// a piece can be bought:
//
//   qty: 3            In stock. Buy button works.
//   qty: 0            Shows a Sold Out label. No Buy button.
//   hidden: true      Not shown on the site at all, whatever the quantity.
//
// A piece with no entry here is treated as in stock, so nothing disappears
// just because you haven't counted it yet.
//
// The key is the piece's id: the Etsy listing number, or the id you gave a
// piece added through the listing builder.

window.MICKNACK_INVENTORY = {
  // "4566134771": { qty: 3 },
  // "rose-studs": { qty: 0 },
  // "old-sample": { qty: 2, hidden: true },
};
