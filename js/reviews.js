// Kind words from Etsy, shown on the shop's own pages.
//
// Only the five star ones are quoted, the way any shop picks the testimonials
// it puts on the wall. There is deliberately no link out to Etsy here:
// someone reading kind words about a piece is close to buying it, and that is
// not the moment to hand them the door to another shopfront.
//
// Etsy gives no buyer name, so a quote is attributed to a verified Etsy buyer
// and the piece it was left on. Buyers' own photos are not republished.

(function () {
  const host = document.getElementById("reviews");
  if (!host) return;

  const data = window.MICKNACK_REVIEWS || {};
  const all = Array.isArray(data.reviews) ? data.reviews : [];
  const best = all.filter((review) => review.rating === 5 && review.text);

  // Nothing worth showing yet: leave the section out rather than show an
  // empty shelf with a heading over it.
  if (best.length < 1) return;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function when(date) {
    if (!date) return "";
    const parsed = new Date(date + "T12:00:00Z");
    if (isNaN(parsed)) return "";
    return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  const stars = '<span class="stars" aria-label="Five stars">★★★★★</span>';

  host.innerHTML = `
    <h2 class="section-heading">Kind words</h2>
    <div class="review-row">
      ${best
        .slice(0, 3)
        .map(
          (review) => `
        <figure class="review">
          ${stars}
          <blockquote>${escapeHtml(review.text)}</blockquote>
          <figcaption>
            Verified Etsy buyer${review.piece ? ` &middot; ${escapeHtml(review.piece)}` : ""}
            ${when(review.date) ? `<span class="review-when">${when(review.date)}</span>` : ""}
          </figcaption>
        </figure>`
        )
        .join("")}
    </div>
  `;

  host.hidden = false;
})();
