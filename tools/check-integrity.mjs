/**
 * check-integrity.mjs — validates the data layer against the code.
 *
 *   node tools/check-integrity.mjs
 *
 * Because content is data, most mistakes are data mistakes: an icon name that
 * doesn't exist, a link to a page that was never created, a section id that
 * isn't registered. This catches them before a visitor does.
 *
 * Exits non-zero when something is broken, so it can be dropped into CI.
 */

import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

const read = async (file) => readFile(join(root, file), "utf8");
const readJSON = async (file) => JSON.parse(await read(file));
const exists = async (file) => access(join(root, file)).then(() => true, () => false);

/* ------------------------------------------------------------------ */
/* Extract the registries the runtime actually has                     */
/* ------------------------------------------------------------------ */
const iconsSource = await read("assets/js/icons.js");
const iconNames = new Set([
  ...[...iconsSource.matchAll(/^\s*"([a-z0-9-]+)":\s*'/gim)].map((m) => m[1]),
  ...[...iconsSource.matchAll(/^\s*"([a-z0-9-]+)":\s*"[a-z0-9-]+"/gim)].map((m) => m[1])
]);

const sectionsSource = await read("assets/js/sections.js");
const registryBlock = sectionsSource.slice(sectionsSource.indexOf("registry: {"));
const sectionIds = new Set([...registryBlock.matchAll(/"([a-z-]+)":\s*[a-zA-Z]/g)].map((m) => m[1]));
sectionIds.add("blog-article"); /* registered from pages.js */

const patterns = new Set(
  [...sectionsSource.matchAll(/x/g)].length ? [] : []
);
const componentsSource = await read("assets/js/components.js");
const wireBlock = componentsSource.slice(componentsSource.indexOf("var WIRE_PATTERNS"));
for (const m of wireBlock.matchAll(/^\s{4}([a-z]+):$/gm)) patterns.add(m[1]);

const toolsSource = await read("assets/js/tools.js");
const toolIds = new Set([...toolsSource.matchAll(/^\s{4}"([a-z0-9-]+)":\s*\{/gm)].map((m) => m[1]));

const dataSources = new Set(
  [...(await read("assets/js/data.js")).matchAll(/^\s{4}(\w+):\s*"([^"]+)"/gm)].map((m) => m[2])
);

/* ------------------------------------------------------------------ */
/* Walk every JSON file                                                */
/* ------------------------------------------------------------------ */
const FILES = [...dataSources];
const bundles = {};

for (const file of FILES) {
  if (!(await exists(join("data", file)))) {
    problems.push(`data/${file} is referenced by data.js but does not exist`);
    continue;
  }
  bundles[file] = await readJSON(join("data", file));
}

/* Resolve {{site.*}} / {{social.*}} tokens exactly as data.js does, so the
   checks below see the real values — and any typo'd token gets reported. */
const tokenContext = { site: bundles["site.json"], social: bundles["social.json"] };

function resolveTokens(node, path) {
  if (typeof node === "string") {
    return node.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, ref) => {
      const value = ref.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), tokenContext);
      if (value == null || typeof value === "object") {
        problems.push(`Unresolved token "${match}" at ${path}`);
        return match;
      }
      return String(value);
    });
  }
  if (Array.isArray(node)) return node.map((item, i) => resolveTokens(item, `${path}[${i}]`));
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) node[key] = resolveTokens(node[key], `${path}.${key}`);
  }
  return node;
}

/* social.json may reference site.json, so resolve it first */
bundles["social.json"] = resolveTokens(bundles["social.json"], "social.json");
for (const [file, data] of Object.entries(bundles)) {
  if (file === "social.json" || file === "site.json") continue;
  bundles[file] = resolveTokens(data, file);
}

/* --- icons ------------------------------------------------------- */
function walkIcons(node, path) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((item, i) => walkIcons(item, `${path}[${i}]`));

  for (const [key, value] of Object.entries(node)) {
    if (key === "icon" && typeof value === "string" && value) {
      if (!iconNames.has(value)) problems.push(`Unknown icon "${value}" at ${path}.icon`);
    }
    walkIcons(value, `${path}.${key}`);
  }
}

for (const [file, data] of Object.entries(bundles)) walkIcons(data, file);

/* --- preview patterns -------------------------------------------- */
function walkPreviews(node, path) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((item, i) => walkPreviews(item, `${path}[${i}]`));

  if (node.preview && node.preview.pattern && !patterns.has(node.preview.pattern)) {
    problems.push(`Unknown preview pattern "${node.preview.pattern}" at ${path}`);
  }
  for (const [key, value] of Object.entries(node)) walkPreviews(value, `${path}.${key}`);
}

for (const [file, data] of Object.entries(bundles)) walkPreviews(data, file);

/* --- internal links ---------------------------------------------- */
const checkedLinks = new Map();

async function checkLink(url, where) {
  if (typeof url !== "string" || !url) return;
  if (/^(https?:|mailto:|tel:|#|data:)/i.test(url)) return;
  if (!url.startsWith("/")) return;

  const target = url.split("#")[0].split("?")[0].replace(/^\/+/, "");
  if (!target) return;

  if (!checkedLinks.has(target)) checkedLinks.set(target, await exists(target));
  if (!checkedLinks.get(target)) problems.push(`Broken internal link "${url}" at ${where}`);
}

async function walkLinks(node, path) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) await walkLinks(item, `${path}[${i}]`);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (["url", "downloadUrl", "caseStudyUrl", "linkUrl", "src"].includes(key)) {
      await checkLink(value, `${path}.${key}`);
    }
    await walkLinks(value, `${path}.${key}`);
  }
}

for (const [file, data] of Object.entries(bundles)) await walkLinks(data, file);

/* --- pages.json sections ----------------------------------------- */
for (const [pageId, page] of Object.entries(bundles["pages.json"])) {
  for (const entry of page.sections || []) {
    const id = typeof entry === "string" ? entry : entry.id;
    if (!sectionIds.has(id)) problems.push(`pages.json → ${pageId}: unknown section "${id}"`);
  }
  if (page.template === "legal" && !bundles["legal.json"].documents[page.documentKey]) {
    problems.push(`pages.json → ${pageId}: documentKey "${page.documentKey}" missing from legal.json`);
  }
}

/* --- tools ------------------------------------------------------- */
for (const tool of bundles["tools.json"].items) {
  if (tool.status === "live" && !toolIds.has(tool.id)) {
    problems.push(`tools.json → "${tool.id}" is marked live but has no implementation in tools.js`);
  }
  if (tool.status !== "live" && toolIds.has(tool.id)) {
    notes.push(`tools.json → "${tool.id}" has an implementation but is not marked live`);
  }
}

/* --- categories referenced by items ------------------------------ */
for (const [file, data] of Object.entries(bundles)) {
  if (!data.categories || !Array.isArray(data.items)) continue;
  const known = new Set(data.categories.map((c) => c.id));
  for (const item of data.items) {
    if (item.category && !known.has(item.category)) {
      notes.push(`${file}: "${item.id}" uses category "${item.category}" which isn't declared (a filter button will still be generated)`);
    }
  }
}

/* --- ids are unique ---------------------------------------------- */
for (const [file, data] of Object.entries(bundles)) {
  if (!Array.isArray(data.items)) continue;
  const seen = new Set();
  for (const item of data.items) {
    if (seen.has(item.id)) problems.push(`${file}: duplicate id "${item.id}"`);
    seen.add(item.id);
  }
}

/* --- placeholder reminders --------------------------------------- */
const site = bundles["site.json"];
if (String(site.url).includes("example")) notes.push("site.json still uses the placeholder domain");
if (String(site.email).includes("example")) notes.push("site.json still uses a placeholder email address");
if (bundles["contact.json"].form.mode === "demo") notes.push("contact.json form is in demo mode — submissions are not delivered");

/* ------------------------------------------------------------------ */
console.log(`Checked ${FILES.length} data files · ${iconNames.size} icons · ${sectionIds.size} sections · ${toolIds.size} tool implementations\n`);

if (notes.length) {
  console.log("Notes (not errors):");
  notes.forEach((n) => console.log(`  · ${n}`));
  console.log("");
}

if (problems.length) {
  console.error(`${problems.length} problem(s) found:`);
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exit(1);
}

console.log("✓ No integrity problems found.");
