#!/usr/bin/env python3
"""PeptideX Reference Map — MCP server (production mirror).

A searchable, source-backed peptide atlas over one versioned, reviewed
dataset (data/library.json): named-peptide search, a body-system research
map, neutral evidence comparisons, and dated, sourced regulatory records.
Seed peptides: BPC-157, TB-500, GHK-Cu, MOTS-c. An entire substance class
is out of scope by standing decision and is enforced in the data layer.

All nine operations are read-only and non-destructive, take bounded inputs
validated server-side in peptidex_data.py, fetch nothing at request time,
and log nothing. Rejected input is never echoed and never stored. Every
payload ends with the spec section 7 disclaimer, verbatim.

Why not FastMCP: its argument handling silently IGNORES unknown fields and
its validation errors echo submitted values (probed against mcp 1.30.0);
the MCP SDK's schema pre-validation in the low-level server also echoes
submitted values in enum/type errors. Build spec v0.2 section 4 and spec
08 F5 require the opposite — unknown fields rejected server-side and
errors that never echo input — so this server uses the low-level MCP API
with intentionally permissive advertised schemas (the contract lives in
the tool descriptions) and enforces every constraint itself.

Run:
  .venv/bin/python server.py            # stdio (local dev / MCP Inspector)
  .venv/bin/python server.py --http     # Streamable HTTP on $HOST:$PORT
                                        # (default 127.0.0.1:8378), path /
  uvicorn server:app --host 0.0.0.0 --port $PORT   # ASGI (PaaS)

Env:
  HOST, PORT                     HTTP bind (default 127.0.0.1 / 8378)
  OPENAI_APPS_CHALLENGE_TOKEN    served at /.well-known/openai-apps-challenge
                                 (ChatGPT domain verification; 404 when unset)
"""
import asyncio
import contextlib
import json
import os
import sys

from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import (CallToolResult, TextContent, Tool, ToolAnnotations)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Mount, Route

import peptidex_data as data

READ_ONLY = ToolAnnotations(readOnlyHint=True, destructiveHint=False,
                            openWorldHint=False, idempotentHint=True)

# Advertised schemas are deliberately permissive (see module docstring):
# properties are documented, never type-constrained, so no SDK-generated
# error can echo a submitted value. peptidex_data enforces everything.
def _schema(properties, required=()):
    return {"type": "object",
            "properties": {k: {"description": v} for k, v in properties.items()},
            **({"required": list(required)} if required else {})}


TOOLS = [
    Tool(name="search_peptides", title="Search peptides by name",
         description="Name-only search of the reviewed peptide catalog. "
                     "Pass a peptide name or reviewed alias (e.g. \"BPC-157\", "
                     "\"Bepecin\", \"copper tripeptide-1\"). This is not a "
                     "health question field: personal health narratives, "
                     "dosing or purchasing questions are rejected and never "
                     "stored. Optional filters: body_system (musculoskeletal, "
                     "skin, metabolic, digestive, nervous_system) and evidence "
                     "(laboratory/animal only, early human, controlled human, "
                     "not established).",
         inputSchema=_schema({
             "query": "Peptide name or alias to look up (name only).",
             "body_system": "Optional body-system filter (catalog ID).",
             "evidence": "Optional human-evidence category filter."},
             required=("query",)),
         annotations=READ_ONLY),
    Tool(name="get_peptide_card", title="Get one peptide reference card",
         description="Returns the fixed, reviewed reference card for one "
                     "catalog peptide: identity, mechanism (labeled "
                     "established or proposed), what researchers have "
                     "studied, claim-level evidence with citations, dated "
                     "regulatory records, and what is not established. Pass "
                     "only the peptide_id from search_peptides or "
                     "list_peptide_topics. Do not pass any personal or "
                     "health information. section: all, identity, evidence, "
                     "regulatory, or sources.",
         inputSchema=_schema({
             "peptide_id": "Catalog peptide ID, e.g. \"bpc_157\".",
             "section": "Card section to return (default \"all\")."},
             required=("peptide_id",)),
         annotations=READ_ONLY),
    Tool(name="browse_research_map", title="Browse the body-system research map",
         description="Browse the research map by body system or by "
                     "research goal (a studied-for research topic), with "
                     "the reviewed peptide-study claims connected to each. "
                     "This is a research map, never a treatment map; a "
                     "topic is not a claim of benefit, and a research goal "
                     "is what researchers are studying, never a personal "
                     "treatment goal. Optional: body_system, topic_id, "
                     "evidence category filter, and bounded pagination "
                     "(limit, offset).",
         inputSchema=_schema({
             "body_system": "Optional body-system ID.",
             "topic_id": "Optional research-topic ID.",
             "evidence": "Optional human-evidence category filter.",
             "limit": "Max claims to return (1-50, default 25).",
             "offset": "Pagination offset (default 0)."}),
         annotations=READ_ONLY),
    Tool(name="compare_peptide_evidence", title="Compare peptide evidence side by side",
         description="Neutral side-by-side comparison of two or three "
                     "catalog peptides on the same factual fields "
                     "(identity, mechanism status, evidence stage, claims, "
                     "US regulatory headline, what is not established), "
                     "optionally narrowed to one research topic. There is "
                     "no ranking, no suitability score, and no "
                     "recommendation.",
         inputSchema=_schema({
             "peptide_ids": "Two or three catalog peptide IDs.",
             "topic_id": "Optional research-topic ID."},
             required=("peptide_ids",)),
         annotations=READ_ONLY),
    Tool(name="get_regulatory_record", title="Get dated regulatory records",
         description="Returns the reviewed regulatory records for one "
                     "peptide in one supported jurisdiction, each with its "
                     "primary document URL, the date it was checked, and "
                     "its review due date. Approval, off-label use, "
                     "compounding and enforcement are kept distinct; a "
                     "record past its due date serves no current-status "
                     "conclusion. Supported jurisdictions: \"US\" and "
                     "\"sport_wada\".",
         inputSchema=_schema({
             "peptide_id": "Catalog peptide ID.",
             "jurisdiction": "\"US\" or \"sport_wada\"."},
             required=("peptide_id", "jurisdiction")),
         annotations=READ_ONLY),
    Tool(name="get_source_record", title="Open a source record",
         description="Opens one approved source by ID: what it is, its "
                     "primary URL where one is served, when it was "
                     "checked, and exactly which claims it supports or "
                     "conflicts with.",
         inputSchema=_schema({
             "source_id": "Source or study ID from a card, claim, or "
                          "browse result."},
             required=("source_id",)),
         annotations=READ_ONLY),
    Tool(name="list_peptide_topics", title="List library topics and reference cards",
         description="Lists the fixed library: general peptide-science "
                     "explainers by category (peptide_basics, "
                     "how_science_works, research_categories, "
                     "reading_research, regulatory_basics) and the "
                     "reviewed reference cards (reference_cards). Default "
                     "category is \"all\".",
         inputSchema=_schema({
             "category": "Library category, or \"all\"."}),
         annotations=READ_ONLY),
    Tool(name="get_peptide_explainer", title="Get one science explainer",
         description="Returns one fixed, pre-written general explainer "
                     "from the library by slug (from list_peptide_topics). "
                     "General education only; names no specific peptide "
                     "products.",
         inputSchema=_schema({
             "slug": "Explainer slug from list_peptide_topics."},
             required=("slug",)),
         annotations=READ_ONLY),
    Tool(name="explain_regulatory_term", title="Explain a regulatory term",
         description="Explains one regulatory term in plain language, with "
                     "what it does not mean: fda_approval, "
                     "research_use_only, prescription_only, off_label, "
                     "clinical_trial_phases, peer_review, preprint, "
                     "compounded, investigational.",
         inputSchema=_schema({
             "term": "Regulatory term key."},
             required=("term",)),
         annotations=READ_ONLY),
]

server = Server(
    "PeptideX Reference Map",
    instructions="Reviewed, source-backed peptide reference: named-peptide "
                 "cards, a body-system research map, neutral evidence "
                 "comparisons, and dated regulatory records. Education "
                 "only: no dosing, no sourcing, no personal advice. Use "
                 "search_peptides with names only; open cards and records "
                 "by the catalog IDs the tools return.")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> CallToolResult:
    fn = data.OPERATIONS.get(name)
    if fn is None:
        return CallToolResult(
            content=[TextContent(type="text", text="Unknown tool.")],
            isError=True)
    try:
        payload = fn(arguments or {})
    except data.Rejected as r:
        payload = r.payload
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(payload))],
        structuredContent=payload, isError=False)


# ------------------------------------------------------------------- HTTP --

session_manager = StreamableHTTPSessionManager(
    app=server, event_store=None, json_response=True, stateless=True)


async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "peptidex-reference-map",
                         "library_version": data.LIBRARY_VERSION})


async def openai_apps_challenge(_: Request) -> PlainTextResponse:
    token = os.environ.get("OPENAI_APPS_CHALLENGE_TOKEN", "").strip()
    if not token:
        return PlainTextResponse("challenge token not configured",
                                 status_code=404)
    return PlainTextResponse(token)


async def mcp_asgi(scope, receive, send) -> None:
    if scope["method"] == "GET":
        resp = JSONResponse(
            {"jsonrpc": "2.0", "error": {"code": -32000, "message":
                "GET not supported on this stateless MCP endpoint; "
                "POST JSON-RPC instead."}}, status_code=405)
        await resp(scope, receive, send)
        return
    await session_manager.handle_request(scope, receive, send)


@contextlib.asynccontextmanager
async def lifespan(_app):
    async with session_manager.run():
        yield


app = Starlette(routes=[
    Route("/health", health, methods=["GET"]),
    Route("/.well-known/openai-apps-challenge", openai_apps_challenge,
          methods=["GET"]),
    Mount("/", app=mcp_asgi),
], lifespan=lifespan)


async def _run_stdio() -> None:
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    if "--http" in sys.argv:
        import uvicorn
        uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"),
                    port=int(os.environ.get("PORT", "8378")))
    else:
        asyncio.run(_run_stdio())
