// The Social menu in the header.
//
// A menu rather than two more links: Instagram and TikTok are the same kind of
// thing, and the header had grown to nine items. It opens on click, not on
// hover, so it behaves on a phone, and it closes on Escape, on a click
// outside, and when focus leaves it.

(function () {
  const toggle = document.getElementById("social-toggle");
  const menu = document.getElementById("social-menu");
  if (!toggle || !menu) return;

  function open() {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }

  function close(returnFocus) {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) open();
    else close(false);
  });

  // The first item, so the keyboard can walk straight in.
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open();
      const first = menu.querySelector("a");
      if (first) first.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) close(true);
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden) return;
    if (!menu.contains(event.target) && event.target !== toggle) close(false);
  });

  // Tabbing out of the last link should close it behind you.
  menu.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!menu.contains(document.activeElement) && document.activeElement !== toggle) {
        close(false);
      }
    }, 0);
  });
})();
