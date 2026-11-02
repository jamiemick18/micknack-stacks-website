// The HUB on a phone.
//
// Everything here goes through the checkout worker, which holds the password
// and does the actual work. This page stores nothing but the password, and
// only so Jamie is not typing it at every traffic light.
//
// What it can do: see orders waiting and mark them sent, set counts, hide and
// show pieces, read and approve reviews, and look at the money. What it
// cannot do is add a new piece — that needs photos and a keyboard, and lives
// on the desktop.
//
// Changes here take effect on the shop within seconds. There is no publishing
// step, because the shop reads counts and hidden pieces from the worker.

(function () {
  var WORKER = "https://micknack-checkout.jamie-mick18.workers.dev";
  var KEY = "micknack-hub-pass";

  var pass = "";
  var titles = {};          // piece id -> name, from the shop's own data
  var view = "today";
  var cache = {};

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var note = document.getElementById("note");

  function say(text, bad) {
    note.textContent = text || "";
    note.className = "note" + (bad ? " bad" : "");
  }

  function esc(value) {
    var d = document.createElement("div");
    d.textContent = value == null ? "" : value;
    return d.innerHTML;
  }

  function money(cents) {
    return "$" + ((cents || 0) / 100).toFixed(2);
  }

  function ask(action, extra) {
    var payload = { pass: pass, action: action };
    for (var k in extra) payload[k] = extra[k];
    return fetch(WORKER + "/hub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || "That did not work.");
        return body;
      });
    });
  }

  // ---- the gate ----------------------------------------------------------

  document.getElementById("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var typed = document.getElementById("pass").value;
    var msg = document.getElementById("gate-msg");
    msg.textContent = "Checking…";
    pass = typed;
    ask("summary")
      .then(function (body) {
        try { localStorage.setItem(KEY, typed); } catch (err) {}
        cache.summary = body.summary;
        open();
      })
      .catch(function (err) {
        pass = "";
        msg.textContent = err.message;
      });
  });

  document.getElementById("lock").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (err) {}
    location.reload();
  });

  function open() {
    gate.style.display = "none";
    app.style.display = "block";
    loadTitles();
    render();
  }

  // The shop's own catalog gives pieces their names. It is a plain file on
  // the same site, so no password is involved and nothing private is in it.
  function loadTitles() {
    var add = function (id, title) { titles[String(id)] = String(title || "").split("|")[0].trim(); };
    // The catalog is a big file and arrives after the first screen is drawn,
    // so whatever is on show gets drawn again with the names filled in.
    var done = function () { render(); };
    var s1 = document.createElement("script");
    s1.src = "data/products.js";
    s1.onload = function () {
      var data = window.MICKNACK_PRODUCTS || {};
      (data.listings || []).forEach(function (l) { add(l.listing_id, l.title); });
      done();
    };
    document.head.appendChild(s1);
    var s2 = document.createElement("script");
    s2.src = "data/extra-products.js";
    s2.onload = function () {
      (window.MICKNACK_EXTRA_PRODUCTS || []).forEach(function (e) { add(e.id, e.title); });
      done();
    };
    document.head.appendChild(s2);
  }

  // ---- navigation --------------------------------------------------------

  var tabs = document.querySelectorAll("nav button");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () {
      view = this.dataset.view;
      for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle("on", tabs[j] === this);
      var views = document.querySelectorAll(".view");
      for (var k = 0; k < views.length; k++) views[k].classList.toggle("on", views[k].id === "v-" + view);
      say("");
      render();
    });
  }

  function badge(id, n) {
    var el = document.getElementById(id);
    el.hidden = !n;
    el.textContent = n;
  }

  /* ---------- notifications on this phone ---------- */
  //
  // The push itself carries nothing; hub-sw.js is woken by it and asks the
  // worker what sort of thing happened. See the note at the top of that file.

  var VAPID = "BM_0lhJXvNOntCtI4NbEgIyaSq4XLIs0CvptmapxlCNg42UGlryb8V7TWcqM7lRYv80WWnwXEbXcGalqUk70jn8";

  function keyBytes(base64url) {
    var pad = "=".repeat((4 - (base64url.length % 4)) % 4);
    var raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function currentSub() {
    if (!pushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    });
  }

  function paintPush() {
    var card = document.getElementById("push-card");
    if (!card) return;

    if (!pushSupported()) {
      // On an iPhone this is what you get until the HUB is added to the Home
      // Screen, so say that rather than "not supported", which sounds final.
      card.innerHTML =
        "<p class='meta'>This phone cannot do notifications from a browser tab. " +
        "On an iPhone, open the share menu and choose <b>Add to Home Screen</b>, " +
        "then open the HUB from there and look again.</p>";
      return;
    }

    currentSub().then(function (sub) {
      var on = Boolean(sub) && Notification.permission === "granted";
      var h = "<p class='meta'>" +
        (on
          ? "This phone is being told when a request, review or order lands."
          : "Get a notification when a custom request, a review or an order comes in.") +
        "</p><div class='foot'>";
      h += on
        ? "<button class='act' data-push='test'>Send a test</button>" +
          "<button class='act ghost' data-push='off'>Turn off</button>"
        : "<button class='act' data-push='on'>Turn on for this phone</button>";
      h += "</div>";
      card.innerHTML = h;

      var buttons = card.querySelectorAll("button[data-push]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", function () {
          var what = this.dataset.push;
          if (what === "on") return turnPushOn();
          if (what === "off") return turnPushOff();
          say("Sending a test…");
          ask("pushtest").then(function (d) {
            say(d.ok ? "Sent. It should arrive in a moment." : d.error, !d.ok);
          }).catch(function (err) { say(err.message, true); });
        });
      }
    });
  }

  function turnPushOn() {
    say("Asking for permission…");
    Notification.requestPermission()
      .then(function (permission) {
        if (permission !== "granted") {
          // Saying no here is sticky: the browser will not ask again, so say
          // where to undo it rather than leaving a button that does nothing.
          throw new Error("Not allowed. Turn notifications on for this site in your phone's settings, then try again.");
        }
        return navigator.serviceWorker.register("/hub-sw.js");
      })
      .then(function (reg) {
        return navigator.serviceWorker.ready.then(function () { return reg; });
      })
      .then(function (reg) {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(VAPID),
        });
      })
      .then(function (sub) {
        return ask("subscribe", { subscription: { endpoint: sub.endpoint } });
      })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "That did not save.");
        say("Notifications are on for this phone.");
        paintPush();
      })
      .catch(function (err) { say(err.message, true); });
  }

  function turnPushOff() {
    say("Turning them off…");
    currentSub()
      .then(function (sub) {
        if (!sub) return { ok: true };
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return ask("unsubscribe", { endpoint: endpoint });
        });
      })
      .then(function () {
        say("This phone will be left alone.");
        paintPush();
      })
      .catch(function (err) { say(err.message, true); });
  }

  /* ---------- the stone shelf ---------- */
  //
  // Everything here goes through the worker, which edits the shop's own files
  // on GitHub. The phone and the desktop are changing the same files, not two
  // copies of them, so neither can quietly undo the other.
  //
  // Photos are not here yet: they need the file itself, which is the next
  // piece of work. Everything else a stone has can be set from here.

  // A phone camera makes a four thousand pixel photograph. A stone on the
  // shelf is drawn at forty six pixels across. Sending the original would be
  // several megabytes through the worker to show a bead, so it is shrunk here
  // before it goes anywhere.
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read that photo.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("That did not look like a photo.")); };
        img.onload = function () {
          var max = 600;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var out = canvas.toDataURL("image/jpeg", 0.86);
          resolve({ name: "photo.jpg", data: out.split(",")[1], preview: out });
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  var stonePhoto = null;

  var CUTS = ["Round", "Oval", "Marquise", "Pear", "Diamond", "Kite", "Trillion", "Baguette", "Heart", "Star"];

  function pickedCuts() {
    var boxes = document.querySelectorAll("#st-shape input[type=checkbox]");
    var out = [];
    for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) out.push(boxes[i].value);
    return out.join(", ");
  }

  var editingStone = null;
  var editingChain = null;

  // A photo is the stone itself. Failing that it is drawn as its actual cut,
  // by the same code the website uses — see js/gems.js.
  // The drawing is the standard view, matching the shelf a customer sees.
  // The photograph itself is in the edit form, a tap away.
  function stoneFace(stone) {
    return window.MICKNACK_GEM
      ? window.MICKNACK_GEM.one(stone, null, 46)
      : "<span class='bead' style='background:" + esc(stone.swatch || "#ddd") + "'></span>";
  }

  function renderShelf() {
    var host = document.getElementById("v-shelf");
    host.innerHTML = "<div class='card'><p class='meta'>Loading…</p></div>";

    ask("shelf", { what: "read" }).then(function (d) {
      if (!d.ok) { host.innerHTML = "<div class='card'><p class='meta'>" + esc(d.error) + "</p></div>"; return; }
      cache.shelf = d;

      var h = "<h2>Stones</h2><div class='card'><div class='beads'>";
      for (var i = 0; i < d.stones.length; i++) {
        var st = d.stones[i];
        h += "<button class='bead-card" + (st.available === false ? " off" : "") +
          "' data-stone='" + esc(st.id) + "'>";
        h += stoneFace(st);
        h += "<b>" + esc(st.name) + "</b>";
        if (st.shape || st.size) h += "<small>" + esc([st.shape, st.size].filter(Boolean).join(" · ")) + "</small>";
        if (st.image) h += "<small>has a photo</small>";
        if (st.available === false) h += "<small>off the shelf</small>";
        h += "</button>";
      }
      h += "</div><div class='foot'><button class='act' data-new='stone'>Add a stone</button></div></div>";

      h += "<h2>Chains</h2><div class='card'>";
      for (var c = 0; c < d.chains.length; c++) {
        var ch = d.chains[c];
        h += "<button class='act ghost' style='display:block;width:100%;box-sizing:border-box;text-align:left;margin-bottom:6px' data-chain='" + esc(ch.id) + "'>" +
          esc(ch.name) + (ch.mm ? " <span class='meta'>" + esc(ch.mm) + "mm</span>" : "") +
          (ch.available === false ? " <span class='meta'>off the shelf</span>" : "") + "</button>";
      }
      h += "<div class='foot'><button class='act' data-new='chain'>Add a chain</button></div></div>";

      h += "<h2>Custom pieces</h2><div class='card shelf-form'>";
      h += "<label for='sh-from'>Starting price</label><input id='sh-from' value='" + esc(d.custom.from || "") + "' inputmode='decimal' />";
      h += "<label for='sh-rings'>End rings</label><input id='sh-rings' value='" + esc(d.custom.rings || "") + "' />";
      h += "<div class='foot'><button class='act' data-save='custom'>Save</button></div></div>";

      host.innerHTML = h;
      wireShelf(d);
    }).catch(function (err) {
      host.innerHTML = "<div class='card'><p class='meta'>" + esc(err.message) + "</p></div>";
    });
  }

  function wireShelf(d) {
    var host = document.getElementById("v-shelf");

    var stoneButtons = host.querySelectorAll("button[data-stone]");
    for (var i = 0; i < stoneButtons.length; i++) {
      stoneButtons[i].addEventListener("click", function () {
        var id = this.dataset.stone;
        var found = null;
        for (var k = 0; k < d.stones.length; k++) if (d.stones[k].id === id) found = d.stones[k];
        if (found) stoneForm(found);
      });
    }

    var chainButtons = host.querySelectorAll("button[data-chain]");
    for (var c = 0; c < chainButtons.length; c++) {
      chainButtons[c].addEventListener("click", function () {
        var id = this.dataset.chain;
        var found = null;
        for (var k = 0; k < d.chains.length; k++) if (d.chains[k].id === id) found = d.chains[k];
        if (found) chainForm(found);
      });
    }

    var adds = host.querySelectorAll("button[data-new]");
    for (var a = 0; a < adds.length; a++) {
      adds[a].addEventListener("click", function () {
        if (this.dataset["new"] === "stone") stoneForm(null);
        else chainForm(null);
      });
    }

    var save = host.querySelector("button[data-save=custom]");
    if (save) {
      save.addEventListener("click", function () {
        say("Saving…");
        ask("shelf", {
          what: "custom",
          from: document.getElementById("sh-from").value,
          rings: document.getElementById("sh-rings").value,
        }).then(function (r) {
          say(r.ok ? r.message : r.error, !r.ok);
        }).catch(function (err) { say(err.message, true); });
      });
    }
  }

  function stoneForm(stone) {
    editingStone = stone;
    var host = document.getElementById("v-shelf");
    var s = stone || { swatch: "#cccccc", shape: "Round", size: "4mm", available: true };
    var h = "<h2>" + (stone ? "Edit stone" : "Add a stone") + "</h2><div class='card shelf-form'>";
    h += "<label for='st-name'>Name</label><input id='st-name' value='" + esc(s.name || "") + "' placeholder='Lavender CZ' />";
    h += "<label for='st-swatch'>Colour</label><input type='color' id='st-swatch' value='" +
      esc(/^#[0-9a-f]{6}$/i.test(s.swatch || "") ? s.swatch : "#cccccc") + "' />";
    h += "<label for='st-finish'>Finish</label><select id='st-finish'>" +
      "<option value=''" + (!s.finish ? " selected" : "") + ">Plain</option>" +
      "<option value='ab'" + (s.finish === "ab" ? " selected" : "") + ">Iridescent (AB)</option>" +
      "<option value='opal'" + (s.finish === "opal" ? " selected" : "") + ">Opal / moonstone glow</option>" +
      "</select>";
    // A stone can be cut several ways, so this is a tick list rather than a
    // dropdown. Typing the cut in meant a typo became a shape nothing could draw.
    var have = String(s.shape || "").toLowerCase().split(",").map(function (b) { return b.trim(); });
    h += "<label>Shape</label><div class='cuts' id='st-shape'>";
    for (var ci = 0; ci < CUTS.length; ci++) {
      h += "<label><input type='checkbox' value='" + CUTS[ci] + "'" +
        (have.indexOf(CUTS[ci].toLowerCase()) > -1 ? " checked" : "") + " /> <span>" + CUTS[ci] + "</span></label>";
    }
    h += "</div>";
    h += "<label for='st-size'>Size</label><input id='st-size' value='" + esc(s.size || "") + "' placeholder='4mm' />";
    h += "<label for='st-note'>One line about it</label><input id='st-note' value='" + esc(s.note || "") + "' />";
    h += "<label class='tick'><input type='checkbox' id='st-on'" + (s.available === false ? "" : " checked") +
      " /> <span>On the shelf</span></label>";
    h += "<label for='st-photo'>Photo</label>";
    h += "<input type='file' id='st-photo' accept='image/*' />";
    h += "<img id='st-shot' alt='' style='display:" + (stone && stone.image ? "block" : "none") +
      ";max-width:120px;border-radius:6px;margin-top:8px' src='" +
      (stone && stone.image ? "/" + esc(stone.image) : "") + "' />";
    if (stone && stone.image) {
      h += "<label class='tick'><input type='checkbox' id='st-nophoto' /> <span>Remove its photo</span></label>";
    }
    h += "<div class='foot'><button class='act' data-do='save'>Save</button><button class='act ghost' data-do='back'>Never mind</button>";
    if (stone) h += "<button class='act danger' data-do='remove'>Remove</button>";
    h += "</div></div>";
    host.innerHTML = h;

    stonePhoto = null;
    host.querySelector("button[data-do=back]").addEventListener("click", renderShelf);

    var photoInput = document.getElementById("st-photo");
    photoInput.addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) { stonePhoto = null; return; }
      say("Getting that photo ready…");
      shrinkPhoto(file).then(function (shot) {
        stonePhoto = { name: shot.name, data: shot.data };
        var preview = document.getElementById("st-shot");
        preview.src = shot.preview;
        preview.style.display = "block";
        say("");
      }).catch(function (err) { stonePhoto = null; say(err.message, true); });
    });

    host.querySelector("button[data-do=save]").addEventListener("click", function () {
      say("Saving…");
      var drop = document.getElementById("st-nophoto");
      ask("shelf", {
        what: "stone",
        id: stone ? stone.id : "",
        photo: stonePhoto,
        clearPhoto: Boolean(drop && drop.checked),
        name: document.getElementById("st-name").value,
        swatch: document.getElementById("st-swatch").value,
        finish: document.getElementById("st-finish").value,
        shape: pickedCuts(),
        size: document.getElementById("st-size").value,
        note: document.getElementById("st-note").value,
        available: document.getElementById("st-on").checked,
      }).then(function (r) {
        say(r.ok ? r.message : r.error, !r.ok);
        if (r.ok) renderShelf();
      }).catch(function (err) { say(err.message, true); });
    });

    var remove = host.querySelector("button[data-do=remove]");
    if (remove) {
      remove.addEventListener("click", function () {
        if (!confirm("Remove " + stone.name + " for good? If you have just run out, untick On the shelf instead.")) return;
        say("Removing…");
        ask("shelf", { what: "stone-remove", id: stone.id }).then(function (r) {
          say(r.ok ? r.message : r.error, !r.ok);
          if (r.ok) renderShelf();
        }).catch(function (err) { say(err.message, true); });
      });
    }
  }

  function chainForm(chain) {
    editingChain = chain;
    var host = document.getElementById("v-shelf");
    var c = chain || { available: true };
    var h = "<h2>" + (chain ? "Edit chain" : "Add a chain") + "</h2><div class='card shelf-form'>";
    h += "<label for='ch-name'>Name</label><input id='ch-name' value='" + esc(c.name || "") + "' placeholder='1.5mm cable chain' />";
    h += "<label for='ch-mm'>Width in mm</label><input id='ch-mm' value='" + esc(c.mm || "") + "' placeholder='1.5' inputmode='decimal' />";
    h += "<label class='tick'><input type='checkbox' id='ch-on'" + (c.available === false ? "" : " checked") +
      " /> <span>On the shelf</span></label>";
    h += "<div class='foot'><button class='act' data-do='save'>Save</button><button class='act ghost' data-do='back'>Never mind</button>";
    if (chain) h += "<button class='act danger' data-do='remove'>Remove</button>";
    h += "</div></div>";
    host.innerHTML = h;

    host.querySelector("button[data-do=back]").addEventListener("click", renderShelf);

    host.querySelector("button[data-do=save]").addEventListener("click", function () {
      say("Saving…");
      ask("shelf", {
        what: "chain",
        id: chain ? chain.id : "",
        name: document.getElementById("ch-name").value,
        mm: document.getElementById("ch-mm").value,
        available: document.getElementById("ch-on").checked,
      }).then(function (r) {
        say(r.ok ? r.message : r.error, !r.ok);
        if (r.ok) renderShelf();
      }).catch(function (err) { say(err.message, true); });
    });

    var remove = host.querySelector("button[data-do=remove]");
    if (remove) {
      remove.addEventListener("click", function () {
        if (!confirm("Remove " + chain.name + "?")) return;
        say("Removing…");
        ask("shelf", { what: "chain-remove", id: chain.id }).then(function (r) {
          say(r.ok ? r.message : r.error, !r.ok);
          if (r.ok) renderShelf();
        }).catch(function (err) { say(err.message, true); });
      });
    }
  }

  function render() {
    if (view === "today") return renderToday();
    if (view === "orders") return renderOrders();
    if (view === "stock") return renderStock();
    if (view === "shelf") return renderShelf();
    if (view === "requests") return renderRequests();
    if (view === "reviews") return renderReviews();
  }

  // ---- today -------------------------------------------------------------

  function renderToday() {
    var host = document.getElementById("v-today");
    if (!cache.summary) host.innerHTML = "<p class='note'>Loading…</p>";

    ask("summary").then(function (body) {
      var s = (cache.summary = body.summary);
      badge("dot-reviews", s.reviews_waiting);
      badge("dot-requests", s.customs_waiting || 0);

      var h = "<div class='tiles'>";
      h += tile(s.views.site, "visits here");
      h += tile(s.total_hearts, "hearts");
      h += tile(s.sold_out, "sold out", s.sold_out > 0);
      h += tile(s.reviews_waiting, "reviews waiting", s.reviews_waiting > 0);
      h += tile(s.customs_waiting || 0, "custom requests", (s.customs_waiting || 0) > 0);
      h += "</div>";

      h += "<h2 id='money-head'>Money, last 30 days</h2><div id='money-body'>" +
        "<div class='card'><p class='meta'>Asking Etsy and Stripe…</p></div></div>";

      if (s.hearts && s.hearts.length) {
        h += "<h2>Most hearted here</h2><div class='card'>";
        for (var i = 0; i < Math.min(5, s.hearts.length); i++) {
          h += row(titles[s.hearts[i].piece] || s.hearts[i].piece, s.hearts[i].count);
        }
        h += "</div>";
      }

      h += "<h2>Etsy</h2><div class='card'>";
      h += row("Views", s.views.etsy);
      h += "</div>";

      h += "<h2>Notifications</h2><div class='card' id='push-card'>" +
        "<p class='meta'>Checking…</p></div>";

      host.innerHTML = h;
      paintPush();
    }).catch(function (err) { say(err.message, true); });

    loadMoney();

    // The orders badge needs its own answer; it is the thing most worth
    // knowing before you even choose a tab.
    ask("orders").then(function (body) {
      cache.orders = body.orders;
      badge("dot-orders", body.orders.all.length);
    }).catch(function () {});
  }

  // Both shopfronts. Etsy is where the money actually is, and leaving it off
  // the phone made the screen look like the shop had earned nothing.
  function loadMoney() {
    ask("money").then(function (body) {
      var host = document.getElementById("money-body");
      if (!host) return;
      var m = body.money || {};
      var h = "";

      h += "<div class='card'><div class='rowtop'><b>Etsy</b></div>";
      if (!m.etsy.ok) {
        h += "<p class='meta'>Not available — " + esc(m.etsy.why) + "</p>";
      } else {
        h += "<div class='big-money'>" + money(m.etsy.balance) + "</div>";
        h += "<div class='meta' style='margin-bottom:8px'>in your Etsy account now</div>";
        h += row("Sales", money(m.etsy.gross));
        h += row("Etsy's cut, postage, ads", money(m.etsy.fees));
        h += row("Kept", money(m.etsy.net));
        h += row("Paid out to you", money(m.etsy.paid_out));
      }
      h += "</div>";

      h += "<div class='card'><div class='rowtop'><b>Your own site</b></div>";
      if (!m.stripe.ok) {
        h += "<p class='meta'>Not available — " + esc(m.stripe.why) + "</p>";
      } else if (!m.stripe.month_orders && !m.stripe.available && !m.stripe.pending) {
        h += "<div class='big-money'>$0.00</div>";
        h += "<p class='meta'>No orders here yet. Every sale here keeps the whole price.</p>";
      } else {
        h += "<div class='big-money'>" + money(m.stripe.available + m.stripe.pending) + "</div>";
        h += "<div class='meta' style='margin-bottom:8px'>in Stripe now</div>";
        h += row("Ready to pay out", money(m.stripe.available));
        h += row("Still clearing", money(m.stripe.pending));
        h += row("Taken this month", money(m.stripe.month_gross));
        h += row("Orders", String(m.stripe.month_orders));
      }
      h += "</div>";

      host.innerHTML = h;
    }).catch(function (err) {
      var host = document.getElementById("money-body");
      if (host) host.innerHTML = "<div class='card'><p class='meta'>Could not reach them: " + esc(err.message) + "</p></div>";
    });
  }

  function tile(n, k, warn) {
    return "<div class='tile" + (warn ? " warn" : "") + "'><span class='n'>" + n +
      "</span><span class='k'>" + k + "</span></div>";
  }

  function row(left, right) {
    return "<div class='money-row'><span>" + esc(left) + "</span><span>" + esc(right) + "</span></div>";
  }

  // ---- orders ------------------------------------------------------------

  function renderOrders() {
    var host = document.getElementById("v-orders");
    host.innerHTML = "<p class='note'>Loading…</p>";

    ask("orders").then(function (body) {
      var orders = (cache.orders = body.orders);
      badge("dot-orders", orders.all.length);

      if (!orders.all.length) {
        var done = "<div class='card'><b>Nothing waiting.</b><p class='meta'>Every order has gone out.</p></div>";
        if (!orders.etsy.ok) done += "<p class='note'>Etsy could not be asked — " + esc(orders.etsy.why) + "</p>";
        if (!orders.site.ok) done += "<p class='note'>Stripe could not be asked — " + esc(orders.site.why) + "</p>";
        host.innerHTML = done;
        return;
      }

      var today = new Date();
      var h = "";
      for (var i = 0; i < orders.all.length; i++) {
        var o = orders.all[i];
        var days = Math.round((today - new Date(o.at + "T12:00:00Z")) / 86400000);
        h += "<div class='card" + (days >= 3 ? " late" : "") + "'>";
        h += "<div class='rowtop'><b>" + esc(o.name || "No name given") + "</b><span class='when'>" +
          esc(o.from) + " &middot; " + (days <= 0 ? "today" : days + "d") + "</span></div>";
        if (o.where) h += "<div class='where'>" + esc(o.where) + "</div>";
        h += "<ul class='items'>";
        for (var k = 0; k < o.items.length; k++) {
          h += "<li>" + (o.items[k].qty > 1 ? "<b>&times;" + o.items[k].qty + "</b> " : "") +
            esc(o.items[k].title) + "</li>";
        }
        h += "</ul><div class='foot'><span>" + money(o.cents) + "</span>";
        if (o.from === "Etsy") {
          h += "<a href='https://www.etsy.com/your/orders/sold' target='_blank' rel='noopener'>Open in Etsy &#8599;</a>";
        } else {
          h += "<button class='act ghost' data-sent='" + esc(o.id) + "'>Mark as sent</button>";
        }
        h += "</div></div>";
      }
      host.innerHTML = h;

      wire(host, "sent", function (button, id) {
        button.disabled = true;
        ask("sent", { id: id, sent: true }).then(renderOrders);
      });
    }).catch(function (err) { host.innerHTML = ""; say(err.message, true); });
  }

  // ---- stock -------------------------------------------------------------

  var findBox = document.getElementById("find");
  findBox.addEventListener("input", function () { if (view === "stock") paintStock(); });

  function renderStock() {
    if (!cache.stock) document.getElementById("stock-list").innerHTML = "<p class='note'>Loading…</p>";
    ask("stock").then(function (body) {
      cache.stock = body;
      paintStock();
    }).catch(function (err) { say(err.message, true); });
  }

  function paintStock() {
    var body = cache.stock;
    if (!body) return;
    var host = document.getElementById("stock-list");
    var q = findBox.value.trim().toLowerCase();

    var ids = Object.keys(body.stock).sort(function (a, b) {
      return (titles[a] || a).localeCompare(titles[b] || b);
    });

    var h = "";
    var shown = 0;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var name = titles[id] || id;
      if (q && name.toLowerCase().indexOf(q) === -1) continue;
      var qty = body.stock[id];
      var hidden = Boolean(body.hidden[id]);
      shown++;
      h += "<div class='piece" + (hidden ? " off" : "") + "' data-piece='" + esc(id) + "'>";
      h += "<div class='name'>" + esc(name) +
        "<div class='sub'>" + (hidden ? "hidden" : qty <= 0 ? "sold out" : "on sale") + "</div></div>";
      h += "<div class='stepper'><button data-less='" + esc(id) + "'>&minus;</button>" +
        "<span class='q' id='q-" + esc(id) + "'>" + qty + "</span>" +
        "<button data-more='" + esc(id) + "'>+</button></div>";
      h += "<button class='eye' data-eye='" + esc(id) + "'>" + (hidden ? "Show" : "Hide") + "</button>";
      h += "</div>";
    }
    host.innerHTML = shown ? h : "<p class='note'>Nothing matches that.</p>";

    wire(host, "less", function (button, id) { step(id, -1); });
    wire(host, "more", function (button, id) { step(id, +1); });
    wire(host, "eye", function (button, id) {
      var hidden = !cache.stock.hidden[id];
      button.disabled = true;
      ask("hide", { piece: id, hidden: hidden }).then(function () {
        if (hidden) cache.stock.hidden[id] = true; else delete cache.stock.hidden[id];
        paintStock();
        say(hidden ? "Hidden from the shop." : "Back on the shop.");
      }).catch(function (err) { button.disabled = false; say(err.message, true); });
    });
  }

  // The count is changed where it is shown, straight away, and put back if
  // the worker refuses: waiting on a round trip to see a number move makes a
  // phone feel broken.
  function step(id, by) {
    var next = Math.max(0, (cache.stock.stock[id] || 0) + by);
    cache.stock.stock[id] = next;
    var cell = document.getElementById("q-" + id);
    if (cell) cell.textContent = next;
    ask("setqty", { piece: id, qty: next }).then(function () {
      paintStock();
    }).catch(function (err) {
      cache.stock.stock[id] = next - by;
      paintStock();
      say(err.message, true);
    });
  }

  // ---- custom requests ---------------------------------------------------

  function renderRequests() {
    var host = document.getElementById("v-requests");
    host.innerHTML = "<p class='note'>Loading…</p>";

    ask("customs").then(function (body) {
      var list = body.customs || [];
      var waiting = list.filter(function (c) { return c.status !== "done"; }).length;
      badge("dot-requests", waiting);

      if (!list.length) {
        host.innerHTML = "<div class='card'><b>Nothing yet.</b>" +
          "<p class='meta'>The band is live at the top of your site. The first request lands here.</p></div>";
        return;
      }

      var h = waiting ? "<p class='note'><b>" + waiting + "</b> waiting for a reply.</p>"
                      : "<p class='note'>All answered.</p>";
      for (var i = 0; i < list.length; i++) {
        var c = list[i], open = c.status !== "done";
        h += "<div class='card" + (open ? "" : " live") + "'>";
        h += "<div class='rowtop'><b>" + esc(c.name || "No name given") + "</b>" +
          "<span class='when'>" + esc(String(c.at || "").slice(0, 10)) + "</span></div>";
        h += "<div class='where'><a href='mailto:" + esc(c.email) + "'>" + esc(c.email) + "</a></div>";
        h += "<blockquote>" + esc(c.idea) + "</blockquote>";
        // What they picked off the stone shelf, if they picked anything.
        var spec = [];
        if (c.stones) spec.push("Stones: " + c.stones);
        if (c.chain) spec.push("Chain: " + c.chain);
        if (c.length) spec.push("Length: " + c.length);
        if (c.rings) spec.push("End rings: " + c.rings);
        for (var q = 0; q < spec.length; q++) h += "<div class='spec'>" + esc(spec[q]) + "</div>";
        var bits = [];
        if (c.budget) bits.push("Budget: " + esc(c.budget));
        if (c.when) bits.push("Needed by: " + esc(c.when));
        if (c.emailed && c.emailed !== "sent") bits.push("email " + esc(c.emailed));
        if (bits.length) h += "<div class='meta'>" + bits.join(" &middot; ") + "</div>";
        h += "<div class='foot'>";
        h += "<a class='act' href='mailto:" + esc(c.email) +
          "?subject=" + encodeURIComponent("About your custom piece") + "'>Reply</a>";
        h += open
          ? "<button class='act ghost' data-cx='" + esc(c.id) + "' data-do='done'>Answered</button>"
          : "<button class='act ghost' data-cx='" + esc(c.id) + "' data-do='new'>Still open</button>";
        h += "<button class='act danger' data-cx='" + esc(c.id) + "' data-do='delete'>Delete</button>";
        h += "</div></div>";
      }
      host.innerHTML = h;

      var buttons = host.querySelectorAll("button[data-cx]");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener("click", function () {
          // Deleting is the one thing here that cannot be undone, and a
          // phone is easy to tap by accident.
          if (this.dataset.do === "delete" && !confirm("Delete this request for good?")) return;
          this.disabled = true;
          ask("custom", { id: this.dataset.cx, do: this.dataset.do })
            .then(renderRequests)
            .catch(function (err) { say(err.message, true); });
        });
      }
    }).catch(function (err) { host.innerHTML = ""; say(err.message, true); });
  }

  // ---- reviews -----------------------------------------------------------

  function renderReviews() {
    var host = document.getElementById("v-reviews");
    host.innerHTML = "<p class='note'>Loading…</p>";

    ask("reviews").then(function (body) {
      var list = body.reviews || [];
      var waiting = list.filter(function (r) { return r.status !== "approved"; }).length;
      badge("dot-reviews", waiting);

      if (!list.length) {
        host.innerHTML = "<div class='card'><b>No reviews yet.</b>" +
          "<p class='meta'>The form is live on your site. The first one will land here.</p></div>";
        return;
      }

      var h = waiting ? "<p class='note'><b>" + waiting + "</b> waiting for you.</p>"
                      : "<p class='note'>Nothing waiting.</p>";
      for (var i = 0; i < list.length; i++) {
        var r = list[i], live = r.status === "approved";
        h += "<div class='card" + (live ? " live" : "") + "'>";
        h += "<span class='stars'>" + "★".repeat(r.rating) + "☆".repeat(5 - r.rating) + "</span>";
        h += "<div><b>" + esc(r.name) + "</b>" + (r.piece ? " &middot; " + esc(r.piece) : "") + "</div>";
        h += "<blockquote>" + esc(r.text) + "</blockquote>";
        h += "<div class='meta'>" + esc(r.date) + " &middot; " + (live ? "on your site" : "not shown yet") + "</div>";
        h += "<div class='foot'>";
        h += live
          ? "<button class='act ghost' data-do='hide' data-id='" + esc(r.id) + "'>Take it down</button>"
          : "<button class='act' data-do='approve' data-id='" + esc(r.id) + "'>Put it on the site</button>";
        h += "<button class='act danger' data-do='delete' data-id='" + esc(r.id) + "'>Delete</button>";
        h += "</div></div>";
      }
      host.innerHTML = h;

      var buttons = host.querySelectorAll("button[data-do]");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener("click", function () {
          var verb = this.dataset.do;
          if (verb === "delete" && !confirm("Delete this review for good?")) return;
          this.disabled = true;
          ask("review", { id: this.dataset.id, do: verb }).then(renderReviews)
            .catch(function (err) { say(err.message, true); });
        });
      }
    }).catch(function (err) { host.innerHTML = ""; say(err.message, true); });
  }

  // ---- odds and ends -----------------------------------------------------

  function wire(host, name, handler) {
    var buttons = host.querySelectorAll("[data-" + name + "]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", (function (button) {
        return function () { handler(button, button.dataset[name]); };
      })(buttons[i]));
    }
  }

  // Come back later and it should still be open, the way a phone app is.
  var saved = "";
  try { saved = localStorage.getItem(KEY) || ""; } catch (err) {}
  if (saved) {
    pass = saved;
    ask("summary").then(function (body) {
      cache.summary = body.summary;
      open();
    }).catch(function () {
      pass = "";
      try { localStorage.removeItem(KEY); } catch (err) {}
    });
  }
})();
