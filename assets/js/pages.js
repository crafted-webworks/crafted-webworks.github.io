/* ==========================================================================
   Pages — per-page configuration and initialisation.
   --------------------------------------------------------------------------
   The same application runs on every page. `<body data-page="…">` tells it
   which entry of pages.json to use; this module handles the few cases that
   need more than the standard section pipeline.

   Today that means one thing: /pages/blog.html?post=slug renders a full
   article from blog.json instead of the listing — so publishing a post
   still means adding data, not creating an HTML file.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;
  var icon = App.icons.render.bind(App.icons);

  /* ==================================================================
     BLOG ARTICLE — rendered from structured JSON content blocks
     ================================================================== */
  function renderBlock(block) {
    switch (block.type) {
      case "heading":
        var level = U.clamp(block.level || 2, 2, 4);
        return "<h" + level + ">" + U.richText(block.text) + "</h" + level + ">";

      case "list":
        var tag = block.style === "ordered" ? "ol" : "ul";
        return "<" + tag + ">" +
          (block.items || []).map(function (item) { return "<li>" + U.richText(item) + "</li>"; }).join("") +
          "</" + tag + ">";

      case "quote":
        return "<blockquote>" + U.escape(block.text) +
          (block.attribution ? "<cite>" + U.escape(block.attribution) + "</cite>" : "") +
          "</blockquote>";

      case "code":
        return '<pre><code class="language-' + U.attr(block.language || "text") + '">' +
               U.escape(block.code) + "</code></pre>";

      case "callout":
        return '<aside class="article-callout article-callout--' + U.attr(block.style || "info") + '">' +
                 icon(block.style === "warning" ? "alert-circle" : "info") +
                 "<div>" +
                   (block.title ? '<strong class="article-callout-title">' + U.escape(block.title) + "</strong>" : "") +
                   U.escape(block.text) +
                 "</div>" +
               "</aside>";

      case "image":
        return '<figure class="mt-lg mb-lg"><img src="' + U.attr(U.url(block.src)) + '" alt="' +
               U.attr(block.alt || "") + '" loading="lazy" decoding="async">' +
               (block.caption ? "<figcaption>" + U.escape(block.caption) + "</figcaption>" : "") +
               "</figure>";

      case "paragraph":
      default:
        return "<p>" + U.richText(block.text) + "</p>";
    }
  }

  var articleSection = {
    needs: ["blog", "site"],

    render: function (options, context) {
      var post = context.post;
      if (!post) {
        return '<section class="section"><div class="container">' +
               C.emptyState({
                 icon: "file-text",
                 title: "Article not found",
                 text: "That link may be out of date.",
                 action: { label: "Back to the blog", url: "/pages/blog.html" }
               }) + "</div></section>";
      }

      var related = U.activeSorted(App.data.items("blog"))
        .filter(function (item) { return item.id !== post.id && item.category === post.category; })
        .slice(0, 3);

      if (related.length < 3) {
        U.activeSorted(App.data.items("blog")).forEach(function (item) {
          if (item.id !== post.id && related.indexOf(item) === -1 && related.length < 3) related.push(item);
        });
      }

      return '<section class="section" id="article">' +
               '<div class="container">' +
                 '<article class="article">' +
                   '<header class="article-head">' +
                     C.badge(C.categoryLabel("blog", post.category), "primary") +
                     '<h1 class="article-title">' + U.escape(post.title) + "</h1>" +
                     '<p class="article-excerpt">' + U.escape(post.excerpt) + "</p>" +
                     '<div class="article-meta">' +
                       '<time datetime="' + U.attr(U.isoDate(post.date)) + '">' + U.escape(U.formatDate(post.date)) + "</time>" +
                       '<span class="dot"></span><span>' + U.escape(post.readingTime || "") + "</span>" +
                       '<span class="dot"></span><span>' + U.escape(App.data.get("site", "name", "")) + "</span>" +
                     "</div>" +
                   "</header>" +
                   '<div class="article-body">' +
                     (post.content || []).map(renderBlock).join("") +
                   "</div>" +
                   '<footer class="article-footer">' +
                     '<div class="cluster cluster--sm">' +
                       (post.tags || []).map(function (tag) { return C.badge(tag); }).join("") +
                     "</div>" +
                     C.button({ label: "Back to all articles", url: "/pages/blog.html", variant: "btn-secondary", icon: "arrow-right" }) +
                   "</footer>" +
                 "</article>" +
               "</div>" +
             "</section>" +

             (related.length ?
               '<section class="section section--alt" id="related">' +
                 '<div class="container">' +
                   C.sectionHeader({ eyebrow: "Keep reading", title: "Related <em>articles</em>" }) +
                   '<div class="grid grid--auto-lg">' + related.map(C.blogCard).join("") + "</div>" +
                 "</div>" +
               "</section>" : "");
    }
  };

  App.sections.register("blog-article", articleSection);

  /* ==================================================================
     PROJECT CASE STUDY
     Rendered from projects.json at /pages/projects.html?project=slug —
     the same data-driven pattern as the blog article, so publishing a case
     study means filling in a `caseStudy` block, not building a page.
     ================================================================== */
  var caseSection = {
    needs: ["projects", "site"],

    render: function (options, context) {
      var project = context.project;

      if (!project) {
        return '<section class="section"><div class="container">' +
               C.emptyState({
                 icon: "briefcase",
                 title: "Project not found",
                 text: "That link may be out of date.",
                 action: { label: "Back to all projects", url: "/pages/projects.html" }
               }) + "</div></section>";
      }

      var study = project.caseStudy || {};

      var facts = [
        { label: "Client type", value: project.clientType },
        { label: "Year", value: project.year },
        { label: "Category", value: C.categoryLabel("projects", project.category) },
        { label: "Duration", value: study.duration }
      ].filter(function (f) { return f.value; });

      /* Empty chapters are dropped rather than rendered as a heading with
         nothing under it — a project still in build has no outcome yet, and
         inventing one would be the easiest lie on the whole site. */
      var chapters = [
        { label: "Brief", text: study.brief },
        { label: "Challenge", text: study.challenge },
        { label: "Approach", text: study.approach },
        { label: "Outcome", text: study.outcome }
      ].filter(function (c) { return c.text && String(c.text).trim(); });

      var related = U.activeSorted(App.data.items("projects"))
        .filter(function (item) { return item.id !== project.id; })
        .slice(0, 3);

      /* "#" is the placeholder this data file uses for a project with no
         public URL yet, so it must not become a link that goes nowhere. */
      var liveUrl = project.url && project.url !== "#" ? project.url : "";
      var shots = C.galleryItems(project);

      return '<section class="section case-hero" id="case">' +
               '<div class="container">' +
                 '<div class="case-intro">' +
                   C.badge(C.categoryLabel("projects", project.category), "primary") +
                   '<h1 class="case-title">' + U.escape(project.title) + "</h1>" +
                   '<p class="case-lead">' + U.escape(project.description || project.shortDescription) + "</p>" +
                   (liveUrl
                     ? '<div class="case-actions">' +
                         C.button({
                           label: "Visit live site",
                           url: liveUrl,
                           variant: "btn-gradient",
                           icon: "external-link"
                         }) +
                       "</div>"
                     : "") +
                 "</div>" +

                 '<div class="case-media" data-reveal="scale">' +
                   C.media(project, project.title + " — project visual") +
                 "</div>" +

                 '<dl class="case-facts">' +
                   facts.map(function (f) {
                     return "<div><dt>" + U.escape(f.label) + "</dt><dd>" + U.escape(f.value) + "</dd></div>";
                   }).join("") +
                   (study.role && study.role.length
                     ? "<div><dt>Our role</dt><dd>" + U.escape(study.role.join(", ")) + "</dd></div>"
                     : "") +
                 "</dl>" +
               "</div>" +
             "</section>" +

             (chapters.length
               ? '<section class="section section--alt" id="case-story">' +
                   '<div class="container">' +
                     '<div class="case-chapters">' +
                       chapters.map(function (chapter, i) {
                         /* Process chapter text with full HTML support:
                            - \n\n = paragraph breaks
                            - **text** = bold
                            - ### heading = h3
                            - - list item = ul/li
                         */
                         var text = String(chapter.text || "");
                         var output = '';
                         var lines = text.split('\n');
                         var inList = false;
                         var currentParagraph = '';
                         
                         for (var j = 0; j < lines.length; j++) {
                           var line = lines[j].trim();
                           
                           if (!line) {
                             // Empty line - close paragraph or list
                             if (currentParagraph) {
                               var formatted = U.escape(currentParagraph).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                               output += '<p class="case-chapter-text">' + formatted + '</p>';
                               currentParagraph = '';
                             }
                             if (inList) {
                               output += '</ul>';
                               inList = false;
                             }
                             continue;
                           }
                           
                           // Check for heading (###)
                           if (line.match(/^###\s+(.+)/)) {
                             if (currentParagraph) {
                               output += '<p class="case-chapter-text">' + U.escape(currentParagraph) + '</p>';
                               currentParagraph = '';
                             }
                             if (inList) {
                               output += '</ul>';
                               inList = false;
                             }
                             var heading = line.replace(/^###\s+/, '');
                             output += '<h3 class="case-chapter-subheading">' + U.escape(heading) + '</h3>';
                             continue;
                           }
                           
                           // Check for list item (- or •)
                           if (line.match(/^[-•]\s+(.+)/)) {
                             if (currentParagraph) {
                               output += '<p class="case-chapter-text">' + U.escape(currentParagraph) + '</p>';
                               currentParagraph = '';
                             }
                             if (!inList) {
                               output += '<ul class="case-chapter-list">';
                               inList = true;
                             }
                             var item = line.replace(/^[-•]\s+/, '');
                             var formatted = U.escape(item).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                             output += '<li>' + formatted + '</li>';
                             continue;
                           }
                           
                           // Regular text - add to current paragraph
                           currentParagraph += (currentParagraph ? ' ' : '') + line;
                         }
                         
                         // Close any remaining open elements
                         if (currentParagraph) {
                           var formatted = U.escape(currentParagraph).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                           output += '<p class="case-chapter-text">' + formatted + '</p>';
                         }
                         if (inList) {
                           output += '</ul>';
                         }
                         
                         return '<article class="case-chapter" data-reveal="up">' +
                                  '<span class="case-chapter-index">' + ("0" + (i + 1)).slice(-2) + "</span>" +
                                  '<div><h2 class="case-chapter-title">' + U.escape(chapter.label) + "</h2>" +
                                  output + "</div>" +
                                "</article>";
                       }).join("") +
                     "</div>" +
                   "</div>" +
                 "</section>"
               : "") +

             '<section class="section" id="case-detail">' +
               '<div class="container">' +
                 '<div class="case-detail-grid">' +
                   (project.highlights && project.highlights.length
                     ? "<div data-reveal=\"up\"><h2 class=\"case-sub\">What it does</h2>" +
                       '<ul class="case-list">' + project.highlights.map(function (h) {
                         return "<li>" + icon("check") + "<span>" + U.escape(h) + "</span></li>";
                       }).join("") + "</ul></div>"
                     : "") +
                   (project.technologies && project.technologies.length
                     ? "<div data-reveal=\"up\"><h2 class=\"case-sub\">Built with</h2>" +
                       C.chips(project.technologies) + "</div>"
                     : "") +
                 "</div>" +
                 '<div class="case-actions">' +
                   C.button({ label: "Start a project like this", url: "/pages/contact.html", variant: "btn-gradient", icon: "arrow-right" }) +
                   C.button({ label: "All projects", url: "/pages/projects.html", variant: "btn-secondary" }) +
                 "</div>" +
               "</div>" +
             "</section>" +

             (shots.length
               ? '<section class="section" id="case-gallery">' +
                   '<div class="container">' +
                     C.sectionHeader({ eyebrow: "Screens", title: "A closer <em>look</em>" }) +
                     '<div class="case-shots">' + shots.map(C.galleryFigure).join("") + "</div>" +
                   "</div>" +
                 "</section>"
               : "") +

             (related.length
               ? '<section class="section section--alt" id="case-related">' +
                   '<div class="container">' +
                     C.sectionHeader({ eyebrow: "More work", title: "Other <em>projects</em>" }) +
                     '<div class="grid grid--auto-lg">' + related.map(C.projectCard).join("") + "</div>" +
                   "</div>" +
                 "</section>"
               : "");
    },

    /* Stills open full size in the existing modal. The handler reads the src
       off the thumbnail rather than being handed the project, so it needs no
       data threaded through mount() — and it stays correct if the gallery is
       ever rendered from somewhere else. */
    mount: function (el) {
      U.$$("[data-lightbox]", el).forEach(function (trigger) {
        trigger.addEventListener("click", function () {
          var img = trigger.querySelector("img");
          if (!img) return;

          C.showModal({
            title: img.alt || "Project image",
            wide: true,
            body: '<img class="case-lightbox-img" src="' +
                    U.attr(img.currentSrc || img.src) + '" alt="' + U.attr(img.alt) + '">'
          });
        });
      });
    }
  };

  App.sections.register("project-case", caseSection);

  /* ==================================================================
     RESOURCE DETAIL
     Rendered from resources.json at /pages/resources.html?resource=slug.
     Same data-driven pattern as the blog article and the case study, so a
     new resource is one JSON entry — no page, no route, no template.
     ================================================================== */
  function renderResourceBlock(block) {
    switch (block.type) {
      case "heading":
        return "<h2>" + U.richText(block.text) + "</h2>";

      case "checklist":
        /* Real checkboxes: these are working documents, and being able to
           tick items off while you go through a launch is the entire point.
           State is deliberately not persisted — a checklist you half
           completed last month is worse than a clean one. */
        return '<section class="res-check">' +
                 (block.title ? '<h3 class="res-check-title">' + U.escape(block.title) + "</h3>" : "") +
                 '<ul class="res-check-list">' +
                   (block.items || []).map(function (item, i) {
                     var id = "chk-" + U.slugify(block.title || "list") + "-" + i;
                     return "<li>" +
                              '<input type="checkbox" id="' + id + '">' +
                              '<label for="' + id + '">' + U.richText(item) + "</label>" +
                            "</li>";
                   }).join("") +
                 "</ul>" +
               "</section>";

      case "links":
        return '<section class="res-links">' +
                 (block.title ? '<h3 class="res-check-title">' + U.escape(block.title) + "</h3>" : "") +
                 "<ul>" +
                   (block.items || []).map(function (link) {
                     return '<li><a href="' + U.attr(link.url) + '" target="_blank" rel="noopener noreferrer">' +
                              U.escape(link.label) + icon("arrow-up-right") +
                            "</a></li>";
                   }).join("") +
                 "</ul>" +
               "</section>";

      case "list":
        return "<ul>" + (block.items || []).map(function (i) {
          return "<li>" + U.richText(i) + "</li>";
        }).join("") + "</ul>";

      case "callout":
        return '<aside class="article-callout article-callout--' + U.attr(block.style || "info") + '">' +
                 icon(block.style === "warning" ? "alert-circle" : "info") +
                 "<div>" +
                   (block.title ? '<strong class="article-callout-title">' + U.escape(block.title) + "</strong>" : "") +
                   U.escape(block.text) +
                 "</div>" +
               "</aside>";

      case "paragraph":
      default:
        return "<p>" + U.richText(block.text) + "</p>";
    }
  }

  var resourceSection = {
    needs: ["resources", "site"],

    render: function (options, context) {
      var resource = context.resource;

      if (!resource) {
        return '<section class="section"><div class="container">' +
               C.emptyState({
                 icon: "book-open",
                 title: "Resource not found",
                 text: "That link may be out of date.",
                 action: { label: "All resources", url: "/pages/resources.html" }
               }) + "</div></section>";
      }

      var all = U.activeSorted(App.data.items("resources"));
      var related = all.filter(function (item) {
        return item.id !== resource.id && item.category === resource.category;
      }).slice(0, 3);

      if (related.length < 3) {
        all.forEach(function (item) {
          if (item.id !== resource.id && related.indexOf(item) === -1 && related.length < 3) related.push(item);
        });
      }

      return '<section class="section" id="resource">' +
               '<div class="container">' +
                 '<article class="article res-article">' +
                   '<header class="article-head">' +
                     C.badge(C.typeLabel("resources", resource.type), "accent") +
                     '<h1 class="article-title">' + U.escape(resource.title) + "</h1>" +
                     '<p class="article-excerpt">' + U.escape(resource.description) + "</p>" +
                     '<div class="article-meta">' +
                       "<span>" + U.escape(C.categoryLabel("resources", resource.category)) + "</span>" +
                       '<span class="dot"></span><span>' + U.escape(resource.readingTime || "") + "</span>" +
                       '<span class="dot"></span><span>Free to use</span>' +
                     "</div>" +
                   "</header>" +

                   '<div class="article-body">' +
                     (resource.content || []).map(renderResourceBlock).join("") +
                   "</div>" +

                   '<footer class="article-footer">' +
                     '<div class="cluster cluster--sm">' +
                       (resource.tags || []).map(function (tag) { return C.badge(tag); }).join("") +
                     "</div>" +
                     C.button({ label: "All resources", url: "/pages/resources.html",
                                variant: "btn-secondary", icon: "arrow-right" }) +
                   "</footer>" +
                 "</article>" +
               "</div>" +
             "</section>" +

             (related.length
               ? '<section class="section section--alt" id="resource-related">' +
                   '<div class="container">' +
                     C.sectionHeader({ eyebrow: "Also useful", title: "More <em>resources</em>" }) +
                     '<div class="grid grid--auto-md">' + related.map(C.resourceCard).join("") + "</div>" +
                   "</div>" +
                 "</section>"
               : "");
    }
  };

  App.sections.register("resource-detail", resourceSection);

  /* ==================================================================
     PAGE CONFIGURATION HOOKS
     Each hook may return a modified page object (and may attach extra
     values to `context` for the sections to use).
     ================================================================== */
  var HOOKS = {

    resources: function (page, context) {
      var slug = U.query("resource");
      if (!slug) return page;

      var resource = App.data.items("resources").filter(function (item) {
        return item.slug === slug;
      })[0];

      context.resource = resource || null;

      return Object.assign({}, page, {
        sections: ["page-header", "resource-detail"],
        header: {
          eyebrow: "",
          title: "",
          breadcrumb: [
            { label: "Home", url: "/" },
            { label: "Resources", url: "/pages/resources.html" },
            { label: resource ? resource.title : "Not found" }
          ]
        },
        seo: resource
          ? {
              title: resource.title,
              description: resource.description,
              canonical: "/pages/resources.html?resource=" + resource.slug
            }
          : { title: "Resource not found", robots: "noindex, follow" }
      });
    },

    projects: function (page, context) {
      var slug = U.query("project");
      if (!slug) return page;

      var project = App.data.items("projects").filter(function (item) {
        return item.slug === slug;
      })[0];

      context.project = project || null;

      return Object.assign({}, page, {
        sections: ["page-header", "project-case"],
        header: {
          /* The case study owns the <h1>; the header carries the trail only */
          eyebrow: "",
          title: "",
          breadcrumb: [
            { label: "Home", url: "/" },
            { label: "Projects", url: "/pages/projects.html" },
            { label: project ? project.title : "Not found" }
          ]
        },
        seo: project
          ? {
              title: project.title + " — Case Study",
              description: project.shortDescription || project.description,
              canonical: "/pages/projects.html?project=" + project.slug,
              ogType: "article"
            }
          : { title: "Project not found", robots: "noindex, follow" }
      });
    },

    blog: function (page, context) {
      var slug = U.query("post");
      if (!slug) return page;

      var post = App.data.items("blog").filter(function (item) {
        return item.slug === slug && item.published !== false;
      })[0];

      context.post = post || null;

      /* Swap the listing for the article view, entirely from data */
      var clone = Object.assign({}, page, {
        sections: ["page-header", "blog-article"],
        header: {
          /* No eyebrow or title here — the article owns both, and repeating
             the category would just add height for nothing. */
          eyebrow: "",
          title: "",
          breadcrumb: [
            { label: "Home", url: "/" },
            { label: "Blog", url: "/pages/blog.html" },
            { label: post ? post.title : "Not found" }
          ]
        },
        seo: post
          ? {
              title: U.get(post, "seo.title", post.title),
              description: U.get(post, "seo.description", post.excerpt),
              canonical: "/pages/blog.html?post=" + post.slug,
              ogType: "article"
            }
          : { title: "Article not found", robots: "noindex, follow" }
      });

      /* The article renders its own <h1>, so the page header stays minimal */
      clone.header.title = "";
      return clone;
    }
  };

  App.pages = {
    hooks: HOOKS,

    /** Applied by app.js before any section renders. */
    configure: function (pageId, page, context) {
      var hook = HOOKS[pageId];
      if (typeof hook !== "function") return page;
      try {
        return hook(page, context) || page;
      } catch (error) {
        App.log.error('Page hook "' + pageId + '" failed', error);
        return page;
      }
    },

    /** Runs after all sections are in the DOM. */
    init: function (context) {
      /* Tool cards can appear on more than one page — bind once, globally */
      App.tools.bind(document.body);

      /* Article view emits its own structured data */
      if (context.pageId === "blog" && context.post) {
        App.seo.addArticleSchema(context.post);
      }

      /* Any contact form rendered outside the contact section */
      App.forms.init();

      /** Extra data sources needed by hooks that run before sections load */
      App.emit("page:ready", context);
    },

    /** Data a page hook needs loaded up front. */
    requires: function (pageId) {
      if (pageId === "blog") return ["blog"];
      if (pageId === "projects") return ["projects"];
      if (pageId === "resources") return ["resources"];
      return [];
    },

    register: function (pageId, hook) {
      HOOKS[pageId] = hook;
      return App.pages;
    }
  };
})(window.Site);
