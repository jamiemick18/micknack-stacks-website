// The "Join the Micknack Stack Society" email signup, shared by every page.
//
// Any element with data-newsletter gets the form. The form posts to the URL in
// data/newsletter.js. Email services don't allow cross-site reads, so the
// response is opaque: we show the thank-you once the request has gone out.

(function () {
  const config = window.MICKNACK_NEWSLETTER || {};

  // Shared with the welcome popup so there is one place that knows how to
  // subscribe someone, and one place to fix if the email service changes.
  // The response is opaque by design (no-cors), so a request going out
  // without throwing is as much confirmation as the browser can give us.
  window.MICKNACK_SUBSCRIBE = async function subscribe(email, fieldName) {
    if (!config.action) throw new Error("not_configured");
    const body = new FormData();
    body.append(fieldName || config.emailField || "email", email);
    await fetch(config.action, { method: "POST", mode: "no-cors", body });
    try {
      // So the popup never interrupts someone who has already signed up.
      localStorage.setItem("micknack-subscribed", "1");
    } catch (err) {
      /* blocked storage only means the popup may ask again */
    }
  };

  window.MICKNACK_EMAIL_OK = (email) => /^[^@s]+@[^@s]+.[^@s]+$/.test(email);
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  if (!config.action && !local) return;

  // A small nav link that jumps down to the footer form.
  const contactButton = document.getElementById("contact-open");
  if (contactButton && document.querySelector("[data-newsletter]")) {
    const link = document.createElement("a");
    link.href = "#newsletter";
    link.textContent = "Join the list";
    contactButton.before(link);
  }

  document.querySelectorAll("[data-newsletter]").forEach((host) => {
    host.id = "newsletter";
    host.className = "newsletter";
    host.innerHTML = `
      <h2>Join the Micknack Stack Society <span aria-hidden="true">✨</span></h2>
      <p class="newsletter-pitch">New drops, tiny treasures, and first word when something lands.</p>
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
        await window.MICKNACK_SUBSCRIBE(email, input.name);
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
