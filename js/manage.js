// The inventory dashboard. Lists every piece on the site, lets you set how
// many you have, and writes out a replacement data/inventory.js.
//
// The site is static, so this page can't save to GitHub by itself. Edits are
// kept in this browser until you paste the generated file in.

document.getElementById("year").textContent = new Date().getFullYear();

const rowsEl = document.getElementById("rows");
const summaryEl = document.getElementById("summary");
const outputEl = document.getElementById("output");
const searchEl = document.getElementById("search");
const unsavedEl = document.getElementById("unsaved");
const untrackedBtn = document.getElementById("untracked-only");

const DRAFT_KEY = "micknack-inventory-draft";

const published = window.MICKNACK_INVENTORY || {};
const stripeLinks = (window.MICKNACK_STRIPE_LINKS || {}).links || {};

let state = {};
let untrackedOnly = false;

function loadDraft() {
  // Start from what's published, then lay any unsaved edits on top.
  state = JSON.parse(JSON.stringify(published));
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (err) {
    /* an unreadable draft just means starting from the published file */
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch (err) {
    /* blocked storage still leaves the generated file to copy */
  }
}

function entryFor(id) {
  const raw = state[id];
  if (raw === undefined || raw === null) return { qty: null, hidden: false };
  if (typeof raw === "number") return { qty: raw, hidden: false };
  if (typeof raw === "string") return { qty: null, hidden: raw === "hidden" };
  return {
    qty: typeof raw.qty === "number" ? raw.qty : null,
    hidden: Boolean(raw.hidden),
  };
}

function setEntry(id, patch) {
  const next = { ...entryFor(id), ...patch };
  if (next.qty === null && !next.hidden) {
    delete state[id]; // back to untracked: no entry needed
  } else {
    const entry = {};
    if (next.qty !== null) entry.qty = next.qty;
    if (next.hidden) entry.hidden = true;
    state[id] = entry;
  }
  saveDraft();
  render();
}

// Every piece on the site, hand-added ones first, same as the shop grid.
function allPieces() {
  const extras = Array.isArray(window.MICKNACK_EXTRA_PRODUCTS)
    ? window.MICKNACK_EXTRA_PRODUCTS
    : [];
  const listings = (window.MICKNACK_PRODUCTS && window.MICKNACK_PRODUCTS.listings) || [];

  return [
    ...extras.map((item) => ({
      id: String(item.id),
      title: item.title || "(untitled)",
      image: (item.images || [])[0] || "assets/products/placeholder.svg",
      source: "site",
      onEtsy: false,
    })),
    ...listings.map((item) => ({
      id: String(item.listing_id),
      title: item.title || "(untitled)",
      image: (item.images || [])[0] || "assets/products/placeholder.svg",
      source: "etsy",
      // Older synced files have no flag; those pieces were all still on Etsy.
      onEtsy: item.etsy_active !== false,
    })),
  ];
}

function renderSummary(pieces) {
  let inStock = 0;
  let soldOut = 0;
  let hidden = 0;
  let untracked = 0;

  pieces.forEach((piece) => {
    const entry = entryFor(piece.id);
    if (entry.hidden) hidden += 1;
    if (entry.qty === null) untracked += 1;
    else if (entry.qty <= 0) soldOut += 1;
    else inStock += 1;
  });

  const stats = [
    { k: "Pieces", n: pieces.length, cls: "" },
    { k: "In stock", n: inStock, cls: "" },
    { k: "Sold out", n: soldOut, cls: "sold" },
    { k: "Hidden", n: hidden, cls: "hidden-stat" },
    { k: "Not counted", n: untracked, cls: "" },
  ];

  summaryEl.innerHTML = stats
    .map(
      (s) =>
        `<div class="stat ${s.cls}"><div class="n">${s.n}</div><div class="k">${s.k}</div></div>`
    )
    .join("");
}

function renderRows(pieces) {
  const term = searchEl.value.trim().toLowerCase();
  const visible = pieces.filter((piece) => {
    if (term && !piece.title.toLowerCase().includes(term)) return false;
    if (untrackedOnly && entryFor(piece.id).qty !== null) return false;
    return true;
  });

  if (!visible.length) {
    rowsEl.innerHTML = `<p style="color:#6b6b6b;font-size:0.9rem;">No pieces match that.</p>`;
    return;
  }

  rowsEl.innerHTML = "";

  visible.forEach((piece) => {
    const entry = entryFor(piece.id);
    const soldOut = entry.qty !== null && entry.qty <= 0;

    const row = document.createElement("div");
    row.className =
      "row-item" + (entry.hidden ? " is-hidden" : "") + (soldOut ? " is-sold" : "");

    const img = document.createElement("img");
    img.src = piece.image;
    img.alt = "";
    img.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "row-meta";

    const title = document.createElement("div");
    title.className = "t";
    const link = document.createElement("a");
    link.href = `product.html?id=${encodeURIComponent(piece.id)}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = piece.title;
    title.appendChild(link);

    const chips = document.createElement("div");
    chips.className = "chips";
    const addChip = (text, cls) => {
      const chip = document.createElement("span");
      chip.className = "chip " + (cls || "");
      chip.textContent = text;
      chips.appendChild(chip);
    };
    if (piece.source === "site") addChip("Only here");
    else addChip(piece.onEtsy ? "On Etsy" : "Left Etsy", piece.onEtsy ? "on" : "off");
    addChip(stripeLinks[piece.id] ? "Buy button" : "No buy button", stripeLinks[piece.id] ? "on" : "");
    if (soldOut) addChip("Sold out", "off");

    meta.append(title, chips);

    const controls = document.createElement("div");
    controls.className = "controls";

    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qty";
    const qtyLabel = document.createElement("label");
    qtyLabel.textContent = "Qty";
    qtyLabel.htmlFor = `qty-${piece.id}`;
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.id = `qty-${piece.id}`;
    qtyInput.value = entry.qty === null ? "" : String(entry.qty);
    qtyInput.placeholder = "—";
    qtyInput.addEventListener("change", () => {
      const raw = qtyInput.value.trim();
      const qty = raw === "" ? null : Math.max(0, Math.floor(Number(raw) || 0));
      setEntry(piece.id, { qty });
    });
    qtyWrap.append(qtyLabel, qtyInput);

    const hideLabel = document.createElement("label");
    hideLabel.className = "hide-toggle";
    const hideBox = document.createElement("input");
    hideBox.type = "checkbox";
    hideBox.checked = entry.hidden;
    hideBox.addEventListener("change", () => setEntry(piece.id, { hidden: hideBox.checked }));
    hideLabel.append(hideBox, document.createTextNode("Hide"));

    controls.append(qtyWrap, hideLabel);
    row.append(img, meta, controls);
    rowsEl.appendChild(row);
  });
}

function buildFile() {
  const ids = Object.keys(state).sort();
  const body = ids
    .map((id) => {
      const entry = entryFor(id);
      const parts = [];
      if (entry.qty !== null) parts.push(`qty: ${entry.qty}`);
      if (entry.hidden) parts.push("hidden: true");
      return `  ${JSON.stringify(id)}: { ${parts.join(", ")} },`;
    })
    .join("\n");

  return `// ============================================================================
// INVENTORY — how many of each piece you have, and what's hidden.
// ============================================================================
//
// Generated by the dashboard at manage.html. The Etsy sync never touches this
// file. Shoppers never see these numbers: qty 0 shows Sold Out, hidden: true
// takes the piece off the site, and a piece with no entry is treated as in
// stock.

window.MICKNACK_INVENTORY = {
${body}
};
`;
}

function hasUnsavedChanges() {
  return JSON.stringify(state) !== JSON.stringify(published);
}

function render() {
  const pieces = allPieces();
  renderSummary(pieces);
  renderRows(pieces);
  outputEl.textContent = buildFile();
  unsavedEl.hidden = !hasUnsavedChanges();
}

searchEl.addEventListener("input", render);

untrackedBtn.addEventListener("click", () => {
  untrackedOnly = !untrackedOnly;
  untrackedBtn.textContent = untrackedOnly ? "Show all pieces" : "Show uncounted only";
  render();
});

document.getElementById("copy").addEventListener("click", async () => {
  const note = document.getElementById("copied");
  try {
    await navigator.clipboard.writeText(outputEl.textContent);
    note.textContent = "Copied";
  } catch (err) {
    const range = document.createRange();
    range.selectNodeContents(outputEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    note.textContent = "Selected — press Ctrl+C";
  }
  note.hidden = false;
  setTimeout(() => (note.hidden = true), 2600);
});

loadDraft();
render();
