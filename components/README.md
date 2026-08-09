# Components

These files are **reference templates**, not runtime includes.

At runtime every component is produced by a single JavaScript builder in
[`assets/js/components.js`](../assets/js/components.js) (cards, states, overlays) or
[`assets/js/renderer.js`](../assets/js/renderer.js) (navbar, footer). There is exactly one
implementation of each — no `service-card-home` / `service-card-page` variants.

What lives here is the **markup contract**: the HTML each component produces, with
`{{ mustache }}` placeholders where data is injected. Use them when you port this
front end to a server-rendered stack:

| Target | How to use these files |
| --- | --- |
| **PHP** | `include 'components/navbar.php';` — rename, replace `{{ x }}` with `<?= $x ?>` |
| **Laravel / Blade** | Move to `resources/views/components/`, swap `{{ x }}` for Blade's own `{{ $x }}` |
| **WordPress** | Move to the theme's `template-parts/`, load with `get_template_part()` |
| **Twig / Nunjucks / Handlebars** | The `{{ }}` syntax already matches |

## Rules that keep components reusable

1. **A component never knows where it is.** No "on the homepage" conditionals — pass
   options instead (`{ index: 3 }`, `{ features: false }`).
2. **A component is responsive by itself.** Every card works in 1, 2, 3 or 4 columns
   without markup changes, because the grid owns the columns and the card owns its
   internals.
3. **A component receives data, never fetches it.** Loading belongs to
   [`data.js`](../assets/js/data.js).
4. **Text is escaped.** `utils.escape()` for everything; `utils.richText()` only where
   an `<em>` highlight is intentional (headings).

## Files

| File | Runtime builder |
| --- | --- |
| `navbar.html` | `renderer.buildNavbar()` |
| `footer.html` | `renderer.buildFooter()` |
| `section-header.html` | `components.sectionHeader()` |
| `buttons.html` | `components.button()` |
| `service-card.html` | `components.serviceCard()` |
| `project-card.html` | `components.projectCard()` |
| `demo-card.html` | `components.demoCard()` |
| `resource-card.html` | `components.resourceCard()` |
| `tool-card.html` | `components.toolCard()` |
| `blog-card.html` | `components.blogCard()` |
| `testimonial-card.html` | `components.testimonialCard()` |
| `faq-item.html` | `components.faqAccordion()` |
| `process-step.html` | `components.processStep()` |
| `contact-form.html` | `forms.buildContactForm()` |
| `states.html` | `components.emptyState()` / `loadingState()` / `errorState()` |
| `overlays.html` | `components.showModal()` / `showToast()` |
