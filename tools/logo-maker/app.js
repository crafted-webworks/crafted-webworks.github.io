/* Logo Maker — self-contained IIFE, no globals leaked, no network calls.
   See tools/STANDARDS.md for the contract this follows. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var CANVAS_SIZE = 1000;

  /* ------------------------------------------------------------------
     Fonts — curated, system-safe, no external font files (§Text spec).
     ------------------------------------------------------------------ */
  var FONTS = {
    "system-ui": 'system-ui, -apple-system, "Segoe UI", sans-serif',
    "helvetica": 'Helvetica, Arial, sans-serif',
    "trebuchet": '"Trebuchet MS", sans-serif',
    "georgia": 'Georgia, "Times New Roman", serif',
    "times": '"Times New Roman", Times, serif',
    "verdana": 'Verdana, Geneva, sans-serif',
    "courier": '"Courier New", Courier, monospace'
  };

  /* ------------------------------------------------------------------
     Shape system (§7 spirit): a small set of GENERIC RENDERERS
     (circle / polygon / path / composite) interpret plain-data shape
     DESCRIPTORS. Adding a new icon is adding a descriptor to ICON_LIST,
     not writing a new draw routine — and because the canvas renderer and
     the SVG renderer both read the same descriptor + the same transform
     math, the preview, the export canvas and the SVG export can never
     drift apart from each other.
     ------------------------------------------------------------------ */

  function n(v) { return Math.round(v * 100) / 100; }

  // Transform a unit-space point (roughly -0.5..0.5) into absolute canvas
  // coordinates centered at (cx, cy) and scaled by `size`.
  function tx(p, cx, cy, size) { return [cx + p[0] * size, cy + p[1] * size]; }

  function hexPoints(r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  }

  function octagonPoints(r) {
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var a = (Math.PI / 4) * i - Math.PI / 8;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  }

  function starPoints(outerR, innerR, count) {
    var pts = [];
    for (var i = 0; i < count * 2; i++) {
      var r = (i % 2 === 0) ? outerR : innerR;
      var a = (Math.PI / count) * i - Math.PI / 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  }

  function gearPoints(teeth, outerR, innerR) {
    var pts = [];
    for (var i = 0; i < teeth * 2; i++) {
      var r = (i % 2 === 0) ? outerR : innerR;
      var a = (Math.PI / teeth) * i - Math.PI / 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  }

  // Rounded-rect as a small path DSL: ['M',x,y] ['L',x,y]
  // ['Q',cx,cy,x,y] ['C',c1x,c1y,c2x,c2y,x,y] ['Z']
  function roundedRectSegments(x0, y0, x1, y1, r) {
    return [
      ["M", x0 + r, y0],
      ["L", x1 - r, y0],
      ["Q", x1, y0, x1, y0 + r],
      ["L", x1, y1 - r],
      ["Q", x1, y1, x1 - r, y1],
      ["L", x0 + r, y1],
      ["Q", x0, y1, x0, y1 - r],
      ["L", x0, y0 + r],
      ["Q", x0, y0, x0 + r, y0],
      ["Z"]
    ];
  }

  /* ---- generic canvas interpreter ---- */

  function pathSegmentsToCanvas(ctx, segs, cx, cy, size) {
    segs.forEach(function (seg) {
      var t = seg[0], p, c, c2;
      if (t === "M") { p = tx([seg[1], seg[2]], cx, cy, size); ctx.moveTo(p[0], p[1]); }
      else if (t === "L") { p = tx([seg[1], seg[2]], cx, cy, size); ctx.lineTo(p[0], p[1]); }
      else if (t === "Q") { c = tx([seg[1], seg[2]], cx, cy, size); p = tx([seg[3], seg[4]], cx, cy, size); ctx.quadraticCurveTo(c[0], c[1], p[0], p[1]); }
      else if (t === "C") { c = tx([seg[1], seg[2]], cx, cy, size); c2 = tx([seg[3], seg[4]], cx, cy, size); p = tx([seg[5], seg[6]], cx, cy, size); ctx.bezierCurveTo(c[0], c[1], c2[0], c2[1], p[0], p[1]); }
      else if (t === "Z") { ctx.closePath(); }
    });
  }

  function addSubpathToCanvas(ctx, part, cx, cy, size) {
    if (part.kind === "polygon") {
      part.points.forEach(function (p, i) {
        var a = tx(p, cx, cy, size);
        if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
      });
      ctx.closePath();
    } else if (part.kind === "circle") {
      var c = tx([part.cx, part.cy], cx, cy, size);
      var r = part.r * size;
      ctx.moveTo(c[0] + r, c[1]);
      ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    } else if (part.kind === "path") {
      pathSegmentsToCanvas(ctx, part.segments, cx, cy, size);
    }
  }

  function drawDescriptor(ctx, cx, cy, size, color, desc) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (desc.kind === "circle") {
      var c = tx([desc.cx, desc.cy], cx, cy, size);
      var r = desc.r * size;
      ctx.beginPath();
      ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
      if (desc.mode === "stroke") { ctx.lineWidth = size * desc.strokeWidthRatio; ctx.stroke(); }
      else ctx.fill();
    } else if (desc.kind === "polygon") {
      ctx.beginPath();
      addSubpathToCanvas(ctx, desc, cx, cy, size);
      ctx.fill();
    } else if (desc.kind === "path") {
      ctx.beginPath();
      pathSegmentsToCanvas(ctx, desc.segments, cx, cy, size);
      ctx.fill();
    } else if (desc.kind === "composite") {
      ctx.beginPath();
      desc.parts.forEach(function (part) { addSubpathToCanvas(ctx, part, cx, cy, size); });
      ctx.fill(desc.fillRule || "nonzero");
    }
    ctx.restore();
  }

  /* ---- generic SVG interpreter (same descriptors, same transform math) ---- */

  function pathSegmentsToD(segs, cx, cy, size) {
    return segs.map(function (seg) {
      var t = seg[0], p, c, c2;
      if (t === "M") { p = tx([seg[1], seg[2]], cx, cy, size); return "M " + n(p[0]) + " " + n(p[1]); }
      if (t === "L") { p = tx([seg[1], seg[2]], cx, cy, size); return "L " + n(p[0]) + " " + n(p[1]); }
      if (t === "Q") { c = tx([seg[1], seg[2]], cx, cy, size); p = tx([seg[3], seg[4]], cx, cy, size); return "Q " + n(c[0]) + " " + n(c[1]) + " " + n(p[0]) + " " + n(p[1]); }
      if (t === "C") { c = tx([seg[1], seg[2]], cx, cy, size); c2 = tx([seg[3], seg[4]], cx, cy, size); p = tx([seg[5], seg[6]], cx, cy, size); return "C " + n(c[0]) + " " + n(c[1]) + " " + n(c2[0]) + " " + n(c2[1]) + " " + n(p[0]) + " " + n(p[1]); }
      return "Z";
    }).join(" ");
  }

  function subpathToD(part, cx, cy, size) {
    if (part.kind === "polygon") {
      var d = part.points.map(function (p, i) {
        var a = tx(p, cx, cy, size);
        return (i === 0 ? "M " : "L ") + n(a[0]) + " " + n(a[1]);
      }).join(" ");
      return d + " Z";
    }
    if (part.kind === "circle") {
      var c = tx([part.cx, part.cy], cx, cy, size);
      var r = part.r * size;
      // Two-arc full-circle trick so it works as one path subpath.
      return "M " + n(c[0] + r) + " " + n(c[1]) +
        " A " + n(r) + " " + n(r) + " 0 1 0 " + n(c[0] - r) + " " + n(c[1]) +
        " A " + n(r) + " " + n(r) + " 0 1 0 " + n(c[0] + r) + " " + n(c[1]) + " Z";
    }
    return pathSegmentsToD(part.segments, cx, cy, size);
  }

  function svgDescriptor(cx, cy, size, color, desc) {
    if (desc.kind === "circle") {
      var c = tx([desc.cx, desc.cy], cx, cy, size);
      var r = desc.r * size;
      if (desc.mode === "stroke") {
        return '<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n(r) + '" fill="none" stroke="' + color + '" stroke-width="' + n(size * desc.strokeWidthRatio) + '"/>';
      }
      return '<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n(r) + '" fill="' + color + '"/>';
    }
    if (desc.kind === "polygon") {
      var pts = desc.points.map(function (p) { var a = tx(p, cx, cy, size); return n(a[0]) + "," + n(a[1]); }).join(" ");
      return '<polygon points="' + pts + '" fill="' + color + '"/>';
    }
    if (desc.kind === "path") {
      return '<path d="' + pathSegmentsToD(desc.segments, cx, cy, size) + '" fill="' + color + '"/>';
    }
    if (desc.kind === "composite") {
      var d = desc.parts.map(function (part) { return subpathToD(part, cx, cy, size); }).join(" ");
      return '<path d="' + d + '" fill="' + color + '" fill-rule="' + (desc.fillRule || "nonzero") + '"/>';
    }
    return "";
  }

  function escapeXml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
    });
  }

  function computeContrastColor(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#1f1c17");
    if (!m) return "#ffffff";
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#1f1c17" : "#ffffff";
  }

  /* ------------------------------------------------------------------
     Icon presets (data only — 16 shapes). Each entry names a descriptor
     for the generic renderers above. "letter-badge-circle" is the one
     icon that also needs a text glyph, so it composes the generic circle
     renderer with a small text step of its own.
     ------------------------------------------------------------------ */
  var ICON_LIST = [
    { id: "circle", label: "Circle", desc: { kind: "circle", cx: 0, cy: 0, r: 0.5, mode: "fill" } },
    { id: "ring", label: "Ring", desc: { kind: "circle", cx: 0, cy: 0, r: 0.4, mode: "stroke", strokeWidthRatio: 0.16 } },
    { id: "hexagon", label: "Hexagon", desc: { kind: "polygon", points: hexPoints(0.5) } },
    { id: "diamond", label: "Diamond", desc: { kind: "polygon", points: [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]] } },
    { id: "triangle", label: "Triangle", desc: { kind: "polygon", points: [[0, -0.5], [0.5, 0.4], [-0.5, 0.4]] } },
    { id: "mountain", label: "Mountain", desc: { kind: "polygon", points: [[-0.5, 0.35], [-0.22, -0.15], [-0.05, 0.05], [0.18, -0.4], [0.42, 0.05], [0.5, 0.35]] } },
    { id: "star", label: "Star", desc: { kind: "polygon", points: starPoints(0.5, 0.2, 5) } },
    { id: "shield", label: "Shield", desc: { kind: "path", segments: [["M", -0.4, -0.45], ["L", 0.4, -0.45], ["L", 0.4, 0.05], ["Q", 0.4, 0.35, 0, 0.5], ["Q", -0.4, 0.35, -0.4, 0.05], ["Z"]] } },
    { id: "bolt", label: "Bolt", desc: { kind: "polygon", points: [[0.05, -0.5], [-0.35, 0.05], [-0.05, 0.05], [-0.15, 0.5], [0.35, -0.1], [0.05, -0.1]] } },
    { id: "leaf", label: "Leaf", desc: { kind: "path", segments: [["M", 0, 0.5], ["C", -0.5, 0.4, -0.5, -0.4, 0, -0.5], ["C", 0.5, -0.4, 0.5, 0.4, 0, 0.5], ["Z"]] } },
    { id: "wave", label: "Wave", desc: { kind: "path", segments: [["M", -0.5, 0.1], ["C", -0.3, -0.35, -0.1, -0.35, 0, 0.1], ["C", 0.1, 0.35, 0.3, 0.35, 0.5, -0.1], ["L", 0.5, 0.5], ["L", -0.5, 0.5], ["Z"]] } },
    { id: "speech-bubble", label: "Speech bubble", desc: { kind: "composite", fillRule: "nonzero", parts: [{ kind: "path", segments: roundedRectSegments(-0.5, -0.5, 0.5, 0.22, 0.12) }, { kind: "polygon", points: [[-0.12, 0.18], [0.12, 0.18], [-0.22, 0.48]] }] } },
    { id: "gear", label: "Gear", desc: { kind: "composite", fillRule: "evenodd", parts: [{ kind: "polygon", points: gearPoints(8, 0.5, 0.38) }, { kind: "circle", cx: 0, cy: 0, r: 0.16 }] } },
    { id: "monogram-frame", label: "Frame", desc: { kind: "composite", fillRule: "evenodd", parts: [{ kind: "polygon", points: octagonPoints(0.5) }, { kind: "polygon", points: octagonPoints(0.34) }] } },
    { id: "letter-badge-circle", label: "Letter badge", isLetterBadge: true, desc: { kind: "circle", cx: 0, cy: 0, r: 0.5, mode: "fill" } },
    { id: "square-rounded", label: "Rounded square", desc: { kind: "path", segments: roundedRectSegments(-0.5, -0.5, 0.5, 0.5, 0.18) } }
  ];

  var ICONS = {};
  ICON_LIST.forEach(function (entry) {
    ICONS[entry.id] = {
      label: entry.label,
      draw: function (ctx, cx, cy, size, color, extra) {
        drawDescriptor(ctx, cx, cy, size, color, entry.desc);
        if (entry.isLetterBadge) {
          extra = extra || {};
          var letter = extra.letter || "A";
          var contrast = extra.contrastColor || "#ffffff";
          var fam = extra.fontFamilyCss || FONTS["system-ui"];
          ctx.save();
          ctx.fillStyle = contrast;
          ctx.font = "700 " + Math.round(size * 0.52) + "px " + fam;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(letter, cx, cy + size * 0.02);
          ctx.restore();
        }
      },
      svg: function (cx, cy, size, color, extra) {
        var out = svgDescriptor(cx, cy, size, color, entry.desc);
        if (entry.isLetterBadge) {
          extra = extra || {};
          var letter = extra.letter || "A";
          var contrast = extra.contrastColor || "#ffffff";
          var fam = extra.fontFamilyCss || FONTS["system-ui"];
          out += '<text x="' + n(cx) + '" y="' + n(cy + size * 0.02) + '" font-family="' + escapeXml(fam) +
            '" font-size="' + Math.round(size * 0.52) + '" font-weight="700" fill="' + contrast +
            '" text-anchor="middle" dominant-baseline="middle">' + escapeXml(letter) + "</text>";
        }
        return out;
      }
    };
  });

  /* ------------------------------------------------------------------
     Layout presets — one function shared by the canvas draw and the SVG
     export, so text/icon positions can never diverge between them.
     ------------------------------------------------------------------ */
  function getLayoutGeometry(layout, size) {
    var cx = size / 2, cy = size / 2;
    if (layout === "icon-only") {
      return { showIcon: true, showText: false, icon: { x: cx, y: cy, size: size * 0.62 } };
    }
    if (layout === "text-only") {
      return {
        showIcon: false, showText: true,
        text: { align: "center", nameX: cx, nameY: size * 0.46, nameSize: size * 0.11, tagX: cx, tagY: size * 0.58, tagSize: size * 0.045, maxWidth: size * 0.86 }
      };
    }
    if (layout === "icon-left-of-text") {
      var nameX = size * 0.46;
      return {
        showIcon: true, showText: true,
        icon: { x: size * 0.26, y: cy, size: size * 0.3 },
        text: { align: "left", nameX: nameX, nameY: size * 0.46, nameSize: size * 0.09, tagX: nameX, tagY: size * 0.58, tagSize: size * 0.04, maxWidth: size - nameX - size * 0.06 }
      };
    }
    // icon-above-text (default)
    return {
      showIcon: true, showText: true,
      icon: { x: cx, y: size * 0.36, size: size * 0.3 },
      text: { align: "center", nameX: cx, nameY: size * 0.66, nameSize: size * 0.09, tagX: cx, tagY: size * 0.74, tagSize: size * 0.04, maxWidth: size * 0.86 }
    };
  }

  // A hidden, never-appended canvas used purely for text measurement, so
  // the canvas paint routine and the SVG export can shrink long brand
  // names to the same font size instead of drifting apart (§6).
  var measureCanvas = document.createElement("canvas");
  var measureCtx = measureCanvas.getContext("2d");

  function measureSpacedWidth(text, weight, fontSize, family, spacing) {
    measureCtx.font = weight + " " + Math.round(fontSize) + "px " + family;
    var chars = text.split("");
    var w = chars.reduce(function (sum, c) { return sum + measureCtx.measureText(c).width; }, 0);
    return w + spacing * (chars.length - 1);
  }

  // Shrinks a base font size just enough for `text` (at the given
  // letter-spacing) to fit within maxWidth, with a floor so text never
  // vanishes. Pure function — same inputs, same output, on both the
  // canvas path and the SVG path.
  function fitFontSize(text, weight, baseSize, family, spacing, maxWidth) {
    if (!text || !maxWidth) return baseSize;
    var w = measureSpacedWidth(text, weight, baseSize, family, spacing);
    if (w <= maxWidth) return baseSize;
    var scale = Math.max(maxWidth / w, 0.35);
    return baseSize * scale;
  }

  /* ------------------------------------------------------------------
     Text with manual letter-spacing — implemented once, used by both the
     canvas preview/export and (via the equivalent SVG attribute below)
     kept visually equivalent for the vector export. Manual spacing is
     used on canvas rather than the newer `ctx.letterSpacing` property so
     this keeps working the same way in older engines opened via file://.
     ------------------------------------------------------------------ */
  function drawSpacedText(ctx, text, x, y, spacing, align) {
    if (!text) return;
    var chars = text.split("");
    var widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var startX = align === "center" ? x - total / 2 : (align === "right" ? x - total : x);
    var cx = startX;
    var prevAlign = ctx.textAlign;
    ctx.textAlign = "left";
    chars.forEach(function (c, i) {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
    ctx.textAlign = prevAlign;
  }

  /* ------------------------------------------------------------------
     ONE shared paint routine (§6) — used by the live preview canvas and
     the export canvas alike. Never draw them differently.
     ------------------------------------------------------------------ */
  function drawLogo(ctx, state, size) {
    ctx.clearRect(0, 0, size, size);

    if (state.bgMode === "solid") {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, size, size);
    }
    // else: transparent — leave the canvas untouched, no background fill.

    var geo = getLayoutGeometry(state.layout, size);
    var fam = FONTS[state.fontFamily] || FONTS["system-ui"];

    if (geo.showIcon) {
      var extra = {
        letter: (state.name || "A").trim().charAt(0).toUpperCase() || "A",
        contrastColor: computeContrastColor(state.iconColor),
        fontFamilyCss: fam
      };
      ICONS[state.icon].draw(ctx, geo.icon.x, geo.icon.y, geo.icon.size, state.iconColor, extra);
    }

    if (geo.showText) {
      ctx.textBaseline = "middle";
      ctx.fillStyle = state.textColor;

      if (state.name) {
        var nameFontSize = fitFontSize(state.name, state.fontWeight, geo.text.nameSize, fam, state.letterSpacing, geo.text.maxWidth);
        ctx.font = state.fontWeight + " " + Math.round(nameFontSize) + "px " + fam;
        drawSpacedText(ctx, state.name, geo.text.nameX, geo.text.nameY, state.letterSpacing, geo.text.align);
      }
      if (state.tagline) {
        var tagSpacing = state.letterSpacing * 0.6;
        var tagFontSize = fitFontSize(state.tagline, "400", geo.text.tagSize, fam, tagSpacing, geo.text.maxWidth);
        ctx.font = "400 " + Math.round(tagFontSize) + "px " + fam;
        drawSpacedText(ctx, state.tagline, geo.text.tagX, geo.text.tagY, tagSpacing, geo.text.align);
      }
    }
  }

  /* ------------------------------------------------------------------
     SVG export — re-derives the same icon shapes as real SVG elements
     (via the shared descriptor + geometry) and a real <text> element for
     the name, per STANDARDS.md §6 (no rasterized <image> embed).
     ------------------------------------------------------------------ */
  function buildSvgText(text, x, y, fam, weight, size, spacing, color, align) {
    var anchor = align === "center" ? "middle" : (align === "right" ? "end" : "start");
    return '<text x="' + n(x) + '" y="' + n(y) + '" font-family="' + escapeXml(fam) + '" font-size="' + Math.round(size) +
      '" font-weight="' + weight + '" letter-spacing="' + n(spacing) + '" fill="' + color +
      '" text-anchor="' + anchor + '" dominant-baseline="middle">' + escapeXml(text) + "</text>";
  }

  function buildSvg(state, size) {
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '">');
    if (state.bgMode === "solid") {
      parts.push('<rect width="' + size + '" height="' + size + '" fill="' + state.bgColor + '"/>');
    }
    var geo = getLayoutGeometry(state.layout, size);
    var fam = FONTS[state.fontFamily] || FONTS["system-ui"];

    if (geo.showIcon) {
      var extra = {
        letter: (state.name || "A").trim().charAt(0).toUpperCase() || "A",
        contrastColor: computeContrastColor(state.iconColor),
        fontFamilyCss: fam
      };
      parts.push(ICONS[state.icon].svg(geo.icon.x, geo.icon.y, geo.icon.size, state.iconColor, extra));
    }

    if (geo.showText) {
      if (state.name) {
        var nameFontSize = fitFontSize(state.name, state.fontWeight, geo.text.nameSize, fam, state.letterSpacing, geo.text.maxWidth);
        parts.push(buildSvgText(state.name, geo.text.nameX, geo.text.nameY, fam, state.fontWeight, nameFontSize, state.letterSpacing, state.textColor, geo.text.align));
      }
      if (state.tagline) {
        var tagSpacing = state.letterSpacing * 0.6;
        var tagFontSize = fitFontSize(state.tagline, "400", geo.text.tagSize, fam, tagSpacing, geo.text.maxWidth);
        parts.push(buildSvgText(state.tagline, geo.text.tagX, geo.text.tagY, fam, "400", tagFontSize, tagSpacing, state.textColor, geo.text.align));
      }
    }

    parts.push("</svg>");
    return parts.join("\n");
  }

  /* ------------------------------------------------------------------
     State + DOM wiring
     ------------------------------------------------------------------ */
  var state = {
    icon: "circle",
    layout: "icon-left-of-text",
    name: "Acme Studio",
    tagline: "",
    fontFamily: "system-ui",
    fontWeight: "700",
    letterSpacing: 2,
    iconColor: "#1f1c17",
    textColor: "#1f1c17",
    bgMode: "transparent",
    bgColor: "#ffffff",
    format: "png"
  };

  var els = {
    canvas: $("lm-canvas"),
    name: $("lm-name"),
    tagline: $("lm-tagline"),
    fontFamily: $("lm-font-family"),
    fontWeight: $("lm-font-weight"),
    letterSpacing: $("lm-letter-spacing"),
    letterSpacingVal: $("lm-letter-spacing-val"),
    iconGrid: $("lm-icon-grid"),
    download: $("lm-download")
  };

  var ctx = els.canvas.getContext("2d");

  function render() {
    drawLogo(ctx, state, CANVAS_SIZE);
  }

  /* ---- pill tabs (section switcher) ---- */
  function wireTabs(buttons, onSelect) {
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.toggle("is-active", b === button);
          b.setAttribute("aria-selected", b === button ? "true" : "false");
        });
        onSelect(button);
      });
    });
  }

  wireTabs($$("[data-section-tabs] .lm-tab"), function (button) {
    var section = button.getAttribute("data-section");
    $$(".lm-pane").forEach(function (pane) {
      pane.classList.toggle("is-active", pane.getAttribute("data-section-pane") === section);
    });
  });

  wireTabs($$("[data-format-tabs] .lm-tab"), function (button) {
    state.format = button.getAttribute("data-format");
  });

  /* ---- build the icon-shape choice-card grid from ICON_LIST — the
     miniature is a real inline <svg> built from icon.svg(), the exact
     same generator the canvas uses, so it can never show something the
     tool doesn't actually draw. ---- */
  function buildIconGrid() {
    ICON_LIST.forEach(function (entry) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "lm-choice-card" + (entry.id === state.icon ? " is-active" : "");
      card.setAttribute("data-value", entry.id);

      var mini = document.createElement("span");
      mini.className = "lm-icon-mini";
      var previewExtra = { letter: "A", contrastColor: "#ffffff", fontFamilyCss: FONTS["system-ui"] };
      var inner = ICONS[entry.id].svg(12, 12, 18, "#2a2620", previewExtra);
      mini.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24">' + inner + "</svg>";

      var label = document.createElement("span");
      label.textContent = entry.label;

      card.appendChild(mini);
      card.appendChild(label);
      card.addEventListener("click", function () {
        $$(".lm-choice-card", els.iconGrid).forEach(function (c) { c.classList.toggle("is-active", c === card); });
        state.icon = entry.id;
        render();
      });
      els.iconGrid.appendChild(card);
    });
  }
  buildIconGrid();

  /* ---- layout choice cards (static in HTML) ---- */
  $$('[data-choice="layout"] .lm-choice-card').forEach(function (card) {
    card.addEventListener("click", function () {
      $$('[data-choice="layout"] .lm-choice-card').forEach(function (c) { c.classList.toggle("is-active", c === card); });
      state.layout = card.getAttribute("data-value");
      render();
    });
  });

  /* ---- swatch rows (icon / text / bg color) + custom color input ---- */
  $$("[data-swatches]").forEach(function (row) {
    var key = row.getAttribute("data-swatches"); // "icon" | "text" | "bg"
    $$(".lm-swatch", row).forEach(function (swatch) {
      if (swatch.classList.contains("lm-swatch--custom")) return;
      swatch.addEventListener("click", function () {
        $$(".lm-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
        swatch.classList.add("is-active");
        applyColor(key, swatch.getAttribute("data-value"));
      });
    });
  });

  $$("[data-custom-for]").forEach(function (wrap) {
    var key = wrap.getAttribute("data-custom-for");
    var input = $$("input[type=color]", wrap)[0];
    input.addEventListener("input", function () {
      var row = wrap.closest("[data-swatches]");
      if (row) $$(".lm-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
      wrap.classList.add("is-active");
      applyColor(key, input.value);
    });
  });

  function applyColor(key, value) {
    if (key === "icon") state.iconColor = value;
    else if (key === "text") state.textColor = value;
    else if (key === "bg") state.bgColor = value;
    render();
  }

  /* ---- background transparent/solid toggle ---- */
  $$("[data-fill-mode]").forEach(function (toggle) {
    var key = toggle.getAttribute("data-fill-mode"); // "bg"
    $$(".lm-mode-btn", toggle).forEach(function (button) {
      button.addEventListener("click", function () {
        $$(".lm-mode-btn", toggle).forEach(function (b) { b.classList.toggle("is-active", b === button); });
        var mode = button.getAttribute("data-mode");
        state.bgMode = mode;
        var panel = document.querySelector('[data-fill-panel="' + key + "-solid" + '"]');
        if (panel) panel.hidden = mode !== "solid";
        render();
      });
    });
  });

  /* ---- text fields ---- */
  els.name.addEventListener("input", function () { state.name = els.name.value; render(); });
  els.tagline.addEventListener("input", function () { state.tagline = els.tagline.value; render(); });
  els.fontFamily.addEventListener("change", function () { state.fontFamily = els.fontFamily.value; render(); });
  els.fontWeight.addEventListener("change", function () { state.fontWeight = els.fontWeight.value; render(); });
  els.letterSpacing.addEventListener("input", function () {
    state.letterSpacing = parseInt(els.letterSpacing.value, 10) || 0;
    els.letterSpacingVal.textContent = state.letterSpacing + "px";
    render();
  });

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */
  function triggerDownload(url, filename) {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadPng() {
    // Re-render into a fresh export-sized canvas via the SAME paint
    // routine the preview uses — never a separate drawing path (§6).
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = CANVAS_SIZE;
    exportCanvas.height = CANVAS_SIZE;
    var exportCtx = exportCanvas.getContext("2d");
    drawLogo(exportCtx, state, CANVAS_SIZE);
    exportCanvas.toBlob(function (blob) {
      if (!blob) return;
      triggerDownload(URL.createObjectURL(blob), safeFilename() + ".png");
    }, "image/png");
  }

  function downloadSvg() {
    var svg = buildSvg(state, CANVAS_SIZE);
    var blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), safeFilename() + ".svg");
  }

  function safeFilename() {
    var base = (state.name || "logo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return base || "logo";
  }

  els.download.addEventListener("click", function () {
    if (state.format === "svg") downloadSvg();
    else downloadPng();
  });

  /* ---- initial paint ---- */
  render();
})();
