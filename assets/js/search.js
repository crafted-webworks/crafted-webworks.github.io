/* ==========================================================================
   Search — reusable client-side matching.
   Works against any collection (projects, demos, tools, resources, blog,
   services) by reading the fields it is told to look at.
   ========================================================================== */

(function (App) {
  "use strict";

  /** Flattens a field value (string, number, array, nested object) to text. */
  function textOf(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(textOf).join(" ");
    if (typeof value === "object") return Object.keys(value).map(function (k) { return textOf(value[k]); }).join(" ");
    return String(value);
  }

  function haystack(item, fields) {
    return fields.map(function (field) {
      return textOf(App.utils.get(item, field, ""));
    }).join(" ").toLowerCase();
  }

  /**
   * Every whitespace-separated term must appear somewhere in the item.
   * Simple, predictable, and fast enough for thousands of records.
   */
  function matches(item, query, fields) {
    var terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    var text = haystack(item, fields);
    return terms.every(function (term) { return text.indexOf(term) !== -1; });
  }

  function run(items, query, fields) {
    if (!query) return items.slice();
    return items.filter(function (item) { return matches(item, query, fields); });
  }

  /**
   * Site-wide search across every loaded collection. Used by the search
   * field on the tools/resources pages and available for a future
   * global search page.
   */
  function global(query, collections) {
    var sources = collections || ["services", "projects", "demos", "resources", "tools", "blog"];
    var results = [];

    sources.forEach(function (name) {
      var items = App.data.items(name);
      run(items, query, ["title", "description", "shortDescription", "excerpt", "tags", "category"])
        .forEach(function (item) {
          results.push({ collection: name, item: item });
        });
    });

    return results;
  }

  App.search = {
    matches: matches,
    run: run,
    global: global,
    textOf: textOf
  };
})(window.Site);
