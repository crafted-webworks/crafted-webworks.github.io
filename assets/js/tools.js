/* ==========================================================================
   General Tools — small, genuinely useful browser utilities.
   --------------------------------------------------------------------------
   Each tool is one entry in REGISTRY: { render, mount }. tools.json decides
   which tools exist, their category and their order; a tool with
   "status": "live" must have a matching entry here.

   Everything runs locally in the browser. Nothing is uploaded anywhere.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;
  var icon = App.icons.render.bind(App.icons);

  /* ==================================================================
     SHARED UI HELPERS
     ================================================================== */
  function field(config) {
    var id = "tool-" + config.name;
    var control;

    if (config.type === "textarea") {
      control = '<textarea class="form-control" id="' + id + '" rows="' + (config.rows || 6) + '" ' +
                'placeholder="' + U.attr(config.placeholder || "") + '">' + U.escape(config.value || "") + "</textarea>";
    } else if (config.type === "select") {
      control = '<select class="form-select" id="' + id + '">' +
        config.options.map(function (option) {
          return '<option value="' + U.attr(option.value) + '"' +
                 (option.value === config.value ? " selected" : "") + ">" + U.escape(option.label) + "</option>";
        }).join("") + "</select>";
    } else if (config.type === "range") {
      control = '<input class="tool-range" type="range" id="' + id + '" min="' + config.min + '" max="' + config.max +
                '" step="' + (config.step || 1) + '" value="' + config.value + '">';
    } else if (config.type === "checkbox") {
      return '<label class="form-check"><input type="checkbox" id="' + id + '"' +
             (config.value ? " checked" : "") + '><span class="form-check-label">' +
             U.escape(config.label) + "</span></label>";
    } else {
      control = '<input class="form-control" type="' + (config.type || "text") + '" id="' + id + '" ' +
                'placeholder="' + U.attr(config.placeholder || "") + '" value="' + U.attr(config.value || "") + '"' +
                (config.min !== undefined ? ' min="' + config.min + '"' : "") +
                (config.max !== undefined ? ' max="' + config.max + '"' : "") + ">";
    }

    return '<div class="form-group">' +
             '<label class="form-label" for="' + id + '">' + U.escape(config.label) + "</label>" +
             control +
           "</div>";
  }

  function output(name, options) {
    var opts = options || {};
    return '<div class="form-group">' +
             '<div class="flex items-center justify-between gap-sm">' +
               '<span class="form-label">' + U.escape(opts.label || "Result") + "</span>" +
               '<button type="button" class="btn btn-ghost btn-sm" data-copy="tool-' + U.attr(name) + '">' +
                 icon("copy") + "Copy</button>" +
             "</div>" +
             '<div class="tool-output" id="tool-' + U.attr(name) + '"></div>' +
           "</div>";
  }

  function get(root, name) {
    return root.querySelector("#tool-" + name);
  }

  function value(root, name) {
    var el = get(root, name);
    if (!el) return "";
    return el.type === "checkbox" ? el.checked : el.value;
  }

  function write(root, name, text, isError) {
    var el = get(root, name);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", !!isError);
  }

  /** Re-runs a tool whenever any of its inputs change. */
  function live(root, run) {
    root.addEventListener("input", run);
    root.addEventListener("change", run);
    run();
  }


  /** File picker styled as a drop target, shared by the image tools. */
  function dropZone(name, label, hint) {
    return '<div class="form-group">' +
             '<label class="tool-drop" for="tool-' + name + '-file">' +
               App.icons.render("image-down", "icon--xl") +
               '<span class="tool-drop-label">' + U.escape(label) + "</span>" +
               '<span class="tool-drop-hint">' + U.escape(hint) + "</span>" +
               '<input type="file" id="tool-' + name + '-file" accept="image/*" hidden>' +
             "</label>" +
           "</div>";
  }

  /**
   * Reads the chosen file into an Image and hands it back decoded.
   * The original byte size is stashed on the element so the compressor can
   * report a real before/after rather than guessing.
   */
  function readImage(root, name, onReady) {
    var input = get(root, name + "-file");
    if (!input) return;

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;

      var label = input.closest(".tool-drop");
      var reader = new FileReader();

      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          img.__bytes = file.size;
          if (label) {
            label.classList.add("has-file");
            var text = label.querySelector(".tool-drop-label");
            if (text) text.textContent = file.name;
          }
          onReady(img);
        };
        img.onerror = function () {
          App.components.showToast("That file could not be read as an image.", { type: "error" });
        };
        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  /* ==================================================================
     COLOUR HELPERS (shared by the colour tools)
     ================================================================== */
  function hexToRgb(hex) {
    var clean = String(hex).replace("#", "").trim();
    if (clean.length === 3) clean = clean.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) {
      return U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    }).join("").toUpperCase();
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;

    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(h, sPct, lPct) {
    var sat = sPct / 100, light = lPct / 100;
    var c = (1 - Math.abs(2 * light - 1)) * sat;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = light - c / 2;
    var seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor((h % 360) / 60)] || [0, 0, 0];
    return rgbToHex((seg[0] + m) * 255, (seg[1] + m) * 255, (seg[2] + m) * 255);
  }

  function relativeLuminance(rgb) {
    var channels = [rgb.r, rgb.g, rgb.b].map(function (channel) {
      var c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    var l1 = relativeLuminance(a), l2 = relativeLuminance(b);
    var light = Math.max(l1, l2), dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }

  /* ==================================================================
     TOOL REGISTRY
     ================================================================== */
  var REGISTRY = {

    /* ---------------------------------------------------------------- */
    "json-formatter": {
      render: function () {
        return field({ name: "json-in", label: "JSON input", type: "textarea", rows: 7, placeholder: '{"name":"example","tags":["a","b"],"active":true}' }) +
               '<div class="tool-row">' +
                 field({ name: "json-indent", label: "Indent", type: "select", value: "2", options: [
                   { value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }, { value: "\t", label: "Tab" }
                 ] }) +
               "</div>" +
               output("json-out", { label: "Formatted output" });
      },
      mount: function (root) {
        live(root, function () {
          var raw = value(root, "json-in").trim();
          if (!raw) return write(root, "json-out", "");
          try {
            var indent = value(root, "json-indent");
            var parsed = JSON.parse(raw);
            write(root, "json-out", JSON.stringify(parsed, null, indent === "\t" ? "\t" : parseInt(indent, 10)));
          } catch (error) {
            write(root, "json-out", "Invalid JSON — " + error.message, true);
          }
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "json-minifier": {
      render: function () {
        return field({ name: "min-in", label: "JSON input", type: "textarea", rows: 7 }) +
               output("min-out", { label: "Minified" }) +
               '<div class="tool-stat-grid" id="tool-min-stats"></div>';
      },
      mount: function (root) {
        live(root, function () {
          var raw = value(root, "min-in").trim();
          var stats = get(root, "min-stats");
          if (!raw) { write(root, "min-out", ""); stats.innerHTML = ""; return; }
          try {
            var minified = JSON.stringify(JSON.parse(raw));
            write(root, "min-out", minified);
            var saved = raw.length - minified.length;
            stats.innerHTML =
              statTile(raw.length + " B", "Original") +
              statTile(minified.length + " B", "Minified") +
              statTile(Math.max(0, Math.round((saved / raw.length) * 100)) + "%", "Saved");
          } catch (error) {
            write(root, "min-out", "Invalid JSON — " + error.message, true);
            stats.innerHTML = "";
          }
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "color-converter": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "color-hex", label: "HEX", value: "#2B7FFF", placeholder: "#2B7FFF" }) +
                 field({ name: "color-pick", label: "Pick", type: "color", value: "#2B7FFF" }) +
               "</div>" +
               '<div class="tool-swatch" id="tool-color-swatch"></div>' +
               '<div class="tool-stat-grid" id="tool-color-stats"></div>' +
               output("color-out", { label: "CSS values" });
      },
      mount: function (root) {
        var hexInput = get(root, "color-hex");
        var picker = get(root, "color-pick");

        picker.addEventListener("input", function () { hexInput.value = picker.value.toUpperCase(); });

        live(root, function () {
          var rgb = hexToRgb(hexInput.value);
          if (!rgb) {
            write(root, "color-out", "Enter a valid hex colour, e.g. #2B7FFF", true);
            get(root, "color-stats").innerHTML = "";
            return;
          }

          var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          var onWhite = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
          var onBlack = contrastRatio(rgb, { r: 0, g: 0, b: 0 });

          get(root, "color-swatch").style.background = rgbToHex(rgb.r, rgb.g, rgb.b);
          picker.value = rgbToHex(rgb.r, rgb.g, rgb.b).toLowerCase();

          get(root, "color-stats").innerHTML =
            statTile(onWhite.toFixed(2) + ":1", "vs white") +
            statTile(onBlack.toFixed(2) + ":1", "vs black") +
            statTile(Math.max(onWhite, onBlack) >= 4.5 ? "Pass" : "Fail", "WCAG AA text");

          write(root, "color-out",
            "HEX  " + rgbToHex(rgb.r, rgb.g, rgb.b) + "\n" +
            "RGB  rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")\n" +
            "HSL  hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)");
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "gradient-generator": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "grad-a", label: "From", type: "color", value: "#2B7FFF" }) +
                 field({ name: "grad-b", label: "To", type: "color", value: "#FF8A1E" }) +
                 field({ name: "grad-angle", label: "Angle", type: "number", value: "100", min: 0, max: 360 }) +
               "</div>" +
               '<div class="tool-swatch" id="tool-grad-preview" style="height:6rem"></div>' +
               output("grad-out", { label: "CSS" });
      },
      mount: function (root) {
        live(root, function () {
          var css = "linear-gradient(" + (parseInt(value(root, "grad-angle"), 10) || 0) + "deg, " +
                    value(root, "grad-a").toUpperCase() + " 0%, " +
                    value(root, "grad-b").toUpperCase() + " 100%)";
          get(root, "grad-preview").style.background = css;
          write(root, "grad-out", "background: " + css + ";");
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "password-generator": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "pw-length", label: "Length", type: "number", value: "20", min: 6, max: 128 }) +
               "</div>" +
               '<div class="cluster cluster--md">' +
                 field({ name: "pw-upper", label: "Uppercase", type: "checkbox", value: true }) +
                 field({ name: "pw-lower", label: "Lowercase", type: "checkbox", value: true }) +
                 field({ name: "pw-digits", label: "Numbers", type: "checkbox", value: true }) +
                 field({ name: "pw-symbols", label: "Symbols", type: "checkbox", value: true }) +
               "</div>" +
               '<button type="button" class="btn btn-primary mt-md" data-action="generate">' + icon("refresh") + "Generate</button>" +
               output("pw-out", { label: "Password" });
      },
      mount: function (root) {
        function generate() {
          var sets = "";
          if (value(root, "pw-upper")) sets += "ABCDEFGHJKLMNPQRSTUVWXYZ";
          if (value(root, "pw-lower")) sets += "abcdefghijkmnopqrstuvwxyz";
          if (value(root, "pw-digits")) sets += "23456789";
          if (value(root, "pw-symbols")) sets += "!@#$%^&*()-_=+[]{}?";

          if (!sets) return write(root, "pw-out", "Select at least one character set.", true);

          var length = U.clamp(parseInt(value(root, "pw-length"), 10) || 20, 6, 128);
          var bytes = new Uint32Array(length);
          crypto.getRandomValues(bytes);

          var password = "";
          for (var i = 0; i < length; i++) password += sets[bytes[i] % sets.length];
          write(root, "pw-out", password);
        }

        root.addEventListener("click", function (event) {
          if (event.target.closest('[data-action="generate"]')) generate();
        });
        root.addEventListener("change", generate);
        generate();
      }
    },

    /* ---------------------------------------------------------------- */
    "word-counter": {
      render: function () {
        return field({ name: "wc-in", label: "Your text", type: "textarea", rows: 8, placeholder: "Paste or type here…" }) +
               '<div class="tool-stat-grid" id="tool-wc-stats"></div>';
      },
      mount: function (root) {
        live(root, function () {
          var text = value(root, "wc-in");
          var words = text.trim() ? text.trim().split(/\s+/).length : 0;
          var sentences = text.trim() ? (text.match(/[.!?]+(\s|$)/g) || []).length : 0;
          var paragraphs = text.trim() ? text.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length : 0;

          get(root, "wc-stats").innerHTML =
            statTile(U.formatNumber(words), "Words") +
            statTile(U.formatNumber(text.length), "Characters") +
            statTile(U.formatNumber(text.replace(/\s/g, "").length), "No spaces") +
            statTile(U.formatNumber(sentences), "Sentences") +
            statTile(U.formatNumber(paragraphs), "Paragraphs") +
            statTile(Math.max(1, Math.ceil(words / 220)) + " min", "Reading time");
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "case-converter": {
      render: function () {
        return field({ name: "case-in", label: "Text", type: "textarea", rows: 5 }) +
               '<div class="cluster cluster--sm">' +
                 ["sentence", "title", "upper", "lower", "camel", "kebab", "snake"].map(function (mode) {
                   return '<button type="button" class="filter-btn" data-case="' + mode + '">' +
                          U.titleCase(mode) + "</button>";
                 }).join("") +
               "</div>" +
               output("case-out");
      },
      mount: function (root) {
        root.addEventListener("click", function (event) {
          var button = event.target.closest("[data-case]");
          if (!button) return;

          var text = value(root, "case-in");
          var words = text.trim().split(/[\s_-]+/).filter(Boolean);
          var result = text;

          switch (button.getAttribute("data-case")) {
            case "sentence":
              result = text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, function (m) { return m.toUpperCase(); });
              break;
            case "title": result = U.titleCase(text); break;
            case "upper": result = text.toUpperCase(); break;
            case "lower": result = text.toLowerCase(); break;
            case "camel":
              result = words.map(function (w, i) {
                return i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
              }).join("");
              break;
            case "kebab": result = words.join("-").toLowerCase(); break;
            case "snake": result = words.join("_").toLowerCase(); break;
          }

          write(root, "case-out", result);
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "slug-generator": {
      render: function () {
        return field({ name: "slug-in", label: "Title", placeholder: "10 Things to Check Before Launching a Website" }) +
               output("slug-out", { label: "URL slug" });
      },
      mount: function (root) {
        live(root, function () {
          write(root, "slug-out", U.slugify(value(root, "slug-in")));
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "meta-tag-generator": {
      render: function () {
        return field({ name: "meta-title", label: "Page title", placeholder: "Custom Website Development | Your Brand" }) +
               field({ name: "meta-desc", label: "Meta description", type: "textarea", rows: 3 }) +
               '<div class="tool-row">' +
                 field({ name: "meta-url", label: "Canonical URL", placeholder: "https://example.com/page" }) +
                 field({ name: "meta-image", label: "OG image URL", placeholder: "https://example.com/og.jpg" }) +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-meta-stats"></div>' +
               output("meta-out", { label: "Tags" });
      },
      mount: function (root) {
        live(root, function () {
          var title = value(root, "meta-title");
          var desc = value(root, "meta-desc");
          var url = value(root, "meta-url");
          var image = value(root, "meta-image");

          get(root, "meta-stats").innerHTML =
            statTile(title.length + "/60", title.length > 60 ? "Title — too long" : "Title length") +
            statTile(desc.length + "/160", desc.length > 160 ? "Description — too long" : "Description length");

          if (!title && !desc) return write(root, "meta-out", "");

          write(root, "meta-out", [
            '<title>' + title + "</title>",
            '<meta name="description" content="' + desc + '">',
            url ? '<link rel="canonical" href="' + url + '">' : "",
            "",
            '<meta property="og:type" content="website">',
            '<meta property="og:title" content="' + title + '">',
            '<meta property="og:description" content="' + desc + '">',
            url ? '<meta property="og:url" content="' + url + '">' : "",
            image ? '<meta property="og:image" content="' + image + '">' : "",
            "",
            '<meta name="twitter:card" content="summary_large_image">',
            '<meta name="twitter:title" content="' + title + '">',
            '<meta name="twitter:description" content="' + desc + '">'
          ].filter(function (line) { return line !== ""; }).join("\n"));
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "url-encoder": {
      render: function () {
        return field({ name: "url-in", label: "Text or URL", type: "textarea", rows: 4 }) +
               '<div class="cluster cluster--sm">' +
                 '<button type="button" class="filter-btn is-active" data-mode="encode">Encode</button>' +
                 '<button type="button" class="filter-btn" data-mode="decode">Decode</button>' +
               "</div>" +
               output("url-out");
      },
      mount: function (root) {
        var mode = "encode";

        function run() {
          var text = value(root, "url-in");
          if (!text) return write(root, "url-out", "");
          try {
            write(root, "url-out", mode === "encode" ? encodeURIComponent(text) : decodeURIComponent(text));
          } catch (error) {
            write(root, "url-out", "That isn't a valid encoded string.", true);
          }
        }

        root.addEventListener("click", function (event) {
          var button = event.target.closest("[data-mode]");
          if (!button) return;
          mode = button.getAttribute("data-mode");
          U.$$("[data-mode]", root).forEach(function (b) { b.classList.toggle("is-active", b === button); });
          run();
        });

        live(root, run);
      }
    },

    /* ---------------------------------------------------------------- */
    "base64-converter": {
      render: function () {
        return field({ name: "b64-in", label: "Text", type: "textarea", rows: 4 }) +
               '<div class="cluster cluster--sm">' +
                 '<button type="button" class="filter-btn is-active" data-mode="encode">Encode</button>' +
                 '<button type="button" class="filter-btn" data-mode="decode">Decode</button>' +
               "</div>" +
               output("b64-out");
      },
      mount: function (root) {
        var mode = "encode";

        function run() {
          var text = value(root, "b64-in");
          if (!text) return write(root, "b64-out", "");
          try {
            if (mode === "encode") {
              /* Unicode-safe: percent-encode before btoa */
              write(root, "b64-out", btoa(unescape(encodeURIComponent(text))));
            } else {
              write(root, "b64-out", decodeURIComponent(escape(atob(text.replace(/\s/g, "")))));
            }
          } catch (error) {
            write(root, "b64-out", "That isn't valid Base64.", true);
          }
        }

        root.addEventListener("click", function (event) {
          var button = event.target.closest("[data-mode]");
          if (!button) return;
          mode = button.getAttribute("data-mode");
          U.$$("[data-mode]", root).forEach(function (b) { b.classList.toggle("is-active", b === button); });
          run();
        });

        live(root, run);
      }
    },

    /* ---------------------------------------------------------------- */
    "timestamp-converter": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "ts-in", label: "Unix timestamp (seconds or ms)", placeholder: String(Math.floor(Date.now() / 1000)) }) +
                 '<button type="button" class="btn btn-secondary" data-action="now">Use now</button>' +
               "</div>" +
               field({ name: "ts-date", label: "…or a date", type: "datetime-local" }) +
               output("ts-out", { label: "Conversions" });
      },
      mount: function (root) {
        function fromTimestamp() {
          var raw = value(root, "ts-in").trim();
          if (!raw) return write(root, "ts-out", "");
          var number = Number(raw);
          if (isNaN(number)) return write(root, "ts-out", "Enter a numeric timestamp.", true);

          var ms = raw.length > 10 ? number : number * 1000;
          var date = new Date(ms);
          if (isNaN(date.getTime())) return write(root, "ts-out", "That timestamp is out of range.", true);

          write(root, "ts-out",
            "ISO 8601   " + date.toISOString() + "\n" +
            "UTC        " + date.toUTCString() + "\n" +
            "Local      " + date.toString() + "\n" +
            "Seconds    " + Math.floor(ms / 1000) + "\n" +
            "Millisecs  " + ms);
        }

        root.addEventListener("click", function (event) {
          if (!event.target.closest('[data-action="now"]')) return;
          get(root, "ts-in").value = String(Math.floor(Date.now() / 1000));
          fromTimestamp();
        });

        get(root, "ts-date").addEventListener("change", function () {
          var date = new Date(this.value);
          if (isNaN(date.getTime())) return;
          get(root, "ts-in").value = String(Math.floor(date.getTime() / 1000));
          fromTimestamp();
        });

        get(root, "ts-in").addEventListener("input", fromTimestamp);
        fromTimestamp();
      }
    },

    /* ---------------------------------------------------------------- */
    "lorem-ipsum": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "lorem-count", label: "How many", type: "number", value: "3", min: 1, max: 30 }) +
                 field({ name: "lorem-type", label: "Of", type: "select", value: "paragraphs", options: [
                   { value: "paragraphs", label: "Paragraphs" },
                   { value: "sentences", label: "Sentences" },
                   { value: "words", label: "Words" }
                 ] }) +
                 '<button type="button" class="btn btn-secondary" data-action="reroll">' +
                   App.icons.render("refresh") + "Reroll</button>" +
               "</div>" +
               output("lorem-out", { label: "Placeholder text" });
      },
      mount: function (root) {
        var WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut " +
          "labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi " +
          "aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu " +
          "fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt " +
          "mollit anim id est laborum curabitur pretium tincidunt lacus gravida orci odio nullam varius turpis " +
          "pharetra eros suscipit vestibulum ante primis faucibus luctus posuere cubilia").split(" ");

        /* A seeded PRNG rather than an arithmetic walk through the word list.
           The previous version picked words with (i * 7 + seed * 13), which
           produced a visibly repeating pattern — placeholder text that looks
           patterned defeats the entire purpose of placeholder text. Seeding
           keeps a given reroll reproducible while the output stays varied. */
        var seed = 1;
        function rand() {
          seed = (seed * 1664525 + 1013904223) % 4294967296;
          return seed / 4294967296;
        }
        function pick() { return WORDS[Math.floor(rand() * WORDS.length)]; }

        function sentence() {
          var len = 6 + Math.floor(rand() * 12);          /* 6–17 words */
          var words = [];
          for (var i = 0; i < len; i++) {
            words.push(pick());
            /* the occasional comma, the way real prose breaks up */
            if (i > 2 && i < len - 2 && rand() < 0.12) words[words.length - 1] += ",";
          }
          var text = words.join(" ");
          return text.charAt(0).toUpperCase() + text.slice(1) + ".";
        }

        function paragraph() {
          var count = 3 + Math.floor(rand() * 3);         /* 3–5 sentences */
          var out = [];
          for (var i = 0; i < count; i++) out.push(sentence());
          return out.join(" ");
        }

        function run() {
          var count = U.clamp(parseInt(value(root, "lorem-count"), 10) || 1, 1, 30);
          var type = value(root, "lorem-type");
          var result = [];

          if (type === "words") {
            for (var w = 0; w < count; w++) result.push(pick());
            var joined = result.join(" ");
            write(root, "lorem-out", joined.charAt(0).toUpperCase() + joined.slice(1) + ".");
            return;
          }

          for (var i = 0; i < count; i++) result.push(type === "sentences" ? sentence() : paragraph());
          write(root, "lorem-out", result.join(type === "sentences" ? " " : "\n\n"));
        }

        root.addEventListener("click", function (event) {
          if (!event.target.closest('[data-action="reroll"]')) return;
          seed = Math.floor(Math.random() * 1e9) + 1;
          run();
        });

        live(root, run);
      }
    },

    /* ---------------------------------------------------------------- */
    "box-shadow-generator": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "bs-x", label: "X offset", type: "number", value: "0" }) +
                 field({ name: "bs-y", label: "Y offset", type: "number", value: "18" }) +
                 field({ name: "bs-blur", label: "Blur", type: "number", value: "40" }) +
                 field({ name: "bs-spread", label: "Spread", type: "number", value: "-12" }) +
               "</div>" +
               '<div class="tool-row">' +
                 field({ name: "bs-color", label: "Colour", type: "color", value: "#2b7fff" }) +
                 field({ name: "bs-alpha", label: "Opacity %", type: "number", value: "45", min: 0, max: 100 }) +
               "</div>" +
               '<div class="cluster cluster--md">' +
                 field({ name: "bs-inset", label: "Inset (inner shadow)", type: "checkbox" }) +
                 field({ name: "bs-layered", label: "Layered — adds a tighter second shadow", type: "checkbox" }) +
               "</div>" +
               '<div class="tool-swatch" id="tool-bs-preview" style="height:6rem;background:var(--color-surface-2)"></div>' +
               output("bs-out", { label: "CSS" });
      },
      mount: function (root) {
        live(root, function () {
          var rgb = hexToRgb(value(root, "bs-color")) || { r: 43, g: 127, b: 255 };
          var alpha = U.clamp(parseInt(value(root, "bs-alpha"), 10) || 0, 0, 100) / 100;
          var inset = value(root, "bs-inset") ? "inset " : "";
          var rgba = function (a) {
            return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + Math.round(a * 100) / 100 + ")";
          };

          var main = inset + [
            value(root, "bs-x") + "px",
            value(root, "bs-y") + "px",
            value(root, "bs-blur") + "px",
            value(root, "bs-spread") + "px",
            rgba(alpha)
          ].join(" ");

          /* A second, tighter shadow is what separates a flat drop shadow from
             one that reads as depth: the near layer grounds the object, the
             far layer gives it distance. */
          var css = main;
          if (value(root, "bs-layered")) {
            var y2 = Math.round((parseFloat(value(root, "bs-y")) || 0) / 3);
            var b2 = Math.round((parseFloat(value(root, "bs-blur")) || 0) / 3);
            css = inset + [value(root, "bs-x") + "px", y2 + "px", b2 + "px", "0px", rgba(alpha * 0.7)].join(" ") +
                  ", " + main;
          }

          get(root, "bs-preview").style.boxShadow = css;
          write(root, "bs-out", "box-shadow: " + css.replace(", " + main, ",\n            " + main) + ";");
        });
      }
    },


    /* ================================================================
       IMAGE COMPRESSOR
       Canvas re-encode. The file never leaves the machine — there is no
       upload, which is the whole reason to use a browser tool for this.
       ================================================================ */
    "image-compressor": {
      render: function () {
        return dropZone("ic", "Choose an image", "JPEG, PNG or WebP") +
               '<div class="tool-row">' +
                 field({ name: "ic-format", label: "Output format", type: "select", value: "image/jpeg", options: [
                   { value: "image/jpeg", label: "JPEG" },
                   { value: "image/webp", label: "WebP" },
                   { value: "image/png", label: "PNG (lossless)" }
                 ] }) +
                 field({ name: "ic-maxw", label: "Max width (px, 0 = keep)", type: "number", value: "1920", min: 0 }) +
               "</div>" +
               '<div class="form-group">' +
                 '<label class="form-label" for="tool-ic-quality">Quality <span id="tool-ic-qval">80%</span></label>' +
                 '<input class="tool-range" type="range" id="tool-ic-quality" min="30" max="100" step="1" value="80">' +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-ic-stats"></div>' +
               '<div class="tool-preview" id="tool-ic-preview"></div>' +
               '<div class="tool-row"><button type="button" class="btn btn-primary" id="tool-ic-save" disabled>' +
                 App.icons.render("download") + "Download</button></div>";
      },
      mount: function (root) {
        var source = null, blob = null;

        function run() {
          if (!source) return;
          var quality = +value(root, "ic-quality");
          get(root, "ic-qval").textContent = quality + "%";

          var maxW = parseInt(value(root, "ic-maxw"), 10) || 0;
          var scale = maxW && source.width > maxW ? maxW / source.width : 1;
          var w = Math.round(source.width * scale);
          var h = Math.round(source.height * scale);

          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, w, h);

          var type = value(root, "ic-format");
          canvas.toBlob(function (out) {
            if (!out) return;
            blob = out;
            var saved = source.__bytes ? Math.max(0, 100 - Math.round((out.size / source.__bytes) * 100)) : 0;
            get(root, "ic-stats").innerHTML =
              statTile(U.formatBytes(source.__bytes || 0), "Original") +
              statTile(U.formatBytes(out.size), "Compressed") +
              statTile(saved + "%", "Smaller") +
              statTile(w + "×" + h, "Dimensions");
            get(root, "ic-preview").innerHTML =
              '<img src="' + URL.createObjectURL(out) + '" alt="Compressed preview">';
            get(root, "ic-save").disabled = false;
          }, type, quality / 100);
        }

        readImage(root, "ic", function (img) { source = img; run(); });
        root.addEventListener("input", run);
        root.addEventListener("change", run);

        get(root, "ic-save").addEventListener("click", function () {
          if (!blob) return;
          var ext = value(root, "ic-format").split("/")[1].replace("jpeg", "jpg");
          U.download(blob, "compressed." + ext);
        });
      }
    },

    /* ================================================================
       IMAGE RESIZER
       ================================================================ */
    "image-resizer": {
      render: function () {
        return dropZone("ir", "Choose an image", "Resize to exact dimensions") +
               '<div class="tool-row">' +
                 field({ name: "ir-w", label: "Width (px)", type: "number", value: "", min: 1 }) +
                 field({ name: "ir-h", label: "Height (px)", type: "number", value: "", min: 1 }) +
                 field({ name: "ir-format", label: "Format", type: "select", value: "image/png", options: [
                   { value: "image/png", label: "PNG" },
                   { value: "image/jpeg", label: "JPEG" },
                   { value: "image/webp", label: "WebP" }
                 ] }) +
               "</div>" +
               field({ name: "ir-lock", label: "Keep aspect ratio", type: "checkbox", value: true }) +
               '<div class="tool-stat-grid" id="tool-ir-stats"></div>' +
               '<div class="tool-preview" id="tool-ir-preview"></div>' +
               '<div class="tool-row"><button type="button" class="btn btn-primary" id="tool-ir-save" disabled>' +
                 App.icons.render("download") + "Download</button></div>";
      },
      mount: function (root) {
        var source = null, blob = null, ratio = 1, syncing = false;

        function run() {
          if (!source) return;
          var w = Math.max(1, parseInt(value(root, "ir-w"), 10) || source.width);
          var h = Math.max(1, parseInt(value(root, "ir-h"), 10) || source.height);

          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, w, h);

          canvas.toBlob(function (out) {
            if (!out) return;
            blob = out;
            get(root, "ir-stats").innerHTML =
              statTile(source.width + "×" + source.height, "Original") +
              statTile(w + "×" + h, "New size") +
              statTile(U.formatBytes(out.size), "File size");
            get(root, "ir-preview").innerHTML =
              '<img src="' + URL.createObjectURL(out) + '" alt="Resized preview">';
            get(root, "ir-save").disabled = false;
          }, value(root, "ir-format"), 0.92);
        }

        /* Keeping the ratio means editing one box updates the other — but
           writing to an input fires `input` again, so guard the recursion. */
        function link(changed) {
          if (!source || !value(root, "ir-lock") || syncing) return;
          syncing = true;
          if (changed === "w") {
            var w = parseInt(value(root, "ir-w"), 10);
            if (w > 0) get(root, "ir-h").value = Math.round(w / ratio);
          } else {
            var h = parseInt(value(root, "ir-h"), 10);
            if (h > 0) get(root, "ir-w").value = Math.round(h * ratio);
          }
          syncing = false;
        }

        readImage(root, "ir", function (img) {
          source = img;
          ratio = img.width / img.height;
          get(root, "ir-w").value = img.width;
          get(root, "ir-h").value = img.height;
          run();
        });

        get(root, "ir-w").addEventListener("input", function () { link("w"); run(); });
        get(root, "ir-h").addEventListener("input", function () { link("h"); run(); });
        get(root, "ir-format").addEventListener("change", run);

        get(root, "ir-save").addEventListener("click", function () {
          if (!blob) return;
          var ext = value(root, "ir-format").split("/")[1].replace("jpeg", "jpg");
          U.download(blob, "resized." + ext);
        });
      }
    },

    /* ================================================================
       QR CODE GENERATOR
       The encoder (Reed-Solomon, masking, version selection) is the one
       piece here genuinely not worth hand-rolling — a subtly wrong QR
       scans as garbage. A 4KB library is fetched the first time this
       tool is opened and never on any other page.
       ================================================================ */
    "qr-code-generator": {
      render: function () {
        return field({ name: "qr-in", label: "Text or URL", type: "textarea", rows: 3,
                       placeholder: "https://example.com" }) +
               '<div class="tool-row">' +
                 field({ name: "qr-size", label: "Size (px)", type: "number", value: "512", min: 128, max: 2048 }) +
                 field({ name: "qr-ec", label: "Error correction", type: "select", value: "M", options: [
                   { value: "L", label: "L — 7%" }, { value: "M", label: "M — 15%" },
                   { value: "Q", label: "Q — 25%" }, { value: "H", label: "H — 30%" }
                 ] }) +
                 field({ name: "qr-margin", label: "Quiet zone", type: "number", value: "4", min: 0, max: 12 }) +
               "</div>" +
               '<div class="tool-preview tool-preview--qr" id="tool-qr-out"></div>' +
               '<div class="tool-row"><button type="button" class="btn btn-primary" id="tool-qr-save" disabled>' +
                 App.icons.render("download") + "Download PNG</button></div>";
      },
      mount: function (root) {
        var canvas = null;
        var out = get(root, "qr-out");
        out.textContent = "Loading encoder…";

        U.loadScript("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js")
          .then(function () { live(root, draw); })
          .catch(function () {
            out.textContent = "The QR encoder could not be loaded. Check your connection and reopen this tool.";
            out.classList.add("is-error");
          });

        function draw() {
          var text = value(root, "qr-in");
          if (!text) { out.innerHTML = ""; get(root, "qr-save").disabled = true; return; }

          try {
            /* typeNumber 0 lets the library pick the smallest version that fits */
            var qr = window.qrcode(0, value(root, "qr-ec"));
            qr.addData(text);
            qr.make();

            var count = qr.getModuleCount();
            var margin = parseInt(value(root, "qr-margin"), 10) || 0;
            var size = U.clamp(parseInt(value(root, "qr-size"), 10) || 512, 128, 2048);
            var cell = Math.floor(size / (count + margin * 2));
            var dim = cell * (count + margin * 2);

            canvas = document.createElement("canvas");
            canvas.width = dim; canvas.height = dim;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, dim, dim);
            ctx.fillStyle = "#000000";
            for (var r = 0; r < count; r++) {
              for (var c = 0; c < count; c++) {
                if (qr.isDark(r, c)) {
                  ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
                }
              }
            }

            out.classList.remove("is-error");
            out.innerHTML = "";
            out.appendChild(canvas);
            get(root, "qr-save").disabled = false;
          } catch (error) {
            out.classList.add("is-error");
            out.textContent = "That is too much data for one QR code — shorten the text or lower the error correction.";
            get(root, "qr-save").disabled = true;
          }
        }

        get(root, "qr-save").addEventListener("click", function () {
          if (!canvas) return;
          canvas.toBlob(function (blob) { U.download(blob, "qr-code.png"); });
        });
      }
    },

    /* ================================================================
       SITEMAP GENERATOR
       ================================================================ */
    "sitemap-generator": {
      render: function () {
        return field({ name: "sm-base", label: "Site URL", placeholder: "https://example.com" }) +
               field({ name: "sm-in", label: "Paths or URLs — one per line", type: "textarea", rows: 7,
                       placeholder: "/\n/about\n/services\n/contact" }) +
               '<div class="tool-row">' +
                 field({ name: "sm-freq", label: "Change frequency", type: "select", value: "monthly", options: [
                   { value: "always", label: "always" }, { value: "hourly", label: "hourly" },
                   { value: "daily", label: "daily" }, { value: "weekly", label: "weekly" },
                   { value: "monthly", label: "monthly" }, { value: "yearly", label: "yearly" },
                   { value: "never", label: "never" }
                 ] }) +
                 field({ name: "sm-priority", label: "Priority", type: "select", value: "0.7", options: [
                   { value: "1.0", label: "1.0" }, { value: "0.8", label: "0.8" },
                   { value: "0.7", label: "0.7" }, { value: "0.5", label: "0.5" }
                 ] }) +
                 field({ name: "sm-date", label: "Last modified", type: "date" }) +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-sm-stats"></div>' +
               output("sm-out", { label: "sitemap.xml" });
      },
      mount: function (root) {
        live(root, function () {
          var base = value(root, "sm-base").trim().replace(/\/+$/, "");
          var lines = value(root, "sm-in").split("\n")
            .map(function (l) { return l.trim(); })
            .filter(Boolean);

          if (!lines.length) {
            write(root, "sm-out", "");
            get(root, "sm-stats").innerHTML = "";
            return;
          }

          var date = value(root, "sm-date");
          var freq = value(root, "sm-freq");
          var priority = value(root, "sm-priority");
          var seen = {};
          var urls = [];

          lines.forEach(function (line) {
            var loc = /^https?:\/\//i.test(line) ? line : base + "/" + line.replace(/^\/+/, "");
            loc = loc.replace(/&/g, "&amp;");
            if (seen[loc]) return;          /* duplicates in a sitemap are a crawl smell */
            seen[loc] = true;
            urls.push(
              "  <url>\n" +
              "    <loc>" + loc + "</loc>\n" +
              (date ? "    <lastmod>" + date + "</lastmod>\n" : "") +
              "    <changefreq>" + freq + "</changefreq>\n" +
              "    <priority>" + priority + "</priority>\n" +
              "  </url>"
            );
          });

          get(root, "sm-stats").innerHTML =
            statTile(String(urls.length), "URLs") +
            statTile(String(lines.length - urls.length), "Duplicates removed");

          write(root, "sm-out",
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            urls.join("\n") + "\n</urlset>");
        });
      }
    },

    /* ================================================================
       CSS UNIT CONVERTER
       ================================================================ */
    "unit-converter": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "uc-value", label: "Value", type: "number", value: "24" }) +
                 field({ name: "uc-from", label: "From", type: "select", value: "px", options: [
                   { value: "px", label: "px" }, { value: "rem", label: "rem" },
                   { value: "em", label: "em" }, { value: "pt", label: "pt" }, { value: "%", label: "%" }
                 ] }) +
               "</div>" +
               '<div class="tool-row">' +
                 field({ name: "uc-root", label: "Root font size (px)", type: "number", value: "16", min: 1 }) +
                 field({ name: "uc-parent", label: "Parent font size (px)", type: "number", value: "16", min: 1 }) +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-uc-stats"></div>' +
               output("uc-out", { label: "All units" });
      },
      mount: function (root) {
        live(root, function () {
          var v = parseFloat(value(root, "uc-value"));
          var rootPx = parseFloat(value(root, "uc-root")) || 16;
          var parentPx = parseFloat(value(root, "uc-parent")) || 16;
          var from = value(root, "uc-from");

          if (isNaN(v)) {
            write(root, "uc-out", "Enter a number to convert.", true);
            get(root, "uc-stats").innerHTML = "";
            return;
          }

          /* Everything converts through px */
          var px = from === "px" ? v
                 : from === "rem" ? v * rootPx
                 : from === "em" ? v * parentPx
                 : from === "pt" ? v * (96 / 72)
                 : (v / 100) * parentPx;          /* % of the parent font size */

          var round = function (n) { return Math.round(n * 10000) / 10000; };

          get(root, "uc-stats").innerHTML =
            statTile(round(px) + "px", "Pixels") +
            statTile(round(px / rootPx) + "rem", "Root em") +
            statTile(round(px / parentPx) + "em", "Em");

          write(root, "uc-out",
            "px    " + round(px) + "px\n" +
            "rem   " + round(px / rootPx) + "rem      (root " + rootPx + "px)\n" +
            "em    " + round(px / parentPx) + "em       (parent " + parentPx + "px)\n" +
            "pt    " + round(px * (72 / 96)) + "pt\n" +
            "%     " + round((px / parentPx) * 100) + "%        (of parent font size)");
        });
      }
    },


    /* ================================================================
       CONTRAST CHECKER — WCAG pass/fail for a colour pair
       ================================================================ */
    "contrast-checker": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "cc-fg", label: "Text colour", type: "color", value: "#8a9099" }) +
                 field({ name: "cc-fg-hex", label: "Hex", value: "#8A9099" }) +
                 field({ name: "cc-bg", label: "Background", type: "color", value: "#08090d" }) +
                 field({ name: "cc-bg-hex", label: "Hex", value: "#08090D" }) +
               "</div>" +
               '<div class="tool-contrast" id="tool-cc-preview">' +
                 '<p class="tool-contrast-lg">Large text — 24px</p>' +
                 '<p class="tool-contrast-sm">Body text — 16px. The quick brown fox jumps over the lazy dog.</p>' +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-cc-stats"></div>' +
               output("cc-out", { label: "Verdict" });
      },
      mount: function (root) {
        function sync(picker, hex) {
          get(root, picker).addEventListener("input", function () {
            get(root, hex).value = get(root, picker).value.toUpperCase();
          });
        }
        sync("cc-fg", "cc-fg-hex");
        sync("cc-bg", "cc-bg-hex");

        live(root, function () {
          var fg = hexToRgb(value(root, "cc-fg-hex"));
          var bg = hexToRgb(value(root, "cc-bg-hex"));
          if (!fg || !bg) { write(root, "cc-out", "Enter two valid hex colours.", true); return; }

          get(root, "cc-fg").value = rgbToHex(fg.r, fg.g, fg.b).toLowerCase();
          get(root, "cc-bg").value = rgbToHex(bg.r, bg.g, bg.b).toLowerCase();

          var ratio = contrastRatio(fg, bg);
          var preview = get(root, "cc-preview");
          preview.style.background = rgbToHex(bg.r, bg.g, bg.b);
          preview.style.color = rgbToHex(fg.r, fg.g, fg.b);

          /* WCAG 2: normal text needs 4.5, large (>=18.66px bold or 24px) needs 3 */
          var pass = function (min) { return ratio >= min ? "Pass" : "Fail"; };

          get(root, "cc-stats").innerHTML =
            statTile(ratio.toFixed(2) + ":1", "Contrast ratio") +
            statTile(pass(4.5), "AA normal") +
            statTile(pass(3), "AA large") +
            statTile(pass(7), "AAA normal");

          write(root, "cc-out",
            "Ratio        " + ratio.toFixed(2) + ":1\n" +
            "AA  normal   " + pass(4.5) + "   (needs 4.5:1)\n" +
            "AA  large    " + pass(3) + "   (needs 3:1 — 24px, or 18.66px bold)\n" +
            "AAA normal   " + pass(7) + "   (needs 7:1)\n" +
            "AAA large    " + pass(4.5) + "   (needs 4.5:1)");
        });
      }
    },

    /* ================================================================
       COLOUR SHADES — a tint/shade ramp from one colour
       ================================================================ */
    "color-shades": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "cs-hex", label: "Base colour", value: "#2B7FFF" }) +
                 field({ name: "cs-pick", label: "Pick", type: "color", value: "#2b7fff" }) +
               "</div>" +
               '<div class="tool-ramp" id="tool-cs-ramp"></div>' +
               output("cs-out", { label: "CSS custom properties" });
      },
      mount: function (root) {
        get(root, "cs-pick").addEventListener("input", function () {
          get(root, "cs-hex").value = get(root, "cs-pick").value.toUpperCase();
        });

        live(root, function () {
          var rgb = hexToRgb(value(root, "cs-hex"));
          if (!rgb) { write(root, "cs-out", "Enter a valid hex colour.", true); return; }
          get(root, "cs-pick").value = rgbToHex(rgb.r, rgb.g, rgb.b).toLowerCase();

          var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          var steps = [95, 88, 78, 66, 54, 46, 38, 30, 22, 14];
          var ramp = "", css = "";

          steps.forEach(function (l, i) {
            var hex = hslToHex(hsl.h, hsl.s, l);
            var name = (i + 1) * 100 - 50;
            ramp += '<button type="button" class="tool-ramp-chip" data-copy-text="' + hex + '"' +
                    ' style="background:' + hex + ';color:' + (l > 55 ? "#111" : "#fff") + '">' +
                    "<span>" + name + "</span><span>" + hex + "</span></button>";
            css += "  --brand-" + name + ": " + hex + ";\n";
          });

          get(root, "cs-ramp").innerHTML = ramp;
          write(root, "cs-out", ":root {\n" + css + "}");
        });

        /* Click any swatch to copy just that value */
        root.addEventListener("click", function (event) {
          var chip = event.target.closest("[data-copy-text]");
          if (!chip) return;
          U.copy(chip.getAttribute("data-copy-text")).then(function () {
            C.showToast("Copied " + chip.getAttribute("data-copy-text"), { type: "success", duration: 2000 });
          });
        });
      }
    },

    /* ================================================================
       CSS CLAMP GENERATOR — fluid type between two viewports
       ================================================================ */
    "clamp-generator": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "cl-minv", label: "Min viewport (px)", type: "number", value: "375" }) +
                 field({ name: "cl-maxv", label: "Max viewport (px)", type: "number", value: "1440" }) +
               "</div>" +
               '<div class="tool-row">' +
                 field({ name: "cl-min", label: "Min size (px)", type: "number", value: "18" }) +
                 field({ name: "cl-max", label: "Max size (px)", type: "number", value: "48" }) +
                 field({ name: "cl-root", label: "Root size (px)", type: "number", value: "16" }) +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-cl-stats"></div>' +
               output("cl-out", { label: "CSS" });
      },
      mount: function (root) {
        live(root, function () {
          var minV = parseFloat(value(root, "cl-minv"));
          var maxV = parseFloat(value(root, "cl-maxv"));
          var minS = parseFloat(value(root, "cl-min"));
          var maxS = parseFloat(value(root, "cl-max"));
          var rootPx = parseFloat(value(root, "cl-root")) || 16;

          if ([minV, maxV, minS, maxS].some(isNaN) || maxV <= minV) {
            write(root, "cl-out", "Check the numbers — the max viewport must be larger than the min.", true);
            get(root, "cl-stats").innerHTML = "";
            return;
          }

          /* Linear interpolation between the two viewport widths:
             size = slope * 100vw + intercept, expressed in rem so it still
             respects the user's browser font-size setting. */
          var slope = (maxS - minS) / (maxV - minV);
          var interceptPx = minS - slope * minV;
          var r = function (n) { return Math.round(n * 10000) / 10000; };

          var minRem = r(minS / rootPx);
          var maxRem = r(maxS / rootPx);
          var vw = r(slope * 100);
          var interceptRem = r(interceptPx / rootPx);

          var pref = interceptRem === 0
            ? vw + "vw"
            : interceptRem + "rem + " + vw + "vw";

          get(root, "cl-stats").innerHTML =
            statTile(minS + "px", "At " + minV + "px") +
            statTile(maxS + "px", "At " + maxV + "px") +
            statTile(r((minS + maxS) / 2) + "px", "Midpoint");

          write(root, "cl-out",
            "font-size: clamp(" + minRem + "rem, " + pref + ", " + maxRem + "rem);\n\n" +
            "/* " + minS + "px at " + minV + "px viewport → " + maxS + "px at " + maxV + "px */");
        });
      }
    },

    /* ================================================================
       HASH GENERATOR — SubtleCrypto, so no library and no upload
       ================================================================ */
    "hash-generator": {
      render: function () {
        return field({ name: "hg-in", label: "Text", type: "textarea", rows: 4,
                       placeholder: "Anything you want a digest of" }) +
               field({ name: "hg-algo", label: "Algorithm", type: "select", value: "SHA-256", options: [
                 { value: "SHA-1", label: "SHA-1 (legacy — not for security)" },
                 { value: "SHA-256", label: "SHA-256" },
                 { value: "SHA-384", label: "SHA-384" },
                 { value: "SHA-512", label: "SHA-512" }
               ] }) +
               output("hg-out", { label: "Digest (hex)" });
      },
      mount: function (root) {
        function run() {
          var text = value(root, "hg-in");
          if (!text) return write(root, "hg-out", "");

          if (!window.crypto || !crypto.subtle) {
            return write(root, "hg-out", "This browser does not expose SubtleCrypto (it requires a secure context).", true);
          }

          crypto.subtle.digest(value(root, "hg-algo"), new TextEncoder().encode(text))
            .then(function (buffer) {
              var hex = Array.prototype.map.call(new Uint8Array(buffer), function (b) {
                return b.toString(16).padStart(2, "0");
              }).join("");
              write(root, "hg-out", hex);
            })
            .catch(function () {
              write(root, "hg-out", "That algorithm is not available in this browser.", true);
            });
        }
        live(root, run);
      }
    },

    /* ================================================================
       UUID GENERATOR
       ================================================================ */
    "uuid-generator": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "uu-count", label: "How many", type: "number", value: "5", min: 1, max: 100 }) +
                 field({ name: "uu-case", label: "Case", type: "select", value: "lower", options: [
                   { value: "lower", label: "lowercase" }, { value: "upper", label: "UPPERCASE" }
                 ] }) +
                 '<button type="button" class="btn btn-primary" data-action="gen">' +
                   App.icons.render("refresh") + "Generate</button>" +
               "</div>" +
               output("uu-out", { label: "UUID v4" });
      },
      mount: function (root) {
        function uuid() {
          /* randomUUID is the right call where it exists; the fallback is the
             same RFC 4122 v4 layout built from crypto-grade random bytes —
             never Math.random, which is not suitable for identifiers. */
          if (crypto.randomUUID) return crypto.randomUUID();
          var b = new Uint8Array(16);
          crypto.getRandomValues(b);
          b[6] = (b[6] & 0x0f) | 0x40;
          b[8] = (b[8] & 0x3f) | 0x80;
          var hex = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
          return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join("-");
        }

        function run() {
          var n = U.clamp(parseInt(value(root, "uu-count"), 10) || 1, 1, 100);
          var list = [];
          for (var i = 0; i < n; i++) list.push(uuid());
          var text = list.join("\n");
          write(root, "uu-out", value(root, "uu-case") === "upper" ? text.toUpperCase() : text);
        }

        root.addEventListener("click", function (e) { if (e.target.closest('[data-action="gen"]')) run(); });
        root.addEventListener("change", run);
        run();
      }
    },

    /* ================================================================
       ASPECT RATIO CALCULATOR
       ================================================================ */
    "aspect-ratio": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "ar-w", label: "Original width", type: "number", value: "1920" }) +
                 field({ name: "ar-h", label: "Original height", type: "number", value: "1080" }) +
               "</div>" +
               '<div class="tool-row">' +
                 field({ name: "ar-nw", label: "New width (leave blank to solve)", type: "number", value: "1280" }) +
                 field({ name: "ar-nh", label: "New height (leave blank to solve)", type: "number", value: "" }) +
               "</div>" +
               '<div class="tool-stat-grid" id="tool-ar-stats"></div>' +
               output("ar-out", { label: "Result" });
      },
      mount: function (root) {
        function gcd(a, b) { return b ? gcd(b, a % b) : a; }

        live(root, function () {
          var w = parseFloat(value(root, "ar-w")), h = parseFloat(value(root, "ar-h"));
          if (!w || !h) { write(root, "ar-out", "Enter the original width and height.", true); return; }

          var g = gcd(Math.round(w), Math.round(h));
          var rw = Math.round(w) / g, rh = Math.round(h) / g;
          var ratio = w / h;

          var nw = parseFloat(value(root, "ar-nw"));
          var nh = parseFloat(value(root, "ar-nh"));
          var solved = "";

          if (nw && !nh) solved = nw + " × " + Math.round(nw / ratio);
          else if (nh && !nw) solved = Math.round(nh * ratio) + " × " + nh;
          else if (nw && nh) solved = nw + " × " + nh + (Math.abs(nw / nh - ratio) < 0.01 ? "  (ratio kept)" : "  (ratio changed)");

          get(root, "ar-stats").innerHTML =
            statTile(rw + ":" + rh, "Ratio") +
            statTile(ratio.toFixed(4), "Decimal") +
            statTile((100 / ratio).toFixed(2) + "%", "Padding-top");

          write(root, "ar-out",
            "Ratio          " + rw + ":" + rh + "\n" +
            "Decimal        " + ratio.toFixed(6) + "\n" +
            (solved ? "Scaled         " + solved + "\n" : "") +
            "\nCSS\n" +
            "aspect-ratio: " + rw + " / " + rh + ";\n" +
            "/* legacy padding hack */\npadding-top: " + (100 / ratio).toFixed(4) + "%;");
        });
      }
    },

    /* ================================================================
       REGEX TESTER
       ================================================================ */
    "regex-tester": {
      render: function () {
        return '<div class="tool-row">' +
                 field({ name: "rx-pattern", label: "Pattern", value: "\\b(\\w+)@(\\w+)\\.com\\b" }) +
                 field({ name: "rx-flags", label: "Flags", value: "gi", placeholder: "gimsuy" }) +
               "</div>" +
               field({ name: "rx-test", label: "Test string", type: "textarea", rows: 5,
                       value: "Contact hello@example.com or sales@acme.com for details." }) +
               '<div class="tool-stat-grid" id="tool-rx-stats"></div>' +
               '<div class="form-group"><span class="form-label">Matches highlighted</span>' +
                 '<div class="tool-output" id="tool-rx-hl"></div></div>' +
               output("rx-out", { label: "Match details" });
      },
      mount: function (root) {
        live(root, function () {
          var pattern = value(root, "rx-pattern");
          var flags = value(root, "rx-flags").replace(/[^gimsuy]/g, "");
          var subject = value(root, "rx-test");

          if (!pattern) { write(root, "rx-out", ""); get(root, "rx-hl").innerHTML = ""; return; }

          var re;
          try {
            re = new RegExp(pattern, flags);
          } catch (error) {
            write(root, "rx-out", "Invalid pattern — " + error.message, true);
            get(root, "rx-hl").innerHTML = "";
            get(root, "rx-stats").innerHTML = "";
            return;
          }

          var matches = [];
          if (flags.indexOf("g") !== -1) {
            var m;
            var guard = 0;
            while ((m = re.exec(subject)) !== null && guard++ < 5000) {
              matches.push(m);
              if (m.index === re.lastIndex) re.lastIndex++;   /* zero-length match guard */
            }
          } else {
            var single = re.exec(subject);
            if (single) matches.push(single);
          }

          /* Build the highlight by escaping around the match spans, so a
             subject containing markup can never inject anything. */
          var html = "", cursor = 0;
          matches.forEach(function (match) {
            html += U.escape(subject.slice(cursor, match.index));
            html += "<mark>" + U.escape(match[0]) + "</mark>";
            cursor = match.index + (match[0].length || 1);
          });
          html += U.escape(subject.slice(cursor));
          get(root, "rx-hl").innerHTML = html || "<span class='text-faint'>No matches</span>";

          get(root, "rx-stats").innerHTML =
            statTile(String(matches.length), "Matches") +
            statTile(String((matches[0] || []).length ? (matches[0].length - 1) : 0), "Capture groups");

          write(root, "rx-out", matches.length
            ? matches.map(function (m, i) {
                var groups = m.slice(1).map(function (g, gi) {
                  return "    group " + (gi + 1) + ": " + (g === undefined ? "(unmatched)" : g);
                }).join("\n");
                return "#" + (i + 1) + "  at " + m.index + "  \"" + m[0] + "\"" + (groups ? "\n" + groups : "");
              }).join("\n\n")
            : "No matches.");
        });
      }
    },

    /* ---------------------------------------------------------------- */
    "html-entity-converter": {
      render: function () {
        return field({ name: "ent-in", label: "Text or HTML", type: "textarea", rows: 5 }) +
               '<div class="cluster cluster--sm">' +
                 '<button type="button" class="filter-btn is-active" data-mode="escape">Escape</button>' +
                 '<button type="button" class="filter-btn" data-mode="unescape">Unescape</button>' +
               "</div>" +
               output("ent-out");
      },
      mount: function (root) {
        var mode = "escape";

        function run() {
          var text = value(root, "ent-in");
          if (!text) return write(root, "ent-out", "");
          if (mode === "escape") {
            write(root, "ent-out", U.escape(text));
          } else {
            var area = document.createElement("textarea");
            area.innerHTML = text;
            write(root, "ent-out", area.value);
          }
        }

        root.addEventListener("click", function (event) {
          var button = event.target.closest("[data-mode]");
          if (!button) return;
          mode = button.getAttribute("data-mode");
          U.$$("[data-mode]", root).forEach(function (b) { b.classList.toggle("is-active", b === button); });
          run();
        });

        live(root, run);
      }
    }
  };

  function statTile(value_, label) {
    return '<div class="tool-stat">' +
             '<span class="tool-stat-value">' + U.escape(value_) + "</span>" +
             '<span class="tool-stat-label">' + U.escape(label) + "</span>" +
           "</div>";
  }

  /* ==================================================================
     OPENING A TOOL
     ================================================================== */
  function open(id) {
    var tool = App.data.items("tools").filter(function (t) { return t.id === id; })[0];
    var implementation = REGISTRY[id];

    if (!tool) return;

    if (!implementation) {
      C.showModal({
        title: tool.title,
        subtitle: "Coming soon",
        body: C.emptyState({
          icon: tool.icon,
          title: "Not built yet",
          text: tool.description + " This one is on the list — tell us if you'd find it useful and it moves up."
        })
      });
      return;
    }

    C.showModal({
      title: tool.title,
      subtitle: tool.description,
      wide: true,
      autoFocus: "textarea, input:not([type=color]):not([type=checkbox]), select",
      body: '<div class="tool-panel" data-tool-root>' + implementation.render() + "</div>" +
            '<p class="form-help mt-md">' + App.icons.render("lock") +
              " Runs entirely in your browser — nothing is uploaded.</p>",

      onOpen: function (modal) {
        var root = modal.querySelector("[data-tool-root]");
        implementation.mount(root);
        bindCopy(root);

        /* Deep link: the open tool becomes the URL, so a tool can be
           bookmarked, shared or reloaded straight back into. */
        if (location.hash.slice(1) !== id) {
          history.replaceState(null, "", "#" + id);
        }

      },

      onClose: function () {
        if (location.hash.slice(1) === id) {
          history.replaceState(null, "", location.pathname + location.search);
        }
      }
    });
  }

  function bindCopy(root) {
    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-copy]");
      if (!button) return;
      var target = document.getElementById(button.getAttribute("data-copy"));
      if (!target || !target.textContent.trim()) {
        C.showToast("Nothing to copy yet.", { type: "info" });
        return;
      }
      U.copy(target.textContent).then(function () {
        C.showToast("Copied to clipboard", { type: "success", duration: 2500 });
      }).catch(function () {
        C.showToast("Copy failed — select the text and copy manually.", { type: "error" });
      });
    });
  }

  /** Delegated binding for any grid of tool cards. */
  function bind(scope) {
    var root = scope || document;
    if (root.__uiToolsBound) return;
    root.__uiToolsBound = true;

    root.addEventListener("click", function (event) {
      var card = event.target.closest("[data-tool]");
      if (!card) return;
      open(card.getAttribute("data-tool"));
    });

    root.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var card = event.target.closest("[data-tool]");
      if (!card) return;
      event.preventDefault();
      open(card.getAttribute("data-tool"));
    });

    window.addEventListener("hashchange", openFromHash);
    openFromHash();
  }

  /**
   * Opens whichever tool the URL points at (/pages/tools.html#json-formatter).
   * Runs on load and on every hash change, so links from the mega-menu, the
   * cards and anywhere else all land in the same place.
   */
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var exists = App.data.items("tools").some(function (t) { return t.id === id; });
    if (exists) open(id);
  }

  App.tools = {
    registry: REGISTRY,
    openFromHash: openFromHash,
    open: open,
    bind: bind,

    /** Register a tool without editing this file. */
    register: function (id, definition) {
      REGISTRY[id] = definition;
      return App.tools;
    },

    helpers: { field: field, output: output, value: value, write: write, live: live, statTile: statTile }
  };
})(window.Site);
