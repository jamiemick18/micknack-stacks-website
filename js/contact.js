// The Contact button and its popup, shared by every page.
//
// The address lives here in one place: change it once and every page follows.

const SHOP_EMAIL = "micknackstacks@gmail.com";

const contactDialog = document.getElementById("contact-dialog");
const contactOpen = document.getElementById("contact-open");

if (contactDialog && contactOpen) {
  const emailLink = document.getElementById("contact-email");
  const copyBtn = document.getElementById("contact-copy");
  const copied = document.getElementById("contact-copied");

  emailLink.textContent = SHOP_EMAIL;
  emailLink.href = `mailto:${SHOP_EMAIL}`;

  contactOpen.addEventListener("click", () => {
    if (typeof contactDialog.showModal === "function") contactDialog.showModal();
    else contactDialog.setAttribute("open", "");
  });

  contactDialog.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => contactDialog.close())
  );

  // Clicking the backdrop closes it: the dialog element itself is the
  // backdrop, so a click landing on it rather than on the card means outside.
  contactDialog.addEventListener("click", (event) => {
    if (event.target === contactDialog) contactDialog.close();
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(SHOP_EMAIL);
      copied.textContent = "Copied";
    } catch (err) {
      const range = document.createRange();
      range.selectNodeContents(emailLink);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copied.textContent = "Selected — press Ctrl+C";
    }
    copied.hidden = false;
    setTimeout(() => (copied.hidden = true), 2600);
  });
}
