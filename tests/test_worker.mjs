#!/usr/bin/env node
// PeptideX Reference Map — Cloudflare Worker artifact tests.
//
// These tests exercise THE WORKER ARTIFACT ITSELF (worker/dist/
// peptidex-mcp.js, the deployable): they import the module in Node and
// call its fetch handler with Request objects, exactly as the Cloudflare
// runtime would. Run `node worker/build.mjs` first, then:
//   node tests/test_worker.mjs
// Exit code 0 only if every test passes. Prints one line per test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = JSON.parse(
  readFileSync(join(HERE, "..", "data", "library.json"), "utf-8"));
const { default: worker } = await import(
  join(HERE, "..", "worker", "dist", "peptidex-mcp.js"));

const DISCLAIMER = LIB.disclaimer;
const BASE = "https://mcp.peptidex.ai";
const RESULTS = [];
function record(name, ok, detail = "") {
  RESULTS.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}` + (ok ? "" : ` — ${detail}`));
}
async function run(name, fn) {
  try { await fn(); record(name, true); }
  catch (e) { record(name, false, String(e.message ?? e).slice(0, 220)); }
}

const get = (path, env = {}) => worker.fetch(new Request(BASE + path), env);
async function rpc(method, params, env = {}) {
  const res = await worker.fetch(new Request(BASE + "/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), env);
  return { status: res.status, body: await res.json() };
}
async function call(name, args) {
  const { body } = await rpc("tools/call", { name, arguments: args });
  assert.ok(body.result, `no result for ${name}: ${JSON.stringify(body).slice(0, 200)}`);
  const payload = body.result.structuredContent;
  assert.equal(payload.disclaimer, DISCLAIMER, `${name} disclaimer not verbatim`);
  return payload;
}

await run("worker: GET /health reports service + dataset version", async () => {
  const res = await get("/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "peptidex-reference-map");
  assert.equal(body.library_version, LIB.meta.dataset_version);
});

await run("worker: challenge route 404s unset, serves token when set", async () => {
  const unset = await get("/.well-known/openai-apps-challenge");
  assert.equal(unset.status, 404);
  const blank = await get("/.well-known/openai-apps-challenge",
    { OPENAI_APPS_CHALLENGE_TOKEN: "   " });
  assert.equal(blank.status, 404);
  const set = await get("/.well-known/openai-apps-challenge",
    { OPENAI_APPS_CHALLENGE_TOKEN: "test-token-123" });
  assert.equal(set.status, 200);
  assert.equal(await set.text(), "test-token-123");
});

await run("worker: GET on the MCP path is a 405 JSON-RPC error", async () => {
  const res = await get("/");
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.equal(body.error.code, -32000);
});

await run("worker: initialize negotiates protocol + names the server", async () => {
  const { body } = await rpc("initialize", { protocolVersion: "2025-03-26" });
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.equal(body.result.serverInfo.name, "PeptideX Reference Map");
});

await run("worker: notifications get a 202 with no body", async () => {
  const res = await worker.fetch(new Request(BASE + "/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }), {});
  assert.equal(res.status, 202);
});

await run("worker: tools/list — 9 tools, typed schemas, read-only", async () => {
  const { body } = await rpc("tools/list");
  const tools = body.result.tools;
  assert.deepEqual(tools.map((t) => t.name), [
    "search_peptides", "get_peptide_card", "browse_research_map",
    "compare_peptide_evidence", "get_regulatory_record", "get_source_record",
    "list_peptide_topics", "get_peptide_explainer", "explain_regulatory_term"]);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object", t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
    assert.equal(t.annotations.openWorldHint, false, t.name);
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t.inputSchema]));
  assert.equal(byName.search_peptides.properties.query.type, "string");
  assert.ok(byName.search_peptides.properties.evidence.enum.includes("early human"));
  assert.deepEqual(byName.get_peptide_card.properties.peptide_id.enum,
    ["bpc_157", "tb_500", "ghk_cu", "mots_c"]);
  assert.equal(byName.compare_peptide_evidence.properties.peptide_ids.type, "array");
  assert.equal(byName.compare_peptide_evidence.properties.peptide_ids.minItems, 2);
  assert.equal(byName.compare_peptide_evidence.properties.peptide_ids.maxItems, 3);
  assert.deepEqual(byName.get_regulatory_record.properties.jurisdiction.enum,
    ["US", "sport_wada"]);
  assert.equal(byName.browse_research_map.properties.limit.type, "integer");
});

await run("worker: name + alias + compact-spelling lookup", async () => {
  for (const [q, pid] of [["BPC-157", "bpc_157"], ["Bepecin", "bpc_157"],
                          ["TB500", "tb_500"], ["GHKCu", "ghk_cu"],
                          ["Copper tripeptide-1", "ghk_cu"]]) {
    const d = await call("search_peptides", { query: q });
    assert.equal(d.status, "ok", q);
    assert.equal(d.matches[0].peptide_id, pid, q);
  }
});

await run("worker: name + arbitrary suffix is not a match (exact-alias only)", async () => {
  for (const q of ["BPC-157 pregnancy", "bpc-157@example.com", "BPC-157 500",
                   "TB-500 arthritis", "GHK-Cu pregnancy", "MOTS-c arthritis"]) {
    const d = await call("search_peptides", { query: q });
    assert.equal(d.status, "not_found", q);
    assert.deepEqual(d.matches, [], q);
    assert.ok(!JSON.stringify(d).toLowerCase().includes(q.toLowerCase()),
      `${q} echoed`);
  }
});

await run("worker: unknown fields rejected server-side, never echoed", async () => {
  const d = await call("search_peptides",
    { query: "BPC-157", health_history: "ZZsecret" });
  assert.equal(d.status, "rejected");
  assert.ok(!JSON.stringify(d).includes("ZZsecret"));
  const c = await call("get_peptide_card",
    { peptide_id: "bpc_157", dose: "ZZ5mg" });
  assert.equal(c.status, "rejected");
  assert.ok(!JSON.stringify(c).includes("ZZ5mg"));
});

await run("worker: excluded class refused across operations, no echo", async () => {
  const d = await call("search_peptides", { query: "retatrutide" });
  assert.equal(d.status, "out_of_scope");
  assert.ok(!JSON.stringify(d).toLowerCase().includes("retatrutide"));
  const card = await call("get_peptide_card", { peptide_id: "retatrutide" });
  assert.equal(card.status, "rejected");
  const cmp = await call("compare_peptide_evidence",
    { peptide_ids: ["bpc_157", "retatrutide"] });
  assert.equal(cmp.status, "rejected");
});

await run("worker: cards — TB-500 discipline + fixed BPC-157 safety wording", async () => {
  const tb = await call("get_peptide_card", { peptide_id: "tb_500" });
  assert.ok(tb.evidence_stage.human.startsWith("None."));
  assert.ok(tb.claims.every(
    (c) => c.human_evidence_category === "not established"));
  const bpc = await call("get_peptide_card",
    { peptide_id: "bpc_157", section: "evidence" });
  assert.ok(bpc.safety_summary.includes("insufficient to establish safety"));
  assert.ok(!bpc.safety_summary.includes("No clinical safety data"));
});

await run("worker: regulatory records carry the audited primary sources", async () => {
  const d = await call("get_regulatory_record",
    { peptide_id: "tb_500", jurisdiction: "US" });
  const fda = d.records.find((r) => r.regulator.includes("FDA"));
  assert.equal(fda.primary_document_url, "https://www.fda.gov/media/193349/download");
  assert.equal(fda.document_issue_date, "2026-05-15");
  const m = await call("get_regulatory_record",
    { peptide_id: "mots_c", jurisdiction: "US" });
  const mfda = m.records.find((r) => r.regulator.includes("FDA"));
  assert.equal(mfda.document_issue_date, "2026-05-11");
  assert.ok(mfda.approval_status.includes("nominations list"));
  const wada = await call("get_regulatory_record",
    { peptide_id: "mots_c", jurisdiction: "sport_wada" });
  assert.ok(wada.records[0].approval_status.includes("S4.4.1"));
});

await run("worker: TB-500 evaluation source opens and supports both claims", async () => {
  const d = await call("get_source_record", { source_id: "src_fda_tb500_eval" });
  assert.equal(d.url, "https://www.fda.gov/media/193349/download");
  const ids = new Set(d.supports.claims.map((c) => c.claim_id));
  assert.ok(ids.has("tb500_claim_no_human_administration"));
  assert.ok(ids.has("tb500_claim_fragment_distinction"));
});

await run("worker: browse + compare + legacy tools behave", async () => {
  const map = await call("browse_research_map", { body_system: "skin" });
  const pids = new Set(map.connections.flatMap(
    (c) => c.claims.map((x) => x.peptide_id)));
  assert.ok(pids.has("ghk_cu"));
  const cmp = await call("compare_peptide_evidence",
    { peptide_ids: ["bpc_157", "tb_500"] });
  assert.equal(cmp.peptides.length, 2);
  const topics = await call("list_peptide_topics", { category: "reference_cards" });
  assert.equal(topics.topics.length, 4);
  const term = await call("explain_regulatory_term", { term: "off_label" });
  assert.ok(term.plain_language.includes("did not approve"));
});

await run("worker: unknown tool is a JSON-RPC error", async () => {
  const { body } = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
  assert.ok(body.error, JSON.stringify(body).slice(0, 160));
});

const failed = RESULTS.filter(([, ok]) => !ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} worker tests passed`);
process.exit(failed.length ? 1 : 0);
