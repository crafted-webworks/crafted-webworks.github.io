/* ==========================================================================
   Renderer — turns data + page config into the actual page.
   --------------------------------------------------------------------------
   Responsibilities:
     1. Build the navbar and footer (one implementation, every page)
     2. Read pages.json for the current page and render its sections in order
     3. Load only the data those sections need
     4. Hand control to the behaviour modules once the DOM exists

   A page's HTML never lists its own sections — pages.json does.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;
  var icon = App.icons.render.bind(App.icons);

  /* ==================================================================
     BRAND MARK — inline SVG so it inherits the palette and never 404s
     ================================================================== */
  function brandMark() {
    var logo = App.data.get("site", "logo", {}) || {};

    if (logo.type === "image" && logo.src) {
      return '<span class="navbar-brand-mark"><img src="' + U.attr(U.url(logo.src)) + '" alt="' +
             U.attr(logo.alt || "") + '" width="32" height="32"></span>';
    }

    return '<span class="navbar-brand-mark">' +
      '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true" width="32" height="32">' +
        "<defs>" +
          '<linearGradient id="brandBlue" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#4C8CFF"/><stop offset="1" stop-color="#0C4FBF"/>' +
          "</linearGradient>" +
          '<linearGradient id="brandOrange" x1="0" y1="1" x2="1" y2="0">' +
            '<stop offset="0" stop-color="#F26F0A"/><stop offset="1" stop-color="#FFAC5C"/>' +
          "</linearGradient>" +
        "</defs>" +
        '<rect x="3.2" y="5.5" width="33.6" height="25" rx="6.5" stroke="url(#brandBlue)" stroke-width="2.3"/>' +
        '<path d="M3.2 12.5h33.6" stroke="url(#brandBlue)" stroke-width="1.5" opacity=".55"/>' +
        '<circle cx="8" cy="9" r="1.15" fill="#FF8A1E"/><circle cx="12" cy="9" r="1.15" fill="#4C8CFF"/>' +
        '<path d="M16.6 18.8 12.4 22.3l4.2 3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="m23.4 18.8 4.2 3.5-4.2 3.5" stroke="url(#brandOrange)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="m21.6 17.6-3.2 10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>' +
        '<path d="M4.5 32.5c8.5 4.8 22.5 4.2 31-2.5" stroke="url(#brandOrange)" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>" +
    "</span>";
  }

  function brandLink(className) {
    var site = App.data.get("site") || {};
    var logo = site.logo || {};
    return '<a class="' + (className || "navbar-brand") + '" href="' + U.attr(U.url("/")) + '" aria-label="' +
             U.attr(site.name + " — home") + '">' +
             brandMark() +
             '<span class="navbar-brand-text">' + U.escape(logo.wordmark || site.name) +
               (logo.wordmarkAccent ? '<span class="accent">' + U.escape(logo.wordmarkAccent) + "</span>" : "") +
             "</span>" +
           "</a>";
  }

  /* ==================================================================
     NAVBAR
     ================================================================== */
  /* ==================================================================
     NAV DROPDOWNS
     Panels are built from the live collections (services.json,
     projects.json, …) rather than a second copy of the links inside
     navigation.json. Add a tool, and it appears in the Tools menu.
     ================================================================== */
  function menuEntry(item, collection) {
    var url = collection === "blog" ? C.postUrl(item) : U.url(item.url);
    var label = item.title || item.label;
    var blurb = item.shortDescription || item.description || item.excerpt || "";

    return '<li><a class="nav-menu-item" href="' + U.attr(url) + '">' +
             (item.icon ? icon(item.icon, "nav-menu-icon") : "") +
             "<span>" +
               '<span class="nav-menu-label">' + U.escape(label) + "</span>" +
               (blurb ? '<span class="nav-menu-blurb">' + U.escape(U.truncate(blurb, 62)) + "</span>" : "") +
             "</span>" +
           "</a></li>";
  }

  function menuPanel(entry) {
    var config = entry.menu;
    var source = App.data.get(config.source);
    if (!source) return "";

    var items = U.activeSorted(source.items || []).slice(0, config.limit || 8);
    if (!items.length) return "";

    var body = "";

    if (config.layout === "grouped") {
      /* Column per category, labels straight from the collection's own
         `categories` list so a new category needs no code change. */
      var groups = U.groupBy(items, config.groupBy || "category");
      var categories = (source.categories || []).filter(function (cat) { return groups[cat.id]; });

      body = '<div class="nav-menu-groups" style="--menu-cols:' + (config.columns || 3) + '">' +
        categories.map(function (cat) {
          return '<div class="nav-menu-group">' +
                   '<span class="nav-menu-group-title">' + U.escape(cat.label) + "</span>" +
                   "<ul>" + groups[cat.id].map(function (item) {
                     return menuEntry(item, config.source);
                   }).join("") + "</ul>" +
                 "</div>";
        }).join("") + "</div>";

    } else if (config.layout === "feature") {
      /* Lead item gets its generated artwork; the rest form a list. */
      var lead = items[0];
      body = '<div class="nav-menu-feature">' +
               '<a class="nav-menu-featured" href="' + U.attr(U.url(lead.url)) + '">' +
                 '<span class="nav-menu-featured-media">' + C.media(lead, lead.title) + "</span>" +
                 '<span class="nav-menu-label">' + U.escape(lead.title) + "</span>" +
                 '<span class="nav-menu-blurb">' + U.escape(U.truncate(lead.shortDescription || "", 70)) + "</span>" +
               "</a>" +
               "<ul>" + items.slice(1).map(function (item) {
                 return menuEntry(item, config.source);
               }).join("") + "</ul>" +
             "</div>";

    } else {
      body = '<ul class="nav-menu-columns" style="--menu-cols:' + (config.columns || 2) + '">' +
               items.map(function (item) { return menuEntry(item, config.source); }).join("") +
             "</ul>";
    }

    return '<div class="nav-menu" data-nav-menu>' +
             '<div class="nav-menu-inner">' +
               (config.description
                 ? '<p class="nav-menu-intro">' + U.escape(config.description) + "</p>"
                 : "") +
               body +
               (config.footer
                 ? '<a class="nav-menu-footer" href="' + U.attr(U.url(config.footer.url)) + '">' +
                     U.escape(config.footer.label) + icon("arrow-right") + "</a>"
                 : "") +
             "</div>" +
           "</div>";
  }

  function buildNavbar(context) {
    var nav = App.data.get("navigation") || {};
    var site = App.data.get("site") || {};
    var isHome = context.pageId === "home";
    var onHomeSections = U.get(nav, "settings.sectionLinksOnHome", true);

    function navItems(options) {
      var opts = options || {};

      return (nav.primary || []).map(function (item) {
        var useAnchor = isHome && onHomeSections && item.section;
        var href = useAnchor ? "#" + item.section : U.url(item.url);
        var active = useAnchor
          ? item.section === "hero"
          : U.isCurrentPage(item.url) || context.pageId === item.id;

        /* Dropdowns are a desktop affordance; the drawer lists the same
           destinations inline instead, so nothing is unreachable on touch. */
        var panel = (item.menu && !opts.flat) ? menuPanel(item) : "";

        return '<li' + (panel ? ' class="nav-item nav-item--menu"' : ' class="nav-item"') + ">" +
                 '<a class="nav-link' + (opts.extraClass || "") + (active ? " is-active" : "") +
                   '" href="' + U.attr(href) + '"' +
                   (useAnchor ? ' data-scroll-to="' + U.attr(item.section) + '"' : "") +
                   (panel ? ' aria-haspopup="true" aria-expanded="false"' : "") +
                   (active ? ' aria-current="page"' : "") + ">" +
                   U.escape(item.label) +
                   (panel ? icon("chevron-down", "nav-link-caret") : "") +
                 "</a>" +
                 panel +
               "</li>";
      }).join("");
    }

    var themeToggle = U.get(site, "features.themeToggle", true)
      ? '<button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch colour theme">' +
          icon("moon", "icon-moon") + icon("sun", "icon-sun") +
        "</button>"
      : "";

    var ctaButton = nav.cta
      ? C.button({ label: nav.cta.label, url: nav.cta.url, icon: nav.cta.icon, variant: "btn-primary", size: "btn-sm", className: "btn-cta" })
      : "";

    return '<header class="site-header" data-navbar>' +
             '<div class="container-wide">' +
               '<nav class="navbar" aria-label="Primary">' +
                 brandLink() +
                 '<ul class="navbar-nav">' + navItems() + "</ul>" +
                 '<div class="navbar-actions">' +
                   themeToggle +
                   ctaButton +
                   '<button type="button" class="navbar-toggle" data-nav-toggle aria-expanded="false"' +
                     ' aria-controls="nav-drawer" aria-label="Open menu">' +
                     '<span class="navbar-toggle-bars"></span>' +
                   "</button>" +
                 "</div>" +
               "</nav>" +
             "</div>" +
             '<span class="scroll-progress" data-scroll-progress aria-hidden="true"></span>' +
           "</header>" +

           '<div class="nav-backdrop" data-nav-backdrop hidden></div>' +

           '<div class="nav-drawer" id="nav-drawer" data-nav-drawer role="dialog" aria-modal="true"' +
             ' aria-label="Site menu" tabindex="-1">' +
             '<div class="nav-drawer-head">' +
               brandLink("navbar-brand") +
               '<button type="button" class="ui-modal-close" data-nav-close aria-label="Close menu">' + icon("x") + "</button>" +
             "</div>" +
             '<ul class="nav-drawer-nav">' + navItems({ flat: true }) + "</ul>" +
             '<div class="nav-drawer-footer">' +
               (nav.cta ? C.button({ label: nav.cta.label, url: nav.cta.url, icon: "arrow-right", variant: "btn-gradient", className: "btn-block" }) : "") +
               socialLinks() +
             "</div>" +
           "</div>";
  }

  /* ==================================================================
     SOCIAL LINKS (shared by drawer + footer)
     ================================================================== */
  function socialLinks() {
    var social = App.data.get("social") || {};
    var links = Object.keys(social)
      .filter(function (key) { return social[key] && social[key].enabled && social[key].url; })
      .map(function (key) {
        var item = social[key];
        return '<a class="social-link" href="' + U.attr(item.url) + '"' + U.linkAttrs(item.url) +
               ' aria-label="' + U.attr(item.label) + '" title="' + U.attr(item.label) + '">' +
               icon(item.icon || key) + "</a>";
      }).join("");

    return links ? '<div class="social-links">' + links + "</div>" : "";
  }

  /* ==================================================================
     FOOTER
     ================================================================== */
  function buildFooter() {
    var footer = App.data.get("footer") || {};
    var site = App.data.get("site") || {};
    var about = footer.about || {};
    var bottom = footer.bottom || {};

    var columns = (footer.columns || []).map(function (column) {
      return '<div class="footer-col footer-col--' + U.attr(column.id) + '">' +
               '<h2 class="footer-col-title">' + U.escape(column.title) + "</h2>" +
               '<ul class="footer-links">' +
                 (column.links || []).map(function (link) {
                   return '<li><a href="' + U.attr(U.url(link.url)) + '"' + U.linkAttrs(link.url) + ">" +
                          U.escape(link.label) + "</a></li>";
                 }).join("") +
               "</ul>" +
             "</div>";
    }).join("");

    var cta = footer.cta && footer.cta.enabled
      ? '<div class="footer-cta">' +
          "<div>" +
            '<h2 class="footer-cta-title">' + U.escape(footer.cta.title) + "</h2>" +
            '<p class="footer-cta-text">' + U.escape(footer.cta.description) + "</p>" +
          "</div>" +
          C.button(Object.assign({ variant: "btn-accent", icon: "arrow-right" }, footer.cta.button)) +
        "</div>"
      : "";

    var bottomLinks = (bottom.links || []).map(function (link) {
      return '<a href="' + U.attr(U.url(link.url)) + '">' + U.escape(link.label) + "</a>";
    }).join("");

    return '<footer class="site-footer">' +
             '<div class="container section section--sm">' +
               cta +
               '<div class="footer-grid">' +
                 '<div class="footer-brand">' +
                   brandLink("navbar-brand") +
                   '<p class="footer-brand-text">' + U.escape(about.description || site.description) + "</p>" +
                   '<div class="cluster cluster--sm">' +
                     (about.badges || []).map(function (b) { return C.badge(b); }).join("") +
                   "</div>" +
                   socialLinks() +
                 "</div>" +
                 columns +
               "</div>" +
               '<div class="footer-bottom">' +
                 "<span>© " + U.escape(site.copyrightYear || new Date().getFullYear()) + " " +
                   U.escape(site.copyrightHolder || site.name) + ". " + U.escape(bottom.copyright || "") + "</span>" +
                 '<div class="footer-bottom-links">' + bottomLinks + "</div>" +
               "</div>" +
             "</div>" +
           "</footer>";
  }

  /* ==================================================================
     COMPONENT REGISTRY — [data-component="x"] mount points
     ================================================================== */
  var COMPONENTS = {
    /* The menu sources are listed because the dropdowns render from the live
       collections. They are small, cached after the first page, and shared
       with the sections that need them anyway. */
    navbar: {
      needs: ["navigation", "site", "social", "services", "projects", "demos", "resources", "tools"],
      build: buildNavbar
    },
    footer: { needs: ["footer", "site", "social"], build: buildFooter }
  };

  /* ==================================================================
     SECTION SPEC NORMALISATION
     pages.json accepts "hero" or { "id": "projects", "options": {…} }
     ================================================================== */
  function normalizeSpec(entry) {
    if (typeof entry === "string") return { id: entry, options: {} };
    if (entry && entry.id) return { id: entry.id, options: entry.options || {} };
    return null;
  }

  function collectNeeds(specs) {
    var needs = [];
    specs.forEach(function (spec) {
      var definition = App.sections.get(spec.id);
      if (!definition) return;
      (definition.needs || []).forEach(function (need) {
        if (needs.indexOf(need) === -1) needs.push(need);
      });
    });
    return needs;
  }

  /* ==================================================================
     RENDER PIPELINE
     ================================================================== */
  function renderComponents(context) {
    var mounts = U.$$(App.config.selectors.component);
    var needs = [];

    mounts.forEach(function (el) {
      var definition = COMPONENTS[el.getAttribute("data-component")];
      if (definition) {
        definition.needs.forEach(function (n) { if (needs.indexOf(n) === -1) needs.push(n); });
      }
    });

    return App.data.loadAll(needs).then(function () {
      mounts.forEach(function (el) {
        var name = el.getAttribute("data-component");
        var definition = COMPONENTS[name];
        if (!definition) {
          App.log.warn('No component registered for "' + name + '"');
          return;
        }
        try {
          el.outerHTML = definition.build(context);
        } catch (error) {
          App.log.error('Component "' + name + '" failed to render', error);
        }
      });
    });
  }

  function renderSections(context) {
    var host = U.$(App.config.selectors.sections);
    if (!host) return Promise.resolve();

    var page = context.page || {};
    var specs = (page.sections || []).map(normalizeSpec).filter(Boolean);

    if (!specs.length) {
      App.log.warn('Page "' + context.pageId + '" has no sections in pages.json.');
      return Promise.resolve();
    }

    host.innerHTML = C.loadingState(3);

    return App.data.loadAll(collectNeeds(specs)).then(function () {
      var html = "";
      var rendered = [];

      specs.forEach(function (spec) {
        var definition = App.sections.get(spec.id);
        if (!definition) {
          App.log.warn('Unknown section "' + spec.id + '" (pages.json → ' + context.pageId + ')');
          return;
        }
        try {
          html += definition.render(spec.options, context);
          rendered.push(spec);
        } catch (error) {
          App.log.error('Section "' + spec.id + '" failed to render', error);
          html += C.errorState({ title: "This section could not load" });
        }
      });

      host.innerHTML = html;

      /* Mount phase — runs after the DOM exists so handlers can query it */
      rendered.forEach(function (spec) {
        var definition = App.sections.get(spec.id);
        if (!definition || typeof definition.mount !== "function") return;
        var el = host.querySelector("#" + CSS.escape(spec.id)) ||
                 host.querySelector('[data-section-id="' + spec.id + '"]');
        if (!el) return;
        try {
          definition.mount(el, spec.options, context);
        } catch (error) {
          App.log.error('Section "' + spec.id + '" failed to mount', error);
        }
      });

      App.emit("content:rendered", { root: host });
    });
  }

  App.renderer = {
    brandMark: brandMark,
    brandLink: brandLink,
    socialLinks: socialLinks,
    buildNavbar: buildNavbar,
    buildFooter: buildFooter,
    components: COMPONENTS,

    /** Register an extra [data-component] mount type. */
    registerComponent: function (name, definition) {
      COMPONENTS[name] = definition;
      return App.renderer;
    },

    renderComponents: renderComponents,
    renderSections: renderSections
  };
})(window.Site);
