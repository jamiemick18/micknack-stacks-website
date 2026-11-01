// ============================================================================
// STONES — the gemstones and finishes you can make a custom piece from.
// ============================================================================
//
// This is the shelf someone browses when they click "Custom pieces are
// welcome". They cannot ask for what they do not know you have.
//
// Written by the Micknack Stacks HUB (the Stones page). Hand edits here are
// fine but will be overwritten the next time it saves.
//
// FIELDS
//   id         short nickname, no spaces. Never change it once it is in use.
//   name       what a customer reads, e.g. "Baby Pink CZ".
//   swatch     a colour, used only until there is a photo. "#f4b8c8".
//   image      "assets/stones/baby-pink.jpg". A real photo always wins.
//   note       one short line. Size, cut, where it suits. Optional.
//   available  false takes it off the shelf without deleting it.
//
// The twelve below are not a guess: every one of them is named in a listing
// of yours. Correct them, add the ones you stock that never made it into a
// title, and photograph them when you can — a swatch is a placeholder, not a
// gemstone.

window.MICKNACK_STONES = [
  { id: "clear-cz", name: "Crystal Clear CZ", swatch: "#eef1f4", image: "", note: "", available: true },
  { id: "baby-pink-cz", name: "Baby Pink CZ", swatch: "#f6c3d0", image: "", note: "", available: true },
  { id: "hot-pink-cz", name: "Hot Pink CZ", swatch: "#e0558c", image: "", note: "", available: true },
  { id: "lavender-cz", name: "Lavender CZ", swatch: "#c9b6e4", image: "", note: "", available: true },
  { id: "lilac-cz", name: "Lilac CZ", swatch: "#d7c3ec", image: "", note: "", available: true },
  { id: "amethyst-cz", name: "Amethyst CZ", swatch: "#8f5fb5", image: "", note: "", available: true },
  { id: "purple-cz", name: "Purple CZ", swatch: "#6f4bA8", image: "", note: "", available: true },
  { id: "ruby-cz", name: "Ruby CZ", swatch: "#9b1b30", image: "", note: "", available: true },
  { id: "red-cz", name: "Red CZ", swatch: "#c62828", image: "", note: "", available: true },
  { id: "champagne-cz", name: "Champagne CZ", swatch: "#d9c3a0", image: "", note: "", available: true },
  { id: "green-cz", name: "Green CZ", swatch: "#3f8f6b", image: "", note: "", available: true },
  { id: "blue-cz", name: "Blue CZ", swatch: "#3f6fa8", image: "", note: "", available: true },
  { id: "black-cz", name: "Black CZ", swatch: "#2a2a2e", image: "", note: "", available: true },
];
