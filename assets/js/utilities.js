/* ==========================================================================
   Utilities — small, dependency-free helpers used across every module.
   ========================================================================== */

(function (App) {
  "use strict";

  var ALLOWED_INLINE = ["em", "strong", "b", "i", "br", "small", "span", "mark"];

  var U = {

    /* ==================================================================
       STRINGS & SAFETY
       ================================================================== */

    /** Escape every HTML-significant character. Use for all untrusted text. */
    escape: function (value) {
      if (value === null || value === undefined) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    /**
     * Escape content, then re-enable a small allowlist of inline tags.
     * Content headings in the JSON use <em> as the brand highlight, so this
     * lets authors keep that without opening the door to arbitrary markup.
     */
    richText: function (value) {
      if (value === null || value === undefined) return "";
      var escaped = U.escape(value);
      ALLOWED_INLINE.forEach(function (tag) {
        var open = new RegExp("&lt;" + tag + "&gt;", "gi");
        var close = new RegExp("&lt;\\/" + tag + "&gt;", "gi");
        var selfClosing = new RegExp("&lt;" + tag + "\\s*\\/?&gt;", "gi");
        escaped = escaped.replace(open, "<" + tag + ">")
                         .replace(close, "</" + tag + ">")
                         .replace(selfClosing, "<" + tag + ">");
      });
      return escaped;
    },

    /** Escape a value for use inside an HTML attribute. */
    attr: function (value) {
      return U.escape(value);
    },

    slugify: function (value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") /* strip diacritics */
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    },

    /** "Jane Doe" → "JD" — used for generated avatars. */
    initials: function (name, max) {
      var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      return parts.slice(0, max || 2).map(function (p) {
        return p.charAt(0).toUpperCase();
      }).join("") || "?";
    },

    truncate: function (value, length) {
      var str = String(value || "");
      if (str.length <= length) return str;
      return str.slice(0, length).replace(/\s+\S*$/, "") + "…";
    },

    titleCase: function (value) {
      return String(value || "").replace(/\w\S*/g, function (t) {
        return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      });
    },

    /* ==================================================================
       URLS
       ================================================================== */

    /**
     * Resolve a data-file URL against the site root.
     * JSON stores root-relative paths ("/pages/about.html"); this makes them
     * work from any folder depth, any host, and from file:// too.
     */
    url: function (path) {
      if (path === null || path === undefined || path === "") return "#";
      var value = String(path);

      if (/^(https?:)?\/\//i.test(value)) return value;
      if (/^(mailto:|tel:|#|data:|javascript:)/i.test(value)) return value;

      var base = App.config.base;
      if (value === "/") return base + "index.html";
      if (value.charAt(0) === "/") return base + value.slice(1);
      return base + value;
    },

    isExternal: function (url) {
      return /^(https?:)?\/\//i.test(String(url || "")) &&
             String(url).indexOf(location.host) === -1;
    },

    /** Attributes for a link, adding rel/target only when it leaves the site. */
    linkAttrs: function (url) {
      return U.isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
    },

    /** Compares a nav url with the current location. */
    isCurrentPage: function (url) {
      if (!url) return false;
      var resolved = U.url(url);
      var current = location.pathname.replace(/\/index\.html$/, "/");
      var target = resolved.split("#")[0].split("?")[0];
      try {
        target = new URL(target, location.href).pathname.replace(/\/index\.html$/, "/");
      } catch (err) { /* file:// edge cases — fall through */ }
      return target === current;
    },

    query: function (key) {
      var params = new URLSearchParams(location.search);
      return key ? params.get(key) : params;
    },

    setQuery: function (key, value, replace) {
      var params = new URLSearchParams(location.search);
      if (value === null || value === undefined || value === "") params.delete(key);
      else params.set(key, value);
      var qs = params.toString();
      var url = location.pathname + (qs ? "?" + qs : "") + location.hash;
      history[replace ? "replaceState" : "pushState"]({}, "", url);
    },

    /* ==================================================================
       NUMBERS & DATES
       ================================================================== */

    formatNumber: function (value) {
      var n = Number(value);
      return isNaN(n) ? "0" : n.toLocaleString(U.locale());
    },

    locale: function () {
      var site = App.data.cache && App.data.cache.site;
      return (site && site.defaults && site.defaults.locale) || "en-IN";
    },

    formatDate: function (value, style) {
      if (!value) return "";
      var date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return String(value);
      var options = style === "short"
        ? { year: "numeric", month: "short", day: "numeric" }
        : { year: "numeric", month: "long", day: "numeric" };
      try {
        return date.toLocaleDateString(U.locale(), options);
      } catch (err) {
        return date.toDateString();
      }
    },

    isoDate: function (value) {
      var date = value instanceof Date ? value : new Date(value);
      return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    },

    clamp: function (value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    /* ==================================================================
       COLLECTIONS
       ================================================================== */

    /** Items flagged active (or with no `active` key), sorted by `order`. */
    activeSorted: function (items) {
      return (items || [])
        .filter(function (item) { return item && item.active !== false && item.published !== false; })
        .slice()
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },

    featured: function (items, limit) {
      var list = U.activeSorted(items);
      var picked = list.filter(function (item) { return item.featured; });
      /* Fall back to the first N so a section is never empty just because
         nobody set `featured` in the JSON. */
      if (picked.length < (limit || 0)) {
        list.forEach(function (item) {
          if (picked.indexOf(item) === -1 && picked.length < limit) picked.push(item);
        });
      }
      return limit ? picked.slice(0, limit) : picked;
    },

    unique: function (values) {
      return values.filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
    },

    groupBy: function (items, key) {
      return (items || []).reduce(function (acc, item) {
        var group = typeof key === "function" ? key(item) : item[key];
        (acc[group] = acc[group] || []).push(item);
        return acc;
      }, {});
    },

    /** Safe deep read: get(obj, "a.b.c", fallback) */
    get: function (object, path, fallback) {
      var value = String(path).split(".").reduce(function (acc, key) {
        return acc === null || acc === undefined ? acc : acc[key];
      }, object);
      return value === undefined || value === null ? fallback : value;
    },

    /* ==================================================================
       TIMING
       ================================================================== */

    debounce: function (fn, wait) {
      var timer;
      return function () {
        var context = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(context, args); }, wait || 200);
      };
    },

    throttle: function (fn, limit) {
      var waiting = false, lastArgs = null;
      return function () {
        var context = this;
        if (waiting) { lastArgs = arguments; return; }
        fn.apply(context, arguments);
        waiting = true;
        setTimeout(function () {
          waiting = false;
          if (lastArgs) { fn.apply(context, lastArgs); lastArgs = null; }
        }, limit || 120);
      };
    },

    /** rAF-batched callback — for scroll handlers */
    onFrame: function (fn) {
      var scheduled = false;
      return function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
          scheduled = false;
          fn();
        });
      };
    },

    /* ==================================================================
       DOM
       ================================================================== */

    $: function (selector, scope) {
      return (scope || document).querySelector(selector);
    },

    $$: function (selector, scope) {
      return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    },

    /** Build an element from an HTML string (first root node). */
    fromHTML: function (html) {
      var template = document.createElement("template");
      template.innerHTML = String(html).trim();
      return template.content.firstElementChild;
    },

    prefersReducedMotion: function () {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    scrollTo: function (target, offset) {
      var el = typeof target === "string" ? document.querySelector(target) : target;
      if (!el) return false;
      var navHeight = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue("--navbar-height"), 10) || 72;
      var top = el.getBoundingClientRect().top + window.pageYOffset - navHeight - (offset || 12);
      window.scrollTo({
        top: top,
        behavior: U.prefersReducedMotion() ? "auto" : "smooth"
      });
      return true;
    },

    copy: function (text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      /* Fallback for http:// and older browsers */
      return new Promise(function (resolve, reject) {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          document.body.removeChild(area);
        }
      });
    },

    /**
     * Loads a script once, on demand, and resolves when it is ready.
     * Used for the one or two things not worth hand-rolling (QR encoding),
     * so the cost lands only on the visitor who opens that specific tool
     * rather than on every page load.
     */
    loadScript: function (src) {
      U._scripts = U._scripts || {};
      if (U._scripts[src]) return U._scripts[src];

      U._scripts[src] = new Promise(function (resolve, reject) {
        var el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.crossOrigin = "anonymous";
        el.onload = function () { resolve(); };
        el.onerror = function () {
          delete U._scripts[src];
          reject(new Error("Could not load " + src));
        };
        document.head.appendChild(el);
      });

      return U._scripts[src];
    },

    /** Triggers a download of a Blob without leaking the object URL. */
    download: function (blob, filename) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    /** 1048576 → "1 MB" */
    formatBytes: function (bytes) {
      if (!bytes) return "0 B";
      var units = ["B", "KB", "MB"];
      var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      var value = bytes / Math.pow(1024, i);
      return (i === 0 ? Math.round(value) : value.toFixed(value < 10 ? 1 : 0)) + " " + units[i];
    },

    /* ==================================================================
       STORAGE (never throws — private mode, blocked storage, etc.)
       ================================================================== */

    storage: {
      get: function (key, fallback) {
        try {
          var value = localStorage.getItem(key);
          return value === null ? fallback : value;
        } catch (err) { return fallback; }
      },
      set: function (key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (err) { return false; }
      },
      remove: function (key) {
        try { localStorage.removeItem(key); return true; }
        catch (err) { return false; }
      }
    }
  };

  App.utils = U;
})(window.Site);
