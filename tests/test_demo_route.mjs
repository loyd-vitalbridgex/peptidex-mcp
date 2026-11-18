#!/usr/bin/env node
// PeptideX Reference Map — /demo route tests (v0.3.1).
//
// Exercises the Worker artifact's demo-video route:
//   GET /demo/peptidex-walkthrough.mp4
// which streams the MP4 committed at demo/peptidex-walkthrough.mp4 from
// the repo's raw GitHub URL (the file is too large to inline into a
// Worker script), passing Range requests through.
//
// Two modes:
//   node tests/test_demo_route.mjs          LOCAL — the Worker's
//     DEMO_VIDEO_URL env override points at a Range-capable file server
//     on 127.0.0.1 serving the repo's own demo/ file. Tests the exact
//     dist artifact unmodified; only the upstream origin is local.
//   node tests/test_demo_route.mjs --live   LIVE — no override; the
//     route fetches the real raw.githubusercontent.com URL. Requires
//     the MP4 to be pushed to GitHub first.
//
// Run `node worker/build.mjs` first. Exit code 0 only if all pass.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = readFileSync(join(HERE, "..", "demo", "peptidex-walkthrough.mp4"));
const VIDEO_SHA256 = createHash("sha256").update(VIDEO).digest("hex");
const { default: worker } = await import(
  join(HERE, "..", "worker", "dist", "peptidex-mcp.js"));

const LIVE = process.argv.includes("--live");
const BASE = "https://mcp.peptidex.ai";
const DEMO_PATH = "/demo/peptidex-walkthrough.mp4";

// ------------------------------------------------ local upstream server --
function startLocalUpstream() {
  const server = createServer((req, res) => {
    if (req.url !== DEMO_PATH) { res.writeHead(404); res.end(); return; }
    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && m[1] === "") {
      // Mimic the real upstream: GitHub's raw CDN (Varnish) answers
      // suffix ranges with 501 "Unsupported client range". The Worker
      // must rewrite them to explicit ranges before forwarding — if it
      // ever passes one through, this stub makes the test fail exactly
      // as the live run would.
      res.writeHead(501, { "Content-Type": "text/html" });
      res.end("Unsupported client range");
      return;
    }
    if (m) {
      let start, end;
      if (m[1] === "") { start = VIDEO.length - Number(m[2]); end = VIDEO.length - 1; }
      else { start = Number(m[1]); end = m[2] === "" ? VIDEO.length - 1 : Number(m[2]); }
      if (start > end || start >= VIDEO.length) {
        res.writeHead(416, { "Content-Range": `bytes */${VIDEO.length}` });
        res.end(); return;
      }
      const slice = VIDEO.subarray(start, end + 1);
      res.writeHead(206, {
        "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${VIDEO.length}`,
        "Content-Length": slice.length });
      res.end(req.method === "HEAD" ? undefined : slice);
      return;
    }
    res.writeHead(200, { "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes", "Content-Length": VIDEO.length });
    res.end(req.method === "HEAD" ? undefined : VIDEO);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1",
    () => resolve(server)));
}

let env = {};
let server = null;
if (!LIVE) {
  server = await startLocalUpstream();
  env = { DEMO_VIDEO_URL:
    `http://127.0.0.1:${server.address().port}${DEMO_PATH}` };
}
console.log(`mode: ${LIVE ? "LIVE (real GitHub raw URL)" :
  `LOCAL (upstream stubbed to 127.0.0.1 file server via DEMO_VIDEO_URL)`}`);

const RESULTS = [];
function record(name, ok, detail = "") {
  RESULTS.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}` + (ok ? "" : ` — ${detail}`));
}
async function run(name, fn) {
  try { await fn(); record(name, true); }
  catch (e) { record(name, false, String(e.message ?? e).slice(0, 220)); }
}
const get = (path, headers = {}, e = env) =>
  worker.fetch(new Request(BASE + path, { headers }), e);

await run("demo: /health unchanged", async () => {
  const res = await get("/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.service, "peptidex-reference-map");
  assert.equal(body.library_version, "2026-11-18.1");
});

await run("demo: tools/list unchanged (9 tools, same order)", async () => {
  const res = await worker.fetch(new Request(BASE + "/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }), env);
  const body = await res.json();
  assert.deepEqual(body.result.tools.map((t) => t.name), [
    "search_peptides", "get_peptide_card", "browse_research_map",
    "compare_peptide_evidence", "get_regulatory_record", "get_source_record",
    "list_peptide_topics", "get_peptide_explainer", "explain_regulatory_term"]);
});

await run("demo: GET video — 200, video/mp4, ranges, long cache, byte-identical", async () => {
  const res = await get(DEMO_PATH);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.ok((res.headers.get("cache-control") ?? "").includes("max-age=31536000"));
  assert.equal(res.headers.get("content-length"), String(VIDEO.length));
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, VIDEO.length);
  assert.equal(createHash("sha256").update(buf).digest("hex"), VIDEO_SHA256);
});

await run("demo: Range bytes=1000-1999 — 206 with the exact slice", async () => {
  const res = await get(DEMO_PATH, { Range: "bytes=1000-1999" });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"),
    `bytes 1000-1999/${VIDEO.length}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, 1000);
  assert.ok(buf.equals(VIDEO.subarray(1000, 2000)));
});

await run("demo: open-ended Range bytes=1000- — 206 to end of file", async () => {
  const res = await get(DEMO_PATH, { Range: "bytes=1000-" });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"),
    `bytes 1000-${VIDEO.length - 1}/${VIDEO.length}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(VIDEO.subarray(1000)));
});

await run("demo: suffix Range bytes=-100 — 206 with the last 100 bytes", async () => {
  const res = await get(DEMO_PATH, { Range: "bytes=-100" });
  assert.equal(res.status, 206);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, 100);
  assert.ok(buf.equals(VIDEO.subarray(VIDEO.length - 100)));
});

await run("demo: HEAD — 200 headers, no body", async () => {
  const res = await worker.fetch(
    new Request(BASE + DEMO_PATH, { method: "HEAD" }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.equal(res.headers.get("content-length"), String(VIDEO.length));
  assert.equal((await res.arrayBuffer()).byteLength, 0);
});

await run("demo: unknown /demo paths 404", async () => {
  for (const p of ["/demo/other.mp4", "/demo/", "/demo/peptidex-walkthrough.mp4/extra",
                   "/demo/peptidex-walkthrough.mp4.bak"]) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
  }
});

await run("demo: POST to the video path is not served as video", async () => {
  const res = await worker.fetch(new Request(BASE + DEMO_PATH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  }), env);
  assert.notEqual(res.headers.get("content-type"), "video/mp4");
});

if (server) server.close();
const failed = RESULTS.filter(([, ok]) => !ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} demo-route tests passed`);
process.exit(failed.length ? 1 : 0);
