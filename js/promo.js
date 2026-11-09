// ---------------------------------------------------------------------------
// The offer bar.
// ---------------------------------------------------------------------------
//
// A thin line above everything else saying a code is running. It is the first
// thing on the page because a discount nobody notices is a discount nobody
// uses — and because someone who came from the Etsy listing already knows the
// code exists and should not have to wonder whether it works here.
//
// Tapping the code copies it, which is the whole job on a phone: Stripe asks
// for it on the payment page, and nobody wants to retype WUAN1 from memory.
//
// Everything it says comes from data/promo.js. If the offer has finished, or
// has not started, this draws nothing at all.
(function () {
  var promo = window.MICKNACK_PROMO;
  if (!promo || !promo.code) return;

  var now = Date.now();
  var starts = promo.starts ? Date.parse(promo.starts) : NaN;
  var ends = promo.ends ? Date.parse(promo.ends) : NaN;
  if (!isNaN(starts) && now < starts) return;
  if (!isNaN(ends) && now >= ends) return;

  // Closing it is remembered for this visit only. Come back tomorrow and the
  // offer is still running, so it is worth saying again.
  var hiddenKey = "mk-promo-" + promo.code;
  try {
    if (sessionStorage.getItem(hiddenKey) === "closed") return;
  } catch (err) {
    /* private browsing has no sessionStorage; show the bar anyway */
  }

  function start() {
    var bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.innerHTML =
      '<div class="promo-bar-inner">' +
      '<span class="promo-bar-text">' +
      (promo.note ? "<b>" + promo.note + "</b> " : "") +
      promo.percent +
      "% off your order with code" +
      "</span>" +
      '<button type="button" class="promo-code" title="Copy the code">' +
      promo.code +
      "</button>" +
      '<span class="promo-copied" hidden>Copied</span>' +
      '<button type="button" class="promo-close" aria-label="Hide this">&times;</button>' +
      "</div>";

    var code = bar.querySelector(".promo-code");
    var said = bar.querySelector(".promo-copied");
    code.addEventListener("click", function () {
      function done() {
        said.hidden = false;
        setTimeout(function () {
          said.hidden = true;
        }, 2200);
      }
      // navigator.clipboard needs https and is missing on older phones, so
      // there is a plain fallback. Either way the code is also selected, so
      // a long-press copy still works if both fail.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promo.code).then(done, done);
      } else {
        var box = document.createElement("textarea");
        box.value = promo.code;
        box.setAttribute("readonly", "");
        box.style.position = "fixed";
        box.style.opacity = "0";
        document.body.appendChild(box);
        box.select();
        try {
          document.execCommand("copy");
        } catch (err) {
          /* nothing to do; they can still read it */
        }
        document.body.removeChild(box);
        done();
      }
    });

    bar.querySelector(".promo-close").addEventListener("click", function () {
      bar.remove();
      try {
        sessionStorage.setItem(hiddenKey, "closed");
      } catch (err) {
        /* not remembering it is no reason to leave it on screen */
      }
    });

    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
