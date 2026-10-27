// ============================================================================
// The HUB's own page: markup, styling and the small amount of script it needs.
// ============================================================================
//
// Kept apart from the server so that neither file is too big to follow, and
// built here rather than stored as an .html file because every file in this
// folder is published to the open web, and this page is nobody's business
// but Jamie's.
//
// The client script below deliberately uses plain string joining rather than
// template literals: the whole thing is itself inside a template literal, and
// a stray backtick would be a bad afternoon.

export function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Micknack Stacks HUB</title>
<link rel="icon" href="/icon.ico" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400&family=Jost:wght@300;400;500&display=swap" />
<style>
  :root {
    --ink: #0f0d0b; --paper: #faf6ef; --card: #fffaf4;
    --gold: #b78436; --line: rgba(15,13,11,.13); --muted: #6b6259;
    --bad: #9a3412;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.55 "Jost", "Helvetica Neue", Arial, sans-serif;
  }
  a { color: var(--gold); }

  /* ---- chrome ---- */
  header {
    position: sticky; top: 0; z-index: 10; background: var(--paper);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex; align-items: center; gap: 18px;
    padding: 14px 22px 0; flex-wrap: wrap;
  }
  .brand {
    font: 500 1.05rem/1 "Cormorant Garamond", Georgia, serif;
    letter-spacing: .2em; text-transform: uppercase; margin: 0;
    display: flex; align-items: center; gap: 10px;
  }
  .brand img { width: 26px; height: 26px; border-radius: 3px; }
  .bar .spacer { flex: 1; }
  nav { display: flex; gap: 4px; padding: 10px 22px 0; flex-wrap: wrap; }
  nav a {
    text-decoration: none; color: var(--muted); font-size: .76rem;
    letter-spacing: .14em; text-transform: uppercase;
    padding: 9px 14px; border-bottom: 2px solid transparent;
  }
  nav a:hover { color: var(--ink); }
  nav a.on { color: var(--ink); border-bottom-color: var(--gold); }

  button {
    font: inherit; font-size: .82rem; border-radius: 999px; padding: 9px 18px;
    cursor: pointer; border: 1px solid var(--ink);
    background: var(--ink); color: var(--paper);
  }
  button.ghost { background: none; color: var(--ink); }
  button:disabled { opacity: .4; cursor: default; }

  #note { padding: 10px 22px 0; color: var(--muted); font-size: .85rem; min-height: 20px; }
  #note.bad { color: var(--bad); }
  main { padding: 16px 22px 70px; }
  .view { display: none; }
  .view.on { display: block; }

  h2 {
    font: 500 1.3rem/1.2 "Cormorant Garamond", Georgia, serif;
    margin: 0 0 4px;
  }
  .sub { color: var(--muted); font-size: .85rem; margin: 0 0 22px; }

  /* ---- welcome ---- */
  .hello {
    font: 400 1.9rem/1.25 "Cormorant Garamond", Georgia, serif;
    margin: 10px 0 2px;
  }
  .hello em { font-style: italic; color: var(--gold); }
  .tiles {
    display: grid; gap: 12px; margin: 22px 0 10px;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }
  .tile {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 4px; padding: 16px 18px;
  }
  .tile .n {
    font: 500 1.75rem/1 "Cormorant Garamond", Georgia, serif;
    display: block; margin-bottom: 4px;
  }
  .tile .k {
    font-size: .68rem; letter-spacing: .13em; text-transform: uppercase;
    color: var(--muted);
  }
  .tile.warn { border-color: var(--gold); }
  .tile.warn .n { color: var(--gold); }
  .doors { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); margin-top: 8px; }
  .door {
    display: block; text-decoration: none; color: inherit;
    background: var(--card); border: 1px solid var(--line);
    border-radius: 4px; padding: 18px 20px;
  }
  .door:hover { border-color: var(--gold); }
  .door b { display: block; font-weight: 500; margin-bottom: 3px; }
  .door span { color: var(--muted); font-size: .82rem; }
  .door.out { background: none; border-style: dashed; }

  /* ---- money ---- */
  .money { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .purse {
    background: var(--card); border: 1px solid var(--line);
    border-radius: 4px; padding: 18px 20px;
  }
  .purse h4 {
    margin: 0 0 12px; font: 400 .68rem/1 inherit;
    letter-spacing: .14em; text-transform: uppercase; color: var(--muted);
  }
  .purse .big {
    font: 500 1.8rem/1 "Cormorant Garamond", Georgia, serif;
    display: block; margin-bottom: 2px;
  }
  .purse .bigk {
    font-size: .68rem; letter-spacing: .13em; text-transform: uppercase;
    color: var(--muted); display: block; margin-bottom: 14px;
  }
  .purse dl { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; }
  .purse dt { color: var(--muted); font-size: .82rem; }
  .purse dd { margin: 0; font-size: .82rem; text-align: right; font-variant-numeric: tabular-nums; }
  .purse dd.minus { color: var(--bad); }
  .purse .quiet { color: var(--muted); font-size: .82rem; margin: 0; }
  .away {
    font-size: .68rem; letter-spacing: .14em; text-transform: uppercase;
    color: var(--muted); font-weight: 400; margin: 28px 0 10px;
  }

  /* ---- reviews ---- */
  .rv {
    background: var(--card); border: 1px solid var(--line); border-radius: 4px;
    padding: 14px 16px; margin-bottom: 10px;
  }
  .rv.live { border-left: 3px solid var(--gold); }
  .rv .who { font-size: .9rem; }
  .rv .stars { color: var(--gold); letter-spacing: .14em; font-size: .8rem; }
  .rv blockquote {
    margin: 8px 0; font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.05rem; line-height: 1.55;
  }
  .rv .rvmeta { color: var(--muted); font-size: .74rem; }
  .rv .rvdo { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .rv .rvdo button { padding: 6px 14px; font-size: .78rem; }
  .danger { border-color: var(--bad); color: var(--bad); background: none; }

  /* ---- inventory ---- */
  .tools { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .tools input[type=search] {
    flex: 1; min-width: 180px; padding: 9px 12px; font: inherit; font-size: .88rem;
    border: 1px solid var(--line); border-radius: 999px; background: #fff;
  }
  .rows { display: grid; gap: 9px; }
  .row {
    background: var(--card); border: 1px solid var(--line); border-radius: 4px;
    padding: 10px 12px; display: grid;
    grid-template-columns: 50px 1fr auto auto auto; gap: 12px; align-items: center;
  }
  .row.off { opacity: .5; }
  .row img { width: 50px; height: 50px; object-fit: cover; border-radius: 3px; background: #eee; }
  .title { font-size: .9rem; }
  .meta { color: var(--muted); font-size: .74rem; margin-top: 2px; }
  .note {
    display: none; margin-top: 6px; width: 100%; max-width: 440px;
    font: inherit; font-size: .8rem; padding: 5px 8px; background: #fff;
    border: 1px solid var(--line); border-radius: 3px;
  }
  input[type=number] {
    width: 66px; padding: 7px 8px; font: inherit; text-align: center;
    border: 1px solid var(--line); border-radius: 3px; background: #fff;
  }
  .pill {
    font-size: .66rem; letter-spacing: .1em; text-transform: uppercase;
    border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px;
    color: var(--muted); white-space: nowrap;
  }
  .pill.sold { color: var(--bad); border-color: var(--bad); }

  /* ---- add a piece ---- */
  form.add { max-width: 560px; display: grid; gap: 14px; }
  label { display: block; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 5px; }
  input[type=text], input[type=file], textarea, input[type=number].wide {
    width: 100%; padding: 9px 11px; font: inherit; font-size: .9rem;
    border: 1px solid var(--line); border-radius: 3px; background: #fff;
  }
  textarea { min-height: 84px; resize: vertical; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .hint { color: var(--muted); font-size: .78rem; margin-top: 5px; }
  #preview { max-width: 180px; border-radius: 3px; display: none; margin-top: 8px; }

  /* ---- traffic ---- */
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: .86rem; }
  th { font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 400; }
  td.n, th.n { text-align: right; }
  .panel { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; margin-bottom: 16px; }
  .panel h3 { margin: 0 0 2px; font: 500 1.05rem/1.2 "Cormorant Garamond", Georgia, serif; }
  .panel .sub { margin-bottom: 10px; }

  @media (max-width: 720px) {
    .row { grid-template-columns: 40px 1fr auto; }
    .row img { width: 40px; height: 40px; }
    .pill { display: none; }
    .two { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<header>
  <div class="bar">
    <h1 class="brand"><img src="/icon.png" alt="" />Micknack Stacks HUB</h1>
    <span class="spacer"></span>
    <button class="ghost" id="revert">Undo</button>
    <button id="save">Save</button>
    <button id="publish">Save &amp; publish</button>
  </div>
  <nav>
    <a href="#/" data-view="home">Welcome</a>
    <a href="#/inventory" data-view="inventory">Inventory</a>
    <a href="#/add" data-view="add">Add a piece</a>
    <a href="#/reviews" data-view="reviews">Reviews</a>
    <a href="#/traffic" data-view="traffic">Traffic</a>
  </nav>
</header>
<p id="note"></p>

<main>
  <section class="view" id="view-home">
    <p class="hello">Morning, <em>Jamie</em>.</p>
    <p class="sub" id="home-sub">Loading…</p>
    <div class="tiles" id="home-tiles"></div>

    <h3 class="away">Money, last 30 days</h3>
    <div class="money" id="home-money">Asking Etsy and Stripe…</div>
    <div class="doors">
      <a class="door" href="#/inventory"><b>Inventory</b><span>Counts, sold out, hidden</span></a>
      <a class="door" href="#/add"><b>Add a piece</b><span>Something sold only here</span></a>
      <a class="door" href="#/reviews"><b>Reviews</b><span>Read them before they go up</span></a>
      <a class="door" href="#/traffic"><b>Traffic &amp; sales</b><span>Who is looking, who is buying</span></a>
    </div>

    <h3 class="away">Everything else</h3>
    <div class="doors">
      <a class="door out" href="https://www.etsy.com/your/account/payments?ref=seller-platform-mcnav" target="_blank" rel="noopener">
        <b>Etsy payments &#8599;</b><span>What Etsy owes you, and when</span>
      </a>
      <a class="door out" href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener">
        <b>Stripe payments &#8599;</b><span>Orders taken on your own site</span>
      </a>
      <a class="door out" href="https://github.com/jamiemick18/micknack-stacks-website" target="_blank" rel="noopener">
        <b>GitHub &#8599;</b><span>The website itself, and its history</span>
      </a>
      <a class="door out" href="https://dash.cloudflare.com/?to=/:account/workers/services/view/micknack-checkout" target="_blank" rel="noopener">
        <b>Cloudflare &#8599;</b><span>The checkout worker and its logs</span>
      </a>
      <a class="door out" href="https://micknackstacks.com" target="_blank" rel="noopener">
        <b>Your shop &#8599;</b><span>See it the way a customer does</span>
      </a>
    </div>
  </section>

  <section class="view" id="view-reviews">
    <h2>Reviews</h2>
    <p class="sub">Written by people who bought here rather than on Etsy. Nothing appears on your site until you approve it.</p>
    <div id="reviews-body">Loading…</div>
  </section>

  <section class="view" id="view-inventory">
    <h2>Inventory</h2>
    <p class="sub">Set a count, or hide a piece. Nothing reaches the website until you publish.</p>
    <div class="tools">
      <input type="search" id="find" placeholder="Find a piece…" />
      <button class="ghost" id="only-off">Only off sale</button>
      <button class="ghost" id="match-etsy" title="Bring your counts in line with what Etsy has">Match Etsy</button>
    </div>
    <div class="rows" id="rows"></div>
  </section>

  <section class="view" id="view-add">
    <h2>Add a piece</h2>
    <p class="sub">For something sold only here, never listed on Etsy. The Etsy sync never touches these.</p>
    <form class="add" id="add-form">
      <div>
        <label for="a-title">Name</label>
        <input type="text" id="a-title" required placeholder="Midnight Fox Ear Chain" />
      </div>
      <div class="two">
        <div>
          <label for="a-price">Price</label>
          <input type="text" id="a-price" required placeholder="19.99" inputmode="decimal" />
        </div>
        <div>
          <label for="a-qty">How many you have</label>
          <input type="number" id="a-qty" class="wide" min="0" value="1" />
        </div>
      </div>
      <div>
        <label for="a-desc">Description</label>
        <textarea id="a-desc" placeholder="The first line or so shows on the card."></textarea>
      </div>
      <div class="two">
        <div>
          <label for="a-badge">Badge</label>
          <input type="text" id="a-badge" placeholder="Only here" />
        </div>
        <div>
          <label for="a-photo">Photo</label>
          <input type="file" id="a-photo" accept="image/*" />
        </div>
      </div>
      <img id="preview" alt="" />
      <div>
        <button type="submit" id="a-go">Add the piece</button>
        <span class="hint">It is saved here first. Publish when you are ready for the world to see it.</span>
      </div>
    </form>
  </section>

  <section class="view" id="view-traffic">
    <h2>Traffic &amp; sales</h2>
    <p class="sub">Etsy and your own site, counted apart.</p>
    <div id="traffic-body">Loading…</div>
    <div class="panel">
      <h3>Where the orders go</h3>
      <p class="sub">Asks Stripe and Etsy directly, so it takes a few seconds.</p>
      <button class="ghost" id="load-sales">Count the orders</button>
      <div id="sales-body"></div>
    </div>
  </section>
</main>

<script>
var pieces = [], original = "", onlyOff = false, salesLoaded = false;

function note(text, bad) {
  var el = document.getElementById("note");
  el.textContent = text || "";
  el.className = bad ? "bad" : "";
}
function money(cents) { return "$" + (cents / 100).toFixed(2); }
function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

/* ---------- routing ---------- */
function show(name) {
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) views[i].classList.remove("on");
  var el = document.getElementById("view-" + name);
  if (el) el.classList.add("on");
  var links = document.querySelectorAll("nav a");
  for (var j = 0; j < links.length; j++) links[j].classList.toggle("on", links[j].dataset.view === name);
  if (name === "traffic" && !salesLoaded) loadTraffic();
  if (name === "reviews") loadReviews();
  if (name === "home") { paintHome(); loadMoney(); }
}
function route() {
  var hash = location.hash.replace(/^#\\//, "");
  show(hash === "" ? "home" : hash);
}
window.addEventListener("hashchange", route);

/* ---------- inventory ---------- */
function summary() {
  var sold = 0, hidden = 0;
  for (var i = 0; i < pieces.length; i++) {
    if (pieces[i].hidden) hidden++;
    else if (Number(pieces[i].qty) <= 0) sold++;
  }
  return { total: pieces.length, sold: sold, hidden: hidden,
           stock: pieces.reduce(function (n, p) { return n + (p.hidden ? 0 : Number(p.qty) || 0); }, 0) };
}

function paint(row, p) {
  var pill = row.querySelector(".pill");
  var hide = row.querySelector("button");
  hide.textContent = p.hidden ? "Show" : "Hide";
  var off = p.hidden || Number(p.qty) <= 0;
  row.querySelector(".note").style.display = off ? "block" : "none";
  row.className = "row" + (p.hidden ? " off" : "");
  if (p.hidden) { pill.textContent = "hidden"; pill.className = "pill"; }
  else if (Number(p.qty) <= 0) { pill.textContent = "sold out"; pill.className = "pill sold"; }
  else { pill.textContent = "on sale"; pill.className = "pill"; }
}

function renderRows() {
  var host = document.getElementById("rows");
  host.innerHTML = "";
  var q = document.getElementById("find").value.trim().toLowerCase();
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    if (q && p.title.toLowerCase().indexOf(q) === -1) continue;
    if (onlyOff && !(p.hidden || Number(p.qty) <= 0)) continue;

    var row = document.createElement("div");
    var img = document.createElement("img");
    img.src = p.image; img.alt = "";
    img.onerror = (function (el) { return function () { el.style.visibility = "hidden"; }; })(img);

    var cell = document.createElement("div");
    var t = document.createElement("div");
    t.className = "title"; t.textContent = p.title.split("|")[0].trim();
    var m = document.createElement("div");
    m.className = "meta";
    var bits = ["$" + p.price];
    if (p.source === "here") bits.push("only here");
    else if (!p.on_etsy) {
      // Why it left Etsy matters: sold out is a fact about your stock,
      // the others are decisions you made.
      bits.push(p.etsy_state === "sold_out" ? "SOLD OUT on Etsy"
        : p.etsy_state === "gone" ? "deleted from Etsy"
        : p.etsy_state === "inactive" ? "switched off on Etsy"
        : p.etsy_state === "expired" ? "expired on Etsy"
        : "not on Etsy");
    }
    else if (p.etsy_qty !== p.qty) bits.push("Etsy says " + p.etsy_qty);
    if (!p.buyable) bits.push("no Buy button yet");
    m.textContent = bits.join(" · ");
    cell.appendChild(t); cell.appendChild(m);

    var note = document.createElement("input");
    note.type = "text"; note.className = "note";
    note.placeholder = "why? (optional — kept with the piece)";
    note.value = p.note || "";
    note.addEventListener("input", (function (piece, el) {
      return function () { piece.note = el.value; };
    })(p, note));
    cell.appendChild(note);

    var qty = document.createElement("input");
    qty.type = "number"; qty.min = "0"; qty.value = p.qty;
    qty.addEventListener("input", (function (piece, el, r) {
      return function () { piece.qty = Number(el.value); paint(r, piece); };
    })(p, qty, row));

    var pill = document.createElement("span");
    pill.className = "pill";

    var hide = document.createElement("button");
    hide.className = "ghost";
    hide.addEventListener("click", (function (piece, r) {
      return function (e) { e.preventDefault(); piece.hidden = !piece.hidden; paint(r, piece); };
    })(p, row));

    row.appendChild(img); row.appendChild(cell); row.appendChild(qty);
    row.appendChild(pill); row.appendChild(hide);
    host.appendChild(row);
    paint(row, p);
  }
}

function paintHome() {
  var s = summary();
  var tiles = [
    { n: s.total, k: "pieces" },
    { n: s.stock, k: "in stock" },
    { n: s.sold, k: "sold out", warn: s.sold > 0 },
    { n: s.hidden, k: "hidden" }
  ];
  var host = document.getElementById("home-tiles");
  host.innerHTML = "";
  for (var i = 0; i < tiles.length; i++) {
    var d = document.createElement("div");
    d.className = "tile" + (tiles[i].warn ? " warn" : "");
    d.innerHTML = "<span class='n'>" + tiles[i].n + "</span><span class='k'>" + tiles[i].k + "</span>";
    host.appendChild(d);
  }
  var dirty = JSON.stringify(pieces) !== original;
  document.getElementById("home-sub").textContent = dirty
    ? "You have changes that are not on the website yet. Press Save & publish when you are ready."
    : "Everything here matches the website.";
}

/* ---------- money ---------- */
var moneyLoaded = false;
function loadMoney() {
  if (moneyLoaded) return;
  moneyLoaded = true;
  var host = document.getElementById("home-money");
  fetch("/api/money").then(function (r) { return r.json(); }).then(function (d) {
    var h = "";

    h += "<div class='purse'><h4>Etsy</h4>";
    if (!d.etsy.ok) {
      h += "<p class='quiet'>Not available — " + esc(d.etsy.why) + "</p>";
    } else {
      h += "<span class='big'>" + money(d.etsy.balance) + "</span>";
      h += "<span class='bigk'>in your Etsy account now</span>";
      h += "<dl>";
      h += "<dt>Sales</dt><dd>" + money(d.etsy.gross) + "</dd>";
      h += "<dt>Etsy's cut, postage, ads</dt><dd class='minus'>" + money(d.etsy.fees) + "</dd>";
      h += "<dt><b>Kept</b></dt><dd><b>" + money(d.etsy.net) + "</b></dd>";
      h += "<dt>Paid out to you</dt><dd>" + money(d.etsy.paid_out) + "</dd>";
      h += "</dl>";
      if (d.etsy.capped) h += "<p class='quiet' style='margin-top:10px'>Busy month — only the latest 100 entries counted.</p>";
    }
    h += "</div>";

    h += "<div class='purse'><h4>Your own site (Stripe)</h4>";
    if (!d.stripe.ok) {
      h += "<p class='quiet'>Not available — " + esc(d.stripe.why) + "</p>";
    } else if (!d.stripe.month_orders && !d.stripe.available && !d.stripe.pending) {
      h += "<span class='big'>$0.00</span><span class='bigk'>no orders here yet</span>";
      h += "<p class='quiet'>Every sale here keeps the whole price. No marketplace cut.</p>";
    } else {
      h += "<span class='big'>" + money(d.stripe.available + d.stripe.pending) + "</span>";
      h += "<span class='bigk'>in Stripe now</span>";
      h += "<dl>";
      h += "<dt>Ready to pay out</dt><dd>" + money(d.stripe.available) + "</dd>";
      h += "<dt>Still clearing</dt><dd>" + money(d.stripe.pending) + "</dd>";
      h += "<dt>Taken this month</dt><dd>" + money(d.stripe.month_gross) + "</dd>";
      h += "<dt>Orders</dt><dd>" + d.stripe.month_orders + "</dd>";
      if (d.stripe.last_payout)
        h += "<dt>Last payout</dt><dd>" + money(d.stripe.last_payout.amount) + " &middot; " + esc(d.stripe.last_payout.on) + "</dd>";
      h += "</dl>";
    }
    h += "</div>";

    host.innerHTML = h;
  }).catch(function (err) {
    moneyLoaded = false;
    host.innerHTML = "<p class='quiet'>Could not reach them: " + esc(err.message) + "</p>";
  });
}

/* ---------- traffic ---------- */
function loadTraffic() {
  fetch("/api/traffic").then(function (r) { return r.json(); }).then(function (d) {
    salesLoaded = true;
    var h = "";
    h += "<div class='tiles'>";
    h += "<div class='tile'><span class='n'>" + d.etsy_views + "</span><span class='k'>Etsy views</span></div>";
    h += "<div class='tile'><span class='n'>" + d.site_views + "</span><span class='k'>site visits</span></div>";
    h += "<div class='tile'><span class='n'>" + d.etsy_favourites + "</span><span class='k'>Etsy favourites</span></div>";
    h += "<div class='tile'><span class='n'>" + d.site_hearts + "</span><span class='k'>hearts here</span></div>";
    h += "</div>";

    if (d.hearted && d.hearted.length) {
      h += "<div class='panel'><h3>Favourited on your own site</h3>";
      h += "<p class='sub'>Anonymous. Nobody's identity is kept.</p><table><tr><th>Piece</th><th class='n'>Hearts</th></tr>";
      for (var i = 0; i < d.hearted.length; i++)
        h += "<tr><td>" + esc(d.hearted[i].title) + "</td><td class='n'>" + d.hearted[i].hearts + "</td></tr>";
      h += "</table></div>";
    }

    if (d.top && d.top.length) {
      h += "<div class='panel'><h3>Most looked at on Etsy</h3><table><tr><th>Piece</th><th class='n'>Views</th><th class='n'>Favourites</th></tr>";
      for (var k = 0; k < d.top.length; k++)
        h += "<tr><td>" + esc(d.top[k].title) + "</td><td class='n'>" + d.top[k].views + "</td><td class='n'>" + d.top[k].favourites + "</td></tr>";
      h += "</table></div>";
    }
    if (d.worker_error) h += "<p class='hint'>The checkout worker did not answer, so hearts and site visits may be out of date.</p>";
    document.getElementById("traffic-body").innerHTML = h;
  }).catch(function (err) {
    document.getElementById("traffic-body").textContent = "Could not load that: " + err.message;
  });
}

document.getElementById("load-sales").addEventListener("click", function () {
  var btn = this, body = document.getElementById("sales-body");
  btn.disabled = true; body.textContent = "Asking Stripe and Etsy…";
  fetch("/api/sales").then(function (r) { return r.json(); }).then(function (d) {
    btn.disabled = false;
    if (!d.ok) { body.textContent = d.message; return; }
    var h = "";
    var channels = [["site", "Your own site"], ["etsy", "Etsy"]];
    for (var c = 0; c < channels.length; c++) {
      var key = channels[c][0], data = d.report[key];
      h += "<h3 style='margin-top:14px'>" + channels[c][1] + "</h3>";
      if (!data.counted) { h += "<p class='sub'>Not counted — " + esc(data.why || "no access") + "</p>"; continue; }
      if (!data.orders) { h += "<p class='sub'>No orders yet.</p>"; continue; }
      h += "<table><tr><th>Where</th><th class='n'>Orders</th><th class='n'>Total</th></tr>";
      var places = Object.keys(data.by_place).sort(function (a, b) { return data.by_place[b].orders - data.by_place[a].orders; });
      for (var i = 0; i < places.length; i++) {
        var r2 = data.by_place[places[i]];
        h += "<tr><td>" + esc(places[i]) + "</td><td class='n'>" + r2.orders + "</td><td class='n'>" + money(r2.cents) + "</td></tr>";
      }
      h += "</table>";
    }
    h += "<h3 style='margin-top:16px'>Sales tax</h3>";
    if (!d.report.flags.length) h += "<p class='sub'>Nothing to do. " + esc(d.aside || "") + "</p>";
    else for (var f = 0; f < d.report.flags.length; f++)
      h += "<p class='sub' style='color:var(--bad)'>" + esc(d.report.flags[f].why) + "</p>";
    body.innerHTML = h;
  }).catch(function (err) { btn.disabled = false; body.textContent = "That did not work: " + err.message; });
});

/* ---------- reviews ---------- */
function loadReviews() {
  var host = document.getElementById("reviews-body");
  host.textContent = "Loading…";
  fetch("/api/reviews").then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) { host.textContent = d.message; return; }
    var list = d.reviews || [];
    if (!list.length) {
      host.innerHTML = "<p class='sub'>No reviews yet. The form is live on your site — the first one will land here.</p>";
      return;
    }
    var waiting = 0;
    for (var i = 0; i < list.length; i++) if (list[i].status !== "approved") waiting++;
    var h = waiting
      ? "<p class='sub'><b>" + waiting + "</b> waiting for you.</p>"
      : "<p class='sub'>Nothing waiting. All of these are on your site.</p>";

    for (var k = 0; k < list.length; k++) {
      var r2 = list[k], live = r2.status === "approved";
      h += "<div class='rv" + (live ? " live" : "") + "'>";
      h += "<span class='stars'>" + "★".repeat(r2.rating) + "☆".repeat(5 - r2.rating) + "</span>";
      h += "<div class='who'>" + esc(r2.name) + (r2.piece ? " · " + esc(r2.piece) : "") + "</div>";
      h += "<blockquote>" + esc(r2.text) + "</blockquote>";
      h += "<div class='rvmeta'>" + esc(r2.date) + (r2.email ? " · " + esc(r2.email) : " · no email given");
      h += " · " + (live ? "on your site" : "not shown yet") + "</div>";
      h += "<div class='rvdo'>";
      if (!live) h += "<button data-rv='" + esc(r2.id) + "' data-do='approve'>Put it on the site</button>";
      else h += "<button class='ghost' data-rv='" + esc(r2.id) + "' data-do='hide'>Take it down</button>";
      h += "<button class='ghost danger' data-rv='" + esc(r2.id) + "' data-do='delete'>Delete</button>";
      h += "</div></div>";
    }
    host.innerHTML = h;

    var buttons = host.querySelectorAll("button[data-rv]");
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener("click", function () {
        var id = this.dataset.rv, action = this.dataset.do;
        if (action === "delete" && !confirm("Delete this review for good?")) return;
        note("Working…");
        fetch("/api/reviews", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id, action: action })
        }).then(function (r) { return r.json(); }).then(function (d2) {
          note(d2.ok ? "Done." : d2.message, !d2.ok);
          loadReviews();
        }).catch(function (err) { note("That did not work: " + err.message, true); });
      });
    }
  }).catch(function (err) { host.textContent = "Could not load those: " + err.message; });
}

/* ---------- add a piece ---------- */
var photoData = null;
document.getElementById("a-photo").addEventListener("change", function () {
  var file = this.files && this.files[0];
  var preview = document.getElementById("preview");
  if (!file) { photoData = null; preview.style.display = "none"; return; }
  var reader = new FileReader();
  reader.onload = function () {
    photoData = { name: file.name, data: String(reader.result).split(",")[1] };
    preview.src = reader.result; preview.style.display = "block";
  };
  reader.readAsDataURL(file);
});

document.getElementById("add-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var btn = document.getElementById("a-go");
  btn.disabled = true;
  note("Adding…");
  fetch("/api/add", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: document.getElementById("a-title").value,
      price: document.getElementById("a-price").value,
      qty: Number(document.getElementById("a-qty").value),
      description: document.getElementById("a-desc").value,
      badge: document.getElementById("a-badge").value,
      photo: photoData
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    btn.disabled = false;
    note(d.message, !d.ok);
    if (d.ok) {
      document.getElementById("add-form").reset();
      photoData = null;
      document.getElementById("preview").style.display = "none";
      load();
    }
  }).catch(function (err) { btn.disabled = false; note("That did not work: " + err.message, true); });
});

/* ---------- saving ---------- */
function body() {
  var items = {};
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    items[p.id] = { qty: Number(p.qty), hidden: Boolean(p.hidden) };
    if (p.note) items[p.id].note = p.note;
  }
  return JSON.stringify({ items: items });
}

function send(path, label) {
  var buttons = document.querySelectorAll("header button");
  for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
  note(label + "…");
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body() })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      note(d.message, !d.ok);
      if (d.ok) { original = JSON.stringify(pieces); paintHome(); }
    })
    .catch(function (err) { note("That did not work: " + err.message, true); })
    .then(function () {
      for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
    });
}

function load() {
  return fetch("/api/state").then(function (r) { return r.json(); }).then(function (d) {
    pieces = d.pieces;
    original = JSON.stringify(pieces);
    renderRows();
    paintHome();
  });
}

document.getElementById("save").addEventListener("click", function () { send("/api/save", "Saving"); });
document.getElementById("publish").addEventListener("click", function () { send("/api/publish", "Publishing"); });
document.getElementById("revert").addEventListener("click", function () {
  pieces = JSON.parse(original); renderRows(); paintHome(); note("Back to the last saved version.");
});
document.getElementById("match-etsy").addEventListener("click", function () {
  var btn = this;
  btn.disabled = true;
  note("Asking Etsy what it has…");
  fetch("/api/match-etsy", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      note(d.message + (d.moved && d.moved.length ? "  (" + d.moved.join("; ") + ")" : ""));
      return load();
    })
    .catch(function (err) { btn.disabled = false; note("That did not work: " + err.message, true); });
});

document.getElementById("find").addEventListener("input", renderRows);
document.getElementById("only-off").addEventListener("click", function () {
  onlyOff = !onlyOff;
  this.textContent = onlyOff ? "Show everything" : "Only off sale";
  renderRows();
});

window.addEventListener("beforeunload", function (e) {
  if (JSON.stringify(pieces) !== original) { e.preventDefault(); e.returnValue = ""; }
});

load().then(route);
</script>
</body>
</html>`;
}
