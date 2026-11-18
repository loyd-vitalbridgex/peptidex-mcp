# PeptideX Reference Map — prototype package

Searchable, source-backed peptide atlas over one versioned, reviewed
dataset: named-peptide cards, a body-system / research-goal map, neutral
evidence comparisons, and dated regulatory records. Build spec v0.2
(2026-11-18). Seed peptides: BPC-157, TB-500, GHK-Cu, MOTS-c.

- `data/library.json` — the dataset (source of truth for content).
- `server.py` + `peptidex_data.py` — Python MCP server (stdio / HTTP).
- `edge-function/` — Deno edge function; `build.py` generates the
  self-contained deployable at `edge-function/dist/index.ts`.
- `tests/test_peptidex_map.py` — acceptance suite (34 tests).
- `DEPLOY.md` — deploy steps, rollback, audit, clinical seam.
- `BUILD-STATUS.md` — what was built, versions, test results, open items.

Run the tests (any venv with `mcp==1.30.0`):

```
<venv>/bin/python tests/test_peptidex_map.py
<venv>/bin/python server.py            # stdio
<venv>/bin/python server.py --http     # HTTP on 127.0.0.1:8378
```

Education only: no dosing, no sourcing, no personal advice, no data
collection. Every payload carries the spec §7 disclaimer verbatim.
