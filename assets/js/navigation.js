/* ==========================================================================
   Navigation — navbar state, mobile drawer, smooth scrolling, scroll spy,
   theme toggle, scroll progress and back-to-top.
   One implementation, used by every page.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;

  var state = {
    header: null,
    drawer: null,
    backdrop: null,
    toggle: null,
    lastScroll: 0,
    open: false,      /* mobile drawer */
    engaged: false,   /* pointer or focus is inside the header */
    hidden: false     /* current auto-hide state, tracked to avoid redundant writes */
  };

  /* ==================================================================
     THEME
     ================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-bs-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#FFFFFF" : "#070B16");
    }
    App.emit("theme:changed", theme);
  }

  function initTheme() {
    var key = App.config.storageKeys.theme;
    var stored = U.storage.get(key);
    var fallback = App.data.get("site", "defaults.theme", "dark");
    applyTheme(stored || fallback);

    document.addEventListener("click", function (event) {
      if (!event.target.closest("[data-theme-toggle]")) return;
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      U.storage.set(key, next);
    });
  }

  /* ==================================================================
     HEADER STATE — auto-hide on scroll
     --------------------------------------------------------------------
     The header hides on the way down and returns on the way up. The whole
     difficulty is deciding *when*, because a scroll event stream is noisy:
     trackpads, momentum and sub-pixel rounding all produce single frames
     that move the opposite way. Comparing one frame to the last (the naive
     version) makes the bar flicker up and down continuously.

     So direction is committed, not sampled. Movement accumulates while the
     direction is consistent and resets the moment it flips, and the header
     only changes state once that accumulation passes a deliberate
     threshold — further to hide than to reveal, because a visitor reaching
     for the nav should get it back immediately.
     ================================================================== */
  /* Deliberately lopsided. Revealing is cheap and hiding is expensive, because
     the annoying failure is a header that flits in and out while you read —
     not one that lingers a moment too long. Once it comes back, it stays. */
  var HIDE_AFTER   = 260;   /* px of sustained downward scroll before hiding  */
  var SHOW_AFTER   = 40;    /* px of sustained upward scroll before revealing */
  var TOP_ZONE     = 240;   /* never hide this close to the top of the page   */
  var REVEAL_HOLD  = 900;   /* ms the header is pinned open after appearing   */

  var revealedAt = 0;

  function setHeaderHidden(hidden) {
    if (!state.header || state.hidden === hidden) return;   /* no redundant writes */

    /* A reveal buys a guaranteed window on screen. Without it, one flick of
       downward momentum right after the header appears takes it straight back
       off again, which reads as the bar arguing with you. */
    if (hidden && Date.now() - revealedAt < REVEAL_HOLD) return;

    state.hidden = hidden;
    if (!hidden) revealedAt = Date.now();
    state.header.classList.toggle("is-hidden", hidden);
  }

  function initHeaderState() {
    state.header = U.$("[data-navbar]");
    if (!state.header) return;

    var progress = U.$("[data-scroll-progress]");
    var travelled = 0;
    var direction = 0;

    var update = U.onFrame(function () {
      var y = Math.max(0, window.pageYOffset);
      var delta = y - state.lastScroll;
      state.lastScroll = y;

      state.header.classList.toggle("is-scrolled", y > 24);

      if (progress) {
        var height = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (height > 0 ? (y / height) * 100 : 0) + "%";
      }

      /* Always visible near the top, while the drawer is open, or while the
         pointer or keyboard focus is in the header — hiding a menu someone
         is actively using would be the worst version of this feature. */
      if (y < TOP_ZONE || state.open || state.engaged) {
        travelled = 0;
        direction = 0;
        setHeaderHidden(false);
        return;
      }

      if (delta === 0) return;

      var next = delta > 0 ? 1 : -1;
      if (next !== direction) {
        direction = next;
        travelled = 0;          /* direction changed — start counting again */
      }
      travelled += Math.abs(delta);

      if (direction > 0 && travelled >= HIDE_AFTER) setHeaderHidden(true);
      else if (direction < 0 && travelled >= SHOW_AFTER) setHeaderHidden(false);
    });

    window.addEventListener("scroll", update, { passive: true });

    /* Reaching for the nav brings it straight back, no scrolling required */
    state.header.addEventListener("pointerenter", function () {
      state.engaged = true;
      setHeaderHidden(false);
    });

    state.header.addEventListener("pointerleave", function () {
      state.engaged = false;
    });

    state.header.addEventListener("focusin", function () {
      state.engaged = true;
      setHeaderHidden(false);
    });

    state.header.addEventListener("focusout", function (event) {
      if (!state.header.contains(event.relatedTarget)) state.engaged = false;
    });

    update();
  }

  /* ==================================================================
     MOBILE DRAWER
     ================================================================== */
  function openDrawer() {
    if (!state.drawer) return;
    state.open = true;
    state.backdrop.hidden = false;
    state.toggle.setAttribute("aria-expanded", "true");
    state.toggle.setAttribute("aria-label", "Close menu");
    document.body.classList.add("is-locked");

    requestAnimationFrame(function () {
      state.drawer.classList.add("is-open");
      state.backdrop.classList.add("is-open");
      /* Trap focus only once the drawer is rendered — a hidden element
         cannot receive focus. */
      requestAnimationFrame(function () { App.a11y.trapFocus(state.drawer); });
    });
  }

  function closeDrawer() {
    if (!state.drawer || !state.open) return;
    state.open = false;
    state.drawer.classList.remove("is-open");
    state.backdrop.classList.remove("is-open");
    state.toggle.setAttribute("aria-expanded", "false");
    state.toggle.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("is-locked");
    App.a11y.releaseFocus();
    setTimeout(function () {
      if (!state.open) state.backdrop.hidden = true;
    }, 260);
  }

  function initDrawer() {
    state.drawer = U.$("[data-nav-drawer]");
    state.backdrop = U.$("[data-nav-backdrop]");
    state.toggle = U.$("[data-nav-toggle]");
    if (!state.drawer || !state.toggle) return;

    state.toggle.addEventListener("click", function () {
      if (state.open) closeDrawer(); else openDrawer();
    });

    state.backdrop.addEventListener("click", closeDrawer);

    U.$$("[data-nav-close]").forEach(function (btn) {
      btn.addEventListener("click", closeDrawer);
    });

    state.drawer.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeDrawer();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        closeDrawer();
        state.toggle.focus();
      }
    });

    /* Close automatically when the viewport grows past the breakpoint */
    window.addEventListener("resize", U.debounce(function () {
      if (window.innerWidth >= 1200 && state.open) closeDrawer();
    }, 150));
  }

  /* ==================================================================
     DROPDOWN PANELS
     CSS drives open/close on hover and focus-within, which keeps the panels
     working without JavaScript. This only adds what CSS cannot express:
     an honest aria-expanded for screen readers, and Escape to dismiss.
     ================================================================== */
  function initNavMenus() {
    var items = U.$$(".nav-item--menu");
    if (!items.length) return;

    items.forEach(function (item) {
      var link = item.querySelector(".nav-link");
      if (!link) return;

      var setState = function (open) {
        link.setAttribute("aria-expanded", String(open));
      };

      item.addEventListener("pointerenter", function () { setState(true); });
      item.addEventListener("pointerleave", function () { setState(false); });
      item.addEventListener("focusin", function () { setState(true); });
      item.addEventListener("focusout", function (event) {
        if (!item.contains(event.relatedTarget)) setState(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var open = document.activeElement && document.activeElement.closest(".nav-item--menu");
      if (!open) return;
      var link = open.querySelector(".nav-link");
      if (link) link.focus();
      open.querySelectorAll("[aria-expanded]").forEach(function (el) {
        el.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ==================================================================
     SMOOTH SCROLLING
     Handles both [data-scroll-to] nav links and any in-page #anchor.
     ================================================================== */
  function initSmoothScroll() {
    if (!App.data.get("site", "features.smoothScroll", true)) return;

    document.addEventListener("click", function (event) {
      var link = event.target.closest('a[href^="#"], [data-scroll-to]');
      if (!link) return;

      var targetId = link.getAttribute("data-scroll-to") ||
                     (link.getAttribute("href") || "").slice(1);
      if (!targetId || targetId === "#") return;

      var target = document.getElementById(targetId);
      if (!target) return;

      event.preventDefault();
      closeDrawer();
      U.scrollTo(target);

      /* Keep the URL meaningful and keyboard focus with the content */
      history.replaceState(null, "", "#" + targetId);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  }

  /* ==================================================================
     SCROLL SPY — highlights the nav item for the section in view
     ================================================================== */
  function initScrollSpy() {
    if (!App.data.get("site", "features.scrollSpy", true)) return;

    var links = U.$$("[data-scroll-to]");
    if (!links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    links.forEach(function (link) {
      var id = link.getAttribute("data-scroll-to");
      (map[id] = map[id] || []).push(link);
    });

    var sections = Object.keys(map)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    if (!sections.length) return;

    var visible = {};

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
      });

      var best = Object.keys(visible).reduce(function (acc, id) {
        return visible[id] > (visible[acc] || 0) ? id : acc;
      }, null);

      links.forEach(function (link) {
        var active = link.getAttribute("data-scroll-to") === best;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }, {
      rootMargin: "-30% 0px -55% 0px",
      threshold: [0, 0.25, 0.5, 1]
    });

    sections.forEach(function (el) { observer.observe(el); });
  }

  /* ==================================================================
     BACK TO TOP
     ================================================================== */
  function initBackToTop() {
    if (!App.data.get("site", "features.backToTop", true)) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "back-to-top";
    button.setAttribute("aria-label", "Back to top");
    button.innerHTML = App.icons.render("arrow-up");
    document.body.appendChild(button);

    button.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: U.prefersReducedMotion() ? "auto" : "smooth" });
      var skip = U.$(".skip-link");
      if (skip) skip.focus();
    });

    var update = U.onFrame(function () {
      button.classList.toggle("is-visible", window.pageYOffset > 640);
    });

    window.addEventListener("scroll", update, { passive: true });
  }

  /* ==================================================================
     DEEP LINK — scroll to the hash once content has been rendered
     ================================================================== */
  function initHashLanding() {
    if (!location.hash) return;
    var target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    /* Let layout settle first — sections are rendered asynchronously */
    setTimeout(function () { U.scrollTo(target); }, 120);
  }

  App.nav = {
    init: function () {
      initHeaderState();
      initDrawer();
      initNavMenus();
      initSmoothScroll();
      initBackToTop();
    },

    /* Called after sections exist, so the observer has something to watch */
    initAfterContent: function () {
      initScrollSpy();
      initHashLanding();
    },

    initTheme: initTheme,
    applyTheme: applyTheme,
    closeDrawer: closeDrawer,
    openDrawer: openDrawer
  };
})(window.Site);
