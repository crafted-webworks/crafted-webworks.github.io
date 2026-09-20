# Standard for building a new tool

Read this before starting a new tool in `tools/<tool-name>/`. It's a general standard, not
tied to any one tool — `tools/qr-code-generator/` is the reference implementation to look at
when a rule here needs a working example.

## 1. What "standalone" means

A tool is one self-contained folder: its own `index.html`, `style.css`, `app.js`, and any
library it needs, bundled locally.

- **No backend.** Everything runs client-side. No fetch to a server for the tool's core
  function.
- **No external network dependency at runtime.** Third-party libraries are downloaded once
  and committed into the folder verbatim (with their license header intact), not pulled from
  a CDN on load. The folder must work opened directly from disk, with the network off.
- **No dependency on the parent site.** Nothing in the folder references the host site's
  `assets/js` or `assets/css`. Copy the folder into any other project and it still works.
- **Embeddable.** The folder is a complete page (`index.html`) that can be opened directly
  *or* dropped into an `<iframe>` on another page with zero changes.

Structure:
```
tools/<tool-name>/
├── index.html      # the whole page: markup + <link>/<script> to the two files below
├── style.css       # self-contained styling, its own tokens (see §3)
├── app.js          # all behavior, one IIFE, no globals leaked
└── <vendor>.js      # any bundled third-party library, committed verbatim with its license header
```

## 2. Integration contract with this site

The host site never hardcodes a tool's path. A tool is wired in purely through data:

- `data/tools.json → items[]` gets one entry with at minimum `id`, `title`, `description`,
  `icon`, `category`, `status: "live"`, and **`src`** — the tool's `index.html` path. `src` is
  one of the keys `check-integrity.mjs` already validates as a real internal link, so a typo
  fails the build instead of shipping.
- Optionally `"fullscreen": true` if the tool deserves the whole viewport rather than a
  compact popup (see §5).
- `assets/js/tools.js → REGISTRY[id]` gets a **thin wrapper**, not a reimplementation:
  ```js
  "tool-id": {
    render: function (tool) {
      return '<div class="tool-frame-wrap">' +
        '<iframe class="tool-frame" src="' + U.url(tool.src) + '" title="' + tool.title + '" loading="lazy"></iframe>' +
      "</div>";
    },
    mount: function (root, tool) {
      // Same-origin iframe: read tool.fullscreen to decide whether to
      // auto-fit the iframe height to its content (compact popup) or let
      // CSS fill it (fullscreen popup) — see the qr-code-generator entry
      // in tools.js for the working version of this before copying it.
    }
  }
  ```
  Every field the wrapper needs (path, title, fullscreen flag) comes from the `tool` object —
  **never hardcode a tool's own path or title inside tools.js.** If it's about the tool, it
  belongs in `tools.json`.
- **`src` names `index.html` explicitly** (`"/tools/<tool-name>/index.html"`), not just the
  folder. This is a real trade-off, not a stylistic choice — get it wrong in either direction
  and a whole tool silently fails to load:
  - Naming the file works everywhere that matters: `file://` (the README's documented "open
    `index.html` directly from disk" mode — a browser does **not** auto-resolve a bare
    directory path to `index.html` over `file://`, it shows a directory listing instead),
    GitHub Pages, and any ordinary static host.
  - Naming just the folder (`"/tools/<tool-name>/"`) was tried first, to route around a
    different bug: some local dev servers (encountered in this repo) redirect a request for
    `.../index.html` to a clean-URL form that **drops the trailing slash**
    (`.../tool-name` instead of `.../tool-name/`), which then breaks every relative
    `href`/`src` inside that page (they resolve one directory too high and 404). Naming the
    folder sidesteps that — but it breaks `file://` outright, which is worse: that redirect
    quirk is one dev tool's local-preview behavior, while `file://` support is a documented,
    load-bearing feature of this whole project. **If a local dev server exhibits that
    redirect, fix or disable clean-URL redirects in that server's config — don't change
    `src` to route around it.** This exact mistake was made and reverted once already; don't
    reintroduce it in either direction.

## 3. Design tokens

Declare the tool's own palette as CSS custom properties at the top of its `style.css` — never
scatter color literals through the rest of the file:
```css
:root {
  --tool-page: #f6f4f0;      /* page background */
  --tool-card: #ffffff;      /* card surface */
  --tool-border: #e7e2d8;
  --tool-text: #1f1c17;
  --tool-muted: #8b8477;
  --tool-accent: #e2972e;    /* the one accent color, used for active states + primary button */
  --tool-accent-ink: #4a2f06;/* text color that reads on top of --tool-accent */
}
```
Rules that follow from this:
- **One accent color.** Active/selected states, the primary button, and any highlight all
  reuse the same accent token. Don't introduce a second "brand" color without a reason.
- **Border radius capped at 4px**, everywhere in the tool's own chrome (cards, buttons, tabs,
  inputs, tiles). The one exception: a control whose *shape itself* is the information — a
  circular color swatch, or a preview icon literally depicting a shape option (rounded vs
  square vs dot). Flattening those would misrepresent the option, not just restyle it.
- No icon font, no CSS framework. Inline SVG for icons — a small inline `<svg>` with
  `currentColor` stroke, sized to the surrounding text.
- **`[hidden] { display: none !important; }` goes in every tool's stylesheet, near the top.**
  This isn't defensive paranoia — it's required by §4's own hidden-toggle pattern. The browser's
  built-in rule is `[hidden] { display: none }`, but *any* plain author rule that sets `display`
  on that same element (e.g. `.some-row { display: flex }`) overrides it regardless of selector
  specificity, because CSS compares origin (author vs. user-agent) before specificity — an
  author rule always wins over a user-agent rule at equal weight. Any element that both gets
  `hidden` toggled *and* carries a class setting `display` silently ignores `hidden` without
  this line. Found live in two tools before being made a standing rule; check for it before
  assuming a `hidden` toggle bug is anywhere else.

## 4. Interaction patterns (reuse these shapes rather than inventing new ones)

- **Pill tabs** for switching between top-level modes — an `is-active` class toggled by a
  small `wireTabs(buttons, onSelect)` helper, not a framework component.
- **Choice cards** for a small set of visually-distinct options — each shows a literal
  miniature of what it does, not just a label. If an option has a visual identity, show it
  instead of describing it.
- **Swatch rows** for color choice, plus one **custom swatch**: a circle painted with a
  rainbow conic-gradient, containing a fully transparent native `<input type="color">`
  stretched over it — clicking it opens the OS color picker directly, no extra JS needed to
  trigger it.
- **Solid / Gradient toggle** for any color property that could reasonably be either: two
  small mode buttons swap which panel is visible (toggle the `hidden` attribute, not
  `display:none` via a class, so it stays inspectable in devtools). Store a gradient as
  `{ from, to, angle }`, never a pre-computed `CanvasGradient` — that gets rebuilt fresh
  against whatever context needs it (see §6).
- **Angle dial**, not a slider, for picking a direction: a small circle where pointer position
  relative to its center is converted with `atan2(dy, dx)`, in degrees, 0° = east, increasing
  clockwise. Pick that same convention for a new dial so it lines up 1:1 with a canvas
  `createLinearGradient` angle — the number on screen should be the number actually used, with
  no hidden conversion between them.
- **Advanced settings collapsed** behind a native `<details>/<summary>` — no JS needed to
  toggle it, and it degrades fine with JS disabled.

## 5. Fullscreen vs compact popup (when embedded)

A tool with real work to do (multiple fields, a live preview, a growing options panel) should
declare `"fullscreen": true` and behave as its own full-viewport app when opened, not a small
modal. A tool that's a single input/output round-trip (a converter, a one-field generator)
stays in the default compact popup. This is a per-tool data decision, not a host-side default.

**A fullscreen tool must reserve top-right clearance for the host's edge controls.** When
`fullscreen: true`, the host drops its normal title bar and instead floats a small
restore/close button pair over the top-right corner of the page (roughly an 84px-wide, 40px-tall
area). If the tool's own header puts anything there — a button, a title, a toolbar — it will sit
underneath and get visually clipped or become unclickable. Reserve the space explicitly, e.g.:
```css
.header-right {
  margin-right: 84px; /* clears the host's floating restore/close controls */
}
```
`color-magic/style.css` has the working version of this — its "Choose Image" button collided
with the edge controls before this was added.

## 5a. Reference implementations by concern

More than one tool now demonstrates parts of this standard; when a rule needs a working
example, these are the ones actually built to it:

| Concern | Look at |
| --- | --- |
| The basic contract (§1–§2) | `qr-code-generator/` |
| Generators + presets at scale (§7) | `png-brusher/app.js` |
| Layers, undo/redo scoped per-layer, zoom | `png-brusher/app.js` |
| A tool integrated from outside this repo, not built here | `color-magic/` |

## 6. Rendering & export approach

- **One paint routine, every output shares it.** A function that takes any 2D canvas context
  and draws the tool's output into it should be the *only* place that drawing logic lives —
  reused by the live preview and by any other canvas the tool needs (a thumbnail, an export
  buffer). Never duplicate drawing logic between the on-screen preview and an export path;
  they will drift out of sync with each other.
- **Colors are resolved at paint time, against the context that will use them** — a solid
  color is just a string; a gradient is turned into a real `CanvasGradient` via
  `context.createLinearGradient(...)` right before it's used as a `fillStyle`. Canvas accepts
  a gradient object anywhere it accepts a color string, so the drawing primitives underneath
  never need to know which one they got.
- **Exporting to a vector format (SVG)** means re-deriving the same shapes as real SVG
  elements — a gradient becomes a `<linearGradient>` def with the same angle math, not a
  rasterized image. Keep one small "resolve fill for this format" function per format so the
  canvas version and the SVG version can't silently diverge.
- **Exporting to PDF without a library**: JPEG is already DCT-encoded, so a canvas's JPEG
  bytes can be wrapped in a hand-built, minimal single-page PDF (`/Filter /DCTDecode`) with no
  compression algorithm of your own to implement. See `qr-code-generator/app.js →
  buildPdfBytes` for the exact byte layout (catalog → pages → page → XObject image → content
  stream → xref → trailer) — copy that pattern rather than reaching for a PDF library.

## 7. Building a large family of options (generators + presets)

Some tools need to offer many visually distinct choices — brush styles, filter looks, pattern
fills, whatever the tool's equivalent is. The temptation is to hand-code each one as its own
function. Don't: that doesn't scale past a handful, and every new option becomes a copy-paste
of the last one with small drifts.

Instead, split the problem in two:

- A small number of **generators** — pure functions that take the same fixed signature
  (`context, point, size, color, opacity, params`) and implement one genuinely different
  *behavior* (a solid stamp, a soft falloff, a scatter of grains, a fixed-angle nib, a flung
  cluster of droplets, and so on). A generator earns its place only if it produces a mark
  nothing else in the set can — not just the same shape at a different size.
- A longer list of named **presets** — plain data, each just `{ id, label, category?,
  generator, params }`. A preset adds no new code, only tunes an existing generator's
  parameters (grain density, scatter spread, alpha range, angle...). Going from 7 presets to
  30 should mean adding data, not writing 23 more functions.

This is exactly how a real brush engine (Photoshop included) works — one stamp behavior,
reused with different settings — and it's the honest way to offer "many options" without
either duplicating logic or reaching for copyrighted third-party assets. See
`png-brusher/app.js → GENERATORS` / `PRESETS` for the reference implementation (14 generators,
28 presets, grouped into category tabs so the picker stays usable).

Two things follow from splitting it this way:

- **Every preset should render its own live preview** the same way a choice card does (§4) —
  run the *exact* generator + params a preset uses over a short sample path into a small
  canvas, don't hand-draw a representative icon. The preview and the real behavior can then
  never drift apart, because they're the same code.
- **Group presets by category** (tabs or a similar filter) once the list passes roughly a
  dozen — a single flat grid of 30 buttons is worse than the plain dropdown it replaced.

## 8. Integrating a tool that wasn't built here

Sometimes a finished tool (three files, handed over as a zip, built elsewhere) needs to join
this repo rather than be written from scratch. Before wiring it in:

- **Read it before trusting it.** Open all three files. Confirm it's actually one self-contained
  IIFE with no leaked globals, and grep it for `http://`, `https://`, and `cdn.` — any hit means
  a runtime network dependency that violates §1 and needs to be resolved (bundle the library
  locally) before it goes in, not after.
- **Don't force this repo's design tokens onto it.** A tool built elsewhere has its own visual
  language (`color-magic/` doesn't use this repo's 4px-radius rule, and that's fine) — respect
  it rather than reskinning it to match. The one thing it *does* need to absorb is the
  fullscreen edge-control clearance in §5, because that's a real collision, not a style choice.
- **It slots into the same two integration points as any other tool** — `data/tools.json` and
  the shared `framedTool` registry entry in `tools.js` (§2). Nothing about "this came from
  outside" changes that contract; a tool is a tool once its three files are in `tools/<name>/`.

## 9. Verify by actually rendering it, not just by reading the files

A tool's HTML/CSS/JS can be internally perfect — every tag balanced, every id cross-referenced,
`node --check` clean — and still be broken when someone actually opens it, because some
failures only exist in the gap between the files and a real browser rendering them through a
real server. `check-integrity.mjs`, `node --check`, and grepping for stray references catch a
lot, but they cannot catch:

- A dev server's redirect behavior silently breaking relative paths (§2's trailing-slash rule
  was found exactly this way, not by reading the code).
- Two elements from different files (the host's edge controls, the tool's own header) actually
  overlapping at real pixel sizes.
- Anything that only shows up after the iframe has actually fetched and executed its own JS.

When a layout or integration bug is reported and static reading of the files finds nothing
wrong, that itself is a signal to stop guessing and reproduce it: serve the real site, open a
real (even headless) browser, navigate to the actual modal via its `#tool-id` hash, and look at
what actually renders. Fix the reproduced bug, then verify the fix the same way — against the
same real rendering, not just by re-reading the diff.

## 10. What NOT to do

- Don't reach into the parent site's `App.*` namespace from inside the tool folder — the whole
  point is that it doesn't need to.
- Don't add a build step. No bundler, no npm install to run the tool. A `<script src="...">`
  tag is the dependency graph.
- Don't leave a duplicate value in two places (a color, a path, a size) — one of them will go
  stale. Prefer the single source (a CSS custom property, a `tools.json` field, a shared paint
  function) and reference it everywhere else.
