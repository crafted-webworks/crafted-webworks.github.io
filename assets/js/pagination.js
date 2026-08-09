/* ==========================================================================
   Pagination — reusable, configurable, used by every paged collection.
   Renders a windowed page list (1 … 4 5 6 … 12) with prev/next controls.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var icon = App.icons.render.bind(App.icons);

  function pageNumbers(current, total, window_) {
    var span = window_ || 1;
    var pages = [];
    var last = 0;

    for (var i = 1; i <= total; i++) {
      var isEdge = i === 1 || i === total;
      var isNear = Math.abs(i - current) <= span;
      if (!isEdge && !isNear) continue;
      if (last && i - last > 1) pages.push("…");
      pages.push(i);
      last = i;
    }
    return pages;
  }

  /**
   * @param {object} config { current, total, label }
   * @returns {string} markup, or "" when a single page makes it pointless
   */
  function render(config) {
    var total = config.total;
    if (total <= 1) return "";

    var current = U.clamp(config.current, 1, total);

    var buttons = pageNumbers(current, total).map(function (page) {
      if (page === "…") return '<span class="page-ellipsis" aria-hidden="true">…</span>';
      var active = page === current;
      return '<button type="button" class="page-btn' + (active ? " is-active" : "") + '"' +
             ' data-page="' + page + '"' + (active ? ' aria-current="page"' : "") +
             ' aria-label="Page ' + page + '">' + page + "</button>";
    }).join("");

    return '<nav class="pagination" aria-label="' + U.attr(config.label || "Pagination") + '">' +
             '<button type="button" class="page-btn" data-page="' + (current - 1) + '"' +
               (current === 1 ? " disabled" : "") + ' aria-label="Previous page">' + icon("chevron-left") + "</button>" +
             buttons +
             '<button type="button" class="page-btn" data-page="' + (current + 1) + '"' +
               (current === total ? " disabled" : "") + ' aria-label="Next page">' + icon("chevron-right") + "</button>" +
           "</nav>";
  }

  /**
   * Wires a rendered pagination block. `onChange(page)` is called with the
   * requested page; re-rendering is the caller's job.
   */
  function bind(container, onChange) {
    if (!container || container.__uiBound) return;
    container.__uiBound = true;

    container.addEventListener("click", function (event) {
      var button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      var page = parseInt(button.getAttribute("data-page"), 10);
      if (!isNaN(page)) onChange(page);
    });
  }

  function slice(items, page, perPage) {
    var start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
  }

  function totalPages(count, perPage) {
    return Math.max(1, Math.ceil(count / perPage));
  }

  App.pagination = {
    render: render,
    bind: bind,
    slice: slice,
    totalPages: totalPages,
    pageNumbers: pageNumbers
  };
})(window.Site);
