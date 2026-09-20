(function () {
  "use strict";

  // ---- state ----------------------------------------------------------
  var state = {
    mode: "remove-bg",
    naturalW: 0,
    naturalH: 0,
    sourceImageData: null,   // ImageData, never mutated
    removeColor: hexToRgb("#ffffff"),
    removeTolerance: 40,
    bgColor: null,            // auto-sampled, {r,g,b} or null until an image loads
    bgTolerance: 40,
    fromColor: hexToRgb("#e2972e"),
    toColor: hexToRgb("#2e7de2"),
    recolorTolerance: 40,
    feather: 18,
    showOriginal: false,
    pickingFor: null,         // null | "remove" | "from"

    // manual brush: two persistent per-pixel override masks, values -1..1.
    // +1 = fully force the mode's effect here, -1 = fully force original,
    // 0 = defer to the automatic detection. alphaMask backs remove-bg /
    // remove-color; recolorMask backs recolor. Kept separate so switching
    // tabs doesn't discard brush work done under the other family.
    alphaMask: null,
    recolorMask: null,
    brushTool: "off",         // "off" | "apply" | "restore"
    brushSize: 40,
    brushHardness: 60,
    isPainting: false,
    strokeSnapshot: null,     // { mask: Float32Array, into: "alpha"|"recolor" } saved at stroke start
    renderScheduled: false,

    // rectangular selection — when set, every effect (automatic + manual
    // brush) is clipped to this area; everything outside is left untouched
    selectTool: false,        // armed to draw a new selection
    selection: null,          // {x0,y0,x1,y1} in natural image coords, committed
    isSelecting: false,
    selectionDraft: null
  };

  // ---- element refs -----------------------------------------------------
  var uploadZone = document.getElementById("uploadZone");
  var uploadCard = document.getElementById("uploadCard");
  var fileInput = document.getElementById("fileInput");
  var chooseImageBtn = document.getElementById("chooseImageBtn");
  var editor = document.getElementById("editor");
  var viewCanvas = document.getElementById("viewCanvas");
  var canvasHint = document.getElementById("canvasHint");
  var modeTabs = document.getElementById("modeTabs");
  var downloadBtn = document.getElementById("downloadBtn");
  var resetBtn = document.getElementById("resetBtn");

  var removeColorInput = document.getElementById("removeColorInput");
  var removeCustomSwatch = document.getElementById("removeCustomSwatch");
  var removeEyedropperBtn = document.getElementById("removeEyedropperBtn");
  var removeTolerance = document.getElementById("removeTolerance");

  var resampleBgBtn = document.getElementById("resampleBgBtn");
  var bgTolerance = document.getElementById("bgTolerance");

  var fromColorInput = document.getElementById("fromColorInput");
  var fromCustomSwatch = document.getElementById("fromCustomSwatch");
  var fromEyedropperBtn = document.getElementById("fromEyedropperBtn");
  var toColorInput = document.getElementById("toColorInput");
  var toCustomSwatch = document.getElementById("toCustomSwatch");
  var recolorTolerance = document.getElementById("recolorTolerance");

  var featherInput = document.getElementById("feather");
  var showOriginalInput = document.getElementById("showOriginal");

  var brushToolTabs = document.getElementById("brushToolTabs");
  var brushApplyTab = document.getElementById("brushApplyTab");
  var brushSizeInput = document.getElementById("brushSize");
  var brushHardnessInput = document.getElementById("brushHardness");
  var undoStrokeBtn = document.getElementById("undoStrokeBtn");
  var clearBrushBtn = document.getElementById("clearBrushBtn");
  var brushCursor = document.getElementById("brushCursor");
  var canvasFrame = document.getElementById("canvasFrame");

  var selectToolBtn = document.getElementById("selectToolBtn");
  var clearSelectionBtn = document.getElementById("clearSelectionBtn");
  var selectionOverlay = document.getElementById("selectionOverlay");

  var rotateLeftBtn = document.getElementById("rotateLeftBtn");
  var rotateRightBtn = document.getElementById("rotateRightBtn");
  var flipHBtn = document.getElementById("flipHBtn");
  var flipVBtn = document.getElementById("flipVBtn");
  var cropBtn = document.getElementById("cropBtn");

  var ctx = viewCanvas.getContext("2d", { willReadFrequently: true });

  // offscreen canvas holds the untouched source pixels at natural size
  var srcCanvas = document.createElement("canvas");
  var srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

  // ---- upload -----------------------------------------------------------

  uploadCard.addEventListener("click", function () { fileInput.click(); });
  chooseImageBtn.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    uploadCard.addEventListener(evt, function (e) {
      e.preventDefault();
      uploadCard.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    uploadCard.addEventListener(evt, function (e) {
      e.preventDefault();
      uploadCard.classList.remove("is-dragover");
    });
  });
  uploadCard.addEventListener("drop", function (e) {
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  function loadImageFile(file) {
    if (!/^image\//.test(file.type)) return;
    var img = new Image();
    img.onload = function () {
      state.naturalW = img.naturalWidth;
      state.naturalH = img.naturalHeight;
      srcCanvas.width = state.naturalW;
      srcCanvas.height = state.naturalH;
      srcCtx.clearRect(0, 0, state.naturalW, state.naturalH);
      srcCtx.drawImage(img, 0, 0);
      state.sourceImageData = srcCtx.getImageData(0, 0, state.naturalW, state.naturalH);

      viewCanvas.width = state.naturalW;
      viewCanvas.height = state.naturalH;

      state.bgColor = sampleCorners(state.sourceImageData);
      state.alphaMask = new Float32Array(state.naturalW * state.naturalH);
      state.recolorMask = new Float32Array(state.naturalW * state.naturalH);
      state.strokeSnapshot = null;
      state.selection = null;
      state.selectionDraft = null;
      setSelectTool(false);

      uploadZone.hidden = true;
      editor.hidden = false;
      render();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  resetBtn.addEventListener("click", function () {
    editor.hidden = true;
    uploadZone.hidden = false;
    fileInput.value = "";
    state.sourceImageData = null;
    state.pickingFor = null;
    state.alphaMask = null;
    state.recolorMask = null;
    state.strokeSnapshot = null;
    state.selection = null;
    state.selectionDraft = null;
    setBrushTool("off");
    setSelectTool(false);
  });

  // ---- mode tabs ----------------------------------------------------------

  modeTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".pill-tab");
    if (!btn) return;
    state.mode = btn.getAttribute("data-mode");
    state.pickingFor = null;
    modeTabs.querySelectorAll(".pill-tab").forEach(function (t) {
      t.classList.toggle("is-active", t === btn);
    });
    document.querySelectorAll(".control-group[data-for-mode]").forEach(function (g) {
      g.hidden = g.getAttribute("data-for-mode") !== state.mode;
    });
    updateHint();
    updateBrushLabels();
    render();
  });

  function updateHint() {
    if (state.selectTool) {
      canvasHint.textContent = "Drag a rectangle to select an area";
    } else if (state.brushTool !== "off") {
      canvasHint.textContent = state.brushTool === "apply"
        ? "Drag to paint the effect onto this area"
        : "Drag to restore the original image here";
    } else if (state.pickingFor) {
      canvasHint.textContent = "Click the image to sample that color";
    } else if (state.mode === "remove-bg") {
      canvasHint.textContent = "Background is sampled from the image corners";
    } else {
      canvasHint.textContent = "Click the image to pick a color, or use the eyedropper button";
    }
    if (state.selection && !state.selectTool) {
      canvasHint.textContent += " — editing is limited to the selected area";
    }
  }
  updateHint();

  function updateBrushLabels() {
    brushApplyTab.textContent = state.mode === "recolor" ? "Paint Color" : "Erase";
  }
  updateBrushLabels();

  // ---- controls: remove-color -----------------------------------------

  removeColorInput.addEventListener("input", function () {
    state.removeColor = hexToRgb(removeColorInput.value);
    state.pickingFor = null;
    render();
  });
  removeEyedropperBtn.addEventListener("click", function () {
    state.pickingFor = "remove";
    setBrushTool("off");
    setSelectTool(false);
    updateHint();
  });
  removeTolerance.addEventListener("input", function () {
    state.removeTolerance = Number(removeTolerance.value);
    render();
  });

  // ---- controls: remove-bg ---------------------------------------------

  resampleBgBtn.addEventListener("click", function () {
    if (!state.sourceImageData) return;
    state.bgColor = sampleCorners(state.sourceImageData);
    render();
  });
  bgTolerance.addEventListener("input", function () {
    state.bgTolerance = Number(bgTolerance.value);
    render();
  });

  // ---- controls: recolor -------------------------------------------------

  fromColorInput.addEventListener("input", function () {
    state.fromColor = hexToRgb(fromColorInput.value);
    state.pickingFor = null;
    render();
  });
  fromEyedropperBtn.addEventListener("click", function () {
    state.pickingFor = "from";
    setBrushTool("off");
    setSelectTool(false);
    updateHint();
  });
  toColorInput.addEventListener("input", function () {
    state.toColor = hexToRgb(toColorInput.value);
    render();
  });
  recolorTolerance.addEventListener("input", function () {
    state.recolorTolerance = Number(recolorTolerance.value);
    render();
  });

  // ---- advanced -----------------------------------------------------------

  featherInput.addEventListener("input", function () {
    state.feather = Number(featherInput.value);
    render();
  });
  showOriginalInput.addEventListener("change", function () {
    state.showOriginal = showOriginalInput.checked;
    render();
  });

  // ---- manual brush ---------------------------------------------------

  function setBrushTool(tool) {
    state.brushTool = tool;
    brushToolTabs.querySelectorAll(".pill-tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-brush") === tool);
    });
    if (tool !== "off") {
      state.pickingFor = null;
      state.selectTool = false;
      selectToolBtn.classList.remove("is-active");
    }
    updateHint();
  }

  brushToolTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".pill-tab");
    if (!btn) return;
    setBrushTool(btn.getAttribute("data-brush"));
  });

  brushSizeInput.addEventListener("input", function () {
    state.brushSize = Number(brushSizeInput.value);
    sizeCursor();
  });
  brushHardnessInput.addEventListener("input", function () {
    state.brushHardness = Number(brushHardnessInput.value);
  });

  function activeMask() {
    return state.mode === "recolor" ? state.recolorMask : state.alphaMask;
  }

  clearBrushBtn.addEventListener("click", function () {
    var mask = activeMask();
    if (!mask) return;
    mask.fill(0);
    render();
  });

  undoStrokeBtn.addEventListener("click", function () {
    var snap = state.strokeSnapshot;
    if (!snap) return;
    var mask = snap.into === "recolor" ? state.recolorMask : state.alphaMask;
    mask.set(snap.mask);
    state.strokeSnapshot = null;
    render();
  });

  function paintBrushAt(px, py) {
    var mask = activeMask();
    if (!mask) return;
    var w = state.naturalW, h = state.naturalH;
    var radius = state.brushSize;
    var hardness = state.brushHardness / 100;
    var innerR = radius * hardness;
    var target = state.brushTool === "apply" ? 1 : -1;

    var x0 = clamp(Math.floor(px - radius), 0, w - 1);
    var x1 = clamp(Math.ceil(px + radius), 0, w - 1);
    var y0 = clamp(Math.floor(py - radius), 0, h - 1);
    var y1 = clamp(Math.ceil(py + radius), 0, h - 1);

    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - px, dy = y - py;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        var strength;
        if (dist <= innerR) {
          strength = 1;
        } else {
          strength = 1 - (dist - innerR) / Math.max(1, radius - innerR);
        }
        strength = clamp(strength, 0, 1);
        var idx = y * w + x;
        mask[idx] = clamp(mask[idx] + (target - mask[idx]) * strength, -1, 1);
      }
    }
  }

  function canvasToImageCoords(clientX, clientY) {
    var rect = viewCanvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor((clientX - rect.left) / rect.width * state.naturalW), 0, state.naturalW - 1),
      y: clamp(Math.floor((clientY - rect.top) / rect.height * state.naturalH), 0, state.naturalH - 1)
    };
  }

  function scheduleRender() {
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    requestAnimationFrame(function () {
      state.renderScheduled = false;
      render();
    });
  }

  var lastPaintPoint = null;

  viewCanvas.addEventListener("pointerdown", function (e) {
    if (!state.sourceImageData) return;
    if (state.selectTool) {
      e.preventDefault();
      startSelectionDrag(e);
      return;
    }
    if (state.brushTool === "off") return;
    e.preventDefault();
    viewCanvas.setPointerCapture(e.pointerId);
    var mask = activeMask();
    state.strokeSnapshot = { into: state.mode === "recolor" ? "recolor" : "alpha", mask: mask.slice() };
    state.isPainting = true;
    var pt = canvasToImageCoords(e.clientX, e.clientY);
    lastPaintPoint = pt;
    paintBrushAt(pt.x, pt.y);
    scheduleRender();
  });

  viewCanvas.addEventListener("pointermove", function (e) {
    if (state.isSelecting) {
      updateSelectionDrag(e);
      return;
    }
    positionCursor(e);
    if (!state.isPainting) return;
    var pt = canvasToImageCoords(e.clientX, e.clientY);
    // interpolate between the last point and this one so a fast drag
    // doesn't leave gaps between dabs
    if (lastPaintPoint) {
      var steps = Math.max(1, Math.ceil(Math.hypot(pt.x - lastPaintPoint.x, pt.y - lastPaintPoint.y) / (state.brushSize * 0.4)));
      for (var s = 1; s <= steps; s++) {
        var t = s / steps;
        paintBrushAt(
          lastPaintPoint.x + (pt.x - lastPaintPoint.x) * t,
          lastPaintPoint.y + (pt.y - lastPaintPoint.y) * t
        );
      }
    } else {
      paintBrushAt(pt.x, pt.y);
    }
    lastPaintPoint = pt;
    scheduleRender();
  });

  function endStroke(e) {
    if (state.isSelecting) {
      finishSelectionDrag(e);
      return;
    }
    if (!state.isPainting) return;
    state.isPainting = false;
    lastPaintPoint = null;
    if (e && viewCanvas.hasPointerCapture(e.pointerId)) viewCanvas.releasePointerCapture(e.pointerId);
    render();
  }
  viewCanvas.addEventListener("pointerup", endStroke);
  viewCanvas.addEventListener("pointercancel", endStroke);

  function positionCursor(e) {
    if (state.brushTool === "off" || state.selectTool) { brushCursor.hidden = true; return; }
    var frameRect = canvasFrame.getBoundingClientRect();
    var canvasRect = viewCanvas.getBoundingClientRect();
    var scale = canvasRect.width / (state.naturalW || 1);
    var size = state.brushSize * 2 * scale;
    brushCursor.style.width = size + "px";
    brushCursor.style.height = size + "px";
    brushCursor.style.left = (e.clientX - frameRect.left) + "px";
    brushCursor.style.top = (e.clientY - frameRect.top) + "px";
    brushCursor.hidden = false;
    brushCursor.style.display = "block";
  }
  function sizeCursor() {
    // re-applied on next pointermove; nothing to do until then
  }
  viewCanvas.addEventListener("pointerleave", function () {
    brushCursor.hidden = true;
    brushCursor.style.display = "none";
  });

  // ---- rectangular selection -----------------------------------------

  function setSelectTool(active) {
    state.selectTool = active;
    selectToolBtn.classList.toggle("is-active", active);
    if (active) setBrushTool("off");
    if (active) state.pickingFor = null;
    updateHint();
  }

  selectToolBtn.addEventListener("click", function () {
    setSelectTool(!state.selectTool);
  });

  clearSelectionBtn.addEventListener("click", function () {
    state.selection = null;
    updateSelectionOverlay();
    updateHint();
    render();
  });

  function normalizedSelection(sel) {
    var w = state.naturalW, h = state.naturalH;
    return {
      x0: clamp(Math.min(sel.x0, sel.x1), 0, w),
      y0: clamp(Math.min(sel.y0, sel.y1), 0, h),
      x1: clamp(Math.max(sel.x0, sel.x1), 0, w),
      y1: clamp(Math.max(sel.y0, sel.y1), 0, h)
    };
  }

  function selectionToDisplayRect(sel) {
    var canvasRect = viewCanvas.getBoundingClientRect();
    var frameRect = canvasFrame.getBoundingClientRect();
    var scaleX = canvasRect.width / (state.naturalW || 1);
    var scaleY = canvasRect.height / (state.naturalH || 1);
    return {
      left: (canvasRect.left - frameRect.left) + sel.x0 * scaleX,
      top: (canvasRect.top - frameRect.top) + sel.y0 * scaleY,
      width: (sel.x1 - sel.x0) * scaleX,
      height: (sel.y1 - sel.y0) * scaleY
    };
  }

  function updateSelectionOverlay() {
    var sel = state.isSelecting ? state.selectionDraft : state.selection;
    if (!sel || !state.sourceImageData) {
      selectionOverlay.style.display = "none";
      return;
    }
    var r = selectionToDisplayRect(normalizedSelection(sel));
    selectionOverlay.style.left = r.left + "px";
    selectionOverlay.style.top = r.top + "px";
    selectionOverlay.style.width = r.width + "px";
    selectionOverlay.style.height = r.height + "px";
    selectionOverlay.style.display = "block";
  }

  function startSelectionDrag(e) {
    var pt = canvasToImageCoords(e.clientX, e.clientY);
    state.isSelecting = true;
    state.selectionDraft = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    viewCanvas.setPointerCapture(e.pointerId);
    updateSelectionOverlay();
  }

  function updateSelectionDrag(e) {
    var pt = canvasToImageCoords(e.clientX, e.clientY);
    state.selectionDraft.x1 = pt.x;
    state.selectionDraft.y1 = pt.y;
    updateSelectionOverlay();
  }

  function finishSelectionDrag(e) {
    state.isSelecting = false;
    var norm = normalizedSelection(state.selectionDraft);
    state.selection = (norm.x1 - norm.x0 >= 3 && norm.y1 - norm.y0 >= 3) ? norm : null;
    state.selectionDraft = null;
    if (e && viewCanvas.hasPointerCapture(e.pointerId)) viewCanvas.releasePointerCapture(e.pointerId);
    setSelectTool(false); // disarm after drawing; the selection itself persists
    updateSelectionOverlay();
    render();
  }

  window.addEventListener("resize", updateSelectionOverlay);

  // ---- transform: rotate, flip, crop -----------------------------------

  function applyNewSource(canvas, w, h) {
    state.naturalW = w;
    state.naturalH = h;
    srcCanvas.width = w;
    srcCanvas.height = h;
    srcCtx.clearRect(0, 0, w, h);
    srcCtx.drawImage(canvas, 0, 0);
    state.sourceImageData = srcCtx.getImageData(0, 0, w, h);

    viewCanvas.width = w;
    viewCanvas.height = h;

    state.bgColor = sampleCorners(state.sourceImageData);
    // geometry changed: brush edits and any selection no longer line up
    state.alphaMask = new Float32Array(w * h);
    state.recolorMask = new Float32Array(w * h);
    state.strokeSnapshot = null;
    state.selection = null;
    state.selectionDraft = null;
    updateSelectionOverlay();
    render();
  }

  function rotateImage(clockwise) {
    if (!state.sourceImageData) return;
    var w = state.naturalW, h = state.naturalH;
    var tmp = document.createElement("canvas");
    tmp.width = h;
    tmp.height = w;
    var tctx = tmp.getContext("2d");
    tctx.save();
    if (clockwise) {
      tctx.translate(h, 0);
      tctx.rotate(Math.PI / 2);
    } else {
      tctx.translate(0, w);
      tctx.rotate(-Math.PI / 2);
    }
    tctx.drawImage(srcCanvas, 0, 0);
    tctx.restore();
    applyNewSource(tmp, h, w);
  }

  function flipImage(axis) {
    if (!state.sourceImageData) return;
    var w = state.naturalW, h = state.naturalH;
    var tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    var tctx = tmp.getContext("2d");
    tctx.save();
    if (axis === "h") {
      tctx.translate(w, 0);
      tctx.scale(-1, 1);
    } else {
      tctx.translate(0, h);
      tctx.scale(1, -1);
    }
    tctx.drawImage(srcCanvas, 0, 0);
    tctx.restore();
    applyNewSource(tmp, w, h);
  }

  function cropToSelection() {
    if (!state.selection || !state.sourceImageData) return;
    var sel = state.selection;
    var w = sel.x1 - sel.x0, h = sel.y1 - sel.y0;
    if (w < 1 || h < 1) return;
    var tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d").drawImage(srcCanvas, sel.x0, sel.y0, w, h, 0, 0, w, h);
    applyNewSource(tmp, w, h);
  }

  rotateLeftBtn.addEventListener("click", function () { rotateImage(false); });
  rotateRightBtn.addEventListener("click", function () { rotateImage(true); });
  flipHBtn.addEventListener("click", function () { flipImage("h"); });
  flipVBtn.addEventListener("click", function () { flipImage("v"); });
  cropBtn.addEventListener("click", cropToSelection);

  // ---- eyedropper click on canvas ----------------------------------------

  viewCanvas.addEventListener("click", function (e) {
    if (!state.pickingFor || !state.sourceImageData) return;
    var rect = viewCanvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / rect.width * state.naturalW);
    var y = Math.floor((e.clientY - rect.top) / rect.height * state.naturalH);
    x = clamp(x, 0, state.naturalW - 1);
    y = clamp(y, 0, state.naturalH - 1);
    var rgb = pixelAt(state.sourceImageData, x, y);

    if (state.pickingFor === "remove") {
      state.removeColor = rgb;
      removeColorInput.value = rgbToHex(rgb);
    } else if (state.pickingFor === "from") {
      state.fromColor = rgb;
      fromColorInput.value = rgbToHex(rgb);
    }
    state.pickingFor = null;
    updateHint();
    render();
  });

  // ---- download -----------------------------------------------------------

  downloadBtn.addEventListener("click", function () {
    var link = document.createElement("a");
    link.download = "color-magic.png";
    link.href = viewCanvas.toDataURL("image/png");
    link.click();
  });

  // ---- the one paint routine ---------------------------------------------
  // Every output (live preview and export) is drawn through this function.
  // It never mutates state.sourceImageData; it always reads from it fresh.

  function paint() {
    if (!state.sourceImageData) return null;

    if (state.showOriginal) {
      return cloneImageData(state.sourceImageData);
    }

    var out = cloneImageData(state.sourceImageData);
    var data = out.data;
    var feather = state.feather;
    var w = out.width;
    var sel = state.selection; // {x0,y0,x1,y1} in natural coords, or null for "whole image"

    if (state.mode === "remove-bg" || state.mode === "remove-color") {
      var target = state.mode === "remove-bg" ? state.bgColor : state.removeColor;
      var tolerance = state.mode === "remove-bg" ? state.bgTolerance : state.removeTolerance;
      if (!target) return out;
      var aMask = state.alphaMask;

      for (var i = 0; i < data.length; i += 4) {
        if (sel) {
          var pIdx = i / 4;
          var px = pIdx % w, py = (pIdx - px) / w;
          if (px < sel.x0 || px >= sel.x1 || py < sel.y0 || py >= sel.y1) continue;
        }
        var d = colorDistance(data[i], data[i + 1], data[i + 2], target);
        var autoMul = falloff(d, tolerance, feather); // 1 = fully removed, 0 = fully kept
        var manual = aMask ? aMask[i / 4] : 0;         // -1 = force keep, +1 = force remove
        var finalMul;
        if (manual > 0) {
          finalMul = autoMul + (1 - autoMul) * manual;
        } else if (manual < 0) {
          finalMul = autoMul * (1 + manual);
        } else {
          finalMul = autoMul;
        }
        data[i + 3] = Math.round(data[i + 3] * (1 - finalMul));
      }
    } else if (state.mode === "recolor") {
      var from = state.fromColor;
      var to = state.toColor;
      var tol = state.recolorTolerance;
      var rMask = state.recolorMask;

      for (var j = 0; j < data.length; j += 4) {
        if (sel) {
          var qIdx = j / 4;
          var qx = qIdx % w, qy = (qIdx - qx) / w;
          if (qx < sel.x0 || qx >= sel.x1 || qy < sel.y0 || qy >= sel.y1) continue;
        }
        var dd = colorDistance(data[j], data[j + 1], data[j + 2], from);
        var autoMix = falloff(dd, tol, feather); // 1 = fully replaced, 0 = original
        var manualMix = rMask ? rMask[j / 4] : 0; // -1 = force original, +1 = force replaced
        var mix;
        if (manualMix > 0) {
          mix = autoMix + (1 - autoMix) * manualMix;
        } else if (manualMix < 0) {
          mix = autoMix * (1 + manualMix);
        } else {
          mix = autoMix;
        }
        if (mix > 0) {
          data[j] = Math.round(data[j] * (1 - mix) + to.r * mix);
          data[j + 1] = Math.round(data[j + 1] * (1 - mix) + to.g * mix);
          data[j + 2] = Math.round(data[j + 2] * (1 - mix) + to.b * mix);
        }
      }
    }

    return out;
  }

  function render() {
    var out = paint();
    if (!out) return;
    ctx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    ctx.putImageData(out, 0, 0);
    updateSelectionOverlay();
  }

  // ---- color helpers -------------------------------------------------------

  function colorDistance(r, g, b, target) {
    var dr = r - target.r, dg = g - target.g, db = b - target.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Returns a 0..1 strength: 1 inside the tolerance radius, fading linearly
  // to 0 across the feather band just outside it.
  function falloff(distance, tolerance, feather) {
    if (distance <= tolerance) return 1;
    if (feather <= 0) return 0;
    var t = 1 - (distance - tolerance) / feather;
    return clamp(t, 0, 1);
  }

  function pixelAt(imageData, x, y) {
    var i = (y * imageData.width + x) * 4;
    return { r: imageData.data[i], g: imageData.data[i + 1], b: imageData.data[i + 2] };
  }

  function sampleCorners(imageData) {
    var w = imageData.width, h = imageData.height;
    var size = Math.max(1, Math.floor(Math.min(w, h) * 0.04));
    var points = [
      [0, 0], [w - size, 0], [0, h - size], [w - size, h - size]
    ];
    var r = 0, g = 0, b = 0, n = 0;
    points.forEach(function (p) {
      for (var yy = p[1]; yy < p[1] + size; yy += Math.max(1, Math.floor(size / 6))) {
        for (var xx = p[0]; xx < p[0] + size; xx += Math.max(1, Math.floor(size / 6))) {
          var px = pixelAt(imageData, clamp(xx, 0, w - 1), clamp(yy, 0, h - 1));
          r += px.r; g += px.g; b += px.b; n++;
        }
      }
    });
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }

  function cloneImageData(imageData) {
    var copy = new Uint8ClampedArray(imageData.data);
    return new ImageData(copy, imageData.width, imageData.height);
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
  }

  function rgbToHex(rgb) {
    function h(n) { return n.toString(16).padStart(2, "0"); }
    return "#" + h(rgb.r) + h(rgb.g) + h(rgb.b);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

})();
