/* ==========================================================================
   Config — the application namespace and global settings.
   --------------------------------------------------------------------------
   Everything else in the app hangs off this object. Exactly one name is added
   to the global scope: `Site`.

   Note the name is deliberately brand-neutral. Nothing in assets/ or tools/
   mentions the studio name — it lives only in data/site.json,
   so rebranding is a one-line edit, not a find-and-replace across the code.
   ========================================================================== */

window.Site = (function () {
  "use strict";

  var base = window.SITE_BASE || "./";

  var isDev = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname) ||
              location.protocol === "file:" ||
              /[?&]debug=1/.test(location.search);

  var App = {
    /* Version is surfaced in the console banner and cache-busting hooks */
    version: "1.0.0",

    config: {
      base: base,
      dev: isDev,
      dataPath: base + "data/",
      assetPath: base + "assets/",
      /* Sections/components render into these hooks */
      selectors: {
        sections: "[data-sections]",
        section: "[data-section]",
        component: "[data-component]"
      },
      /* Scroll-reveal defaults, overridable per element */
      reveal: {
        threshold: 0.12,
        rootMargin: "0px 0px -8% 0px",
        stagger: 70,
        maxStagger: 420
      },
      request: {
        timeout: 12000,
        retries: 1
      },
      storageKeys: {
        theme: "site:theme"
      }
    },

    /* Namespaces populated by the other modules */
    data: {},
    utils: {},
    ajax: {},
    icons: {},
    components: {},
    sections: {},
    renderer: {},
    filters: {},
    search: {},
    pagination: {},
    forms: {},
    animations: {},
    seo: {},
    a11y: {},
    tools: {},
    pages: {},
    nav: {},

    /* ------------------------------------------------------------------
       Minimal pub/sub so modules can react to each other without importing
       one another (e.g. filters → animations re-scan after a re-render).
       ------------------------------------------------------------------ */
    _events: {},

    on: function (name, fn) {
      (this._events[name] = this._events[name] || []).push(fn);
      return this;
    },

    off: function (name, fn) {
      var list = this._events[name];
      if (!list) return this;
      this._events[name] = list.filter(function (f) { return f !== fn; });
      return this;
    },

    emit: function (name, payload) {
      (this._events[name] || []).forEach(function (fn) {
        try {
          fn(payload);
        } catch (err) {
          App.log.error("Event handler failed for '" + name + "'", err);
        }
      });
      return this;
    },

    /* ------------------------------------------------------------------
       Logging — verbose in development, silent for visitors in production.
       ------------------------------------------------------------------ */
    log: {
      info: function () {
        if (!isDev || !window.console) return;
        console.info.apply(console, ["%c[site]", "color:#2B7FFF;font-weight:600"].concat([].slice.call(arguments)));
      },
      warn: function () {
        if (!isDev || !window.console) return;
        console.warn.apply(console, ["[site]"].concat([].slice.call(arguments)));
      },
      error: function () {
        if (!window.console) return;
        /* Errors are always logged — they are the ones worth seeing */
        console.error.apply(console, ["[site]"].concat([].slice.call(arguments)));
      }
    }
  };


  return App;
})();
