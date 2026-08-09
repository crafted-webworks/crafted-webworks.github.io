/* ==========================================================================
   Script loader
   --------------------------------------------------------------------------
   Every page includes exactly one script tag:

       <script src="assets/js/loader.js" defer></script>

   This file works out where the site root is (from its own URL, so pages in
   sub-folders need no path changes), then injects the vendor libraries and
   application modules in a guaranteed execution order.

   Adding a module = one line in MODULES. No HTML changes anywhere.
   ========================================================================== */

(function () {
  "use strict";

  var self = document.currentScript;
  var src = (self && self.src) || "";

  /* Site root, derived from this file's own location. Works from /index.html,
     /pages/*.html, /pages/tools/*.html or any depth, on any host or file://. */
  var base = src.replace(/assets\/js\/loader\.js(\?.*)?$/, "");
  if (!base) base = "./";

  window.SITE_BASE = base;

  /* ------------------------------------------------------------------
     Vendor libraries (CDN). Order matters — jQuery before Bootstrap.
     To self-host, drop the files in assets/vendor/ and swap the URLs.
     Note: Subresource Integrity hashes are intentionally omitted; add
     them from the CDN provider's site if you pin exact versions.
     ------------------------------------------------------------------ */
  var VENDORS = [
    "https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js",
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
    /* Motion One — the framework-agnostic animation engine by the author of
       Framer Motion. Framer Motion itself is React-only; this is the same
       spring/stagger model in ~5KB of vanilla JS. Exposes window.Motion.
       The site degrades to instant, fully-visible content if it fails. */
    "https://cdn.jsdelivr.net/npm/motion@10.18.0/dist/motion.min.js"
  ];

  /* ------------------------------------------------------------------
     Application modules, in dependency order.
     ------------------------------------------------------------------ */
  var MODULES = [
    "config.js",        /* namespace, settings, tiny event bus              */
    "utilities.js",     /* escaping, urls, dates, dom helpers               */
    "ajax.js",          /* one request helper for the whole site           */
    "data.js",          /* JSON loading + cache                             */
    "icons.js",         /* SVG sprite registry                              */
    "components.js",    /* reusable UI builders (cards, states, mockups)    */
    "sections.js",      /* section renderers, keyed by id                   */
    "renderer.js",      /* mounts components + sections into the page       */
    "navigation.js",    /* navbar, drawer, scrollspy, smooth scroll         */
    "search.js",        /* client-side matching                             */
    "pagination.js",    /* reusable pagination                              */
    "filters.js",       /* filter + search + pagination controller          */
    "forms.js",         /* validation + AJAX submission                     */
    "animations.js",    /* scroll reveal, counters, meters                  */
    "seo.js",           /* meta tags + structured data                      */
    "accessibility.js", /* focus management, motion preference              */
    "tools.js",         /* the general-tools mini apps                      */
    "pages.js",         /* per-page initialisation                          */
    "app.js"            /* bootstrap                                        */
  ];

  function inject(url) {
    var s = document.createElement("script");
    s.src = url;
    /* async=false keeps dynamically inserted scripts in insertion order */
    s.async = false;
    s.defer = true;
    if (url.indexOf("//") === 0 || url.indexOf("http") === 0) {
      s.crossOrigin = "anonymous";
    }
    s.onerror = function () {
      window.console && console.error("[site] Failed to load script:", url);
    };
    document.head.appendChild(s);
  }

  VENDORS.forEach(inject);

  /* Offline fallback, loaded ONLY from the file system.
     Served over HTTP the site reads data/*.json directly, so the bundle would
     be a duplicate copy of every data file downloaded and never used. It is
     requested here only when there is no other way to read the data.
     Generate it with: node tools/build-bundle.mjs */
  if (location.protocol === "file:") {
    inject(base + "data/bundle.js");
  }

  MODULES.forEach(function (file) {
    inject(base + "assets/js/" + file);
  });
})();
