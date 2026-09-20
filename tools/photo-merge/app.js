/* ==========================================================================
   Photo Merge — a multi-layer image compositor, fully self-contained
   (see tools/STANDARDS.md). Everything runs in the browser: nothing is
   uploaded, nothing is fetched.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    addImage: $("pm-add-image"),
    fileInput: $("pm-file-input"),
    zoomField: $("pm-zoom-field"),
    layerZoom: $("pm-layer-zoom"),
    layerZoomVal: $("pm-layer-zoom-val"),
    cropField: $("pm-crop-field"),
    cropApply: $("pm-crop-apply"),
    cropClear: $("pm-crop-clear"),
    brushField: $("pm-brush-field"),
    brushSize: $("pm-brush-size"),
    brushSizeVal: $("pm-brush-size-val"),
    brushHardness: $("pm-brush-hardness"),
    brushHardnessVal: $("pm-brush-hardness-val"),
    brushModeErase: $("pm-brush-mode-erase"),
    brushModeRestore: $("pm-brush-mode-restore"),
    emptyNote: $("pm-empty-note"),
    layersList: $("pm-layers"),
    undo: $("pm-undo"),
    redo: $("pm-redo"),
    reset: $("pm-reset"),
    download: $("pm-download"),
    canvasScroll: $("pm-canvas-scroll"),
    canvasWrap: $("pm-canvas-wrap"),
    base: $("pm-base"),
    overlay: $("pm-overlay"),
    status: $("pm-status"),
    zoomOut: $("pm-zoom-out"),
    zoomIn: $("pm-zoom-in"),
    zoomFit: $("pm-zoom-fit"),
    zoomPct: $("pm-zoom-pct")
  };

  var baseCtx = els.base.getContext("2d");
  var overlayCtx = els.overlay.getContext("2d");
  var DOC_W = els.base.width, DOC_H = els.base.height;

  var state = {
    tool: "move",
    brushSize: 60,
    brushHardness: 40,
    brushMode: "erase"
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
     Layers — each is: a source image + a non-destructive transform
     (scale, x, y) + an optional crop rect + a persistent erase mask.
     The layer's own canvas is rebuilt from image+transform+crop on every
     change, then the erase mask (painted separately by the blend brush)
     is punched out of it — so panning/zooming a layer never touches the
     brush work already done on it, and vice versa.
     ------------------------------------------------------------------ */
  var layers = [];
  var activeLayerId = null;
  var layerSeq = 0;

  function createLayer(name, img) {
    layerSeq++;
    var canvas = document.createElement("canvas");
    canvas.width = DOC_W;
    canvas.height = DOC_H;

    var mask = document.createElement("canvas");
    mask.width = DOC_W;
    mask.height = DOC_H;

    var fitScale = Math.min(DOC_W / img.width, DOC_H / img.height);
    var scale = Math.min(1, fitScale) || 1;

    var layer = {
      id: "layer-" + layerSeq,
      name: name || ("Layer " + layerSeq),
      img: img,
      visible: true,
      opacity: 100,
      transform: {
        scale: scale,
        x: (DOC_W - img.width * scale) / 2,
        y: (DOC_H - img.height * scale) / 2
      },
      crop: null,
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      mask: mask,
      maskCtx: mask.getContext("2d")
    };
    redrawLayer(layer);
    return layer;
  }

  function layerById(id) {
    return layers.filter(function (l) { return l.id === id; })[0];
  }

  function activeLayer() {
    return layerById(activeLayerId) || layers[layers.length - 1] || null;
  }

  /** Rebuilds one layer's own canvas from its image + transform + crop,
      then punches its persisted erase mask out of the result. */
  function redrawLayer(layer) {
    var ctx = layer.ctx;
    ctx.clearRect(0, 0, DOC_W, DOC_H);

    ctx.save();
    if (layer.crop) {
      ctx.beginPath();
      ctx.rect(layer.crop.x, layer.crop.y, layer.crop.w, layer.crop.h);
      ctx.clip();
    }
    var t = layer.transform;
    ctx.drawImage(layer.img, t.x, t.y, layer.img.width * t.scale, layer.img.height * t.scale);
    ctx.restore();

    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(layer.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function compositeLayers() {
    baseCtx.clearRect(0, 0, DOC_W, DOC_H);
    layers.forEach(function (layer) {
      if (!layer.visible) return;
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
    els.emptyNote.hidden = layers.length > 0;

    var rows = [];
    for (var i = layers.length - 1; i >= 0; i--) {
      var layer = layers[i];
      rows.push(
        '<div class="pm-layer' + (layer.id === activeLayerId ? " is-active" : "") + '" data-layer-select="' + layer.id + '">' +
          '<div class="pm-layer-thumb" data-layer-thumb="' + layer.id + '"><canvas width="40" height="30"></canvas></div>' +
          '<div class="pm-layer-body">' +
            '<span class="pm-layer-name">' + escapeHtml(layer.name) + "</span>" +
            '<input type="range" class="pm-layer-opacity" min="0" max="100" value="' + layer.opacity + '" data-layer-opacity="' + layer.id + '">' +
          "</div>" +
          '<div class="pm-layer-actions">' +
            '<button type="button" class="pm-layer-btn" data-layer-visible="' + layer.id + '" title="Toggle visibility">' + (layer.visible ? EYE_ICON : EYE_OFF_ICON) + "</button>" +
            '<button type="button" class="pm-layer-btn" data-layer-up="' + layer.id + '" title="Move up"' + (i === layers.length - 1 ? " disabled" : "") + ">" + UP_ICON + "</button>" +
            '<button type="button" class="pm-layer-btn" data-layer-down="' + layer.id + '" title="Move down"' + (i === 0 ? " disabled" : "") + ">" + DOWN_ICON + "</button>" +
            '<button type="button" class="pm-layer-btn" data-layer-delete="' + layer.id + '" title="Delete layer">' + TRASH_ICON + "</button>" +
          "</div>" +
        "</div>"
      );
    }
    els.layersList.innerHTML = rows.join("");
    layers.forEach(refreshThumb);
    syncToolFieldsForActiveLayer();
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
    layers = layers.filter(function (l) { return l.id !== id; });
    if (activeLayerId === id) activeLayerId = layers.length ? layers[layers.length - 1].id : null;
    renderLayers();
    compositeLayers();
  }

  function syncToolFieldsForActiveLayer() {
    var layer = activeLayer();
    if (layer && state.tool === "move") {
      els.layerZoom.value = Math.round(layer.transform.scale * 100);
      els.layerZoomVal.textContent = els.layerZoom.value + "%";
    }
  }

  els.layersList.addEventListener("click", function (event) {
    var target;
    if ((target = event.target.closest("[data-layer-visible]"))) {
      layerById(target.getAttribute("data-layer-visible")).visible ^= true;
      renderLayers();
      compositeLayers();
      return;
    }
    if ((target = event.target.closest("[data-layer-up]"))) { moveLayer(target.getAttribute("data-layer-up"), 1); return; }
    if ((target = event.target.closest("[data-layer-down]"))) { moveLayer(target.getAttribute("data-layer-down"), -1); return; }
    if ((target = event.target.closest("[data-layer-delete]"))) { deleteLayer(target.getAttribute("data-layer-delete")); return; }
    if ((target = event.target.closest("[data-layer-select]"))) {
      activeLayerId = target.getAttribute("data-layer-select");
      renderLayers();
    }
  });

  els.layersList.addEventListener("input", function (event) {
    var input = event.target.closest("[data-layer-opacity]");
    if (!input) return;
    layerById(input.getAttribute("data-layer-opacity")).opacity = parseInt(input.value, 10);
    compositeLayers();
  });

  /* ------------------------------------------------------------------
     Loading images
     ------------------------------------------------------------------ */
  els.addImage.addEventListener("click", function () { els.fileInput.click(); });

  els.fileInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(els.fileInput.files || []);
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var layer = createLayer(file.name.replace(/\.[a-z0-9]+$/i, ""), img);
          layers.push(layer);
          activeLayerId = layer.id;
          renderLayers();
          compositeLayers();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    els.fileInput.value = "";
  });

  /* ------------------------------------------------------------------
     Tool picker
     ------------------------------------------------------------------ */
  $$("[data-choice='tool'] .pm-choice-card").forEach(function (card) {
    card.addEventListener("click", function () {
      $$("[data-choice='tool'] .pm-choice-card").forEach(function (c) { c.classList.toggle("is-active", c === card); });
      state.tool = card.getAttribute("data-value");
      els.zoomField.hidden = state.tool !== "move";
      els.cropField.hidden = state.tool !== "crop";
      els.brushField.hidden = state.tool !== "brush";
      overlayCtx.clearRect(0, 0, DOC_W, DOC_H);
      cropRect = null;
      syncToolFieldsForActiveLayer();
    });
  });

  els.layerZoom.addEventListener("input", function () {
    var layer = activeLayer();
    if (!layer) return;
    var newScale = parseInt(els.layerZoom.value, 10) / 100;
    els.layerZoomVal.textContent = els.layerZoom.value + "%";
    /* Zoom around the layer's current center, not its top-left corner —
       otherwise every zoom change also silently drags the image. */
    var t = layer.transform;
    var cx = t.x + (layer.img.width * t.scale) / 2;
    var cy = t.y + (layer.img.height * t.scale) / 2;
    t.scale = newScale;
    t.x = cx - (layer.img.width * newScale) / 2;
    t.y = cy - (layer.img.height * newScale) / 2;
    redrawLayer(layer);
    compositeLayers();
    refreshActiveThumb();
  });

  $$("[data-brush-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      $$("[data-brush-mode]").forEach(function (b) { b.classList.remove("is-active"); });
      button.classList.add("is-active");
      state.brushMode = button.getAttribute("data-brush-mode");
    });
  });
  els.brushModeErase.classList.add("is-active");

  els.brushSize.addEventListener("input", function () {
    state.brushSize = parseInt(els.brushSize.value, 10);
    els.brushSizeVal.textContent = state.brushSize + "px";
  });
  els.brushHardness.addEventListener("input", function () {
    state.brushHardness = parseInt(els.brushHardness.value, 10);
    els.brushHardnessVal.textContent = state.brushHardness + "%";
  });

  /* ------------------------------------------------------------------
     History — per-layer snapshots of {transform, crop, mask}, taken
     before a destructive action. Undo restores exactly that layer's
     edit state and redraws it.
     ------------------------------------------------------------------ */
  var HISTORY_LIMIT = 30;
  var undoStack = [];
  var redoStack = [];

  function snapshotLayer(layer) {
    return {
      layerId: layer.id,
      transform: { scale: layer.transform.scale, x: layer.transform.x, y: layer.transform.y },
      crop: layer.crop ? { x: layer.crop.x, y: layer.crop.y, w: layer.crop.w, h: layer.crop.h } : null,
      maskUrl: layer.mask.toDataURL("image/png")
    };
  }

  function pushHistory() {
    var layer = activeLayer();
    if (!layer) return;
    undoStack.push(snapshotLayer(layer));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    syncHistoryButtons();
  }

  function restoreSnapshot(entry, callback) {
    var layer = layerById(entry.layerId);
    if (!layer) return;
    var img = new Image();
    img.onload = function () {
      layer.transform = entry.transform;
      layer.crop = entry.crop;
      layer.maskCtx.clearRect(0, 0, DOC_W, DOC_H);
      layer.maskCtx.drawImage(img, 0, 0);
      redrawLayer(layer);
      compositeLayers();
      renderLayers();
      if (callback) callback();
    };
    img.src = entry.maskUrl;
  }

  function syncHistoryButtons() {
    els.undo.disabled = undoStack.length === 0;
    els.redo.disabled = redoStack.length === 0;
  }

  els.undo.addEventListener("click", function () {
    if (!undoStack.length) return;
    var entry = undoStack.pop();
    var layer = layerById(entry.layerId);
    if (layer) redoStack.push(snapshotLayer(layer));
    restoreSnapshot(entry);
    syncHistoryButtons();
  });

  els.redo.addEventListener("click", function () {
    if (!redoStack.length) return;
    var entry = redoStack.pop();
    var layer = layerById(entry.layerId);
    if (layer) undoStack.push(snapshotLayer(layer));
    restoreSnapshot(entry);
    syncHistoryButtons();
  });

  document.addEventListener("keydown", function (event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    var key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); els.undo.click(); }
    else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); els.redo.click(); }
  });

  /* ------------------------------------------------------------------
     Canvas interaction — move (pan), crop (drag a box), brush (blend)
     ------------------------------------------------------------------ */
  var dragging = false;
  var dragStart = null;
  var dragOrigin = null;
  var cropRect = null;

  function pointFromEvent(event) {
    var rect = els.overlay.getBoundingClientRect();
    var scaleX = els.overlay.width / rect.width;
    var scaleY = els.overlay.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function drawCropOverlay() {
    overlayCtx.clearRect(0, 0, DOC_W, DOC_H);
    if (!cropRect) return;
    overlayCtx.save();
    overlayCtx.fillStyle = "rgba(0,0,0,0.35)";
    overlayCtx.fillRect(0, 0, DOC_W, DOC_H);
    overlayCtx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    overlayCtx.strokeStyle = "#e2972e";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    overlayCtx.restore();
  }

  function paintBrush(layer, point) {
    var ctx = layer.maskCtx;
    var r = state.brushSize / 2;
    var hardness = state.brushHardness / 100;
    ctx.globalCompositeOperation = state.brushMode === "restore" ? "destination-out" : "source-over";
    var gradient = ctx.createRadialGradient(point.x, point.y, r * hardness, point.x, point.y, r);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function strokeBrushBetween(layer, from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var spacing = Math.max(1, state.brushSize * 0.2);
    var steps = Math.max(1, Math.ceil(dist / spacing));
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      paintBrush(layer, { x: from.x + dx * t, y: from.y + dy * t });
    }
  }

  els.overlay.addEventListener("pointerdown", function (event) {
    var layer = activeLayer();
    if (!layer) return;
    var point = pointFromEvent(event);
    dragging = true;
    els.overlay.setPointerCapture(event.pointerId);

    if (state.tool === "move") {
      dragStart = point;
      dragOrigin = { x: layer.transform.x, y: layer.transform.y };
      pushHistory();
    } else if (state.tool === "crop") {
      dragStart = point;
      cropRect = { x: point.x, y: point.y, w: 0, h: 0 };
      drawCropOverlay();
    } else if (state.tool === "brush") {
      pushHistory();
      dragStart = point;
      paintBrush(layer, point);
      redrawLayer(layer);
      compositeLayers();
    }
  });

  els.overlay.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    var layer = activeLayer();
    if (!layer) return;
    var point = pointFromEvent(event);

    if (state.tool === "move") {
      layer.transform.x = dragOrigin.x + (point.x - dragStart.x);
      layer.transform.y = dragOrigin.y + (point.y - dragStart.y);
      redrawLayer(layer);
      compositeLayers();
    } else if (state.tool === "crop") {
      cropRect = {
        x: Math.min(dragStart.x, point.x),
        y: Math.min(dragStart.y, point.y),
        w: Math.abs(point.x - dragStart.x),
        h: Math.abs(point.y - dragStart.y)
      };
      drawCropOverlay();
    } else if (state.tool === "brush") {
      strokeBrushBetween(layer, dragStart, point);
      dragStart = point;
      redrawLayer(layer);
      compositeLayers();
    }
  });

  function endStroke() {
    if (!dragging) return;
    dragging = false;
    var layer = activeLayer();
    if (layer) refreshThumb(layer);
  }

  els.overlay.addEventListener("pointerup", endStroke);
  els.overlay.addEventListener("pointercancel", endStroke);

  els.cropApply.addEventListener("click", function () {
    var layer = activeLayer();
    if (!layer || !cropRect || cropRect.w < 2 || cropRect.h < 2) return;
    pushHistory();
    layer.crop = { x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h };
    cropRect = null;
    overlayCtx.clearRect(0, 0, DOC_W, DOC_H);
    redrawLayer(layer);
    compositeLayers();
    refreshActiveThumb();
  });

  els.cropClear.addEventListener("click", function () {
    var layer = activeLayer();
    if (!layer) return;
    pushHistory();
    layer.crop = null;
    cropRect = null;
    overlayCtx.clearRect(0, 0, DOC_W, DOC_H);
    redrawLayer(layer);
    compositeLayers();
    refreshActiveThumb();
  });

  /* ------------------------------------------------------------------
     Zoom (view only — separate from a layer's own zoom transform)
     ------------------------------------------------------------------ */
  var zoom = 1;

  function applyZoom() {
    var w = Math.round(DOC_W * zoom);
    var h = Math.round(DOC_H * zoom);
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
    setZoom(Math.min(1, (rect.width - pad) / DOC_W, (rect.height - pad) / DOC_H));
  });

  /* ------------------------------------------------------------------
     Reset / download
     ------------------------------------------------------------------ */
  els.reset.addEventListener("click", function () {
    layers = [];
    activeLayerId = null;
    undoStack.length = 0;
    redoStack.length = 0;
    syncHistoryButtons();
    renderLayers();
    compositeLayers();
  });

  els.download.addEventListener("click", function () {
    els.base.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "merged.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  });

  els.status.textContent = DOC_W + " × " + DOC_H + "px";
  syncHistoryButtons();
  renderLayers();
  compositeLayers();
})();
