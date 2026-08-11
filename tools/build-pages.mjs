/**
 * build-pages.mjs — generates the static HTML shells from data/pages.json.
 *
 *   node tools/build-pages.mjs
 *
 * Every page in this project is the same shell: a <head> with a crawl-time
 * title/description, mount points for the navbar, sections and footer, and one
 * script tag. Rather than maintain thirteen near-identical files by hand, this
 * script writes them from the same data the runtime uses.
 *
 * Add a page:
 *   1. Add an entry to data/pages.json
 *   2. Run this script
 * The shell is created and the runtime does the rest.
 *
 * Safe to run repeatedly — it only rewrites the generated shells.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Strips the <em> highlight markup used in headings. */
const plain = (value = "") => String(value).replace(/<\/?[^>]+>/g, "");

/**
 * Build-time mirror of the {{site.*}} / {{social.*}} resolver in
 * assets/js/data.js. The studio name lives only in data/site.json, so the
 * generated <title> and <meta description> have to resolve it here too.
 */
function interpolate(node, context) {
  if (typeof node === "string") {
    return node.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, ref) => {
      const value = ref.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), context);
      return value == null || typeof value === "object" ? match : String(value);
    });
  }
  if (Array.isArray(node)) return node.map((item) => interpolate(item, context));
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) node[key] = interpolate(node[key], context);
  }
  return node;
}

function shell({ pageId, title, description, prefix }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark" data-bs-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- GENERATED FILE — edit data/pages.json and run: node tools/build-pages.mjs
       Shared head assets (meta tags, fonts and global CSS) are injected at
       runtime by assets/js/loader.js so they live in one place instead of
       being duplicated across every HTML page. -->
  <title>${escapeHtml(title)}</title>
  
  <!-- Favicons -->
  <link rel="icon" type="image/x-icon" href="${prefix}favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/images/favicon-32.png">
  <link rel="icon" type="image/png" sizes="64x64" href="${prefix}assets/images/favicon-64.png">

  <script>
    (function () {
      try {
        var t = localStorage.getItem("site:theme");
        if (t) { document.documentElement.setAttribute("data-theme", t); document.documentElement.setAttribute("data-bs-theme", t); }
      } catch (e) {}
    })();
  </script>
</head>

<body data-page="${pageId}">
  <div data-component="navbar"></div>

  <main id="main" data-sections></main>

  <div data-component="footer"></div>

  <script src="${prefix}assets/js/loader.js" defer></script>
</body>
</html>
`;
}

const siteData = JSON.parse(await readFile(join(root, "data", "site.json"), "utf8"));
const socialData = JSON.parse(await readFile(join(root, "data", "social.json"), "utf8"));
const tokens = { site: siteData, social: interpolate(socialData, { site: siteData }) };

const pages = interpolate(JSON.parse(await readFile(join(root, "data", "pages.json"), "utf8")), tokens);
const seo = interpolate(JSON.parse(await readFile(join(root, "data", "seo.json"), "utf8")), tokens);
const template = seo.defaults.titleTemplate || "%s";

await mkdir(join(root, "pages"), { recursive: true });

let written = 0;

for (const [pageId, page] of Object.entries(pages)) {
  const url = page.url || `/pages/${pageId}.html`;
  const outputPath = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const depth = outputPath.split("/").length - 1;
  const prefix = "../".repeat(depth) || "./";

  const rawTitle = page.seo?.title || plain(page.header?.title) || pageId;
  const title = page.seo?.useTitleTemplate === false ? rawTitle : template.replace("%s", rawTitle);

  const html = shell({
    pageId,
    title,
    description: page.seo?.description || seo.defaults.description,
    prefix
  });

  await writeFile(join(root, outputPath), html, "utf8");
  written += 1;
  console.log(`  ✓ ${url}`);
}

console.log(`\n${written} page shells generated from data/pages.json.`);

/* ---------------------------------------------------------------------------
   sitemap.xml — also generated from the data, so a new page or blog post is
   never missing from it.
   --------------------------------------------------------------------------- */
const site = JSON.parse(await readFile(join(root, "data", "site.json"), "utf8"));
const blog = JSON.parse(await readFile(join(root, "data", "blog.json"), "utf8"));

const origin = String(site.url || "https://example.com/").replace(/\/+$/, "");
const today = new Date().toISOString().slice(0, 10);

const PRIORITY = { home: "1.0", services: "0.9", contact: "0.9", projects: "0.8", demos: "0.8" };
const LEGAL = ["privacy-policy", "terms", "cookie-policy"];

const entries = Object.entries(pages).map(([pageId, page]) => ({
  loc: origin + (page.url === "/" ? "/" : page.url),
  priority: PRIORITY[pageId] || (LEGAL.includes(pageId) ? "0.3" : "0.7"),
  changefreq: LEGAL.includes(pageId) ? "yearly" : pageId === "blog" ? "weekly" : "monthly",
  lastmod: today
}));

for (const post of blog.items.filter((p) => p.published !== false)) {
  entries.push({
    loc: `${origin}/pages/blog.html?post=${post.slug}`,
    priority: "0.6",
    changefreq: "yearly",
    lastmod: post.modifiedDate || post.date || today
  });
}

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!-- Generated by tools/build-pages.mjs — re-run after adding a page or post. -->\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${e.loc.replace(/&/g, "&amp;")}</loc>\n` +
        `    <lastmod>${e.lastmod}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority}</priority>\n` +
        `  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

await writeFile(join(root, "sitemap.xml"), sitemap, "utf8");
console.log(`sitemap.xml written with ${entries.length} URLs (domain: ${origin}).`);
