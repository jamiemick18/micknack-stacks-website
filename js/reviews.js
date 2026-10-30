// Kind words, from Etsy and from people who bought here.
//
// Only the five star Etsy ones are quoted, the way any shop picks the
// testimonials it puts on the wall. There is deliberately no link out to
// Etsy here: someone reading kind words about a piece is close to buying it,
// and that is not the moment to hand them the door to another shopfront.
//
// Etsy gives no buyer name, so a quote from there is attributed to a verified
// Etsy buyer and the piece it was left on. Buyers' own photos are not
// republished.
//
// Reviews written on this site come from the checkout worker and only ever
// arrive approved — Jamie reads each one first. They are attributed to the
// name the writer gave and are NOT labelled verified, because nothing here
// checks that the writer bought anything. Saying otherwise would be a lie
// told to make a sale.

(function () {
  const host = document.getElementById("reviews");
  if (!host) return;

  const ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/reviews";

  const data = window.MICKNACK_REVIEWS || {};
  const fromEtsy = (Array.isArray(data.reviews) ? data.reviews : [])
    .filter((review) => review.rating === 5 && review.text)
    .map((review) => ({
      text: review.text,
      piece: review.piece,
      date: review.date,
      who: "Verified Etsy buyer",
    }));

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function when(date) {
    if (!date) return "";
    const parsed = new Date(date + "T12:00:00Z");
    if (isNaN(parsed)) return "";
    return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  const stars = '<span class="stars" aria-label="Five stars">★★★★★</span>';

  function quote(review) {
    return `
      <figure class="review">
        ${stars}
        <blockquote>${escapeHtml(review.text)}</blockquote>
        <figcaption>
          ${escapeHtml(review.who)}${review.piece ? ` &middot; ${escapeHtml(review.piece)}` : ""}
          ${when(review.date) ? `<span class="review-when">${when(review.date)}</span>` : ""}
        </figcaption>
      </figure>`;
  }

  // The browser restores its own idea of where the page was once everything
  // has loaded, which undoes an early scroll. Saying "manual" tells it to
  // leave that to us.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // Instantly, not smoothly. The page scrolls smoothly by default, which is
  // right for a link you click but wrong here: this is thirteen thousand
  // pixels of animation that each later attempt cancels halfway, so it ends
  // up going nowhere at all.
  function jumpHere() {
    const go = () => host.scrollIntoView({ block: "start", behavior: "instant" });
    requestAnimationFrame(go);
    setTimeout(go, 400);
    window.addEventListener("load", () => setTimeout(go, 100), { once: true });
  }

  function render(all) {
    // Nothing worth showing yet: leave the quotes out rather than show an
    // empty shelf with a heading over it. The form still goes up, because a
    // shop with no reviews is exactly the one that needs them.
    const best = all.filter((review) => review.text);
    host.innerHTML = `
      <h2 class="section-heading">Kind words</h2>
      ${best.length ? `<div class="review-row">${best.slice(0, 6).map(quote).join("")}</div>` : ""}
      <div class="review-invite">
        <p class="review-ask">Bought something? Tell people how it wears.</p>
        <button type="button" class="btn btn-primary review-open" id="review-open">
          <span class="review-open-stars" aria-hidden="true">★★★★★</span>
          Leave a review
        </button>
      </div>
      <form class="review-form" id="review-form" hidden>
        <p class="review-form-note">
          Bought something and want to say so? Jamie reads every review before
          it goes up here.
        </p>

        <fieldset class="review-stars">
          <legend>Your rating</legend>
          ${[1, 2, 3, 4, 5]
            .map(
              (n) => `
            <label title="${n} star${n === 1 ? "" : "s"}">
              <input type="radio" name="rating" value="${n}"${n === 5 ? " checked" : ""} />
              <span>★</span>
            </label>`
            )
            .join("")}
        </fieldset>

        <label class="review-field">
          <span>Your name</span>
          <input type="text" name="name" maxlength="60" placeholder="First name is plenty" />
        </label>

        <label class="review-field">
          <span>Which piece? <em>optional</em></span>
          <input type="text" name="piece" maxlength="160" placeholder="Pink Poppies Ear Chain" />
        </label>

        <label class="review-field">
          <span>Your review</span>
          <textarea name="text" maxlength="1200" required rows="5"
            placeholder="How does it wear? Would you buy another?"></textarea>
        </label>

        <label class="review-field">
          <span>Email <em>never shown, only so Jamie can reply</em></span>
          <input type="email" name="email" maxlength="160" placeholder="you@example.com" />
        </label>

        <!-- Not for people. Anything that fills this in has told on itself. -->
        <label class="review-trap" aria-hidden="true">
          Leave this empty
          <input type="text" name="website" tabindex="-1" autocomplete="off" />
        </label>

        <div class="review-actions">
          <button type="submit" class="btn btn-primary">Send it</button>
          <p class="review-status" id="review-status" role="status"></p>
        </div>
      </form>
    `;

    host.hidden = false;
    wireForm();

    // Someone arriving from the Social menu asked for this section by name,
    // but it was still hidden when the browser went looking for it, so the
    // jump landed nowhere. Now that it is on the page, take them to it.
    //
    // Twice, a moment apart: the grid above is still growing as its photos
    // arrive, and a page that grows under you leaves you short of where you
    // asked to be. The second go lands it.
    if (location.hash === "#reviews") jumpHere();
  }

  function wireForm() {
    const form = document.getElementById("review-form");
    const open = document.getElementById("review-open");
    const status = document.getElementById("review-status");
    if (!form || !open) return;

    // Fill in every star up to the one chosen, the way a rating is read
    // everywhere else. CSS alone cannot look backwards along the row.
    const stars = Array.from(form.querySelectorAll(".review-stars label"));
    function paintStars() {
      const chosen = Number((form.querySelector("input[name=rating]:checked") || {}).value || 0);
      stars.forEach((label, index) => label.classList.toggle("on", index < chosen));
    }
    form.addEventListener("change", (event) => {
      if (event.target.name === "rating") paintStars();
    });
    paintStars();

    open.addEventListener("click", () => {
      form.hidden = !form.hidden;
      open.textContent = form.hidden ? "Leave a review" : "Never mind";
      if (!form.hidden) form.querySelector("textarea").focus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      const fields = new FormData(form);
      button.disabled = true;
      status.textContent = "Sending…";
      status.className = "review-status";

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating: fields.get("rating"),
            name: fields.get("name"),
            piece: fields.get("piece"),
            text: fields.get("text"),
            email: fields.get("email"),
            website: fields.get("website"),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "That did not send.");
        form.hidden = true;
        open.hidden = true;
        status.hidden = false;
        status.textContent = body.message || "Thank you.";
        status.className = "review-status good";
        // The status lives outside the form now, so it survives it closing.
        form.parentNode.insertBefore(status, form);
      } catch (err) {
        status.textContent = err.message;
        status.className = "review-status bad";
      } finally {
        button.disabled = false;
      }
    });
  }

  // Draw what we already have straight away, then fold in anything written
  // here once the worker answers. A slow or sleeping worker costs the page
  // nothing: the Etsy quotes and the form are there either way.
  render(fromEtsy);

  fetch(ENDPOINT)
    .then((res) => (res.ok ? res.json() : { reviews: [] }))
    .then((body) => {
      const mine = (body.reviews || []).map((review) => ({
        text: review.text,
        piece: review.piece,
        date: review.date,
        who: review.name || "A customer",
      }));
      if (!mine.length) return;
      // Newest first, whoever wrote them.
      const all = fromEtsy.concat(mine).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      render(all);
    })
    .catch(() => {
      /* the worker is not reachable; the page is fine as it stands */
    });
})();
