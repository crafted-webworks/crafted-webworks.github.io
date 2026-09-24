/* ==========================================================================
   Watermark Adder — Standalone Tool Logic
   Follows tools/STANDARDS.md — self-contained, no globals leaked, zero backend.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     DOM Element References
     ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    // Header & Actions
    btnSample: $("wm-btn-sample"),
    btnReset: $("wm-btn-reset"),
    btnDownloadTop: $("wm-btn-download-top"),
    btnDownload: $("wm-btn-download"),
    badgeStatus: $("wm-badge-status"),

    // Main Image
    mainDropzone: $("wm-main-dropzone"),
    mainFileInput: $("wm-main-file-input"),
    btnChangeMain: $("wm-btn-change-main"),
    mainFileInfo: $("wm-main-file-info"),
    mainName: $("wm-main-name"),
    mainMeta: $("wm-main-meta"),

    // Watermark Content Types
    typeTabs: $("wm-type-tabs"),
    paneImage: $("wm-pane-image"),
    paneText: $("wm-pane-text"),
    logoDropzone: $("wm-logo-dropzone"),
    logoFileInput: $("wm-logo-file-input"),
    logoFileInfo: $("wm-logo-file-info"),
    logoName: $("wm-logo-name"),
    btnSampleLogo: $("wm-btn-sample-logo"),

    // Watermark Text Controls
    textInput: $("wm-text-input"),
    textFont: $("wm-text-font"),
    textColor: $("wm-text-color"),
    textColorHex: $("wm-text-color-hex"),
    textBold: $("wm-text-bold"),
    textShadow: $("wm-text-shadow"),

    // Placement Mode Tabs & Panes
    modeTabs: $("wm-mode-tabs"),
    paneSingle: $("wm-pane-single"),
    paneFill: $("wm-pane-fill"),

    // Single Placement Controls
    posLabel: $("wm-pos-label"),
    posBtns: $$(".wm-pos-btn"),
    singleMargin: $("wm-single-margin"),
    singleMarginVal: $("wm-single-margin-val"),

    // Fill Placement Controls
    fillDensity: $("wm-fill-density"),
    fillDensityVal: $("wm-fill-density-val"),
    fillGap: $("wm-fill-gap"),
    fillGapVal: $("wm-fill-gap-val"),
    fillPatternBtns: $$("[data-fill-pattern]"),

    // Shared Appearance Controls
    scale: $("wm-scale"),
    scaleVal: $("wm-scale-val"),
    opacity: $("wm-opacity"),
    opacityVal: $("wm-opacity-val"),
    rotation: $("wm-rotation"),
    rotationVal: $("wm-rotation-val"),
    rotBtns: $$("[data-rot]"),
    blendMode: $("wm-blend-mode"),

    // Export Controls
    exportFormat: $("wm-export-format"),
    exportQuality: $("wm-export-quality"),
    jpegQualityWrap: $("wm-jpeg-quality-wrap"),

    // Stage & Canvas
    canvasContainer: $("wm-canvas-container"),
    canvasWrap: $("wm-canvas-wrap"),
    mainCanvas: $("wm-main-canvas"),
    overlayCanvas: $("wm-overlay-canvas"),
    emptyState: $("wm-empty-state"),
    emptySampleBtn: $("wm-empty-sample-btn"),

    // Zoom Bar
    zoomOut: $("wm-zoom-out"),
    zoomIn: $("wm-zoom-in"),
    zoomFit: $("wm-zoom-fit"),
    zoom100: $("wm-zoom-100"),
    zoomPct: $("wm-zoom-pct"),
    dimensionsTag: $("wm-dimensions-tag")
  };

  var mainCtx = els.mainCanvas.getContext("2d");
  var overlayCtx = els.overlayCanvas.getContext("2d");

  /* ------------------------------------------------------------------
     Application State
     ------------------------------------------------------------------ */
  var state = {
    mainImage: null,
    mainFilename: "image.jpg",
    mainOriginalWidth: 0,
    mainOriginalHeight: 0,

    watermarkType: "image", // "image" | "text"
    watermarkImage: null,
    watermarkFilename: "logo.png",

    textString: "© CRAFTED WEBWORKS",
    textFont: "sans-serif",
    textColor: "#FFFFFF",
    textBold: true,
    textShadow: true,

    placementMode: "single", // "single" | "fill"

    // Single Placement
    positionPreset: "bottom-right",
    marginPct: 4,
    customPosition: null, // { xPct: 0..1, yPct: 0..1 } when dragged

    // Fill Placement
    fillDensity: 4, // 2..10
    fillGap: 40,
    fillPattern: "staggered", // "staggered" | "grid"

    // Appearance
    scale: 25, // 5% .. 120%
    opacity: 75, // 5% .. 100%
    rotation: 0, // -180 .. 180
    blendMode: "source-over",

    // Export
    exportFormat: "image/jpeg",
    exportQuality: 0.92,

    // Stage & Interaction
    zoom: 1.0,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    watermarkRect: { x: 0, y: 0, w: 0, h: 0 } // Current bounds in canvas space
  };

  /* ------------------------------------------------------------------
     Procedural Sample Generators (100% Offline, Crisp High-DPI)
     ------------------------------------------------------------------ */
  function createSamplePhoto() {
    var c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    var ctx = c.getContext("2d");

    // Sky gradient
    var sky = ctx.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, "#0F2027");
    sky.addColorStop(0.5, "#203A43");
    sky.addColorStop(1, "#2C5364");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, c.width, c.height);

    // Sun / Glow
    var sun = ctx.createRadialGradient(800, 480, 20, 800, 480, 400);
    sun.addColorStop(0, "rgba(255, 230, 150, 0.9)");
    sun.addColorStop(0.3, "rgba(255, 160, 60, 0.5)");
    sun.addColorStop(1, "rgba(255, 100, 50, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, c.width, c.height);

    // Mountain Layer 1 (Distant)
    ctx.fillStyle = "#1b2d3b";
    ctx.beginPath();
    ctx.moveTo(0, 600);
    ctx.lineTo(250, 420);
    ctx.lineTo(550, 560);
    ctx.lineTo(800, 380);
    ctx.lineTo(1100, 540);
    ctx.lineTo(1400, 400);
    ctx.lineTo(1600, 520);
    ctx.lineTo(1600, 1000);
    ctx.lineTo(0, 1000);
    ctx.closePath();
    ctx.fill();

    // Mountain Layer 2 (Closer)
    ctx.fillStyle = "#0e1a24";
    ctx.beginPath();
    ctx.moveTo(0, 680);
    ctx.lineTo(380, 480);
    ctx.lineTo(700, 640);
    ctx.lineTo(1050, 460);
    ctx.lineTo(1380, 620);
    ctx.lineTo(1600, 530);
    ctx.lineTo(1600, 1000);
    ctx.lineTo(0, 1000);
    ctx.closePath();
    ctx.fill();

    // Water Reflection
    var water = ctx.createLinearGradient(0, 650, 0, 1000);
    water.addColorStop(0, "#081017");
    water.addColorStop(0.5, "#0b1620");
    water.addColorStop(1, "#04090e");
    ctx.fillStyle = water;
    ctx.fillRect(0, 650, c.width, 350);

    // Water Horizon Glow
    var horizon = ctx.createLinearGradient(0, 650, 0, 720);
    horizon.addColorStop(0, "rgba(255, 170, 80, 0.3)");
    horizon.addColorStop(1, "rgba(255, 170, 80, 0)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 650, c.width, 70);

    var img = new Image();
    img.src = c.toDataURL("image/jpeg", 0.95);
    return img;
  }

  function createSampleLogo() {
    var c = document.createElement("canvas");
    c.width = 600;
    c.height = 320;
    var ctx = c.getContext("2d");

    ctx.clearRect(0, 0, c.width, c.height);

    // Decorative Emblem Badge
    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 8;
    ctx.fillStyle = "rgba(12, 79, 191, 0.85)";

    // Rounded rectangle card
    var rx = 30, ry = 20, rw = 540, rh = 280, rad = 24;
    ctx.beginPath();
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + rw - rad, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
    ctx.lineTo(rx + rw, ry + rh - rad);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
    ctx.lineTo(rx + rad, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
    ctx.lineTo(rx, ry + rad);
    ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner dashed border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rx + 15, ry + 15, rw - 30, rh - 30);
    ctx.setLineDash([]);

    // Typography
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "bold 44px 'Segoe UI', -apple-system, sans-serif";
    ctx.fillText("CRAFTED", 300, 100);

    ctx.font = "700 24px 'Segoe UI', -apple-system, sans-serif";
    ctx.fillStyle = "#FFAA33";
    ctx.fillText("WEBWORKS STUDIO", 300, 155);

    ctx.font = "600 16px monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("ORIGINAL PROTECTED WORK", 300, 210);

    ctx.restore();

    var img = new Image();
    img.src = c.toDataURL("image/png");
    return img;
  }

  // Pre-instantiate default sample logo
  state.watermarkImage = createSampleLogo();

  /* ------------------------------------------------------------------
     High-Fidelity Watermark Drawing Engine (STANDARDS.md §6)
     Reused by both live preview & final full-resolution export!
     ------------------------------------------------------------------ */
  function paintWatermark(ctx, canvasWidth, canvasHeight, isExport) {
    if (!state.mainImage) return;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 1. Draw Background Main Image
    ctx.drawImage(state.mainImage, 0, 0, canvasWidth, canvasHeight);

    // If no watermark configured, exit
    var hasLogo = state.watermarkType === "image" && state.watermarkImage && state.watermarkImage.complete && state.watermarkImage.naturalWidth > 0;
    var hasText = state.watermarkType === "text" && state.textString.trim().length > 0;

    if (!hasLogo && !hasText) {
      ctx.restore();
      return;
    }

    // Set Blend Mode & Opacity
    ctx.globalAlpha = Math.max(0.01, Math.min(1.0, state.opacity / 100));
    ctx.globalCompositeOperation = state.blendMode || "source-over";

    // Calculate watermark base dimension
    var minDim = Math.min(canvasWidth, canvasHeight);
    var scaleRatio = (state.scale / 100);

    if (state.placementMode === "single") {
      // ---------------- SINGLE WATERMARK MODE ----------------
      var wmWidth = 0, wmHeight = 0;

      if (state.watermarkType === "image") {
        var aspect = state.watermarkImage.naturalWidth / state.watermarkImage.naturalHeight;
        wmWidth = minDim * scaleRatio;
        wmHeight = wmWidth / aspect;
      } else {
        var fontSize = Math.max(12, minDim * scaleRatio * 0.22);
        ctx.font = (state.textBold ? "bold " : "") + Math.round(fontSize) + "px " + state.textFont;
        var textMetrics = ctx.measureText(state.textString);
        wmWidth = textMetrics.width;
        wmHeight = fontSize * 1.3;
      }

      // Determine center position (cx, cy)
      var cx = 0, cy = 0;
      var marginX = canvasWidth * (state.marginPct / 100);
      var marginY = canvasHeight * (state.marginPct / 100);

      if (state.customPosition) {
        cx = state.customPosition.xPct * canvasWidth;
        cy = state.customPosition.yPct * canvasHeight;
      } else {
        switch (state.positionPreset) {
          case "top-left":
            cx = marginX + wmWidth / 2;
            cy = marginY + wmHeight / 2;
            break;
          case "top-center":
            cx = canvasWidth / 2;
            cy = marginY + wmHeight / 2;
            break;
          case "top-right":
            cx = canvasWidth - marginX - wmWidth / 2;
            cy = marginY + wmHeight / 2;
            break;
          case "center-left":
            cx = marginX + wmWidth / 2;
            cy = canvasHeight / 2;
            break;
          case "center":
            cx = canvasWidth / 2;
            cy = canvasHeight / 2;
            break;
          case "center-right":
            cx = canvasWidth - marginX - wmWidth / 2;
            cy = canvasHeight / 2;
            break;
          case "bottom-left":
            cx = marginX + wmWidth / 2;
            cy = canvasHeight - marginY - wmHeight / 2;
            break;
          case "bottom-center":
            cx = canvasWidth / 2;
            cy = canvasHeight - marginY - wmHeight / 2;
            break;
          case "bottom-right":
          default:
            cx = canvasWidth - marginX - wmWidth / 2;
            cy = canvasHeight - marginY - wmHeight / 2;
            break;
        }
      }

      // Record rect for dragging hit-test if preview
      if (!isExport) {
        state.watermarkRect = {
          cx: cx,
          cy: cy,
          w: wmWidth,
          h: wmHeight,
          x: cx - wmWidth / 2,
          y: cy - wmHeight / 2
        };
      }

      // Draw single stamp with rotation
      ctx.save();
      ctx.translate(cx, cy);
      if (state.rotation !== 0) {
        ctx.rotate((state.rotation * Math.PI) / 180);
      }

      if (state.watermarkType === "image") {
        ctx.drawImage(state.watermarkImage, -wmWidth / 2, -wmHeight / 2, wmWidth, wmHeight);
      } else {
        drawSingleText(ctx, state.textString, 0, 0, wmWidth, wmHeight, isExport);
      }
      ctx.restore();

    } else {
      // ---------------- FILL / TILE PATTERN MODE ----------------
      var density = Math.max(2, Math.min(12, state.fillDensity));
      var cols = density;
      var rows = density;

      var cellW = canvasWidth / cols;
      var cellH = canvasHeight / rows;

      var wmItemWidth = 0, wmItemHeight = 0;
      var itemScale = (state.scale / 100) * 0.75;

      if (state.watermarkType === "image") {
        var imgAspect = state.watermarkImage.naturalWidth / state.watermarkImage.naturalHeight;
        wmItemWidth = Math.min(cellW, cellH) * itemScale;
        wmItemHeight = wmItemWidth / imgAspect;
      } else {
        var fillFontSize = Math.max(10, Math.min(cellW, cellH) * itemScale * 0.28);
        ctx.font = (state.textBold ? "bold " : "") + Math.round(fillFontSize) + "px " + state.textFont;
        var m = ctx.measureText(state.textString);
        wmItemWidth = m.width;
        wmItemHeight = fillFontSize * 1.3;
      }

      var angleRad = (state.rotation * Math.PI) / 180;

      for (var r = 0; r < rows; r++) {
        var offsetX = (state.fillPattern === "staggered" && (r % 2 === 1)) ? (cellW / 2) : 0;
        for (var c = -1; c <= cols; c++) {
          var itemCx = c * cellW + cellW / 2 + offsetX;
          var itemCy = r * cellH + cellH / 2;

          ctx.save();
          ctx.translate(itemCx, itemCy);
          if (angleRad !== 0) {
            ctx.rotate(angleRad);
          }

          if (state.watermarkType === "image") {
            ctx.drawImage(state.watermarkImage, -wmItemWidth / 2, -wmItemHeight / 2, wmItemWidth, wmItemHeight);
          } else {
            drawSingleText(ctx, state.textString, 0, 0, wmItemWidth, wmItemHeight, isExport);
          }
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  function drawSingleText(ctx, text, x, y, w, h, isExport) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw high-contrast backdrop shadow / stroke if enabled for optimal clarity on any background
    if (state.textShadow) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = state.textColor;
      ctx.fillText(text, x, y);
      ctx.restore();
    } else {
      ctx.fillStyle = state.textColor;
      ctx.fillText(text, x, y);
    }
  }

  /* ------------------------------------------------------------------
     Redraw & Render Lifecycle
     ------------------------------------------------------------------ */
  function redraw() {
    if (!state.mainImage) {
      els.canvasWrap.hidden = true;
      els.emptyState.hidden = false;
      els.btnDownload.disabled = true;
      els.btnDownloadTop.disabled = true;
      els.zoomOut.disabled = true;
      els.zoomIn.disabled = true;
      els.zoomFit.disabled = true;
      els.zoom100.disabled = true;
      els.dimensionsTag.textContent = "Ready";
      els.badgeStatus.textContent = "Waiting for Image";
      return;
    }

    els.canvasWrap.hidden = false;
    els.emptyState.hidden = true;
    els.btnDownload.disabled = false;
    els.btnDownloadTop.disabled = false;
    els.zoomOut.disabled = false;
    els.zoomIn.disabled = false;
    els.zoomFit.disabled = false;
    els.zoom100.disabled = false;

    var origW = state.mainOriginalWidth;
    var origH = state.mainOriginalHeight;

    els.dimensionsTag.textContent = origW + " × " + origH + " px";
    els.badgeStatus.textContent = "Live Preview";

    // Set canvas internal pixel resolution
    if (els.mainCanvas.width !== origW || els.mainCanvas.height !== origH) {
      els.mainCanvas.width = origW;
      els.mainCanvas.height = origH;
      els.overlayCanvas.width = origW;
      els.overlayCanvas.height = origH;
    }

    // Apply visual CSS scale for Zoom
    applyZoom();

    // Paint to main preview canvas
    mainCtx.clearRect(0, 0, origW, origH);
    paintWatermark(mainCtx, origW, origH, false);

    // Clear overlay
    overlayCtx.clearRect(0, 0, origW, origH);

    // If single mode, draw subtle interactive bounding box on overlay when hover/active
    if (state.placementMode === "single" && state.watermarkRect) {
      drawSelectionIndicator();
    }
  }

  function drawSelectionIndicator() {
    var rect = state.watermarkRect;
    if (!rect || !rect.w) return;

    overlayCtx.save();
    overlayCtx.translate(rect.cx, rect.cy);
    if (state.rotation !== 0) {
      overlayCtx.rotate((state.rotation * Math.PI) / 180);
    }

    // Subtle dashed outline around single watermark
    overlayCtx.strokeStyle = "rgba(12, 79, 191, 0.4)";
    overlayCtx.lineWidth = Math.max(2, state.mainOriginalWidth * 0.002);
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.strokeRect(-rect.w / 2 - 4, -rect.h / 2 - 4, rect.w + 8, rect.h + 8);

    overlayCtx.restore();
  }

  /* ------------------------------------------------------------------
     Zoom & Fit Controls
     ------------------------------------------------------------------ */
  function applyZoom() {
    if (!state.mainImage) return;

    var origW = state.mainOriginalWidth;
    var origH = state.mainOriginalHeight;

    var displayW = Math.round(origW * state.zoom);
    var displayH = Math.round(origH * state.zoom);

    els.mainCanvas.style.width = displayW + "px";
    els.mainCanvas.style.height = displayH + "px";
    els.overlayCanvas.style.width = displayW + "px";
    els.overlayCanvas.style.height = displayH + "px";
    els.canvasWrap.style.width = displayW + "px";
    els.canvasWrap.style.height = displayH + "px";

    els.zoomPct.textContent = Math.round(state.zoom * 100) + "%";
  }

  function fitToScreen() {
    if (!state.mainImage) return;

    var container = els.canvasContainer;
    var availW = container.clientWidth - 48;
    var availH = container.clientHeight - 48;

    if (availW <= 0 || availH <= 0) return;

    var scaleW = availW / state.mainOriginalWidth;
    var scaleH = availH / state.mainOriginalHeight;
    var bestFit = Math.min(scaleW, scaleH, 1.0); // Don't upscale past 100% on initial fit

    state.zoom = Math.max(0.1, Math.min(3.0, bestFit));
    applyZoom();
  }

  /* ------------------------------------------------------------------
     Image Loading Helpers
     ------------------------------------------------------------------ */
  function loadMainImage(fileOrImg, filename) {
    if (fileOrImg instanceof Image) {
      state.mainImage = fileOrImg;
      state.mainFilename = filename || "sample-photo.jpg";
      state.mainOriginalWidth = fileOrImg.naturalWidth || fileOrImg.width || 1600;
      state.mainOriginalHeight = fileOrImg.naturalHeight || fileOrImg.height || 1000;
      onMainImageReady();
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        state.mainImage = img;
        state.mainFilename = fileOrImg.name || "photo.jpg";
        state.mainOriginalWidth = img.naturalWidth;
        state.mainOriginalHeight = img.naturalHeight;
        onMainImageReady();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileOrImg);
  }

  function onMainImageReady() {
    els.mainFileInfo.hidden = false;
    els.btnChangeMain.hidden = false;
    els.mainName.textContent = state.mainFilename;
    els.mainMeta.textContent = state.mainOriginalWidth + " × " + state.mainOriginalHeight + " px";

    fitToScreen();
    redraw();
  }

  function loadWatermarkLogo(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        state.watermarkImage = img;
        state.watermarkFilename = file.name;
        els.logoFileInfo.hidden = false;
        els.logoName.textContent = file.name;
        redraw();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ------------------------------------------------------------------
     Interactive Canvas Dragging for Single Watermark
     ------------------------------------------------------------------ */
  function setupInteractiveDragging() {
    var wrap = els.canvasWrap;

    function getCanvasCoords(e) {
      var rect = els.mainCanvas.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;

      var xNorm = (clientX - rect.left) / rect.width;
      var yNorm = (clientY - rect.top) / rect.height;

      return {
        xNorm: Math.max(0.02, Math.min(0.98, xNorm)),
        yNorm: Math.max(0.02, Math.min(0.98, yNorm))
      };
    }

    wrap.addEventListener("mousedown", function (e) {
      if (state.placementMode !== "single" || !state.mainImage) return;

      state.isDragging = true;
      wrap.classList.add("is-dragging");

      var coords = getCanvasCoords(e);
      state.customPosition = { xPct: coords.xNorm, yPct: coords.yNorm };

      // Deselect preset buttons
      els.posBtns.forEach(function (btn) { btn.classList.remove("is-active"); });
      els.posLabel.textContent = "Custom Drag Position";

      redraw();
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!state.isDragging || state.placementMode !== "single") return;

      var coords = getCanvasCoords(e);
      state.customPosition = { xPct: coords.xNorm, yPct: coords.yNorm };
      redraw();
    });

    window.addEventListener("mouseup", function () {
      if (state.isDragging) {
        state.isDragging = false;
        wrap.classList.remove("is-dragging");
        redraw();
      }
    });

    // Touch support
    wrap.addEventListener("touchstart", function (e) {
      if (state.placementMode !== "single" || !state.mainImage) return;
      state.isDragging = true;
      var coords = getCanvasCoords(e);
      state.customPosition = { xPct: coords.xNorm, yPct: coords.yNorm };
      els.posBtns.forEach(function (btn) { btn.classList.remove("is-active"); });
      els.posLabel.textContent = "Custom Drag Position";
      redraw();
    }, { passive: true });

    window.addEventListener("touchmove", function (e) {
      if (!state.isDragging || state.placementMode !== "single") return;
      var coords = getCanvasCoords(e);
      state.customPosition = { xPct: coords.xNorm, yPct: coords.yNorm };
      redraw();
    }, { passive: true });

    window.addEventListener("touchend", function () {
      state.isDragging = false;
    });
  }

  /* ------------------------------------------------------------------
     Export Engine — Full Native Resolution & Clarity
     ------------------------------------------------------------------ */
  function exportImage() {
    if (!state.mainImage) return;

    els.badgeStatus.textContent = "Generating Export...";

    // Use full native pixel dimensions
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = state.mainOriginalWidth;
    exportCanvas.height = state.mainOriginalHeight;

    var exportCtx = exportCanvas.getContext("2d");
    paintWatermark(exportCtx, exportCanvas.width, exportCanvas.height, true);

    var mimeType = state.exportFormat;
    var quality = parseFloat(state.exportQuality) || 0.92;

    var extension = mimeType === "image/png" ? "png" : (mimeType === "image/webp" ? "webp" : "jpg");
    var baseName = state.mainFilename.replace(/\.[^/.]+$/, "");
    var downloadFilename = baseName + "-watermarked." + extension;

    exportCanvas.toBlob(function (blob) {
      if (!blob) {
        els.badgeStatus.textContent = "Export Error";
        return;
      }

      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(function () {
        URL.revokeObjectURL(url);
        els.badgeStatus.textContent = "Export Complete!";
        setTimeout(function () {
          els.badgeStatus.textContent = "Live Preview";
        }, 2000);
      }, 500);

    }, mimeType, quality);
  }

  /* ------------------------------------------------------------------
     Event Wiring & UI Synchronization
     ------------------------------------------------------------------ */
  function setupEventListeners() {
    // 1. Main File Dropzone & Picker
    els.mainDropzone.addEventListener("click", function () {
      els.mainFileInput.click();
    });

    els.btnChangeMain.addEventListener("click", function () {
      els.mainFileInput.click();
    });

    els.mainFileInput.addEventListener("change", function () {
      if (els.mainFileInput.files && els.mainFileInput.files[0]) {
        loadMainImage(els.mainFileInput.files[0]);
      }
    });

    // Drag and drop for main image
    ["dragenter", "dragover"].forEach(function (evt) {
      els.mainDropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        els.mainDropzone.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach(function (evt) {
      els.mainDropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        els.mainDropzone.classList.remove("is-dragover");
      });
    });

    els.mainDropzone.addEventListener("drop", function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadMainImage(e.dataTransfer.files[0]);
      }
    });

    // 2. Sample Photo Buttons
    function triggerSamplePhoto() {
      var sample = createSamplePhoto();
      sample.onload = function () {
        loadMainImage(sample, "sunset-landscape-sample.jpg");
      };
    }

    els.btnSample.addEventListener("click", triggerSamplePhoto);
    els.emptySampleBtn.addEventListener("click", triggerSamplePhoto);

    // 3. Watermark Logo Dropzone & Picker
    els.logoDropzone.addEventListener("click", function () {
      els.logoFileInput.click();
    });

    els.logoFileInput.addEventListener("change", function () {
      if (els.logoFileInput.files && els.logoFileInput.files[0]) {
        loadWatermarkLogo(els.logoFileInput.files[0]);
      }
    });

    els.btnSampleLogo.addEventListener("click", function () {
      state.watermarkImage = createSampleLogo();
      els.logoFileInfo.hidden = false;
      els.logoName.textContent = "crafted-sample-logo.png";
      redraw();
    });

    // 4. Content Type Tabs (Image vs Text)
    $$("#wm-type-tabs .wm-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$("#wm-type-tabs .wm-tab-btn").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");

        var type = btn.getAttribute("data-wm-type");
        state.watermarkType = type;

        if (type === "image") {
          els.paneImage.hidden = false;
          els.paneText.hidden = true;
        } else {
          els.paneImage.hidden = true;
          els.paneText.hidden = false;
        }
        redraw();
      });
    });

    // 5. Text Controls
    els.textInput.addEventListener("input", function () {
      state.textString = els.textInput.value;
      redraw();
    });

    $$(".wm-text-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var txt = btn.getAttribute("data-text");
        els.textInput.value = txt;
        state.textString = txt;
        redraw();
      });
    });

    els.textFont.addEventListener("change", function () {
      state.textFont = els.textFont.value;
      redraw();
    });

    els.textColor.addEventListener("input", function () {
      state.textColor = els.textColor.value;
      els.textColorHex.value = els.textColor.value.toUpperCase();
      redraw();
    });

    els.textColorHex.addEventListener("input", function () {
      var hex = els.textColorHex.value.trim();
      if (/^#[0-9A-F]{6}$/i.test(hex)) {
        state.textColor = hex;
        els.textColor.value = hex;
        redraw();
      }
    });

    els.textBold.addEventListener("change", function () {
      state.textBold = els.textBold.checked;
      redraw();
    });

    els.textShadow.addEventListener("change", function () {
      state.textShadow = els.textShadow.checked;
      redraw();
    });

    // 6. Placement Mode Tabs (Single vs Fill)
    $$("#wm-mode-tabs .wm-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$("#wm-mode-tabs .wm-tab-btn").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");

        var mode = btn.getAttribute("data-wm-mode");
        state.placementMode = mode;

        if (mode === "single") {
          els.paneSingle.hidden = false;
          els.paneFill.hidden = true;
          els.canvasWrap.classList.add("is-draggable");
        } else {
          els.paneSingle.hidden = true;
          els.paneFill.hidden = false;
          els.canvasWrap.classList.remove("is-draggable");
        }
        redraw();
      });
    });

    // 7. Single Mode 9-Point Grid Presets
    els.posBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.posBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");

        var pos = btn.getAttribute("data-pos");
        state.positionPreset = pos;
        state.customPosition = null; // Clear custom drag offset

        var titles = {
          "top-left": "Top-Left",
          "top-center": "Top-Center",
          "top-right": "Top-Right",
          "center-left": "Center-Left",
          "center": "Exact Center",
          "center-right": "Center-Right",
          "bottom-left": "Bottom-Left",
          "bottom-center": "Bottom-Center",
          "bottom-right": "Bottom-Right"
        };
        els.posLabel.textContent = titles[pos] || pos;
        redraw();
      });
    });

    els.singleMargin.addEventListener("input", function () {
      state.marginPct = parseFloat(els.singleMargin.value) || 0;
      els.singleMarginVal.textContent = state.marginPct + "%";
      redraw();
    });

    // 8. Fill / Tile Mode Controls
    els.fillDensity.addEventListener("input", function () {
      state.fillDensity = parseInt(els.fillDensity.value, 10) || 4;
      var labels = {
        2: "2 × 2 (Sparse)",
        3: "3 × 3 (Spacious)",
        4: "4 × 4 (Medium)",
        5: "5 × 5 (Balanced)",
        6: "6 × 6 (Dense)",
        8: "8 × 8 (Security)",
        10: "10 × 10 (Ultra Dense)"
      };
      els.fillDensityVal.textContent = labels[state.fillDensity] || (state.fillDensity + " × " + state.fillDensity);
      redraw();
    });

    els.fillGap.addEventListener("input", function () {
      state.fillGap = parseInt(els.fillGap.value, 10) || 40;
      els.fillGapVal.textContent = state.fillGap + "px";
      redraw();
    });

    els.fillPatternBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.fillPatternBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        state.fillPattern = btn.getAttribute("data-fill-pattern");
        redraw();
      });
    });

    // 9. Shared Appearance Controls (Scale, Opacity, Rotation, Blend)
    els.scale.addEventListener("input", function () {
      state.scale = parseInt(els.scale.value, 10) || 25;
      els.scaleVal.textContent = state.scale + "%";
      redraw();
    });

    els.opacity.addEventListener("input", function () {
      state.opacity = parseInt(els.opacity.value, 10) || 75;
      els.opacityVal.textContent = state.opacity + "%";
      redraw();
    });

    els.rotation.addEventListener("input", function () {
      state.rotation = parseInt(els.rotation.value, 10) || 0;
      els.rotationVal.textContent = state.rotation + "°";
      updateRotChipButtons(state.rotation);
      redraw();
    });

    els.rotBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var rot = parseInt(btn.getAttribute("data-rot"), 10) || 0;
        state.rotation = rot;
        els.rotation.value = rot;
        els.rotationVal.textContent = rot + "°";
        updateRotChipButtons(rot);
        redraw();
      });
    });

    function updateRotChipButtons(currentRot) {
      els.rotBtns.forEach(function (b) {
        var r = parseInt(b.getAttribute("data-rot"), 10);
        b.classList.toggle("is-active", r === currentRot);
      });
    }

    els.blendMode.addEventListener("change", function () {
      state.blendMode = els.blendMode.value;
      redraw();
    });

    // 10. Export Controls
    els.exportFormat.addEventListener("change", function () {
      state.exportFormat = els.exportFormat.value;
      els.jpegQualityWrap.hidden = (state.exportFormat === "image/png");
    });

    els.exportQuality.addEventListener("change", function () {
      state.exportQuality = parseFloat(els.exportQuality.value) || 0.92;
    });

    els.btnDownload.addEventListener("click", exportImage);
    els.btnDownloadTop.addEventListener("click", exportImage);

    // 11. Zoom Controls
    els.zoomOut.addEventListener("click", function () {
      state.zoom = Math.max(0.1, state.zoom - 0.15);
      applyZoom();
    });

    els.zoomIn.addEventListener("click", function () {
      state.zoom = Math.min(3.0, state.zoom + 0.15);
      applyZoom();
    });

    els.zoomFit.addEventListener("click", fitToScreen);

    els.zoom100.addEventListener("click", function () {
      state.zoom = 1.0;
      applyZoom();
    });

    // Window Resize -> auto fit if active
    window.addEventListener("resize", function () {
      if (state.mainImage) {
        fitToScreen();
      }
    });

    // 12. Reset All Settings
    els.btnReset.addEventListener("click", function () {
      state.scale = 25;
      els.scale.value = 25;
      els.scaleVal.textContent = "25%";

      state.opacity = 75;
      els.opacity.value = 75;
      els.opacityVal.textContent = "75%";

      state.rotation = 0;
      els.rotation.value = 0;
      els.rotationVal.textContent = "0°";
      updateRotChipButtons(0);

      state.positionPreset = "bottom-right";
      state.customPosition = null;
      els.posBtns.forEach(function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-pos") === "bottom-right");
      });
      els.posLabel.textContent = "Bottom-Right";

      state.marginPct = 4;
      els.singleMargin.value = 4;
      els.singleMarginVal.textContent = "4%";

      state.fillDensity = 4;
      els.fillDensity.value = 4;
      els.fillDensityVal.textContent = "4 × 4 (Medium)";

      state.blendMode = "source-over";
      els.blendMode.value = "source-over";

      redraw();
    });

    // Interactive Dragging
    setupInteractiveDragging();
  }

  /* ------------------------------------------------------------------
     Initialization
     ------------------------------------------------------------------ */
  function init() {
    setupEventListeners();
    redraw();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
