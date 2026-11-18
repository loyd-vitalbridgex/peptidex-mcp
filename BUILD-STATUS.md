# PeptideX Reference Map — build status

**Built:** 2026-11-18, locally, by loyd. **Deployed:** no — deployment is
Instinct's step (see `DEPLOY.md`). The live education server is unchanged.
**Spec:** PeptideX Reference Map Build Spec v0.2 (Instinct, 18 Nov 2026),
reusing the reviewed card texts of document 09 and the field/output rules
of spec 08 (§3 shapes, §7 disclaimer verbatim).

**Build order followed** (Instinct, Nov 18): (1) seed cards, (2) the
searchable map, (3) the deployment package.

## What was built

| File | What it is |
|---|---|
| `data/library.json` | The one versioned, reviewed dataset (§3 record model). |
| `peptidex_data.py` | Data + validation layer: all operations, server-side enforcement, staleness logic. No logging anywhere. |
| `server.py` | Python MCP server (low-level MCP API), stdio + Streamable HTTP, `/health` + challenge routes. Production mirror. |
| `edge-function/peptidex-mcp/index.ts` | Deno/Supabase edge-function source (TrueGift style), imports the same `library.json`. |
| `edge-function/build.py` + `edge-function/dist/index.ts` | Generates the self-contained deployable (dataset inlined). |
| `tests/test_peptidex_map.py` | Acceptance suite: MCP integration + unit tests. |
| `DEPLOY.md` | Deploy steps, rollback, source-of-truth/audit, clinical seam. |
| `requirements.txt` | `mcp==1.30.0`, `uvicorn==0.54.0`. |

**Operations (9, all read-only / non-destructive / openWorldHint false):**
the six map operations of spec v0.2 §4 — `search_peptides`,
`get_peptide_card`, `browse_research_map` (body-system **and**
research-goal browsing; "goal" strictly = studied-for research topic,
never a personal treatment goal), `compare_peptide_evidence`,
`get_regulatory_record`, `get_source_record` — plus the three existing
library operations served from the same dataset so nothing regresses:
`list_peptide_topics`, `get_peptide_explainer`, `explain_regulatory_term`.

## Dataset

- **Version:** 2026-11-18 · **Card version:** 2026-11-17 · **Last review:**
  2026-11-17 · **Regulatory records checked:** 2026-11-17, **next due
  2026-11-24** (weekly cadence) · Peptide evidence review due 2026-12-17.
- **Contents:** 4 peptides (BPC-157, TB-500, GHK-Cu, MOTS-c — the v0.2
  seed set only), 12 study records, 13 claim records (evidence classified
  per claim), 9 regulatory records (US FDA, US HHS, WADA kept distinct),
  6 regulator sources, 13 general explainers, 9 regulatory terms,
  5 body systems, 7 research topics.
- **TB-500 discipline:** the record distinguishes the seven-amino-acid
  fragment from full-length thymosin beta-4 throughout and states the
  fragment itself has no published human administration studies (FDA
  evaluation, via the FDA compounding safety page — the spec's source
  basis). Its claims are all classified "not established".
- **Exclusion enforced:** no record for the excluded substance class
  exists, and no member of that class is named anywhere in the dataset
  (verified by scan in the test suite). Queries for it are refused as
  out of scope in the serving layer; card/compare calls naming it are
  rejected without echo.
- Every regulatory statement carries a primary-source URL and a checked
  date (the one text-only citation, Federal Register notice 2026-22192,
  follows document 09's citation rule). Nothing was invented: where the
  reviewed sources report no sample size, the record says null.

## Test results (actual runs, 2026-11-18)

- **Acceptance suite: 34/34 passed, 0 failed.**
  `~/workspace/consumer-portfolio/mcp-prototypes/truegift/.venv/bin/python tests/test_peptidex_map.py`
  (any venv with `mcp==1.30.0` works). Coverage: tool surface +
  annotations; name/alias/spelling lookup; body-system and research-goal
  browse; human-vs-animal evidence filtering; two- and three-card neutral
  comparison; US + WADA regulatory lookup; source-record opening with
  claim support; unknown name; no-human-evidence card; conflicting
  sources (claim-level and regulator-level); stale regulatory record
  (simulated date — conclusion withdrawn, source/checked-date preserved);
  unsupported jurisdiction; card sections; legacy tools; pagination;
  empty state; refusals for personal suitability, lab interpretation,
  dosing/injection, purchasing/clinic routing, minors/weight-loss misuse,
  sensitive text in an unexpected field, malicious instruction text in
  source/name fields, unknown fields on every operation, and the
  excluded class across search/card/compare; unit tests for the dataset
  exclusion scan, the §5.1-style content lint, referential integrity, and
  no-logging.
- **TypeScript:** `deno check` clean on both the source and the generated
  deployable. The deployable was also **run live** (Deno, local port) and
  probed: `/health`, alias search, extra-field rejection (no echo), and
  the exclusion all behave identically to the Python mirror.
- **Python HTTP mode:** `/health` OK, challenge route 404 while the token
  env var is unset (by design), GET on the MCP path → 405, and a
  `tools/call` round-trip over Streamable HTTP succeeded.

## Design decisions worth knowing

- **Low-level MCP API + permissive advertised schemas.** FastMCP was
  probed and rejected for this package: it silently *ignores* unknown
  fields, and both its validation errors and the SDK's schema
  pre-validation *echo submitted values* — each violates spec v0.2 §4 /
  spec 08 F5. Here every constraint (unknown fields, catalog membership,
  bounds, enums) is enforced server-side in `peptidex_data.py`, errors
  are generic, and no error ever contains submitted input. The tool
  descriptions carry the contract for the model.
- **Stale-record behavior** (spec §5): past `next_review_due`, a
  regulatory record keeps its regulator, substance, primary URL and
  checked date visible but every status conclusion is replaced with an
  "under review" withdrawal notice.
- **Lint exemption:** the §5.1-style lint exempts the reviewed scientific
  phrases "folate cycle" / "cell cycle" before token matching (the spec's
  own allowlist mechanism); everything else hard-fails.
- **Divergence from spec 08, intentional:** spec 08 omitted TB-500 and
  included a fourth card that v0.2 excludes. Build spec v0.2 supersedes
  both points: TB-500 is seeded with fragment discipline, and the
  excluded class is out entirely.

## Analytics

Out of scope and untouched. This build does not modify peptidex.ai site
code in any way; Google Analytics, Beehiiv, referral tracking, and
Lovable analytics remain exactly as they are. The MCP server itself
collects nothing.

## Clinical seam

Documented in `DEPLOY.md` ("Future clinical-service seam"). Summary: a
later clinical/pharmacy service would be a separate service with its own
auth, store, controls and counsel review; the only interface is one-way
reference to this catalog's stable peptide IDs; no patient data returns
to the reference app; **no clinical features or dormant operations were
built**.

## Open items

1. **Instinct:** review this package, then deploy per `DEPLOY.md`
   (function `peptidex-mcp`, read-back audit, live verification).
2. **Regulatory recheck due 2026-11-24** — records must be rechecked
   against primary sources before any release after that date (the
   server withdraws stale conclusions automatically in the meantime).
3. **Submission gates unchanged:** truthful privacy policy + Howard's
   attestation answers (Instinct/Howard). Do not submit before they
   clear; nothing in this package submits anything.
4. Post-deploy only: the in-ChatGPT Developer Mode walkthrough set
   (spec 08 §9, adapted) runs against the live URL — Instinct's step.
5. The reference website surface mentioned in spec v0.2 §4 (same dataset
   on the public site) is not part of this package; the dataset is built
   to serve both when that step is scheduled.
