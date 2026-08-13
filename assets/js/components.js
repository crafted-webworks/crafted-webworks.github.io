/* ==========================================================================
   Components — every reusable UI builder, in one place.
   --------------------------------------------------------------------------
   Each function takes data and returns an HTML string. There is exactly ONE
   implementation per component: the same `serviceCard` is used on the home
   page, the services page and anywhere else a service appears.

   Convention: all text passes through utils.escape (or utils.richText for
   fields where <em> highlighting is allowed).
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var icon = function () { return App.icons.render.apply(App.icons, arguments); };

  /* ==================================================================
     PRIMITIVES
     ================================================================== */

  function button(config) {
    if (!config || !config.label) return "";
    var variant = config.variant || "btn-primary";
    var size = config.size ? " " + config.size : "";
    var url = U.url(config.url);
    var iconMarkup = config.icon ? icon(config.icon, "icon--shift") : "";
    var extraAttrs = config.attrs || "";
    var classes = "btn " + variant + size + (config.className ? " " + config.className : "");

    if (config.tag === "button") {
      return '<button type="' + (config.type || "button") + '" class="' + classes + '"' + extraAttrs + ">" +
             U.escape(config.label) + iconMarkup + "</button>";
    }

    return '<a class="' + classes + '" href="' + U.attr(url) + '"' + U.linkAttrs(url) + extraAttrs + ">" +
           U.escape(config.label) + iconMarkup + "</a>";
  }

  function badge(text, variant, iconName) {
    if (!text) return "";
    return '<span class="badge' + (variant ? " badge--" + variant : "") + '">' +
           (iconName ? icon(iconName) : "") + U.escape(text) + "</span>";
  }

  function chip(text) {
    return '<span class="chip">' + U.escape(text) + "</span>";
  }

  function chips(list, limit) {
    if (!list || !list.length) return "";
    var shown = limit ? list.slice(0, limit) : list;
    var extra = limit && list.length > limit ? list.length - limit : 0;
    return '<div class="cluster cluster--sm">' +
           shown.map(chip).join("") +
           (extra ? '<span class="chip">+' + extra + "</span>" : "") +
           "</div>";
  }

  /**
   * Editorial section masthead. One structure for every variant:
   *
   *   eyebrow   — row 1, spans both columns, sits on a hairline rule
   *   title     — row 2, column 1, display serif
   *   aside     — row 2, column 2, description + optional link, grouped so the
   *               link sits with the text it belongs to instead of orphaning
   *               onto a row of its own.
   *
   * `align: "center"` collapses it to a single centred column for the few
   * sections that genuinely want symmetry.
   */
  function sectionHeader(config) {
    if (!config) return "";

    var centred = config.align === "center";
    var link = config.link
      ? '<a class="card-link section-header-link" href="' + U.attr(U.url(config.link.url)) + '">' +
          U.escape(config.link.label) + icon("arrow-right") +
        "</a>"
      : "";

    var aside = (config.description || link)
      ? '<div class="section-header-aside">' +
          (config.description ? '<p class="section-description">' + U.richText(config.description) + "</p>" : "") +
          link +
        "</div>"
      : "";

    return '<div class="section-header' + (centred ? " section-header--center" : "") + '" data-reveal="up">' +
             (config.eyebrow ? '<span class="section-eyebrow">' + U.escape(config.eyebrow) + "</span>" : "") +
             (config.title ? '<h2 class="section-title">' + U.richText(config.title) + "</h2>" : "") +
             aside +
           "</div>";
  }

  function breadcrumb(items) {
    if (!items || !items.length) return "";
    var crumbs = items.map(function (item, i) {
      var last = i === items.length - 1;
      if (last || !item.url) {
        return "<li><span aria-current=\"page\">" + U.escape(item.label) + "</span></li>";
      }
      return '<li><a href="' + U.attr(U.url(item.url)) + '">' + U.escape(item.label) + "</a></li>";
    }).join("");
    return '<nav aria-label="Breadcrumb"><ol class="breadcrumb">' + crumbs + "</ol></nav>";
  }

  function stat(item) {
    return '<div class="stat" data-reveal="up">' +
             '<span class="stat-value"><span data-counter="' + U.attr(item.value) + '">0</span>' +
               (item.suffix ? '<span class="suffix">' + U.escape(item.suffix) + "</span>" : "") +
             "</span>" +
             '<span class="stat-label">' + U.escape(item.label) + "</span>" +
             (item.description ? '<span class="stat-desc">' + U.escape(item.description) + "</span>" : "") +
           "</div>";
  }

  function notice(text, variant) {
    if (!text) return "";
    return '<p class="notice' + (variant ? " notice--" + variant : "") + '">' +
           icon(variant === "info" ? "info" : "alert-circle") +
           "<span>" + U.escape(text) + "</span></p>";
  }

  /* ==================================================================
     GENERATED CARD ARTWORK — browser mockups, no image files needed
     ================================================================== */

  var WIRE_PATTERNS = {
    business:
      '<div class="w-bar"></div>' +
      '<div class="w-row w-fill"><span class="w-tile"></span><span class="w-tile w-tile--accent"></span><span class="w-tile"></span></div>' +
      '<div class="w-line w-line--wide"></div><div class="w-line w-line--mid"></div>',

    store:
      '<div class="w-row"><span class="w-line w-line--short w-line--accent"></span><span class="w-btn" style="margin-left:auto"></span></div>' +
      '<div class="w-grid w-grid--3"><span></span><span></span><span></span><span></span><span></span><span></span></div>',

    dashboard:
      '<div class="w-row w-fill">' +
        '<span class="w-side"></span>' +
        '<div class="w-col">' +
          '<div class="w-row"><span class="w-tile"></span><span class="w-tile"></span><span class="w-tile w-tile--accent"></span></div>' +
          '<div class="w-chart w-fill"><i style="height:45%"></i><i style="height:70%"></i><i style="height:35%"></i><i style="height:88%"></i><i style="height:58%"></i><i style="height:76%"></i></div>' +
        "</div>" +
      "</div>",

    landing:
      '<div class="w-line w-line--wide w-line--accent" style="height:.6rem"></div>' +
      '<div class="w-line w-line--mid"></div>' +
      '<div class="w-btn"></div>' +
      '<div class="w-row w-fill"><span class="w-tile"></span><span class="w-tile"></span></div>',

    cms:
      '<div class="w-row"><span class="w-line w-line--short w-line--accent"></span></div>' +
      '<div class="w-col w-fill">' +
        '<div class="w-row"><span class="w-tile" style="max-width:2.2rem"></span><span class="w-line w-line--wide" style="align-self:center"></span></div>' +
        '<div class="w-row"><span class="w-tile" style="max-width:2.2rem"></span><span class="w-line w-line--mid" style="align-self:center"></span></div>' +
        '<div class="w-row"><span class="w-tile" style="max-width:2.2rem"></span><span class="w-line w-line--wide" style="align-self:center"></span></div>' +
      "</div>",

    listing:
      '<div class="w-row"><span class="w-line w-line--short"></span><span class="w-line w-line--short w-line--accent"></span></div>' +
      '<div class="w-grid w-grid--2"><span></span><span></span><span></span><span></span></div>',

    booking:
      '<div class="w-row"><span class="w-line w-line--mid w-line--accent"></span></div>' +
      '<div class="w-grid w-grid--7"><span></span><span></span><span></span><span></span><span></span><span></span><span></span>' +
      "<span></span><span></span><span></span><span></span><span></span><span></span><span></span>" +
      "<span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>",

    portal:
      '<div class="w-row w-fill">' +
        '<span class="w-side"></span>' +
        '<div class="w-col">' +
          '<div class="w-bar" style="height:1.1rem"></div>' +
          '<div class="w-line w-line--wide"></div><div class="w-line w-line--wide"></div>' +
          '<div class="w-line w-line--mid"></div><div class="w-line w-line--short"></div>' +
        "</div>" +
      "</div>",

    gallery:
      '<div class="w-grid w-grid--3"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>'
  };

  /**
   * Abstract browser mockup used wherever a project/demo/post has no image.
   * Driven entirely by `preview: { pattern, accent }` in the JSON.
   */
  function mockup(preview, label) {
    var config = preview || {};
    var pattern = WIRE_PATTERNS[config.pattern] ? config.pattern : "business";
    var accent = config.accent || "blue";

    return '<div class="mockup mockup--' + U.attr(accent) + '" role="img" aria-label="' +
             U.attr(label || "Abstract website layout preview") + '">' +
             '<div class="mockup-chrome">' +
               '<span class="mockup-dots"><span></span><span></span><span></span></span>' +
               '<span class="mockup-url"></span>' +
             "</div>" +
             '<div class="mockup-canvas">' + WIRE_PATTERNS[pattern] + "</div>" +
           "</div>";
  }

  /** Real image when the JSON provides one, generated mockup otherwise. */
  function media(item, altFallback) {
    if (item && item.image && item.image.src) {
      var img = item.image;
      return '<img src="' + U.attr(U.url(img.src)) + '" alt="' + U.attr(img.alt || altFallback || "") + '"' +
             (img.width ? ' width="' + U.attr(img.width) + '"' : "") +
             (img.height ? ' height="' + U.attr(img.height) + '"' : "") +
             ' loading="lazy" decoding="async">';
    }
    return mockup(item && item.preview, altFallback);
  }

  /* ==================================================================
     GALLERY MEDIA
     A project carries a cover `image` plus an optional `gallery` list of
     screens and clips. Entries are deliberately loose so a folder of
     screenshots costs one line each:

       "galleryBase": "/assets/images/projects/advaith-homes/",
       "gallery": [
         "01-home.jpg",                                  ← resolved against base
         { "src": "02-listing.jpg", "alt": "Listing" },  ← same, with alt text
         { "src": "https://cdn.example.com/shot.png" },  ← external, left as-is
         { "type": "youtube", "id": "dQw4w9WgXcQ" },     ← lazy embed
         { "type": "vimeo",   "id": "76979871" },
         { "src": "walkthrough.mp4", "poster": "walkthrough.jpg" }
       ]

     `type` is optional — a src ending in a video extension is detected. IDs are
     pattern-checked before they reach an embed URL: they arrive from a data
     file, and anything unvalidated interpolated into a URL is an injection
     waiting to happen.
     ================================================================== */
  var VIDEO_FILE = /\.(mp4|webm|ogv|mov)(\?|#|$)/i;
  var YOUTUBE_ID = /^[A-Za-z0-9_-]{6,24}$/;
  var VIMEO_ID = /^\d{6,12}$/;

  /** External and root-relative srcs pass through; bare names join the base. */
  function galleryUrl(src, base) {
    var value = String(src || "").trim();
    if (!value) return "";
    if (/^(https?:)?\/\//i.test(value)) return value;
    if (value.charAt(0) === "/") return U.url(value);
    return U.url(base + value);
  }

  function galleryItems(project) {
    var list = (project && project.gallery) || [];
    if (!Array.isArray(list)) return [];

    var base = String((project && project.galleryBase) || "");
    if (base && base.slice(-1) !== "/") base += "/";

    return list.map(function (raw) {
      var entry = typeof raw === "string" ? { src: raw } : (raw || {});
      var type = entry.type || (VIDEO_FILE.test(entry.src || "") ? "video" : "image");

      if (type === "youtube" || type === "vimeo") {
        var id = String(entry.id || "");
        if (!(type === "youtube" ? YOUTUBE_ID : VIMEO_ID).test(id)) {
          App.log.warn("Gallery entry skipped — not a valid " + type + " id:", id);
          return null;
        }
        return { type: type, id: id, title: entry.title || "", caption: entry.caption || "" };
      }

      if (!entry.src) return null;

      return {
        type: type,
        src: galleryUrl(entry.src, base),
        poster: entry.poster ? galleryUrl(entry.poster, base) : "",
        alt: entry.alt || "",
        title: entry.title || "",
        caption: entry.caption || "",
        width: entry.width || null,
        height: entry.height || null
      };
    }).filter(Boolean);
  }

  function galleryFigure(item, index) {
    var inner;
    var isImage = item.type === "image";

    if (item.type === "youtube" || item.type === "vimeo") {
      var embed = item.type === "youtube"
        ? "https://www.youtube-nocookie.com/embed/" + item.id   /* no cookies until play */
        : "https://player.vimeo.com/video/" + item.id;

      inner = '<iframe src="' + U.attr(embed) + '"' +
                ' title="' + U.attr(item.title || "Project walkthrough") + '"' +
                ' loading="lazy" referrerpolicy="strict-origin-when-cross-origin"' +
                ' allow="autoplay; encrypted-media; picture-in-picture; fullscreen"' +
                " allowfullscreen></iframe>";
    } else if (item.type === "video") {
      inner = "<video" +
                ' src="' + U.attr(item.src) + '"' +
                (item.poster ? ' poster="' + U.attr(item.poster) + '"' : "") +
                ' controls preload="metadata" playsinline></video>';
    } else {
      inner = '<img src="' + U.attr(item.src) + '" alt="' + U.attr(item.alt) + '"' +
                (item.width ? ' width="' + U.attr(item.width) + '"' : "") +
                (item.height ? ' height="' + U.attr(item.height) + '"' : "") +
                ' loading="lazy" decoding="async">';
    }

    /* Only stills open in the lightbox — a video already owns its own
       controls, and swallowing the first click would break play. */
    return '<figure class="case-shot' + (isImage ? "" : " case-shot--video") + '" data-reveal="up">' +
             (isImage
               ? '<button type="button" class="case-shot-frame" data-lightbox="' + U.attr(index) + '"' +
                   ' aria-label="' + U.attr("Enlarge: " + (item.alt || item.caption || "project image")) + '">' +
                   inner + icon("search", "case-shot-zoom") + "</button>"
               : '<div class="case-shot-frame">' + inner + "</div>") +
             (item.caption ? "<figcaption>" + U.escape(item.caption) + "</figcaption>" : "") +
           "</figure>";
  }

  function avatar(name, src) {
    if (src) {
      return '<span class="avatar"><img src="' + U.attr(U.url(src)) + '" alt="" loading="lazy" decoding="async"></span>';
    }
    return '<span class="avatar" aria-hidden="true">' + U.escape(U.initials(name)) + "</span>";
  }

  function rating(value) {
    var stars = "";
    for (var i = 0; i < 5; i++) {
      stars += icon("star", i < value ? "icon--fill" : "");
    }
    return '<span class="testimonial-rating" role="img" aria-label="' +
           U.attr(value + " out of 5") + '">' + stars + "</span>";
  }

  /* ==================================================================
     CARDS
     ================================================================== */

  function serviceCard(service, options) {
    var opts = options || {};
    var url = U.url(service.url);
    var showFeatures = opts.features !== false && service.features && service.features.length;

    return '<article class="card service-card card--interactive" data-reveal="up" data-id="' + U.attr(service.id) + '"' +
             ' data-category="' + U.attr(service.category || "") + '">' +
             (opts.index ? '<span class="service-card-index">' + U.escape(("0" + opts.index).slice(-2)) + "</span>" : "") +
             App.icons.tile(service.icon) +
             '<div class="card-body">' +
               '<h3 class="card-title"><a href="' + U.attr(url) + '">' + U.escape(service.title) + "</a></h3>" +
               '<p class="card-text">' + U.escape(service.shortDescription || service.description) + "</p>" +
               (showFeatures ?
                 '<ul class="service-card-features">' +
                   service.features.slice(0, opts.featureLimit || 3).map(function (f) {
                     return "<li>" + icon("check") + "<span>" + U.escape(f) + "</span></li>";
                   }).join("") +
                 "</ul>" : "") +
             "</div>" +
             '<div class="card-footer">' +
               '<a class="card-link" href="' + U.attr(url) + '">Learn more' + icon("arrow-right") + "</a>" +
             "</div>" +
           "</article>";
  }

  function projectCard(project) {
    var categoryLabel = App.components.categoryLabel("projects", project.category);
    var url = U.url(project.url);
    var caseUrl = project.caseStudyUrl ? U.url(project.caseStudyUrl) : null;

    return '<article class="card project-card card--interactive" data-reveal="up" data-id="' + U.attr(project.id) + '"' +
             ' data-category="' + U.attr(project.category || "") + '" id="' + U.attr(project.slug) + '">' +
             '<div class="project-card-media">' +
               '<span class="media-tag">' + badge(categoryLabel, "primary") + "</span>" +
               (project.status && project.status !== "live"
                 ? '<span class="media-status">' +
                     badge(project.statusLabel || U.titleCase(project.status.replace(/-/g, " ")), "accent") +
                   "</span>"
                 : "") +
               media(project, project.title + " project preview") +
             "</div>" +
             '<div class="project-card-body">' +
               '<div class="project-card-top">' +
                 '<h3 class="card-title">' + U.escape(project.title) + "</h3>" +
                 (project.year ? '<span class="badge badge--mono badge--muted">' + U.escape(project.year) + "</span>" : "") +
               "</div>" +
               (project.clientType ? '<p class="card-meta">' + icon("briefcase") + U.escape(project.clientType) + "</p>" : "") +
               '<p class="card-text">' + U.escape(project.shortDescription || project.description) + "</p>" +
               chips(project.technologies, 4) +
               '<div class="project-card-actions">' +
                 '<a class="card-link" href="' + U.attr(url) + '"' + U.linkAttrs(url) + ">View project" + icon("arrow-up-right") + "</a>" +
                 (caseUrl ? '<a class="card-link text-muted" href="' + U.attr(caseUrl) + '">Case study' + icon("arrow-right") + "</a>" : "") +
               "</div>" +
             "</div>" +
           "</article>";
  }

  function demoCard(demo) {
    var hasLive = !!demo.url;
    var action = hasLive
      ? '<a class="btn btn-soft btn-sm" href="' + U.attr(U.url(demo.url)) + '"' + U.linkAttrs(demo.url) + ">View demo" + icon("arrow-up-right") + "</a>"
      : '<button type="button" class="btn btn-soft btn-sm" data-demo-preview="' + U.attr(demo.id) + '">Preview' + icon("eye") + "</button>";

    return '<article class="card demo-card card--interactive" data-reveal="up" data-id="' + U.attr(demo.id) + '"' +
             ' data-category="' + U.attr(demo.category || "") + '" data-industry="' + U.attr(demo.industry || "") + '">' +
             '<div class="demo-card-media">' +
               '<span class="media-tag">' + badge(demo.industry, "accent") + "</span>" +
               media(demo, demo.title + " demo preview") +
             "</div>" +
             '<div class="demo-card-body">' +
               '<h3 class="card-title">' + U.escape(demo.title) + "</h3>" +
               '<p class="card-text">' + U.escape(demo.description) + "</p>" +
               (demo.features && demo.features.length ?
                 '<ul class="demo-card-features">' +
                   demo.features.slice(0, 4).map(function (f) { return "<li>" + badge(f) + "</li>"; }).join("") +
                 "</ul>" : "") +
               '<div class="demo-card-footer">' +
                 '<span class="card-meta">' + icon("layers") +
                   U.escape(App.components.categoryLabel("demos", demo.category)) + "</span>" +
                 action +
               "</div>" +
             "</div>" +
           "</article>";
  }

  function resourceCard(resource) {
    var typeLabel = App.components.typeLabel("resources", resource.type);
    return '<article class="card resource-card card--interactive" data-reveal="up" data-id="' + U.attr(resource.id) + '"' +
             ' data-category="' + U.attr(resource.category || "") + '" id="' + U.attr(resource.slug) + '">' +
             '<div class="resource-card-top">' +
               App.icons.tile(resource.icon, "icon-tile--sm") +
               badge(typeLabel, "accent") +
             "</div>" +
             '<div class="card-body">' +
               '<h3 class="card-title">' + U.escape(resource.title) + "</h3>" +
               '<p class="card-text">' + U.escape(resource.description) + "</p>" +
             "</div>" +
             '<div class="card-footer flex items-center justify-between gap-sm">' +
               '<span class="card-meta">' + icon("clock") + U.escape(resource.readingTime || "") + "</span>" +
               '<a class="card-link" href="' + U.attr(U.url(resource.url)) + '">Open' + icon("arrow-right") + "</a>" +
             "</div>" +
           "</article>";
  }

  function toolCard(tool) {
    var isLive = tool.status === "live";
    var attrs = isLive
      ? ' data-tool="' + U.attr(tool.id) + '" role="button" tabindex="0"'
      : "";

    return '<article class="card tool-card card--interactive' + (isLive ? "" : " tool-card--planned") + '"' +
             ' data-reveal="up" data-id="' + U.attr(tool.id) + '" data-category="' + U.attr(tool.category || "") + '"' +
             attrs + ">" +
             App.icons.tile(tool.icon, "icon-tile--sm") +
             '<div class="tool-card-body">' +
               '<span class="tool-card-cat">' + U.escape(categoryLabel("tools", tool.category)) + "</span>" +
               '<h3 class="card-title">' + U.escape(tool.title) + "</h3>" +
               '<p class="card-text">' + U.escape(tool.description) + "</p>" +
             "</div>" +
             (isLive
               ? '<span class="tool-card-go" aria-hidden="true">' + icon("arrow-up-right") + "</span>"
               : '<span class="badge badge--muted tool-card-soon">Soon</span>') +
           "</article>";
  }

  function blogCard(post) {
    var url = App.components.postUrl(post);
    var categoryLabel = App.components.categoryLabel("blog", post.category);

    return '<article class="card blog-card card--interactive" data-reveal="up" data-id="' + U.attr(post.id) + '"' +
             ' data-category="' + U.attr(post.category || "") + '">' +
             '<div class="blog-card-media">' +
               '<span class="media-tag">' + badge(categoryLabel, "primary") + "</span>" +
               media(post, post.title) +
             "</div>" +
             '<div class="blog-card-body">' +
               '<h3 class="card-title"><a href="' + U.attr(url) + '">' + U.escape(post.title) + "</a></h3>" +
               '<p class="card-text clamp-3">' + U.escape(post.excerpt) + "</p>" +
               '<div class="blog-card-meta">' +
                 '<time datetime="' + U.attr(U.isoDate(post.date)) + '">' + U.escape(U.formatDate(post.date, "short")) + "</time>" +
                 '<span class="dot"></span>' +
                 "<span>" + U.escape(post.readingTime || "") + "</span>" +
               "</div>" +
             "</div>" +
           "</article>";
  }

  function testimonialCard(item) {
    return '<article class="card testimonial-card" data-reveal="up">' +
             rating(item.rating || 5) +
             '<blockquote class="testimonial-quote">' + U.escape(item.review) + "</blockquote>" +
             '<div class="testimonial-author">' +
               avatar(item.name, item.avatar) +
               "<div>" +
                 '<span class="testimonial-author-name">' + U.escape(item.name) + "</span>" +
                 '<span class="testimonial-author-role">' +
                   U.escape([item.role, item.company].filter(Boolean).join(", ")) +
                 "</span>" +
               "</div>" +
               (item.project ? '<span class="badge badge--muted" style="margin-left:auto">' + U.escape(item.project) + "</span>" : "") +
             "</div>" +
           "</article>";
  }

  function websiteTypeCard(type) {
    return '<article class="card type-card card--interactive" data-reveal="scale" data-id="' + U.attr(type.id) + '">' +
             App.icons.tile(type.icon, "icon-tile--sm") +
             '<h3 class="card-title">' + U.escape(type.title) + "</h3>" +
             '<p class="card-text">' + U.escape(type.description || "") + "</p>" +
           "</article>";
  }

  function valueItem(item) {
    return '<div class="value-item" data-reveal="up">' +
             App.icons.tile(item.icon, "icon-tile--sm icon-tile--accent") +
             "<div>" +
               '<span class="value-item-title">' + U.escape(item.title) + "</span>" +
               '<span class="value-item-text">' + U.escape(item.description) + "</span>" +
             "</div>" +
           "</div>";
  }

  function featureCard(item) {
    return '<article class="card feature-card" data-reveal="up">' +
             App.icons.tile(item.icon) +
             '<h3 class="card-title">' + U.escape(item.title) + "</h3>" +
             '<p class="card-text">' + U.escape(item.description || item.text) + "</p>" +
           "</article>";
  }

  function processStep(step) {
    return '<li class="process-step" data-reveal="up">' +
             '<span class="process-marker">' + U.escape(step.number) + "</span>" +
             '<div class="process-body">' +
               '<h3 class="process-title">' + icon(step.icon) + U.escape(step.title) + "</h3>" +
               '<p class="process-text">' + U.escape(step.description) + "</p>" +
               (step.deliverables && step.deliverables.length ?
                 '<div class="process-deliverables">' + step.deliverables.map(function (d) {
                   return badge(d);
                 }).join("") + "</div>" : "") +
             "</div>" +
           "</li>";
  }

  /* ==================================================================
     FAQ — Bootstrap accordion markup, re-skinned via CSS
     ================================================================== */
  function faqAccordion(items, accordionId) {
    var id = accordionId || "faq-accordion";
    var body = items.map(function (item, i) {
      var panelId = id + "-panel-" + i;
      var headingId = id + "-heading-" + i;
      return '<div class="accordion-item" data-category="' + U.attr(item.category || "") + '">' +
               '<h3 class="accordion-header" id="' + headingId + '">' +
                 '<button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"' +
                   ' data-bs-target="#' + panelId + '" aria-expanded="false" aria-controls="' + panelId + '">' +
                   U.escape(item.question) +
                 "</button>" +
               "</h3>" +
               '<div id="' + panelId + '" class="accordion-collapse collapse" aria-labelledby="' + headingId + '"' +
                 ' data-bs-parent="#' + id + '">' +
                 '<div class="accordion-body">' + U.richText(item.answer) + "</div>" +
               "</div>" +
             "</div>";
    }).join("");

    return '<div class="accordion faq-accordion" id="' + id + '" data-reveal="up">' + body + "</div>";
  }

  /* ==================================================================
     STATES
     ================================================================== */

  function loadingState(count) {
    var cards = "";
    for (var i = 0; i < (count || 6); i++) cards += '<div class="skeleton"></div>';
    return '<div class="skeleton-grid" role="status" aria-live="polite">' +
             '<span class="visually-hidden">Loading…</span>' + cards +
           "</div>";
  }

  function emptyState(config) {
    var opts = config || {};
    return '<div class="state">' +
             App.icons.tile(opts.icon || "inbox", "icon-tile--lg") +
             '<p class="state-title">' + U.escape(opts.title || "Nothing found") + "</p>" +
             '<p class="state-text">' + U.escape(opts.text || "Try a different filter or search term.") + "</p>" +
             (opts.action ? button(Object.assign({ variant: "btn-secondary", size: "btn-sm" }, opts.action)) : "") +
           "</div>";
  }

  function errorState(config) {
    var opts = config || {};
    return '<div class="state state--error" role="alert">' +
             App.icons.tile("alert-circle", "icon-tile--lg") +
             '<p class="state-title">' + U.escape(opts.title || "This section could not load") + "</p>" +
             '<p class="state-text">' + U.escape(opts.text || "Please refresh the page. If it keeps happening, let us know.") + "</p>" +
           "</div>";
  }

  /* ==================================================================
     OVERLAYS — toast + modal (single implementation, used everywhere)
     ================================================================== */

  function toastStack() {
    var stack = document.getElementById("ui-toasts");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "ui-toasts";
      stack.className = "ui-toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showToast(message, options) {
    var opts = options || {};
    var type = opts.type || "info";
    var el = document.createElement("div");
    el.className = "ui-toast ui-toast--" + type;
    el.innerHTML =
      icon(type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info") +
      "<div>" +
        (opts.title ? '<strong class="ui-toast-title">' + U.escape(opts.title) + "</strong>" : "") +
        "<span>" + U.escape(message) + "</span>" +
      "</div>" +
      '<button type="button" class="ui-toast-close" aria-label="Dismiss">' + icon("x") + "</button>";

    toastStack().appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-visible"); });

    var timer = setTimeout(dismiss, opts.duration || 5000);

    function dismiss() {
      clearTimeout(timer);
      el.classList.remove("is-visible");
      setTimeout(function () { el.remove(); }, 300);
    }

    el.querySelector(".ui-toast-close").addEventListener("click", dismiss);
    return dismiss;
  }

  var activeModal = null;

  function showModal(config) {
    var opts = config || {};
    closeModal();

    var el = document.createElement("div");
    el.className = "ui-modal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", opts.title || "Dialog");
    el.innerHTML =
      '<div class="ui-modal-dialog' + (opts.wide ? " ui-modal-dialog--wide" : "") + '">' +
        '<div class="ui-modal-head">' +
          "<div>" +
            '<h2 class="ui-modal-title">' + U.escape(opts.title || "") + "</h2>" +
            (opts.subtitle ? '<p class="ui-modal-subtitle">' + U.escape(opts.subtitle) + "</p>" : "") +
          "</div>" +
          '<button type="button" class="ui-modal-close" aria-label="Close dialog">' + icon("x") + "</button>" +
        "</div>" +
        '<div class="ui-modal-body">' + (opts.body || "") + "</div>" +
        (opts.footer ? '<div class="ui-modal-footer">' + opts.footer + "</div>" : "") +
      "</div>";

    document.body.appendChild(el);
    document.body.classList.add("is-locked");

    el.addEventListener("click", function (event) {
      if (event.target === el) closeModal();
    });
    el.querySelector(".ui-modal-close").addEventListener("click", closeModal);

    activeModal = el;
    el.__uiOnClose = typeof opts.onClose === "function" ? opts.onClose : null;
    if (typeof opts.onOpen === "function") opts.onOpen(el);

    /* Focus must wait until the dialog is actually rendered — an element
       behind `visibility: hidden` cannot take focus, so trapping it in the
       same tick would silently leave focus on the trigger. */
    requestAnimationFrame(function () {
      el.classList.add("is-open");
      requestAnimationFrame(function () {
        App.a11y.trapFocus(el);

        /* Applied *after* the trap, which focuses the first control by
           default. A working tool wants the caret in its input, not on the
           close button — but the trap has to run first to establish the
           restore point. */
        if (opts.autoFocus) {
          var target = el.querySelector(opts.autoFocus);
          if (target) {
            try { target.focus({ preventScroll: true }); }
            catch (err) { target.focus(); }
          }
        }
      });
    });

    return el;
  }

  function closeModal() {
    if (!activeModal) return;
    var el = activeModal;
    activeModal = null;
    if (el.__uiOnClose) el.__uiOnClose();
    el.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    App.a11y.releaseFocus();
    setTimeout(function () { el.remove(); }, 260);
  }

  /* ==================================================================
     LOOKUPS — label helpers so cards never hard-code category names
     ================================================================== */

  function categoryLabel(sourceName, categoryId) {
    var source = App.data.get(sourceName);
    var list = (source && source.categories) || [];
    var match = list.filter(function (c) { return c.id === categoryId; })[0];
    return match ? match.label : U.titleCase(String(categoryId || "").replace(/-/g, " "));
  }

  function typeLabel(sourceName, typeId) {
    var source = App.data.get(sourceName);
    var list = (source && source.types) || [];
    var match = list.filter(function (t) { return t.id === typeId; })[0];
    return match ? match.label : U.titleCase(String(typeId || "").replace(/-/g, " "));
  }

  function postUrl(post) {
    var pattern = App.data.get("blog", "settings.articleUrlPattern", "/pages/blog.html?post={slug}");
    return U.url(pattern.replace("{slug}", post.slug));
  }

  /* ==================================================================
     REGISTRY — card builders keyed by collection name, so the filter
     system can render any collection without knowing its shape.
     ================================================================== */
  var CARD_BUILDERS = {
    services: serviceCard,
    projects: projectCard,
    demos: demoCard,
    resources: resourceCard,
    tools: toolCard,
    blog: blogCard,
    testimonials: testimonialCard,
    websiteTypes: websiteTypeCard
  };

  App.components = {
    /* primitives */
    button: button,
    badge: badge,
    chip: chip,
    chips: chips,
    sectionHeader: sectionHeader,
    breadcrumb: breadcrumb,
    stat: stat,
    notice: notice,
    icon: icon,

    /* media */
    mockup: mockup,
    media: media,
    galleryItems: galleryItems,
    galleryFigure: galleryFigure,
    avatar: avatar,
    rating: rating,

    /* cards */
    serviceCard: serviceCard,
    projectCard: projectCard,
    demoCard: demoCard,
    resourceCard: resourceCard,
    toolCard: toolCard,
    blogCard: blogCard,
    testimonialCard: testimonialCard,
    websiteTypeCard: websiteTypeCard,
    valueItem: valueItem,
    featureCard: featureCard,
    processStep: processStep,
    cardFor: function (collection) { return CARD_BUILDERS[collection] || serviceCard; },

    /* composites */
    faqAccordion: faqAccordion,

    /* states */
    loadingState: loadingState,
    emptyState: emptyState,
    errorState: errorState,

    /* overlays */
    showToast: showToast,
    showModal: showModal,
    closeModal: closeModal,

    /* lookups */
    categoryLabel: categoryLabel,
    typeLabel: typeLabel,
    postUrl: postUrl
  };
})(window.Site);
