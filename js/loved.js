// "What people are loving" — the rail down the right of the collection.
//
// Three things, in order of usefulness to a shopper:
//
//   Kind words       one real Etsy review at a time, changing every few
//                    seconds. A shopper deciding whether to trust a small
//                    shop wants to hear from someone who already did, and
//                    the full Kind words section is far down the page.
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

  const inventory = window.MICKNACK_INVENTORY || {};
  const visible = (id) => !(inventory[id] && inventory[id].hidden);

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : value;
    return div.innerHTML;
  }

  const name = (title) => String(title || "").split("|")[0].trim();

  const count = (n) => n + (n === 1 ? " favorite" : " favorites");

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

  // ---- kind words ----
  //
  // One review at a time. A wall of them beside the grid competes with the
  // pieces; one, changing, reads like someone leaning over and saying it.
  //
  // Four seconds is long enough to read a short quote and not so long that a
  // shopper scrolling past never sees a second one. The box is sized to the
  // longest quote up front so the rail does not jump every time it turns
  // over, and the whole thing holds still while it is hovered or focused,
  // because a quote that moves while you are reading it is worse than none.
  const SHOW_MS = 4000;

  // Five stars only, and nothing so long it needs its own paragraph: this is
  // a glance, not the Kind words section.
  const quotes = ((window.MICKNACK_REVIEWS || {}).reviews || [])
    .filter((r) => Number(r.rating) === 5 && r.text && r.text.trim().length <= 200)
    .map((r) => r.text.trim());

  function reviewBlock() {
    if (quotes.length < 2) {
      // One quote cannot rotate, and none is nothing to say. A single review
      // still deserves showing; it just sits still.
      return quotes.length
        ? `<div class="loved-block kind-spot">
             <h3>Kind words</h3>
             <blockquote class="kind-quote is-on">${escapeHtml(quotes[0])}</blockquote>
           </div>`
        : "";
    }
    return `
      <div class="loved-block kind-spot" id="kind-spot">
        <h3>Kind words</h3>
        <div class="kind-stage">
          ${quotes
            .map(
              (text, i) =>
                `<blockquote class="kind-quote${i === 0 ? " is-on" : ""}">${escapeHtml(text)}</blockquote>`
            )
            .join("")}
        </div>
        <a class="kind-more" href="review.html">Read them all</a>
      </div>`;
  }

  // Every quote is in the DOM at once, stacked, with only one visible. That
  // is what lets the box be as tall as the longest one from the start, and it
  // means turning over is a class change rather than a re-render.
  function startRotating() {
    const spot = document.getElementById("kind-spot");
    if (!spot) return;
    const slides = [...spot.querySelectorAll(".kind-quote")];
    if (slides.length < 2) return;

    let at = 0;
    let held = false;
    spot.addEventListener("mouseenter", () => { held = true; });
    spot.addEventListener("mouseleave", () => { held = false; });
    spot.addEventListener("focusin", () => { held = true; });
    spot.addEventListener("focusout", () => { held = false; });

    setInterval(() => {
      // Someone reading it, or a tab in the background where the animation
      // would just pile up unseen.
      if (held || document.hidden) return;
      slides[at].classList.remove("is-on");
      at = (at + 1) % slides.length;
      slides[at].classList.add("is-on");
    }, SHOW_MS);
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
      // Not a time. The feed records when the hourly sync NOTICED a new
      // favorite, which is not when someone clicked — and when a sync is
      // late or fails, a week of them arrive stamped with the same minute.
      // Saying "today" about that was simply untrue, so the row shows what
      // is actually known: how many people have favorited it.
      note: count(listing.num_favorers || event.total || 0),
    });
  }

  // ---- most loved ----
  // Anything already in Recently loved is left out here. A rail that names
  // the same five pieces twice is half a rail.
  const most = listings
    .filter((l) => (l.num_favorers || 0) > 0 && visible(String(l.listing_id)) && !seen.has(String(l.listing_id)))
    .sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0))
    .slice(0, 5)
    .map((l) => ({
      id: String(l.listing_id),
      title: l.title,
      image: (l.images && l.images[0]) || "",
      note: count(l.num_favorers || 0),
    }));

  const kind = reviewBlock();
  if (!kind && !recent.length && !most.length) return;

  host.innerHTML = `
    ${kind}
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
  startRotating();
})();
