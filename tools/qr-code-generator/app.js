/* ==========================================================================
   QR Code Generator — fully self-contained.
   Everything runs in the browser: nothing is uploaded, nothing is fetched
   at runtime. The only dependency is qrcode-lib.js, bundled in this same
   folder (Kazuhiko Arase's MIT-licensed encoder).
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    typeTabs: $$('[data-type-tabs] [data-type]'),
    typePanes: $$("[data-type-pane]"),

    websiteUrl: $("qr-website-url"),
    textValue: $("qr-text-value"),
    wifiSsid: $("qr-wifi-ssid"),
    wifiPassword: $("qr-wifi-password"),
    wifiSecurity: $("qr-wifi-security"),
    wifiHidden: $("qr-wifi-hidden"),
    emailTo: $("qr-email-to"),
    emailSubject: $("qr-email-subject"),
    emailBody: $("qr-email-body"),
    phoneNumber: $("qr-phone-number"),
    smsNumber: $("qr-sms-number"),
    smsMessage: $("qr-sms-message"),

    size: $("qr-size"),
    sizeVal: $("qr-size-val"),
    margin: $("qr-margin"),
    marginVal: $("qr-margin-val"),
    ec: $("qr-ec"),

    logoFile: $("qr-logo-file"),
    logoLabel: $("qr-logo-label"),
    logoDrop: document.querySelector(".qr-drop"),
    logoControls: $("qr-logo-controls"),
    logoSize: $("qr-logo-size"),
    logoSizeVal: $("qr-logo-size-val"),
    logoRemove: $("qr-logo-remove"),
    logoNote: $("qr-logo-note"),

    canvas: $("qr-canvas"),
    caption: $("qr-caption"),
    status: $("qr-status"),
    generate: $("qr-generate"),
    download: $("qr-download"),
    formatTabs: $$('[data-format-tabs] [data-format]')
  };

  var ctx = els.canvas.getContext("2d");
  var logoImage = null;

  var state = {
    type: "website",
    dotStyle: "square",
    eyeStyle: "rounded",
    colorDots: "#111318",
    colorBg: "#ffffff",
    colorEyes: "#2b7fff",
    dotsMode: "solid",
    bgMode: "solid",
    dotsGradient: { from: "#2b7fff", to: "#ff8a1e", angle: 45 },
    bgGradient: { from: "#ffffff", to: "#dbe9ff", angle: 45 },
    format: "png"
  };

  var CAPTIONS = {
    website: "Scan to visit",
    text: "Scan to view",
    wifi: "Scan to connect",
    email: "Scan to email",
    phone: "Scan to call",
    sms: "Scan to text"
  };

  /* ------------------------------------------------------------------
     Tabs — content type & download format
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

  wireTabs(els.typeTabs, function (button) {
    state.type = button.getAttribute("data-type");
    els.typePanes.forEach(function (pane) {
      pane.classList.toggle("is-active", pane.getAttribute("data-type-pane") === state.type);
    });
    draw();
  });

  wireTabs(els.formatTabs, function (button) {
    state.format = button.getAttribute("data-format");
  });

  /* ------------------------------------------------------------------
     Choice cards — dot style & eye style
     ------------------------------------------------------------------ */
  $$("[data-choice]").forEach(function (group) {
    var key = group.getAttribute("data-choice");
    $$(".qr-choice-card", group).forEach(function (card) {
      card.addEventListener("click", function () {
        $$(".qr-choice-card", group).forEach(function (c) { c.classList.toggle("is-active", c === card); });
        state[key] = card.getAttribute("data-value");
        draw();
      });
    });
  });

  /* ------------------------------------------------------------------
     Color swatches
     ------------------------------------------------------------------ */
  var SWATCH_STATE_KEY = { dots: "colorDots", bg: "colorBg", eyes: "colorEyes" };

  $$("[data-swatches]").forEach(function (row) {
    var group = row.getAttribute("data-swatches");
    var stateKey = SWATCH_STATE_KEY[group];

    $$(".qr-swatch", row).forEach(function (swatch) {
      var value = swatch.getAttribute("data-value");
      if (value) {
        swatch.addEventListener("click", function () {
          $$(".qr-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
          swatch.classList.add("is-active");
          state[stateKey] = value;
          draw();
        });
      }
    });

    var customInput = row.querySelector('input[type="color"]');
    if (customInput) {
      customInput.addEventListener("input", function () {
        $$(".qr-swatch", row).forEach(function (s) { s.classList.remove("is-active"); });
        customInput.closest(".qr-swatch").classList.add("is-active");
        state[stateKey] = customInput.value;
        draw();
      });
    }
  });

  /* ------------------------------------------------------------------
     Solid / Gradient toggle — dots and background each pick their own
     fill independently. Eyes stay solid: a gradient finder pattern risks
     the strong contrast a scanner relies on to lock onto the code at all.
     ------------------------------------------------------------------ */
  var FILL_MODE_KEY = { dots: "dotsMode", bg: "bgMode" };
  var FILL_GRADIENT_KEY = { dots: "dotsGradient", bg: "bgGradient" };

  $$("[data-fill-mode]").forEach(function (toggle) {
    var group = toggle.getAttribute("data-fill-mode");

    $$(".qr-mode-btn", toggle).forEach(function (button) {
      button.addEventListener("click", function () {
        $$(".qr-mode-btn", toggle).forEach(function (b) { b.classList.toggle("is-active", b === button); });
        var mode = button.getAttribute("data-mode");
        state[FILL_MODE_KEY[group]] = mode;

        var solidPanel = document.querySelector('[data-fill-panel="' + group + '-solid"]');
        var gradientPanel = document.querySelector('[data-fill-panel="' + group + '-gradient"]');
        if (solidPanel) solidPanel.hidden = mode === "gradient";
        if (gradientPanel) gradientPanel.hidden = mode !== "gradient";
        draw();
      });
    });
  });

  $$("[data-gradient-from], [data-gradient-to]").forEach(function (input) {
    var group = input.getAttribute("data-gradient-from") || input.getAttribute("data-gradient-to");
    var key = input.hasAttribute("data-gradient-from") ? "from" : "to";
    input.addEventListener("input", function () {
      state[FILL_GRADIENT_KEY[group]][key] = input.value;
      draw();
    });
  });

  /* Angle dial — click or drag anywhere on the face and the handle points
     straight at the pointer. atan2's 0° (east, positive x-axis) lines up
     exactly with resolveFill's angle=0 (also east), and both increase
     clockwise in ordinary screen coordinates, so the number the dial shows
     is the same number the gradient math actually uses — no conversion. */
  $$("[data-angle-dial]").forEach(function (dial) {
    var group = dial.getAttribute("data-angle-dial");
    var face = dial.querySelector(".qr-angle-face");
    var valueEl = dial.querySelector("[data-angle-value]");

    function setAngle(angle) {
      angle = ((Math.round(angle) % 360) + 360) % 360;
      state[FILL_GRADIENT_KEY[group]].angle = angle;
      face.style.setProperty("--angle", angle + "deg");
      face.setAttribute("aria-valuenow", String(angle));
      if (valueEl) valueEl.textContent = angle + "°";
      draw();
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
      var current = state[FILL_GRADIENT_KEY[group]].angle;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") { setAngle(current + 15); event.preventDefault(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { setAngle(current - 15); event.preventDefault(); }
    });
  });

  /* ------------------------------------------------------------------
     Payload — one string per content type, using the formats phone
     camera apps actually recognise.
     ------------------------------------------------------------------ */
  function escapeWifi(value) {
    return String(value || "").replace(/([\\;,":])/g, "\\$1");
  }

  function buildPayload() {
    switch (state.type) {
      case "text":
        return els.textValue.value.trim();

      case "wifi": {
        var ssid = els.wifiSsid.value.trim();
        if (!ssid) return "";
        var security = els.wifiSecurity.value;
        var password = security === "nopass" ? "" : els.wifiPassword.value;
        return "WIFI:T:" + security + ";S:" + escapeWifi(ssid) +
          (security === "nopass" ? "" : ";P:" + escapeWifi(password)) +
          ";H:" + (els.wifiHidden.checked ? "true" : "false") + ";;";
      }

      case "email": {
        var to = els.emailTo.value.trim();
        if (!to) return "";
        var params = [];
        if (els.emailSubject.value.trim()) params.push("subject=" + encodeURIComponent(els.emailSubject.value.trim()));
        if (els.emailBody.value.trim()) params.push("body=" + encodeURIComponent(els.emailBody.value.trim()));
        return "mailto:" + to + (params.length ? "?" + params.join("&") : "");
      }

      case "phone": {
        var number = els.phoneNumber.value.trim();
        return number ? "tel:" + number.replace(/\s+/g, "") : "";
      }

      case "sms": {
        var smsNumber = els.smsNumber.value.trim();
        if (!smsNumber) return "";
        var message = els.smsMessage.value.trim();
        return "sms:" + smsNumber.replace(/\s+/g, "") + (message ? "?body=" + encodeURIComponent(message) : "");
      }

      default: /* website */
        return els.websiteUrl.value.trim();
    }
  }

  /* ------------------------------------------------------------------
     Shape helpers — everything is drawn from plain rectangles/circles
     so there is no dependency on any drawing library.
     ------------------------------------------------------------------ */
  function roundRectPath(context, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function fillRound(context, x, y, w, h, r, color) {
    context.fillStyle = color;
    roundRectPath(context, x, y, w, h, r);
    context.fill();
  }

  function fillDot(context, x, y, size, style, color) {
    context.fillStyle = color;
    var pad;
    switch (style) {
      case "dots":
        pad = size * 0.06;
        context.beginPath();
        context.arc(x + size / 2, y + size / 2, (size - pad * 2) / 2, 0, Math.PI * 2);
        context.fill();
        break;
      case "rounded":
        pad = size * 0.05;
        roundRectPath(context, x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.32);
        context.fill();
        break;
      default: /* square */
        context.fillRect(x, y, size, size);
    }
  }

  /** Draws one finder pattern (the three big corner "eyes") as three nested
      shapes so the 1:1:3:1:1 module ratio scanners expect is preserved
      exactly, whichever eye style is chosen. */
  function drawEye(context, x, y, moduleSize, style, color, bgColor) {
    var outer = moduleSize * 7;
    var mid = moduleSize * 5;
    var inner = moduleSize * 3;
    var midOffset = moduleSize;
    var innerOffset = moduleSize * 2;

    var radiusFor = function (size) {
      if (style === "dot") return size / 2;
      if (style === "rounded") return size * 0.28;
      return 0;
    };

    fillRound(context, x, y, outer, outer, radiusFor(outer), color);
    fillRound(context, x + midOffset, y + midOffset, mid, mid, radiusFor(mid), bgColor);
    fillRound(context, x + innerOffset, y + innerOffset, inner, inner, radiusFor(inner), color);
  }

  function inEyeZone(count, row, col) {
    return (row < 7 && col < 7) ||
           (row < 7 && col >= count - 7) ||
           (row >= count - 7 && col < 7);
  }

  /* ------------------------------------------------------------------
     Build the QR matrix once per draw, shared by canvas + every export
     format so they never drift out of sync with each other.
     ------------------------------------------------------------------ */
  function encode(text) {
    var qr = window.qrcode(0, els.ec.value); /* typeNumber 0 = smallest that fits */
    qr.addData(text);
    qr.make();
    return qr;
  }

  var lastLayout = null;

  /** A solid color or a two-stop linear gradient, resolved against a
      specific context + size right before it's used as a fillStyle —
      canvas accepts a CanvasGradient anywhere it accepts a color string,
      so nothing downstream (fillDot, drawEye, fillRound) needs to know
      which one it got. */
  function resolveFill(context, mode, solidColor, gradient, dim) {
    if (mode !== "gradient") return solidColor;
    var angle = (gradient.angle || 0) * Math.PI / 180;
    var cx = dim / 2, cy = dim / 2, r = dim / 2;
    var g = context.createLinearGradient(
      cx - Math.cos(angle) * r, cy - Math.sin(angle) * r,
      cx + Math.cos(angle) * r, cy + Math.sin(angle) * r
    );
    g.addColorStop(0, gradient.from);
    g.addColorStop(1, gradient.to);
    return g;
  }

  /** Paints one QR matrix onto any canvas context, at any size — kept
      separate from draw() so the main preview and any future export path
      share the exact same rendering, never two implementations to drift
      out of sync with each other. */
  function paintQr(context, dim, qr, count, moduleSize, offset, style) {
    var dotsFill = resolveFill(context, style.dotsMode, style.colorDots, style.dotsGradient, dim);
    var bgFill = resolveFill(context, style.bgMode, style.colorBg, style.bgGradient, dim);

    context.clearRect(0, 0, dim, dim);
    context.fillStyle = bgFill;
    context.fillRect(0, 0, dim, dim);

    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (!qr.isDark(r, c) || inEyeZone(count, r, c)) continue;
        fillDot(context, offset + c * moduleSize, offset + r * moduleSize, moduleSize, style.dotStyle, dotsFill);
      }
    }

    [{ row: 0, col: 0 }, { row: 0, col: count - 7 }, { row: count - 7, col: 0 }].forEach(function (pos) {
      drawEye(context, offset + pos.col * moduleSize, offset + pos.row * moduleSize, moduleSize, style.eyeStyle, style.colorEyes, bgFill);
    });

    return bgFill;
  }

  function draw() {
    els.status.classList.remove("is-error");
    els.caption.firstChild.textContent = (CAPTIONS[state.type] || "Scan me") + " ";

    var text = buildPayload();
    if (!text) {
      els.status.textContent = "Fill in the fields to generate a code.";
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      els.download.disabled = true;
      lastLayout = null;
      return;
    }

    var size = parseInt(els.size.value, 10);
    var margin = parseInt(els.margin.value, 10);

    try {
      var qr = encode(text);
      var count = qr.getModuleCount();
      var moduleSize = size / (count + margin * 2);
      var dim = Math.round(moduleSize * (count + margin * 2));

      els.canvas.width = dim;
      els.canvas.height = dim;

      var offset = margin * moduleSize;
      var bgFill = paintQr(ctx, dim, qr, count, moduleSize, offset, state);

      if (logoImage) drawLogo(dim, bgFill);

      lastLayout = { qr: qr, count: count, moduleSize: moduleSize, offset: offset, dim: dim };
      els.status.textContent = count + "×" + count + " modules · " + dim + "×" + dim + "px";
      els.download.disabled = false;
    } catch (error) {
      els.status.textContent = "Too much data for this error-correction level — shorten it or lower the level.";
      els.status.classList.add("is-error");
      els.download.disabled = true;
      lastLayout = null;
    }
  }

  function drawLogo(dim, bg) {
    var pct = parseInt(els.logoSize.value, 10) / 100;
    var box = dim * pct;
    var pad = box * 0.18;
    var cx = dim / 2;
    var cy = dim / 2;

    fillRound(ctx, cx - box / 2 - pad / 2, cy - box / 2 - pad / 2, box + pad, box + pad, (box + pad) * 0.18, bg);

    var ratio = Math.min(box / logoImage.width, box / logoImage.height);
    var w = logoImage.width * ratio;
    var h = logoImage.height * ratio;
    ctx.drawImage(logoImage, cx - w / 2, cy - h / 2, w, h);
  }

  /* ------------------------------------------------------------------
     Live wiring — any control redraws
     ------------------------------------------------------------------ */
  function syncLabels() {
    els.sizeVal.textContent = els.size.value + "px";
    els.marginVal.textContent = els.margin.value;
    els.logoSizeVal.textContent = els.logoSize.value + "%";
  }

  var LIVE_INPUTS = [
    els.websiteUrl, els.textValue, els.wifiSsid, els.wifiPassword, els.wifiSecurity, els.wifiHidden,
    els.emailTo, els.emailSubject, els.emailBody, els.phoneNumber, els.smsNumber, els.smsMessage,
    els.size, els.margin, els.ec, els.logoSize
  ];

  ["input", "change"].forEach(function (evt) {
    LIVE_INPUTS.forEach(function (el) {
      el.addEventListener(evt, function () { syncLabels(); draw(); });
    });
  });

  els.generate.addEventListener("click", draw);

  els.logoFile.addEventListener("change", function () {
    var file = els.logoFile.files && els.logoFile.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        logoImage = img;
        els.logoDrop.classList.add("has-file");
        els.logoLabel.textContent = file.name;
        els.logoControls.hidden = false;
        els.logoNote.hidden = false;
        /* A logo occludes part of the code — recovery needs to be high
           enough that the missing chunk doesn't break the scan. */
        els.ec.value = "H";
        draw();
      };
      img.onerror = function () {
        els.status.textContent = "That file could not be read as an image.";
        els.status.classList.add("is-error");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  els.logoRemove.addEventListener("click", function () {
    logoImage = null;
    els.logoFile.value = "";
    els.logoDrop.classList.remove("has-file");
    els.logoLabel.textContent = "Add a center logo";
    els.logoControls.hidden = true;
    els.logoNote.hidden = true;
    draw();
  });

  /* ------------------------------------------------------------------
     Export — PNG (canvas), SVG (vector, rebuilt from the same matrix)
     and PDF (a hand-built single-page PDF wrapping a JPEG — no library,
     because JPEG is already DCT-encoded so the bytes can be embedded
     as-is with no compression step of our own to implement).
     ------------------------------------------------------------------ */
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

  function downloadPng() {
    els.canvas.toBlob(function (blob) {
      if (blob) triggerDownload(blob, "qr-code.png");
    }, "image/png");
  }

  function svgShape(style, x, y, size, color) {
    var pad;
    switch (style) {
      case "dots":
        pad = size * 0.06;
        return '<circle cx="' + (x + size / 2) + '" cy="' + (y + size / 2) + '" r="' + ((size - pad * 2) / 2) + '" fill="' + color + '"/>';
      case "rounded":
        pad = size * 0.05;
        return '<rect x="' + (x + pad) + '" y="' + (y + pad) + '" width="' + (size - pad * 2) + '" height="' + (size - pad * 2) + '" rx="' + (size * 0.32) + '" fill="' + color + '"/>';
      default:
        return '<rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" fill="' + color + '"/>';
    }
  }

  function svgEye(x, y, moduleSize, style, color, bg) {
    var outer = moduleSize * 7, mid = moduleSize * 5, inner = moduleSize * 3;
    var radiusFor = function (size) {
      if (style === "dot") return size / 2;
      if (style === "rounded") return size * 0.28;
      return 0;
    };
    return (
      '<rect x="' + x + '" y="' + y + '" width="' + outer + '" height="' + outer + '" rx="' + radiusFor(outer) + '" fill="' + color + '"/>' +
      '<rect x="' + (x + moduleSize) + '" y="' + (y + moduleSize) + '" width="' + mid + '" height="' + mid + '" rx="' + radiusFor(mid) + '" fill="' + bg + '"/>' +
      '<rect x="' + (x + moduleSize * 2) + '" y="' + (y + moduleSize * 2) + '" width="' + inner + '" height="' + inner + '" rx="' + radiusFor(inner) + '" fill="' + color + '"/>'
    );
  }

  /** An SVG can't take a CanvasGradient object, so a gradient fill needs
      its own <linearGradient> def — built with the same angle math as
      the canvas version so the two exports actually match. Returns the
      fill value to use (either the solid color or a url(#id) reference)
      and appends the def, if any, to `defs`. */
  function svgFill(id, mode, solidColor, gradient, defs) {
    if (mode !== "gradient") return solidColor;
    var angle = (gradient.angle || 0) * Math.PI / 180;
    var x1 = 50 - Math.cos(angle) * 50, y1 = 50 - Math.sin(angle) * 50;
    var x2 = 50 + Math.cos(angle) * 50, y2 = 50 + Math.sin(angle) * 50;
    defs.push(
      '<linearGradient id="' + id + '" x1="' + x1 + '%" y1="' + y1 + '%" x2="' + x2 + '%" y2="' + y2 + '%">' +
        '<stop offset="0%" stop-color="' + gradient.from + '"/>' +
        '<stop offset="100%" stop-color="' + gradient.to + '"/>' +
      "</linearGradient>"
    );
    return "url(#" + id + ")";
  }

  function buildSvgMarkup() {
    if (!lastLayout) return null;
    var qr = lastLayout.qr, count = lastLayout.count, moduleSize = lastLayout.moduleSize,
        offset = lastLayout.offset, dim = lastLayout.dim;

    var defs = [];
    var dotsFill = svgFill("qr-dots-fill", state.dotsMode, state.colorDots, state.dotsGradient, defs);
    var bgFill = svgFill("qr-bg-fill", state.bgMode, state.colorBg, state.bgGradient, defs);

    var body = "";
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (!qr.isDark(r, c) || inEyeZone(count, r, c)) continue;
        body += svgShape(state.dotStyle, offset + c * moduleSize, offset + r * moduleSize, moduleSize, dotsFill);
      }
    }

    [{ row: 0, col: 0 }, { row: 0, col: count - 7 }, { row: count - 7, col: 0 }].forEach(function (pos) {
      body += svgEye(offset + pos.col * moduleSize, offset + pos.row * moduleSize, moduleSize, state.eyeStyle, state.colorEyes, bgFill);
    });

    /* The logo (if any) is a raster overlay — embedded as a data URI so
       the SVG stays a single, portable file. */
    var logoMarkup = "";
    if (logoImage) {
      var pct = parseInt(els.logoSize.value, 10) / 100;
      var box = dim * pct;
      var pad = box * 0.18;
      var cx = dim / 2, cy = dim / 2;
      var tmp = document.createElement("canvas");
      tmp.width = logoImage.width; tmp.height = logoImage.height;
      tmp.getContext("2d").drawImage(logoImage, 0, 0);
      var ratio = Math.min(box / logoImage.width, box / logoImage.height);
      var w = logoImage.width * ratio, h = logoImage.height * ratio;
      logoMarkup =
        '<rect x="' + (cx - box / 2 - pad / 2) + '" y="' + (cy - box / 2 - pad / 2) + '" width="' + (box + pad) + '" height="' + (box + pad) + '" rx="' + ((box + pad) * 0.18) + '" fill="' + bgFill + '"/>' +
        '<image x="' + (cx - w / 2) + '" y="' + (cy - h / 2) + '" width="' + w + '" height="' + h + '" href="' + tmp.toDataURL("image/png") + '"/>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim + '" viewBox="0 0 ' + dim + " " + dim + '">' +
      (defs.length ? "<defs>" + defs.join("") + "</defs>" : "") +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + bgFill + '"/>' + body + logoMarkup + "</svg>";
  }

  function downloadSvg() {
    var markup = buildSvgMarkup();
    if (!markup) return;
    triggerDownload(new Blob([markup], { type: "image/svg+xml" }), "qr-code.svg");
  }

  /** A minimal, hand-built single-page PDF wrapping the canvas as a JPEG.
      JPEG is already DCT-encoded, so its bytes can be embedded directly
      with a /DCTDecode filter — no zlib/deflate implementation needed to
      produce a file real PDF readers open correctly. */
  function buildPdfBytes(jpegBytes, widthPx, heightPx) {
    var enc = new TextEncoder();
    var chunks = [];
    var offsets = [];
    var pos = 0;

    function push(bytes) {
      chunks.push(bytes);
      pos += bytes.length;
    }
    function pushText(text) { push(enc.encode(text)); }
    function objStart(n) { offsets[n] = pos; pushText(n + " 0 obj\n"); }

    pushText("%PDF-1.4\n");

    objStart(1); pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    objStart(2); pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    objStart(3);
    pushText(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + widthPx + " " + heightPx + "] " +
      "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    );

    objStart(4);
    pushText(
      "<< /Type /XObject /Subtype /Image /Width " + widthPx + " /Height " + heightPx +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpegBytes.length + " >>\nstream\n"
    );
    push(jpegBytes);
    pushText("\nendstream\nendobj\n");

    var content = "q " + widthPx + " 0 0 " + heightPx + " 0 0 cm /Im0 Do Q";
    objStart(5);
    pushText("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n");

    var xrefStart = pos;
    var xref = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) {
      xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    pushText(xref);
    pushText("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF");

    return new Blob(chunks, { type: "application/pdf" });
  }

  function downloadPdf() {
    els.canvas.toBlob(function (jpegBlob) {
      if (!jpegBlob) return;
      jpegBlob.arrayBuffer().then(function (buffer) {
        var pdf = buildPdfBytes(new Uint8Array(buffer), els.canvas.width, els.canvas.height);
        triggerDownload(pdf, "qr-code.pdf");
      });
    }, "image/jpeg", 0.95);
  }

  els.download.addEventListener("click", function () {
    if (els.download.disabled) return;
    if (state.format === "svg") downloadSvg();
    else if (state.format === "pdf") downloadPdf();
    else downloadPng();
  });

  /* Caption markup is text + a colored rule element — keep the rule node
     across redraws instead of clobbering it with textContent. */
  (function initCaption() {
    var rule = els.caption.querySelector(".qr-caption-rule");
    els.caption.textContent = CAPTIONS[state.type] + " ";
    els.caption.appendChild(rule || (function () {
      var span = document.createElement("span");
      span.className = "qr-caption-rule";
      return span;
    })());
  })();

  syncLabels();
  draw();
})();
