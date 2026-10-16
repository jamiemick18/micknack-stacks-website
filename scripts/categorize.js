// ============================================================================
// Which shelf a piece belongs on.
// ============================================================================
//
// The shop is really two shops of roughly equal size, chains and studs, with a
// couple of hoops, so the site offers those as filters. Nothing on Etsy says
// which is which, so it is read from the title.
//
// The name before the first "|" is what the piece actually is; everything
// after it lists materials and options. An ear chain whose post can be bought
// as a flatback says "Flatback" in that tail, so reading the whole title files
// chains under studs. The name is tried first, and the tail only as a fallback
// for a piece whose name alone says nothing, like "SLIMED".
//
// Etsy shop sections win when they exist: if those are ever set up, that
// becomes the single place to manage this and the guesswork stops.
//
// For the handful a title cannot settle, data/category-overrides.json holds
// {"<listing id>": "chains"} and wins over everything.

export const CATEGORIES = [
  { id: "chains", label: "Ear Chains" },
  { id: "studs", label: "Flatback Studs" },
  { id: "hoops", label: "Hoops" },
];

const RULES = [
  { id: "hoops", test: /clicker|huggie|\bhoops?\b/i },
  { id: "studs", test: /flatback|threadless|\bstuds?\b/i },
  { id: "chains", test: /chain|connector|dangle|drape/i },
];

// Etsy section titles, mapped onto our own three where they obviously match.
function fromSection(sectionTitle) {
  if (!sectionTitle) return null;
  const name = String(sectionTitle).toLowerCase();
  if (/hoop|huggie|clicker/.test(name)) return "hoops";
  if (/stud|flatback|threadless/.test(name)) return "studs";
  if (/chain|connector|drape/.test(name)) return "chains";
  return null;
}

export function categoryOf(piece, { overrides = {}, sectionTitle = "" } = {}) {
  const id = String(piece.listing_id || piece.id || "");
  if (overrides[id]) return overrides[id];

  const fromEtsy = fromSection(sectionTitle);
  if (fromEtsy) return fromEtsy;

  const title = piece.title || "";
  const name = title.split("|")[0];

  for (const rule of RULES) {
    if (rule.test.test(name)) return rule.id;
  }
  for (const rule of RULES) {
    if (rule.test.test(title)) return rule.id;
  }
  return "chains"; // the larger half, and the safer place for an oddity
}
