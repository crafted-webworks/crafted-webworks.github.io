/* ==========================================================================
   Filters — the reusable collection controller.
   --------------------------------------------------------------------------
   Combines category filtering, search and pagination for ANY collection.
   Filter buttons are derived from the data, never hard-coded: add a project
   in a new category and its button appears automatically.

       Site.filters.create({ root, items, categories, cardFn, … })
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;

  function buildCategories(items, declared, categoryOf) {
    /* Which categories actually occur in this set of items? */
    var counts = {};
    items.forEach(function (item) {
      var id = categoryOf(item);
      if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });

    var list = (declared || [])
      .filter(function (cat) { return counts[cat.id]; })
      .map(function (cat) { return { id: cat.id, label: cat.label, count: counts[cat.id] }; });

    /* Categories present in the data but missing from the declared list
       still get a button — the data stays the source of truth. */
    Object.keys(counts).forEach(function (id) {
      var known = list.some(function (cat) { return cat.id === id; });
      if (!known) {
        list.push({ id: id, label: U.titleCase(id.replace(/-/g, " ")), count: counts[id] });
      }
    });

    return [{ id: "all", label: "All", count: items.length }].concat(list);
  }

  function create(config) {
    var root = config.root;
    if (!root) return null;

    var grid = root.querySelector("[data-collection-grid]");
    if (!grid) return null;

    var filtersWrap = root.querySelector("[data-collection-filters]");
    var searchInput = root.querySelector("[data-collection-search]");
    var searchField = searchInput ? searchInput.closest(".search-field") : null;
    var paginationWrap = root.querySelector("[data-collection-pagination]");
    var toolbar = root.querySelector(".toolbar");

    var categoryOf = config.categoryOf || function (item) { return item.category; };
    var items = config.items || [];
    var perPage = config.perPage || 9;

    var state = {
      category: "all",
      query: "",
      page: 1
    };

    /* Result counter lives in the toolbar; created here so sections don't
       have to know about it. */
    var counter = null;
    if (toolbar && (config.search || config.pagination)) {
      counter = document.createElement("span");
      counter.className = "result-count";
      counter.setAttribute("aria-live", "polite");
      toolbar.appendChild(counter);
    }

    /* ----------------------------------------------------------------
       Filter buttons
       ---------------------------------------------------------------- */
    if (config.filters && filtersWrap) {
      var categories = buildCategories(items, config.categories, categoryOf);

      if (categories.length > 2) {
        filtersWrap.innerHTML = categories.map(function (cat) {
          return '<button type="button" class="filter-btn' + (cat.id === "all" ? " is-active" : "") + '"' +
                 ' data-filter="' + U.attr(cat.id) + '" aria-pressed="' + (cat.id === "all") + '">' +
                 U.escape(cat.label) + '<span class="count">' + cat.count + "</span>" +
                 "</button>";
        }).join("");

        filtersWrap.addEventListener("click", function (event) {
          var button = event.target.closest("[data-filter]");
          if (!button) return;
          state.category = button.getAttribute("data-filter");
          state.page = 1;
          U.$$("[data-filter]", filtersWrap).forEach(function (b) {
            var active = b === button;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          sync();
          apply();
        });
      } else {
        filtersWrap.remove();
      }
    }

    /* ----------------------------------------------------------------
       Search
       ---------------------------------------------------------------- */
    if (config.search && searchInput) {
      searchInput.addEventListener("input", U.debounce(function () {
        state.query = searchInput.value.trim();
        state.page = 1;
        if (searchField) searchField.classList.toggle("has-value", !!state.query);
        sync();
        apply();
      }, 220));

      var clear = root.querySelector(".search-clear");
      if (clear) {
        clear.addEventListener("click", function () {
          searchInput.value = "";
          state.query = "";
          state.page = 1;
          searchField.classList.remove("has-value");
          searchInput.focus();
          sync();
          apply();
        });
      }
    }

    /* ----------------------------------------------------------------
       URL sync — makes a filtered view linkable and survivable on reload
       ---------------------------------------------------------------- */
    function sync() {
      if (!config.urlSync) return;
      U.setQuery("cat", state.category === "all" ? null : state.category, true);
      U.setQuery("q", state.query || null, true);
      U.setQuery("page", state.page > 1 ? state.page : null, true);
    }

    function restore() {
      if (!config.urlSync) return;
      var cat = U.query("cat");
      var q = U.query("q");
      var page = parseInt(U.query("page"), 10);

      if (cat) {
        state.category = cat;
        var button = filtersWrap && filtersWrap.querySelector('[data-filter="' + CSS.escape(cat) + '"]');
        if (button) {
          U.$$("[data-filter]", filtersWrap).forEach(function (b) {
            var active = b === button;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
        }
      }
      if (q && searchInput) {
        state.query = q;
        searchInput.value = q;
        if (searchField) searchField.classList.add("has-value");
      }
      if (!isNaN(page) && page > 0) state.page = page;
    }

    /* ----------------------------------------------------------------
       Render
       ---------------------------------------------------------------- */
    function filtered() {
      var list = items;

      if (state.category !== "all") {
        list = list.filter(function (item) { return categoryOf(item) === state.category; });
      }

      if (state.query) {
        list = App.search.run(list, state.query, config.searchFields || ["title", "description"]);
      }

      return list;
    }

    function updateMobileIndicator() {
      if (window.innerWidth > 767.98) return;

      var indicator = grid.parentNode.querySelector(".mobile-carousel-indicator");
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "mobile-carousel-indicator";
        grid.parentNode.insertBefore(indicator, grid.nextSibling);
      }

      var total = grid.children.length;
      if (!total || grid.querySelector(".empty-state")) {
        indicator.hidden = true;
        indicator.innerHTML = "";
        return;
      }

      indicator.hidden = false;
      indicator.innerHTML = "";

      if (total <= 3) {
        var arrowWrap = document.createElement("div");
        arrowWrap.className = "mobile-carousel-arrows";
        arrowWrap.innerHTML = '<span class="mobile-carousel-arrow is-muted">←</span><span class="mobile-carousel-arrow is-muted">→</span>';
        indicator.appendChild(arrowWrap);
        return;
      }

      var dots = Math.min(5, Math.max(1, total));
      for (var i = 0; i < dots; i++) {
        var dot = document.createElement("span");
        dot.className = "mobile-carousel-dot";
        if (i === 0) dot.classList.add("is-active");
        indicator.appendChild(dot);
      }

      var maxScroll = grid.scrollWidth - grid.clientWidth;
      var progress = maxScroll > 0 ? grid.scrollLeft / maxScroll : 0;
      var activeIndex = Math.min(dots - 1, Math.max(0, Math.round(progress * (dots - 1))));
      Array.prototype.forEach.call(indicator.querySelectorAll(".mobile-carousel-dot"), function (node, index) {
        node.classList.toggle("is-active", index === activeIndex);
      });
    }

    function apply(options) {
      var list = filtered();
      var total = config.pagination ? App.pagination.totalPages(list.length, perPage) : 1;
      state.page = U.clamp(state.page, 1, total);

      var visible = config.pagination
        ? App.pagination.slice(list, state.page, perPage)
        : list;

      if (!visible.length) {
        grid.innerHTML = "";
        grid.insertAdjacentHTML("beforeend", C.emptyState(Object.assign({
          action: state.query || state.category !== "all"
            ? null
            : { label: "Start a project", url: "/pages/contact.html" }
        }, config.empty)));
      } else {
        grid.innerHTML = visible.map(function (item, i) {
          return config.cardFn(item, i);
        }).join("");
      }

      if (paginationWrap) {
        paginationWrap.innerHTML = config.pagination
          ? App.pagination.render({ current: state.page, total: total, label: config.label })
          : "";
        App.pagination.bind(paginationWrap, function (page) {
          state.page = page;
          sync();
          apply({ scroll: true });
        });
      }

      if (counter) {
        counter.textContent = list.length === items.length
          ? list.length + " total"
          : list.length + " of " + items.length;
      }

      if (options && options.scroll) {
        U.scrollTo(root, 24);
      }

      updateMobileIndicator();
      grid.addEventListener("scroll", function () { updateMobileIndicator(); }, { passive: true });

      App.emit("content:rendered", { root: grid });
      App.emit("collection:filtered", { collection: config.collection, state: state, count: list.length });
    }

    restore();
    apply();

    return {
      state: state,
      refresh: apply,
      setItems: function (next) { items = next; state.page = 1; apply(); }
    };
  }

  App.filters = {
    create: create,
    buildCategories: buildCategories
  };
})(window.Site);
