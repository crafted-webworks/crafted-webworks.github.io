/* ==========================================================================
   Image Enhancer — cinematic color-grading looks + real clarity/sharpen/
   denoise/upscale, fully self-contained (see tools/STANDARDS.md).
   Nothing is uploaded anywhere; everything runs on-canvas in the browser.

   Distinct from "Photo Filter Studio" (tools/photo-filter-studio/): this
   tool is about polish/crispness — cinematic grading + genuine sharpness/
   clarity/upscale processing — not casual meme-style filters.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
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

  var ctx = els.canvas.getContext("2d", { willReadFrequently: true });

  var state = {
    lookId: "none",
    clarity: 0,
    sharpen: 0,
    denoise: 0,
    upscale: 1,
    showBefore: false
  };

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

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* ------------------------------------------------------------------
     GENERATORS — small, genuinely different per-pixel behaviors (see
     tools/STANDARDS.md §7). Every named preset below only tunes these.
     ------------------------------------------------------------------ */

  /** Separable box blur, hand-rolled (no library). Returns a fresh
      Uint8ClampedArray the same length as the source — never mutates the
      buffer it's given, since callers (clarity, denoise) need both the
      blurred copy AND the original at the same time. */
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

  /** Clarity — unsharp-mask style local contrast: blur a copy, then push
      the original away from the blurred version, clamped 0-255. A fixed
      blur radius keeps the cost bounded; the slider controls how hard the
      push is, not the blur size. */
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

  /** Denoise/Smooth — the opposite direction from Clarity: blend the
      original toward a blurred copy by the slider amount. */
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

  /** Sharpen — standard 3x3 sharpen convolution kernel, blended in by
      strength (0 = untouched, 1 = full kernel result). Reused verbatim as
      the automatic crispness pass after an upscale. Border pixels are
      left untouched (no neighbor to convolve against). */
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

  /** Split-tone — the classic "teal & orange" cinematic move: shadows
      pulled toward one color, highlights toward another, weighted by each
      pixel's own luminance. Real per-pixel math; ctx.filter has no
      equivalent for it. */
  function splitTone(imageData, shadowHex, highlightHex, strength) {
    if (!strength) return imageData;
    var s = hexToRgb(shadowHex), hl = hexToRgb(highlightHex);
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

  /** Vignette — a radial gradient darkened toward the corners, multiplied
      onto the canvas after the pixel passes. */
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

  /** Film grain — small per-pixel random luminance noise. */
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

  /* ------------------------------------------------------------------
     PRESETS — plain data tuning the generators above. Going from 8 to 20
     of these should mean adding data, not writing new pixel logic (see
     tools/STANDARDS.md §7).
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     ONE shared paint routine — used for the live preview, the export,
     and every look's thumbnail preview. Never duplicate pixel logic
     between these call sites (see tools/STANDARDS.md §6).
     ------------------------------------------------------------------ */
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

    /* Pass 1 — the part ctx.filter natively expresses (brightness,
       contrast, saturation, hue) applied at draw time. */
    context.filter = cssFilterFor(preset);
    context.drawImage(img, 0, 0, w, h);
    context.filter = "none";

    /* Pass 2 — hand-rolled per-pixel work ctx.filter cannot express:
       denoise, sharpen, clarity, then the split-tone color grade. */
    var imageData = context.getImageData(0, 0, w, h);
    applyDenoise(imageData, paintState.denoise);
    applySharpenConv(imageData, paintState.sharpen);
    applyClarity(imageData, paintState.clarity);
    if (preset.splitTone) splitTone(imageData, preset.splitTone.shadow, preset.splitTone.highlight, preset.splitTone.strength);
    filmGrain(imageData, preset.grain);
    context.putImageData(imageData, 0, 0);

    /* Pass 3 — vignette, drawn with the canvas API (needs blending, not
       a per-pixel loop). */
    vignette(context, w, h, preset.vignette);

    /* Pass 4 — upscaling redraws onto a larger canvas via drawImage,
       which is inherently soft (bilinear/bicubic resampling blurs fine
       detail); this fixed sharpen pass is the "counteract the softness"
       step called for by the spec, applied automatically and separately
       from the user's own Sharpen slider. */
    if (paintState.upscale > 1) {
      var extra = context.getImageData(0, 0, w, h);
      applySharpenConv(extra, 45);
      context.putImageData(extra, 0, 0);
    }
  }

  /* ------------------------------------------------------------------
     Source image — a generated placeholder (multi-colored, so every
     preset's effect is visible) until the user uploads a real photo.
     ------------------------------------------------------------------ */
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

  var sourceImage = buildPlaceholder();
  var sourceW = sourceImage.width, sourceH = sourceImage.height;

  function outputSize() {
    return { w: sourceW * state.upscale, h: sourceH * state.upscale };
  }

  function renderPreview() {
    var size = outputSize();
    paintFull(ctx, sourceImage, size.w, size.h, state);
    els.status.textContent = size.w + " × " + size.h + "px" + (state.upscale > 1 ? " (" + state.upscale + "× upscaled)" : "");
  }

  /* ------------------------------------------------------------------
     Look picker — every card renders its OWN live sample using the exact
     paintFull() pipeline the main canvas uses, over the current source
     image (or placeholder), so a thumbnail can never drift from what the
     look actually does (tools/STANDARDS.md §4/§7).
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     Pill tabs — reusable wireTabs helper (tools/STANDARDS.md §4).
     ------------------------------------------------------------------ */
  function wireTabs(buttons, panes, onSelect) {
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.getAttribute("data-tab");
        buttons.forEach(function (b) {
          var active = b === button;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
        panes.forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute("data-pane") === key);
        });
        if (onSelect) onSelect(key);
      });
    });
  }

  wireTabs($$("[data-tabs] .ie-tab"), $$(".ie-pane"));

  /* ------------------------------------------------------------------
     Clarity / Sharpen / Denoise sliders
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     Upscale choice cards
     ------------------------------------------------------------------ */
  $$(".ie-choice-card", els.upscaleGrid).forEach(function (card) {
    card.addEventListener("click", function () {
      $$(".ie-choice-card", els.upscaleGrid).forEach(function (c) { c.classList.toggle("is-active", c === card); });
      state.upscale = parseInt(card.getAttribute("data-value"), 10);
      renderPreview();
    });
  });

  /* ------------------------------------------------------------------
     Before/after toggle
     ------------------------------------------------------------------ */
  els.toggleBefore.addEventListener("click", function () {
    state.showBefore = !state.showBefore;
    els.toggleBeforeLabel.textContent = state.showBefore ? "Show Enhanced" : "Show Original";
    els.toggleBefore.classList.toggle("is-active", state.showBefore);
    renderPreview();
  });

  /* ------------------------------------------------------------------
     Reset
     ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
     Upload — replaces the placeholder source image, then re-renders both
     the look-picker thumbnails (they sample the real photo now) and the
     main preview.
     ------------------------------------------------------------------ */
  els.file.addEventListener("change", function () {
    var file = els.file.files && els.file.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        sourceImage = img;
        sourceW = img.naturalWidth || img.width;
        sourceH = img.naturalHeight || img.height;
        renderLookGrid();
        renderPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    els.file.value = "";
  });

  /* ------------------------------------------------------------------
     Export — same paintFull() pipeline, drawn straight from the on-screen
     canvas since it already holds the full-resolution result.
     ------------------------------------------------------------------ */
  els.download.addEventListener("click", function () {
    var wasShowingBefore = state.showBefore;
    if (wasShowingBefore) {
      state.showBefore = false;
      renderPreview();
    }
    els.canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "enhanced-image.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
    if (wasShowingBefore) {
      state.showBefore = true;
      renderPreview();
    }
  });

  /* ------------------------------------------------------------------
     Initial render
     ------------------------------------------------------------------ */
  renderLookGrid();
  renderPreview();
})();
