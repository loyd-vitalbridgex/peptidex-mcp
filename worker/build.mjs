#!/usr/bin/env node
// Build the self-contained Cloudflare Worker deployable.
//
// peptidex-mcp.ts imports the shared dataset (../data/library.json) so
// the repo keeps one source of truth. For deployment as a single Worker
// module, this script strips the TypeScript types and inlines the
// dataset, writing dist/peptidex-mcp.js — a plain ESM module with no
// imports, deployable with wrangler or the Cloudflare dashboard.
//
// Usage: node worker/build.mjs   (run from the package root)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const IMPORT_LINE = 'import LIBRARY from "../data/library.json" with { type: "json" };';

const src = readFileSync(join(HERE, "peptidex-mcp.ts"), "utf-8");
if (!src.includes(IMPORT_LINE)) {
  throw new Error("dataset import line not found — peptidex-mcp.ts changed?");
}
const library = JSON.parse(
  readFileSync(join(HERE, "..", "data", "library.json"), "utf-8"));
const stripped = stripTypeScriptTypes(src);
const out = stripped.replace(IMPORT_LINE,
  "const LIBRARY = " + JSON.stringify(library) + ";");
if (/^import LIBRARY/m.test(out)) {
  throw new Error("dataset import survived the build");
}
const dist = join(HERE, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "peptidex-mcp.js"), out);
console.log(`wrote ${join(dist, "peptidex-mcp.js")} (${out.length} chars, ` +
  `dataset ${library.meta.dataset_version})`);
