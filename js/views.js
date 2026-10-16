// How many people have looked at these pieces, here and on Etsy.
//
// The worker holds two numbers: visits counted here, and Etsy's own count,
// which the sync pushes across on every run. This asks for the pair and shows
// the sum, so the line is true to both places rather than pretending the shop
// began the day the site went up.
//
// Counted once per browser session, not once per page: wandering through six
// pieces is one person looking, and counting each page would flatter the
// number and burn through the worker's free writes.

(function () {
  const ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/views";
  const SESSION_KEY = "micknack-counted";

  const slot = document.getElementById("view-count");

  function alreadyCounted() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (err) {
      // Private windows and blocked storage: count it, rather than lose it.
      return false;
    }
  }

  function remember() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (err) {
      /* nothing to do: the visit still counted on the worker */
    }
  }

  function show(total) {
    if (!slot || typeof total !== "number" || total <= 0) return;
    slot.textContent = total.toLocaleString();
    const line = slot.closest("[data-view-line]");
    if (line) line.hidden = false;
  }

  const counting = !alreadyCounted();

  fetch(ENDPOINT, { method: counting ? "POST" : "GET", cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return;
      if (counting) remember();
      show(data.total);
    })
    .catch(() => {
      // The counter is decoration. If the worker is unreachable the line simply
      // stays hidden; nothing else on the page depends on it.
    });
})();
