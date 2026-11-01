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
  { id: "ab-crystal", name: "AB Crystal", swatch: "#dfe8f2", shape: "Round", finish: "ab", size: "4mm", image: "", note: "Shifts rainbow in the light", available: true },
  { id: "amethyst-cz", name: "Amethyst Corundum", swatch: "#8f5fb5", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "baby-pink-cz", name: "Baby Pink CZ", swatch: "#f6c3d0", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "black-cz", name: "Black CZ", swatch: "#2a2a2e", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "blue-cz", name: "Blue CZ", swatch: "#3f6fa8", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "champagne-cz", name: "Champagne CZ", swatch: "#d9c3a0", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "clear-cz", name: "Crystal Clear CZ", swatch: "#eef1f4", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "green-cz", name: "Green CZ", swatch: "#3f8f6b", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "hot-pink-cz", name: "Hot Pink Corundum", swatch: "#e0558c", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "lavender-cz", name: "Lavender CZ", swatch: "#c9b6e4", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "lilac-cz", name: "Lilac CZ", swatch: "#d7c3ec", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "moonstone", name: "Moonstone", swatch: "#5b3fb8", shape: "Round", finish: "opal", size: "4mm", image: "", note: "Deep blue to violet flash", available: true },
  { id: "purple-cz", name: "Purple CZ", swatch: "#6f4bA8", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "red-cz", name: "Red CZ", swatch: "#c62828", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
  { id: "ruby-cz", name: "Ruby CZ", swatch: "#9b1b30", shape: "Round", finish: "", size: "4mm", image: "", note: "", available: true },
];

// The chains you can build a custom piece on. Managed from the HUB's Stones
// page. "mm" is the width, and it is what the mock-up draws.
window.MICKNACK_CHAINS = [
  { id: "cable-1-5mm", name: "1.5mm cable chain", mm: "1.5", available: true },
  { id: "cable-2mm", name: "2mm cable chain", mm: "2", available: true },
  { id: "zz-temp-chain", name: "ZZ Temp Chain", mm: "3", available: true },
];


// What a custom piece starts at, shown on the card at the front of the shop.
// Changed from the HUB's Stones page.
window.MICKNACK_CUSTOM = { from: "30.00" };
