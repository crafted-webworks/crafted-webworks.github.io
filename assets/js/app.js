/* ==========================================================================
   App — the single entry point.
   --------------------------------------------------------------------------
   Boot order:
       icons → core data → navbar/footer → SEO → sections → behaviour

   Everything after the data step is driven by pages.json, so adding a page
   means adding an HTML shell and a pages.json entry — nothing here changes.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;

  var CORE_DATA = ["site", "pages", "navigation", "footer", "social", "seo"];

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function pageId() {
    return document.body.getAttribute("data-page") || "home";
  }

  function fatal(error) {
    App.log.error("Boot failed", error);

    var host = U.$(App.config.selectors.sections) || U.$("main") || document.body;
    host.innerHTML =
      '<section class="section"><div class="container">' +
        App.components.errorState({
          title: "This page could not load",
          text: App.config.dev
            ? "Data files could not be read. If you opened this from the file system, run it through a local web server — see the README."
            : "Please refresh the page. If the problem continues, get in touch and we'll sort it out."
        }) +
      "</div></section>";
  }

  function boot() {
    var id = pageId();
    var context = { pageId: id, page: null, post: null };

    App.icons.init();

    App.data.loadAll(CORE_DATA.concat(App.pages.requires(id)))
      .then(function () {
        /* loadAll() tolerates individual failures so one bad file can't blank
           the page — but without site.json and pages.json there is nothing to
           render, and a silent empty <main> is the worst possible outcome. */
        if (!App.data.get("site") || !App.data.get("pages")) {
          throw new Error("Core data (site.json / pages.json) could not be read.");
        }

        var pages = App.data.get("pages") || {};
        var page = pages[id];

        if (!page) {
          App.log.warn('No entry for "' + id + '" in pages.json — falling back to home.');
          page = pages.home;
        }

        context.page = App.pages.configure(id, page, context);

        return App.renderer.renderComponents(context);
      })
      .then(function () {
        App.nav.init();
        App.a11y.init();
        App.seo.apply(context);
        return App.renderer.renderSections(context);
      })
      .then(function () {
        App.animations.init();
        App.nav.initAfterContent();
        App.pages.init(context);

        document.documentElement.classList.add("is-loaded");
        App.emit("app:ready", context);

        App.log.info(App.data.get("site", "name", "Site") + " v" + App.version + " · page: " + id);
      })
      .catch(fatal);
  }

  ready(boot);
})(window.Site);
