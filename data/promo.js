// ---------------------------------------------------------------------------
// The offer that is running, if one is.
// ---------------------------------------------------------------------------
//
// Etsy keeps its own copy of this; the code itself lives on Stripe as a
// promotion code. This file is only what the SHOP SAYS about it, so the bar at
// the top of the page and the note in the cart agree with each other and with
// the till.
//
// To end an offer early, set `code` to "". To run a new one: make the matching
// promotion code on Stripe first, then change these four lines. `ends` is when
// it stops — the bar takes itself down on its own, so a dead code never sits
// on the page promising a discount that no longer works.
window.MICKNACK_PROMO = {
  code: "WUAN1",
  percent: 5,
  starts: "2026-11-08T17:00:00-07:00",
  ends: "2027-01-01T00:00:00-07:00",
  // Shown on the bar. Short — it has to fit on a phone.
  note: "Holiday treat",
};
