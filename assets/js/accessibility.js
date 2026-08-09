/* ==========================================================================
   Accessibility — focus management and the small behaviours that make
   keyboard and screen-reader use work properly.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;

  var FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  var trap = {
    container: null,
    previous: null,
    handler: null
  };

  function focusableIn(container) {
    return U.$$(FOCUSABLE, container).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  /**
   * Keeps Tab inside a dialog/drawer and restores focus when released.
   * Used by the modal and the mobile navigation drawer.
   */
  function trapFocus(container) {
    releaseFocus();
    if (!container) return;

    trap.container = container;
    trap.previous = document.activeElement;

    var items = focusableIn(container);
    if (items.length) {
      items[0].focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    trap.handler = function (event) {
      if (event.key !== "Tab") return;
      var focusable = focusableIn(container);
      if (!focusable.length) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trap.handler);
  }

  function releaseFocus() {
    if (trap.handler) document.removeEventListener("keydown", trap.handler);
    if (trap.previous && typeof trap.previous.focus === "function") {
      trap.previous.focus({ preventScroll: true });
    }
    trap.container = null;
    trap.previous = null;
    trap.handler = null;
  }

  /** Announces dynamic changes to screen readers without visual noise. */
  function announce(message) {
    var region = document.getElementById("ui-live-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "ui-live-region";
      region.className = "visually-hidden";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    /* Clearing first forces re-announcement of an identical message */
    region.textContent = "";
    setTimeout(function () { region.textContent = message; }, 60);
  }

  function initEscapeHandling() {
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (document.querySelector(".ui-modal.is-open")) {
        App.components.closeModal();
      }
    });
  }

  /** Distinguishes keyboard users so focus rings only appear when useful. */
  function initInputModality() {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Tab") document.documentElement.classList.add("using-keyboard");
    });
    document.addEventListener("pointerdown", function () {
      document.documentElement.classList.remove("using-keyboard");
    });
  }

  /** External links get a screen-reader hint about opening a new tab. */
  function annotateExternalLinks(scope) {
    U.$$('a[target="_blank"]', scope || document).forEach(function (link) {
      if (link.__uiAnnotated || link.querySelector(".visually-hidden")) return;
      link.__uiAnnotated = true;
      link.insertAdjacentHTML("beforeend", '<span class="visually-hidden"> (opens in a new tab)</span>');
    });
  }

  App.a11y = {
    trapFocus: trapFocus,
    releaseFocus: releaseFocus,
    announce: announce,
    focusableIn: focusableIn,

    init: function () {
      initEscapeHandling();
      initInputModality();

      App.on("content:rendered", function (payload) {
        annotateExternalLinks(payload && payload.root);
      });

      App.on("collection:filtered", function (payload) {
        announce(payload.count + " results shown");
      });

      annotateExternalLinks();
    }
  };
})(window.Site);
