/* ==========================================================================
   Forms — the reusable enquiry form: built from data, validated, submitted
   over AJAX.
   --------------------------------------------------------------------------
   Fields come from data/forms/contact.json and their option lists come from
   data/contact.json, so the form's shape is editable without touching code.

   Security notes:
     · No API keys, tokens or SMTP details belong in this file — it ships to
       the browser. `form.endpoint` must point at a server-side handler.
     · Spam protection is a honeypot plus a minimum time-to-submit. Both are
       cheap and invisible; add a server-side check too.
   ========================================================================== */

(function (App) {
  "use strict";

  var U = App.utils;
  var C = App.components;
  var icon = App.icons.render.bind(App.icons);

  /* ==================================================================
     MARKUP
     ================================================================== */
  function fieldMarkup(field, contact) {
    var id = "field-" + field.name;
    var errorId = id + "-error";
    var helpId = id + "-help";
    var describedBy = [field.help ? helpId : null, errorId].filter(Boolean).join(" ");
    var required = field.required ? " required aria-required=\"true\"" : "";
    var span = "fg-" + (field.col || 12);

    /* Checkbox is its own shape */
    if (field.type === "checkbox") {
      var labelText = U.escape(field.label);
      if (field.linkText && field.linkUrl) {
        labelText = labelText.replace(
          U.escape(field.linkText),
          '<a href="' + U.attr(U.url(field.linkUrl)) + '">' + U.escape(field.linkText) + "</a>"
        );
        if (labelText.indexOf("<a ") === -1) {
          labelText += ' <a href="' + U.attr(U.url(field.linkUrl)) + '">' + U.escape(field.linkText) + "</a>";
        }
      }

      return '<div class="form-group ' + span + '" data-field="' + U.attr(field.name) + '">' +
               '<label class="form-check" for="' + id + '">' +
                 '<input type="checkbox" id="' + id + '" name="' + U.attr(field.name) + '"' + required +
                   ' aria-describedby="' + errorId + '">' +
                 '<span class="form-check-label">' + labelText + "</span>" +
               "</label>" +
               '<span class="form-error" id="' + errorId + '" role="alert">' + icon("alert-circle") +
                 "<span></span></span>" +
             "</div>";
    }

    var control;

    if (field.type === "select") {
      var options = (contact[field.optionsFrom] || field.options || []).map(function (option) {
        return '<option value="' + U.attr(option.value) + '">' + U.escape(option.label) + "</option>";
      }).join("");

      control = '<select class="form-select" id="' + id + '" name="' + U.attr(field.name) + '"' + required +
                  ' aria-describedby="' + describedBy + '">' +
                  '<option value="">' + U.escape(field.placeholder || "Select…") + "</option>" +
                  options +
                "</select>";
    } else if (field.type === "textarea") {
      control = '<textarea class="form-control" id="' + id + '" name="' + U.attr(field.name) + '"' +
                  ' rows="' + (field.rows || 5) + '" placeholder="' + U.attr(field.placeholder || "") + '"' +
                  required + ' aria-describedby="' + describedBy + '"></textarea>';
    } else {
      control = '<input class="form-control" type="' + U.attr(field.type || "text") + '" id="' + id + '"' +
                  ' name="' + U.attr(field.name) + '" placeholder="' + U.attr(field.placeholder || "") + '"' +
                  (field.autocomplete ? ' autocomplete="' + U.attr(field.autocomplete) + '"' : "") +
                  required + ' aria-describedby="' + describedBy + '">';
    }

    return '<div class="form-group ' + span + '" data-field="' + U.attr(field.name) + '">' +
             '<label class="form-label" for="' + id + '">' + U.escape(field.label) +
               (field.required
                 ? '<span class="required" aria-hidden="true">*</span>'
                 : '<span class="optional">(optional)</span>') +
             "</label>" +
             control +
             (field.help ? '<span class="form-help" id="' + helpId + '">' + U.escape(field.help) + "</span>" : "") +
             '<span class="form-error" id="' + errorId + '" role="alert">' + icon("alert-circle") +
               "<span></span></span>" +
           "</div>";
  }

  function buildContactForm() {
    var contact = App.data.get("contact") || {};
    var config = App.data.get("contactForm") || {};
    var form = contact.form || {};
    var fields = config.fields || [];

    var honeypot = form.honeypot || "company_website_url";

    return '<form class="contact-form" data-contact-form novalidate>' +
             '<div class="form-status" data-form-status></div>' +
             '<div class="form-grid">' +
               fields.map(function (field) { return fieldMarkup(field, contact); }).join("") +
             "</div>" +

             /* Honeypot: hidden from people, irresistible to naive bots */
             '<div class="form-hp" aria-hidden="true">' +
               '<label for="' + U.attr(honeypot) + '">Leave this field empty</label>' +
               '<input type="text" id="' + U.attr(honeypot) + '" name="' + U.attr(honeypot) + '" tabindex="-1" autocomplete="off">' +
             "</div>" +

             '<div class="form-actions mt-lg">' +
               '<button type="submit" class="btn btn-gradient btn-lg" data-form-submit>' +
                 U.escape(form.submitLabel || "Send enquiry") + icon("arrow-right", "icon--shift") +
               "</button>" +
               '<span class="form-help">' + U.escape(contact.responseTime || "") + "</span>" +
             "</div>" +
           "</form>";
  }

  /* ==================================================================
     VALIDATION
     ================================================================== */
  function fieldConfig(name) {
    var config = App.data.get("contactForm") || {};
    return (config.fields || []).filter(function (f) { return f.name === name; })[0] || {};
  }

  function validateField(input) {
    var group = input.closest(".form-group");
    if (!group) return true;

    var config = fieldConfig(input.name);
    var rules = config.validation || {};
    var value = input.type === "checkbox" ? input.checked : String(input.value || "").trim();
    var message = "";

    if (config.required) {
      if (input.type === "checkbox" && !value) message = rules.message || "This box needs to be ticked.";
      else if (!value) message = rules.message || "This field is required.";
    }

    if (!message && value && input.type !== "checkbox") {
      if (rules.minLength && value.length < rules.minLength) {
        message = rules.message || ("Please enter at least " + rules.minLength + " characters.");
      } else if (rules.maxLength && value.length > rules.maxLength) {
        message = "Please keep this under " + rules.maxLength + " characters.";
      } else if (rules.pattern && !(new RegExp(rules.pattern)).test(value)) {
        message = rules.message || "Please check the format of this field.";
      }
    }

    setFieldError(group, input, message);
    return !message;
  }

  function setFieldError(group, input, message) {
    var errorEl = group.querySelector(".form-error span:last-child");
    group.classList.toggle("has-error", !!message);
    group.classList.toggle("is-valid", !message && !!String(input.value || "").trim());
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (errorEl) errorEl.textContent = message || "";
  }

  function validateForm(form) {
    var invalid = [];
    U.$$("input, select, textarea", form).forEach(function (input) {
      if (input.closest(".form-hp")) return;
      if (!validateField(input)) invalid.push(input);
    });
    return invalid;
  }

  /* ==================================================================
     STATUS MESSAGES
     ================================================================== */
  function showStatus(form, type, title, message) {
    var status = form.querySelector("[data-form-status]");
    if (!status) return;

    status.className = "form-status form-status--" + type + " is-visible";
    status.innerHTML =
      icon(type === "success" ? "check-circle" : "alert-circle") +
      "<div>" +
        '<span class="form-status-title">' + U.escape(title) + "</span>" +
        '<span class="form-status-text">' + U.escape(message) + "</span>" +
      "</div>";
    status.setAttribute("role", type === "error" ? "alert" : "status");
    status.setAttribute("tabindex", "-1");
    status.focus({ preventScroll: true });
    U.scrollTo(status, 100);
  }

  function clearStatus(form) {
    var status = form.querySelector("[data-form-status]");
    if (status) {
      status.className = "form-status";
      status.innerHTML = "";
    }
  }

  /* ==================================================================
     SUBMISSION
     ================================================================== */
  function collect(form) {
    var payload = {};
    U.$$("input, select, textarea", form).forEach(function (input) {
      if (input.closest(".form-hp")) return;
      payload[input.name] = input.type === "checkbox" ? input.checked : input.value.trim();
    });
    return payload;
  }

  function mailtoFallback(payload) {
    var site = App.data.get("site") || {};
    var lines = Object.keys(payload).map(function (key) {
      return key + ": " + payload[key];
    }).join("\n");
    return "mailto:" + (site.email || "") +
           "?subject=" + encodeURIComponent("Project enquiry — " + (payload.business || payload.name || "")) +
           "&body=" + encodeURIComponent(lines);
  }

  function initContactForm(form) {
    if (!form || form.__uiBound) return;
    form.__uiBound = true;

    var contact = App.data.get("contact") || {};
    var config = contact.form || {};
    var honeypot = config.honeypot || "company_website_url";
    var submitButton = form.querySelector("[data-form-submit]");
    var loadedAt = Date.now();
    var submitting = false;
    var completed = false;

    /* Validate on blur, then live-correct once a field has been flagged */
    U.$$("input, select, textarea", form).forEach(function (input) {
      if (input.closest(".form-hp")) return;

      input.addEventListener("blur", function () { validateField(input); });
      input.addEventListener("change", function () { validateField(input); });
      input.addEventListener("input", function () {
        var group = input.closest(".form-group");
        if (group && group.classList.contains("has-error")) validateField(input);
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (submitting) return;

      if (completed) {
        C.showToast("This enquiry has already been sent.", { type: "info" });
        return;
      }

      clearStatus(form);

      /* --- spam checks (silent, so bots learn nothing) --- */
      var trap = form.querySelector('[name="' + honeypot + '"]');
      if (trap && trap.value) {
        App.log.warn("Honeypot triggered — submission discarded.");
        showStatus(form, "success", config.successTitle || "Enquiry received", config.successMessage || "Thanks.");
        return;
      }

      /* --- validation runs BEFORE the timing guard --------------------
         Someone who clicks submit on an empty form should be told which
         fields need filling, not that they were "too quick". The timing
         check only matters once the form is actually complete — which is
         also the only case a bot would reach. */
      var invalid = validateForm(form);
      if (invalid.length) {
        showStatus(form, "error", "Please check the form",
          invalid.length + (invalid.length === 1 ? " field needs" : " fields need") + " attention before this can be sent.");
        invalid[0].focus();
        return;
      }

      var elapsed = (Date.now() - loadedAt) / 1000;
      if (elapsed < (config.minSubmitSeconds || 3)) {
        showStatus(form, "error", "One moment", "That was submitted very quickly. Please review the details and try again.");
        return;
      }

      /* --- submit --- */
      var payload = collect(form);
      payload._page = location.href;
      payload._submittedAt = new Date().toISOString();

      submitting = true;
      submitButton.classList.add("is-loading");
      submitButton.disabled = true;

      var isDemo = !config.endpoint || config.mode === "demo";

      var request = isDemo
        ? new Promise(function (resolve) { setTimeout(resolve, 700); })
        : App.ajax.post(config.endpoint, payload, { timeout: config.timeout || 15000, retries: 0 });

      request.then(function () {
        completed = true;
        showStatus(form, "success",
          config.successTitle || "Enquiry received",
          (config.successMessage || "Thanks — we'll be in touch.") + (isDemo ? " " + (config.demoNotice || "") : ""));
        C.showToast("Enquiry sent", { type: "success" });
        form.reset();
        U.$$(".form-group", form).forEach(function (group) {
          group.classList.remove("is-valid", "has-error");
        });
        App.emit("form:submitted", { form: form, payload: payload, demo: isDemo });
      }).catch(function (error) {
        var message = App.ajax.handleError(error, "Contact form submission");
        showStatus(form, "error", config.errorTitle || "That didn't send", config.errorMessage || message);

        if (config.fallbackMailto) {
          var status = form.querySelector("[data-form-status] div");
          if (status) {
            status.insertAdjacentHTML("beforeend",
              '<a class="card-link mt-sm" href="' + U.attr(mailtoFallback(payload)) + '">Send it by email instead' +
              icon("arrow-right") + "</a>");
          }
        }
      }).finally(function () {
        submitting = false;
        submitButton.classList.remove("is-loading");
        submitButton.disabled = completed;
        if (completed) submitButton.textContent = "Enquiry sent";
      });
    });
  }

  App.forms = {
    buildContactForm: buildContactForm,
    initContactForm: initContactForm,
    validateField: validateField,
    validateForm: validateForm,
    showStatus: showStatus,

    /** Wires every contact form present on the page. */
    init: function (scope) {
      U.$$("[data-contact-form]", scope || document).forEach(initContactForm);
    }
  };
})(window.Site);
