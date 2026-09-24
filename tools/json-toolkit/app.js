/* JSON Toolkit — self-contained, no globals leaked, no network calls.
 *
 * Single source of truth (tools/STANDARDS.md §6, adapted for a text tool):
 * `parseAndAnalyze(text)` is the ONE place that decides whether JSON is
 * valid and computes its stats. Format, Validate, Auto-Fix and Search all
 * call it — none of them re-implements parsing or traversal on its own,
 * so they can never disagree about what counts as "valid".
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     DOM refs
     ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  var editor = $("jt-editor");
  var gutter = $("jt-gutter");
  var statusBar = $("jt-status-bar");
  var statusText = $("jt-status-text");
  var fixReport = $("jt-fix-report");
  var treeRoot = $("jt-tree");
  var queryOutput = $("jt-query-output");
  var searchResults = $("jt-search-results");

  var SAMPLE = JSON.stringify({
    name: "Ada Lovelace",
    active: true,
    age: 36,
    tags: ["mathematician", "writer", "programmer"],
    address: {
      city: "London",
      country: "UK",
      geo: { lat: 51.5072, lng: -0.1276 }
    },
    projects: [
      { id: 1, title: "Analytical Engine notes", year: 1843 },
      { id: 2, title: "Bernoulli numbers algorithm", year: 1843 }
    ],
    notes: null
  }, null, 2);

  /* ------------------------------------------------------------------
     Shared parse & analyze routine (single source of truth)
     ------------------------------------------------------------------ */

  function computeStats(value, text) {
    var objects = 0, arrays = 0, strings = 0, numbers = 0, booleans = 0,
      nulls = 0, keyCount = 0, maxDepth = 0;

    function walk(v, depth) {
      if (depth > maxDepth) maxDepth = depth;
      if (v === null) { nulls++; return; }
      if (Array.isArray(v)) {
        arrays++;
        for (var i = 0; i < v.length; i++) walk(v[i], depth + 1);
        return;
      }
      var t = typeof v;
      if (t === "object") {
        objects++;
        var ks = Object.keys(v);
        keyCount += ks.length;
        for (var k = 0; k < ks.length; k++) walk(v[ks[k]], depth + 1);
        return;
      }
      if (t === "string") { strings++; return; }
      if (t === "number") { numbers++; return; }
      if (t === "boolean") { booleans++; return; }
    }
    walk(value, 1);

    var bytes;
    try { bytes = new TextEncoder().encode(text).length; }
    catch (e) { bytes = text.length; }

    return {
      bytes: bytes, keyCount: keyCount, maxDepth: maxDepth,
      objects: objects, arrays: arrays, strings: strings,
      numbers: numbers, booleans: booleans, nulls: nulls
    };
  }

  function lineColAt(text, index) {
    var line = 1, col = 1;
    var end = Math.min(index, text.length);
    for (var i = 0; i < end; i++) {
      if (text.charCodeAt(i) === 10) { line++; col = 1; }
      else col++;
    }
    return { line: line, col: col };
  }

  /* A small recursive-descent structural scanner used ONLY to produce a
     human-readable diagnosis once we already know (via JSON.parse) that
     the text is invalid. It never decides validity itself — that keeps
     Format/Validate/Auto-Fix from ever disagreeing about "is it valid". */
  function diagnoseJSON(text) {
    var i = 0, len = text.length;

    function fail(message, atIndex) {
      var idx = (atIndex === undefined) ? i : atIndex;
      var lc = lineColAt(text, idx);
      var err = new Error(message);
      err.jtDiag = { index: idx, line: lc.line, col: lc.col, message: message };
      throw err;
    }

    function isWs(c) { return c === " " || c === "\t" || c === "\n" || c === "\r"; }
    function skipWs() { while (i < len && isWs(text[i])) i++; }

    function parseValue() {
      skipWs();
      if (i >= len) fail("Unexpected end of input — expected a value here.");
      var c = text[i];
      if (c === '"') return parseString();
      if (c === "'") fail("Single-quoted string — JSON strings must use double quotes (\").");
      if (c === "{") return parseObject();
      if (c === "[") return parseArray();
      if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
      if (text.substr(i, 4) === "true") { i += 4; return true; }
      if (text.substr(i, 5) === "false") { i += 5; return false; }
      if (text.substr(i, 4) === "null") { i += 4; return null; }
      if (text.substr(i, 3) === "NaN") fail("'NaN' is not valid JSON. Run Auto-Fix to convert it to null.");
      if (text.substr(i, 8) === "Infinity" || text.substr(i, 9) === "-Infinity") fail("'Infinity' is not valid JSON. Run Auto-Fix to convert it to null.");
      if (text.substr(i, 9) === "undefined") fail("'undefined' is not valid JSON. Run Auto-Fix to convert it to null.");
      if (/[A-Za-z_$]/.test(c)) fail("Unexpected identifier — did you forget to quote a string?");
      fail("Unexpected character '" + c + "' — expected a value (string, number, object, array, true, false or null).");
    }

    function parseString() {
      var start = i;
      i++; // opening quote
      while (true) {
        if (i >= len) {
          var lc = lineColAt(text, start);
          fail("Unterminated string — opened at line " + lc.line + ", column " + lc.col + " and never closed.", start);
        }
        var c = text[i];
        if (c === '"') { i++; return; }
        if (c === "\n") fail("Unterminated string — line break found before the closing quote.", start);
        if (c === "\\") {
          i++;
          if (i >= len) fail("Unterminated escape sequence at end of input.");
          var esc = text[i];
          if ('"\\/bfnrt'.indexOf(esc) === -1 && esc !== "u") {
            fail("Invalid escape sequence '\\" + esc + "' inside a string.");
          }
          i++;
          if (esc === "u") i += 4;
          continue;
        }
        i++;
      }
    }

    function parseNumber() {
      var start = i;
      if (text[i] === "-") i++;
      if (text[i] === "0") { i++; }
      else if (text[i] >= "1" && text[i] <= "9") { while (i < len && text[i] >= "0" && text[i] <= "9") i++; }
      else fail("Invalid number literal.", start);
      if (text[i] === ".") {
        i++;
        if (!(text[i] >= "0" && text[i] <= "9")) fail("Invalid number — expected digits after the decimal point.");
        while (i < len && text[i] >= "0" && text[i] <= "9") i++;
      }
      if (text[i] === "e" || text[i] === "E") {
        i++;
        if (text[i] === "+" || text[i] === "-") i++;
        if (!(text[i] >= "0" && text[i] <= "9")) fail("Invalid number — expected digits in the exponent.");
        while (i < len && text[i] >= "0" && text[i] <= "9") i++;
      }
    }

    function parseObject() {
      var openIdx = i;
      i++; skipWs();
      if (text[i] === "}") { i++; return; }
      while (true) {
        skipWs();
        if (i >= len) fail("Unexpected end of input — object opened at line " + lineColAt(text, openIdx).line + " was never closed.");
        if (text[i] === "}") fail("Trailing comma before '}' — remove the comma after the last property.");
        if (text[i] === "'") fail("Single-quoted property key — JSON requires keys in double quotes.");
        if (text[i] !== '"') {
          if (/[A-Za-z_$]/.test(text[i])) fail("Unquoted property key — JSON requires keys in double quotes.");
          fail("Expected a property name in double quotes, found '" + text[i] + "'.");
        }
        parseString();
        skipWs();
        if (text[i] !== ":") fail("Expected ':' after the property name, found '" + (text[i] || "end of input") + "'.");
        i++;
        parseValue();
        skipWs();
        if (text[i] === ",") {
          i++; skipWs();
          if (text[i] === "}") fail("Trailing comma before '}' — remove the comma after the last property.");
          continue;
        }
        if (text[i] === "}") { i++; return; }
        fail("Expected ',' or '}', found '" + (text[i] || "end of input") + "'.");
      }
    }

    function parseArray() {
      var openIdx = i;
      i++; skipWs();
      if (text[i] === "]") { i++; return; }
      while (true) {
        if (text[i] === ",") fail("Missing array element — found an extra comma.");
        parseValue();
        skipWs();
        if (text[i] === ",") {
          i++; skipWs();
          if (text[i] === "]") fail("Trailing comma before ']' — remove the comma after the last element.");
          continue;
        }
        if (text[i] === "]") { i++; return; }
        if (i >= len) fail("Unexpected end of input — array opened at line " + lineColAt(text, openIdx).line + " was never closed.");
        fail("Expected ',' or ']', found '" + text[i] + "'. (Missing comma between array elements?)");
      }
    }

    try {
      if (text.trim() === "") return { index: 0, line: 1, col: 1, message: "Input is empty." };
      if (text.charCodeAt(0) === 0xFEFF) i = 1;
      parseValue();
      skipWs();
      if (i < len) fail("Unexpected trailing content after the JSON value.");
      return null;
    } catch (e) {
      if (e.jtDiag) return e.jtDiag;
      return { index: i, line: lineColAt(text, i).line, col: lineColAt(text, i).col, message: "Malformed JSON near this position." };
    }
  }

  function fallbackDiagFromNativeError(e, text) {
    var m = /position (\d+)/.exec(e.message || "");
    var idx = m ? parseInt(m[1], 10) : 0;
    var lc = lineColAt(text, idx);
    return { index: idx, line: lc.line, col: lc.col, message: e.message || "Invalid JSON." };
  }

  function parseAndAnalyze(text) {
    try {
      var value = JSON.parse(text);
      return { valid: true, value: value, stats: computeStats(value, text) };
    } catch (e) {
      var diag = diagnoseJSON(text);
      if (!diag) diag = fallbackDiagFromNativeError(e, text);
      return { valid: false, diagnostic: diag };
    }
  }

  /* ------------------------------------------------------------------
     Auto-fix
     ------------------------------------------------------------------ */

  function stripCommentsAndSingleQuotes(text, counts) {
    var out = "";
    var i = 0, len = text.length;
    var CODE = 0, DQ = 1, SQ = 2, LC = 3, BC = 4;
    var state = CODE;
    while (i < len) {
      var c = text[i], n = text[i + 1];
      if (state === CODE) {
        if (c === '"') { out += c; state = DQ; i++; }
        else if (c === "'") { out += '"'; state = SQ; i++; counts.singleQuoted++; }
        else if (c === "/" && n === "/") { state = LC; i += 2; counts.comments++; }
        else if (c === "/" && n === "*") { state = BC; i += 2; counts.comments++; }
        else { out += c; i++; }
      } else if (state === DQ) {
        if (c === "\\" && i + 1 < len) { out += c + n; i += 2; }
        else if (c === '"') { out += c; state = CODE; i++; }
        else { out += c; i++; }
      } else if (state === SQ) {
        if (c === "\\" && i + 1 < len) {
          if (n === "'") { out += "'"; i += 2; }
          else if (n === '"') { out += '\\"'; i += 2; }
          else { out += c + n; i += 2; }
        } else if (c === '"') { out += '\\"'; i++; }
        else if (c === "'") { out += '"'; state = CODE; i++; }
        else { out += c; i++; }
      } else if (state === LC) {
        if (c === "\n") { out += c; state = CODE; i++; }
        else i++;
      } else if (state === BC) {
        if (c === "*" && n === "/") { state = CODE; i += 2; }
        else { if (c === "\n") out += c; i++; }
      }
    }
    return out;
  }

  function fixStructural(text, counts) {
    var stringRe = /"(?:[^"\\]|\\.)*"/g;
    var result = "";
    var lastIndex = 0;
    var m;

    function fixGap(gap) {
      gap = gap.replace(/,(\s*[}\]])/g, function (_, close) {
        counts.trailingCommas++;
        return close;
      });
      gap = gap.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, function (_, pre, key, post) {
        counts.unquotedKeys++;
        return pre + '"' + key + '"' + post;
      });
      gap = gap.replace(/(-?\bNaN\b|-?\bInfinity\b|\bundefined\b)/g, function () {
        counts.illegalLiterals++;
        return "null";
      });
      return gap;
    }

    while ((m = stringRe.exec(text))) {
      result += fixGap(text.slice(lastIndex, m.index));
      result += m[0];
      lastIndex = stringRe.lastIndex;
    }
    result += fixGap(text.slice(lastIndex));
    return result;
  }

  function autoFix(text) {
    var counts = {
      bom: 0, smartQuotes: 0, singleQuoted: 0, comments: 0,
      controlChars: 0, trailingCommas: 0, unquotedKeys: 0, illegalLiterals: 0
    };
    var t = text;
    if (t.charCodeAt(0) === 0xFEFF) { t = t.slice(1); counts.bom++; }
    t = t.replace(/[“”„‟″‶]/g, function () { counts.smartQuotes++; return '"'; });
    t = t.replace(/[‘’‚‛′‵]/g, function () { counts.smartQuotes++; return "'"; });
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, function () { counts.controlChars++; return ""; });
    t = stripCommentsAndSingleQuotes(t, counts);
    t = fixStructural(t, counts);
    return { fixed: t, counts: counts };
  }

  var FIX_LABELS = [
    ["bom", "Removed a leading byte-order mark"],
    ["controlChars", "Stripped {n} stray control character(s)"],
    ["smartQuotes", "Converted {n} smart/curly quote(s) to straight quotes"],
    ["comments", "Removed {n} JavaScript-style comment(s)"],
    ["singleQuoted", "Converted {n} single-quoted string(s) to double-quoted"],
    ["unquotedKeys", "Quoted {n} unquoted object key(s)"],
    ["trailingCommas", "Removed {n} trailing comma(s)"],
    ["illegalLiterals", "Converted {n} NaN/Infinity/undefined literal(s) to null"]
  ];

  function fixSummaryItems(counts) {
    var items = [];
    for (var i = 0; i < FIX_LABELS.length; i++) {
      var key = FIX_LABELS[i][0], label = FIX_LABELS[i][1];
      var n = counts[key];
      if (n > 0) items.push(label.replace("{n}", n));
    }
    return items;
  }

  /* ------------------------------------------------------------------
     Editor + gutter
     ------------------------------------------------------------------ */

  function lineCount(text) {
    var n = 1;
    for (var i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  }

  function updateGutter(errorLine) {
    var n = lineCount(editor.value);
    var frag = document.createDocumentFragment();
    for (var i = 1; i <= n; i++) {
      var span = document.createElement("div");
      span.className = "jt-gutter-line" + (i === errorLine ? " is-error-line" : "");
      span.textContent = i;
      frag.appendChild(span);
    }
    gutter.innerHTML = "";
    gutter.appendChild(frag);
  }

  editor.addEventListener("scroll", function () {
    gutter.scrollTop = editor.scrollTop;
  });

  function selectRange(start, end) {
    editor.focus();
    try { editor.setSelectionRange(start, Math.max(end, start + 1)); } catch (e) { /* ignore */ }
    // Scroll the textarea so the selection is roughly centered.
    var before = editor.value.slice(0, start);
    var line = lineCount(before) - 1;
    var lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    var target = Math.max(0, line * lineHeight - editor.clientHeight / 2);
    editor.scrollTop = target;
    gutter.scrollTop = target;
  }

  function jumpToIndex(index, length) {
    setActiveView("text");
    selectRange(index, index + (length || 1));
  }

  /* ------------------------------------------------------------------
     Status bar
     ------------------------------------------------------------------ */

  function setStatus(kind, html, errorLine) {
    statusBar.classList.remove("is-valid", "is-error", "is-warning");
    if (kind) statusBar.classList.add("is-" + kind);
    statusText.innerHTML = html;
    updateGutter(errorLine);
  }

  function describeAnalysis(analysis, prefix) {
    if (analysis.valid) {
      var s = analysis.stats;
      setStatus("valid",
        (prefix || "Valid JSON") + " — " + s.bytes + " bytes, " + s.keyCount + " keys, depth " + s.maxDepth +
        ", " + s.objects + " object(s), " + s.arrays + " array(s) " +
        "<span class=\"jt-hint\">(" + s.strings + " strings, " + s.numbers + " numbers, " + s.booleans + " booleans, " + s.nulls + " nulls)</span>");
      return null;
    }
    var d = analysis.diagnostic;
    setStatus("error",
      "<strong>Invalid JSON</strong> at line " + d.line + ", column " + d.col + " — " + escapeHtml(d.message) +
      " <button type=\"button\" class=\"jt-btn jt-btn--sm jt-btn--ghost\" id=\"jt-jump-error\" style=\"margin-left:.4rem\">Go to error</button>",
      d.line);
    var jumpBtn = $("jt-jump-error");
    if (jumpBtn) jumpBtn.addEventListener("click", function () { jumpToIndex(d.index, 1); });
    return d;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ------------------------------------------------------------------
     Actions: Validate / Format / Minify / Auto-Fix
     ------------------------------------------------------------------ */

  function currentIndent() {
    var v = $("jt-indent-select").value;
    if (v === "tab") return "\t";
    return Number(v);
  }

  function runValidate() {
    var analysis = parseAndAnalyze(editor.value);
    describeAnalysis(analysis);
    if (isViewActive("tree")) renderTree();
    return analysis;
  }

  function runFormat() {
    var analysis = parseAndAnalyze(editor.value);
    if (!analysis.valid) { describeAnalysis(analysis); return; }
    editor.value = JSON.stringify(analysis.value, null, currentIndent());
    describeAnalysis(parseAndAnalyze(editor.value), "Formatted");
    if (isViewActive("tree")) renderTree();
  }

  function runMinify() {
    var analysis = parseAndAnalyze(editor.value);
    if (!analysis.valid) { describeAnalysis(analysis); return; }
    editor.value = JSON.stringify(analysis.value);
    describeAnalysis(parseAndAnalyze(editor.value), "Minified");
    if (isViewActive("tree")) renderTree();
  }

  function runAutoFix() {
    var before = parseAndAnalyze(editor.value);
    if (before.valid) {
      fixReport.innerHTML = '<p class="jt-muted-note">Already valid JSON — nothing to fix.</p>';
      describeAnalysis(before);
      return;
    }
    var result = autoFix(editor.value);
    editor.value = result.fixed;
    var after = parseAndAnalyze(result.fixed);
    var items = fixSummaryItems(result.counts);

    if (after.valid) {
      var html = "";
      if (items.length) {
        html = "<p><strong>Fixed and now valid.</strong></p><ul>" +
          items.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>";
      } else {
        html = '<p class="jt-muted-note">Nothing recognizable to auto-fix, but it turned out to be valid.</p>';
      }
      fixReport.innerHTML = html;
      describeAnalysis(after);
    } else {
      var html2 = "<p><strong>Partially fixed — issues remain.</strong></p>";
      if (items.length) {
        html2 += "<ul>" + items.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>";
      } else {
        html2 += '<p class="jt-muted-note">No automatic fixes applied.</p>';
      }
      fixReport.innerHTML = html2;
      describeAnalysis(after);
    }
    if (isViewActive("tree")) renderTree();
  }

  /* ------------------------------------------------------------------
     View tabs (Text / Tree)
     ------------------------------------------------------------------ */

  function isViewActive(name) {
    var pane = document.querySelector('[data-view-pane="' + name + '"]');
    return !!(pane && pane.classList.contains("is-active"));
  }

  function setActiveView(name) {
    var tabs = document.querySelectorAll("[data-view-tabs] .jt-pill");
    var panes = document.querySelectorAll("[data-view-pane]");
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].getAttribute("data-view") === name;
      tabs[i].classList.toggle("is-active", isActive);
      tabs[i].setAttribute("aria-selected", isActive ? "true" : "false");
    }
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle("is-active", panes[j].getAttribute("data-view-pane") === name);
    }
    if (name === "tree") renderTree();
  }

  function wireTabs(selector, attr, onSelect) {
    var buttons = document.querySelectorAll(selector);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function () {
        onSelect(this.getAttribute(attr));
      });
    }
  }

  /* ------------------------------------------------------------------
     Document-order index: maps each key/value to its offset in the raw
     text, so Search and the Tree view can jump/select the right spot.
     Built fresh from the current editor text + its parsed value.
     ------------------------------------------------------------------ */

  function buildLocator(text, value) {
    var cursor = 0;
    var entries = []; // { path, kind: 'key'|'value', display, index, length }

    function findNext(literal) {
      var idx = text.indexOf(literal, cursor);
      if (idx === -1) idx = text.indexOf(literal); // fallback: search whole doc
      if (idx !== -1) cursor = Math.max(cursor, idx + literal.length);
      return idx;
    }

    function walk(v, path) {
      if (v !== null && Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) walk(v[i], path + "[" + i + "]");
        return;
      }
      if (v !== null && typeof v === "object") {
        var ks = Object.keys(v);
        for (var k = 0; k < ks.length; k++) {
          var key = ks[k];
          var keyLiteral = JSON.stringify(key);
          var idx = findNext(keyLiteral);
          var childPath = path ? path + "." + key : key;
          entries.push({ path: childPath, kind: "key", display: key, index: idx, length: idx === -1 ? 0 : keyLiteral.length });
          walk(v[key], childPath);
        }
        return;
      }
      // scalar
      var literal;
      try { literal = JSON.stringify(v); } catch (e) { literal = String(v); }
      var vidx = findNext(literal);
      entries.push({ path: path || "(root)", kind: "value", display: v, index: vidx, length: vidx === -1 ? 0 : literal.length, raw: v });
    }

    walk(value, "");
    return entries;
  }

  /* ------------------------------------------------------------------
     Search
     ------------------------------------------------------------------ */

  function runSearch() {
    var query = $("jt-search-input").value.trim();
    searchResults.innerHTML = "";
    if (!query) return;
    var analysis = parseAndAnalyze(editor.value);
    if (!analysis.valid) {
      searchResults.innerHTML = '<p class="jt-muted-note">Fix the JSON before searching (see status above).</p>';
      return;
    }
    var entries = buildLocator(editor.value, analysis.value);
    var q = query.toLowerCase();
    var matches = entries.filter(function (e) {
      if (e.kind === "key") return e.display.toLowerCase().indexOf(q) !== -1;
      var v = e.raw;
      if (v === null) return "null".indexOf(q) !== -1;
      return String(v).toLowerCase().indexOf(q) !== -1;
    });

    if (!matches.length) {
      searchResults.innerHTML = '<p class="jt-muted-note">No matches.</p>';
      return;
    }

    var frag = document.createDocumentFragment();
    matches.slice(0, 200).forEach(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jt-result-item";
      var valText = m.kind === "key" ? "key" : (m.raw === null ? "null" : JSON.stringify(m.raw));
      btn.innerHTML = '<span class="jt-result-path">' + escapeHtml(m.path) + '</span><span class="jt-result-val">' +
        (m.kind === "key" ? "matched key" : "= " + escapeHtml(valText)) + "</span>";
      btn.addEventListener("click", function () {
        if (m.index !== -1) jumpToIndex(m.index, m.length);
      });
      frag.appendChild(btn);
    });
    searchResults.appendChild(frag);
  }

  /* ------------------------------------------------------------------
     Path query (JSONPath-lite: dot paths, [n] indices, [*] wildcard)
     ------------------------------------------------------------------ */

  function parsePathExpr(expr) {
    var segs = [];
    var re = /([^.\[\]]+)|\[(\d+|\*)\]/g;
    var m;
    while ((m = re.exec(expr))) {
      if (m[1] !== undefined) segs.push({ type: "key", value: m[1] });
      else if (m[2] === "*") segs.push({ type: "wildcard" });
      else segs.push({ type: "index", value: Number(m[2]) });
    }
    return segs;
  }

  function evalPath(value, segs) {
    if (!segs.length) return [value];
    var seg = segs[0];
    var rest = segs.slice(1);
    var results = [];
    if (seg.type === "wildcard") {
      if (Array.isArray(value)) {
        value.forEach(function (item) { results = results.concat(evalPath(item, rest)); });
      } else if (value && typeof value === "object") {
        Object.keys(value).forEach(function (k) { results = results.concat(evalPath(value[k], rest)); });
      }
      return results;
    }
    if (seg.type === "index") {
      if (Array.isArray(value) && value[seg.value] !== undefined) return evalPath(value[seg.value], rest);
      return [];
    }
    // key
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, seg.value)) {
      return evalPath(value[seg.value], rest);
    }
    return [];
  }

  function runQuery() {
    var expr = $("jt-query-input").value.trim();
    if (!expr) { queryOutput.textContent = ""; return; }
    var analysis = parseAndAnalyze(editor.value);
    if (!analysis.valid) {
      queryOutput.textContent = "Fix the JSON before running a query.";
      return;
    }
    try {
      var segs = parsePathExpr(expr);
      var results = evalPath(analysis.value, segs);
      if (!results.length) {
        queryOutput.textContent = "No match for " + expr;
        return;
      }
      queryOutput.textContent = results.length === 1
        ? JSON.stringify(results[0], null, 2)
        : JSON.stringify(results, null, 2);
    } catch (e) {
      queryOutput.textContent = "Query error: " + e.message;
    }
  }

  /* ------------------------------------------------------------------
     Tree view
     ------------------------------------------------------------------ */

  function typeClass(v) {
    if (v === null) return "jt-tval-null";
    var t = typeof v;
    if (t === "string") return "jt-tval-string";
    if (t === "number") return "jt-tval-number";
    if (t === "boolean") return "jt-tval-boolean";
    return "";
  }

  function scalarDisplay(v) {
    if (v === null) return "null";
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
  }

  function renderTree() {
    var analysis = parseAndAnalyze(editor.value);
    treeRoot.innerHTML = "";
    if (!analysis.valid) {
      var p = document.createElement("p");
      p.className = "jt-muted-note";
      p.textContent = "Fix the JSON before browsing the tree (see status above).";
      treeRoot.appendChild(p);
      return;
    }
    var locator = buildLocator(editor.value, analysis.value);
    var locatorMap = {};
    locator.forEach(function (e) { if (e.kind === "value") locatorMap[e.path] = e; });

    function buildNode(key, value, path, isLast) {
      var wrap = document.createElement("div");
      wrap.className = "jt-tnode";

      var row = document.createElement("div");
      row.className = "jt-tnode-row";

      var isContainer = value !== null && typeof value === "object";
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "jt-tnode-toggle";
      toggle.textContent = isContainer ? "▾" : "";
      if (!isContainer) toggle.disabled = true;
      row.appendChild(toggle);

      var label = document.createElement("span");
      var pieces = [];
      if (key !== null) pieces.push('<span class="jt-tkey">' + escapeHtml(key) + '</span><span class="jt-tpunct">: </span>');
      var childrenWrap = null;

      if (isContainer) {
        var isArr = Array.isArray(value);
        var ks = isArr ? value.map(function (_, i) { return i; }) : Object.keys(value);
        var openCh = isArr ? "[" : "{";
        var closeCh = isArr ? "]" : "}";
        pieces.push('<span class="jt-tpunct">' + openCh + '</span> <span class="jt-tsummary">' + ks.length + (isArr ? " item" : " key") + (ks.length === 1 ? "" : "s") + '</span>');
        label.innerHTML = pieces.join("");
        row.appendChild(label);
        wrap.appendChild(row);

        childrenWrap = document.createElement("div");
        childrenWrap.className = "jt-tchildren";
        ks.forEach(function (k, idx) {
          var childKey = isArr ? null : k;
          var childPath = path ? path + (isArr ? "[" + k + "]" : "." + k) : (isArr ? "[" + k + "]" : k);
          var childLabel = isArr ? String(k) : k;
          childrenWrap.appendChild(buildNode(isArr ? "[" + k + "]" : childKey, isArr ? value[k] : value[k], childPath, idx === ks.length - 1));
        });
        wrap.appendChild(childrenWrap);

        var closeLine = document.createElement("div");
        closeLine.className = "jt-tpunct";
        closeLine.style.marginLeft = "1.15rem";
        closeLine.textContent = closeCh;
        wrap.appendChild(closeLine);

        toggle.addEventListener("click", function () {
          childrenWrap.classList.toggle("is-collapsed");
          toggle.textContent = childrenWrap.classList.contains("is-collapsed") ? "▸" : "▾";
        });
      } else {
        pieces.push('<span class="' + typeClass(value) + '">' + escapeHtml(scalarDisplay(value)) + "</span>");
        label.innerHTML = pieces.join("");
        row.appendChild(label);
        wrap.appendChild(row);
      }

      row.addEventListener("click", function (evt) {
        if (evt.target === toggle) return;
        var entry = locatorMap[path];
        if (entry && entry.index !== -1) jumpToIndex(entry.index, entry.length);
      });

      return wrap;
    }

    var rootNode = buildNode(null, analysis.value, "", true);
    treeRoot.appendChild(rootNode);
  }

  function setAllTreeCollapsed(collapsed) {
    var groups = treeRoot.querySelectorAll(".jt-tchildren");
    var toggles = treeRoot.querySelectorAll(".jt-tnode-toggle:not(:disabled)");
    groups.forEach(function (g) { g.classList.toggle("is-collapsed", collapsed); });
    toggles.forEach(function (t) { t.textContent = collapsed ? "▸" : "▾"; });
  }

  /* ------------------------------------------------------------------
     Copy / Download / Upload
     ------------------------------------------------------------------ */

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flashStatus("Copied to clipboard.");
      }, function () { legacyCopy(text); });
    } else {
      legacyCopy(text);
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flashStatus("Copied to clipboard."); }
    catch (e) { flashStatus("Copy failed — select and copy manually."); }
    document.body.removeChild(ta);
  }

  function flashStatus(msg) {
    var prev = statusText.innerHTML;
    var prevClass = statusBar.className;
    statusText.textContent = msg;
    setTimeout(function () {
      statusBar.className = prevClass;
      statusText.innerHTML = prev;
    }, 1400);
  }

  function downloadJSON(text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      editor.value = String(reader.result);
      runValidate();
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------
     Wire up
     ------------------------------------------------------------------ */

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function init() {
    editor.value = SAMPLE;
    updateGutter();

    $("jt-format-btn").addEventListener("click", runFormat);
    $("jt-minify-btn").addEventListener("click", runMinify);
    $("jt-validate-btn").addEventListener("click", runValidate);
    $("jt-autofix-btn").addEventListener("click", runAutoFix);

    $("jt-copy-btn").addEventListener("click", function () { copyToClipboard(editor.value); });
    $("jt-download-btn").addEventListener("click", function () { downloadJSON(editor.value); });
    $("jt-file-input").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
      e.target.value = "";
    });

    $("jt-search-btn").addEventListener("click", runSearch);
    $("jt-search-input").addEventListener("keydown", function (e) { if (e.key === "Enter") runSearch(); });

    $("jt-query-btn").addEventListener("click", runQuery);
    $("jt-query-input").addEventListener("keydown", function (e) { if (e.key === "Enter") runQuery(); });

    $("jt-tree-expand").addEventListener("click", function () { setAllTreeCollapsed(false); });
    $("jt-tree-collapse").addEventListener("click", function () { setAllTreeCollapsed(true); });

    wireTabs("[data-view-tabs] .jt-pill", "data-view", setActiveView);

    var debouncedValidate = debounce(function () {
      updateGutter();
      var analysis = parseAndAnalyze(editor.value);
      describeAnalysis(analysis);
      if (isViewActive("tree")) renderTree();
    }, 350);

    editor.addEventListener("input", debouncedValidate);
    editor.addEventListener("input", function () { updateGutter(); });

    runValidate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
