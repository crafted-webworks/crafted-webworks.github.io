/* ==========================================================================
   Data — centralised JSON loading with caching.
   --------------------------------------------------------------------------
   Every piece of editable content on this site comes through here.

       Site.data.load("services")     → Promise<object>
       Site.data.loadAll(["a","b"])   → Promise<{a, b}>
       Site.data.get("services")      → cached object (sync, after load)

   A file is never requested twice: in-flight promises are shared and results
   are cached for the lifetime of the page.

   The JSON files are the ONLY copy of the content. There is no second bundled
   copy shipped alongside them — that would be the same data stored twice.

   Opening the site from the file system is the one case where a browser blocks
   fetch(). If you need that (handing a client an offline ZIP, say), run
   `node tools/build-bundle.mjs` to generate data/bundle.js; loader.js requests
   it only under the file:// protocol and never over HTTP.
   ========================================================================== */

(function (App) {
  "use strict";

  var cache = {};
  var pending = {};

  /* ------------------------------------------------------------------
     TOKENS — the mechanism that keeps "single source of truth" honest.
     Any string in any data file may reference a global value:

         "url": "mailto:{{site.email}}"
         "value": "{{social.instagram.handle}}"

     So the email address exists in exactly one place (site.json) and every
     other file points at it. Change it once, it changes everywhere.
     Available namespaces: site.*, social.*
     ------------------------------------------------------------------ */
  var TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  var BASE_SOURCES = ["site", "social"];

  function interpolate(node, context) {
    if (typeof node === "string") {
      return node.replace(TOKEN, function (match, path) {
        var value = App.utils.get(context, path, null);
        if (value === null || typeof value === "object") {
          App.log.warn('Unresolved data token "' + match + '"');
          return match;
        }
        return String(value);
      });
    }

    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) node[i] = interpolate(node[i], context);
      return node;
    }

    if (node && typeof node === "object") {
      Object.keys(node).forEach(function (key) {
        node[key] = interpolate(node[key], context);
      });
      return node;
    }

    return node;
  }

  /** site.json and social.json must be resolved before anything can use them. */
  function ensureBase(name) {
    if (name === "site") return Promise.resolve();
    if (name === "social") return load("site");
    return Promise.all(BASE_SOURCES.map(load));
  }

  function resolve(name, payload) {
    cache[name] = payload;
    interpolate(payload, { site: cache.site, social: cache.social });
    return payload;
  }

  /* Logical name → file path, relative to data/. Nested paths are allowed. */
  var SOURCES = {
    site: "site.json",
    seo: "seo.json",
    pages: "pages.json",
    navigation: "navigation.json",
    footer: "footer.json",
    social: "social.json",
    homepage: "homepage.json",
    about: "about.json",
    services: "services.json",
    projects: "projects.json",
    demos: "demos.json",
    resources: "resources.json",
    tools: "tools.json",
    blog: "blog.json",
    faqs: "faqs.json",
    testimonials: "testimonials.json",
    process: "process.json",
    websiteTypes: "website-types.json",
    contact: "contact.json",
    legal: "legal.json",
    contactForm: "forms/contact.json"
  };

  function bundled(name) {
    var bundle = window.SITE_DATA;
    return bundle && Object.prototype.hasOwnProperty.call(bundle, name) ? bundle[name] : null;
  }

  function load(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    if (pending[name]) return pending[name];

    var file = SOURCES[name];
    if (!file) {
      return Promise.reject(new Error('Unknown data source: "' + name + '". Register it in data.js → SOURCES.'));
    }

    var url = App.config.dataPath + file;

    pending[name] = ensureBase(name)
      .then(function () {
        /* On file:// a fetch is guaranteed to fail on CORS grounds. If the
           offline bundle is present, read it directly rather than firing a
           doomed request per data file and filling the console with noise. */
        var offline = location.protocol === "file:" && bundled(name);
        if (offline) return offline;
        return App.ajax.getJSON(url);
      })
      .then(function (payload) {
        delete pending[name];
        resolve(name, payload);
        App.emit("data:loaded", { name: name, data: payload });
        return payload;
      })
      .catch(function (error) {
        delete pending[name];

        var fallback = bundled(name);
        if (fallback) {
          App.log.warn('Using bundled copy of "' + name + '" (fetch failed — probably the file:// protocol).');
          return resolve(name, fallback);
        }

        if (location.protocol === "file:") {
          App.log.error(
            'Cannot read data over the file:// protocol. Serve the folder instead ' +
            '(npx serve .) — or run "node tools/build-bundle.mjs" for offline use.'
          );
        } else {
          App.log.error('Could not load data source "' + name + '" from ' + url, error);
        }
        throw error;
      });

    return pending[name];
  }

  function loadAll(names) {
    return Promise.all(names.map(function (name) {
      /* One missing file must not blank the whole page */
      return load(name).catch(function () { return null; });
    })).then(function (results) {
      var out = {};
      names.forEach(function (name, i) { out[name] = results[i]; });
      return out;
    });
  }

  App.data = {
    cache: cache,
    sources: SOURCES,
    load: load,
    loadAll: loadAll,

    /** Synchronous read of an already-loaded source. */
    get: function (name, path, fallback) {
      var source = cache[name];
      if (!source) return fallback === undefined ? null : fallback;
      return path ? App.utils.get(source, path, fallback) : source;
    },

    /** Register an extra data file at runtime (e.g. for a new page type). */
    register: function (name, file) {
      SOURCES[name] = file;
      return App.data;
    },

    /** Items array from a source that uses the { items: [] } shape. */
    items: function (name) {
      var source = cache[name];
      if (!source) return [];
      return Array.isArray(source) ? source : (source.items || []);
    },

    /** Drop the cache — useful when editing JSON during development. */
    clear: function (name) {
      if (name) delete cache[name];
      else Object.keys(cache).forEach(function (key) { delete cache[key]; });
    }
  };
})(window.Site);
