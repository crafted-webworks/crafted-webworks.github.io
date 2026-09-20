/* ==========================================================================
   Gradient & Palette Studio — fully self-contained.
   Everything runs in the browser: nothing is uploaded, nothing is fetched
   at runtime, no external library is used anywhere in this file.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------
     Shared helpers — tabs, clipboard, download
     ------------------------------------------------------------------ */
  function wireTabs(buttons, onSelect) {
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.toggle("is-active", b === button);
          b.setAttribute("aria-selected", String(b === button));
        });
        onSelect(button);
      });
    });
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (cb) cb(ok);
  }

  function copyText(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { if (cb) cb(true); },
        function () { fallbackCopy(text, cb); }
      );
    } else {
      fallbackCopy(text, cb);
    }
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadPaletteAsPng(colors, filename) {
    if (!colors || !colors.length) return;
    var swWidth = 160, swHeight = 160, labelHeight = 40;
    var canvas = document.createElement("canvas");
    canvas.width = swWidth * colors.length;
    canvas.height = swHeight + labelHeight;
    var c = canvas.getContext("2d");
    colors.forEach(function (hex, i) {
      c.fillStyle = hex;
      c.fillRect(i * swWidth, 0, swWidth, swHeight);
      c.fillStyle = "#17140f";
      c.fillRect(i * swWidth, swHeight, swWidth, labelHeight);
      c.fillStyle = "#f6f4f0";
      c.font = "14px monospace";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(hex.toUpperCase(), i * swWidth + swWidth / 2, swHeight + labelHeight / 2);
    });
    canvas.toBlob(function (blob) {
      if (blob) triggerDownload(blob, filename);
    }, "image/png");
  }

  /* ------------------------------------------------------------------
     Color math — hex <-> HSL, implemented by hand (no library).
     ------------------------------------------------------------------ */
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex(r, g, b) {
    var toHex = function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"); };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r1, g1, b1;
    if (h < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }

  function hexToHsl(hex) {
    var rgb = hexToRgb(hex);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  function hslToHex(h, s, l) {
    var rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  /* Five-color harmony recipes — real HSL hue rotation math, no library.
     Each returns 5 {h,s,l} entries derived from the base color's own
     hue/saturation/lightness. */
  var HARMONIES = {
    complementary: function (base) {
      var h2 = (base.h + 180) % 360;
      return [
        { h: base.h, s: base.s, l: clamp(base.l - 20, 8, 92) },
        { h: base.h, s: base.s, l: base.l },
        { h: base.h, s: base.s, l: clamp(base.l + 20, 8, 92) },
        { h: h2, s: base.s, l: clamp(base.l - 10, 8, 92) },
        { h: h2, s: base.s, l: clamp(base.l + 10, 8, 92) }
      ];
    },
    analogous: function (base) {
      return [-30, -15, 0, 15, 30].map(function (d) {
        return { h: (base.h + d + 360) % 360, s: base.s, l: base.l };
      });
    },
    triadic: function (base) {
      var h2 = (base.h + 120) % 360, h3 = (base.h + 240) % 360;
      return [
        { h: base.h, s: base.s, l: clamp(base.l - 15, 8, 92) },
        { h: base.h, s: base.s, l: base.l },
        { h: h2, s: base.s, l: base.l },
        { h: h3, s: base.s, l: base.l },
        { h: h3, s: base.s, l: clamp(base.l + 15, 8, 92) }
      ];
    },
    monochromatic: function (base) {
      return [-30, -15, 0, 15, 30].map(function (d) {
        return { h: base.h, s: base.s, l: clamp(base.l + d, 6, 94) };
      });
    },
    splitComplementary: function (base) {
      var h2 = (base.h + 150) % 360, h3 = (base.h + 210) % 360;
      return [
        { h: base.h, s: base.s, l: clamp(base.l - 10, 8, 92) },
        { h: base.h, s: base.s, l: clamp(base.l + 10, 8, 92) },
        { h: h2, s: base.s, l: base.l },
        { h: h3, s: base.s, l: base.l },
        { h: h3, s: base.s, l: clamp(base.l + 15, 8, 92) }
      ];
    }
  };

  function generatePalette(baseHex, harmonyName) {
    var base = hexToHsl(baseHex);
    var recipe = HARMONIES[harmonyName] || HARMONIES.complementary;
    return recipe(base).map(function (c) { return hslToHex(c.h, c.s, c.l); });
  }

  /* ------------------------------------------------------------------
     Shared palette-strip renderer — used by both the harmony generator
     output and the image-extraction output, so the swatch markup and
     click-to-copy behavior can never drift between the two features.
     ------------------------------------------------------------------ */
  function renderPaletteStrip(container, colors) {
    container.innerHTML = "";
    colors.forEach(function (hex) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gps-palette-swatch";
      btn.setAttribute("aria-label", "Copy " + hex);

      var block = document.createElement("span");
      block.className = "gps-palette-swatch-color";
      block.style.background = hex;

      var label = document.createElement("span");
      label.className = "gps-palette-swatch-hex";
      var hexText = document.createElement("span");
      hexText.textContent = hex.toUpperCase();
      var copiedTag = document.createElement("span");
      copiedTag.className = "gps-copied";
      copiedTag.textContent = "Copied";
      label.appendChild(hexText);
      label.appendChild(copiedTag);

      btn.appendChild(block);
      btn.appendChild(label);

      btn.addEventListener("click", function () {
        copyText(hex, function (ok) {
          if (!ok) return;
          btn.classList.add("is-copied");
          setTimeout(function () { btn.classList.remove("is-copied"); }, 1200);
        });
      });

      container.appendChild(btn);
    });
  }

  /* ==========================================================================
     Mode tabs (Gradient Builder / Palette Generator / Extract from Image)
     ========================================================================== */
  var modeTabs = $$("[data-mode-tabs] [data-mode]");
  var modePanes = $$("[data-mode-pane]");

  wireTabs(modeTabs, function (button) {
    var mode = button.getAttribute("data-mode");
    modePanes.forEach(function (pane) {
      pane.classList.toggle("is-active", pane.getAttribute("data-mode-pane") === mode);
    });
  });

  /* ==========================================================================
     Gradient Builder
     ========================================================================== */
  var gEls = {
    stopsBar: $("gps-stops-bar"),
    stopsTrack: $("gps-stops-track"),
    addStop: $("gps-add-stop"),
    stopSwatches: $("gps-stop-swatches"),
    stopColor: $("gps-stop-color"),
    stopPos: $("gps-stop-pos"),
    removeStop: $("gps-remove-stop"),
    copyCss: $("gps-copy-css"),
    cssStatus: $("gps-css-status"),
    previewBox: $("gps-preview-box"),
    cssOutput: $("gps-css-output"),
    angleField: document.querySelector("[data-angle-field]"),
    shapeField: document.querySelector("[data-shape-field]"),
    angleFace: document.querySelector('[data-angle-dial="grad"] .gps-angle-face'),
    angleValue: document.querySelector('[data-angle-value="grad"]')
  };

  var stopIdCounter = 2;
  var gradient = {
    type: "linear",
    angle: 90,
    shape: "circle",
    stops: [
      { id: 1, color: "#2b7fff", pos: 0 },
      { id: 2, color: "#e2972e", pos: 100 }
    ],
    selectedStopId: 1
  };

  function sortedStops(stops) {
    return stops.slice().sort(function (a, b) { return a.pos - b.pos; });
  }

  /* The one stop-resolution function — both the editable stops bar and
     the real preview/copy-CSS output build their color-stop list from
     this, so they can never drift out of sync with each other. */
  function stopsCssList(stops) {
    return sortedStops(stops).map(function (s) { return s.color + " " + Math.round(s.pos) + "%"; }).join(", ");
  }

  /* The one paint routine for the actual gradient output — reused by the
     live preview box and by the copy-CSS button. */
  function buildGradientCss(g) {
    var stopsStr = stopsCssList(g.stops);
    if (g.type === "radial") {
      return "radial-gradient(" + g.shape + ", " + stopsStr + ")";
    }
    return "linear-gradient(" + Math.round(g.angle) + "deg, " + stopsStr + ")";
  }

  function getSelectedStop() {
    var found = null;
    gradient.stops.forEach(function (s) { if (s.id === gradient.selectedStopId) found = s; });
    return found || gradient.stops[0];
  }

  function renderStopHandles() {
    $$(".gps-stop-handle", gEls.stopsBar).forEach(function (el) { el.remove(); });
    gradient.stops.forEach(function (stop) {
      var handle = document.createElement("div");
      handle.className = "gps-stop-handle" + (stop.id === gradient.selectedStopId ? " is-active" : "");
      handle.style.left = stop.pos + "%";
      handle.style.setProperty("--stop-color", stop.color);
      handle.setAttribute("data-stop-id", String(stop.id));
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("role", "slider");
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", "100");
      handle.setAttribute("aria-valuenow", String(Math.round(stop.pos)));
      handle.setAttribute("aria-label", "Gradient stop at " + Math.round(stop.pos) + "%");
      gEls.stopsBar.appendChild(handle);
    });
  }

  function updateStopEditorUi() {
    var stop = getSelectedStop();
    if (!stop) return;
    gEls.stopPos.value = Math.round(stop.pos);
    gEls.stopColor.value = stop.color;
    $$(".gps-swatch[data-value]", gEls.stopSwatches).forEach(function (sw) {
      sw.classList.toggle("is-active", sw.getAttribute("data-value").toLowerCase() === stop.color.toLowerCase());
    });
    gEls.removeStop.disabled = gradient.stops.length <= 2;
  }

  function redrawGradient() {
    renderStopHandles();
    updateStopEditorUi();

    /* Editing affordance: the stops bar always shows stops left-to-right
       regardless of the chosen angle/shape, so dragging stays intuitive.
       It reuses the same stopsCssList the real output uses. */
    gEls.stopsTrack.style.background = "linear-gradient(to right, " + stopsCssList(gradient.stops) + ")";

    var css = buildGradientCss(gradient);
    gEls.previewBox.style.background = css;
    gEls.cssOutput.textContent = "background: " + css + ";";
  }

  /* ---- Gradient type (linear/radial) + radial shape choice cards ---- */
  $$("[data-choice]").forEach(function (group) {
    var key = group.getAttribute("data-choice");
    $$(".gps-choice-card", group).forEach(function (card) {
      card.addEventListener("click", function () {
        $$(".gps-choice-card", group).forEach(function (c) { c.classList.toggle("is-active", c === card); });
        var value = card.getAttribute("data-value");
        if (key === "gradType") {
          gradient.type = value;
          gEls.angleField.hidden = value === "radial";
          gEls.shapeField.hidden = value !== "radial";
        } else if (key === "radialShape") {
          gradient.shape = value;
        }
        redrawGradient();
      });
    });
  });

  /* ---- Angle dial — atan2(dy, dx), 0deg = east, clockwise ---- */
  (function wireAngleDial() {
    var face = gEls.angleFace;
    if (!face) return;

    function setAngle(angle) {
      angle = ((Math.round(angle) % 360) + 360) % 360;
      gradient.angle = angle;
      face.style.setProperty("--angle", angle + "deg");
      face.setAttribute("aria-valuenow", String(angle));
      if (gEls.angleValue) gEls.angleValue.textContent = angle + "°";
      redrawGradient();
    }

    function angleFromPoint(clientX, clientY) {
      var rect = face.getBoundingClientRect();
      var dx = clientX - (rect.left + rect.width / 2);
      var dy = clientY - (rect.top + rect.height / 2);
      return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    face.addEventListener("pointerdown", function (event) {
      face.setPointerCapture(event.pointerId);
      setAngle(angleFromPoint(event.clientX, event.clientY));

      function onMove(moveEvent) { setAngle(angleFromPoint(moveEvent.clientX, moveEvent.clientY)); }
      function onUp() { face.removeEventListener("pointermove", onMove); }

      face.addEventListener("pointermove", onMove);
      face.addEventListener("pointerup", onUp, { once: true });
      face.addEventListener("pointercancel", onUp, { once: true });
    });

    face.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") { setAngle(gradient.angle + 15); event.preventDefault(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { setAngle(gradient.angle - 15); event.preventDefault(); }
    });

    face.style.setProperty("--angle", gradient.angle + "deg");
  })();

  /* ---- Dragging stops along the bar ---- */
  (function wireStopDragging() {
    var draggingId = null;

    function posFromPoint(clientX) {
      var rect = gEls.stopsBar.getBoundingClientRect();
      var pct = ((clientX - rect.left) / rect.width) * 100;
      return clamp(Math.round(pct), 0, 100);
    }

    gEls.stopsBar.addEventListener("pointerdown", function (event) {
      var handle = event.target.closest(".gps-stop-handle");
      if (!handle) return;
      var id = parseInt(handle.getAttribute("data-stop-id"), 10);
      draggingId = id;
      gradient.selectedStopId = id;
      gEls.stopsBar.setPointerCapture(event.pointerId);
      redrawGradient();

      function onMove(moveEvent) {
        if (draggingId == null) return;
        var stop = gradient.stops.filter(function (s) { return s.id === draggingId; })[0];
        if (!stop) return;
        stop.pos = posFromPoint(moveEvent.clientX);
        redrawGradient();
      }
      function onUp() {
        draggingId = null;
        gEls.stopsBar.removeEventListener("pointermove", onMove);
      }

      gEls.stopsBar.addEventListener("pointermove", onMove);
      gEls.stopsBar.addEventListener("pointerup", onUp, { once: true });
      gEls.stopsBar.addEventListener("pointercancel", onUp, { once: true });
    });
  })();

  /* ---- Selected-stop editor: preset swatches, custom swatch, position ---- */
  $$(".gps-swatch[data-value]", gEls.stopSwatches).forEach(function (swatch) {
    swatch.addEventListener("click", function () {
      var stop = getSelectedStop();
      stop.color = swatch.getAttribute("data-value");
      redrawGradient();
    });
  });

  gEls.stopColor.addEventListener("input", function () {
    var stop = getSelectedStop();
    stop.color = gEls.stopColor.value;
    redrawGradient();
  });

  gEls.stopPos.addEventListener("input", function () {
    var stop = getSelectedStop();
    var value = parseInt(gEls.stopPos.value, 10);
    if (isNaN(value)) return;
    stop.pos = clamp(value, 0, 100);
    redrawGradient();
  });

  gEls.addStop.addEventListener("click", function () {
    stopIdCounter += 1;
    var sorted = sortedStops(gradient.stops);
    var last = sorted[sorted.length - 1];
    var newPos = clamp(Math.round((last ? last.pos : 100) / 2 + 25), 0, 100);
    var newStop = { id: stopIdCounter, color: (last ? last.color : "#ffffff"), pos: newPos };
    gradient.stops.push(newStop);
    gradient.selectedStopId = newStop.id;
    redrawGradient();
  });

  gEls.removeStop.addEventListener("click", function () {
    if (gradient.stops.length <= 2) return;
    gradient.stops = gradient.stops.filter(function (s) { return s.id !== gradient.selectedStopId; });
    gradient.selectedStopId = gradient.stops[0].id;
    redrawGradient();
  });

  gEls.copyCss.addEventListener("click", function () {
    var css = "background: " + buildGradientCss(gradient) + ";";
    copyText(css, function (ok) {
      gEls.cssStatus.textContent = ok ? "Copied to clipboard." : "Could not copy — select and copy manually.";
      gEls.cssStatus.classList.toggle("is-success", ok);
      gEls.cssStatus.classList.toggle("is-error", !ok);
      setTimeout(function () {
        gEls.cssStatus.textContent = "";
        gEls.cssStatus.classList.remove("is-success", "is-error");
      }, 2200);
    });
  });

  redrawGradient();

  /* ==========================================================================
     Palette Generator
     ========================================================================== */
  var pEls = {
    baseColor: $("gps-base-color"),
    generate: $("gps-generate-palette"),
    strip: $("gps-palette-strip"),
    download: $("gps-download-palette")
  };

  var paletteState = { base: "#2b7fff", harmony: "complementary", colors: [] };

  function runPaletteGeneration() {
    paletteState.colors = generatePalette(paletteState.base, paletteState.harmony);
    renderPaletteStrip(pEls.strip, paletteState.colors);
  }

  $$('[data-swatches="base"] .gps-swatch[data-value]').forEach(function (swatch) {
    swatch.addEventListener("click", function () {
      $$('[data-swatches="base"] .gps-swatch').forEach(function (s) { s.classList.remove("is-active"); });
      swatch.classList.add("is-active");
      paletteState.base = swatch.getAttribute("data-value");
      runPaletteGeneration();
    });
  });

  pEls.baseColor.addEventListener("input", function () {
    $$('[data-swatches="base"] .gps-swatch').forEach(function (s) { s.classList.remove("is-active"); });
    pEls.baseColor.closest(".gps-swatch").classList.add("is-active");
    paletteState.base = pEls.baseColor.value;
    runPaletteGeneration();
  });

  wireTabs($$("[data-harmony-tabs] [data-harmony]"), function (button) {
    paletteState.harmony = button.getAttribute("data-harmony");
    runPaletteGeneration();
  });

  pEls.generate.addEventListener("click", runPaletteGeneration);
  pEls.download.addEventListener("click", function () {
    downloadPaletteAsPng(paletteState.colors, "palette.png");
  });

  runPaletteGeneration();

  /* ==========================================================================
     Extract Palette from Image — a simple bucketed/quantized clustering
     approach: pixels are bucketed by coarsened RGB channels, the most
     populous buckets are averaged back to real colors, and near-duplicate
     results are filtered out so the final swatches read as distinct.
     ========================================================================== */
  var eEls = {
    file: $("gps-image-file"),
    label: $("gps-image-label"),
    drop: document.querySelector(".gps-drop"),
    count: $("gps-swatch-count"),
    countVal: $("gps-swatch-count-val"),
    status: $("gps-extract-status"),
    canvas: $("gps-image-canvas"),
    preview: $("gps-image-preview"),
    empty: $("gps-image-empty"),
    strip: $("gps-extract-strip"),
    download: $("gps-download-extract")
  };

  var extractState = { colors: [], image: null };

  function colorDistance(a, b) {
    var dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function extractPaletteFromImageData(imageData, count) {
    var data = imageData.data;
    var bucketSize = 32;
    var buckets = {};

    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a < 128) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var key = Math.floor(r / bucketSize) + "_" + Math.floor(g / bucketSize) + "_" + Math.floor(b / bucketSize);
      var bucket = buckets[key];
      if (!bucket) { bucket = { r: 0, g: 0, b: 0, n: 0 }; buckets[key] = bucket; }
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1;
    }

    var list = Object.keys(buckets).map(function (key) {
      var bucket = buckets[key];
      return { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n, n: bucket.n };
    });
    list.sort(function (x, y) { return y.n - x.n; });

    /* Greedily pick the most populous buckets, skipping ones too close to
       an already-chosen color — this is what keeps the final swatches
       visually distinct instead of several near-identical shades of the
       same dominant color. If the image genuinely doesn't have `count`
       distinct clusters, fewer swatches are returned rather than padding
       with duplicates. */
    var result = [];
    var minDistance = 28;
    for (var idx = 0; idx < list.length && result.length < count; idx++) {
      var candidate = list[idx];
      var tooClose = result.some(function (chosen) { return colorDistance(chosen, candidate) < minDistance; });
      if (!tooClose) result.push(candidate);
    }

    return result.map(function (c) { return rgbToHex(c.r, c.g, c.b); });
  }

  function runExtraction() {
    if (!extractState.image) return;
    var img = extractState.image;
    var maxDim = 160;
    var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));

    eEls.canvas.width = w;
    eEls.canvas.height = h;
    var ctx = eEls.canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    try {
      var imageData = ctx.getImageData(0, 0, w, h);
      var count = parseInt(eEls.count.value, 10);
      extractState.colors = extractPaletteFromImageData(imageData, count);
      renderPaletteStrip(eEls.strip, extractState.colors);
      eEls.status.textContent = "Extracted " + extractState.colors.length + " colors from the image.";
      eEls.status.classList.remove("is-error");
    } catch (error) {
      eEls.status.textContent = "Could not read this image's pixels (cross-origin restriction).";
      eEls.status.classList.add("is-error");
    }
  }

  eEls.file.addEventListener("change", function () {
    var file = eEls.file.files && eEls.file.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        extractState.image = img;
        eEls.preview.src = reader.result;
        eEls.preview.hidden = false;
        eEls.empty.hidden = true;
        eEls.drop.classList.add("has-file");
        eEls.label.textContent = file.name;
        runExtraction();
      };
      img.onerror = function () {
        eEls.status.textContent = "That file could not be read as an image.";
        eEls.status.classList.add("is-error");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  eEls.count.addEventListener("input", function () {
    eEls.countVal.textContent = eEls.count.value;
    runExtraction();
  });

  eEls.download.addEventListener("click", function () {
    downloadPaletteAsPng(extractState.colors, "extracted-palette.png");
  });
})();
