/* ==========================================================================
   Creative Studio — fully self-contained (see tools/STANDARDS.md). One IIFE,
   no globals leaked, no network calls anywhere. Nothing is uploaded; every
   feature runs entirely on-canvas in the browser.

   This merges five formerly-separate tools behind one top-level mode
   switcher (pill tabs, STANDARDS.md §4): Meme, Filters, Enhance,
   Gradient & Palette, Logo. Each mode keeps its own internal module
   (MemeMode / FiltersMode / EnhanceMode / GradientMode / LogoMode) so the
   file stays navigable, but it is still one script, one IIFE. DOM ids never
   collided across the five originals (mm-*, pf-*, ie-*, gps-*, lm-*), so
   each module's own querying code is otherwise unchanged from its source
   tool. Genuinely identical UI-wiring shapes that were duplicated near
   verbatim across the five originals (pill-tab wiring, swatch-row wiring,
   choice-card wiring, the angle dial, clipboard copy, triggered downloads)
   are factored into the CS.* shared helpers below and reused by whichever
   modules need them.
   ========================================================================== */
(function () {
  "use strict";

  /* ========================================================================
     SHARED HELPERS — used by more than one mode. Each one is the single
     surviving copy of a shape that was duplicated near-identically across
     the five original tools (see tools/STANDARDS.md §4, §10).
     ========================================================================== */
  var CS = {};

  CS.$ = function (id) { return document.getElementById(id); };
  CS.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  CS.clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  /** Pill-tab wiring — toggles `is-active` + aria-selected across a group
      of buttons and calls back with whichever one was clicked. Used by the
      top-level mode switcher and by every mode that has its own internal
      tab group (Gradient's sub-modes + harmony tabs, Enhance's tabs, Logo's
      section + format tabs). */
  CS.wireTabs = function (buttons, onSelect) {
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        buttons.forEach(function (b) {
          var active = b === button;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
        onSelect(button);
      });
    });
  };

  /** Generic swatch-row wiring — any row containing `button[data-value]`
      swatches plus an optional custom `<input type="color">` swatch. Not
      tied to a mode's own class names (mm-swatch / gps-swatch / lm-swatch),
      only to the shared structure all three used, so one function serves
      all of them. Calls onChange(value) and keeps `is-active` in sync. */
  CS.wireSwatchRow = function (row, onChange) {
    if (!row) return null;
    var buttons = CS.$$("button[data-value]", row);
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        onChange(btn.getAttribute("data-value"), btn);
      });
    });
    var customInput = row.querySelector('input[type="color"]');
    if (customInput) {
      customInput.addEventListener("input", function () {
        buttons.forEach(function (b) { b.classList.remove("is-active"); });
        var customBtn = customInput.closest("button");
        if (customBtn) customBtn.classList.add("is-active");
        onChange(customInput.value, customBtn);
      });
    }
    return { buttons: buttons, customInput: customInput };
  };

  /** Marks the swatch (or the custom swatch, syncing its color input)
      matching `value` as active — the read side of wireSwatchRow, used
      whenever a mode needs to reflect state back into a swatch row (e.g.
      after selecting a different logo layer or gradient stop). */
  CS.syncSwatchRow = function (row, value) {
    if (!row) return;
    var matched = false;
    CS.$$("button[data-value]", row).forEach(function (b) {
      var isMatch = b.getAttribute("data-value").toLowerCase() === String(value).toLowerCase();
      b.classList.toggle("is-active", isMatch);
      if (isMatch) matched = true;
    });
    var customBtn = row.querySelector('input[type="color"]');
    if (customBtn) {
      var wrap = customBtn.closest("button");
      if (wrap) wrap.classList.toggle("is-active", !matched);
      if (!matched) customBtn.value = value;
    }
  };

  /** Generic choice-card wiring — a group of `button[data-value]` cards
      (gradient type / radial shape / upscale factor / logo layout), where
      exactly one is active at a time. Structure-based like wireSwatchRow,
      so it works regardless of a mode's own card class name. */
  CS.wireChoiceCards = function (group, onChange) {
    if (!group) return [];
    var cards = CS.$$("button[data-value]", group);
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        cards.forEach(function (c) { c.classList.remove("is-active"); });
        card.classList.add("is-active");
        onChange(card.getAttribute("data-value"), card);
      });
    });
    return cards;
  };

  /** Angle dial — click or drag anywhere on the face points the handle
      straight at the pointer. atan2(dy, dx) convention, 0deg = east,
      increasing clockwise, so the number shown lines up 1:1 with a canvas
      `createLinearGradient` angle (STANDARDS.md §4). Only Gradient mode
      uses this today, but it's kept as a shared, structure-based helper
      rather than inlined, since it's the one true implementation. */
  CS.wireAngleDial = function (face, valueLabel, initialAngle, onChange) {
    if (!face) return;

    function setAngle(angle) {
      angle = ((Math.round(angle) % 360) + 360) % 360;
      face.style.setProperty("--angle", angle + "deg");
      face.setAttribute("aria-valuenow", String(angle));
      if (valueLabel) valueLabel.textContent = angle + "°";
      onChange(angle);
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
      var current = parseInt(face.getAttribute("aria-valuenow"), 10) || 0;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") { setAngle(current + 15); event.preventDefault(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { setAngle(current - 15); event.preventDefault(); }
    });

    face.style.setProperty("--angle", initialAngle + "deg");
    face.setAttribute("aria-valuenow", String(initialAngle));
    if (valueLabel) valueLabel.textContent = initialAngle + "°";
  };

  /** Clipboard copy with an execCommand fallback for engines without the
      async Clipboard API (or where it's blocked, e.g. some iframe/file://
      contexts). Used by Gradient mode's "Copy CSS" and palette swatches. */
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

  CS.copyText = function (text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { if (cb) cb(true); },
        function () { fallbackCopy(text, cb); }
      );
    } else {
      fallbackCopy(text, cb);
    }
  };

  /** Triggers a browser download for a Blob (or an already-built object
      URL). Used by every mode's export button. */
  CS.triggerDownload = function (blobOrUrl, filename) {
    var url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  CS.hexToRgb = function (hex) {
    var clean = String(hex).replace("#", "");
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  };

  /** Decodes a File into an <img> via FileReader — the one surviving copy
      of a FileReader→Image boilerplate that used to be duplicated near-
      identically in Meme, Filters and Enhance modes' own upload handlers
      (STANDARDS.md §10). onLoad(img) fires once fully decoded; onError
      (message) fires for a non-image file, an unreadable file, or a file
      that fails to decode as an image. */
  CS.decodeImageFile = function (file, onLoad, onError) {
    if (!file || !/^image\//.test(file.type)) {
      if (onError) onError("Please choose an image file.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () { onLoad(img); };
      img.onerror = function () { if (onError) onError("Could not load that image."); };
      img.src = e.target.result;
    };
    reader.onerror = function () { if (onError) onError("Could not read that file."); };
    reader.readAsDataURL(file);
  };

  /** ONE shared photo, loaded once (via the app-bar's "Add Image" control,
      or via any of Meme/Filters/Enhance's own local pickers) and reused by
      default across those three photo-editing modes, instead of the user
      uploading the same image separately into each one. Gradient &
      Palette's "Extract from Image" sub-tab and Logo mode are a different
      concern (an arbitrary reference image / no photo at all) and are
      deliberately not wired to this.

      Each of the three photo modes registers itself with `CS.onSharedImage`
      under its own name; `CS.setSharedImage` fans a newly-loaded image out
      to every OTHER registered mode (the mode that originated the load —
      passed as `sourceMode` — already applied it to itself directly, so
      it's skipped to avoid a redundant re-render). The app-bar's own
      control has no "home" mode, so it passes `null` and reaches all
      three. */
  CS.sharedImage = null;
  var sharedImageListeners = [];
  CS.onSharedImage = function (modeName, fn) {
    sharedImageListeners.push({ mode: modeName, fn: fn });
  };
  CS.setSharedImage = function (img, sourceMode) {
    CS.sharedImage = img;
    sharedImageListeners.forEach(function (listener) {
      if (listener.mode !== sourceMode) listener.fn(img);
    });
  };

  /* ========================================================================
     MEME MODE (ported from tools/meme-maker/app.js). One paint() routine
     draws both the live preview and the PNG export (STANDARDS.md §6).
     ========================================================================== */
  var MemeMode = (function () {
    var $ = CS.$, $$ = CS.$$;

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

    var els, ctx;

    function showStatus(message, isError) {
      els.status.textContent = message || "";
      els.status.classList.toggle("is-error", !!isError);
    }

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
      context.strokeStyle = "#ffb020";
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

    /** Applies an already-decoded image to the meme canvas — the one
        surviving copy of "an image just became this mode's active image"
        logic, used both by this mode's own file/drop upload AND by an
        image loaded through the shared app-bar control or another photo
        mode's picker (see CS.onSharedImage below). */
    function applyImage(img, label) {
      state.image = img;
      var w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
      var scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
      state.canvasW = Math.max(1, Math.round(w * scale));
      state.canvasH = Math.max(1, Math.round(h * scale));
      applyCanvasSize();
      els.dropzone.classList.add("has-file");
      els.dropLabel.textContent = label || "Image loaded";
      showStatus("Image loaded.");
      render();
    }

    function loadImageFile(file) {
      CS.decodeImageFile(file, function (img) {
        applyImage(img, file.name || "Image loaded");
        // This mode's own picker also becomes the shared photo other
        // photo modes default to (STANDARDS.md fix: one upload, not one
        // per mode). "meme" is excluded from the fan-out since it already
        // applied the image to itself above.
        CS.setSharedImage(img, "meme");
      }, function (message) {
        showStatus(message, true);
      });
    }

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

      CS.syncSwatchRow(document.querySelector('[data-swatches="box-fill"]'), box.fill);
      CS.syncSwatchRow(document.querySelector('[data-swatches="box-stroke"]'), box.stroke);
    }

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

    var dragState = null;

    function init() {
      els = {
        fileInput: $("mm-file-input"),
        dropzone: $("mm-dropzone"),
        dropLabel: $("mm-drop-label"),
        placeholderSwatches: $("mm-placeholder-swatches"),

        topText: $("mm-top-text"),
        bottomText: $("mm-bottom-text"),
        captionFontSize: $("mm-caption-fontsize"),
        captionFontSizeVal: $("mm-caption-fontsize-val"),
        captionStrokeToggle: $("mm-caption-stroke-toggle"),
        captionStrokeControls: $("mm-caption-stroke-controls"),
        captionStrokeWidth: $("mm-caption-stroke-width"),
        captionStrokeWidthVal: $("mm-caption-stroke-width-val"),

        addText: $("mm-add-text"),
        boxesEmpty: $("mm-boxes-empty"),
        boxesList: $("mm-boxes-list"),
        boxEditor: $("mm-box-editor"),
        boxText: $("mm-box-text"),
        boxFontSize: $("mm-box-fontsize"),
        boxFontSizeVal: $("mm-box-fontsize-val"),
        boxStrokeToggle: $("mm-box-stroke-toggle"),
        boxStrokeControls: $("mm-box-stroke-controls"),
        boxStrokeWidth: $("mm-box-stroke-width"),
        boxStrokeWidthVal: $("mm-box-stroke-width-val"),
        boxDelete: $("mm-box-delete"),

        canvas: $("mm-canvas"),
        status: $("mm-status"),
        download: $("mm-download")
      };
      ctx = els.canvas.getContext("2d");

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

      els.topText.addEventListener("input", function () { state.top.text = els.topText.value; render(); });
      els.bottomText.addEventListener("input", function () { state.bottom.text = els.bottomText.value; render(); });

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
        CS.wireSwatchRow(row, function (value) { setter(value); render(); });
      });

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

      els.download.addEventListener("click", function () {
        var w = els.canvas.width, h = els.canvas.height;
        var off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        var octx = off.getContext("2d");
        paint(octx, w, h, { forExport: true });

        off.toBlob(function (blob) {
          if (!blob) { showStatus("Export failed — try again.", true); return; }
          CS.triggerDownload(blob, "meme.png");
          showStatus("PNG downloaded.");
        }, "image/png");
      });

      applyCanvasSize();
      renderBoxesList();
      renderBoxEditor();
      render();

      // A photo loaded elsewhere (the app-bar's shared control, or
      // Filters'/Enhance's own picker) shows up here too — captions and
      // text boxes are left untouched, only the underlying photo changes.
      CS.onSharedImage("meme", function (img) { applyImage(img, "Shared photo"); });
    }

    return {
      init: init,
      /** Public entry point used by the shared app-bar control and by the
          other two photo modes' pickers. */
      setImage: function (img) { applyImage(img, "Shared photo"); }
    };
  })();

  /* ========================================================================
     FILTERS MODE (ported from tools/photo-filter-studio/app.js).
     ========================================================================== */
  var FiltersMode = (function () {
    var $ = CS.$, $$ = CS.$$, clamp = CS.clamp;

    var els, canvasCtx;

    var state = {
      image: null,
      naturalW: 0,
      naturalH: 0,
      preset: "original",
      activeCategory: "basic",
      showOriginal: false,
      adjust: { brightness: 0, contrast: 0, saturation: 0, vignette: 0 }
    };

    function buildFilterString(filter, adjust) {
      var b = clamp((filter.brightness || 100) + (adjust ? adjust.brightness : 0), 0, 300);
      var c = clamp((filter.contrast || 100) + (adjust ? adjust.contrast : 0), 0, 300);
      var s = clamp((filter.saturate || 100) + (adjust ? adjust.saturation : 0), 0, 300);
      var parts = [
        "brightness(" + b + "%)",
        "contrast(" + c + "%)",
        "saturate(" + s + "%)"
      ];
      if (filter.grayscale) parts.push("grayscale(" + filter.grayscale + "%)");
      if (filter.sepia) parts.push("sepia(" + filter.sepia + "%)");
      if (filter.hueRotate) parts.push("hue-rotate(" + filter.hueRotate + "deg)");
      if (filter.blur) parts.push("blur(" + filter.blur + "px)");
      if (filter.invert) parts.push("invert(" + filter.invert + "%)");
      return parts.join(" ");
    }

    function applyDuotone(data, params) {
      var shadow = CS.hexToRgb(params.shadow), light = CS.hexToRgb(params.highlight);
      for (var i = 0; i < data.length; i += 4) {
        var lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        data[i] = shadow.r + (light.r - shadow.r) * lum;
        data[i + 1] = shadow.g + (light.g - shadow.g) * lum;
        data[i + 2] = shadow.b + (light.b - shadow.b) * lum;
      }
    }

    function applyColorTemp(data, params) {
      var warmth = params.warmth || 0;
      var shiftR = warmth * 1.1;
      var shiftG = warmth * 0.25;
      var shiftB = -warmth * 1.1;
      for (var i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] + shiftR, 0, 255);
        data[i + 1] = clamp(data[i + 1] + shiftG, 0, 255);
        data[i + 2] = clamp(data[i + 2] + shiftB, 0, 255);
      }
    }

    function applyVintage(data, params) {
      var lift = params.lift != null ? params.lift : 22;
      var squeeze = params.squeeze != null ? params.squeeze : 0.82;
      var castR = params.castR || 8;
      var castG = params.castG || 2;
      var castB = params.castB || -10;
      for (var i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * squeeze + lift + castR, 0, 255);
        data[i + 1] = clamp(data[i + 1] * squeeze + lift + castG, 0, 255);
        data[i + 2] = clamp(data[i + 2] * squeeze + lift + castB, 0, 255);
      }
    }

    function applySharpen(imageData, params) {
      var amount = params.amount != null ? params.amount : 1;
      var w = imageData.width, h = imageData.height;
      var src = imageData.data;
      var out = new Uint8ClampedArray(src);
      var kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          for (var c = 0; c < 3; c++) {
            var sum = 0, k = 0;
            for (var ky = -1; ky <= 1; ky++) {
              for (var kx = -1; kx <= 1; kx++) {
                var idx = ((y + ky) * w + (x + kx)) * 4 + c;
                sum += src[idx] * kernel[k++];
              }
            }
            var outIdx = (y * w + x) * 4 + c;
            out[outIdx] = clamp(src[outIdx] + (sum - src[outIdx]) * amount, 0, 255);
          }
        }
      }
      imageData.data.set(out);
    }

    function applyVignette(ctx, w, h, amount) {
      if (amount <= 0) return;
      var grad = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.28,
        w / 2, h / 2, Math.max(w, h) * 0.72
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0," + (clamp(amount, 0, 100) / 100 * 0.85).toFixed(3) + ")");
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    var GENERATORS = { duotone: applyDuotone, colorTemp: applyColorTemp, vintage: applyVintage };

    var NO_OP_FILTER = { brightness: 100, contrast: 100, saturate: 100 };

    var PRESETS = [
      { id: "original", label: "Original", category: "basic", filter: NO_OP_FILTER },
      { id: "bright-airy", label: "Bright & Airy", category: "basic", filter: { brightness: 112, contrast: 97, saturate: 106 } },
      { id: "vivid-pop", label: "Vivid Pop", category: "basic", filter: { brightness: 103, contrast: 114, saturate: 148 } },
      { id: "soft-focus", label: "Soft Focus", category: "basic", filter: { brightness: 106, contrast: 94, saturate: 102, blur: 1 } },
      { id: "flat-matte", label: "Flat Matte", category: "basic", filter: { brightness: 104, contrast: 84, saturate: 92 } },

      { id: "classic-mono", label: "Classic Mono", category: "bw", filter: { brightness: 100, contrast: 104, saturate: 100, grayscale: 100 } },
      { id: "noir", label: "Noir", category: "bw", filter: { brightness: 90, contrast: 150, saturate: 100, grayscale: 100 }, vignette: 45 },
      { id: "silver", label: "Silver", category: "bw", filter: { brightness: 110, contrast: 112, saturate: 100, grayscale: 100 } },
      { id: "high-key-bw", label: "High-Key B&W", category: "bw", filter: { brightness: 128, contrast: 96, saturate: 100, grayscale: 100 } },

      { id: "golden-hour", label: "Golden Hour", category: "tone", filter: { brightness: 104, contrast: 104, saturate: 108 }, generator: "colorTemp", params: { warmth: 26 }, vignette: 18 },
      { id: "arctic-blue", label: "Arctic Blue", category: "tone", filter: { brightness: 102, contrast: 106, saturate: 96 }, generator: "colorTemp", params: { warmth: -32 } },
      { id: "duotone-blue", label: "Duotone Blue", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#1b2a4a", highlight: "#ffdca8" } },
      { id: "duotone-rose", label: "Duotone Rose", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#2a1420", highlight: "#ffd6e7" } },
      { id: "duotone-forest", label: "Duotone Forest", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#0f2417", highlight: "#e7f2c4" } },

      { id: "retro-film", label: "Retro Film", category: "vintage", filter: { brightness: 100, contrast: 100, saturate: 92 }, generator: "vintage", params: { lift: 22, squeeze: 0.82, castR: 8, castG: 2, castB: -10 }, vignette: 28 },
      { id: "faded-polaroid", label: "Faded Polaroid", category: "vintage", filter: { brightness: 104, contrast: 92, saturate: 80 }, generator: "vintage", params: { lift: 32, squeeze: 0.86, castR: 4, castG: 4, castB: -4 } },
      { id: "sepia-classic", label: "Sepia Classic", category: "vintage", filter: { brightness: 101, contrast: 106, saturate: 100, sepia: 88 } },

      { id: "sharpen-detail", label: "Sharpen Detail", category: "creative", filter: NO_OP_FILTER, sharpen: { amount: 1 } },
      { id: "invert", label: "Invert", category: "creative", filter: { brightness: 100, contrast: 100, saturate: 100, invert: 100 } },
      { id: "cool-shade", label: "Cool Shade", category: "creative", filter: { brightness: 101, contrast: 108, saturate: 96 }, generator: "colorTemp", params: { warmth: -20 } },
      { id: "dreamy-glow", label: "Dreamy Glow", category: "creative", filter: { brightness: 114, contrast: 88, saturate: 118, blur: 0.6 }, vignette: 10 }
    ];

    var CATEGORIES = [
      { id: "basic", label: "Basic" },
      { id: "bw", label: "Black & White" },
      { id: "tone", label: "Color Tone" },
      { id: "vintage", label: "Vintage" },
      { id: "creative", label: "Creative" }
    ];

    var presetsById = {};
    PRESETS.forEach(function (p) { presetsById[p.id] = p; });

    function paint(ctx, image, w, h, preset, adjust) {
      adjust = adjust || { brightness: 0, contrast: 0, saturation: 0, vignette: 0 };
      ctx.clearRect(0, 0, w, h);
      ctx.filter = buildFilterString(preset.filter || NO_OP_FILTER, adjust);
      ctx.drawImage(image, 0, 0, w, h);
      ctx.filter = "none";

      if (preset.generator && GENERATORS[preset.generator]) {
        var imgData = ctx.getImageData(0, 0, w, h);
        GENERATORS[preset.generator](imgData.data, preset.params || {});
        ctx.putImageData(imgData, 0, 0);
      }

      if (preset.sharpen) {
        var sharpData = ctx.getImageData(0, 0, w, h);
        applySharpen(sharpData, preset.sharpen);
        ctx.putImageData(sharpData, 0, 0);
      }

      var vignetteAmt = clamp((preset.vignette || 0) + (adjust.vignette || 0), 0, 100);
      applyVignette(ctx, w, h, vignetteAmt);
    }

    function currentPreset() { return presetsById[state.preset] || PRESETS[0]; }

    function render() {
      if (!state.image) return;
      var w = els.canvas.width, h = els.canvas.height;
      if (state.showOriginal) {
        paint(canvasCtx, state.image, w, h, { filter: NO_OP_FILTER }, { brightness: 0, contrast: 0, saturation: 0, vignette: 0 });
      } else {
        paint(canvasCtx, state.image, w, h, currentPreset(), state.adjust);
      }
    }

    function renderCategoryTabs() {
      els.categoryTabs.innerHTML = CATEGORIES.map(function (cat) {
        return '<button type="button" class="pf-tab' + (cat.id === state.activeCategory ? " is-active" : "") +
          '" data-category="' + cat.id + '" role="tab" aria-selected="' + (cat.id === state.activeCategory) + '">' + cat.label + "</button>";
      }).join("");

      CS.wireTabs($$(".pf-tab", els.categoryTabs), function (tab) {
        state.activeCategory = tab.getAttribute("data-category");
        renderPresetGrid();
      });
    }

    function renderPresetGrid() {
      var presets = PRESETS.filter(function (p) { return p.category === state.activeCategory; });

      els.presetGrid.innerHTML = presets.map(function (preset) {
        return '<button type="button" class="pf-choice-card' + (preset.id === state.preset ? " is-active" : "") +
          '" data-preset="' + preset.id + '">' +
          '<canvas width="120" height="80"></canvas>' +
          "<span>" + preset.label + "</span></button>";
      }).join("");

      $$(".pf-choice-card", els.presetGrid).forEach(function (card, i) {
        var preset = presets[i];
        var thumbCanvas = card.querySelector("canvas");
        if (state.image) {
          var tctx = thumbCanvas.getContext("2d");
          paint(tctx, state.image, thumbCanvas.width, thumbCanvas.height, preset, { brightness: 0, contrast: 0, saturation: 0, vignette: 0 });
        }
        card.addEventListener("click", function () {
          state.preset = preset.id;
          $$(".pf-choice-card", els.presetGrid).forEach(function (c) { c.classList.remove("is-active"); });
          card.classList.add("is-active");
          render();
        });
      });
    }

    function generateSampleImage() {
      var canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 420;
      var ctx = canvas.getContext("2d");

      var sky = ctx.createLinearGradient(0, 0, 0, 280);
      sky.addColorStop(0, "#5f8fd9");
      sky.addColorStop(1, "#f2c879");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 640, 280);

      ctx.fillStyle = "#fff4d6";
      ctx.beginPath();
      ctx.arc(460, 190, 46, 0, Math.PI * 2);
      ctx.fill();

      var ground = ctx.createLinearGradient(0, 260, 0, 420);
      ground.addColorStop(0, "#3f6b4a");
      ground.addColorStop(1, "#1f3a27");
      ctx.fillStyle = ground;
      ctx.fillRect(0, 260, 640, 160);

      ctx.fillStyle = "#274a30";
      for (var i = 0; i < 7; i++) {
        var x = 40 + i * 90 + (i % 2 === 0 ? 10 : -10);
        var baseY = 275 + (i % 3) * 6;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x - 26, baseY + 60);
        ctx.lineTo(x + 26, baseY + 60);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      [[120, 70, 34], [160, 78, 26], [420, 60, 30], [470, 66, 22]].forEach(function (c) {
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], c[2], c[2] * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      return canvas;
    }

    function sizeCanvasToImage(image) {
      var maxW = 1000, maxH = 700;
      var iw = image.naturalWidth || image.width;
      var ih = image.naturalHeight || image.height;
      var scale = Math.min(1, maxW / iw, maxH / ih);
      els.canvas.width = Math.max(1, Math.round(iw * scale));
      els.canvas.height = Math.max(1, Math.round(ih * scale));
    }

    function setImage(image, label) {
      state.image = image;
      state.naturalW = image.naturalWidth || image.width;
      state.naturalH = image.naturalHeight || image.height;
      sizeCanvasToImage(image);
      els.status.textContent = label;
      renderPresetGrid();
      render();
    }

    function bindSlider(input, out, key, suffix) {
      input.addEventListener("input", function () {
        state.adjust[key] = parseInt(input.value, 10);
        out.textContent = state.adjust[key] + (suffix || "");
        render();
      });
    }

    function init() {
      els = {
        fileInput: $("pf-file-input"),
        dropZone: $("pf-drop-zone"),
        dropLabel: $("pf-drop-label"),
        categoryTabs: $("pf-category-tabs"),
        presetGrid: $("pf-preset-grid"),
        brightness: $("pf-brightness"),
        brightnessVal: $("pf-brightness-val"),
        contrast: $("pf-contrast"),
        contrastVal: $("pf-contrast-val"),
        saturation: $("pf-saturation"),
        saturationVal: $("pf-saturation-val"),
        vignette: $("pf-vignette"),
        vignetteVal: $("pf-vignette-val"),
        reset: $("pf-reset"),
        compare: $("pf-compare"),
        download: $("pf-download"),
        canvas: $("pf-canvas"),
        status: $("pf-status")
      };
      canvasCtx = els.canvas.getContext("2d", { willReadFrequently: true });

      els.fileInput.addEventListener("change", function () {
        var file = els.fileInput.files && els.fileInput.files[0];
        if (!file) return;

        CS.decodeImageFile(file, function (img) {
          els.dropZone.classList.add("has-file");
          els.dropLabel.textContent = file.name;
          setImage(img, "Editing " + file.name);
          // This mode's own picker also becomes the shared photo Meme and
          // Enhance default to. "filters" is excluded from the fan-out
          // since it already applied the image to itself above.
          CS.setSharedImage(img, "filters");
        }, function (message) {
          els.status.textContent = message;
        });
      });

      bindSlider(els.brightness, els.brightnessVal, "brightness");
      bindSlider(els.contrast, els.contrastVal, "contrast");
      bindSlider(els.saturation, els.saturationVal, "saturation");
      bindSlider(els.vignette, els.vignetteVal, "vignette");

      els.reset.addEventListener("click", function () {
        state.adjust = { brightness: 0, contrast: 0, saturation: 0, vignette: 0 };
        [
          [els.brightness, els.brightnessVal],
          [els.contrast, els.contrastVal],
          [els.saturation, els.saturationVal],
          [els.vignette, els.vignetteVal]
        ].forEach(function (pair) {
          pair[0].value = 0;
          pair[1].textContent = "0";
        });
        render();
      });

      els.compare.addEventListener("mousedown", function () {
        state.showOriginal = true;
        els.compare.classList.add("is-active");
        render();
      });
      ["mouseup", "mouseleave"].forEach(function (evt) {
        els.compare.addEventListener(evt, function () {
          if (!state.showOriginal) return;
          state.showOriginal = false;
          els.compare.classList.remove("is-active");
          render();
        });
      });
      els.compare.addEventListener("click", function (event) { event.preventDefault(); });

      els.download.addEventListener("click", function () {
        if (!state.image) return;
        var exportCanvas = document.createElement("canvas");
        exportCanvas.width = state.naturalW;
        exportCanvas.height = state.naturalH;
        var exportCtx = exportCanvas.getContext("2d");
        paint(exportCtx, state.image, exportCanvas.width, exportCanvas.height, currentPreset(), state.adjust);

        exportCanvas.toBlob(function (blob) {
          if (!blob) return;
          CS.triggerDownload(blob, "photo-filtered.png");
        }, "image/png");
      });

      renderCategoryTabs();
      setImage(generateSampleImage(), "Showing a built-in sample photo — upload your own to filter it.");

      // A photo loaded elsewhere (the app-bar's shared control, or Meme's/
      // Enhance's own picker) replaces the built-in sample here too —
      // preset/adjustment choices are left as they are, only the photo
      // underneath changes.
      CS.onSharedImage("filters", applySharedImage);
    }

    function applySharedImage(img) {
      els.dropZone.classList.add("has-file");
      els.dropLabel.textContent = "Shared photo";
      setImage(img, "Editing shared photo");
    }

    return {
      init: init,
      /** Public entry point used by the shared app-bar control and by the
          other two photo modes' pickers. */
      setImage: applySharedImage
    };
  })();

  /* ========================================================================
     ENHANCE MODE (ported from tools/image-enhancer/app.js).
     ========================================================================== */
  var EnhanceMode = (function () {
    var $ = CS.$, $$ = CS.$$;

    var els, ctx;

    var state = { lookId: "none", clarity: 0, sharpen: 0, denoise: 0, upscale: 1, showBefore: false };

    function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

    function boxBlur(src, w, h, radius) {
      if (radius < 1) return src.slice();
      var tmp = new Float32Array(w * h * 4);
      var out = new Uint8ClampedArray(w * h * 4);

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var r = 0, g = 0, b = 0, a = 0, count = 0;
          for (var k = -radius; k <= radius; k++) {
            var xx = x + k;
            if (xx < 0 || xx >= w) continue;
            var idx = (y * w + xx) * 4;
            r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; a += src[idx + 3];
            count++;
          }
          var oidx = (y * w + x) * 4;
          tmp[oidx] = r / count; tmp[oidx + 1] = g / count; tmp[oidx + 2] = b / count; tmp[oidx + 3] = a / count;
        }
      }

      for (var x2 = 0; x2 < w; x2++) {
        for (var y2 = 0; y2 < h; y2++) {
          var r2 = 0, g2 = 0, b2 = 0, a2 = 0, count2 = 0;
          for (var k2 = -radius; k2 <= radius; k2++) {
            var yy = y2 + k2;
            if (yy < 0 || yy >= h) continue;
            var idx2 = (yy * w + x2) * 4;
            r2 += tmp[idx2]; g2 += tmp[idx2 + 1]; b2 += tmp[idx2 + 2]; a2 += tmp[idx2 + 3];
            count2++;
          }
          var oidx2 = (y2 * w + x2) * 4;
          out[oidx2] = r2 / count2; out[oidx2 + 1] = g2 / count2; out[oidx2 + 2] = b2 / count2; out[oidx2 + 3] = a2 / count2;
        }
      }
      return out;
    }

    function applyClarity(imageData, amount) {
      if (amount <= 0) return imageData;
      var w = imageData.width, h = imageData.height, data = imageData.data;
      var blurred = boxBlur(data, w, h, 6);
      var strength = (amount / 100) * 1.3;
      for (var i = 0; i < data.length; i += 4) {
        data[i] = clamp255(data[i] + strength * (data[i] - blurred[i]));
        data[i + 1] = clamp255(data[i + 1] + strength * (data[i + 1] - blurred[i + 1]));
        data[i + 2] = clamp255(data[i + 2] + strength * (data[i + 2] - blurred[i + 2]));
      }
      return imageData;
    }

    function applyDenoise(imageData, amount) {
      if (amount <= 0) return imageData;
      var w = imageData.width, h = imageData.height, data = imageData.data;
      var blurred = boxBlur(data, w, h, 3);
      var t = amount / 100;
      for (var i = 0; i < data.length; i += 4) {
        data[i] = data[i] * (1 - t) + blurred[i] * t;
        data[i + 1] = data[i + 1] * (1 - t) + blurred[i + 1] * t;
        data[i + 2] = data[i + 2] * (1 - t) + blurred[i + 2] * t;
      }
      return imageData;
    }

    var SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    function applySharpenConv(imageData, amountPercent) {
      if (amountPercent <= 0) return imageData;
      var w = imageData.width, h = imageData.height;
      var src = imageData.data;
      var out = src.slice();
      var t = amountPercent / 100;

      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var idx = (y * w + x) * 4;
          for (var c = 0; c < 3; c++) {
            var sum = 0, k = 0;
            for (var ky = -1; ky <= 1; ky++) {
              for (var kx = -1; kx <= 1; kx++) {
                sum += src[((y + ky) * w + (x + kx)) * 4 + c] * SHARPEN_KERNEL[k];
                k++;
              }
            }
            out[idx + c] = clamp255(src[idx + c] * (1 - t) + clamp255(sum) * t);
          }
        }
      }
      imageData.data.set(out);
      return imageData;
    }

    function splitTone(imageData, shadowHex, highlightHex, strength) {
      if (!strength) return imageData;
      var s = CS.hexToRgb(shadowHex), hl = CS.hexToRgb(highlightHex);
      var data = imageData.data;
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        var shadowW = (1 - lum) * strength;
        var highlightW = lum * strength;
        var keep = 1 - shadowW - highlightW;
        data[i] = clamp255(r * keep + s.r * shadowW + hl.r * highlightW);
        data[i + 1] = clamp255(g * keep + s.g * shadowW + hl.g * highlightW);
        data[i + 2] = clamp255(b * keep + s.b * shadowW + hl.b * highlightW);
      }
      return imageData;
    }

    function vignette(context, w, h, strength) {
      if (!strength) return;
      var grad = context.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.28,
        w / 2, h / 2, Math.max(w, h) * 0.72
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0," + strength + ")");
      context.save();
      context.globalCompositeOperation = "multiply";
      context.fillStyle = grad;
      context.fillRect(0, 0, w, h);
      context.restore();
    }

    function filmGrain(imageData, amount) {
      if (!amount) return imageData;
      var data = imageData.data;
      for (var i = 0; i < data.length; i += 4) {
        var n = (Math.random() * 2 - 1) * amount;
        data[i] = clamp255(data[i] + n);
        data[i + 1] = clamp255(data[i + 1] + n);
        data[i + 2] = clamp255(data[i + 2] + n);
      }
      return imageData;
    }

    var PRESETS = [
      { id: "none", label: "Original", filter: { brightness: 1, contrast: 1, saturate: 1, hueRotate: 0 }, splitTone: null, vignette: 0, grain: 0 },
      { id: "teal-orange", label: "Cinematic Teal & Orange", filter: { brightness: 1.02, contrast: 1.12, saturate: 1.15, hueRotate: 0 }, splitTone: { shadow: "#0b2b3a", highlight: "#ffb266", strength: 0.35 }, vignette: 0.25, grain: 0 },
      { id: "moody", label: "Moody Desaturated", filter: { brightness: 0.95, contrast: 1.08, saturate: 0.55, hueRotate: 0 }, splitTone: { shadow: "#1a1f26", highlight: "#cfd8dc", strength: 0.22 }, vignette: 0.35, grain: 0 },
      { id: "golden-hour", label: "Golden Hour", filter: { brightness: 1.06, contrast: 1.05, saturate: 1.22, hueRotate: 5 }, splitTone: { shadow: "#3a2a12", highlight: "#ffcf7a", strength: 0.3 }, vignette: 0.15, grain: 0 },
      { id: "blue-hour", label: "Blue Hour", filter: { brightness: 0.94, contrast: 1.1, saturate: 0.92, hueRotate: -8 }, splitTone: { shadow: "#0d1b3a", highlight: "#7fb3ff", strength: 0.35 }, vignette: 0.3, grain: 0 },
      { id: "vintage-film", label: "Vintage Film", filter: { brightness: 1.02, contrast: 0.92, saturate: 0.8, hueRotate: -3 }, splitTone: { shadow: "#33291a", highlight: "#e8d8b0", strength: 0.25 }, vignette: 0.3, grain: 12 },
      { id: "high-vibrance", label: "High Vibrance", filter: { brightness: 1.0, contrast: 1.15, saturate: 1.6, hueRotate: 0 }, splitTone: { shadow: "#14203a", highlight: "#ffdd55", strength: 0.1 }, vignette: 0.1, grain: 0 },
      { id: "cool-noir", label: "Cool Noir", filter: { brightness: 0.92, contrast: 1.3, saturate: 0.3, hueRotate: 0 }, splitTone: { shadow: "#05070d", highlight: "#c9d6e6", strength: 0.4 }, vignette: 0.45, grain: 6 },
      { id: "warm-portrait", label: "Warm Portrait", filter: { brightness: 1.03, contrast: 1.02, saturate: 1.05, hueRotate: 3 }, splitTone: { shadow: "#2a1a12", highlight: "#ffddb0", strength: 0.2 }, vignette: 0.12, grain: 0 },
      { id: "faded-matte", label: "Faded Matte", filter: { brightness: 1.06, contrast: 0.85, saturate: 0.75, hueRotate: 0 }, splitTone: { shadow: "#2a2a26", highlight: "#f0ece0", strength: 0.15 }, vignette: 0.1, grain: 6 },
      { id: "neon-night", label: "Cyberpunk Neon", filter: { brightness: 1.0, contrast: 1.2, saturate: 1.5, hueRotate: -15 }, splitTone: { shadow: "#1a0a3a", highlight: "#4dfcff", strength: 0.4 }, vignette: 0.3, grain: 0 }
    ];

    var presetsById = {};
    PRESETS.forEach(function (p) { presetsById[p.id] = p; });

    function cssFilterFor(preset) {
      var f = preset.filter;
      return "brightness(" + f.brightness + ") contrast(" + f.contrast + ") saturate(" + f.saturate + ") hue-rotate(" + f.hueRotate + "deg)";
    }

    function paintFull(context, img, w, h, paintState) {
      context.canvas.width = w;
      context.canvas.height = h;
      context.clearRect(0, 0, w, h);

      if (paintState.showBefore) {
        context.filter = "none";
        context.drawImage(img, 0, 0, w, h);
        return;
      }

      var preset = presetsById[paintState.lookId] || PRESETS[0];

      context.filter = cssFilterFor(preset);
      context.drawImage(img, 0, 0, w, h);
      context.filter = "none";

      var imageData = context.getImageData(0, 0, w, h);
      applyDenoise(imageData, paintState.denoise);
      applySharpenConv(imageData, paintState.sharpen);
      applyClarity(imageData, paintState.clarity);
      if (preset.splitTone) splitTone(imageData, preset.splitTone.shadow, preset.splitTone.highlight, preset.splitTone.strength);
      filmGrain(imageData, preset.grain);
      context.putImageData(imageData, 0, 0);

      vignette(context, w, h, preset.vignette);

      if (paintState.upscale > 1) {
        var extra = context.getImageData(0, 0, w, h);
        applySharpenConv(extra, 45);
        context.putImageData(extra, 0, 0);
      }
    }

    function buildPlaceholder() {
      var w = 640, h = 420;
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var c = canvas.getContext("2d");

      var sky = c.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, "#2b4d7a");
      sky.addColorStop(0.6, "#e08a4a");
      sky.addColorStop(1, "#f7d68a");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h * 0.62);

      c.fillStyle = "#fff6da";
      c.beginPath();
      c.arc(w * 0.72, h * 0.42, 46, 0, Math.PI * 2);
      c.fill();

      var ground = c.createLinearGradient(0, h * 0.6, 0, h);
      ground.addColorStop(0, "#3a5f3a");
      ground.addColorStop(1, "#1c2e1c");
      c.fillStyle = ground;
      c.fillRect(0, h * 0.6, w, h * 0.4);

      c.fillStyle = "#14202f";
      for (var i = 0; i < 6; i++) {
        var bw = 30 + Math.random() * 60;
        var bh = 60 + Math.random() * 140;
        var bx = (i / 6) * w + Math.random() * 30;
        c.fillRect(bx, h * 0.62 - bh, bw, bh);
      }

      c.fillStyle = "rgba(255,255,255,0.65)";
      for (var j = 0; j < 40; j++) {
        c.fillRect(Math.random() * w, h * 0.15 + Math.random() * h * 0.2, 2, 2);
      }

      return canvas;
    }

    var sourceImage, sourceW, sourceH;

    /** Applies an already-decoded image as this mode's active source image
        — the one surviving copy of "an image just became this mode's
        active image" logic, used both by this mode's own file picker AND
        by an image loaded through the shared app-bar control or another
        photo mode's picker (see CS.onSharedImage below). Existing look/
        clarity/sharpen/denoise/upscale choices are left untouched, only
        the underlying photo changes. */
    function applyImage(img) {
      sourceImage = img;
      sourceW = img.naturalWidth || img.width;
      sourceH = img.naturalHeight || img.height;
      renderLookGrid();
      renderPreview();
    }

    function outputSize() { return { w: sourceW * state.upscale, h: sourceH * state.upscale }; }

    function renderPreview() {
      var size = outputSize();
      paintFull(ctx, sourceImage, size.w, size.h, state);
      els.status.textContent = size.w + " × " + size.h + "px" + (state.upscale > 1 ? " (" + state.upscale + "× upscaled)" : "");
    }

    function renderLookGrid() {
      els.lookGrid.innerHTML = PRESETS.map(function (preset) {
        return '<button type="button" class="ie-choice-card' + (preset.id === state.lookId ? " is-active" : "") +
          '" data-look="' + preset.id + '">' +
          '<canvas class="ie-look-preview" width="128" height="96" data-look-canvas="' + preset.id + '"></canvas>' +
          "<span>" + preset.label + "</span></button>";
      }).join("");

      $$(".ie-choice-card", els.lookGrid).forEach(function (card) {
        var id = card.getAttribute("data-look");
        var previewCanvas = card.querySelector("canvas");
        var previewCtx = previewCanvas.getContext("2d");
        paintFull(previewCtx, sourceImage, previewCanvas.width, previewCanvas.height, {
          lookId: id, clarity: 0, sharpen: 0, denoise: 0, upscale: 1, showBefore: false
        });

        card.addEventListener("click", function () {
          state.lookId = id;
          $$(".ie-choice-card", els.lookGrid).forEach(function (c) { c.classList.toggle("is-active", c === card); });
          renderPreview();
        });
      });
    }

    function init() {
      els = {
        file: $("ie-file"),
        lookGrid: $("ie-look-grid"),
        clarity: $("ie-clarity"),
        clarityVal: $("ie-clarity-val"),
        sharpen: $("ie-sharpen"),
        sharpenVal: $("ie-sharpen-val"),
        denoise: $("ie-denoise"),
        denoiseVal: $("ie-denoise-val"),
        upscaleGrid: $("ie-upscale-grid"),
        reset: $("ie-reset"),
        toggleBefore: $("ie-toggle-before"),
        toggleBeforeLabel: $("ie-toggle-before-label"),
        status: $("ie-status"),
        download: $("ie-download"),
        canvasScroll: $("ie-canvas-scroll"),
        canvas: $("ie-canvas")
      };
      ctx = els.canvas.getContext("2d", { willReadFrequently: true });

      sourceImage = buildPlaceholder();
      sourceW = sourceImage.width;
      sourceH = sourceImage.height;

      CS.wireTabs($$("[data-tabs] .ie-tab"), function (button) {
        var key = button.getAttribute("data-tab");
        $$(".ie-pane").forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute("data-pane") === key);
        });
      });

      [
        { input: els.clarity, out: els.clarityVal, key: "clarity" },
        { input: els.sharpen, out: els.sharpenVal, key: "sharpen" },
        { input: els.denoise, out: els.denoiseVal, key: "denoise" }
      ].forEach(function (binding) {
        binding.input.addEventListener("input", function () {
          state[binding.key] = parseInt(binding.input.value, 10);
          binding.out.textContent = state[binding.key] + "%";
          renderPreview();
        });
      });

      CS.wireChoiceCards(els.upscaleGrid, function (value) {
        state.upscale = parseInt(value, 10);
        renderPreview();
      });

      els.toggleBefore.addEventListener("click", function () {
        state.showBefore = !state.showBefore;
        els.toggleBeforeLabel.textContent = state.showBefore ? "Show Enhanced" : "Show Original";
        els.toggleBefore.classList.toggle("is-active", state.showBefore);
        renderPreview();
      });

      els.reset.addEventListener("click", function () {
        state.lookId = "none";
        state.clarity = 0;
        state.sharpen = 0;
        state.denoise = 0;
        state.upscale = 1;
        state.showBefore = false;

        els.clarity.value = 0; els.clarityVal.textContent = "0%";
        els.sharpen.value = 0; els.sharpenVal.textContent = "0%";
        els.denoise.value = 0; els.denoiseVal.textContent = "0%";
        els.toggleBeforeLabel.textContent = "Show Original";
        els.toggleBefore.classList.remove("is-active");

        $$(".ie-choice-card", els.upscaleGrid).forEach(function (c) { c.classList.toggle("is-active", c.getAttribute("data-value") === "1"); });
        renderLookGrid();
        renderPreview();
      });

      els.file.addEventListener("change", function () {
        var file = els.file.files && els.file.files[0];
        if (!file) return;

        CS.decodeImageFile(file, function (img) {
          applyImage(img);
          // This mode's own picker also becomes the shared photo Meme and
          // Filters default to. "enhance" is excluded from the fan-out
          // since it already applied the image to itself above.
          CS.setSharedImage(img, "enhance");
        }, function (message) {
          els.status.textContent = message;
        });
        els.file.value = "";
      });

      els.download.addEventListener("click", function () {
        var wasShowingBefore = state.showBefore;
        if (wasShowingBefore) { state.showBefore = false; renderPreview(); }
        els.canvas.toBlob(function (blob) {
          if (!blob) return;
          CS.triggerDownload(blob, "enhanced-image.png");
        }, "image/png");
        if (wasShowingBefore) { state.showBefore = true; renderPreview(); }
      });

      renderLookGrid();
      renderPreview();

      // A photo loaded elsewhere (the app-bar's shared control, or Meme's/
      // Filters' own picker) becomes this mode's active image too.
      CS.onSharedImage("enhance", applyImage);
    }

    return {
      init: init,
      /** Public entry point used by the shared app-bar control and by the
          other two photo modes' pickers. */
      setImage: applyImage
    };
  })();

  /* ========================================================================
     GRADIENT & PALETTE MODE (ported from tools/gradient-palette-studio/app.js).
     ========================================================================== */
  var GradientMode = (function () {
    var $ = CS.$, $$ = CS.$$, clamp = CS.clamp;

    function hexToRgb(hex) {
      hex = hex.replace("#", "");
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
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

    function hexToHsl(hex) { var rgb = hexToRgb(hex); return rgbToHsl(rgb.r, rgb.g, rgb.b); }
    function hslToHex(h, s, l) { var rgb = hslToRgb(h, s, l); return rgbToHex(rgb.r, rgb.g, rgb.b); }

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
        return [-30, -15, 0, 15, 30].map(function (d) { return { h: (base.h + d + 360) % 360, s: base.s, l: base.l }; });
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
        return [-30, -15, 0, 15, 30].map(function (d) { return { h: base.h, s: base.s, l: clamp(base.l + d, 6, 94) }; });
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
      canvas.toBlob(function (blob) { if (blob) CS.triggerDownload(blob, filename); }, "image/png");
    }

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
          CS.copyText(hex, function (ok) {
            if (!ok) return;
            btn.classList.add("is-copied");
            setTimeout(function () { btn.classList.remove("is-copied"); }, 1200);
          });
        });

        container.appendChild(btn);
      });
    }

    var gEls, stopIdCounter = 2;
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

    function sortedStops(stops) { return stops.slice().sort(function (a, b) { return a.pos - b.pos; }); }

    function stopsCssList(stops) {
      return sortedStops(stops).map(function (s) { return s.color + " " + Math.round(s.pos) + "%"; }).join(", ");
    }

    function buildGradientCss(g) {
      var stopsStr = stopsCssList(g.stops);
      if (g.type === "radial") return "radial-gradient(" + g.shape + ", " + stopsStr + ")";
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
      CS.syncSwatchRow(gEls.stopSwatches, stop.color);
      gEls.removeStop.disabled = gradient.stops.length <= 2;
    }

    function redrawGradient() {
      renderStopHandles();
      updateStopEditorUi();

      gEls.stopsTrack.style.background = "linear-gradient(to right, " + stopsCssList(gradient.stops) + ")";

      var css = buildGradientCss(gradient);
      gEls.previewBox.style.background = css;
      gEls.cssOutput.textContent = "background: " + css + ";";
    }

    var pEls, paletteState = { base: "#2b7fff", harmony: "complementary", colors: [] };

    function runPaletteGeneration() {
      paletteState.colors = generatePalette(paletteState.base, paletteState.harmony);
      renderPaletteStrip(pEls.strip, paletteState.colors);
    }

    var eEls, extractState = { colors: [], image: null };

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

    function init() {
      var modeTabs = $$("[data-mode-tabs] [data-mode]");
      var modePanes = $$("[data-mode-pane]");
      CS.wireTabs(modeTabs, function (button) {
        var mode = button.getAttribute("data-mode");
        modePanes.forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute("data-mode-pane") === mode);
        });
      });

      gEls = {
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

      $$("[data-choice]").forEach(function (group) {
        var key = group.getAttribute("data-choice");
        CS.wireChoiceCards(group, function (value) {
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

      CS.wireAngleDial(gEls.angleFace, gEls.angleValue, gradient.angle, function (angle) {
        gradient.angle = angle;
        redrawGradient();
      });

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

      CS.wireSwatchRow(gEls.stopSwatches, function (value) {
        var stop = getSelectedStop();
        stop.color = value;
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
        CS.copyText(css, function (ok) {
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

      pEls = {
        baseColor: $("gps-base-color"),
        generate: $("gps-generate-palette"),
        strip: $("gps-palette-strip"),
        download: $("gps-download-palette")
      };

      CS.wireSwatchRow(document.querySelector('[data-swatches="base"]'), function (value) {
        paletteState.base = value;
        runPaletteGeneration();
      });

      CS.wireTabs($$("[data-harmony-tabs] [data-harmony]"), function (button) {
        paletteState.harmony = button.getAttribute("data-harmony");
        runPaletteGeneration();
      });

      pEls.generate.addEventListener("click", runPaletteGeneration);
      pEls.download.addEventListener("click", function () { downloadPaletteAsPng(paletteState.colors, "palette.png"); });

      runPaletteGeneration();

      eEls = {
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

      eEls.download.addEventListener("click", function () { downloadPaletteAsPng(extractState.colors, "extracted-palette.png"); });
    }

    return { init: init };
  })();

  /* ========================================================================
     LOGO MODE (ported from tools/logo-maker/app.js).
     ========================================================================== */
  var LogoMode = (function () {
    var $ = CS.$, $$ = CS.$$;

    var CANVAS_SIZE = 1000;

    var FONTS = {
      "system-ui": 'system-ui, -apple-system, "Segoe UI", sans-serif',
      "helvetica": 'Helvetica, Arial, sans-serif',
      "trebuchet": '"Trebuchet MS", sans-serif',
      "georgia": 'Georgia, "Times New Roman", serif',
      "times": '"Times New Roman", Times, serif',
      "verdana": 'Verdana, Geneva, sans-serif',
      "courier": '"Courier New", Courier, monospace'
    };

    function n(v) { return Math.round(v * 100) / 100; }
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
      return {
        showIcon: true, showText: true,
        icon: { x: cx, y: size * 0.36, size: size * 0.3 },
        text: { align: "center", nameX: cx, nameY: size * 0.66, nameSize: size * 0.09, tagX: cx, tagY: size * 0.74, tagSize: size * 0.04, maxWidth: size * 0.86 }
      };
    }

    var measureCanvas = document.createElement("canvas");
    var measureCtx = measureCanvas.getContext("2d");

    function measureSpacedWidth(text, weight, fontSize, family, spacing) {
      measureCtx.font = weight + " " + Math.round(fontSize) + "px " + family;
      var chars = text.split("");
      var w = chars.reduce(function (sum, c) { return sum + measureCtx.measureText(c).width; }, 0);
      return w + spacing * (chars.length - 1);
    }

    function fitFontSize(text, weight, baseSize, family, spacing, maxWidth) {
      if (!text || !maxWidth) return baseSize;
      var w = measureSpacedWidth(text, weight, baseSize, family, spacing);
      if (w <= maxWidth) return baseSize;
      var scale = Math.max(maxWidth / w, 0.35);
      return baseSize * scale;
    }

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

    function drawLogo(ctx, state, size) {
      ctx.clearRect(0, 0, size, size);

      if (state.bgMode === "solid") {
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, size, size);
      }

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

    var els, ctx;

    function render() { drawLogo(ctx, state, CANVAS_SIZE); }

    function buildIconGrid() {
      ICON_LIST.forEach(function (entry) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "lm-choice-card" + (entry.id === state.icon ? " is-active" : "");
        card.setAttribute("data-value", entry.id);

        var mini = document.createElement("span");
        mini.className = "lm-icon-mini";
        var previewExtra = { letter: "A", contrastColor: "#ffffff", fontFamilyCss: FONTS["system-ui"] };
        var inner = ICONS[entry.id].svg(12, 12, 18, "#f1efe9", previewExtra);
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

    function applyColor(key, value) {
      if (key === "icon") state.iconColor = value;
      else if (key === "text") state.textColor = value;
      else if (key === "bg") state.bgColor = value;
      render();
    }

    function triggerDownload(url, filename) { CS.triggerDownload(url, filename); }

    function downloadPng() {
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

    function init() {
      els = {
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
      ctx = els.canvas.getContext("2d");

      CS.wireTabs($$("[data-section-tabs] .lm-tab"), function (button) {
        var section = button.getAttribute("data-section");
        $$(".lm-pane").forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute("data-section-pane") === section);
        });
      });

      CS.wireTabs($$("[data-format-tabs] .lm-tab"), function (button) {
        state.format = button.getAttribute("data-format");
      });

      buildIconGrid();

      CS.wireChoiceCards(document.querySelector('[data-choice="layout"]'), function (value) {
        state.layout = value;
        render();
      });

      $$("[data-swatches]").forEach(function (row) {
        var key = row.getAttribute("data-swatches");
        CS.wireSwatchRow(row, function (value) { applyColor(key, value); });
      });

      $$("[data-fill-mode]").forEach(function (toggle) {
        var key = toggle.getAttribute("data-fill-mode");
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

      els.name.addEventListener("input", function () { state.name = els.name.value; render(); });
      els.tagline.addEventListener("input", function () { state.tagline = els.tagline.value; render(); });
      els.fontFamily.addEventListener("change", function () { state.fontFamily = els.fontFamily.value; render(); });
      els.fontWeight.addEventListener("change", function () { state.fontWeight = els.fontWeight.value; render(); });
      els.letterSpacing.addEventListener("input", function () {
        state.letterSpacing = parseInt(els.letterSpacing.value, 10) || 0;
        els.letterSpacingVal.textContent = state.letterSpacing + "px";
        render();
      });

      els.download.addEventListener("click", function () {
        if (state.format === "svg") downloadSvg();
        else downloadPng();
      });

      render();
    }

    return { init: init };
  })();

  /* ========================================================================
     TOP-LEVEL MODE SWITCHER — pill tabs (STANDARDS.md §4). Uses the
     `data-app-mode-tabs`/`data-app-mode`/`data-app-panel` attribute names
     (distinct from every internal sub-mode attribute each ported module
     already used — data-mode-tabs, data-tabs, data-section-tabs, etc. —
     so nothing here collides with any mode's own tab wiring).
     ========================================================================== */
  function initAppShell() {
    var tabs = CS.$$("[data-app-mode-tabs] [data-app-mode]");
    var panels = CS.$$("[data-app-panel]");
    CS.wireTabs(tabs, function (button) {
      var mode = button.getAttribute("data-app-mode");
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-app-panel") !== mode;
      });
    });

    // The ONE shared "Add Image" control (STANDARDS.md fix: upload once,
    // reuse across Meme/Filters/Enhance instead of once per mode). It has
    // no "home" mode of its own, so it passes `null` as the source — every
    // registered photo mode picks it up via CS.setSharedImage's fan-out.
    // Gradient & Palette's "Extract from Image" picker and Logo mode are
    // untouched by this — a different concern, per the task.
    var sharedInput = CS.$("cs-shared-file-input");
    var sharedStatus = CS.$("cs-shared-upload-status");
    if (sharedInput) {
      sharedInput.addEventListener("change", function () {
        var file = sharedInput.files && sharedInput.files[0];
        if (!file) return;
        CS.decodeImageFile(file, function (img) {
          CS.setSharedImage(img, null);
          if (sharedStatus) sharedStatus.textContent = "Loaded " + (file.name || "image") + ".";
        }, function (message) {
          if (sharedStatus) sharedStatus.textContent = message;
        });
        sharedInput.value = "";
      });
    }
  }

  /* ========================================================================
     Init — every mode's DOM exists up front (all five panels are in the
     document at load, just hidden), so every module can wire itself once,
     regardless of which mode is visible first.
     ========================================================================== */
  initAppShell();
  MemeMode.init();
  FiltersMode.init();
  EnhanceMode.init();
  GradientMode.init();
  LogoMode.init();
})();
