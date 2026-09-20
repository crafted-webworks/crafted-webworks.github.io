/* ==========================================================================
   PNG Brusher — a small paint app, fully self-contained (see tools/STANDARDS.md).
   Everything runs in the browser: nothing is uploaded, nothing is fetched.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    brushStyleField: $("pb-brush-style-field"),
    presetCategories: $("pb-preset-categories"),
    presetGrid: $("pb-preset-grid"),
    shapeModeField: $("pb-shape-mode-field"),
    size: $("pb-size"),
    sizeVal: $("pb-size-val"),
    opacity: $("pb-opacity"),
    opacityVal: $("pb-opacity-val"),
    spread: $("pb-spread"),
    spreadVal: $("pb-spread-val"),
    smoothing: $("pb-smoothing"),
    smoothingVal: $("pb-smoothing-val"),
    grain: $("pb-grain"),
    grainVal: $("pb-grain-val"),
    roughness: $("pb-roughness"),
    roughnessVal: $("pb-roughness-val"),
    colorCustom: $("pb-color-custom"),
    layerAdd: $("pb-layer-add"),
    layersList: $("pb-layers"),
    undo: $("pb-undo"),
    redo: $("pb-redo"),
    openFile: $("pb-open-file"),
    newW: $("pb-new-w"),
    newH: $("pb-new-h"),
    newTransparent: $("pb-new-transparent"),
    newCanvas: $("pb-new-canvas"),
    clear: $("pb-clear"),
    download: $("pb-download"),
    canvasScroll: $("pb-canvas-scroll"),
    canvasWrap: $("pb-canvas-wrap"),
    base: $("pb-base"),
    overlay: $("pb-overlay"),
    status: $("pb-status"),
    zoomOut: $("pb-zoom-out"),
    zoomIn: $("pb-zoom-in"),
    zoomFit: $("pb-zoom-fit"),
    zoomPct: $("pb-zoom-pct")
  };

  /* The base canvas is the visible DISPLAY/composite only — actual
     pixels live on each layer's own offscreen canvas, and compositeLayers()
     redraws the display from them (bottom to top, respecting visibility
     and opacity) after every change. The overlay stays what it always
     was: a same-size canvas on top, used only for a shape tool's live
     preview while dragging. */
  var baseCtx = els.base.getContext("2d", { willReadFrequently: true });
  var overlayCtx = els.overlay.getContext("2d");

  var state = {
    tool: "brush",
    brushPreset: "round",
    activeCategory: "basic",
    shapeMode: "stroke",
    color: "#111318",
    size: 8,
    opacity: 100,
    /* Universal brush-feel modifiers — unlike a preset's own params,
       these apply on top of *whichever* preset is active, so they don't
       need a special case per generator (see applyModifiers below). */
    spread: 0,
    smoothing: 0,
    grain: 0,
    roughness: 0
  };

  var EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 11s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>';
  var UP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  var DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
  var TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------
     Layers — each holds its own offscreen canvas. Undo/redo is scoped
     per layer (see History below); adding/deleting/reordering layers is
     not itself undoable — a deliberate scope line for a first version of
     layers rather than a full non-destructive history stack.
     ------------------------------------------------------------------ */
  var layers = [];
  var activeLayerId = null;
  var layerSeq = 0;

  function createLayer(name, w, h) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    layerSeq++;
    return {
      id: "layer-" + layerSeq,
      name: name || ("Layer " + layerSeq),
      canvas: canvas,
      ctx: canvas.getContext("2d", { willReadFrequently: true }),
      visible: true,
      opacity: 100
    };
  }

  function layerById(id) {
    return layers.filter(function (l) { return l.id === id; })[0];
  }

  function activeLayer() {
    return layerById(activeLayerId) || layers[0];
  }

  function compositeLayers() {
    var w = els.base.width, h = els.base.height;
    baseCtx.clearRect(0, 0, w, h);
    layers.forEach(function (layer) {
      if (!layer.visible) return;
      baseCtx.globalCompositeOperation = "source-over";
      baseCtx.globalAlpha = layer.opacity / 100;
      baseCtx.drawImage(layer.canvas, 0, 0);
    });
    baseCtx.globalAlpha = 1;
  }

  function refreshThumb(layer) {
    var canvas = els.layersList.querySelector('[data-layer-thumb="' + layer.id + '"] canvas');
    if (!canvas) return;
    var tctx = canvas.getContext("2d");
    tctx.clearRect(0, 0, canvas.width, canvas.height);
    tctx.drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);
  }

  function refreshActiveThumb() {
    var layer = activeLayer();
    if (layer) refreshThumb(layer);
  }

  function renderLayers() {
    /* Topmost layer first — matches how the stack actually paints
       (later entries in `layers` draw on top) and how every other
       layer-based editor lists them. */
    var rows = [];
    for (var i = layers.length - 1; i >= 0; i--) {
      var layer = layers[i];
      rows.push(
        '<div class="pb-layer' + (layer.id === activeLayerId ? " is-active" : "") + '">' +
          '<div class="pb-layer-thumb" data-layer-thumb="' + layer.id + '" data-layer-select="' + layer.id + '"><canvas width="40" height="30"></canvas></div>' +
          '<div class="pb-layer-body" data-layer-select="' + layer.id + '">' +
            '<span class="pb-layer-name">' + escapeHtml(layer.name) + "</span>" +
            '<input type="range" class="pb-layer-opacity" min="0" max="100" value="' + layer.opacity + '" data-layer-opacity="' + layer.id + '">' +
          "</div>" +
          '<div class="pb-layer-actions">' +
            '<button type="button" class="pb-layer-btn' + (layer.visible ? "" : " is-hidden-layer") + '" data-layer-visible="' + layer.id + '" title="Toggle visibility">' + (layer.visible ? EYE_ICON : EYE_OFF_ICON) + "</button>" +
            '<button type="button" class="pb-layer-btn" data-layer-up="' + layer.id + '" title="Move up"' + (i === layers.length - 1 ? " disabled" : "") + ">" + UP_ICON + "</button>" +
            '<button type="button" class="pb-layer-btn" data-layer-down="' + layer.id + '" title="Move down"' + (i === 0 ? " disabled" : "") + ">" + DOWN_ICON + "</button>" +
            '<button type="button" class="pb-layer-btn" data-layer-delete="' + layer.id + '" title="Delete layer"' + (layers.length <= 1 ? " disabled" : "") + ">" + TRASH_ICON + "</button>" +
          "</div>" +
        "</div>"
      );
    }
    els.layersList.innerHTML = rows.join("");
    layers.forEach(refreshThumb);
  }

  function moveLayer(id, direction) {
    var index = layers.indexOf(layerById(id));
    var swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= layers.length) return;
    var temp = layers[index];
    layers[index] = layers[swapIndex];
    layers[swapIndex] = temp;
    renderLayers();
    compositeLayers();
  }

  function deleteLayer(id) {
    if (layers.length <= 1) return;
    layers = layers.filter(function (l) { return l.id !== id; });
    if (activeLayerId === id) activeLayerId = layers[layers.length - 1].id;
    renderLayers();
    compositeLayers();
  }

  els.layerAdd.addEventListener("click", function () {
    var layer = createLayer(null, els.base.width, els.base.height);
    layers.push(layer);
    activeLayerId = layer.id;
    renderLayers();
    compositeLayers();
  });

  els.layersList.addEventListener("click", function (event) {
    var target;
    if ((target = event.target.closest("[data-layer-select]"))) {
      activeLayerId = target.getAttribute("data-layer-select");
      renderLayers();
    } else if ((target = event.target.closest("[data-layer-visible]"))) {
      var vLayer = layerById(target.getAttribute("data-layer-visible"));
      vLayer.visible = !vLayer.visible;
      renderLayers();
      compositeLayers();
    } else if ((target = event.target.closest("[data-layer-up]"))) {
      moveLayer(target.getAttribute("data-layer-up"), 1);
    } else if ((target = event.target.closest("[data-layer-down]"))) {
      moveLayer(target.getAttribute("data-layer-down"), -1);
    } else if ((target = event.target.closest("[data-layer-delete]"))) {
      deleteLayer(target.getAttribute("data-layer-delete"));
    }
  });

  els.layersList.addEventListener("input", function (event) {
    var input = event.target.closest("[data-layer-opacity]");
    if (!input) return;
    layerById(input.getAttribute("data-layer-opacity")).opacity = parseInt(input.value, 10);
    compositeLayers();
  });

  /* ------------------------------------------------------------------
     Zoom — the canvas is displayed at canvas.width/height * zoom via
     plain CSS size (the underlying pixel resolution never changes), so
     pointFromEvent's existing scale math automatically stays correct at
     any zoom level with no extra conversion. Scrolling only ever
     happens on .pb-canvas-scroll, and only once zoomed content actually
     overflows it.
     ------------------------------------------------------------------ */
  var zoom = 1;

  function applyZoom() {
    var w = Math.round(els.base.width * zoom);
    var h = Math.round(els.base.height * zoom);
    [els.base, els.overlay].forEach(function (canvas) {
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    });
    els.zoomPct.textContent = Math.round(zoom * 100) + "%";
  }

  function setZoom(next) {
    zoom = Math.max(0.1, Math.min(8, next));
    applyZoom();
  }

  els.zoomIn.addEventListener("click", function () { setZoom(zoom * 1.25); });
  els.zoomOut.addEventListener("click", function () { setZoom(zoom / 1.25); });
  els.zoomFit.addEventListener("click", function () {
    var rect = els.canvasScroll.getBoundingClientRect();
    var pad = 32;
    setZoom(Math.min(1, (rect.width - pad) / els.base.width, (rect.height - pad) / els.base.height));
  });

  /* ------------------------------------------------------------------
     History — a capped stack of per-LAYER canvas snapshots (not the
     whole document), so undo affects whichever layer the action
     actually happened on, even if you've since switched to a different
     one. Adding/deleting/reordering a layer is a separate, deliberately
     non-undoable action (see the Layers section above).
     ------------------------------------------------------------------ */
  var HISTORY_LIMIT = 30;
  var undoStack = [];
  var redoStack = [];

  function snapshot() {
    var layer = activeLayer();
    return { layerId: layer.id, url: layer.canvas.toDataURL("image/png") };
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    syncHistoryButtons();
  }

  function restore(entry) {
    var layer = layerById(entry.layerId);
    if (!layer) return; /* that layer was deleted since this snapshot */
    var img = new Image();
    img.onload = function () {
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      layer.ctx.drawImage(img, 0, 0);
      compositeLayers();
      refreshThumb(layer);
    };
    img.src = entry.url;
  }

  function syncHistoryButtons() {
    els.undo.disabled = undoStack.length === 0;
    els.redo.disabled = redoStack.length === 0;
  }

  els.undo.addEventListener("click", function () {
    if (!undoStack.length) return;
    var entry = undoStack.pop();
    var layer = layerById(entry.layerId);
    if (layer) redoStack.push({ layerId: layer.id, url: layer.canvas.toDataURL("image/png") });
    restore(entry);
    syncHistoryButtons();
  });

  els.redo.addEventListener("click", function () {
    if (!redoStack.length) return;
    var entry = redoStack.pop();
    var layer = layerById(entry.layerId);
    if (layer) undoStack.push({ layerId: layer.id, url: layer.canvas.toDataURL("image/png") });
    restore(entry);
    syncHistoryButtons();
  });

  document.addEventListener("keydown", function (event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    var key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); els.undo.click(); }
    else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); els.redo.click(); }
  });

  /* ------------------------------------------------------------------
     Canvas sizing — resizes the display/overlay canvases and every
     layer's own canvas together (each layer keeps its existing content,
     redrawn at 0,0 on the new size), or — when `resetLayers` is true,
     for a genuinely new document — replaces the whole stack with one
     fresh empty layer.
     ------------------------------------------------------------------ */
  function resizeCanvases(w, h, resetLayers) {
    els.base.width = w;
    els.base.height = h;
    els.overlay.width = w;
    els.overlay.height = h;

    if (resetLayers) {
      layerSeq = 0;
      layers = [createLayer(null, w, h)];
      activeLayerId = layers[0].id;
      undoStack.length = 0;
      redoStack.length = 0;
      syncHistoryButtons();
    } else {
      layers.forEach(function (layer) {
        var resized = document.createElement("canvas");
        resized.width = w;
        resized.height = h;
        resized.getContext("2d").drawImage(layer.canvas, 0, 0);
        layer.canvas = resized;
        layer.ctx = resized.getContext("2d", { willReadFrequently: true });
      });
    }

    zoom = 1;
    applyZoom();
    renderLayers();
    compositeLayers();
    updateStatus();
  }

  function updateStatus() {
    els.status.textContent = els.base.width + " × " + els.base.height + "px";
  }

  /* ------------------------------------------------------------------
     Tool picker, shape mode, size/opacity, color
     ------------------------------------------------------------------ */
  var SHAPE_TOOLS = { line: true, rect: true, ellipse: true };

  $$("[data-choice]").forEach(function (group) {
    var key = group.getAttribute("data-choice");
    $$(".pb-choice-card", group).forEach(function (card) {
      card.addEventListener("click", function () {
        $$(".pb-choice-card", group).forEach(function (c) { c.classList.toggle("is-active", c === card); });
        state[key] = card.getAttribute("data-value");

        if (key === "tool") {
          els.shapeModeField.hidden = !SHAPE_TOOLS[state.tool];
          els.brushStyleField.hidden = state.tool !== "brush";
          els.overlay.style.cursor = state.tool === "fill" ? "pointer" : "crosshair";
          updateControlAvailability();
        }
      });
    });
  });

  /** Grays out (and functionally disables) controls the current tool
      doesn't use — Fill never reads a brush size, Eraser never reads a
      color — instead of leaving them live but pointless. */
  function updateControlAvailability() {
    els.size.disabled = state.tool === "fill";

    var colorIrrelevant = state.tool === "eraser";
    var colorRow = document.querySelector('[data-swatches="color"]');
    if (colorRow) {
      colorRow.classList.toggle("is-disabled", colorIrrelevant);
      $$(".pb-swatch", colorRow).forEach(function (s) { s.disabled = colorIrrelevant; });
    }
    els.colorCustom.disabled = colorIrrelevant;
  }

  $$("[data-fill-mode] .pb-mode-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      $$("[data-fill-mode] .pb-mode-btn").forEach(function (b) { b.classList.toggle("is-active", b === button); });
      state.shapeMode = button.getAttribute("data-mode");
    });
  });

  els.size.addEventListener("input", function () {
    state.size = parseInt(els.size.value, 10);
    els.sizeVal.textContent = state.size + "px";
  });

  els.opacity.addEventListener("input", function () {
    state.opacity = parseInt(els.opacity.value, 10);
    els.opacityVal.textContent = state.opacity + "%";
  });

  [
    { input: els.spread, out: els.spreadVal, key: "spread" },
    { input: els.smoothing, out: els.smoothingVal, key: "smoothing" },
    { input: els.grain, out: els.grainVal, key: "grain" },
    { input: els.roughness, out: els.roughnessVal, key: "roughness" }
  ].forEach(function (binding) {
    binding.input.addEventListener("input", function () {
      state[binding.key] = parseInt(binding.input.value, 10);
      binding.out.textContent = state[binding.key] + "%";
    });
  });

  $$(".pb-swatch[data-value]").forEach(function (swatch) {
    swatch.addEventListener("click", function () {
      $$(".pb-swatch").forEach(function (s) { s.classList.remove("is-active"); });
      swatch.classList.add("is-active");
      state.color = swatch.getAttribute("data-value");
    });
  });

  els.colorCustom.addEventListener("input", function () {
    $$(".pb-swatch").forEach(function (s) { s.classList.remove("is-active"); });
    els.colorCustom.closest(".pb-swatch").classList.add("is-active");
    state.color = els.colorCustom.value;
  });

  /* ------------------------------------------------------------------
     Color helpers
     ------------------------------------------------------------------ */
  function hexToRgb(hex) {
    var clean = String(hex).replace("#", "");
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  /* ------------------------------------------------------------------
     Flood fill — stack-based (no recursion, so no call-stack limit on a
     large canvas), with a tolerance so anti-aliased edges don't leave a
     ring of unfilled pixels around the region.
     ------------------------------------------------------------------ */
  function floodFill(layer, x, y) {
    var w = layer.canvas.width, h = layer.canvas.height;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;

    var imageData = layer.ctx.getImageData(0, 0, w, h);
    var data = imageData.data;
    var startIdx = (y * w + x) * 4;
    var startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2], startA = data[startIdx + 3];

    var fill = hexToRgb(state.color);
    var fillA = Math.round((state.opacity / 100) * 255);
    if (startR === fill.r && startG === fill.g && startB === fill.b && startA === fillA) return;

    var tolerance = 32;
    function matches(idx) {
      return Math.abs(data[idx] - startR) <= tolerance &&
             Math.abs(data[idx + 1] - startG) <= tolerance &&
             Math.abs(data[idx + 2] - startB) <= tolerance &&
             Math.abs(data[idx + 3] - startA) <= tolerance;
    }

    var visited = new Uint8Array(w * h);
    var stack = [x, y];
    while (stack.length) {
      var py = stack.pop(), px = stack.pop();
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      var pos = py * w + px;
      if (visited[pos]) continue;
      var idx = pos * 4;
      if (!matches(idx)) continue;
      visited[pos] = 1;
      data[idx] = fill.r; data[idx + 1] = fill.g; data[idx + 2] = fill.b; data[idx + 3] = fillA;
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }

    layer.ctx.putImageData(imageData, 0, 0);
  }

  /* ------------------------------------------------------------------
     Drawing — brush/eraser commit directly to the base canvas as the
     pointer moves; line/rect/ellipse preview on the overlay canvas and
     only commit to base on release, so dragging never smears a half-built
     shape into the real image.
     ------------------------------------------------------------------ */
  var dragging = false;
  var startPoint = null;
  var lastPoint = null;

  function pointFromEvent(event) {
    var rect = els.overlay.getBoundingClientRect();
    var scaleX = els.overlay.width / rect.width;
    var scaleY = els.overlay.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function paintStyle(context) {
    context.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = state.color;
    context.fillStyle = state.color;
    context.globalAlpha = state.opacity / 100;
    context.lineWidth = state.size;
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  function eraseDot(context, point) {
    paintStyle(context);
    context.beginPath();
    context.arc(point.x, point.y, state.size / 2, 0, Math.PI * 2);
    context.fill();
  }

  function eraseSegment(context, from, to) {
    paintStyle(context);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  /* ------------------------------------------------------------------
     Brush engine — a small set of pure texture GENERATORS (context,
     point, size, color, opacity, params), each independent of any
     global state, plus a much longer list of named PRESETS that reuse
     them with different parameters. This mirrors how a real brush
     engine (Photoshop included) actually works: a handful of stamp
     behaviors, dozens of presets built by tuning them — not hundreds of
     hand-drawn assets. See tools/png-brusher/README or the toolbar
     itself for the resulting variety; every preset renders a live
     sample stroke as its own picker button rather than a text label.
     ------------------------------------------------------------------ */
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
  }

  /** Shifts a hex color's lightness by a small random amount — used for
      textures where real material (chalk, crayon, confetti) is never
      perfectly one flat tone. */
  function jitterColor(hex, amount) {
    var c = hexToRgb(hex);
    var delta = (Math.random() * 2 - 1) * amount * 255;
    var clamp = function (v) { return Math.max(0, Math.min(255, Math.round(v + delta))); };
    return "rgb(" + clamp(c.r) + "," + clamp(c.g) + "," + clamp(c.b) + ")";
  }

  var GENERATORS = {
    /* Solid disc — the baseline every other generator is a variation on. */
    dot: function (context, point, size, color, opacity) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity;
      context.fillStyle = color;
      context.beginPath();
      context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
      context.fill();
    },

    /* Radial falloff instead of a hard edge — hardness 0 is a full
       airbrush fade, closer to 1 keeps the center solid longer. */
    soft: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      var r = (size / 2) * (p.radiusMul || 1);
      var hardness = p.hardness || 0;
      var gradient = context.createRadialGradient(point.x, point.y, r * hardness, point.x, point.y, r);
      gradient.addColorStop(0, rgba(color, opacity));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(point.x, point.y, r, 0, Math.PI * 2);
      context.fill();
    },

    /* A cluster of tiny grains rather than a solid shape — chalk,
       charcoal, pencil and crayon are all this generator with different
       grain size / density / color-jitter. */
    grain: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      var r = size / 2;
      var grains = Math.max(4, Math.round(size * (p.density || 1.4)));
      for (var i = 0; i < grains; i++) {
        var angle = Math.random() * Math.PI * 2;
        var dist = Math.random() * r;
        var gr = Math.max(0.35, Math.random() * (size * (p.grainScale || 0.12)));
        context.globalAlpha = opacity * ((p.alphaMin || 0.25) + Math.random() * (p.alphaSpread || 0.5));
        context.fillStyle = p.colorJitter ? jitterColor(color, p.colorJitter) : color;
        context.beginPath();
        context.arc(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, gr, 0, Math.PI * 2);
        context.fill();
      }
    },

    /* Sparse dots over a wider, sqrt-distributed radius — a spray can's
       aerosol cone (denser near the center, thinning outward). */
    scatter: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = color;
      var r = size * (p.spread || 1.1);
      var drops = Math.max(3, Math.round(size * (p.density || 0.9)));
      for (var i = 0; i < drops; i++) {
        var angle = Math.random() * Math.PI * 2;
        var dist = Math.sqrt(Math.random()) * r;
        var gr = (p.dotMin || 0.5) + Math.random() * (p.dotSpread || 1.3);
        context.globalAlpha = opacity * ((p.alphaMin || 0.4) + Math.random() * (p.alphaSpread || 0.5));
        context.beginPath();
        context.arc(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, gr, 0, Math.PI * 2);
        context.fill();
      }
    },

    /* Fixed-angle flat nib — the same stroke reads thick or thin
       depending only on the direction it's drawn, like a chisel pen. */
    nib: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity;
      context.fillStyle = color;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(p.angle || -Math.PI / 4);
      context.beginPath();
      context.ellipse(0, 0, size / 2, size * (p.aspect || 0.4), 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    },

    /* An irregular polygon blob plus flung-out satellite droplets —
       ink hitting a surface, not a clean circle. */
    splat: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = color;

      var corners = 7 + Math.floor(Math.random() * 5);
      context.globalAlpha = opacity * (0.75 + Math.random() * 0.25);
      context.beginPath();
      for (var i = 0; i <= corners; i++) {
        var a = (i / corners) * Math.PI * 2;
        var rr = (size / 2) * (0.55 + Math.random() * 0.65);
        var px = point.x + Math.cos(a) * rr, py = point.y + Math.sin(a) * rr;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();

      var drops = Math.round((p.dropletBase || 3) + Math.random() * (p.dropletSpread || 4));
      for (var j = 0; j < drops; j++) {
        var angle = Math.random() * Math.PI * 2;
        var dist = size * (p.reach || 0.75) * (0.6 + Math.random() * 0.9);
        var dr = Math.max(0.5, Math.random() * (size * 0.18));
        context.globalAlpha = opacity * (0.5 + Math.random() * 0.4);
        context.beginPath();
        context.arc(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, dr, 0, Math.PI * 2);
        context.fill();
      }
    },

    /* Flat rectangular tip at reduced opacity, so overlapping strokes
       build up like a real felt-tip rather than staying flat. */
    flatTip: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity * (p.alphaMul || 0.7);
      context.fillStyle = color;
      var h = size * (p.aspect || 0.78);
      context.fillRect(point.x - size / 2, point.y - h / 2, size, h);
    },

    /* Several short translucent line segments radiating from the point
       at slightly varying angles — dry brush fibers / a fan brush. */
    bristle: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
      context.lineCap = "round";
      var count = p.count || 6;
      var base = Math.random() * Math.PI * 2;
      var length = size * (p.lengthMul || 0.9);
      for (var i = 0; i < count; i++) {
        var angle = base + (Math.random() - 0.5) * (p.spread || 0.6);
        var len = length * (0.5 + Math.random() * 0.6);
        context.globalAlpha = opacity * (0.3 + Math.random() * 0.5);
        context.lineWidth = Math.max(0.6, size * 0.05);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x + Math.cos(angle) * len, point.y + Math.sin(angle) * len);
        context.stroke();
      }
    },

    /* An n-pointed star, filled, rotated randomly each stamp. */
    star: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity;
      context.fillStyle = color;
      var spikes = p.points || 5;
      var outer = size / 2, inner = outer * (p.innerRatio || 0.45);
      var rot = Math.random() * Math.PI * 2;
      context.beginPath();
      for (var i = 0; i < spikes * 2; i++) {
        var r = i % 2 === 0 ? outer : inner;
        var a = rot + (i / (spikes * 2)) * Math.PI * 2;
        var px = point.x + Math.cos(a) * r, py = point.y + Math.sin(a) * r;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
    },

    /* A leaf/petal silhouette (two arcs meeting at points), rotated
       randomly each stamp for an organic scatter. */
    leaf: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity;
      context.fillStyle = color;
      var rot = Math.random() * Math.PI * 2;
      var len = size * (p.aspect || 1.1), width = size * 0.45;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(rot);
      context.beginPath();
      context.moveTo(0, -len / 2);
      context.quadraticCurveTo(width, 0, 0, len / 2);
      context.quadraticCurveTo(-width, 0, 0, -len / 2);
      context.fill();
      context.restore();
    },

    /* Several overlapping soft blobs forming one puffy shape. */
    cloud: function (context, point, size, color, opacity, p) {
      var lobes = p.lobes || 5;
      for (var i = 0; i < lobes; i++) {
        var angle = (i / lobes) * Math.PI * 2 + Math.random() * 0.4;
        var dist = size * 0.22 * Math.random();
        var lobePoint = { x: point.x + Math.cos(angle) * dist, y: point.y + Math.sin(angle) * dist };
        GENERATORS.soft(context, lobePoint, size * (0.55 + Math.random() * 0.3), color, opacity * 0.7, { hardness: 0, radiusMul: 1 });
      }
    },

    /* A few short, near-parallel angled lines — pencil cross-hatching. */
    hatch: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
      context.lineCap = "round";
      var lines = p.lines || 3;
      var angle = (p.angle !== undefined ? p.angle : Math.PI / 4) + (Math.random() - 0.5) * 0.3;
      var length = size * (p.lengthMul || 1.3);
      for (var i = 0; i < lines; i++) {
        var offset = (i - (lines - 1) / 2) * (size * 0.28);
        var ox = -Math.sin(angle) * offset, oy = Math.cos(angle) * offset;
        context.globalAlpha = opacity * (0.5 + Math.random() * 0.4);
        context.lineWidth = Math.max(0.6, size * 0.08);
        context.beginPath();
        context.moveTo(point.x + ox - Math.cos(angle) * length / 2, point.y + oy - Math.sin(angle) * length / 2);
        context.lineTo(point.x + ox + Math.cos(angle) * length / 2, point.y + oy + Math.sin(angle) * length / 2);
        context.stroke();
      }
    },

    /* A round head tapering into a downward point — a drip, always
       oriented with gravity rather than the stroke direction. */
    drip: function (context, point, size, color, opacity) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = opacity;
      context.fillStyle = color;
      var r = size / 2, tail = size * (0.8 + Math.random() * 0.6);
      context.beginPath();
      context.arc(point.x, point.y, r, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(point.x - r * 0.5, point.y);
      context.quadraticCurveTo(point.x, point.y + tail, point.x + r * 0.5, point.y);
      context.closePath();
      context.fill();
    },

    /* Concentric wobbly rings — a fingerprint / wood-grain style ridge
       texture, stroked rather than filled. */
    fingerprint: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
      context.lineCap = "round";
      var rings = p.rings || 4;
      for (var i = 1; i <= rings; i++) {
        var r = (size / 2) * (i / rings);
        var wobble = size * 0.06;
        context.globalAlpha = opacity * (0.4 + Math.random() * 0.4);
        context.lineWidth = Math.max(0.5, size * 0.04);
        context.beginPath();
        for (var a = 0; a <= Math.PI * 2 + 0.2; a += 0.4) {
          var rr = r + Math.sin(a * 3 + i) * wobble;
          var px = point.x + Math.cos(a) * rr, py = point.y + Math.sin(a) * rr;
          if (a === 0) context.moveTo(px, py); else context.lineTo(px, py);
        }
        context.stroke();
      }
    },

    /* Small random polygons in slightly varied tones — confetti,
       scattered over a radius the way scatter/spray are. */
    confetti: function (context, point, size, color, opacity, p) {
      context.globalCompositeOperation = "source-over";
      var pieces = Math.max(3, Math.round(size * (p.density || 0.6)));
      var spread = size * (p.spread || 1.3);
      for (var i = 0; i < pieces; i++) {
        var angle = Math.random() * Math.PI * 2;
        var dist = Math.sqrt(Math.random()) * spread;
        var cx = point.x + Math.cos(angle) * dist, cy = point.y + Math.sin(angle) * dist;
        var pieceSize = size * (0.12 + Math.random() * 0.16);
        context.globalAlpha = opacity * (0.6 + Math.random() * 0.4);
        context.fillStyle = jitterColor(color, 0.35);
        context.save();
        context.translate(cx, cy);
        context.rotate(Math.random() * Math.PI * 2);
        if (Math.random() < 0.5) {
          context.fillRect(-pieceSize / 2, -pieceSize / 2, pieceSize, pieceSize);
        } else {
          context.beginPath();
          context.arc(0, 0, pieceSize / 2, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
    },

    /* Six radiating arms with small cross-ticks — a simple snowflake,
       rotated randomly per stamp for an organic scattered feel. */
    snowflake: function (context, point, size, color, opacity) {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = color;
      context.globalAlpha = opacity;
      context.lineWidth = Math.max(0.6, size * 0.06);
      context.lineCap = "round";
      var rot = Math.random() * Math.PI * 2;
      var r = size / 2;
      for (var i = 0; i < 6; i++) {
        var angle = rot + (i / 6) * Math.PI * 2;
        var ex = point.x + Math.cos(angle) * r, ey = point.y + Math.sin(angle) * r;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(ex, ey);
        context.stroke();
        var midx = point.x + Math.cos(angle) * r * 0.6, midy = point.y + Math.sin(angle) * r * 0.6;
        var tick = r * 0.28;
        context.beginPath();
        context.moveTo(midx + Math.cos(angle + 1.0) * tick, midy + Math.sin(angle + 1.0) * tick);
        context.lineTo(midx + Math.cos(angle - 1.0) * tick, midy + Math.sin(angle - 1.0) * tick);
        context.stroke();
      }
    }
  };

  /* Presets — the actual picker. Grouped into categories so the panel
     stays usable at 25+ entries instead of one long undifferentiated
     grid. Adding a new brush is one entry here; it needs a new
     generator only if it behaves differently, not just looks different. */
  var PRESETS = [
    { id: "round", label: "Round", category: "basic", generator: "dot", spacingMul: 0.28 },
    { id: "soft-round", label: "Soft Round", category: "basic", generator: "soft", params: { hardness: 0.1 }, spacingMul: 0.28 },
    { id: "hard-round", label: "Hard Round", category: "basic", generator: "soft", params: { hardness: 0.7 }, spacingMul: 0.28 },
    { id: "marker", label: "Marker", category: "basic", generator: "flatTip", params: { alphaMul: 0.7, aspect: 0.85 }, spacingMul: 0.3 },
    { id: "highlighter", label: "Highlighter", category: "basic", generator: "flatTip", params: { alphaMul: 0.32, aspect: 1.3 }, spacingMul: 0.32 },

    { id: "chalk", label: "Chalk", category: "texture", generator: "grain", params: { density: 1.4, grainScale: 0.12, alphaMin: 0.25, alphaSpread: 0.5 }, spacingMul: 0.18 },
    { id: "charcoal", label: "Charcoal", category: "texture", generator: "grain", params: { density: 1.8, grainScale: 0.18, alphaMin: 0.35, alphaSpread: 0.6 }, spacingMul: 0.16 },
    { id: "pencil", label: "Pencil", category: "texture", generator: "grain", params: { density: 2.2, grainScale: 0.06, alphaMin: 0.15, alphaSpread: 0.35 }, spacingMul: 0.16 },
    { id: "crayon", label: "Crayon", category: "texture", generator: "grain", params: { density: 1.6, grainScale: 0.14, alphaMin: 0.4, alphaSpread: 0.4, colorJitter: 0.12 }, spacingMul: 0.18 },
    { id: "dry-bristle", label: "Dry Bristle", category: "texture", generator: "bristle", params: { count: 7, spread: 0.7, lengthMul: 1.1 }, spacingMul: 0.4 },
    { id: "fine-bristle", label: "Fine Bristle", category: "texture", generator: "bristle", params: { count: 4, spread: 0.3, lengthMul: 0.7 }, spacingMul: 0.4 },
    { id: "watercolor", label: "Watercolor", category: "texture", generator: "cloud", params: { lobes: 4 }, spacingMul: 0.5, opacityMul: 0.55 },

    { id: "spray-fine", label: "Spray Fine", category: "scatter", generator: "scatter", params: { density: 0.7, spread: 0.9, dotMin: 0.4, dotSpread: 0.8 }, spacingMul: 0.2 },
    { id: "spray-heavy", label: "Spray Heavy", category: "scatter", generator: "scatter", params: { density: 1.6, spread: 1.4, dotMin: 0.6, dotSpread: 1.6 }, spacingMul: 0.18 },
    { id: "confetti", label: "Confetti", category: "scatter", generator: "confetti", params: { density: 0.6, spread: 1.3 }, spacingMul: 0.4 },
    { id: "stars", label: "Stars", category: "scatter", generator: "star", params: { points: 5, innerRatio: 0.45 }, spacingMul: 0.9 },
    { id: "leaves", label: "Leaves", category: "scatter", generator: "leaf", params: { aspect: 1.1 }, spacingMul: 0.9 },
    { id: "snowflakes", label: "Snowflakes", category: "scatter", generator: "snowflake", spacingMul: 1.0 },

    { id: "ink-splatter", label: "Ink Splatter", category: "ink", generator: "splat", params: { dropletBase: 3, dropletSpread: 4, reach: 0.75 }, spacingMul: 0.9 },
    { id: "light-splatter", label: "Light Splatter", category: "ink", generator: "splat", params: { dropletBase: 1, dropletSpread: 2, reach: 0.5 }, spacingMul: 1.1 },
    { id: "heavy-splatter", label: "Heavy Splatter", category: "ink", generator: "splat", params: { dropletBase: 4, dropletSpread: 6, reach: 1.1 }, spacingMul: 0.8 },
    { id: "drip", label: "Drip", category: "ink", generator: "drip", spacingMul: 0.7 },
    { id: "fingerprint", label: "Fingerprint", category: "ink", generator: "fingerprint", params: { rings: 4 }, spacingMul: 0.9 },
    { id: "cross-hatch", label: "Cross Hatch", category: "ink", generator: "hatch", params: { lines: 3 }, spacingMul: 0.6 },

    { id: "calligraphy-thin", label: "Calligraphy Thin", category: "special", generator: "nib", params: { aspect: 0.22 }, spacingMul: 0.3 },
    { id: "calligraphy-broad", label: "Calligraphy Broad", category: "special", generator: "nib", params: { aspect: 0.55 }, spacingMul: 0.3 },
    { id: "cloud-puff", label: "Cloud Puff", category: "special", generator: "cloud", params: { lobes: 5 }, spacingMul: 0.5 },
    { id: "glow", label: "Glow", category: "special", generator: "soft", params: { hardness: 0, radiusMul: 1.6 }, spacingMul: 0.3, opacityMul: 0.6 },

    /* A second pass of presets — same generators, deliberately different
       parameters, so each is still a genuinely different mark rather
       than padding for a round number (see tools/STANDARDS.md §7). */
    { id: "extra-soft", label: "Extra Soft", category: "basic", generator: "soft", params: { hardness: 0 }, spacingMul: 0.28 },
    { id: "felt-tip", label: "Felt Tip", category: "basic", generator: "flatTip", params: { alphaMul: 0.55, aspect: 0.55 }, spacingMul: 0.3 },

    { id: "charcoal-soft", label: "Charcoal Soft", category: "texture", generator: "grain", params: { density: 1.2, grainScale: 0.2, alphaMin: 0.2, alphaSpread: 0.4 }, spacingMul: 0.2 },
    { id: "sponge", label: "Sponge", category: "texture", generator: "grain", params: { density: 1.0, grainScale: 0.22, alphaMin: 0.3, alphaSpread: 0.5 }, spacingMul: 0.22 },
    { id: "wet-bristle", label: "Wet Bristle", category: "texture", generator: "bristle", params: { count: 5, spread: 0.2, lengthMul: 1.3 }, spacingMul: 0.4 },
    { id: "oil-paint", label: "Oil Paint", category: "texture", generator: "cloud", params: { lobes: 3 }, spacingMul: 0.45, opacityMul: 0.85 },
    { id: "fabric", label: "Fabric", category: "texture", generator: "hatch", params: { lines: 2, angle: Math.PI / 2 }, spacingMul: 0.5 },

    { id: "dust", label: "Dust", category: "scatter", generator: "scatter", params: { density: 1.0, spread: 0.6, dotMin: 0.2, dotSpread: 0.5 }, spacingMul: 0.16 },
    { id: "bubbles", label: "Bubbles", category: "scatter", generator: "scatter", params: { density: 0.3, spread: 1.2, dotMin: 1.5, dotSpread: 2.5 }, spacingMul: 0.5 },
    { id: "petals", label: "Petals", category: "scatter", generator: "leaf", params: { aspect: 0.7 }, spacingMul: 0.9 },
    { id: "sparkle", label: "Sparkle", category: "scatter", generator: "star", params: { points: 4, innerRatio: 0.2 }, spacingMul: 0.9 },

    { id: "fine-fingerprint", label: "Fine Fingerprint", category: "ink", generator: "fingerprint", params: { rings: 2 }, spacingMul: 1.0 },
    { id: "deep-fingerprint", label: "Deep Fingerprint", category: "ink", generator: "fingerprint", params: { rings: 6 }, spacingMul: 0.8 },
    { id: "heavy-hatch", label: "Heavy Hatch", category: "ink", generator: "hatch", params: { lines: 5 }, spacingMul: 0.5 },
    { id: "thin-hatch", label: "Thin Hatch", category: "ink", generator: "hatch", params: { lines: 2 }, spacingMul: 0.7 },

    { id: "chisel-nib", label: "Chisel Nib", category: "special", generator: "nib", params: { angle: 0, aspect: 0.35 }, spacingMul: 0.3 },
    { id: "vertical-nib", label: "Vertical Nib", category: "special", generator: "nib", params: { angle: -Math.PI / 2, aspect: 0.3 }, spacingMul: 0.3 },
    { id: "big-glow", label: "Big Glow", category: "special", generator: "soft", params: { hardness: 0, radiusMul: 2.2 }, spacingMul: 0.3, opacityMul: 0.5 },
    { id: "puffy-cloud", label: "Puffy Cloud", category: "special", generator: "cloud", params: { lobes: 7 }, spacingMul: 0.5 }
  ];

  var CATEGORIES = [
    { id: "basic", label: "Basic" },
    { id: "texture", label: "Texture" },
    { id: "scatter", label: "Scatter" },
    { id: "ink", label: "Ink" },
    { id: "special", label: "Special" }
  ];

  var presetsById = {};
  PRESETS.forEach(function (preset) { presetsById[preset.id] = preset; });

  function stampPreset(preset, context, point, size, color, opacity) {
    var generator = GENERATORS[preset.generator];
    if (!generator) return;
    generator(context, point, size, color, opacity * (preset.opacityMul || 1), preset.params || {});
  }

  function spacingFor(preset, size) {
    return Math.max(1, size * (preset.spacingMul || 0.28));
  }

  /** Offsets a point by a random distance within `amount` — the same
      idea as a real brush engine's "scattering": every stamp lands near
      the path rather than exactly on it. */
  function jitterPoint(point, amount) {
    if (!amount) return point;
    var angle = Math.random() * Math.PI * 2;
    var dist = Math.random() * amount;
    return { x: point.x + Math.cos(angle) * dist, y: point.y + Math.sin(angle) * dist };
  }

  /** The live-drawing path — unlike stampPreset (used as-is for picker
      previews), this layers the universal Brush Feel modifiers on top of
      whichever preset is active:
        - Spread scatters the stamp position.
        - Roughness jitters the stamp size, so identical stamps don't
          repeat identically.
        - Grain adds a second, faint texture pass on top (brush only —
          it doesn't make sense while erasing).
      None of this touches the preset's own params, so a preset stays a
      clean, reusable definition and the modifiers stay reusable across
      every preset instead of needing a variant per combination. */
  function stampBrush(context, point) {
    var preset = presetsById[state.brushPreset] || PRESETS[0];
    var size = state.size;

    /* Sliders go to 300% — at max, roughness can swing size anywhere
       from near-zero to 4x, and one grain pass becomes several,
       overlapping and re-randomized each time for real density instead
       of one slightly-denser pass. */
    if (state.roughness) {
      var jitterFactor = 1 + (Math.random() * 2 - 1) * (state.roughness / 100) * 1.5;
      size = Math.max(0.5, size * jitterFactor);
    }

    var target = state.spread ? jitterPoint(point, (state.spread / 100) * state.size * 2.5) : point;

    stampPreset(preset, context, target, size, state.color, state.opacity / 100);

    if (state.grain && state.tool === "brush") {
      var grainPasses = 1 + Math.floor(state.grain / 60);
      for (var i = 0; i < grainPasses; i++) {
        GENERATORS.grain(context, target, size, state.color, Math.min(1, (state.opacity / 100) * (state.grain / 100)), {
          density: 1 + state.grain / 20,
          grainScale: 0.09,
          alphaMin: 0.15,
          alphaSpread: 0.5
        });
      }
    }
  }

  /** Smoothing ("stabilizer" in most drawing apps): the point actually
      drawn lags behind the raw pointer position, chasing it with an
      exponential moving average — the higher the smoothing, the slower
      it catches up, which is what irons hand jitter out of a freehand
      line. Reset per stroke (see pointerdown) so it starts exactly where
      you put the pointer down rather than easing in from wherever the
      last stroke ended. */
  var smoothedPoint = null;

  function smoothPoint(point) {
    if (!state.smoothing) { smoothedPoint = point; return point; }
    if (!smoothedPoint) { smoothedPoint = point; return point; }
    /* At 100% this is 0.005 — the drawn point barely moves per event,
       so a stroke reads as almost a straight average of the whole
       gesture rather than merely "a bit less shaky". */
    var factor = 1 - (state.smoothing / 100) * 0.995;
    smoothedPoint = {
      x: smoothedPoint.x + (point.x - smoothedPoint.x) * factor,
      y: smoothedPoint.y + (point.y - smoothedPoint.y) * factor
    };
    return smoothedPoint;
  }

  /** Walks from `from` to `to` in even steps (sized for the chosen
      preset) so a fast pointer move still lays down a continuous stroke
      instead of gapped stamps. */
  function strokeBetween(context, from, to, stampFn, size) {
    var preset = presetsById[state.brushPreset] || PRESETS[0];
    var dx = to.x - from.x, dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var spacing = spacingFor(preset, size);
    var steps = Math.max(1, Math.ceil(dist / spacing));
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      stampFn(context, { x: from.x + dx * t, y: from.y + dy * t });
    }
  }

  /** Renders one preset's live sample stroke into a small canvas — shows
      what it actually does instead of just naming it (tools/STANDARDS.md
      §4). Used both for the picker grid and could be reused anywhere
      else a preview of a preset is useful. */
  function renderPresetPreview(canvas, preset) {
    var pctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    pctx.clearRect(0, 0, w, h);

    var size = 9, color = "#2b2620", opacity = 0.88;
    var from = { x: w * 0.12, y: h * 0.68 };
    var to = { x: w * 0.88, y: h * 0.32 };
    var dx = to.x - from.x, dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var spacing = spacingFor(preset, size);
    var steps = Math.max(1, Math.ceil(dist / spacing));

    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      stampPreset(preset, pctx, { x: from.x + dx * t, y: from.y + dy * t }, size, color, opacity);
    }
    pctx.globalAlpha = 1;
    pctx.globalCompositeOperation = "source-over";
  }

  /* ------------------------------------------------------------------
     Preset picker UI — category tabs filter which preset cards show,
     so only the active category's ~5-7 preview canvases are ever drawn
     at once instead of all ~28 up front.
     ------------------------------------------------------------------ */
  function renderCategoryTabs() {
    els.presetCategories.innerHTML = CATEGORIES.map(function (cat) {
      return '<button type="button" class="pb-tab' + (cat.id === state.activeCategory ? " is-active" : "") +
        '" data-category="' + cat.id + '">' + cat.label + "</button>";
    }).join("");

    $$(".pb-tab", els.presetCategories).forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.activeCategory = tab.getAttribute("data-category");
        $$(".pb-tab", els.presetCategories).forEach(function (t) { t.classList.toggle("is-active", t === tab); });
        renderPresetGrid();
      });
    });
  }

  function renderPresetGrid() {
    var presets = PRESETS.filter(function (p) { return p.category === state.activeCategory; });

    els.presetGrid.innerHTML = presets.map(function (preset) {
      return '<button type="button" class="pb-choice-card' + (preset.id === state.brushPreset ? " is-active" : "") +
        '" data-preset="' + preset.id + '">' +
        '<canvas class="pb-brush-preview" width="56" height="28"></canvas>' +
        "<span>" + preset.label + "</span></button>";
    }).join("");

    $$(".pb-choice-card", els.presetGrid).forEach(function (card, i) {
      renderPresetPreview(card.querySelector("canvas"), presets[i]);
      card.addEventListener("click", function () {
        $$(".pb-choice-card", els.presetGrid).forEach(function (c) { c.classList.remove("is-active"); });
        card.classList.add("is-active");
        state.brushPreset = presets[i].id;
      });
    });
  }

  renderCategoryTabs();
  renderPresetGrid();

  function drawShape(context, from, to) {
    paintStyle(context);
    context.globalCompositeOperation = "source-over";
    var x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
    var w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y);

    context.beginPath();
    if (state.tool === "rect") {
      context.rect(x, y, w, h);
    } else if (state.tool === "ellipse") {
      context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }

    if (state.tool !== "line" && state.shapeMode === "fill") context.fill();
    else context.stroke();
  }

  els.overlay.addEventListener("pointerdown", function (event) {
    var point = pointFromEvent(event);
    var layer = activeLayer();

    if (state.tool === "fill") {
      pushHistory();
      floodFill(layer, point.x, point.y);
      compositeLayers();
      refreshThumb(layer);
      return;
    }

    pushHistory();
    dragging = true;
    startPoint = point;
    lastPoint = point;
    smoothedPoint = null; /* each stroke starts exactly under the pointer, never eased in from the last stroke's end */
    els.overlay.setPointerCapture(event.pointerId);

    if (state.tool === "brush") stampBrush(layer.ctx, point);
    else if (state.tool === "eraser") eraseDot(layer.ctx, point);
    compositeLayers();
  });

  els.overlay.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    var rawPoint = pointFromEvent(event);
    var layer = activeLayer();

    if (state.tool === "brush" || state.tool === "eraser") {
      var point = smoothPoint(rawPoint);
      if (state.tool === "brush") strokeBetween(layer.ctx, lastPoint, point, stampBrush, state.size);
      else eraseSegment(layer.ctx, lastPoint, point);
      lastPoint = point;
      compositeLayers();
    } else if (SHAPE_TOOLS[state.tool]) {
      overlayCtx.clearRect(0, 0, els.overlay.width, els.overlay.height);
      drawShape(overlayCtx, startPoint, rawPoint);
    }
  });

  function endStroke(event) {
    if (!dragging) return;
    dragging = false;
    var layer = activeLayer();

    if (SHAPE_TOOLS[state.tool]) {
      var point = pointFromEvent(event);
      overlayCtx.clearRect(0, 0, els.overlay.width, els.overlay.height);
      drawShape(layer.ctx, startPoint, point);
      compositeLayers();
    }

    layer.ctx.globalCompositeOperation = "source-over";
    layer.ctx.globalAlpha = 1;
    startPoint = null;
    lastPoint = null;
    refreshThumb(layer);
  }

  els.overlay.addEventListener("pointerup", endStroke);
  els.overlay.addEventListener("pointercancel", endStroke);

  /* ------------------------------------------------------------------
     Canvas actions — new, open, clear, download
     ------------------------------------------------------------------ */
  els.newCanvas.addEventListener("click", function () {
    var w = Math.max(16, Math.min(4000, parseInt(els.newW.value, 10) || 900));
    var h = Math.max(16, Math.min(4000, parseInt(els.newH.value, 10) || 600));
    resizeCanvases(w, h, true);
    if (!els.newTransparent.checked) {
      var layer = activeLayer();
      layer.ctx.fillStyle = "#ffffff";
      layer.ctx.fillRect(0, 0, w, h);
      compositeLayers();
      refreshThumb(layer);
    }
  });

  els.openFile.addEventListener("change", function () {
    var file = els.openFile.files && els.openFile.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = Math.min(4000, img.width);
        var h = Math.min(4000, img.height);
        resizeCanvases(w, h, true);
        var layer = activeLayer();
        layer.ctx.drawImage(img, 0, 0, w, h);
        compositeLayers();
        refreshThumb(layer);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    els.openFile.value = "";
  });

  els.clear.addEventListener("click", function () {
    pushHistory();
    var layer = activeLayer();
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    compositeLayers();
    refreshThumb(layer);
  });

  els.download.addEventListener("click", function () {
    els.base.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "painting.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  });

  /* Initial document: one layer matching the canvas markup's own
     width/height attributes. */
  layers = [createLayer("Layer 1", els.base.width, els.base.height)];
  activeLayerId = layers[0].id;
  renderLayers();
  compositeLayers();
  applyZoom();
  updateControlAvailability();
  syncHistoryButtons();
  updateStatus();
})();
