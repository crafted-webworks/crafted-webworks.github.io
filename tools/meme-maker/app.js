/* Meme Maker — fully self-contained, no globals leaked, no network calls.
   One paint() routine draws both the live preview and the PNG export
   (see tools/STANDARDS.md §6). */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var FONT_STACK = 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
  var MAX_IMAGE_DIM = 1600;
  var DEFAULT_W = 800;
  var DEFAULT_H = 600;

  var state = {
    image: null,
    bgColor: "#cfd8dc",
    canvasW: DEFAULT_W,
    canvasH: DEFAULT_H,
    top: { text: "", fontSize: 54, fill: "#ffffff", stroke: "#000000", strokeWidth: 6, strokeOn: true },
    bottom: { text: "", fontSize: 54, fill: "#ffffff", stroke: "#000000", strokeWidth: 6, strokeOn: true },
    boxes: [],
    selectedBoxId: null,
    nextId: 1,
    lastBounds: {}
  };

  var els = {
    fileInput: $("#mm-file-input"),
    dropzone: $("#mm-dropzone"),
    dropLabel: $("#mm-drop-label"),
    placeholderSwatches: $("#mm-placeholder-swatches"),

    topText: $("#mm-top-text"),
    bottomText: $("#mm-bottom-text"),
    captionFontSize: $("#mm-caption-fontsize"),
    captionFontSizeVal: $("#mm-caption-fontsize-val"),
    captionStrokeToggle: $("#mm-caption-stroke-toggle"),
    captionStrokeControls: $("#mm-caption-stroke-controls"),
    captionStrokeWidth: $("#mm-caption-stroke-width"),
    captionStrokeWidthVal: $("#mm-caption-stroke-width-val"),

    addText: $("#mm-add-text"),
    boxesEmpty: $("#mm-boxes-empty"),
    boxesList: $("#mm-boxes-list"),
    boxEditor: $("#mm-box-editor"),
    boxText: $("#mm-box-text"),
    boxFontSize: $("#mm-box-fontsize"),
    boxFontSizeVal: $("#mm-box-fontsize-val"),
    boxStrokeToggle: $("#mm-box-stroke-toggle"),
    boxStrokeControls: $("#mm-box-stroke-controls"),
    boxStrokeWidth: $("#mm-box-stroke-width"),
    boxStrokeWidthVal: $("#mm-box-stroke-width-val"),
    boxDelete: $("#mm-box-delete"),

    canvas: $("#mm-canvas"),
    status: $("#mm-status"),
    download: $("#mm-download")
  };

  var ctx = els.canvas.getContext("2d");

  /* ------------------------------------------------------------------
     Status line
     ------------------------------------------------------------------ */
  function showStatus(message, isError) {
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", !!isError);
  }

  /* ------------------------------------------------------------------
     Text measuring / wrapping helpers
     ------------------------------------------------------------------ */
  function wrapText(context, text, maxWidth) {
    var paragraphs = String(text).split(/\r?\n/);
    var lines = [];
    paragraphs.forEach(function (para) {
      var words = para.split(" ").filter(function (w) { return w.length > 0; });
      if (words.length === 0) { lines.push(""); return; }
      var current = "";
      words.forEach(function (word) {
        var test = current ? current + " " + word : word;
        if (current && context.measureText(test).width > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      });
      if (current) lines.push(current);
    });
    return lines;
  }

  function drawStrokedText(context, text, x, y, style) {
    context.lineJoin = "round";
    context.miterLimit = 2;
    if (style.strokeOn && style.strokeWidth > 0) {
      context.strokeStyle = style.stroke;
      context.lineWidth = style.strokeWidth;
      context.strokeText(text, x, y);
    }
    context.fillStyle = style.fill;
    context.fillText(text, x, y);
  }

  /* ------------------------------------------------------------------
     The one paint routine — used for the live preview AND the export.
     ------------------------------------------------------------------ */
  function drawCaption(context, capState, w, h, edge) {
    context.font = "bold " + capState.fontSize + "px " + FONT_STACK;
    context.textAlign = "center";
    context.textBaseline = "top";
    var maxWidth = w * 0.92;
    var lines = wrapText(context, capState.text.toUpperCase(), maxWidth);
    var lineHeight = capState.fontSize * 1.15;
    var totalHeight = lines.length * lineHeight;
    var padding = Math.max(10, capState.fontSize * 0.15);
    var blockY = edge === "top" ? padding : (h - padding - totalHeight);
    blockY = Math.max(0, Math.min(blockY, h - totalHeight));

    lines.forEach(function (line, i) {
      drawStrokedText(context, line, w / 2, blockY + i * lineHeight, capState);
    });

    return { x: w / 2 - maxWidth / 2, y: blockY, width: maxWidth, height: totalHeight };
  }

  function drawBox(context, box, w) {
    context.font = "bold " + box.fontSize + "px " + FONT_STACK;
    context.textBaseline = "top";
    var maxWidth = Math.min(w * 0.85, 900);
    var lines = wrapText(context, box.text, maxWidth);
    var lineHeight = box.fontSize * 1.15;
    var totalHeight = lines.length * lineHeight;

    var widths = lines.map(function (line) { return context.measureText(line).width; });
    var blockWidth = widths.length ? Math.max.apply(null, widths) : 0;

    context.textAlign = box.align;
    lines.forEach(function (line, i) {
      drawStrokedText(context, line, box.x, box.y + i * lineHeight, box);
    });

    var left;
    if (box.align === "left") left = box.x;
    else if (box.align === "right") left = box.x - blockWidth;
    else left = box.x - blockWidth / 2;

    return { x: left, y: box.y, width: blockWidth, height: totalHeight };
  }

  function drawSelection(context, bounds) {
    var pad = 8;
    context.save();
    context.setLineDash([6, 4]);
    context.strokeStyle = "#e2972e";
    context.lineWidth = 2;
    context.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
    context.restore();
  }

  function paint(context, w, h, opts) {
    opts = opts || {};
    context.clearRect(0, 0, w, h);

    if (state.image) {
      context.drawImage(state.image, 0, 0, w, h);
    } else {
      context.fillStyle = state.bgColor;
      context.fillRect(0, 0, w, h);
    }

    var bounds = {};
    if (state.top.text.trim()) bounds.top = drawCaption(context, state.top, w, h, "top");
    if (state.bottom.text.trim()) bounds.bottom = drawCaption(context, state.bottom, w, h, "bottom");

    state.boxes.forEach(function (box) {
      if (!box.text.trim()) return;
      bounds[box.id] = drawBox(context, box, w);
    });

    if (!opts.forExport) {
      state.lastBounds = bounds;
      var selId = state.selectedBoxId;
      if (selId && bounds[selId]) drawSelection(context, bounds[selId]);
    }
  }

  function render() {
    paint(ctx, els.canvas.width, els.canvas.height, {});
  }

  /* ------------------------------------------------------------------
     Canvas sizing / image + placeholder loading
     ------------------------------------------------------------------ */
  function applyCanvasSize() {
    els.canvas.width = state.canvasW;
    els.canvas.height = state.canvasH;
  }

  function setPlaceholder(color) {
    state.image = null;
    state.bgColor = color;
    state.canvasW = DEFAULT_W;
    state.canvasH = DEFAULT_H;
    applyCanvasSize();
    els.dropzone.classList.remove("has-file");
    els.dropLabel.textContent = "Click or drop an image";
    render();
  }

  function loadImageFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      showStatus("Please choose an image file.", true);
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        state.image = img;
        var w = img.naturalWidth || 1, h = img.naturalHeight || 1;
        var scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
        state.canvasW = Math.max(1, Math.round(w * scale));
        state.canvasH = Math.max(1, Math.round(h * scale));
        applyCanvasSize();
        els.dropzone.classList.add("has-file");
        els.dropLabel.textContent = file.name || "Image loaded";
        showStatus("Image loaded.");
        render();
      };
      img.onerror = function () { showStatus("Could not load that image.", true); };
      img.src = e.target.result;
    };
    reader.onerror = function () { showStatus("Could not read that file.", true); };
    reader.readAsDataURL(file);
  }

  els.fileInput.addEventListener("change", function () {
    if (els.fileInput.files && els.fileInput.files[0]) loadImageFile(els.fileInput.files[0]);
  });

  ["dragover", "dragenter"].forEach(function (evt) {
    els.dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      els.dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend"].forEach(function (evt) {
    els.dropzone.addEventListener(evt, function () {
      els.dropzone.classList.remove("is-dragover");
    });
  });
  els.dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    els.dropzone.classList.remove("is-dragover");
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  $$(".mm-swatch[data-color]", els.placeholderSwatches).forEach(function (swatch) {
    swatch.addEventListener("click", function () {
      $$(".mm-swatch", els.placeholderSwatches).forEach(function (s) { s.classList.remove("is-active"); });
      swatch.classList.add("is-active");
      setPlaceholder(swatch.getAttribute("data-color"));
    });
  });

  /* ------------------------------------------------------------------
     Classic top/bottom captions
     ------------------------------------------------------------------ */
  els.topText.addEventListener("input", function () {
    state.top.text = els.topText.value;
    render();
  });
  els.bottomText.addEventListener("input", function () {
    state.bottom.text = els.bottomText.value;
    render();
  });

  els.captionFontSize.addEventListener("input", function () {
    var val = parseInt(els.captionFontSize.value, 10);
    state.top.fontSize = val;
    state.bottom.fontSize = val;
    els.captionFontSizeVal.textContent = val + "px";
    render();
  });

  els.captionStrokeToggle.addEventListener("change", function () {
    var on = els.captionStrokeToggle.checked;
    state.top.strokeOn = on;
    state.bottom.strokeOn = on;
    els.captionStrokeControls.hidden = !on;
    render();
  });

  els.captionStrokeWidth.addEventListener("input", function () {
    var val = parseInt(els.captionStrokeWidth.value, 10);
    state.top.strokeWidth = val;
    state.bottom.strokeWidth = val;
    els.captionStrokeWidthVal.textContent = val + "px";
    render();
  });

  /* ------------------------------------------------------------------
     Generic swatch-row wiring — each group maps to a setter function.
     ------------------------------------------------------------------ */
  var SWATCH_SETTERS = {
    "caption-fill": function (v) { state.top.fill = v; state.bottom.fill = v; },
    "caption-stroke": function (v) { state.top.stroke = v; state.bottom.stroke = v; },
    "box-fill": function (v) { var b = getSelectedBox(); if (b) b.fill = v; },
    "box-stroke": function (v) { var b = getSelectedBox(); if (b) b.stroke = v; }
  };

  $$("[data-swatches]").forEach(function (row) {
    var group = row.getAttribute("data-swatches");
    var setter = SWATCH_SETTERS[group];
    if (!setter) return;

    $$(".mm-swatch[data-value]", row).forEach(function (swatch) {
      swatch.addEventListener("click", function () {
        $$(".mm-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
        swatch.classList.add("is-active");
        setter(swatch.getAttribute("data-value"));
        render();
      });
    });

    var customInput = row.querySelector('input[type="color"]');
    if (customInput) {
      customInput.addEventListener("input", function () {
        $$(".mm-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
        customInput.closest(".mm-swatch").classList.add("is-active");
        setter(customInput.value);
        render();
      });
    }
  });

  /* ------------------------------------------------------------------
     Free text boxes
     ------------------------------------------------------------------ */
  function getSelectedBox() {
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].id === state.selectedBoxId) return state.boxes[i];
    }
    return null;
  }

  function makeBox() {
    var id = "box" + (state.nextId++);
    return {
      id: id,
      text: "New text",
      x: state.canvasW / 2,
      y: state.canvasH / 2,
      fontSize: 36,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 4,
      strokeOn: true,
      align: "center"
    };
  }

  function selectBox(id) {
    state.selectedBoxId = id;
    renderBoxesList();
    renderBoxEditor();
    render();
  }

  function deleteBox(id) {
    state.boxes = state.boxes.filter(function (b) { return b.id !== id; });
    if (state.selectedBoxId === id) state.selectedBoxId = null;
    renderBoxesList();
    renderBoxEditor();
    render();
  }

  function boxLabel(box) {
    var t = box.text.trim();
    return t ? (t.length > 24 ? t.slice(0, 24) + "…" : t) : "(empty text box)";
  }

  function renderBoxesList() {
    els.boxesList.innerHTML = "";
    els.boxesEmpty.hidden = state.boxes.length > 0;

    state.boxes.forEach(function (box) {
      var row = document.createElement("div");
      row.className = "mm-box-row" + (box.id === state.selectedBoxId ? " is-active" : "");

      var label = document.createElement("button");
      label.type = "button";
      label.className = "mm-box-row-label";
      label.textContent = boxLabel(box);
      label.addEventListener("click", function () { selectBox(box.id); });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mm-box-row-remove";
      remove.setAttribute("aria-label", "Delete text box");
      remove.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      remove.addEventListener("click", function () { deleteBox(box.id); });

      row.appendChild(label);
      row.appendChild(remove);
      els.boxesList.appendChild(row);
    });
  }

  function setActiveSwatchByValue(row, value) {
    var matched = false;
    $$(".mm-swatch[data-value]", row).forEach(function (s) {
      var isMatch = s.getAttribute("data-value").toLowerCase() === String(value).toLowerCase();
      s.classList.toggle("is-active", isMatch);
      if (isMatch) matched = true;
    });
    var customSwatch = row.querySelector(".mm-swatch--custom");
    var customInput = row.querySelector('input[type="color"]');
    if (customSwatch) customSwatch.classList.toggle("is-active", !matched);
    if (customInput && !matched) customInput.value = value;
  }

  function renderBoxEditor() {
    var box = getSelectedBox();
    if (!box) {
      els.boxEditor.hidden = true;
      return;
    }
    els.boxEditor.hidden = false;
    els.boxText.value = box.text;
    els.boxFontSize.value = box.fontSize;
    els.boxFontSizeVal.textContent = box.fontSize + "px";
    els.boxStrokeToggle.checked = box.strokeOn;
    els.boxStrokeControls.hidden = !box.strokeOn;
    els.boxStrokeWidth.value = box.strokeWidth;
    els.boxStrokeWidthVal.textContent = box.strokeWidth + "px";

    $$(".mm-pill[data-align]").forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-align") === box.align);
    });

    setActiveSwatchByValue($('[data-swatches="box-fill"]'), box.fill);
    setActiveSwatchByValue($('[data-swatches="box-stroke"]'), box.stroke);
  }

  els.addText.addEventListener("click", function () {
    var box = makeBox();
    state.boxes.push(box);
    selectBox(box.id);
  });

  els.boxText.addEventListener("input", function () {
    var box = getSelectedBox();
    if (!box) return;
    box.text = els.boxText.value;
    renderBoxesList();
    render();
  });

  els.boxFontSize.addEventListener("input", function () {
    var box = getSelectedBox();
    if (!box) return;
    box.fontSize = parseInt(els.boxFontSize.value, 10);
    els.boxFontSizeVal.textContent = box.fontSize + "px";
    render();
  });

  els.boxStrokeToggle.addEventListener("change", function () {
    var box = getSelectedBox();
    if (!box) return;
    box.strokeOn = els.boxStrokeToggle.checked;
    els.boxStrokeControls.hidden = !box.strokeOn;
    render();
  });

  els.boxStrokeWidth.addEventListener("input", function () {
    var box = getSelectedBox();
    if (!box) return;
    box.strokeWidth = parseInt(els.boxStrokeWidth.value, 10);
    els.boxStrokeWidthVal.textContent = box.strokeWidth + "px";
    render();
  });

  $$(".mm-pill[data-align]").forEach(function (pill) {
    pill.addEventListener("click", function () {
      var box = getSelectedBox();
      if (!box) return;
      $$(".mm-pill[data-align]").forEach(function (p) { p.classList.toggle("is-active", p === pill); });
      box.align = pill.getAttribute("data-align");
      render();
    });
  });

  els.boxDelete.addEventListener("click", function () {
    if (state.selectedBoxId) deleteBox(state.selectedBoxId);
  });

  /* ------------------------------------------------------------------
     Canvas drag-to-move for free text boxes
     ------------------------------------------------------------------ */
  var dragState = null;

  function getCanvasPoint(evt) {
    var rect = els.canvas.getBoundingClientRect();
    var scaleX = els.canvas.width / rect.width;
    var scaleY = els.canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  }

  function hitTestBox(point) {
    for (var i = state.boxes.length - 1; i >= 0; i--) {
      var box = state.boxes[i];
      var b = state.lastBounds[box.id];
      if (!b) continue;
      var pad = 10;
      if (point.x >= b.x - pad && point.x <= b.x + b.width + pad &&
          point.y >= b.y - pad && point.y <= b.y + b.height + pad) {
        return box.id;
      }
    }
    return null;
  }

  els.canvas.addEventListener("pointerdown", function (e) {
    var point = getCanvasPoint(e);
    var hitId = hitTestBox(point);
    if (hitId) {
      var box = state.boxes.find(function (b) { return b.id === hitId; });
      dragState = { id: hitId, offsetX: point.x - box.x, offsetY: point.y - box.y };
      els.canvas.setPointerCapture(e.pointerId);
      els.canvas.classList.add("is-dragging");
      selectBox(hitId);
    } else if (state.selectedBoxId) {
      selectBox(null);
    }
  });

  els.canvas.addEventListener("pointermove", function (e) {
    if (!dragState) return;
    var point = getCanvasPoint(e);
    var box = state.boxes.find(function (b) { return b.id === dragState.id; });
    if (!box) return;
    box.x = Math.max(0, Math.min(state.canvasW, point.x - dragState.offsetX));
    box.y = Math.max(0, Math.min(state.canvasH, point.y - dragState.offsetY));
    render();
  });

  function endDrag(e) {
    if (!dragState) return;
    try { els.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dragState = null;
    els.canvas.classList.remove("is-dragging");
  }
  els.canvas.addEventListener("pointerup", endDrag);
  els.canvas.addEventListener("pointercancel", endDrag);

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */
  els.download.addEventListener("click", function () {
    var w = els.canvas.width, h = els.canvas.height;
    var off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    var octx = off.getContext("2d");
    paint(octx, w, h, { forExport: true });

    off.toBlob(function (blob) {
      if (!blob) {
        showStatus("Export failed — try again.", true);
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "meme.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showStatus("PNG downloaded.");
    }, "image/png");
  });

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  applyCanvasSize();
  renderBoxesList();
  renderBoxEditor();
  render();
})();
