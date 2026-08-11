/* ==========================================================================
   SEO — title, meta, Open Graph, Twitter and structured data, generated from
   data/seo.json + data/pages.json + data/site.json.
   --------------------------------------------------------------------------
   No page writes its own meta tags. Change the domain once in site.json and
   every canonical, OG and schema URL follows.

   Honesty rules enforced here:
     · No Review / AggregateRating schema is ever emitted — the testimonials
       shipped with this template are marked as placeholders.
     · FAQPage schema is only emitted for questions actually rendered on the
       page, as the specification requires.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;

  function site() { return App.data.get("site") || {}; }
  function defaults() { return App.data.get("seo", "defaults", {}) || {}; }

  /** Turns "/pages/about.html" into "https://example.com/pages/about.html". */
  function absolute(path) {
    var origin = String(site().url || location.origin).replace(/\/+$/, "");
    if (!path) return origin + "/";
    if (/^https?:\/\//i.test(path)) return path;
    return origin + "/" + String(path).replace(/^\/+/, "");
  }

  function upsert(selector, create) {
    var el = document.head.querySelector(selector);
    if (!el) {
      el = create();
      document.head.appendChild(el);
    }
    return el;
  }

  function setMeta(name, content, isProperty) {
    if (!content) return;
    var attribute = isProperty ? "property" : "name";
    var el = upsert('meta[' + attribute + '="' + name + '"]', function () {
      var meta = document.createElement("meta");
      meta.setAttribute(attribute, name);
      return meta;
    });
    el.setAttribute("content", content);
  }

  function setLink(rel, href) {
    if (!href) return;
    var el = upsert('link[rel="' + rel + '"]', function () {
      var link = document.createElement("link");
      link.setAttribute("rel", rel);
      return link;
    });
    el.setAttribute("href", href);
  }

  function addSchema(id, data) {
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.textContent = JSON.stringify(data, null, 2);
    document.head.appendChild(script);
  }

  /* ==================================================================
     PAGE META
     ================================================================== */
  function apply(context) {
    var page = context.page || {};
    var pageSeo = page.seo || {};
    var base = defaults();
    var brand = site();

    var title = pageSeo.title || base.title;
    if (pageSeo.useTitleTemplate !== false && pageSeo.title && base.titleTemplate) {
      title = base.titleTemplate.replace("%s", pageSeo.title);
    }

    var description = pageSeo.description || base.description;
    var canonical = absolute(pageSeo.canonical || page.url || "/");
    var image = absolute(pageSeo.ogImage || U.get(base, "openGraph.image", ""));
    var keywords = pageSeo.keywords || base.keywords || [];

    document.title = title;
    document.documentElement.setAttribute("lang", base.language || "en");

    setMeta("description", description);
    setMeta("robots", pageSeo.robots || base.robots);
    setMeta("author", base.author);
    setMeta("keywords", keywords.join(", "));
    setMeta("publisher", base.publisher);
    setLink("canonical", canonical);

    /* Open Graph */
    setMeta("og:type", pageSeo.ogType || U.get(base, "openGraph.type", "website"), true);
    setMeta("og:site_name", U.get(base, "openGraph.siteName", brand.name), true);
    setMeta("og:title", pageSeo.ogTitle || title, true);
    setMeta("og:description", pageSeo.ogDescription || description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:locale", base.locale, true);
    setMeta("og:image", image, true);
    setMeta("og:image:alt", U.get(base, "openGraph.imageAlt", brand.name), true);
    setMeta("og:image:width", U.get(base, "openGraph.imageWidth", ""), true);
    setMeta("og:image:height", U.get(base, "openGraph.imageHeight", ""), true);
    setMeta("og:image:type", U.get(base, "openGraph.imageType", ""), true);

    /* Twitter / X */
    setMeta("twitter:card", U.get(base, "twitter.card", "summary_large_image"));
    setMeta("twitter:title", pageSeo.ogTitle || title);
    setMeta("twitter:description", pageSeo.ogDescription || description);
    setMeta("twitter:image", image);
    if (U.get(base, "twitter.site")) setMeta("twitter:site", base.twitter.site);
    if (U.get(base, "twitter.creator")) setMeta("twitter:creator", base.twitter.creator);

    setMeta("theme-color", base.themeColor);

    applyBaseSchema(context);
    if (U.get(page, "header.breadcrumb")) applyBreadcrumbSchema(page.header.breadcrumb);
    applyWebPageSchema(context, title, description, canonical);
  }

  /* ==================================================================
     STRUCTURED DATA
     ================================================================== */
  function applyBaseSchema(context) {
    var structured = App.data.get("seo", "structuredData", {}) || {};
    var business = App.data.get("seo", "businessInfo", {}) || {};
    var brand = site();
    var social = App.data.get("social") || {};

    var sameAs = Object.keys(social)
      .filter(function (key) {
        return social[key] && social[key].enabled && social[key].url && key !== "email";
      })
      .map(function (key) { return social[key].url; });

    if (U.get(structured, "organization.enabled", true)) {
      var orgConfig = structured.organization;
      var org = {
        "@context": "https://schema.org",
        "@type": U.get(orgConfig, "type", "ProfessionalService"),
        "@id": absolute("/") + "#organization",
        name: brand.name,
        alternateName: brand.shortName,
        legalName: business.legalName || brand.name,
        description: brand.description,
        url: absolute("/"),
        email: brand.email,
        telephone: brand.phone,
        slogan: brand.tagline,
        foundingDate: business.foundingDate,
        areaServed: U.get(orgConfig, "areaServed", "Worldwide"),
        serviceType: U.get(orgConfig, "serviceType", "Web Development"),
        priceRange: U.get(orgConfig, "priceRange", "$$"),
        knowsAbout: business.knowsAbout || [
          "Web development", "Website design", "Web applications",
          "E-commerce development", "Technical SEO", "Website performance"
        ]
      };

      if (U.get(orgConfig, "additionalTypes")) {
        org.additionalType = orgConfig.additionalTypes.map(function(t) {
          return "https://schema.org/" + t;
        });
      }

      if (sameAs.length) org.sameAs = sameAs;
      
      if (brand.location || business.areaServed) {
        org.address = {
          "@type": "PostalAddress",
          addressCountry: U.get(business, "areaServed.name", "IN")
        };
      }

      if (U.get(orgConfig, "includeContactPoint")) {
        org.contactPoint = {
          "@type": "ContactPoint",
          contactType: orgConfig.contactType || "customer service",
          email: brand.email,
          telephone: brand.phone,
          availableLanguage: orgConfig.availableLanguage || ["English"]
        };
      }

      if (brand.logo && brand.logo.src) {
        org.logo = {
          "@type": "ImageObject",
          url: absolute(brand.logo.src),
          width: brand.logo.width,
          height: brand.logo.height
        };
      }

      addSchema("schema-organization", org);
    }

    if (U.get(structured, "website.enabled", true)) {
      var websiteSchema = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": absolute("/") + "#website",
        name: brand.name,
        url: absolute("/"),
        description: brand.description,
        publisher: { "@id": absolute("/") + "#organization" },
        inLanguage: defaults().language || "en"
      };

      if (U.get(structured, "website.searchAction")) {
        var searchConfig = U.get(structured, "website.potentialAction");
        if (searchConfig) {
          websiteSchema.potentialAction = {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: searchConfig.target.urlTemplate
            },
            "query-input": searchConfig["query-input"]
          };
        }
      }

      addSchema("schema-website", websiteSchema);
    }

    /* Services offered — derived from services.json, never duplicated */
    var services = App.data.items("services");
    if (context.pageId === "home" && services.length && U.get(structured, "service.enabled")) {
      addSchema("schema-services", {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Services",
        itemListElement: U.activeSorted(services).map(function (service, index) {
          return {
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "Service",
              name: service.title,
              description: service.shortDescription,
              url: absolute(service.url),
              provider: { "@id": absolute("/") + "#organization" }
            }
          };
        })
      });
    }
  }

  function applyBreadcrumbSchema(crumbs) {
    if (!U.get(App.data.get("seo"), "structuredData.breadcrumbs.enabled", true)) return;

    addSchema("schema-breadcrumb", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map(function (crumb, index) {
        var entry = {
          "@type": "ListItem",
          position: index + 1,
          name: crumb.label
        };
        if (crumb.url) entry.item = absolute(crumb.url);
        return entry;
      })
    });
  }

  function applyWebPageSchema(context, title, description, url) {
    var config = App.data.get("seo", "structuredData.webPage", {});
    if (!config.enabled) return;

    var pageId = context.pageId || "home";
    var pageType = config.defaultType || "WebPage";

    // Specific page types
    if (pageId === "about") pageType = "AboutPage";
    else if (pageId === "contact") pageType = "ContactPage";
    else if (pageId === "faq") pageType = "FAQPage";
    else if (pageId === "blog") pageType = "CollectionPage";

    var schema = {
      "@context": "https://schema.org",
      "@type": pageType,
      "@id": url + "#webpage",
      url: url,
      name: title,
      description: description,
      isPartOf: { "@id": absolute("/") + "#website" },
      inLanguage: defaults().language || "en",
      datePublished: new Date().toISOString().split('T')[0],
      dateModified: new Date().toISOString().split('T')[0]
    };

    var image = absolute(U.get(defaults(), "openGraph.image", ""));
    if (image) {
      schema.primaryImageOfPage = {
        "@type": "ImageObject",
        url: image
      };
    }

    addSchema("schema-webpage", schema);
  }

  function addFaqSchema(items) {
    var config = App.data.get("seo", "structuredData.faqPage", {}) || {};
    if (config.enabled === false) return;

    var pageId = document.body.getAttribute("data-page");
    if (config.onPages && config.onPages.indexOf(pageId) === -1) return;
    if (!items || !items.length) return;

    addSchema("schema-faq", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map(function (item) {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        };
      })
    });
  }

  function addArticleSchema(post) {
    if (!post) return;
    var brand = site();
    var config = App.data.get("seo", "structuredData.article", {});
    if (config.enabled === false) return;

    var schema = {
      "@context": "https://schema.org",
      "@type": config.defaultType || "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.modifiedDate || post.date,
      author: {
        "@type": "Organization",
        name: brand.name,
        url: absolute("/")
      },
      publisher: { "@id": absolute("/") + "#organization" },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": absolute(App.components.postUrl(post).replace(App.config.base, "/"))
      },
      inLanguage: defaults().language || "en"
    };

    // Add image if available
    if (config.includeImages && post.image) {
      schema.image = {
        "@type": "ImageObject",
        url: absolute(post.image),
        width: 1200,
        height: 630
      };
    } else if (config.includeImages) {
      // Fallback to default OG image
      var defaultImage = absolute(U.get(defaults(), "openGraph.image", ""));
      if (defaultImage) {
        schema.image = {
          "@type": "ImageObject",
          url: defaultImage,
          width: U.get(defaults(), "openGraph.imageWidth", 1200),
          height: U.get(defaults(), "openGraph.imageHeight", 630)
        };
      }
    }

    // Add word count if enabled and available
    if (config.wordCountEnabled && post.content) {
      var wordCount = 0;
      post.content.forEach(function(block) {
        if (block.type === "paragraph" && block.text) {
          wordCount += block.text.split(/\s+/).length;
        }
      });
      if (wordCount > 0) schema.wordCount = wordCount;
    }

    // Add keywords if available
    if (post.tags && post.tags.length) {
      schema.keywords = post.tags.join(", ");
    }

    addSchema("schema-article", schema);
  }

  App.seo = {
    apply: apply,
    setMeta: setMeta,
    setLink: setLink,
    addSchema: addSchema,
    addFaqSchema: addFaqSchema,
    addArticleSchema: addArticleSchema,
    absolute: absolute
  };
})(window.Site);
