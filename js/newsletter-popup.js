// The welcome popup: one invitation to the Stack Society, shortly after arriving.
//
// Rules it follows, so it stays an invitation rather than a nuisance:
//   - once per person, not once per page. Dismiss it and it stays away for a
//     fortnight; join and it never returns.
//   - never during checkout or after an order. Nobody wants a popup between
//     their card and their jewellery.
//   - never when the page is already showing the signup, and never when the
//     email service isn't connected.
//   - Escape closes it, so does clicking the backdrop or Skip for now.
//
// It waits a few seconds rather than appearing instantly: landing on a shop and
// being asked for an email before seeing a single piece is the version of this
// everybody hates.

(function () {
  const DELAY_MS = 7000;
  const QUIET_DAYS = 14;
  const SEEN_KEY = "micknack-popup-seen";
  const JOINED_KEY = "micknack-subscribed";

  const config = window.MICKNACK_NEWSLETTER || {};
  const onLocalhost = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  if (!config.action && !onLocalhost) return;

  // Pages where an interruption would be unwelcome.
  const page = location.pathname.split("/").pop() || "index.html";
  if (page === "cart.html" || page === "thanks.html" || page === "oauth.html") return;

  function remembered(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null; // private window: treated as a first visit
    }
  }

  function remember(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* nothing to do; the popup may ask again on the next visit */
    }
  }

  if (remembered(JOINED_KEY)) return;

  const seenAt = Number(remembered(SEEN_KEY) || 0);
  if (seenAt && Date.now() - seenAt < QUIET_DAYS * 86400000) return;

  let lastFocused = null;

  function build() {
    const backdrop = document.createElement("div");
    backdrop.className = "pop-backdrop";
    backdrop.id = "newsletter-popup";

    const box = document.createElement("div");
    box.className = "pop-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "pop-title");

    box.innerHTML = `
      <button type="button" class="pop-close" aria-label="Close">&times;</button>
      <p class="pop-eyebrow">Micknack Stacks</p>
      <h2 id="pop-title">Join the Micknack Stack Society <span aria-hidden="true">✨</span></h2>
      <p class="pop-pitch">New drops, tiny treasures, and subscriber-only treats. Be first to know when something lands.</p>
      <form class="pop-form" novalidate>
        <input type="email" name="${config.emailField || "email"}" placeholder="your@email.com"
               aria-label="Email address" autocomplete="email" required />
        <button type="submit" class="btn btn-primary">Let me in</button>
      </form>
      <p class="pop-msg" role="status" hidden></p>
      <button type="button" class="pop-skip">Skip for now</button>
      <p class="pop-fine">Unsubscribe anytime. Your address goes nowhere else.</p>`;

    backdrop.appendChild(box);
    return backdrop;
  }

  function close(popup, joined) {
    remember(SEEN_KEY, String(Date.now()));
    if (joined) remember(JOINED_KEY, "1");
    popup.classList.remove("is-open");
    setTimeout(() => popup.remove(), 200);
    document.removeEventListener("keydown", onKey);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  let openPopup = null;

  function onKey(event) {
    if (event.key === "Escape" && openPopup) close(openPopup, false);
  }

  function open() {
    // Someone already reading the footer signup does not need to be asked.
    const footer = document.getElementById("newsletter");
    if (footer) {
      const box = footer.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) return;
    }

    const popup = build();
    openPopup = popup;
    lastFocused = document.activeElement;
    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add("is-open"));

    const form = popup.querySelector("form");
    const input = form.querySelector("input");
    const message = popup.querySelector(".pop-msg");
    input.focus();

    const say = (text, isError) => {
      message.textContent = text;
      message.classList.toggle("is-error", Boolean(isError));
      message.hidden = false;
    };

    popup.querySelector(".pop-close").addEventListener("click", () => close(popup, false));
    popup.querySelector(".pop-skip").addEventListener("click", () => close(popup, false));
    popup.addEventListener("click", (event) => {
      if (event.target === popup) close(popup, false);
    });
    document.addEventListener("keydown", onKey);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = input.value.trim();
      if (!window.MICKNACK_EMAIL_OK(email)) {
        say("Please enter a valid email address.", true);
        input.focus();
        return;
      }
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await window.MICKNACK_SUBSCRIBE(email, input.name);
        form.hidden = true;
        popup.querySelector(".pop-skip").textContent = "Close";
        say("You're on the list. Check your inbox to confirm.");
        remember(JOINED_KEY, "1");
        setTimeout(() => close(popup, true), 2600);
      } catch (err) {
        button.disabled = false;
        say(
          err && err.message === "not_configured"
            ? "Signup isn't connected yet."
            : "Something went wrong. Please try again in a moment.",
          true
        );
      }
    });
  }

  // Only once the page has settled, and never over a tab nobody is looking at.
  setTimeout(() => {
    if (document.visibilityState === "visible") open();
    else document.addEventListener("visibilitychange", function once() {
      document.removeEventListener("visibilitychange", once);
      if (document.visibilityState === "visible") setTimeout(open, 1500);
    });
  }, DELAY_MS);
})();
