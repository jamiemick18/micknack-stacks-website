// ============================================================================
// EXTRA PRODUCTS - pieces shown on this site that are NOT listed on Etsy.
// ============================================================================
//
// The Etsy sync NEVER touches this file, so anything you add here is safe.
// Items listed here appear first in The Collection, above the Etsy pieces.
//
// HOW TO ADD AN ITEM
//   1. Upload the photo to the assets/products folder on GitHub.
//   2. Copy the example block below, paste it inside the [ ] brackets,
//      and fill in your details.
//   3. Commit. The site updates itself in about a minute.
//
// FIELDS
//   id           Required. Any short nickname, no spaces. Must be unique.
//   title        Required. The product name shown on the card.
//   price        Optional. Just the number, no dollar sign. Leave out to hide.
//   description  Optional. First ~110 characters show on the card.
//   images       Optional. "assets/products/your-photo.jpg" or a web link.
//   url          Optional. Where the button goes (a Stripe checkout link,
//                an Instagram post, anything). Leave as "" for no button.
//   button_label Optional. Button wording. Defaults to "Buy Now".
//   badge        Optional. Small label on the photo, e.g. "Only here".
//
// EXAMPLE - delete the /* */ around it to use it:
/*
  {
    id: "sample-earring",
    title: "Sample Earring | Gold Flatback",
    price: "15.99",
    description: "A short description. The first line or so shows on the card.",
    images: ["assets/products/sample-earring.jpg"],
    url: "",
    button_label: "Buy Now",
    badge: "Only here",
  },
*/

window.MICKNACK_EXTRA_PRODUCTS = [
  // Add your items here, between the brackets.
];
