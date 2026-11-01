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

  // The stones Jamie actually keeps. Nobody can ask for a lavender stone they
  // do not know exists, so they are shown before the box that asks what you
  // want — the shelf first, the question second.
  var stones = (window.MICKNACK_STONES || []).filter(function (s) {
    return s && s.available !== false && s.name;
  });

  var chains = (window.MICKNACK_CHAINS || []).filter(function (c) {
    return c && c.available !== false && c.name;
  });

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : value;
    return div.innerHTML;
  }

  // An iridescent stone is not one colour. AB and opal are drawn as a shift
  // around the base rather than a flat disc, which would make AB look like
  // plain lilac and sell nobody anything.
  function beadFace(stone) {
    var base = stone.swatch || "#ddd";
    if (stone.finish === "ab") {
      return "conic-gradient(from 210deg, " + base + ", #bfe6ff, #ffd9f2, #fff0b8, #c9f7d8, " + base + ")";
    }
    if (stone.finish === "opal") {
      return "radial-gradient(circle at 30% 24%, #ffffff 0%, #b9a7ef 22%, " + base + " 46%, #3fae96 70%, #16296b 100%)";
    }
    return base;
  }

  // ---- drawing a stone ----
  //
  // Each shape is drawn, not photographed, because this is a mock-up and it
  // should look like one. Someone arranging five stones needs to see the
  // ORDER and the COLOUR; pretending to show them the finished piece would
  // promise a likeness nobody can honestly make from a dropdown.

  var SHAPES = {
    round: function (r) { return '<circle cx="0" cy="0" r="' + r + '"/>'; },
    oval: function (r) { return '<ellipse cx="0" cy="0" rx="' + r * 0.78 + '" ry="' + r * 1.15 + '"/>'; },
    marquise: function (r) {
      var w = r * 0.72, h = r * 1.5;
      return '<path d="M0 ' + -h + ' Q' + w + ' 0 0 ' + h + ' Q' + -w + ' 0 0 ' + -h + ' Z"/>';
    },
    pear: function (r) {
      var h = r * 1.45;
      return '<path d="M0 ' + -h + ' Q' + r * 0.95 + ' ' + r * 0.25 + ' 0 ' + h +
        ' Q' + -r * 0.95 + ' ' + r * 0.25 + ' 0 ' + -h + ' Z"/>';
    },
    heart: function (r) {
      var k = r * 1.1;
      return '<path d="M0 ' + k * 0.95 + ' C' + -k * 1.5 + ' ' + -k * 0.15 + ' ' + -k * 0.72 + ' ' + -k * 1.25 +
        ' 0 ' + -k * 0.42 + ' C' + k * 0.72 + ' ' + -k * 1.25 + ' ' + k * 1.5 + ' ' + -k * 0.15 +
        ' 0 ' + k * 0.95 + ' Z"/>';
    },
    star: function (r) {
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var rad = (Math.PI / 5) * i - Math.PI / 2;
        var len = i % 2 ? r * 0.46 : r * 1.25;
        pts.push((Math.cos(rad) * len).toFixed(2) + "," + (Math.sin(rad) * len).toFixed(2));
      }
      return '<polygon points="' + pts.join(" ") + '"/>';
    },
  };

  // A stone can be cut several ways. Which one they meant is their choice,
  // so the arrangement carries the shape alongside the stone.
  function shapeKey(word) {
    var w = String(word || "").toLowerCase();
    if (w.indexOf("marquise") > -1) return "marquise";
    if (w.indexOf("pear") > -1 || w.indexOf("teardrop") > -1) return "pear";
    if (w.indexOf("heart") > -1) return "heart";
    if (w.indexOf("star") > -1) return "star";
    if (w.indexOf("oval") > -1) return "oval";
    return "round";
  }

  // 4mm is the usual stone, so it is drawn at the usual size and anything
  // else is drawn in proportion to it. Nobody should have to read a label to
  // see that a 6mm is bigger.
  function radiusOf(stone) {
    var mm = parseFloat(String(stone.size || "").replace(/[^0-9.]/g, "")) || 4;
    return Math.max(8, Math.min(19, 13 * Math.sqrt(mm / 4)));
  }

  function shapesOf(stone) {
    var list = String(stone.shape || "")
      .split(",")
      .map(function (bit) { return bit.trim(); })
      .filter(Boolean);
    return list.length ? list : ["Round"];
  }

  // AB and opal are not one colour, so they get a real gradient in the
  // drawing rather than a flat disc that would sell nobody anything.
  function paintDefs(used) {
    return used
      .map(function (stone, i) {
        if (stone.finish === "ab") {
          return (
            '<linearGradient id="g' + i + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#9fd8ff"/>' +
            '<stop offset="26%" stop-color="' + (stone.swatch || "#ddd") + '"/>' +
            '<stop offset="48%" stop-color="#ffb3e6"/>' +
            '<stop offset="70%" stop-color="#ffe89a"/>' +
            '<stop offset="100%" stop-color="#9ff0c6"/>' +
            "</linearGradient>"
          );
        }
        if (stone.finish === "opal") {
          return (
            '<radialGradient id="g' + i + '" cx="30%" cy="24%" r="82%">' +
            '<stop offset="0%" stop-color="#ffffff"/>' +
            '<stop offset="22%" stop-color="#b9a7ef"/>' +
            '<stop offset="46%" stop-color="' + (stone.swatch || "#ddd") + '"/>' +
            '<stop offset="70%" stop-color="#3fae96"/>' +
            '<stop offset="100%" stop-color="#16296b"/>' +
            "</radialGradient>"
          );
        }
        return "";
      })
      .join("");
  }

  // ---- the chain itself ----
  //
  // A drape, not a straight line: a connector chain hangs between two
  // piercings, and drawn flat it reads as a bracelet.
  function drawChain(arrangement, mm, chainMm) {
    var W = 460, H = 190;
    var left = 46, right = W - 46;
    var top = 48;
    // Longer chain, deeper drape — the same proportion a real one takes.
    var sag = Math.max(30, Math.min(58, 18 + mm * 0.55));
    var ctrlY = top + sag * 2;

    function at(t) {
      var mt = 1 - t;
      return {
        x: mt * mt * left + 2 * mt * t * ((left + right) / 2) + t * t * right,
        y: mt * mt * top + 2 * mt * t * ctrlY + t * t * top,
      };
    }

    var defs = paintDefs(arrangement.map(function (a) { return a.stone; }));

    var svg =
      '<svg viewBox="0 0 ' + W + " " + H + '" class="chain-svg" role="img" ' +
      'aria-label="A rough drawing of your chain">' +
      "<defs>" + defs + "</defs>" +
      '<path d="M' + left + " " + top + " Q" + (left + right) / 2 + " " + ctrlY + " " + right + " " + top + '" ' +
      'fill="none" stroke="#c9a227" stroke-width="' + (1.4 + (Number(chainMm) || 1.5) * 0.8).toFixed(1) + '" ' +
      'stroke-linecap="round" ' +
      'stroke-dasharray="1 4.5" />' +
      '<circle cx="' + left + '" cy="' + top + '" r="6" fill="none" stroke="#c9a227" stroke-width="2.2"/>' +
      '<circle cx="' + right + '" cy="' + top + '" r="6" fill="none" stroke="#c9a227" stroke-width="2.2"/>';

    for (var i = 0; i < arrangement.length; i++) {
      // Spread evenly, and kept away from the two end rings so nothing
      // looks like it is hanging off the clasp.
      var t = arrangement.length === 1 ? 0.5 : 0.17 + (0.66 * i) / (arrangement.length - 1);
      var point = at(t);
      var stone = arrangement[i].stone;
      var fill = stone.finish ? "url(#g" + i + ")" : stone.swatch || "#ddd";
      var draw = SHAPES[shapeKey(arrangement[i].shape)] || SHAPES.round;
      var r = radiusOf(stone);
      svg +=
        '<g transform="translate(' + point.x.toFixed(1) + "," + (point.y + 15).toFixed(1) + ')" ' +
        'fill="' + fill + '" stroke="rgba(15,13,11,.22)" stroke-width="0.8">' +
        '<line x1="0" y1="' + -r + '" x2="0" y2="-5" stroke="#c9a227" stroke-width="1.6"/>' +
        draw(r) +
        "</g>";
    }

    svg += "</svg>";
    return svg;
  }

  function shelf() {
    if (!stones.length) return "";
    var cards = stones
      .map(function (stone) {
        // A photo is the stone. The colour is only a stand-in until there is
        // one, and it is never drawn over the top of a photo.
        var face = stone.image
          ? "background-image:url('" + escapeHtml(stone.image) + "')"
          : "background:" + beadFace(stone);
        var cuts = shapesOf(stone);
        // One cut, one button. Several, and each gets its own, because
        // "marquise or round" is a different piece, not a detail.
        return cuts
          .map(function (cut) {
            return (
              '<button type="button" class="stone-pick" data-stone="' + escapeHtml(stone.id) + '"' +
              ' data-shape="' + escapeHtml(cut) + '"' +
              ' title="' + escapeHtml([stone.name, cut, stone.note].filter(Boolean).join(" — ")) + '">' +
              '<span class="stone-bead" style="' + face + '"></span>' +
              '<span class="stone-name">' + escapeHtml(stone.name) + "</span>" +
              '<span class="stone-note">' + escapeHtml([cut, stone.size].filter(Boolean).join(" · ")) + "</span>" +
              "</button>"
            );
          })
          .join("");
      })
      .join("");
    return (
      '<div class="stone-shelf">' +
      "<h3>Build your chain</h3>" +
      '<p class="stone-lede">Tap stones in the order you want them along the chain — ' +
      "the same one twice is fine. The drawing below is a rough mock-up, not the " +
      "finished piece, but it shows me exactly what you are after.</p>" +
      '<div class="stone-row">' + cards + "</div>" +

      '<div class="chain-build">' +
      '<div class="chain-size">' +
      '<label for="chain-mm">How long? <em>the gap between your two piercings</em></label>' +
      '<input type="number" id="chain-mm" min="10" max="120" step="5" value="40" /> <span>mm</span>' +
      "</div>" +
      (chains.length
        ? '<div class="chain-size">' +
          '<label for="chain-kind">Chain</label>' +
          '<select id="chain-kind">' +
          chains
            .map(function (c) {
              return '<option value="' + escapeHtml(c.id) + '" data-mm="' + escapeHtml(c.mm || "") + '">' +
                escapeHtml(c.name) + "</option>";
            })
            .join("") +
          "</select>" +
          "</div>"
        : "") +
      '<div class="chain-preview" id="chain-preview"></div>' +
      '<p class="chain-seq" id="chain-seq">Nothing picked yet — tap a stone above.</p>' +
      '<div class="chain-acts">' +
      '<button type="button" class="chain-btn" id="chain-undo">Undo last</button>' +
      '<button type="button" class="chain-btn" id="chain-clear">Start over</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

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
    shelf() +
    (chains.length
      ? ""
      : '<label><span>Chain <em>optional</em></span><input type="text" name="chain" maxlength="80" ' +
        'placeholder="Dainty, chunky — or leave it to me" /></label>') +
    '<label><span>End rings <em>optional</em></span>' +
    '<select name="rings">' +
    '<option value="">No preference</option>' +
    '<option>Small — the most hidden, needs a thin post</option>' +
    '<option>Medium — fits most hoops and flatbacks</option>' +
    '<option>Large — easiest to clip on and off</option>' +
    "</select></label>" +
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
  // The arrangement is an ORDER, not a set: hot pink, AB, light pink, AB,
  // hot pink is a different piece from the same five in another order, and
  // the same stone twice is the whole point.
  var chain = [];

  var preview = dialog.querySelector("#chain-preview");
  var seqLine = dialog.querySelector("#chain-seq");
  var mmInput = dialog.querySelector("#chain-mm");
  var kindInput = dialog.querySelector("#chain-kind");

  function byId(id) {
    for (var i = 0; i < stones.length; i++) if (String(stones[i].id) === String(id)) return stones[i];
    return null;
  }

  function said() {
    return chain
      .map(function (one) {
        var bits = [one.shape.toLowerCase(), one.stone.size].filter(Boolean).join(", ");
        return one.stone.name + " (" + bits + ")";
      })
      .join(" → ");
  }

  function paint() {
    if (!preview) return;
    var mm = Math.max(10, Math.min(120, Number(mmInput && mmInput.value) || 40));
    var picked = kindInput ? kindInput.options[kindInput.selectedIndex] : null;
    preview.innerHTML = drawChain(chain, mm, picked ? picked.dataset.mm : 1.5);
    if (!seqLine) return;
    seqLine.textContent = chain.length
      ? said() + "  ·  " + mm + "mm"
      : "Nothing picked yet — tap a stone above.";
    // How many they have, so nobody loses count halfway along.
    var marks = dialog.querySelectorAll(".stone-pick");
    for (var i = 0; i < marks.length; i++) {
      var id = marks[i].dataset.stone, cut = marks[i].dataset.shape;
      var n = chain.filter(function (one) {
        return String(one.stone.id) === id && one.shape === cut;
      }).length;
      marks[i].classList.toggle("on", n > 0);
      var tag = marks[i].querySelector(".stone-count");
      if (n > 1) {
        if (!tag) {
          tag = document.createElement("span");
          tag.className = "stone-count";
          marks[i].appendChild(tag);
        }
        tag.textContent = "×" + n;
      } else if (tag) {
        tag.remove();
      }
    }
  }

  dialog.querySelectorAll(".stone-pick").forEach(function (button) {
    button.addEventListener("click", function () {
      var stone = byId(button.dataset.stone);
      if (!stone) return;
      if (chain.length >= 12) return;
      chain.push({ stone: stone, shape: button.dataset.shape });
      paint();
    });
  });

  var undo = dialog.querySelector("#chain-undo");
  var clear = dialog.querySelector("#chain-clear");
  if (undo) undo.addEventListener("click", function () { chain.pop(); paint(); });
  if (clear) clear.addEventListener("click", function () { chain = []; paint(); });
  if (mmInput) mmInput.addEventListener("input", paint);
  if (kindInput) kindInput.addEventListener("change", paint);
  paint();

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
        stones: said(),
        chain: kindInput
          ? kindInput.options[kindInput.selectedIndex].textContent
          : fields.get("chain"),
        length: mmInput && mmInput.value ? mmInput.value + "mm" : "",
        rings: fields.get("rings"),
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
        chain = [];
        if (mmInput) mmInput.value = 40;
        paint();
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
