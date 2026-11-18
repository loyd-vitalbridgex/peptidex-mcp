#!/usr/bin/env python3
"""Build a self-contained peptidex-mcp edge function.

index.ts imports the shared dataset (../../data/library.json) so the repo
keeps one source of truth. For deployment as a single function file, this
script inlines the dataset and writes dist/index.ts, which Instinct can
drop into supabase/functions/peptidex-mcp/ unchanged otherwise.

Usage: python3 build.py   (run from the edge-function/ directory)
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
IMPORT_LINE = 'import LIBRARY from "../../data/library.json" with { type: "json" };'


def main() -> None:
    src = (HERE / "peptidex-mcp" / "index.ts").read_text(encoding="utf-8")
    assert IMPORT_LINE in src, "import line not found — index.ts changed?"
    library = json.loads(
        (HERE.parent / "data" / "library.json").read_text(encoding="utf-8"))
    inlined = "const LIBRARY: any = " + json.dumps(library) + ";"
    out = src.replace(IMPORT_LINE, inlined)
    dist = HERE / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "index.ts").write_text(out, encoding="utf-8")
    print(f"wrote {dist / 'index.ts'} ({len(out)} chars, dataset "
          f"{library['meta']['dataset_version']})")


if __name__ == "__main__":
    main()
