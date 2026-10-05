// The "Join the Menace List" email signup, shared by every page.
//
// Any element with data-newsletter gets the form. The form posts to the URL in
// data/newsletter.js. Email services don't allow cross-site reads, so the
// response is opaque: we show the thank-you once the request has gone out.

(function () {
  const config = window.MICKNACK_NEWSLETTER || {};
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  if (!config.action && !local) return;

  document.querySelectorAll("[data-newsletter]").forEach((host) => {
    host.className = "newsletter";
    host.innerHTML = `
      <h2>Join the Menace List <span aria-hidden="true">✨</span></h2>
      <p class="newsletter-pitch">New drops, tiny ear necklaces, occasional chaos.</p>
      <form class="newsletter-form" novalidate>
        <input type="email" name="${config.emailField || "email"}" placeholder="your@email.com" aria-label="Email address" autocomplete="email" required />
        <button type="submit" class="btn btn-primary">Let me in</button>
      </form>
      <p class="newsletter-fine">New releases, restocks &amp; the occasional subscriber-only code. Unsubscribe anytime.</p>
      <p class="newsletter-msg" role="status" hidden></p>`;

    const form = host.querySelector("form");
    const input = form.querySelector("input");
    const message = host.querySelector(".newsletter-msg");

    const show = (text, isError) => {
      message.textContent = text;
      message.classList.toggle("is-error", Boolean(isError));
      message.hidden = false;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        show("Please enter a valid email address.", true);
        return;
      }
      if (!config.action) {
        show("Signup isn't connected yet. Add the form URL in data/newsletter.js.", true);
        return;
      }
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await fetch(config.action, {
          method: "POST",
          mode: "no-cors",
          body: new FormData(form),
        });
        form.hidden = true;
        host.querySelector(".newsletter-fine").hidden = true;
        show("You're on the list. Check your inbox to confirm.");
      } catch (err) {
        button.disabled = false;
        show("Something went wrong. Please try again in a moment.", true);
      }
    });
  });
})();
