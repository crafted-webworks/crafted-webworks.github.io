/* ==========================================================================
   Icons — one inline SVG sprite for the whole site.
   --------------------------------------------------------------------------
   JSON refers to icons by name ("icon": "gauge"); this registry turns that
   into markup. Every icon shares a 24×24 grid and inherits colour and stroke
   width from CSS, so nothing here needs to change when the palette does.

       Site.icons.render("gauge")            → <svg class="icon">…</svg>
       Site.icons.render("gauge", "icon--lg") → with extra classes

   Adding an icon = one entry in PATHS.
   ========================================================================== */

(function (App) {
  "use strict";

  var PATHS = {
    /* --- navigation & chrome ------------------------------------------ */
    "arrow-right": '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
    "arrow-left": '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
    "arrow-up": '<path d="M12 20V5"/><path d="m5 12 7-7 7 7"/>',
    "arrow-down": '<path d="M12 4v15"/><path d="m19 12-7 7-7-7"/>',
    "arrow-up-right": '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-up": '<path d="m6 15 6-6 6 6"/>',
    "chevron-left": '<path d="m15 6-6 6 6 6"/>',
    "chevron-right": '<path d="m9 6 6 6-6 6"/>',
    "menu": '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "plus": '<path d="M12 5v14"/><path d="M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "check": '<path d="m4 12 5 5L20 6"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    "x-circle": '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.75h.01"/>',
    "external-link": '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="M4.2 4.2 5.6 5.6"/><path d="m18.4 18.4 1.4 1.4"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="M4.2 19.8 5.6 18.4"/><path d="m18.4 5.6 1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8.5 8.5 0 1 1 10.2 4 6.6 6.6 0 0 0 20 14.5z"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    "filter": '<path d="M4 5h16l-6 7.2V19l-4 2v-8.8z"/>',
    "grid": '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    "copy": '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
    "download": '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
    "eye": '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>',
    "star": '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
    "play-circle": '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z"/>',
    "loader": '<path d="M12 3.5v3.5"/><path d="M12 17v3.5"/><path d="M4.9 4.9 7.4 7.4"/><path d="m16.6 16.6 2.5 2.5"/><path d="M3.5 12H7"/><path d="M17 12h3.5"/><path d="m4.9 19.1 2.5-2.5"/><path d="m16.6 7.4 2.5-2.5"/>',

    /* --- brand / services --------------------------------------------- */
    "building": '<rect x="4.5" y="3" width="15" height="18" rx="1.6"/><path d="M9 7.5h2"/><path d="M13 7.5h2"/><path d="M9 11.5h2"/><path d="M13 11.5h2"/><path d="M10 21v-4.5h4V21"/>',
    "pen-ruler": '<path d="m4 20 1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="m14.5 6.5 3 3"/><path d="m11 10 1.6 1.6"/>',
    "target": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
    "shopping-bag": '<path d="M5.5 7.5h13l1 12a1.5 1.5 0 0 1-1.5 1.6H6a1.5 1.5 0 0 1-1.5-1.6z"/><path d="M9 10.5v-4a3 3 0 0 1 6 0v4"/>',
    "app-window": '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><path d="M3 9.5h18"/><path d="M6.5 7h.01"/><path d="M9 7h.01"/>',
    "file-edit": '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h4"/><path d="M13.5 3.5 18.5 8.5V11"/><path d="M13.5 3.5v5h5"/><path d="m19.5 13.5 1.5 1.5-4.5 4.5H15v-1.5z"/>',
    "layout-dashboard": '<rect x="3.5" y="3.5" width="7" height="8.5" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.6"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="12" width="7" height="8.5" rx="1.6"/>',
    "layout": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M9.5 19.5V10"/>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20.5 4v4.5H16"/>',
    "repeat": '<path d="m16.5 2.5 4 4-4 4"/><path d="M20.5 6.5H8a4 4 0 0 0-4 4V12"/><path d="m7.5 21.5-4-4 4-4"/><path d="M3.5 17.5H16a4 4 0 0 0 4-4V12"/>',
    "plug": '<path d="M9 3v6"/><path d="M15 3v6"/><path d="M6 9h12v1.8a6 6 0 0 1-12 0z"/><path d="M12 16.8V21"/>',
    "wrench": '<path d="M15.5 3a5 5 0 0 0-4.6 7L3.2 17.7l3.1 3.1 7.7-7.7a5 5 0 0 0 6-6.4L17.2 9.7 14.3 6.8l2.9-3.1A5 5 0 0 0 15.5 3z"/>',
    "gauge": '<path d="M4.4 18a9 9 0 1 1 15.2 0"/><path d="m12 14 3.5-3.9"/><circle cx="12" cy="15" r="1.4"/>',
    "zap": '<path d="m13.5 2.5-9 12H11l-.5 7 9-12H13z"/>',
    "rocket": '<path d="M12 3c2.9 2.1 4.8 5.5 4.8 9L14 15h-4l-2.8-3c0-3.5 1.9-6.9 4.8-9z"/><path d="m9.5 15-3 1 1-3"/><path d="m14.5 15 3 1-1-3"/><circle cx="12" cy="9" r="1.6"/><path d="M10.5 18.5c.5 1.5 1.5 2.5 1.5 2.5s1-1 1.5-2.5"/>',
    "compass": '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3z"/>',
    "clipboard-list": '<path d="M9 4.5H7A1.5 1.5 0 0 0 5.5 6v13A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-2"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M9 11h6"/><path d="M9 15h4"/>',
    "palette": '<path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.3a1.9 1.9 0 0 0 1.4-3.2 1.9 1.9 0 0 1 1.4-3.2h1.6a3.8 3.8 0 0 0 3.8-3.8A8.5 8.5 0 0 0 12 3.5z"/><circle cx="8.5" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.1" fill="currentColor" stroke="none"/>',
    "code": '<path d="m8 6.5-5.5 5.5L8 17.5"/><path d="m16 6.5 5.5 5.5L16 17.5"/>',
    "code-2": '<path d="m13.5 3.5-3 17"/><path d="M8 8 4 12l4 4"/><path d="m16 8 4 4-4 4"/>',
    "braces": '<path d="M8 3.5h-.5A2.5 2.5 0 0 0 5 6v3.2A2.3 2.3 0 0 1 2.7 11.5h-.2a2.3 2.3 0 0 1 2.5 2.3V18a2.5 2.5 0 0 0 2.5 2.5H8"/><path d="M16 3.5h.5A2.5 2.5 0 0 1 19 6v3.2a2.3 2.3 0 0 0 2.3 2.3h.2a2.3 2.3 0 0 0-2.5 2.3V18a2.5 2.5 0 0 1-2.5 2.5H16"/>',
    "terminal": '<rect x="2.5" y="4" width="19" height="16" rx="2.2"/><path d="m7 10 2.5 2.5L7 15"/><path d="M12.5 15.5H17"/>',
    "cpu": '<rect x="7.5" y="7.5" width="9" height="9" rx="1.6"/><rect x="4" y="4" width="16" height="16" rx="2.6"/><path d="M9 2.5V4"/><path d="M15 2.5V4"/><path d="M9 20v1.5"/><path d="M15 20v1.5"/><path d="M2.5 9H4"/><path d="M2.5 15H4"/><path d="M20 9h1.5"/><path d="M20 15h1.5"/>',
    "database": '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    "globe": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a14 14 0 0 1 0 17"/><path d="M12 3.5a14 14 0 0 0 0 17"/>',
    "cloud": '<path d="M7 18.5h9.5a4.2 4.2 0 0 0 .4-8.4 6.2 6.2 0 0 0-11.9 1.6A3.6 3.6 0 0 0 7 18.5z"/>',
    "layers": '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 17 8.5 4.5 8.5-4.5"/>',
    "blocks": '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.6"/><path d="M3.5 17.2a4.2 4.2 0 0 1 4.2-4.2h3.3v3.3a4.2 4.2 0 0 1-4.2 4.2H3.5z"/>',
    "sparkle": '<path d="m11 3.5 1.8 4.7 4.7 1.8-4.7 1.8L11 16.5 9.2 11.8 4.5 10l4.7-1.8z"/><path d="m18 14.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    "trending-up": '<path d="m3.5 17 6-6 4 4 7-7"/><path d="M15.5 8h5v5"/>',
    "shield-check": '<path d="m12 3 8 3v5.8c0 4.5-3.2 8.3-8 9.7-4.8-1.4-8-5.2-8-9.7V6z"/><path d="m8.8 12 2.3 2.3 4.4-4.6"/>',
    "feather": '<path d="M19.5 4.5a5.7 5.7 0 0 0-8 0L4 12v7.5h7.5l7.5-7.5a5.7 5.7 0 0 0 .5-7.5z"/><path d="M4 20 14.5 9.5"/><path d="m13.5 6.5 4 4"/>',
    "accessibility": '<circle cx="12" cy="4.6" r="1.8"/><path d="M5 8.5h14"/><path d="m9 21 3-8 3 8"/><path d="M12 13V8.5"/>',
    "devices": '<rect x="2.5" y="5" width="13.5" height="9.5" rx="1.8"/><path d="M2.5 18.5h13.5"/><rect x="17" y="9" width="4.5" height="10.5" rx="1.4"/>',
    "smartphone": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.8 18.5h2.4"/>',
    "handshake": '<path d="m11 17.5 2.2 2.2a1.2 1.2 0 0 0 1.7 0l5.6-5.6"/><path d="m3.5 10.5 4-4 3.5 3.5 2-2 5 5"/><path d="M20.5 10.5 16.5 6.5"/><path d="m8 14 2.5 2.5"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.2A6 6 0 0 1 21.5 20"/>',
    "user-star": '<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20a6.5 6.5 0 0 1 10.5-5.1"/><path d="m17.5 13.5 1.1 2.3 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z"/>',
    "briefcase": '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="M9 7V5.5A2 2 0 0 1 11 3.5h2a2 2 0 0 1 2 2V7"/><path d="M3 12.5h18"/>',
    "store": '<path d="M4.5 9.5h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z"/><path d="m3 9.5 1.6-5.2h14.8L21 9.5"/><path d="M9.5 20.5V15h5v5.5"/>',
    "home": '<path d="m3.5 11 8.5-7.5 8.5 7.5"/><path d="M6 9.8V20.5h12V9.8"/><path d="M10 20.5V15h4v5.5"/>',
    "utensils": '<path d="M5.5 3v6.5a2.2 2.2 0 0 0 4.4 0V3"/><path d="M7.7 11.7V21"/><path d="M17.5 3c-1.6 1.1-2.6 3.1-2.6 5.6s1 4.1 2.6 4.4V21"/>',
    "stethoscope": '<path d="M6 3v5.2a4 4 0 0 0 8 0V3"/><path d="M4.5 3H6"/><path d="M14 3h1.5"/><path d="M10 12.2V15a5 5 0 0 0 10 0v-.8"/><circle cx="20" cy="12.2" r="2"/>',
    "graduation-cap": '<path d="m12 4 9.5 4.5L12 13 2.5 8.5z"/><path d="M6.5 10.8V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-5.2"/>',
    "calendar": '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/>',
    "calendar-check": '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/><path d="m9.5 14.5 2 2 3.5-3.5"/>',
    "heart-hand": '<path d="M12 20.5S4.5 15.6 4.5 10.6A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.5 2.4c0 5-7.5 9.9-7.5 9.9z"/>',
    "scale": '<path d="M12 3.5v17"/><path d="M7 20.5h10"/><path d="M5 8.5h14"/><path d="m5 8.5-2.8 5.6h5.6z"/><path d="m19 8.5 2.8 5.6h-5.6z"/>',
    "map-pin": '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    "list-tree": '<path d="M8.5 5h12.5"/><path d="M8.5 12h12.5"/><path d="M8.5 19h12.5"/><path d="M4 5h.01"/><path d="M4 12h.01"/><path d="M4 19h.01"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>',
    "lock": '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m3.5 7 8.5 5.8L20.5 7"/>',
    "message-circle": '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5l1.4-4.7A8.4 8.4 0 1 1 20.5 11.6z"/>',
    "help-circle": '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.7.7c0 1.6-2.4 2-2.4 3.4"/><path d="M12 17h.01"/>',
    "lightbulb": '<path d="M9.5 18h5"/><path d="M10.5 20.8h3"/><path d="M12 3.2a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2v.3h4.8v-.3c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.2z"/>',
    "inbox": '<path d="M3.5 13.5h4l2 3h5l2-3h4"/><path d="m3.5 13.5 2.2-8.2a1.5 1.5 0 0 1 1.4-1.1h9.8a1.5 1.5 0 0 1 1.4 1.1l2.2 8.2V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/>',
    "file-text": '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M9 13h6"/><path d="M9 16.5h4"/>',
    "check-square": '<path d="M20.5 11.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5h11"/><path d="m8 11.5 3 3 8.5-9"/>',
    "book-open": '<path d="M12 6.6C10.4 5 7.8 4.4 3.5 5v13.5c4.3-.6 6.9 0 8.5 1.6 1.6-1.6 4.2-2.2 8.5-1.6V5c-4.3-.6-6.9 0-8.5 1.6z"/><path d="M12 6.6v13.5"/>',
    "bookmark": '<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/>',
    "toolbox": '<rect x="3" y="8" width="18" height="12.5" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13.5h18"/><path d="M10 13.5v2h4v-2"/>',
    "shapes": '<circle cx="7" cy="16.5" r="4"/><rect x="13" y="12.5" width="8" height="8" rx="1.6"/><path d="m12 3 4.2 7.2H7.8z"/>',
    "gallery": '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><circle cx="8.8" cy="9.8" r="1.8"/><path d="m5 17.5 4.5-4.3 3 2.8 3.5-3.5 4 4"/>',
    "image": '<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><circle cx="8.8" cy="9.8" r="1.8"/><path d="m5 17.5 4.5-4.3 3 2.8 3.5-3.5 4 4"/>',
    "image-down": '<rect x="3" y="4" width="18" height="12.5" rx="2.2"/><circle cx="8.5" cy="9" r="1.6"/><path d="m4.5 15 4-3.8 3 2.6"/><path d="M17 15.5v5"/><path d="m14.5 18.5 2.5 2.5 2.5-2.5"/>',
    "crop": '<path d="M6 2.5v14a1.5 1.5 0 0 0 1.5 1.5h14"/><path d="M2.5 6h14A1.5 1.5 0 0 1 18 7.5v14"/>',
    "qr-code": '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><path d="M13.5 13.5h3.2v3.2h-3.2z"/><path d="M20.5 13.5v3.2"/><path d="M17 20.5h3.5"/><path d="M13.5 20.5h.01"/>',
    "sitemap": '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="2.5" y="16" width="6" height="5" rx="1.2"/><rect x="15.5" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v3"/><path d="M5.5 16v-2.5h13V16"/><path d="M12 11v2.5"/>',
    "align-left": '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/>',
    "type": '<path d="M4.5 6.5V4.5h15v2"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
    "letter-case": '<path d="m3.5 18 4.2-12L11.9 18"/><path d="M5 14h5.4"/><path d="M20.5 11.5a3 3 0 0 0-5.5 1.7v3.3a2.3 2.3 0 0 0 4 1.5"/><path d="M20.5 11.5V18"/>',
    "link": '<path d="M10 13.2a4.2 4.2 0 0 0 6 0l2.6-2.6a4.2 4.2 0 0 0-6-6l-1.4 1.4"/><path d="M14 10.8a4.2 4.2 0 0 0-6 0l-2.6 2.6a4.2 4.2 0 0 0 6 6l1.4-1.4"/>',
    "link-2": '<path d="M9 12h6"/><path d="M8.5 7H7.5a5 5 0 0 0 0 10h1"/><path d="M15.5 7h1a5 5 0 0 1 0 10h-1"/>',
    "tag": '<path d="m20.4 12.6-7.8 7.8a1.9 1.9 0 0 1-2.7 0l-6.3-6.3a1.9 1.9 0 0 1-.6-1.4V5a1.9 1.9 0 0 1 1.9-1.9h7.7a1.9 1.9 0 0 1 1.4.6l6.4 6.4a1.9 1.9 0 0 1 0 2.5z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
    "key": '<circle cx="8" cy="14.5" r="4"/><path d="m11 11.5 8.5-8.5"/><path d="m17 5.5 2 2"/><path d="m14.5 8 2 2"/>',
    "binary": '<rect x="3.5" y="3.5" width="6" height="7" rx="1.2"/><rect x="14.5" y="13.5" width="6" height="7" rx="1.2"/><path d="M4.5 20.5h4"/><path d="M6.5 13.5v7"/><path d="M15.5 3.5h2v7"/><path d="M13.5 10.5h6"/>',
    "minimize": '<path d="M8.5 3.5V8h-4.5"/><path d="M15.5 20.5V16h4.5"/><path d="M3.5 16H8v4.5"/><path d="M20.5 8H16V3.5"/>',
    "gradient": '<rect x="3.5" y="3.5" width="17" height="17" rx="2.2"/><path d="M3.5 15 15 3.5"/><path d="M8.5 20.5 20.5 8.5"/><path d="M3.5 20.5 6 18"/>',
    "square-stack": '<rect x="8" y="8" width="12.5" height="12.5" rx="2"/><path d="M16 4.5H5.5A1.5 1.5 0 0 0 4 6v10.5"/>',
    "ruler": '<path d="M4 15 15 4l5 5L9 20z"/><path d="m8 11 2 2"/><path d="m11 8 2 2"/><path d="m14 5 2 2"/>',
    "scissors": '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5 20 18"/><path d="M8 16.5 20 6"/>',
    "calendar-days": '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 17.5h.01"/><path d="M12 17.5h.01"/>',

    /* --- social -------------------------------------------------------- */
    "instagram": '<rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>',
    "linkedin": '<path d="M6 9.5V20"/><circle cx="6" cy="5.5" r="1.7"/><path d="M11 20v-6.2a3.2 3.2 0 0 1 6.4 0V20"/><path d="M11 9.5V20"/>',
    "github": '<path d="M15 21v-3.4a3 3 0 0 0-.9-2.3c2.9-.3 6-1.4 6-6.4a4.9 4.9 0 0 0-1.4-3.4 4.6 4.6 0 0 0-.1-3.4s-1.1-.3-3.6 1.3a12.3 12.3 0 0 0-6.4 0C6.1 2.2 5 2.5 5 2.5a4.6 4.6 0 0 0-.1 3.4A4.9 4.9 0 0 0 3.5 9.3c0 5 3.1 6.1 6 6.4a3 3 0 0 0-.9 2.3V21"/><path d="M8.6 18.5c-3.4 1-4-1.6-5.6-2"/>',
    "x-social": '<path d="m4 4 7.5 9.2L4.5 20"/><path d="M20 4h-2.5l-5.6 6.4"/><path d="m9.5 12.5 6 7.5H20"/>',

    /* --- brand mark ---------------------------------------------------- */
    "logo-mark": '<rect x="2.5" y="4.5" width="19" height="15" rx="3.4" fill="none"/><path d="M2.5 9h19" opacity=".55"/><path d="m9.2 12.4-1.9 2 1.9 2" /><path d="m14.8 12.4 1.9 2-1.9 2"/><path d="m12.9 11.6-1.8 5.6"/>'
  };

  /* Aliases keep the JSON readable without duplicating path data */
  var ALIASES = {
    "toolbox": "toolbox",
    "gallery": "gallery",
    "quote": "message-circle",
    "email": "mail",
    "phone": "message-circle",
    "twitter": "x-social",
    "x": "x",
    "spinner": "loader",
    "web": "globe",
    "developer": "code",
    "text": "type",
    "color": "palette",
    "converter": "repeat",
    "generator": "sparkle",
    "seo": "search",
    "images": "image",
    "checklist": "check-square",
    "guide": "book-open",
    "template": "file-text",
    "reference": "bookmark"
  };

  var FALLBACK = "sparkle";
  var injected = false;

  function resolve(name) {
    if (!name) return FALLBACK;
    if (PATHS[name]) return name;
    if (ALIASES[name] && PATHS[ALIASES[name]]) return ALIASES[name];
    App.log.warn('Unknown icon "' + name + '" — falling back to "' + FALLBACK + '".');
    return FALLBACK;
  }

  /** Injects the <symbol> sprite once, at the top of <body>. */
  function injectSprite() {
    if (injected || !document.body) return;
    var symbols = Object.keys(PATHS).map(function (name) {
      return '<symbol id="ui-i-' + name + '" viewBox="0 0 24 24">' + PATHS[name] + "</symbol>";
    }).join("");

    var sprite = document.createElement("div");
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    sprite.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + symbols + "</svg>";
    document.body.insertBefore(sprite, document.body.firstChild);
    injected = true;
  }

  App.icons = {
    paths: PATHS,

    /**
     * @param {string} name    icon id from the registry
     * @param {string} [extra] extra class names
     * @param {object} [opts]  { label } — set to make the icon meaningful to
     *                         screen readers instead of decorative
     */
    render: function (name, extra, opts) {
      var id = resolve(name);
      var options = opts || {};
      var classes = "icon" + (extra ? " " + extra : "");
      var a11y = options.label
        ? ' role="img" aria-label="' + App.utils.attr(options.label) + '"'
        : ' aria-hidden="true" focusable="false"';
      return '<svg class="' + classes + '"' + a11y + '><use href="#ui-i-' + id + '"></use></svg>';
    },

    /** Icon inside the standard tile wrapper. */
    tile: function (name, extra) {
      return '<span class="icon-tile' + (extra ? " " + extra : "") + '">' +
             App.icons.render(name) + "</span>";
    },

    has: function (name) {
      return !!PATHS[name] || !!(ALIASES[name] && PATHS[ALIASES[name]]);
    },

    init: injectSprite
  };
})(window.Site);
