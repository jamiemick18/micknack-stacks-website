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

  function render() {
    if (view === "today") return renderToday();
    if (view === "orders") return renderOrders();
    if (view === "stock") return renderStock();
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

      host.innerHTML = h;
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
