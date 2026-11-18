# PeptideX Reference Map — deployment hand-off

**For:** Instinct (build/deploy owner). **Status of this package:** built and
tested locally by loyd; **not deployed**. The live education app and server
are unchanged until the steps below are run.

- **Endpoint (frozen):** `https://mcp.peptidex.ai`
- **Runtime:** a plain **Cloudflare Worker** serves the endpoint directly.
  The deployable is `worker/dist/peptidex-mcp.js` — a single self-contained
  ESM module (standard `export default { fetch }`, Fetch API only, no Deno
  APIs, no Node APIs, no imports; the dataset is inlined at build time).
- **Dataset:** `data/library.json`, version **2026-11-18.1** (served at
  `/health` as `library_version`).

## Source of truth / audit

**This directory (`consumer-portfolio/mcp-prototypes/peptidex-map/`, mirrored
at github.com/loyd-vitalbridgex/peptidex-mcp) is the source of truth for the
deployed server.** Nothing deploys from anywhere else.

- `data/library.json` — the one reviewed dataset (peptides, studies,
  claims, regulatory records, sources, explainers, terms).
- `worker/peptidex-mcp.ts` — the Worker source; it imports
  `../data/library.json`, so the dataset has a single home.
  `worker/build.mjs` generates the deployable (types stripped, dataset
  inlined). **Deploy only `worker/dist/peptidex-mcp.js`.**
- `peptidex_data.py` + `server.py` — the Python reference mirror; the
  acceptance suite runs against it, and its payloads are verified
  identical to the Worker's.
- `edge-function/peptidex-mcp/index.ts` + `edge-function/dist/index.ts` —
  the Deno/Supabase edge-function mirror (kept for reference; not the
  live runtime).
- Audit rule: after every deploy, confirm `GET /health` reports the
  expected `library_version`, run the live spot-calls in step 5 below,
  and record the deploy (date, dataset version, spot-call results) in
  `BUILD-STATUS.md`. The deployed module must be the `worker/dist/`
  artifact generated from the committed source — if it is ever in doubt,
  regenerate with `node worker/build.mjs` and compare (the build is
  deterministic).
- Editorial changes land here first, with both test suites green, before
  any redeploy. Candidate sources are never edited into the dataset
  without review — the dataset is the approved snapshot, per build spec
  v0.2 §4.

## Pre-deploy gates

1. `tests/test_peptidex_map.py` — **all tests pass** (37/37 at v0.3;
   see `BUILD-STATUS.md` for the run record and the exact command).
2. `node worker/build.mjs && node tests/test_worker.mjs` — **all worker
   tests pass** (15/15 at v0.3). These exercise the dist artifact itself
   through its fetch handler.
3. Regulatory freshness: no regulatory record may be past its
   `next_review_due` at deploy time (current records: checked 2026-11-17,
   due **2026-11-24**). If the date has passed, the records must be
   rechecked against their primary sources and the dataset version
   bumped first — the server withdraws stale status conclusions
   automatically, but a release should not ship already-stale records.
4. Submission gates outside this package stay as they are: the truthful
   privacy policy and Howard's attestation answers are Instinct/Howard
   items (build spec v0.2 §7). **Do not submit until those clear.** This
   deploy changes the server only; it is not a submission.

## Deploy steps (Cloudflare Worker)

1. From this directory, regenerate the deployable:
   `node worker/build.mjs` → `worker/dist/peptidex-mcp.js`.
2. Deploy that single module as the Worker bound to `mcp.peptidex.ai`,
   e.g. with wrangler:
   `wrangler deploy worker/dist/peptidex-mcp.js --name peptidex-mcp --compatibility-date 2026-11-01`
   (or paste/upload the same module in the Cloudflare dashboard). No
   build command, no bindings beyond the secret in step 3, no KV/R2/D1.
3. Confirm the Worker secret **`OPENAI_APPS_CHALLENGE_TOKEN`** is set to
   the **current binding** (unchanged from the education app — do not
   rotate it as part of this deploy), e.g.
   `wrangler secret put OPENAI_APPS_CHALLENGE_TOKEN`. The
   `/.well-known/openai-apps-challenge` route serves it as plain text
   and 404s when it is unset.
4. Verify live, from outside:
   - `GET https://mcp.peptidex.ai/health` → `{"status":"ok", "service":
     "peptidex-reference-map", "library_version":"2026-11-18.1"}` (or the
     newer version being deployed).
   - `GET https://mcp.peptidex.ai/demo/peptidex-walkthrough.mp4` → 200,
     `Content-Type: video/mp4`, full 2,490,547 bytes (sha256
     `3f24fb51…f1fbadaf7`); a `Range: bytes=1000-1999` request → 206 with
     `Content-Range: bytes 1000-1999/2490547`. Any other `/demo/*` path
     → 404. (v0.3.1+, see "Demo video route" below.)
   - `GET https://mcp.peptidex.ai/.well-known/openai-apps-challenge` →
     the current binding token.
   - MCP `initialize` + `tools/list` → exactly the nine read-only tools,
     with typed schemas (`additionalProperties: false` on every tool).
   - Spot-call `search_peptides` ("Bepecin" → BPC-157),
     `get_peptide_card` (tb_500), `get_regulatory_record` (bpc_157, US),
     a suffix non-match (`search_peptides` "BPC-157 pregnancy" →
     `not_found`, no echo), and one refusal (a dosing-shaped search
     query → rejected, no echo).
5. Run the in-ChatGPT Developer Mode set (spec 08 §9 positives/negatives,
   adapted to the map operations) before any submission step.
6. Record the deploy in `BUILD-STATUS.md`.

## Demo video route (v0.3.1)

The OpenAI apps demo video is served at
`GET /demo/peptidex-walkthrough.mp4` — the same pattern as the other
apps' `/demo/*.mp4` URLs. The MP4 (2.4 MB) cannot be inlined into a
Worker script, so it is committed in this repo at
`demo/peptidex-walkthrough.mp4` and the route **streams it from the
repo's raw GitHub URL**, passing `Range` / `If-Range` through and
setting `Content-Type: video/mp4`, `Accept-Ranges: bytes` and
`Cache-Control: public, max-age=31536000, immutable`. Exact path only;
every other `/demo/*` path returns 404. This is the Worker's only
outbound fetch and its only non-MCP route; the nine tools, `/health`
and the challenge route are unchanged, and the dataset version does not
move (still `2026-11-18.1`).

No new bindings are required. The optional `DEMO_VIDEO_URL` env binding
overrides the upstream URL and exists for tests only
(`tests/test_demo_route.mjs` points it at a local file server, and can
also run `--live` against the real raw URL) — leave it unset in
production. To replace the video: overwrite
`demo/peptidex-walkthrough.mp4`, commit + push, rebuild, redeploy; the
immutable cache means a *changed* video should also change the file
name (and the route constant) or wait out client caches.

## Rollback

The server is stateless and stores nothing, so rollback is a pure
redeploy — no data migration, no user impact:

1. Take the previous release's `worker/dist/peptidex-mcp.js` (each
   release is kept with its `data/library.json` snapshot in version
   control here; or check out the previous release commit and rebuild
   with `node worker/build.mjs`).
2. Redeploy it (deploy step 2) — equivalently, roll back to the previous
   Worker version in the Cloudflare dashboard / `wrangler rollback`.
3. Verify `/health` reports the **previous** `library_version` and
   repeat the spot-calls.
4. Record the rollback in `BUILD-STATUS.md` (date, from/to versions,
   why).

**Withdrawal control** (build spec v0.2 §5): to pull a single card or
record urgently, remove it from `data/library.json`, bump
`meta.dataset_version`, rebuild, redeploy, verify. The catalog then fails
clearly for that ID instead of serving withdrawn content.

## Versioning

- `meta.dataset_version` in `data/library.json` = the library version;
  bump on every content change; it is what `/health` reports.
- Per-peptide `card_version` and `last_review_date` / `next_review_due`
  ride inside the dataset; regulatory records carry their own
  `date_checked` / `next_review_due` (weekly recheck cadence).

## Analytics — untouched by this deploy

This package and its deploy touch **only** the MCP Worker.
peptidex.ai site code is not modified, and all existing site analytics
stay exactly as they are: Google Analytics (G-BFLE721HPV), Beehiiv,
referral tracking, and Lovable analytics. The MCP server itself collects
no analytics and no user data: no accounts, no input logging, nothing
stored (the serving code contains no logging calls — covered by a unit
test in the suite).

## Future clinical-service seam (design only — nothing built)

Build spec v0.2 §6 defines a possible later clinical/pharmacy service.
This package deliberately leaves a clean seam and builds **none** of it:

- The reference app is a bounded, read-only, no-PHI service with a fixed
  dataset. It contains **no dormant clinical operations** — the tool list
  is exactly the nine read-only operations, verified by the test suites.
- A future clinical service would be a **separate service on
  peptidex.ai's side**, with its own authentication, its own data store,
  its own access controls, audit trail, and retention/deletion policy,
  and its own security review. It must not share this app's credentials,
  tables, or Worker, and **no patient data ever flows back into the
  reference app or its dataset**.
- The only permitted interface is one-way and identifier-level: the
  clinical service may reference this catalog's stable peptide IDs. It
  may not write to `data/library.json`, and this app exposes no write
  path of any kind.
- Activation requires healthcare counsel's assessment and a fresh
  platform policy assessment first (spec v0.2 §6) — an API contract or a
  vendor is not a license. Until then, the seam is documentation only.
