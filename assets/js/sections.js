/* ==========================================================================
   Sections — one renderer per page section, keyed by id.
   --------------------------------------------------------------------------
   pages.json decides which sections appear on a page and in what order, so
   HTML files contain a single mount point and nothing else:

       <main id="main" data-sections></main>

   Each entry declares:
     needs   — data sources to load before rendering
     render  — (options) => HTML string
     mount   — (element, options) => void   [optional post-render wiring]
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;
  var icon = App.icons.render.bind(App.icons);

  /* ------------------------------------------------------------------
     Shared helper: a data-driven collection section with optional
     filters, search and pagination. Used by services, projects, demos,
     resources, tools and blog — one implementation, six sections.
     ------------------------------------------------------------------ */
  function collectionSection(spec) {

    /* pages.json options win; homepage.json's section intro supplies the
       defaults. Both render() and mount() resolve them the same way, so the
       toolbar can never appear without the controls that belong in it. */
    function resolve(options) {
      var opts = options || {};
      var intro = App.data.get("homepage", spec.introKey, {}) || {};
      return {
        intro: intro,
        mode: opts.mode || intro.mode || "featured",
        limit: opts.limit || intro.limit || 6,
        showHeader: opts.showHeader !== false,
        filters: opts.filters !== undefined ? opts.filters : !!intro.filters,
        search: opts.search !== undefined ? opts.search : !!intro.search,
        pagination: !!opts.pagination,
        perPage: opts.perPage
      };
    }

    return {
      needs: spec.needs || [spec.source, "homepage"],

      render: function (options) {
        var opts = resolve(options);
        var intro = opts.intro;
        var showHeader = opts.showHeader;
        var showFilters = opts.filters;
        var showSearch = opts.search;

        var header = showHeader ? C.sectionHeader({
          eyebrow: intro.eyebrow,
          title: intro.title,
          description: intro.description,
          link: opts.mode === "all" ? null : intro.link,
          align: spec.headerAlign
        }) : "";

        var toolbar = (showFilters || showSearch)
          ? '<div class="toolbar" data-reveal="up">' +
              (showFilters ? '<div class="filter-group" role="group" aria-label="Filter ' + U.attr(spec.label) + '" data-collection-filters></div>' : "<span></span>") +
              (showSearch ?
                '<div class="search-field">' + icon("search") +
                  '<label class="visually-hidden" for="search-' + spec.id + '">Search ' + U.escape(spec.label) + "</label>" +
                  '<input type="search" id="search-' + spec.id + '" class="form-control" placeholder="Search ' + U.attr(spec.label) + '…" data-collection-search>' +
                  '<button type="button" class="search-clear" aria-label="Clear search">' + icon("x") + "</button>" +
                "</div>" : "") +
            "</div>"
          : "";

        return section({
          id: spec.id,
          className: spec.sectionClass,
          content:
            header +
            toolbar +
            '<div class="grid ' + (spec.gridClass || "grid--auto-lg") + '" data-collection-grid>' +
              C.loadingState(opts.limit || 6) +
            "</div>" +
            '<div data-collection-pagination></div>' +
            (spec.footer ? spec.footer(opts) : "")
        });
      },

      mount: function (el, options) {
        var opts = resolve(options);
        var source = App.data.get(spec.source) || {};
        var all = U.activeSorted(source.items || []);
        var items = opts.mode === "all" ? all : U.featured(all, opts.limit);

        App.filters.create({
          root: el,
          items: items,
          collection: spec.source,
          categories: source.categories || [],
          categoryOf: spec.categoryOf || function (item) { return item.category; },
          cardFn: spec.cardFn,
          searchFields: spec.searchFields || ["title", "description", "shortDescription", "tags"],
          filters: opts.filters,
          search: opts.search,
          pagination: opts.pagination,
          /* Only full listing pages get linkable filter state in the URL */
          urlSync: opts.mode === "all",
          label: spec.label,
          perPage: opts.perPage || U.get(source, "settings.itemsPerPage", 9),
          empty: spec.empty || { title: "Nothing found", text: "Try a different filter or search term." }
        });

        if (typeof spec.afterMount === "function") spec.afterMount(el, opts);
      }
    };
  }

  /** Wraps content in a <section> with consistent spacing hooks. */
  function section(config) {
    var classes = ["section"];
    if (config.className) classes.push(config.className);
    return '<section class="' + classes.join(" ") + '" id="' + U.attr(config.id) + '"' +
             (config.label ? ' aria-labelledby="' + U.attr(config.id) + '-title"' : "") + ">" +
             (config.decor || "") +
             '<div class="' + (config.container || "container") + '">' + config.content + "</div>" +
           "</section>";
  }

  /* ==================================================================
     HERO
     ================================================================== */
  var hero = {
    needs: ["homepage", "site"],

    render: function () {
      var data = App.data.get("homepage", "hero", {});
      var visual = data.visual || {};

      var code = (visual.codeLines || []).map(function (line) {
        var indent = "  ".repeat(line.indent || 0);
        var tokens = (line.tokens || []).map(function (t) {
          return '<span class="tok-' + U.attr(t.t) + '">' + U.escape(t.v) + "</span>";
        }).join("");
        return '<span class="ln">' + U.escape(indent) + tokens + "</span>";
      }).join("");

      /* Metadata cards that sit over the video panel. They animate in from the
         right on entry (data-reveal drives the existing Motion pipeline), and
         they are decorative labels rather than controls — so they carry no
         links and stay out of the tab order. */
      var cards = (visual.floatingCards || []).map(function (card, index) {
        return '<div class="hero-card hero-card--' + (index + 1) + '" data-reveal="left" aria-hidden="true">' +
                 App.icons.tile(card.icon, "icon-tile--sm icon-tile--accent") +
                 "<div>" +
                   '<span class="hero-card-label">' + U.escape(card.label) + "</span>" +
                   '<span class="hero-card-value">' + U.escape(card.value) + "</span>" +
                 "</div>" +
               "</div>";
      }).join("");

      var trust = (data.trustLine || []).map(function (item) {
        return '<span class="hero-trust-item">' + icon("check") + U.escape(item) + "</span>";
      }).join("");

      var stats = (visual.stats || []).map(C.stat).join("");

      var background = data.background || {};
      var hasVideo = background.type === "video" && background.src;

      /* Set hero.visual.type to "none" in homepage.json to drop the code
         window and let the background video hold the frame on its own. */
      var showVisual = visual.type !== "none" && !!code;

      /* Full-bleed cinematic backdrop. The video is decorative, so it is
         hidden from assistive tech and taken out of the tab order; the overlay
         above it carries the contrast the hero text needs. */
      var backdrop = hasVideo
        ? '<video class="hero-video" playsinline muted loop autoplay preload="metadata"' +
            ' aria-hidden="true" tabindex="-1" disablepictureinpicture' +
            (background.poster ? ' poster="' + U.attr(U.url(background.poster)) + '"' : "") +
            ' style="object-position:' + U.attr(background.objectPosition || "center") + '"' +
            (background.respectSaveData ? ' data-respect-save-data="true"' : "") + ">" +
            '<source src="' + U.attr(U.url(background.src)) + '" type="video/mp4">' +
          "</video>" +
          '<span class="hero-video-overlay"></span>'
        : "";

      /* ------------------------------------------------------------------
         CINEMATIC COMPOSITION
         Not the standard hero (eyebrow pill · headline left · two buttons ·
         mockup right) that every product site ships. Instead: the video holds
         the full viewport, oversized type runs across it, the supporting copy
         and actions are offset into the lower-right, and every piece of
         metadata collapses into one rail pinned to the bottom edge — the way
         a title card is composed rather than a landing page.
         ------------------------------------------------------------------ */
      /* hero--split drives the hard vertical seam: type on solid ink, video
         full-height beside it. Every card position and the seam itself hang
         off this class, so losing it silently collapses the layout. */
      return '<section class="section hero hero--cinematic' +
               (hasVideo ? " hero--video hero--center" : "") +
               (showVisual ? "" : " hero--single") + '" id="hero">' +
               '<div class="hero-bg" aria-hidden="true">' + backdrop + "</div>" +
               (hasVideo && cards ? '<div class="hero-cards">' + cards + "</div>" : "") +

               '<div class="container-wide hero-shell">' +
                 '<div class="hero-inner">' +

                   '<p class="hero-eyebrow">' +
                     "<span>" + U.escape(data.eyebrow || "") + "</span>" +
                   "</p>" +

                   /* The space keeps the accessible name readable; the line
                      break is purely visual. */
                   '<h1 class="hero-title">' +
                     "<span>" + U.richText(data.title) + "</span> " +
                     "<span><em>" + U.escape(data.highlight || "") + "</em></span>" +
                   "</h1>" +

                   '<div class="hero-aside">' +
                     '<p class="hero-description">' + U.richText(data.description) + "</p>" +
                     '<div class="hero-actions">' +
                       C.button(Object.assign({ variant: "btn-gradient", size: "btn-lg" }, data.primaryButton)) +
                       C.button(Object.assign({ variant: "btn-secondary", size: "btn-lg" }, data.secondaryButton)) +
                     "</div>" +
                   "</div>" +

                   (showVisual
                     ? '<div class="hero-visual" data-reveal="scale">' +
                         '<div class="hero-window">' +
                           '<div class="hero-window-chrome">' +
                             '<span class="mockup-dots"><span></span><span></span><span></span></span>' +
                             '<span class="hero-window-url">' + U.escape(visual.browserTitle || "") + "</span>" +
                           "</div>" +
                           '<pre class="hero-code"><code>' + code + "</code></pre>" +
                         "</div>" +
                       "</div>"
                     : "") +

                 "</div>" +

                 /* One rail along the bottom edge carries the scroll cue, the
                    figures and the trust line — instead of three stacked rows. */
                 '<div class="hero-rail">' +
                   /* The travelling tick is the cue; the word was noise. The
                      label stays for screen readers, which cannot see it. */
                   '<a class="hero-scroll" href="#trust" data-scroll-to="trust" aria-label="Scroll to content">' +
                     '<span class="hero-scroll-line"></span>' +
                   "</a>" +
                   '<div class="hero-stats">' + stats + "</div>" +
                   '<div class="hero-trust">' + trust + "</div>" +
                 "</div>" +
               "</div>" +
             "</section>";
    },

    mount: function (el) {
      initHeroVideo(el);
    }
  };

  /**
   * Hero background video.
   * The markup already carries autoplay/muted/loop/playsinline, so this only
   * handles the cases the attributes cannot:
   *   · reduced-motion — hold the first frame instead of looping
   *   · Save-Data / metered connections — don't pull 3 MB down a phone plan
   *   · autoplay refused (low-power mode) — fail to a still frame, not a gap
   */
  function initHeroVideo(root) {
    var video = root.querySelector(".hero-video");
    if (!video) return;

    var saveData = navigator.connection && navigator.connection.saveData;
    if (video.getAttribute("data-respect-save-data") === "true" && saveData) {
      video.removeAttribute("autoplay");
      video.preload = "none";
      root.classList.add("hero--video-idle");
      App.log.info("Hero video skipped — Save-Data is enabled.");
      return;
    }

    if (U.prefersReducedMotion()) {
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
      video.addEventListener("loadeddata", function () { video.pause(); }, { once: true });
      video.pause();
      return;
    }

    video.addEventListener("canplay", function () {
      root.classList.add("hero--video-ready");
    }, { once: true });

    var attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(function () {
        /* Muted autoplay can still be refused; the poster frame stands in. */
        root.classList.add("hero--video-idle");
        App.log.warn("Hero video autoplay was blocked — showing a still frame.");
      });
    }
  }

  function heroOrbit() {
    return '<svg class="hero-orbit" viewBox="0 0 400 400" fill="none" aria-hidden="true">' +
             '<g class="orbit-ring" opacity=".55">' +
               '<circle cx="200" cy="200" r="150" stroke="currentColor" stroke-width="1" stroke-dasharray="4 8"/>' +
               '<circle cx="350" cy="200" r="4" fill="currentColor" class="orbit-node"/>' +
             "</g>" +
             '<g class="orbit-ring orbit-ring--reverse" opacity=".4">' +
               '<circle cx="200" cy="200" r="185" stroke="currentColor" stroke-width="1" stroke-dasharray="2 10"/>' +
               '<circle cx="200" cy="15" r="3" fill="currentColor" class="orbit-node"/>' +
             "</g>" +
             '<path class="draw-path" d="M40 300 Q 200 210 360 300" stroke="currentColor" stroke-width="1" opacity=".35" style="--path-length:420"/>' +
           "</svg>";
  }

  /* ==================================================================
     TRUST STRIP
     ================================================================== */
  var trust = {
    needs: ["homepage"],
    render: function () {
      var items = App.data.get("homepage", "trust.items", []) || [];
      return '<section class="trust-strip" id="trust" aria-label="What you get">' +
               '<div class="container">' +
                 '<div class="trust-grid">' + items.map(C.valueItem).join("") + "</div>" +
               "</div>" +
             "</section>";
    }
  };

  /* ==================================================================
     WHY US
     ================================================================== */
  var why = {
    needs: ["homepage"],
    render: function () {
      var data = App.data.get("homepage", "whyUs", {}) || {};
      return section({
        id: "why",
        className: "section--alt",
        content:
          C.sectionHeader({ eyebrow: data.eyebrow, title: data.title, description: data.description, align: "center" }) +
          '<div class="grid grid--auto-md">' + (data.items || []).map(C.featureCard).join("") + "</div>"
      });
    }
  };

  /* ==================================================================
     WEBSITE TYPES
     ================================================================== */
  var websiteTypes = {
    needs: ["websiteTypes", "homepage"],
    render: function () {
      var intro = App.data.get("homepage", "websiteTypesIntro", {}) || {};
      var items = U.activeSorted(App.data.items("websiteTypes"));
      return section({
        id: "website-types",
        content:
          C.sectionHeader(intro) +
          '<div class="grid types-grid">' + items.map(C.websiteTypeCard).join("") + "</div>"
      });
    }
  };

  /* ==================================================================
     PROCESS
     ================================================================== */
  var process = {
    needs: ["process", "homepage"],
    render: function () {
      var intro = App.data.get("homepage", "processIntro", {}) || {};
      var steps = U.activeSorted(App.data.items("process"));
      return section({
        id: "process",
        className: "section--alt process",
        content:
          C.sectionHeader(intro) +
          '<ol class="process-list">' + steps.map(C.processStep).join("") + "</ol>"
      });
    }
  };

  /* ==================================================================
     PERFORMANCE
     ================================================================== */
  var performance = {
    needs: ["homepage"],
    render: function () {
      var data = App.data.get("homepage", "performance", {}) || {};

      var metrics = (data.metrics || []).map(function (metric) {
        return '<div class="perf-metric" data-reveal="up">' +
                 '<div class="perf-metric-head">' +
                   icon(metric.icon) +
                   '<span class="perf-metric-name">' + U.escape(metric.label) + "</span>" +
                   '<span class="perf-metric-score"><span data-counter="' + U.attr(metric.value) + '">0</span></span>' +
                 "</div>" +
                 '<div class="meter"><span class="meter-fill" data-meter="' + U.attr(metric.value) + '"></span></div>' +
                 '<span class="perf-metric-caption">' + U.escape(metric.caption) + "</span>" +
               "</div>";
      }).join("");

      var highlights = (data.highlights || []).map(function (item) {
        return '<div class="perf-highlight" data-reveal="up">' +
                 App.icons.tile(item.icon, "icon-tile--sm") +
                 "<div>" +
                   '<span class="perf-highlight-title">' + U.escape(item.title) + "</span>" +
                   '<span class="perf-highlight-text">' + U.escape(item.description) + "</span>" +
                 "</div>" +
               "</div>";
      }).join("");

      return section({
        id: "performance",
        content:
          '<div class="perf-grid">' +
            "<div>" +
              C.sectionHeader({ eyebrow: data.eyebrow, title: data.title, description: data.description }) +
              '<div class="perf-highlights">' + highlights + "</div>" +
              (data.note ? '<p class="perf-note">' + U.escape(data.note) + "</p>" : "") +
            "</div>" +
            '<div class="perf-metrics">' + metrics + "</div>" +
          "</div>"
      });
    }
  };

  /* ==================================================================
     TESTIMONIALS (custom jQuery carousel)
     ================================================================== */
  var testimonials = {
    needs: ["testimonials", "homepage"],

    render: function () {
      var intro = App.data.get("homepage", "testimonialsIntro", {}) || {};
      return section({
        id: "testimonials",
        className: "section--alt hidden",
        content:
          C.sectionHeader(intro) +
          '<div class="testimonials-viewport">' +
            '<div class="testimonials-track" data-carousel-track></div>' +
          "</div>" +
          '<div class="carousel-controls">' +
            '<div class="carousel-dots" data-carousel-dots role="tablist" aria-label="Testimonial pages"></div>' +
            '<div class="carousel-arrows">' +
              '<button type="button" class="btn btn-secondary btn-icon" data-carousel-prev aria-label="Previous testimonials">' + icon("chevron-left") + "</button>" +
              '<button type="button" class="btn btn-secondary btn-icon" data-carousel-next aria-label="Next testimonials">' + icon("chevron-right") + "</button>" +
            "</div>" +
          "</div>"
      });
    },

    mount: function (el) {
      var source = App.data.get("testimonials") || {};
      var items = U.activeSorted(source.items || []);
      if (!items.length) return;

      var track = el.querySelector("[data-carousel-track]");
      track.innerHTML = items.map(C.testimonialCard).join("");

      initCarousel(el, items.length, U.get(source, "settings", {}));
    }
  };

  function initCarousel(root, count, settings) {
    var track = root.querySelector("[data-carousel-track]");
    var dotsWrap = root.querySelector("[data-carousel-dots]");
    var index = 0;
    var timer = null;

    /* One quote per view at every size. The testimonial is set as a large
       pull-quote, so showing three at once would shrink it back into a card
       grid — which is exactly what this design is moving away from. */
    function perView() {
      return 1;
    }

    function pages() {
      return Math.max(1, Math.ceil(count / perView()));
    }

    function renderDots() {
      var total = pages();
      dotsWrap.innerHTML = "";
      for (var i = 0; i < total; i++) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel-dot" + (i === index ? " is-active" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", "Go to testimonial page " + (i + 1));
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
        /* eslint-disable no-loop-func */
        (function (target) {
          dot.addEventListener("click", function () { go(target); });
        })(i);
        dotsWrap.appendChild(dot);
      }
    }

    function go(target) {
      var total = pages();
      index = (target + total) % total;
      var offset = index * 100;
      track.style.transform = "translateX(-" + offset + "%)";
      Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
        dot.classList.toggle("is-active", i === index);
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
    }

    function start() {
      if (!settings.autoplay || U.prefersReducedMotion()) return;
      stop();
      timer = setInterval(function () { go(index + 1); }, settings.interval || 7000);
    }

    function stop() { if (timer) clearInterval(timer); timer = null; }

    root.querySelector("[data-carousel-next]").addEventListener("click", function () { go(index + 1); start(); });
    root.querySelector("[data-carousel-prev]").addEventListener("click", function () { go(index - 1); start(); });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);

    window.addEventListener("resize", U.debounce(function () {
      renderDots();
      go(Math.min(index, pages() - 1));
    }, 200));

    renderDots();
    go(0);
    start();
  }

  /* ==================================================================
     FAQ
     ================================================================== */
  var faq = {
    needs: ["faqs", "homepage"],

    render: function (options) {
      var opts = options || {};
      var intro = App.data.get("homepage", "faqIntro", {}) || {};
      var showHeader = opts.showHeader !== false;
      var showFilters = !!opts.filters;

      return section({
        id: "faq",
        className: "section--alt",
        container: "container-narrow",
        content:
          (showHeader ? C.sectionHeader({
            eyebrow: intro.eyebrow,
            title: intro.title,
            description: intro.description,
            align: "center",
            link: opts.mode === "all" ? null : intro.link
          }) : "") +
          (showFilters ? '<div class="filter-group cluster--center mb-lg" role="group" aria-label="Filter questions" data-faq-filters></div>' : "") +
          '<div data-faq-list>' + C.loadingState(4) + "</div>"
      });
    },

    mount: function (el, options) {
      var opts = options || {};
      var source = App.data.get("faqs") || {};
      var all = U.activeSorted(source.items || []);
      var items = opts.mode === "all" ? all : U.featured(all, opts.limit || 8);
      var listEl = el.querySelector("[data-faq-list]");
      var current = "all";

      function draw() {
        var visible = current === "all"
          ? items
          : items.filter(function (item) { return item.category === current; });

        listEl.innerHTML = visible.length
          ? C.faqAccordion(visible, "faq-accordion")
          : C.emptyState({ icon: "help-circle", title: "No questions here yet", text: "Pick another category, or just ask us directly." });

        App.emit("content:rendered", { root: listEl });
      }

      if (opts.filters) {
        var filterWrap = el.querySelector("[data-faq-filters]");
        var categories = [{ id: "all", label: "All" }].concat(source.categories || []);
        filterWrap.innerHTML = categories.map(function (cat) {
          return '<button type="button" class="filter-btn' + (cat.id === "all" ? " is-active" : "") +
                 '" data-filter="' + U.attr(cat.id) + '" aria-pressed="' + (cat.id === "all") + '">' +
                 U.escape(cat.label) + "</button>";
        }).join("");

        filterWrap.addEventListener("click", function (event) {
          var btn = event.target.closest("[data-filter]");
          if (!btn) return;
          current = btn.getAttribute("data-filter");
          U.$$("[data-filter]", filterWrap).forEach(function (b) {
            var active = b === btn;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          draw();
        });
      }

      draw();
      App.seo.addFaqSchema(items);
    }
  };

  /* ==================================================================
     CONTACT
     ================================================================== */
  var contact = {
    needs: ["contact", "contactForm", "homepage", "social"],

    render: function (options) {
      var opts = options || {};
      var data = App.data.get("contact") || {};
      var intro = App.data.get("homepage", "contactIntro", {}) || {};
      var showHeader = opts.showHeader !== false;

      var info = (data.info || []).map(function (item) {
        var value = item.url
          ? '<a class="contact-info-value" href="' + U.attr(U.url(item.url)) + '"' + U.linkAttrs(item.url) + ">" + U.escape(item.value) + "</a>"
          : '<span class="contact-info-value">' + U.escape(item.value) + "</span>";
        return "<li>" + App.icons.tile(item.icon, "icon-tile--sm") +
               "<div>" +
                 '<span class="contact-info-label">' + U.escape(item.label) + "</span>" + value +
               "</div></li>";
      }).join("");

      var assurances = (data.assurances || []).map(function (item) {
        return "<li>" + icon(item.icon) + "<span>" + U.escape(item.text) + "</span></li>";
      }).join("");

      return section({
        id: "contact",
        content:
          (showHeader ? C.sectionHeader({
            eyebrow: intro.eyebrow,
            title: intro.title || data.title,
            description: intro.description || data.description
          }) : "") +
          '<div class="contact-grid">' +
            '<div class="contact-panel" data-reveal="up">' +
              App.forms.buildContactForm() +
            "</div>" +
            '<aside class="contact-aside" data-reveal="up">' +
              '<div class="card">' +
                '<h3 class="card-title mb-md">Direct contact</h3>' +
                '<ul class="contact-info-list">' + info + "</ul>" +
              "</div>" +
              '<div class="card">' +
                '<h3 class="card-title mb-md">What happens next</h3>' +
                '<ul class="assurance-list">' + assurances + "</ul>" +
                (data.responseTime ? '<p class="card-meta mt-md">' + icon("clock") + U.escape(data.responseTime) + "</p>" : "") +
              "</div>" +
            "</aside>" +
          "</div>"
      });
    },

    mount: function (el) {
      App.forms.initContactForm(el.querySelector("form"));
    }
  };

  /* ==================================================================
     INSTAGRAM
     ================================================================== */
  var instagram = {
    needs: ["homepage", "social"],
    render: function () {
      var data = App.data.get("homepage", "instagram", {}) || {};
      var profile = App.data.get("social", "instagram", {}) || {};
      var url = profile.url || (data.button && data.button.url);

      /* Label and blurb travel together in one block so space-between keeps the
         icon at the top and the whole text group at the foot of the tile —
         rather than stranding a lone label with a void above it. */
      var tiles = (data.tiles || []).map(function (tile) {
        return '<a class="instagram-tile" href="' + U.attr(url) + '" target="_blank" rel="noopener noreferrer">' +
                 icon(tile.icon) +
                 '<span class="instagram-tile-text">' +
                   '<span class="instagram-tile-label">' + U.escape(tile.label) + "</span>" +
                   (tile.text
                     ? '<span class="instagram-tile-note">' + U.escape(tile.text) + "</span>"
                     : "") +
                 "</span>" +
               "</a>";
      }).join("");

      return section({
        id: "instagram",
        content:
          '<div class="instagram-panel" data-reveal="up">' +
            "<div>" +
              '<span class="section-eyebrow">' + U.escape(data.eyebrow || "") + "</span>" +
              '<h2 class="section-title">' + U.richText(data.title) + "</h2>" +
              '<p class="section-description mt-sm">' + U.escape(data.description || "") + "</p>" +
              '<p class="instagram-handle mt-sm">' + U.escape(profile.handle || data.handle || "") + "</p>" +
              '<div class="mt-md">' +
                C.button(Object.assign({ variant: "btn-accent" }, data.button, { url: url })) +
              "</div>" +
            "</div>" +
            '<div class="instagram-tiles">' + tiles + "</div>" +
          "</div>"
      });
    }
  };

  /* ==================================================================
     FINAL CTA
     ================================================================== */
  var cta = {
    needs: ["homepage"],
    render: function () {
      var data = App.data.get("homepage", "finalCTA", {}) || {};
      var assurances = (data.assurances || []).map(function (text) {
        return "<span>" + icon("check") + U.escape(text) + "</span>";
      }).join("");

      return section({
        id: "cta",
        content:
          '<div class="cta-panel" data-reveal="scale">' +
            '<div class="cta-inner">' +
              '<span class="section-eyebrow">' + U.escape(data.eyebrow || "") + "</span>" +
              '<h2 class="cta-title">' + U.richText(data.title) + "</h2>" +
              '<p class="cta-text">' + U.escape(data.description || "") + "</p>" +
              '<div class="cta-actions">' +
                C.button(Object.assign({ variant: "btn-gradient", size: "btn-lg" }, data.primaryButton)) +
                C.button(Object.assign({ variant: "btn-secondary", size: "btn-lg" }, data.secondaryButton)) +
              "</div>" +
              '<div class="cta-assurances">' + assurances + "</div>" +
            "</div>" +
          "</div>"
      });
    }
  };

  /* ==================================================================
     PAGE HEADER (inner pages)
     ================================================================== */
  var pageHeader = {
    needs: ["pages"],
    render: function (options, context) {
      var page = (context && context.page) || {};
      var header = page.header || {};
      var background = header.background || {};
      var hasVideo = background.type === "video" && background.src;

      /* Same composition language as the hero: ruled mono eyebrow, display
         serif title, supporting copy offset into a second column, and the
         breadcrumb on a rail along the bottom edge. */
      /* Article, case-study and resource views own their own <h1>, so the
         header has nothing to show but the trail. Rendering the full block
         anyway left a 220px void at the top of every one of those pages. */
      var slim = !header.title && !header.eyebrow;

      var backdrop = hasVideo
        ? '<div class="page-header-bg" aria-hidden="true">' +
            '<video class="page-header-video" playsinline muted loop autoplay preload="metadata" tabindex="-1" disablepictureinpicture' +
            (background.poster ? ' poster="' + U.attr(U.url(background.poster)) + '"' : '') +
            ' style="object-position:' + U.attr(background.objectPosition || "center") + '"' +
            (background.respectSaveData ? ' data-respect-save-data="true"' : "") + '>' +
              '<source src="' + U.attr(U.url(background.src)) + '" type="video/mp4">' +
            '</video>' +
            '<span class="page-header-video-overlay"></span>' +
          '</div>'
        : "";

      return '<section class="page-header' + (slim ? " page-header--slim" : "") + '" id="page-header">' +
               backdrop +
               '<div class="container-wide page-header-shell">' +
                 '<div class="page-header-inner">' +
                   (header.eyebrow
                     ? '<p class="page-header-eyebrow"><span>' + U.escape(header.eyebrow) + "</span></p>"
                     : "") +
                   (header.title
                     ? '<h1 class="page-header-title">' + U.richText(header.title) + "</h1>"
                     : "") +
                   (header.description
                     ? '<div class="page-header-aside">' +
                         '<p class="page-header-description">' + U.richText(header.description) + "</p>" +
                       "</div>"
                     : "") +
                 "</div>" +
                 (header.breadcrumb
                   ? '<div class="page-header-rail">' + C.breadcrumb(header.breadcrumb) + "</div>"
                   : "") +
               "</div>" +
             "</section>";
    },
    mount: function (el) {
      initPageHeaderVideo(el);
    }
  };

  function initPageHeaderVideo(root) {
    var video = root.querySelector(".page-header-video");
    if (!video) return;

    var saveData = navigator.connection && navigator.connection.saveData;
    if (video.getAttribute("data-respect-save-data") === "true" && saveData) {
      video.removeAttribute("autoplay");
      video.preload = "none";
      root.classList.add("page-header--video-idle");
      return;
    }

    if (U.prefersReducedMotion()) {
      video.removeAttribute("autoplay");
      video.removeAttribute("loop");
      video.addEventListener("loadeddata", function () { video.pause(); }, { once: true });
      video.pause();
      return;
    }

    var attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(function () {
        root.classList.add("page-header--video-idle");
      });
    }
  }

  /* ==================================================================
     ABOUT STORY + STATS
     ================================================================== */
  var aboutStory = {
    needs: ["about"],
    render: function () {
      var data = App.data.get("about", "story", {}) || {};
      var highlights = (data.highlights || []).map(function (item) {
        return '<div class="perf-highlight">' +
                 App.icons.tile(item.icon, "icon-tile--sm") +
                 "<div>" +
                   '<span class="perf-highlight-title">' + U.escape(item.title) + "</span>" +
                   '<span class="perf-highlight-text">' + U.escape(item.text) + "</span>" +
                 "</div>" +
               "</div>";
      }).join("");

      return section({
        id: "about-story",
        content:
          '<div class="about-grid">' +
            '<div data-reveal="up">' +
              '<span class="section-eyebrow">' + U.escape(data.eyebrow || "") + "</span>" +
              '<h2 class="section-title mb-md">' + U.richText(data.title) + "</h2>" +
              '<p class="about-lead mb-md">' + U.escape(data.lead || "") + "</p>" +
              '<div class="about-body">' +
                (data.paragraphs || []).map(function (p) { return "<p>" + U.escape(p) + "</p>"; }).join("") +
              "</div>" +
              (data.signature ? '<span class="about-signature">' + icon("pen-ruler") + U.escape(data.signature) + "</span>" : "") +
            "</div>" +
            '<div class="card" data-reveal="up">' +
              '<div class="perf-highlights">' + highlights + "</div>" +
            "</div>" +
          "</div>"
      });
    }
  };

  var stats = {
    needs: ["about"],
    render: function () {
      var data = App.data.get("about", "stats", {}) || {};
      return section({
        id: "stats",
        className: "section--alt section--sm",
        content:
          C.sectionHeader({ eyebrow: data.eyebrow, title: data.title, align: "center" }) +
          '<div class="stats-grid">' + (data.items || []).map(C.stat).join("") + "</div>"
      });
    }
  };

  /* ==================================================================
     LEGAL DOCUMENT
     ================================================================== */
  var legal = {
    needs: ["legal", "pages", "site"],
    render: function (options, context) {
      var page = (context && context.page) || {};
      var source = App.data.get("legal") || {};
      var doc = U.get(source, "documents." + page.documentKey, null);

      if (!doc) {
        return section({ id: "legal", content: C.errorState({ title: "Document unavailable" }) });
      }

      var toc = doc.sections.map(function (s) {
        return '<a href="#' + U.attr(s.id) + '">' + U.escape(s.title) + "</a>";
      }).join("");

      var body = doc.sections.map(function (s) {
        var blocks = s.blocks.map(function (block) {
          if (block.type === "list") {
            return "<ul>" + block.items.map(function (li) { return "<li>" + U.escape(li) + "</li>"; }).join("") + "</ul>";
          }
          return "<p>" + U.escape(block.text) + "</p>";
        }).join("");
        return '<h2 id="' + U.attr(s.id) + '">' + U.escape(s.title) + "</h2>" + blocks;
      }).join("");

      return section({
        id: "legal",
        content:
          '<div class="legal-layout">' +
            '<nav class="legal-toc" aria-label="On this page">' +
              '<span class="legal-toc-title">On this page</span>' + toc +
            "</nav>" +
            '<div class="legal-content">' +
              (doc.lastUpdated ? '<p class="legal-updated">Last updated: ' + U.escape(U.formatDate(doc.lastUpdated)) + "</p>" : "") +
              (doc.intro ? '<p class="mt-md">' + U.escape(doc.intro) + "</p>" : "") +
              (doc.showTemplateNotice && source.notice ? '<div class="mt-md">' + C.notice(source.notice) + "</div>" : "") +
              body +
            "</div>" +
          "</div>"
      });
    }
  };

  /* ==================================================================
     COLLECTION SECTIONS
     ================================================================== */
  var services = collectionSection({
    id: "services",
    source: "services",
    label: "services",
    introKey: "servicesIntro",
    gridClass: "grid--auto-lg",
    cardFn: function (item, i) { return C.serviceCard(item, { index: i + 1 }); },
    searchFields: ["title", "shortDescription", "description", "technologies", "features"],
    empty: { title: "No services match", text: "Try another category or clear the search." }
  });

  var projects = collectionSection({
    id: "projects",
    source: "projects",
    label: "projects",
    introKey: "projectsIntro",
    sectionClass: "section--alt",
    gridClass: "grid--auto-lg",
    cardFn: C.projectCard,
    searchFields: ["title", "shortDescription", "description", "technologies", "tags", "clientType"],
    empty: { title: "No projects in this category", text: "Pick another filter to see more work." }
  });

  var demos = collectionSection({
    id: "demos",
    source: "demos",
    label: "demos",
    introKey: "demosIntro",
    gridClass: "grid--auto-lg",
    cardFn: C.demoCard,
    searchFields: ["title", "description", "industry", "features", "tags"],
    empty: { title: "No demos found", text: "Try a different category or search term." },
    afterMount: function (el) {
      el.addEventListener("click", function (event) {
        var trigger = event.target.closest("[data-demo-preview]");
        if (!trigger) return;
        openDemoModal(trigger.getAttribute("data-demo-preview"));
      });
    }
  });

  function openDemoModal(id) {
    var demo = App.data.items("demos").filter(function (d) { return d.id === id; })[0];
    if (!demo) return;

    var features = (demo.features || []).map(function (f) {
      return "<li>" + icon("check") + " " + U.escape(f) + "</li>";
    }).join("");

    C.showModal({
      title: demo.title + " demo",
      subtitle: demo.industry + " · " + C.categoryLabel("demos", demo.category),
      wide: true,
      body:
        '<div class="demo-card-media" style="position:relative;aspect-ratio:16/9;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--color-border)">' +
          C.mockup(demo.preview, demo.title + " layout preview") +
        "</div>" +
        '<p class="mt-lg">' + U.escape(demo.description) + "</p>" +
        '<h3 class="card-title mt-lg mb-md">Included in this layout</h3>' +
        '<ul class="service-card-features">' + features + "</ul>" +
        '<div class="mt-lg">' + C.chips(demo.technologies) + "</div>" +
        '<div class="mt-lg">' + C.notice("This is a concept layout. Every demo is adapted to your brand, content and requirements before it becomes your website.", "info") + "</div>",
      footer:
        C.button({ label: "Request this layout", url: "/pages/contact.html", variant: "btn-primary", icon: "arrow-right" }) +
        C.button({ label: "Close", variant: "btn-secondary", tag: "button", attrs: ' data-modal-close' })
    });

    document.addEventListener("click", function handler(event) {
      if (event.target.closest("[data-modal-close]")) {
        C.closeModal();
        document.removeEventListener("click", handler);
      }
    });
  }

  var resources = collectionSection({
    id: "resources",
    source: "resources",
    label: "resources",
    introKey: "resourcesIntro",
    sectionClass: "section--alt",
    gridClass: "grid--auto-md",
    cardFn: C.resourceCard,
    searchFields: ["title", "description", "tags", "type"],
    empty: { title: "No resources found", text: "Try another category or search term." }
  });

  var tools = collectionSection({
    id: "tools",
    source: "tools",
    label: "tools",
    introKey: "toolsIntro",
    gridClass: "grid--auto-md",
    cardFn: C.toolCard,
    searchFields: ["title", "description", "tags"],
    empty: { title: "No tools found", text: "Try another category or search term." },
    afterMount: function (el) {
      App.tools.bind(el);
    }
  });

  var blog = collectionSection({
    id: "blog",
    source: "blog",
    label: "articles",
    introKey: "blogIntro",
    sectionClass: "section--alt",
    gridClass: "grid--auto-lg",
    cardFn: C.blogCard,
    searchFields: ["title", "excerpt", "tags", "category"],
    empty: { title: "No articles yet", text: "New writing gets published here regularly." }
  });

  /* ==================================================================
     REGISTRY
     ================================================================== */
  App.sections = {
    registry: {
      "hero": hero,
      "trust": trust,
      "services": services,
      "why": why,
      "website-types": websiteTypes,
      "projects": projects,
      "demos": demos,
      "resources": resources,
      "tools": tools,
      "process": process,
      "performance": performance,
      "testimonials": testimonials,
      "blog": blog,
      "faq": faq,
      "contact": contact,
      "instagram": instagram,
      "cta": cta,
      "page-header": pageHeader,
      "about-story": aboutStory,
      "stats": stats,
      "legal": legal
    },

    /** Register a new section without touching this file. */
    register: function (id, definition) {
      App.sections.registry[id] = definition;
      return App.sections;
    },

    get: function (id) {
      return App.sections.registry[id] || null;
    },

    /* exported for reuse by future pages */
    helpers: { section: section, collectionSection: collectionSection }
  };
})(window.Site);
