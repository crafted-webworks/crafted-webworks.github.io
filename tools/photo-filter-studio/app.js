/* ==========================================================================
   Photo Filter Studio — a small photo-filter app, fully self-contained
   (see tools/STANDARDS.md). Everything runs in the browser: nothing is
   uploaded, nothing is fetched over the network.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  var els = {
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

  var canvasCtx = els.canvas.getContext("2d", { willReadFrequently: true });

  var state = {
    image: null,          // current source (an HTMLImageElement or a canvas)
    naturalW: 0,
    naturalH: 0,
    preset: "original",
    activeCategory: "basic",
    showOriginal: false,
    adjust: { brightness: 0, contrast: 0, saturation: 0, vignette: 0 }
  };

  /* ------------------------------------------------------------------
     Generators — a small number of pure pixel-transform functions, each
     a genuinely different behavior (see tools/STANDARDS.md §7). A preset
     never adds new code, only tunes one generator's params:

       - base      : global tone/color via the canvas 2D `filter` string
                     (brightness/contrast/saturate/grayscale/sepia/
                     hue-rotate/blur/invert) — the legitimate simple path
                     for anything the native filter pipeline can already
                     express.
       - duotone   : per-pixel luminance remapped between two colors —
                     canvas `filter` syntax cannot express this.
       - colorTemp : per-pixel red/blue channel shift for a warm/cool
                     color-temperature grade.
       - vintage   : per-pixel tone curve (lifted blacks, rolled-off
                     highlights) plus a soft color cast — a faded-film
                     look no filter() string can produce.
       - sharpen   : a 3x3 convolution kernel — true per-pixel neighbor
                     math, not expressible as a filter string.
       - vignette  : a radial multiply-darken overlay, layered on top of
                     any of the above; also the target of the manual
                     "Vignette" slider.
     ------------------------------------------------------------------ */

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

  /** Duotone — maps each pixel's luminance to a gradient between a
      shadow color and a highlight color. */
  function applyDuotone(data, params) {
    var shadow = hexToRgb(params.shadow), light = hexToRgb(params.highlight);
    for (var i = 0; i < data.length; i += 4) {
      var lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      data[i] = shadow.r + (light.r - shadow.r) * lum;
      data[i + 1] = shadow.g + (light.g - shadow.g) * lum;
      data[i + 2] = shadow.b + (light.b - shadow.b) * lum;
    }
  }

  /** Color temperature — shifts red/blue in opposite directions;
      positive warmth pushes toward amber, negative toward cyan/blue. */
  function applyColorTemp(data, params) {
    var warmth = params.warmth || 0; // -50..50
    var shiftR = warmth * 1.1;
    var shiftG = warmth * 0.25;
    var shiftB = -warmth * 1.1;
    for (var i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] + shiftR, 0, 255);
      data[i + 1] = clamp(data[i + 1] + shiftG, 0, 255);
      data[i + 2] = clamp(data[i + 2] + shiftB, 0, 255);
    }
  }

  /** Vintage tone curve — lifts shadows and compresses highlights (the
      "faded film" look), then applies a small, fixed warm/cool color
      cast so it can't be reproduced by brightness/contrast alone. */
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

  /** Sharpen — a classic 3x3 convolution kernel, blended in at
      `params.amount` (0..1) so it can be a subtle or a strong pass. */
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

  /** Vignette — a radial multiply-darken overlay painted straight onto
      the context (not a per-pixel loop), reused by every preset that
      wants one and by the manual "Vignette" slider. */
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

  function hexToRgb(hex) {
    var clean = String(hex).replace("#", "");
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  var GENERATORS = {
    duotone: applyDuotone,
    colorTemp: applyColorTemp,
    vintage: applyVintage
    /* sharpen and vignette have their own call shapes (imageData vs
       ctx) and are invoked directly in paint() below. */
  };

  /* ------------------------------------------------------------------
     Presets — plain data. Each tunes one generator's params; adding a
     new look is a new entry here, not a new function. Grouped into
     category tabs once the list passes a dozen (tools/STANDARDS.md §7).
     `filter` is the base canvas-filter layer every preset has (defaults
     to a no-op 100/100/100 baseline so the manual sliders always have
     something to add to).
     ------------------------------------------------------------------ */
  var NO_OP_FILTER = { brightness: 100, contrast: 100, saturate: 100 };

  var PRESETS = [
    // Basic — tone-only adjustments via the base filter generator.
    { id: "original", label: "Original", category: "basic", filter: NO_OP_FILTER },
    { id: "bright-airy", label: "Bright & Airy", category: "basic", filter: { brightness: 112, contrast: 97, saturate: 106 } },
    { id: "vivid-pop", label: "Vivid Pop", category: "basic", filter: { brightness: 103, contrast: 114, saturate: 148 } },
    { id: "soft-focus", label: "Soft Focus", category: "basic", filter: { brightness: 106, contrast: 94, saturate: 102, blur: 1 } },
    { id: "flat-matte", label: "Flat Matte", category: "basic", filter: { brightness: 104, contrast: 84, saturate: 92 } },

    // Black & white — grayscale via the base filter, tuned per look.
    { id: "classic-mono", label: "Classic Mono", category: "bw", filter: { brightness: 100, contrast: 104, saturate: 100, grayscale: 100 } },
    { id: "noir", label: "Noir", category: "bw", filter: { brightness: 90, contrast: 150, saturate: 100, grayscale: 100 }, vignette: 45 },
    { id: "silver", label: "Silver", category: "bw", filter: { brightness: 110, contrast: 112, saturate: 100, grayscale: 100 } },
    { id: "high-key-bw", label: "High-Key B&W", category: "bw", filter: { brightness: 128, contrast: 96, saturate: 100, grayscale: 100 } },

    // Color tone — colorTemp / duotone generators.
    { id: "golden-hour", label: "Golden Hour", category: "tone", filter: { brightness: 104, contrast: 104, saturate: 108 }, generator: "colorTemp", params: { warmth: 26 }, vignette: 18 },
    { id: "arctic-blue", label: "Arctic Blue", category: "tone", filter: { brightness: 102, contrast: 106, saturate: 96 }, generator: "colorTemp", params: { warmth: -32 } },
    { id: "duotone-blue", label: "Duotone Blue", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#1b2a4a", highlight: "#ffdca8" } },
    { id: "duotone-rose", label: "Duotone Rose", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#2a1420", highlight: "#ffd6e7" } },
    { id: "duotone-forest", label: "Duotone Forest", category: "tone", filter: NO_OP_FILTER, generator: "duotone", params: { shadow: "#0f2417", highlight: "#e7f2c4" } },

    // Vintage — the hand-rolled tone curve, plus sepia via base filter.
    { id: "retro-film", label: "Retro Film", category: "vintage", filter: { brightness: 100, contrast: 100, saturate: 92 }, generator: "vintage", params: { lift: 22, squeeze: 0.82, castR: 8, castG: 2, castB: -10 }, vignette: 28 },
    { id: "faded-polaroid", label: "Faded Polaroid", category: "vintage", filter: { brightness: 104, contrast: 92, saturate: 80 }, generator: "vintage", params: { lift: 32, squeeze: 0.86, castR: 4, castG: 4, castB: -4 } },
    { id: "sepia-classic", label: "Sepia Classic", category: "vintage", filter: { brightness: 101, contrast: 106, saturate: 100, sepia: 88 } },

    // Creative — sharpen convolution, invert, cool-shade combo.
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

  /* ------------------------------------------------------------------
     The ONE paint routine — shared by the live preview, every preset's
     picker thumbnail, and the PNG export. Never duplicated so preview
     and export can't drift (tools/STANDARDS.md §6).
     ------------------------------------------------------------------ */
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

  function currentPreset() {
    return presetsById[state.preset] || PRESETS[0];
  }

  function render() {
    if (!state.image) return;
    var w = els.canvas.width, h = els.canvas.height;
    if (state.showOriginal) {
      paint(canvasCtx, state.image, w, h, { filter: NO_OP_FILTER }, { brightness: 0, contrast: 0, saturation: 0, vignette: 0 });
    } else {
      paint(canvasCtx, state.image, w, h, currentPreset(), state.adjust);
    }
  }

  /* ------------------------------------------------------------------
     Preset picker UI — category tabs filter which preset cards show;
     every card renders its own live thumbnail through the same paint()
     routine used for the real preview (tools/STANDARDS.md §4, §7).
     ------------------------------------------------------------------ */
  function renderCategoryTabs() {
    els.categoryTabs.innerHTML = CATEGORIES.map(function (cat) {
      return '<button type="button" class="pf-tab' + (cat.id === state.activeCategory ? " is-active" : "") +
        '" data-category="' + cat.id + '" role="tab" aria-selected="' + (cat.id === state.activeCategory) + '">' + cat.label + "</button>";
    }).join("");

    $$(".pf-tab", els.categoryTabs).forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.activeCategory = tab.getAttribute("data-category");
        $$(".pf-tab", els.categoryTabs).forEach(function (t) { t.classList.toggle("is-active", t === tab); });
        renderPresetGrid();
      });
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

  /* ------------------------------------------------------------------
     Built-in sample image — drawn programmatically (no external asset,
     no network fetch) so every preset preview has something real to
     show before a photo is uploaded.
     ------------------------------------------------------------------ */
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
    [ [120, 70, 34], [160, 78, 26], [420, 60, 30], [470, 66, 22] ].forEach(function (c) {
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

  /* ------------------------------------------------------------------
     Upload
     ------------------------------------------------------------------ */
  els.fileInput.addEventListener("change", function () {
    var file = els.fileInput.files && els.fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        els.dropZone.classList.add("has-file");
        els.dropLabel.textContent = file.name;
        setImage(img, "Editing " + file.name);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  /* ------------------------------------------------------------------
     Manual adjustment sliders — applied in the SAME paint() routine as
     the active preset (tools/STANDARDS.md §6), never a separate path.
     ------------------------------------------------------------------ */
  function bindSlider(input, out, key, suffix) {
    input.addEventListener("input", function () {
      state.adjust[key] = parseInt(input.value, 10);
      out.textContent = state.adjust[key] + (suffix || "");
      render();
    });
  }

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

  /* ------------------------------------------------------------------
     Before/after toggle
     ------------------------------------------------------------------ */
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
  els.compare.addEventListener("click", function (event) {
    // Prevent the click (which fires after mouseup already restored the
    // filtered view) from doing anything extra — the press-and-hold
    // above is the whole interaction.
    event.preventDefault();
  });

  /* ------------------------------------------------------------------
     Export — full source resolution, through the same paint() routine.
     ------------------------------------------------------------------ */
  els.download.addEventListener("click", function () {
    if (!state.image) return;
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = state.naturalW;
    exportCanvas.height = state.naturalH;
    var exportCtx = exportCanvas.getContext("2d");
    paint(exportCtx, state.image, exportCanvas.width, exportCanvas.height, currentPreset(), state.adjust);

    exportCanvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "photo-filtered.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  });

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  renderCategoryTabs();
  setImage(generateSampleImage(), "Showing a built-in sample photo — upload your own to filter it.");
})();
