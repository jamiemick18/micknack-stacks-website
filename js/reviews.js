// Kind words from Etsy, shown on the shop's own pages.
//
// Only the five star ones are quoted, which is the shop owner's choice and
// what every shop does with testimonials. The link to the full set on Etsy
// sits underneath, so nobody is being told these are all the reviews there
// are: anyone who wants the whole picture is one click from it.
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
    ${
      data.shop_reviews_url
        ? `<p class="review-all">
             <a href="${data.shop_reviews_url}" target="_blank" rel="noopener">
               Read all ${data.count || best.length} reviews on Etsy
             </a>
           </p>`
        : ""
    }
  `;

  host.hidden = false;
})();
