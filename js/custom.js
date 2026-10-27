// "Custom pieces are welcome" — the band under the header, and the form it
// opens.
//
// Jamie has always made custom work; it was just buried near the bottom of
// the About page where nobody reads it. The band says so on every page.
//
// What someone writes is sent to the checkout worker, which stores it and
// then tries to email it on. Stored first, emailed second, on purpose: email
// is the part that can quietly fail, and a request that lived only in an
// email that never arrived is a customer who thinks they were ignored.

(function () {
  var ENDPOINT = "https://micknack-checkout.jamie-mick18.workers.dev/custom";
  var open = document.getElementById("custom-open");
  if (!open) return;

  var dialog = document.createElement("dialog");
  dialog.className = "custom-dialog";
  dialog.innerHTML =
    '<button type="button" class="custom-close" data-close aria-label="Close">&times;</button>' +
    '<div class="custom-inner">' +
    "<h2>Tell me what you are imagining</h2>" +
    '<p class="custom-lede">A different length, a finish I do not list, a charm that means ' +
    "something to you, or an idea you have been carrying around for a while. I would rather " +
    "make the piece you actually want than sell you the nearest thing to it.</p>" +
    '<form class="custom-form" id="custom-form">' +
    '<div class="custom-two">' +
    '<label><span>Your name</span><input type="text" name="name" maxlength="80" placeholder="First name is plenty" /></label>' +
    '<label><span>Email</span><input type="email" name="email" maxlength="160" required placeholder="you@example.com" /></label>' +
    "</div>" +
    '<label><span>What are you after?</span><textarea name="idea" maxlength="2000" required ' +
    'placeholder="Describe it however it comes out. Photos or links can follow by email."></textarea></label>' +
    '<div class="custom-two">' +
    '<label><span>Rough budget <em>optional</em></span><input type="text" name="budget" maxlength="60" placeholder="$40ish" /></label>' +
    '<label><span>Needed by <em>optional</em></span><input type="text" name="when" maxlength="60" placeholder="No rush" /></label>' +
    "</div>" +
    '<label class="review-trap" aria-hidden="true">Leave this empty' +
    '<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>' +
    '<div class="custom-actions">' +
    '<button type="submit" class="btn btn-primary">Send it to Jamie</button>' +
    '<p class="custom-status" id="custom-status" role="status"></p>' +
    "</div>" +
    "</form>" +
    "</div>";
  document.body.appendChild(dialog);

  var form = dialog.querySelector("#custom-form");
  var status = dialog.querySelector("#custom-status");

  function show() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    var first = form.querySelector("textarea");
    if (first) setTimeout(function () { first.focus(); }, 60);
  }

  open.addEventListener("click", function (event) {
    event.preventDefault();
    show();
  });

  dialog.querySelectorAll("[data-close]").forEach(function (button) {
    button.addEventListener("click", function () { dialog.close(); });
  });

  // The dialog element is its own backdrop, so a click landing on it rather
  // than on the card means outside.
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var button = form.querySelector("button[type=submit]");
    var fields = new FormData(form);
    button.disabled = true;
    status.textContent = "Sending…";
    status.className = "custom-status";

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fields.get("name"),
        email: fields.get("email"),
        idea: fields.get("idea"),
        budget: fields.get("budget"),
        when: fields.get("when"),
        website: fields.get("website"),
      }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "That did not send.");
          return body;
        });
      })
      .then(function (body) {
        form.reset();
        status.textContent = body.message || "Thank you.";
        status.className = "custom-status good";
        setTimeout(function () { dialog.close(); status.textContent = ""; }, 2600);
      })
      .catch(function (err) {
        status.textContent = err.message;
        status.className = "custom-status bad";
      })
      .then(function () {
        button.disabled = false;
      });
  });
})();
