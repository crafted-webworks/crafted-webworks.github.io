/**
 * build-bundle.mjs — generates data/bundle.js from the JSON files.
 *
 *   node tools/build-bundle.mjs
 *
 * WHY THIS EXISTS
 * Browsers block fetch() on the file:// protocol, so opening index.html by
 * double-clicking it would leave every section empty. data.js falls back to
 * this generated bundle whenever a fetch fails, which makes the site work
 * without a web server.
 *
 * The JSON files remain the single source of truth — this file is generated
 * output and should never be edited by hand. Re-run the script after changing
 * any JSON, or just serve the site over HTTP where the bundle is ignored.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Must mirror SOURCES in assets/js/data.js */
const SOURCES = {
  site: "site.json",
  seo: "seo.json",
  pages: "pages.json",
  navigation: "navigation.json",
  footer: "footer.json",
  social: "social.json",
  homepage: "homepage.json",
  about: "about.json",
  services: "services.json",
  projects: "projects.json",
  demos: "demos.json",
  resources: "resources.json",
  tools: "tools.json",
  blog: "blog.json",
  faqs: "faqs.json",
  testimonials: "testimonials.json",
  process: "process.json",
  websiteTypes: "website-types.json",
  contact: "contact.json",
  legal: "legal.json",
  contactForm: "forms/contact.json"
};

const bundle = {};
let bytes = 0;

for (const [name, file] of Object.entries(SOURCES)) {
  const raw = await readFile(join(root, "data", file), "utf8");
  bytes += raw.length;
  try {
    bundle[name] = JSON.parse(raw);
  } catch (error) {
    console.error(`  ✗ ${file} is not valid JSON — ${error.message}`);
    process.exitCode = 1;
  }
  console.log(`  ✓ ${file}`);
}

const output = `/* GENERATED FILE — do not edit.
 * Built from data/*.json by tools/build-bundle.mjs
 * Used only as a fallback when fetch() is unavailable (file:// protocol).
 * Re-run: node tools/build-bundle.mjs
 */
window.SITE_DATA = ${JSON.stringify(bundle, null, 2)};
`;

await writeFile(join(root, "data", "bundle.js"), output, "utf8");

console.log(`\nBundled ${Object.keys(bundle).length} data files (${(bytes / 1024).toFixed(1)} KB) → data/bundle.js`);
