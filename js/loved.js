// "What people are loving" — the rail down the right of the collection.
//
// Two things, in order of usefulness to a shopper:
//
//   Recently loved   pieces that gained favourites on Etsy since the last
//                    sync, newest first. Etsy publishes no event and no
//                    names, so this is assembled by comparing hourly counts.
//                    It says "today" or "2 days ago", never a fake minute,
//                    because claiming to know the minute would be a lie.
//
//   Most loved       the running favourite counts, which need no history and
//                    work from the first day.
//
// Desktop only. On a phone it is hidden by CSS: a column of other people's
// opinions alongside a narrow grid pushes the pieces themselves off-screen.
//
// Nothing here is invented. If there is no history yet, the recent section
// simply does not appear.

(function () {
  const host = document.getElementById("loved");
  if (!host) return;

  const products = window.MICKNACK_PRODUCTS || {};
  const feed = (window.MICKNACK_FAVORITES || {}).events || [];
  const listings = (products.listings || []).filter((l) => l.etsy_active !== false);
  if (!listings.length) return;

  const inventory = window.MICKNACK_INVENTORY || {};
  const visible = (id) => !(inventory[id] && inventory[id].hidden);

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : value;
    return div.innerHTML;
  }

  const name = (title) => String(title || "").split("|")[0].trim();

  function when(at) {
    const then = Date.parse(at);
    if (isNaN(then)) return "";
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "a week ago" : weeks + " weeks ago";
  }

  function row(piece) {
    return `
      <a class="loved-row" href="product.html?id=${encodeURIComponent(piece.id)}">
        <img src="${escapeHtml(piece.image)}" alt="" loading="lazy" />
        <span class="loved-text">
          <span class="loved-name">${escapeHtml(name(piece.title))}</span>
          <span class="loved-when">${escapeHtml(piece.note)}</span>
        </span>
      </a>`;
  }

  // ---- recently loved ----
  const recent = [];
  const seen = new Set();
  for (let i = feed.length - 1; i >= 0 && recent.length < 5; i--) {
    const event = feed[i];
    if (seen.has(event.id) || !visible(event.id)) continue;
    const listing = listings.find((l) => String(l.listing_id) === event.id);
    if (!listing) continue;
    seen.add(event.id);
    recent.push({
      id: event.id,
      title: event.title || listing.title,
      image: event.image || (listing.images && listing.images[0]) || "",
      note: when(event.at),
    });
  }

  // ---- most loved ----
  const most = listings
    .filter((l) => (l.num_favorers || 0) > 0 && visible(String(l.listing_id)))
    .sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0))
    .slice(0, 5)
    .map((l) => ({
      id: String(l.listing_id),
      title: l.title,
      image: (l.images && l.images[0]) || "",
      note: l.num_favorers + (l.num_favorers === 1 ? " favorite" : " favorites"),
    }));

  if (!recent.length && !most.length) return;

  host.innerHTML = `
    ${
      recent.length
        ? `<div class="loved-block">
             <h3>Recently loved</h3>
             ${recent.map(row).join("")}
           </div>`
        : ""
    }
    ${
      most.length
        ? `<div class="loved-block">
             <h3>Most loved</h3>
             ${most.map(row).join("")}
           </div>`
        : ""
    }
  `;
  host.classList.add("on");
})();
