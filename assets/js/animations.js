/* ==========================================================================
   Motion — scroll reveal, counters, meters, magnetic buttons, parallax.
   --------------------------------------------------------------------------
   Powered by Motion One (window.Motion), the framework-agnostic engine written
   by the author of Framer Motion. Framer Motion is React-only and this project
   is deliberately framework-free, so this is the equivalent: the same spring
   and stagger model, ~5KB, no virtual DOM required.

   Everything here is progressive. If the CDN is blocked, `Motion` is undefined
   and every element is simply shown at full opacity — the page is never left
   half-faded because an animation library didn't arrive.

   Elements opt in with [data-reveal], [data-counter], [data-meter],
   [data-magnetic] or [data-parallax]. New sections animate for free.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var settings = App.config.reveal;

  var M = null;          /* window.Motion, once confirmed present */
  var reduced = false;
  var counterObserver = null;

  /* Springs tuned once, reused everywhere — consistent motion is most of what
     makes an interface feel authored rather than assembled. */
  var SPRING_SOFT = { duration: 0.9, easing: [0.16, 1, 0.3, 1] };
  var SPRING_SNAP = { duration: 0.5, easing: [0.16, 1, 0.3, 1] };

  var OFFSETS = {
    up:    { transform: ["translateY(28px)", "none"] },
    down:  { transform: ["translateY(-22px)", "none"] },
    left:  { transform: ["translateX(32px)", "none"] },
    right: { transform: ["translateX(-32px)", "none"] },
    scale: { transform: ["scale(0.96)", "none"] },
    fade:  {}
  };

  /* ==================================================================
     SCROLL REVEAL
     ================================================================== */
  function showNow(el) {
    el.style.opacity = "1";
    el.style.transform = "none";
    el.classList.add("is-revealed");
  }

  function revealGroups(elements) {
    /* Siblings reveal as a wave rather than all at once. Grouping by parent
       keeps the stagger meaningful — a grid ripples, unrelated blocks don't. */
    var groups = new Map();
    elements.forEach(function (el) {
      var parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });
    return groups;
  }

  function scanReveal(scope) {
    var elements = U.$$("[data-reveal]", scope || document).filter(function (el) {
      return !el.__uiObserved && !el.classList.contains("is-revealed");
    });

    if (!elements.length) return;

    if (reduced || !M) {
      elements.forEach(showNow);
      return;
    }

    revealGroups(elements).forEach(function (children) {
      children.forEach(function (el, index) {
        el.__uiObserved = true;

        var kind = el.getAttribute("data-reveal") || "up";
        var motion = OFFSETS[kind] || OFFSETS.up;
        var delay = Math.min(index * (settings.stagger / 1000), settings.maxStagger / 1000);

        M.inView(el, function () {
          M.animate(
            el,
            Object.assign({ opacity: [0, 1] }, motion),
            Object.assign({ delay: delay }, SPRING_SOFT)
          );
          el.classList.add("is-revealed");
          return function () {};   /* run once — no re-hide on scroll out */
        }, { amount: settings.threshold, margin: "0px 0px -8% 0px" });
      });
    });
  }

  /* ==================================================================
     SAFETY NET
     IntersectionObserver reports at frame boundaries, so a fast or
     programmatic scroll can jump past an element without ever firing its
     callback — leaving real content stuck at opacity 0. That is a far worse
     outcome than a missed animation, so anything that is on screen and still
     unrevealed gets shown outright.

     Motion adds `.is-revealed` synchronously when it takes an element, so
     this can never race an animation that is already running.
     ================================================================== */
  function initSafetyNet() {
    if (reduced || !M) return;

    var sweep = U.throttle(function () {
      var height = window.innerHeight;
      U.$$("[data-reveal]:not(.is-revealed)").forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top < height && rect.bottom > 0) showNow(el);
      });
    }, 250);

    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("resize", sweep, { passive: true });

    /* One delayed pass catches anything that was on screen at load but never
       triggered — e.g. an observer registered after the element painted. */
    setTimeout(sweep, 1500);
  }

  /* ==================================================================
     HEADLINE — line-by-line clip reveal
     The hero title arrives a line at a time from behind its own baseline,
     which is the one place a little theatre is worth the bytes.
     ================================================================== */
  function revealHeadline(scope) {
    var title = U.$(".hero-title", scope || document);
    if (!title || title.__uiSplit) return;
    title.__uiSplit = true;

    var lines = U.$$("span", title);
    if (!lines.length) return;

    if (reduced || !M) {
      lines.forEach(function (line) { line.style.opacity = "1"; });
      return;
    }

    lines.forEach(function (line) {
      /* Each line gets a clipping wrapper so the text slides out of a mask.
         The wrapper is a <span> too (a <div> inside an <h1> is invalid), which
         means the CSS rule that hides `.hero-title span` would hide the mask
         as well — so its opacity is pinned inline, where it outranks the
         stylesheet. Without this the text animates to visible *inside* an
         invisible box. */
      var mask = document.createElement("span");
      mask.style.cssText =
        "display:block;overflow:hidden;opacity:1;padding-bottom:0.08em;margin-bottom:-0.08em";
      line.parentNode.insertBefore(mask, line);
      mask.appendChild(line);
      line.style.display = "block";
    });

    M.animate(
      lines,
      { opacity: [0, 1], transform: ["translateY(105%)", "none"] },
      { delay: M.stagger(0.09, { start: 0.05 }), duration: 1, easing: [0.16, 1, 0.3, 1] }
    );
  }

  /* ==================================================================
     MAGNETIC BUTTONS
     A few pixels of pull toward the cursor. Barely perceptible on its own,
     but it is the difference between a control that feels inert and one
     that feels responsive. Pointer-precision devices only.
     ================================================================== */
  function initMagnetic(scope) {
    if (reduced || !M) return;
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    U.$$("[data-magnetic], .btn-primary, .btn-gradient, .btn-accent", scope || document)
      .forEach(function (el) {
        if (el.__uiMagnetic) return;
        el.__uiMagnetic = true;

        var strength = parseFloat(el.getAttribute("data-magnetic")) || 0.22;

        el.addEventListener("pointermove", function (event) {
          var rect = el.getBoundingClientRect();
          var x = (event.clientX - rect.left - rect.width / 2) * strength;
          var y = (event.clientY - rect.top - rect.height / 2) * strength;
          M.animate(el, { transform: "translate(" + x + "px," + y + "px)" }, { duration: 0.35, easing: "ease-out" });
        });

        el.addEventListener("pointerleave", function () {
          M.animate(el, { transform: "none" }, { duration: 0.6, easing: [0.34, 1.4, 0.5, 1] });
        });
      });
  }

  /* ==================================================================
     PARALLAX — scroll-linked, transform-only
     ================================================================== */
  function initParallax(scope) {
    if (reduced || !M || !M.scroll) return;

    U.$$("[data-parallax], .hero-visual", scope || document).forEach(function (el) {
      if (el.__uiParallax) return;
      el.__uiParallax = true;

      var distance = parseFloat(el.getAttribute("data-parallax")) || 60;

      try {
        M.scroll(
          M.animate(el, { transform: ["none", "translateY(-" + distance + "px)"] }, { easing: "linear" }),
          { target: el, offset: ["start end", "end start"] }
        );
      } catch (err) {
        /* Older Motion builds expose a different scroll signature — the page
           is perfectly fine without parallax, so fail quietly. */
        App.log.warn("Parallax unavailable", err);
      }
    });
  }

  /* ==================================================================
     COUNTERS & METERS
     ================================================================== */
  function animateCounter(el) {
    var target = parseFloat(el.getAttribute("data-counter"));
    if (isNaN(target)) return;

    if (reduced) {
      el.textContent = U.formatNumber(target);
      return;
    }

    var duration = 1400;
    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 4);
      var value = target * eased;
      el.textContent = U.formatNumber(target % 1 === 0 ? Math.round(value) : value.toFixed(1));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function fillMeter(el) {
    var value = parseFloat(el.getAttribute("data-meter"));
    if (isNaN(value)) return;
    el.style.width = U.clamp(value, 0, 100) + "%";
  }

  function scanCounters(scope) {
    var elements = U.$$("[data-counter], [data-meter]", scope || document)
      .filter(function (el) { return !el.__uiCounted; });

    elements.forEach(function (el) {
      el.__uiCounted = true;

      var run = function () {
        if (el.hasAttribute("data-counter")) animateCounter(el);
        if (el.hasAttribute("data-meter")) fillMeter(el);
      };

      if (!counterObserver) return run();
      counterObserver.observe(el);
      el.__uiRun = run;
    });
  }

  /* ==================================================================
     SVG LINE DRAWING
     ================================================================== */
  function scanPaths(scope) {
    U.$$(".draw-path", scope || document).forEach(function (path) {
      if (path.__uiMeasured || typeof path.getTotalLength !== "function") return;
      path.__uiMeasured = true;
      try {
        path.style.setProperty("--path-length", Math.ceil(path.getTotalLength()));
      } catch (err) { /* detached or unsupported — keep the CSS default */ }
    });
  }

  /* ==================================================================
     PUBLIC API
     ================================================================== */
  App.animations = {
    init: function () {
      reduced = U.prefersReducedMotion();
      M = window.Motion || null;

      if (!M) App.log.warn("Motion One unavailable — content renders without animation.");
      if (!App.data.get("site", "features.scrollAnimations", true)) reduced = true;

      /* The class tells CSS it is safe to start elements hidden. Without it
         (no JS, or this module failing) everything stays visible. */
      if (!reduced && M) document.documentElement.classList.add("js-reveal-ready");

      if ("IntersectionObserver" in window) {
        counterObserver = new IntersectionObserver(function (entries, observer) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            if (entry.target.__uiRun) entry.target.__uiRun();
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.4 });
      }

      App.on("content:rendered", function (payload) {
        App.animations.scan(payload && payload.root);
      });

      if (window.matchMedia) {
        var query = window.matchMedia("(prefers-reduced-motion: reduce)");
        var onChange = function () {
          reduced = query.matches;
          if (reduced) App.animations.revealAll();
        };
        if (query.addEventListener) query.addEventListener("change", onChange);
        else if (query.addListener) query.addListener(onChange);
      }

      App.animations.scan();
      revealHeadline();
      initSafetyNet();
    },

    scan: function (scope) {
      scanReveal(scope);
      scanCounters(scope);
      scanPaths(scope);
      initMagnetic(scope);
      initParallax(scope);
    },

    revealAll: function () {
      document.documentElement.classList.remove("js-reveal-ready");
      U.$$("[data-reveal]").forEach(showNow);
    },

    /* Exposed so other modules can animate with the same feel */
    springs: { soft: SPRING_SOFT, snap: SPRING_SNAP }
  };
})(window.Site);
