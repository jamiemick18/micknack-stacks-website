// ---------------------------------------------------------------------------
// The offer the shop ANNOUNCES, if it announces one.
// ---------------------------------------------------------------------------
//
// Nothing here switches a code on or off. The codes themselves live on Stripe
// and work whether or not this file mentions them — so WUAN1 still takes its
// 5% off for anyone Jamie hands it to, it is simply not shown to every passer
// by. That is the difference between a sale and a thank-you.
//
// An empty `code` means the shop says nothing at all: no bar above the header,
// no line in the cart. The box to type a code into is still on the payment
// page, which is where a code someone was given gets used.
//
// To announce an offer: make the promotion code on Stripe first, then fill
// these in. `ends` is when the shop stops mentioning it — it takes itself
// down, so a dead code never sits on the page promising money off.
window.MICKNACK_PROMO = {
  code: "",
  percent: 0,
  starts: "",
  ends: "",
  // Shown on the bar. Short — it has to fit on a phone.
  note: "",
};
