/* ==========================================================================
   AJAX — one request helper for the entire site.
   Uses jQuery.ajax when available (per the project stack) and falls back to
   fetch, so no module ever writes its own request/timeout/error handling.
   ========================================================================== */

(function (App) {
  "use strict";

  var cfg = App.config.request;

  function RequestError(message, status, cause) {
    var err = new Error(message);
    err.name = "RequestError";
    err.status = status || 0;
    err.cause = cause || null;
    return err;
  }

  function describe(status, statusText) {
    if (status === 0) return "Network unavailable or the request was blocked.";
    if (status === 404) return "The requested resource was not found.";
    if (status === 408) return "The request timed out.";
    if (status >= 500) return "The server responded with an error.";
    return statusText || "The request failed.";
  }

  /* ------------------------------------------------------------------
     fetch-based implementation with an explicit timeout
     ------------------------------------------------------------------ */
  function fetchRequest(options) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, options.timeout || cfg.timeout);

    var init = {
      method: options.method || "GET",
      headers: options.headers || {},
      signal: controller ? controller.signal : undefined,
      credentials: options.credentials || "same-origin"
    };

    if (options.body !== undefined && options.body !== null) {
      if (options.body instanceof FormData) {
        init.body = options.body;
      } else {
        init.headers["Content-Type"] = init.headers["Content-Type"] || "application/json";
        init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      }
    }

    return fetch(options.url, init).then(function (response) {
      clearTimeout(timer);
      var type = response.headers.get("content-type") || "";
      var parse = type.indexOf("json") !== -1 ? response.json() : response.text();

      return parse.then(function (payload) {
        if (!response.ok) {
          throw RequestError(describe(response.status, response.statusText), response.status, payload);
        }
        return payload;
      }, function () {
        if (!response.ok) throw RequestError(describe(response.status, response.statusText), response.status);
        throw RequestError("The response could not be parsed.", response.status);
      });
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === "AbortError") throw RequestError("The request timed out.", 408, err);
      throw RequestError(describe(0), 0, err);
    });
  }

  /* ------------------------------------------------------------------
     jQuery implementation (preferred when jQuery is present)
     ------------------------------------------------------------------ */
  function jqueryRequest(options) {
    return new Promise(function (resolve, reject) {
      var settings = {
        url: options.url,
        type: options.method || "GET",
        timeout: options.timeout || cfg.timeout,
        headers: options.headers || {},
        dataType: options.dataType || undefined,
        success: resolve,
        error: function (xhr, textStatus) {
          var status = textStatus === "timeout" ? 408 : xhr.status;
          reject(RequestError(describe(status, xhr.statusText), status, xhr.responseText));
        }
      };

      if (options.body !== undefined && options.body !== null) {
        if (options.body instanceof FormData) {
          settings.data = options.body;
          settings.processData = false;
          settings.contentType = false;
        } else if (typeof options.body === "string") {
          settings.data = options.body;
        } else if (options.form) {
          settings.data = options.body;                 /* urlencoded form post */
        } else {
          settings.data = JSON.stringify(options.body);
          settings.contentType = "application/json";
        }
      }

      window.jQuery.ajax(settings);
    });
  }

  function request(options) {
    var useJQuery = !!window.jQuery && options.preferFetch !== true;
    var attempt = useJQuery ? jqueryRequest : fetchRequest;
    var retries = options.retries === undefined ? cfg.retries : options.retries;

    function run(remaining) {
      return attempt(options).catch(function (err) {
        /* Retry only on transport-level failures, never on 4xx */
        var retryable = err.status === 0 || err.status === 408 || err.status >= 500;
        if (remaining > 0 && retryable) {
          App.log.warn("Retrying request:", options.url);
          return run(remaining - 1);
        }
        throw err;
      });
    }

    return run(retries);
  }

  App.ajax = {
    request: request,

    get: function (url, options) {
      return request(Object.assign({ url: url, method: "GET" }, options || {}));
    },

    getJSON: function (url, options) {
      return request(Object.assign({ url: url, method: "GET", dataType: "json" }, options || {}))
        .then(function (payload) {
          /* jQuery may hand back a string if the server sends the wrong type */
          if (typeof payload === "string") {
            try { return JSON.parse(payload); }
            catch (err) { throw RequestError("The data file is not valid JSON: " + url, 0, err); }
          }
          return payload;
        });
    },

    post: function (url, body, options) {
      return request(Object.assign({ url: url, method: "POST", body: body }, options || {}));
    },

    /**
     * Central error handler. Returns a message safe to show a visitor;
     * the technical detail only reaches the console in development.
     */
    handleError: function (error, context) {
      App.log.error(context || "Request failed", error);
      if (App.config.dev) {
        return (error && error.message) || "Something went wrong.";
      }
      return "Something went wrong. Please try again in a moment.";
    }
  };
})(window.Site);
