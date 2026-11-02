// ============================================================================
// GEMS — how a stone is drawn, wherever it is drawn.
// ============================================================================
//
// Three places show a stone: the shelf someone picks from, the mock-up of the
// chain they are building, and the HUB where Jamie manages them. They all use
// this, so a marquise is the same marquise in all three and a new cut only
// has to be drawn once.
//
// Everything here is a drawing, not a photograph. It shows the CUT and the
// COLOUR, which is what someone choosing stones is choosing between; it does
// not pretend to be a likeness of a piece nobody has made yet.

window.MICKNACK_GEM = (function () {
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

// Each cut is drawn as an outline plus the facet lines that make it read as
// a cut stone rather than a coloured blob. The facets are strokes over the
// same fill, so an AB gradient still shows through them.
//
// A mock-up, not a photograph: it shows the SHAPE and the COLOUR, which is
// what someone choosing stones is choosing between.

function poly(points) {
  return points.map(function (p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(" ");
}

var SHAPES = {
  // A brilliant seen face on: the table in the middle, facets radiating out.
  round: function (r) {
    var table = r * 0.46;
    var spokes = "";
    for (var i = 0; i < 8; i++) {
      var a = (Math.PI / 4) * i + Math.PI / 8;
      spokes += '<line x1="' + (Math.cos(a) * table).toFixed(2) + '" y1="' + (Math.sin(a) * table).toFixed(2) +
        '" x2="' + (Math.cos(a) * r).toFixed(2) + '" y2="' + (Math.sin(a) * r).toFixed(2) + '"/>';
    }
    var ring = [];
    for (var k = 0; k < 8; k++) {
      var b = (Math.PI / 4) * k + Math.PI / 8;
      ring.push([Math.cos(b) * table, Math.sin(b) * table]);
    }
    return '<circle cx="0" cy="0" r="' + r + '"/>' +
      '<g class="facet"><polygon points="' + poly(ring) + '"/>' + spokes + "</g>";
  },

  oval: function (r) {
    var rx = r * 0.76, ry = r * 1.12;
    return '<ellipse cx="0" cy="0" rx="' + rx + '" ry="' + ry + '"/>' +
      '<g class="facet"><ellipse cx="0" cy="0" rx="' + rx * 0.5 + '" ry="' + ry * 0.5 + '"/>' +
      '<line x1="' + -rx * 0.5 + '" y1="0" x2="' + -rx + '" y2="0"/>' +
      '<line x1="' + rx * 0.5 + '" y1="0" x2="' + rx + '" y2="0"/>' +
      '<line x1="0" y1="' + -ry * 0.5 + '" x2="0" y2="' + -ry + '"/>' +
      '<line x1="0" y1="' + ry * 0.5 + '" x2="0" y2="' + ry + '"/></g>';
  },

  // Pointed at both ends, widest across the middle.
  marquise: function (r) {
    // A 3x5mm marquise is three wide and five long, so the width is six
    // tenths of the length.
    //
    // The control point is NOT the width: a quadratic curve only reaches
    // half way to its control, so a control at 0.6h drew a stone 0.3 wide
    // and it looked like a sliver. Double it to get the width asked for.
    var h = r * 1.4, w = h * 0.6 * 2;
    return '<path d="M0 ' + -h + ' Q' + w + ' 0 0 ' + h + ' Q' + -w + ' 0 0 ' + -h + ' Z"/>' +
      '<g class="facet"><path d="M0 ' + -h * 0.52 + ' Q' + w * 0.52 + ' 0 0 ' + h * 0.52 +
      ' Q' + -w * 0.52 + ' 0 0 ' + -h * 0.52 + ' Z"/>' +
      '<line x1="0" y1="' + -h + '" x2="0" y2="' + h + '"/>' +
      '<line x1="' + -w + '" y1="0" x2="' + w + '" y2="0"/></g>';
  },

  // One point, one round end.
  pear: function (r) {
    var w = r * 0.86, h = r * 1.4;
    return '<path d="M0 ' + -h + ' C' + w + ' ' + -h * 0.1 + ' ' + w + ' ' + h + ' 0 ' + h +
      ' C' + -w + ' ' + h + ' ' + -w + ' ' + -h * 0.1 + ' 0 ' + -h + ' Z"/>' +
      '<g class="facet"><ellipse cx="0" cy="' + h * 0.24 + '" rx="' + w * 0.46 + '" ry="' + h * 0.4 + '"/>' +
      '<line x1="0" y1="' + -h + '" x2="0" y2="' + -h * 0.16 + '"/>' +
      '<line x1="' + -w * 0.46 + '" y1="' + h * 0.1 + '" x2="' + -w * 0.92 + '" y2="' + h * 0.1 + '"/>' +
      '<line x1="' + w * 0.46 + '" y1="' + h * 0.1 + '" x2="' + w * 0.92 + '" y2="' + h * 0.1 + '"/></g>';
  },

  // A princess cut: square, with facets to the corners.
  diamond: function (r) {
    var a = r * 0.88;
    var box = [[-a, -a], [a, -a], [a, a], [-a, a]];
    var table = [[-a * 0.5, -a * 0.5], [a * 0.5, -a * 0.5], [a * 0.5, a * 0.5], [-a * 0.5, a * 0.5]];
    return '<polygon points="' + poly(box) + '"/>' +
      '<g class="facet"><polygon points="' + poly(table) + '"/>' +
      '<line x1="' + -a + '" y1="' + -a + '" x2="' + -a * 0.5 + '" y2="' + -a * 0.5 + '"/>' +
      '<line x1="' + a + '" y1="' + -a + '" x2="' + a * 0.5 + '" y2="' + -a * 0.5 + '"/>' +
      '<line x1="' + a + '" y1="' + a + '" x2="' + a * 0.5 + '" y2="' + a * 0.5 + '"/>' +
      '<line x1="' + -a + '" y1="' + a + '" x2="' + -a * 0.5 + '" y2="' + a * 0.5 + '"/></g>';
  },

  // A kite: four sides, long point down.
  kite: function (r) {
    var w = r * 0.82, up = r * 1.05, down = r * 1.42;
    var outline = [[0, -up], [w, 0], [0, down], [-w, 0]];
    return '<polygon points="' + poly(outline) + '"/>' +
      '<g class="facet"><polygon points="' +
      poly([[0, -up * 0.46], [w * 0.46, 0], [0, down * 0.46], [-w * 0.46, 0]]) + '"/>' +
      '<line x1="0" y1="' + -up + '" x2="0" y2="' + down + '"/>' +
      '<line x1="' + -w + '" y1="0" x2="' + w + '" y2="0"/></g>';
  },

  // The classic gem silhouette: a trillion, point up, flat base.
  trillion: function (r) {
    var a = r * 1.12;
    var pts = [[0, -a], [a * 0.92, a * 0.62], [-a * 0.92, a * 0.62]];
    return '<polygon points="' + poly(pts) + '"/>' +
      '<g class="facet"><polygon points="' +
      poly([[0, -a * 0.44], [a * 0.42, a * 0.3], [-a * 0.42, a * 0.3]]) + '"/>' +
      '<line x1="0" y1="' + -a + '" x2="0" y2="' + -a * 0.44 + '"/>' +
      '<line x1="' + a * 0.92 + '" y1="' + a * 0.62 + '" x2="' + a * 0.42 + '" y2="' + a * 0.3 + '"/>' +
      '<line x1="' + -a * 0.92 + '" y1="' + a * 0.62 + '" x2="' + -a * 0.42 + '" y2="' + a * 0.3 + '"/></g>';
  },

  // A long rectangle with step facets, like a baguette.
  baguette: function (r) {
    var w = r * 0.56, h = r * 1.3;
    return '<rect x="' + -w + '" y="' + -h + '" width="' + w * 2 + '" height="' + h * 2 + '" rx="1"/>' +
      '<g class="facet"><rect x="' + -w * 0.56 + '" y="' + -h * 0.72 + '" width="' + w * 1.12 +
      '" height="' + h * 1.44 + '" rx="1"/></g>';
  },

  heart: function (r) {
    var k = r * 1.05;
    return '<path d="M0 ' + k * 0.95 + ' C' + -k * 1.5 + ' ' + -k * 0.15 + ' ' + -k * 0.72 + ' ' + -k * 1.25 +
      ' 0 ' + -k * 0.42 + ' C' + k * 0.72 + ' ' + -k * 1.25 + ' ' + k * 1.5 + ' ' + -k * 0.15 +
      ' 0 ' + k * 0.95 + ' Z"/>' +
      '<g class="facet"><line x1="0" y1="' + -k * 0.42 + '" x2="0" y2="' + k * 0.95 + '"/>' +
      '<line x1="' + -k * 0.62 + '" y1="' + -k * 0.52 + '" x2="0" y2="' + k * 0.1 + '"/>' +
      '<line x1="' + k * 0.62 + '" y1="' + -k * 0.52 + '" x2="0" y2="' + k * 0.1 + '"/></g>';
  },

  star: function (r) {
    var pts = [];
    var inner = [];
    for (var i = 0; i < 10; i++) {
      var rad = (Math.PI / 5) * i - Math.PI / 2;
      var len = i % 2 ? r * 0.48 : r * 1.22;
      pts.push([Math.cos(rad) * len, Math.sin(rad) * len]);
      if (i % 2 === 0) inner.push([Math.cos(rad) * r * 0.42, Math.sin(rad) * r * 0.42]);
    }
    return '<polygon points="' + poly(pts) + '"/>' +
      '<g class="facet"><polygon points="' + poly(inner) + '"/></g>';
  },
};

// A stone can be cut several ways. Which one they meant is their choice,
// so the arrangement carries the shape alongside the stone.
function shapeKey(word) {
  var w = String(word || "").toLowerCase();
  if (w.indexOf("marquise") > -1 || w.indexOf("navette") > -1) return "marquise";
  if (w.indexOf("pear") > -1 || w.indexOf("teardrop") > -1 || w.indexOf("drop") > -1) return "pear";
  if (w.indexOf("kite") > -1) return "kite";
  // "Princess" and "square" are the same silhouette as a diamond cut here;
  // "diamond shaped" is what most people say for it.
  if (w.indexOf("diamond") > -1 || w.indexOf("princess") > -1 || w.indexOf("square") > -1) return "diamond";
  if (w.indexOf("trillion") > -1 || w.indexOf("triangle") > -1) return "trillion";
  if (w.indexOf("baguette") > -1 || w.indexOf("bar") > -1 || w.indexOf("rectang") > -1) return "baguette";
  if (w.indexOf("heart") > -1) return "heart";
  if (w.indexOf("star") > -1) return "star";
  if (w.indexOf("oval") > -1) return "oval";
  return "round";
}

// 4mm is the usual stone, so it is drawn at the usual size and anything
// else is drawn in proportion to it. Nobody should have to read a label to
// see that a 6mm is bigger.
function radiusOf(stone) {
  // The FIRST number, not every digit mashed together: a marquise written
  // "3x5mm" is three by five, and stripping the x made it a thirty five
  // millimetre stone that drew bigger than everything else on the chain.
  var found = String(stone.size || "").match(/[0-9]*\.?[0-9]+/);
  var mm = found ? parseFloat(found[0]) : 4;
  if (!(mm > 0)) mm = 4;
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


  // One stone on its own, as a complete little SVG: the shelf button and the
  // HUB both want exactly this.
  function one(stone, cut, px) {
    var size = px || 44;
    var r = 15;
    var id = "gem" + Math.random().toString(36).slice(2, 9);
    var defs = paintDefs([stone]).replace(/id="g0"/, 'id="' + id + '"');
    var fill = stone.finish ? "url(#" + id + ")" : stone.swatch || "#ddd";
    var draw = SHAPES[shapeKey(cut || shapesOf(stone)[0])] || SHAPES.round;
    return (
      '<svg class="gem" viewBox="-22 -22 44 44" width="' + size + '" height="' + size + '" ' +
      'role="img" aria-hidden="true">' +
      "<defs>" + defs + "</defs>" +
      '<g fill="' + fill + '" stroke="rgba(15,13,11,.28)" stroke-width="0.7">' +
      draw(r) +
      "</g></svg>"
    );
  }

  return {
    shapes: SHAPES,
    shapeKey: shapeKey,
    shapesOf: shapesOf,
    radiusOf: radiusOf,
    paintDefs: paintDefs,
    beadFace: beadFace,
    one: one,
  };
})();
