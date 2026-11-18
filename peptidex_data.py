#!/usr/bin/env python3
"""PeptideX Reference Map — data + validation layer.

One versioned, reviewed dataset (data/library.json) serves every operation.
Editorial ingestion is separate: this module only reads the approved
snapshot bundled with the server. No outbound fetching at request time, no
logging of inputs anywhere in this package, and rejected input is never
echoed back and never stored.

Rules enforced here (build spec v0.2 sections 3-5; spec 08 F5):
  - narrow, bounded inputs; unknown fields are REJECTED server-side;
  - name search is name-only: health narratives, personal questions,
    dosing / purchasing / instruction text are rejected without echo;
  - the excluded substance class is rejected as out of scope, and no
    member of it exists in the dataset;
  - a regulatory record past its review due date serves no current-status
    conclusion until rechecked (spec v0.2 section 5);
  - every payload ends with the section 7 disclaimer, verbatim.
"""
import datetime
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
LIB = json.loads((HERE / "data" / "library.json").read_text(encoding="utf-8"))

DISCLAIMER = LIB["disclaimer"]
LIBRARY_VERSION = LIB["meta"]["dataset_version"]

PEPTIDES = {p["id"]: p for p in LIB["peptides"]}
STUDIES = {s["id"]: s for s in LIB["studies"]}
CLAIMS = {c["id"]: c for c in LIB["claims"]}
REGULATORY = {r["id"]: r for r in LIB["regulatory"]}
SOURCES = {s["id"]: s for s in LIB["sources"]}
SYSTEMS = {s["id"]: s for s in LIB["body_systems"]}
TOPICS = {t["id"]: t for t in LIB["topics"]}
EXPLAINERS = {e["slug"]: e for e in LIB["explainers"]}
TERMS = {t["term"]: t for t in LIB["terms"]}
EVIDENCE_CATEGORIES = ["laboratory/animal only", "early human",
                       "controlled human", "not established"]
CARD_SECTIONS = ["all", "identity", "evidence", "regulatory", "sources"]
TOPIC_CATEGORIES = LIB["topic_categories"]

GENERIC_FIELD_ERROR = ("The request included fields this operation does not "
                       "accept, or a required field was missing or had the "
                       "wrong type. Send only the documented fields.")
GENERIC_VALUE_ERROR = ("A value in the request is not in this operation's "
                       "reviewed catalog. Use the catalog identifiers "
                       "returned by the browse and search operations.")


class Rejected(Exception):
    """Carries a complete, safe payload (never echoes submitted input)."""

    def __init__(self, payload):
        super().__init__(payload.get("error", "rejected"))
        self.payload = payload


def rejected(message, **extra):
    payload = {"status": "rejected", "error": message}
    payload.update(extra)
    payload["disclaimer"] = DISCLAIMER
    raise Rejected(payload)


def ok(payload):
    payload.setdefault("library_version", LIBRARY_VERSION)
    payload["disclaimer"] = DISCLAIMER
    return payload


def check_fields(args, allowed, required=()):
    """Reject non-object args, unknown fields, missing required fields."""
    if not isinstance(args, dict):
        rejected(GENERIC_FIELD_ERROR)
    if set(args) - set(allowed) or any(r not in args for r in required):
        rejected(GENERIC_FIELD_ERROR)


def opt_str(args, name, default="", max_len=80):
    value = args.get(name, default)
    if not isinstance(value, str) or len(value) > max_len:
        rejected(GENERIC_FIELD_ERROR)
    return value


def req_str(args, name, max_len=80):
    value = args.get(name)
    if not isinstance(value, str) or not value or len(value) > max_len:
        rejected(GENERIC_FIELD_ERROR)
    return value


def opt_int(args, name, default, lo, hi):
    value = args.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) \
            or not (lo <= value <= hi):
        rejected(GENERIC_FIELD_ERROR)
    return value


# ---------------------------------------------------------------- search --

def _norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s.lower())).strip()


def _compact(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Enforcement tokens for the standing exclusion (build spec v0.2 section 1).
# These exist only so queries for the excluded class are refused as out of
# scope; no member of the class is named or described in any served content.
_EXCLUDED_TOKENS = {"retatrutide", "ly3437943", "semaglutide", "tirzepatide",
                    "ozempic", "wegovy", "rybelsus", "mounjaro", "zepbound"}
_EXCLUDED_COMPACT = {"glp1", "retatrutide", "ly3437943", "semaglutide",
                     "tirzepatide", "ozempic", "wegovy", "rybelsus",
                     "mounjaro", "zepbound"}

# Tokens that mark a query as something other than a name: personal health
# narratives, advice / dosing / purchasing asks, lab interpretation, and
# instruction text aimed at the server. Any one of them rejects the query.
_NARRATIVE_TOKENS = {
    "my", "me", "i", "diagnosed", "diagnosis", "symptom", "symptoms",
    "pain", "cancer", "diabetes", "diabetic", "condition", "disease",
    "should", "take", "taking", "took", "dose", "dosage", "dosing",
    "inject", "injection", "injections", "injected", "buy", "buying",
    "purchase", "order", "where", "treat", "treating", "treatment", "cure",
    "heal", "lose", "losing", "loss", "weight", "years", "year", "old",
    "teen", "teenage", "teenager", "son", "daughter", "child", "children",
    "kid", "kids", "minor", "lab", "labs", "blood", "result", "results",
    "interpret", "help", "please", "recommend", "recommendation", "best",
    "stack", "stacking", "cycle", "reconstitute", "reconstitution",
    "clinic", "pharmacy", "vendor", "price", "prices", "cheap", "safe",
    "safest", "effective", "work", "works", "use", "using", "used",
    "ignore", "instruction", "instructions", "prompt", "system", "reveal",
    "print", "output", "previous", "jailbreak", "prescribe", "prescription",
    "mg", "mcg", "iu", "ml", "units", "daily", "weekly",
}

_NAME_ONLY_MESSAGE = (
    "Search is name-only: enter a peptide name or alias from the catalog. "
    "Personal health questions, dosing or purchasing questions, and lab "
    "interpretation cannot be answered here. For any health decision, talk "
    "to a qualified clinician. General evidence for a named peptide is in "
    "its card (get_peptide_card).")


def _is_excluded(query):
    tokens = set(_norm(query).split())
    return bool(tokens & _EXCLUDED_TOKENS) or _compact(query) in _EXCLUDED_COMPACT


def _name_candidates(peptide):
    return [peptide["preferred_name"], *peptide["aliases"]]


def _peptide_brief(peptide):
    return {"peptide_id": peptide["id"],
            "preferred_name": peptide["preferred_name"],
            "human_evidence": peptide["evidence_stage"]["human"],
            "publication_version": peptide["publication_version"],
            "card_version": peptide["card_version"]}


def search_peptides(args):
    check_fields(args, {"query", "body_system", "evidence"}, required={"query"})
    query = req_str(args, "query", max_len=80)
    body_system = opt_str(args, "body_system")
    evidence = opt_str(args, "evidence")
    if body_system and body_system not in SYSTEMS:
        rejected(GENERIC_VALUE_ERROR)
    if evidence and evidence not in EVIDENCE_CATEGORIES:
        rejected(GENERIC_VALUE_ERROR)

    if _is_excluded(query):
        return ok({"status": "out_of_scope", "matches": [],
                   "message": "That substance is outside the reviewed scope "
                              "of this catalog, and this release does not "
                              "cover it. No information about it is served "
                              "here."})

    nq = _norm(query)
    tokens = nq.split()

    def matches(peptide):
        cands = [_norm(c) for c in _name_candidates(peptide)]
        if nq in cands:
            return "name" if nq == _norm(peptide["preferred_name"]) else "alias"
        if any(t in _NARRATIVE_TOKENS for t in tokens) or len(tokens) > 4:
            return None  # screened below, before any partial matching
        cq = _compact(query)
        for cand in cands:
            ctoks = cand.split()
            if tokens and all(t in ctoks for t in tokens):
                return "alias"
            cc = _compact(cand)
            if len(cq) >= 3 and (cc.startswith(cq) or cq.startswith(cc)):
                return "alias"
            if len(tokens) == 1 and len(tokens[0]) >= 3 and \
                    any(t.startswith(tokens[0]) for t in ctoks):
                return "alias"
        return None

    hits = [(p, m) for p in LIB["peptides"] if (m := matches(p))]
    if not hits and (any(t in _NARRATIVE_TOKENS for t in tokens)
                     or len(tokens) > 4):
        rejected(_NAME_ONLY_MESSAGE)

    out = []
    for peptide, matched_on in hits:
        if body_system and body_system not in peptide["body_system_ids"]:
            continue
        if evidence and not any(
                c["human_evidence_category"] == evidence
                for c in LIB["claims"] if c["peptide_id"] == peptide["id"]):
            continue
        brief = _peptide_brief(peptide)
        brief["matched_on"] = matched_on
        out.append(brief)

    if not out:
        return ok({"status": "not_found", "matches": [],
                   "message": "No peptide in the reviewed catalog matches "
                              "that name. The catalog covers a small, "
                              "reviewed set of peptides.",
                   "catalog": [_peptide_brief(p) for p in LIB["peptides"]]})
    return ok({"status": "ok", "matches": out})


# ------------------------------------------------------------------ card --

def _source_out(source_id):
    if source_id in SOURCES:
        s = SOURCES[source_id]
        return {"source_id": s["id"], "label": s["label"], "type": s["type"],
                "url": s["url"], "publisher": s["publisher"],
                "date_checked": s["date_checked"],
                **({"note": s["note"]} if s.get("note") else {})}
    s = STUDIES[source_id]
    return {"source_id": s["id"], "label": s["publication_id"] + " — " +
            s["population"], "type": "peer_reviewed", "url": s["primary_url"],
            "publisher": "PubMed (National Library of Medicine)",
            "date_checked": LIB["meta"]["last_review_date"]}


def _claim_out(claim):
    return {"claim_id": claim["id"], "peptide_id": claim["peptide_id"],
            "topic_id": claim["topic_id"], "statement": claim["statement"],
            "human_evidence_category": claim["human_evidence_category"],
            "supporting_study_ids": claim["supporting_study_ids"],
            "conflicting_study_ids": claim["conflicting_study_ids"],
            "supporting_source_ids": claim["supporting_source_ids"],
            "uncertainty": claim["uncertainty"]}


def _study_out(study):
    return {"study_id": study["id"],
            "publication_id": study["publication_id"],
            "primary_url": study["primary_url"],
            "study_type": study["study_type"], "species": study["species"],
            "population": study["population"],
            "sample_size": study["sample_size"], "status": study["status"],
            "dates": study["dates"],
            "intervention_identity": study["intervention_identity"],
            "comparator": study["comparator"],
            "outcomes_studied": study["outcomes_studied"],
            "results_summary": study["results_summary"],
            "limitations": study["limitations"],
            "funding_conflicts": study["funding_conflicts"]}


def regulatory_view(record, today=None):
    """One regulatory record as served on `today`.

    Past its review due date, the record's current-status conclusions are
    withdrawn until rechecked (build spec v0.2 section 5); the regulator,
    substance, primary document URL and checked date stay visible so the
    record fails clearly instead of going silently stale.
    """
    today = today or datetime.date.today()
    view = dict(record)
    stale = today.isoformat() > record["next_review_due"]
    view["status_conclusion_withdrawn"] = stale
    if stale:
        withdrawn = ("Under review: this record passed its review due date "
                     f"(checked {record['date_checked']}; recheck was due "
                     f"{record['next_review_due']}). The previous status "
                     "conclusion is withdrawn until the record is rechecked "
                     "against the primary source.")
        for field in ("approval_status", "investigational_status",
                      "compounding_framework", "enforcement_policy_status"):
            if view.get(field) is not None:
                view[field] = withdrawn
    return view


def _regulatory_out(record, today=None):
    view = regulatory_view(record, today)
    return {"regulatory_id": view["id"], "peptide_id": view["peptide_id"],
            "jurisdiction": view["jurisdiction"],
            "regulator": view["regulator"],
            "substance_formulation": view["substance_formulation"],
            "approved_indication": view["approved_indication"],
            "approval_status": view["approval_status"],
            "investigational_status": view["investigational_status"],
            "compounding_framework": view["compounding_framework"],
            "enforcement_policy_status": view["enforcement_policy_status"],
            "primary_document_url": view["primary_document_url"],
            "document_issue_date": view["document_issue_date"],
            "document_effective_date": view["document_effective_date"],
            "document_expiry_date": view["document_expiry_date"],
            "date_checked": view["date_checked"],
            "next_review_due": view["next_review_due"],
            "reviewer": view["reviewer"],
            "uncertainty_flags": view["uncertainty_flags"],
            "notes": view["notes"],
            "status_conclusion_withdrawn": view["status_conclusion_withdrawn"]}


def get_peptide_card(args):
    check_fields(args, {"peptide_id", "section"}, required={"peptide_id"})
    peptide_id = req_str(args, "peptide_id")
    section = opt_str(args, "section", default="all")
    if peptide_id not in PEPTIDES:
        rejected(GENERIC_VALUE_ERROR)
    if section not in CARD_SECTIONS:
        rejected(GENERIC_VALUE_ERROR)
    p = PEPTIDES[peptide_id]
    claims = [c for c in LIB["claims"] if c["peptide_id"] == peptide_id]
    study_ids = []
    for sid in [*p["source_ids"],
                *[s for c in claims for s in
                  c["supporting_study_ids"] + c["conflicting_study_ids"]]]:
        if sid in STUDIES and sid not in study_ids:
            study_ids.append(sid)

    payload = {"peptide_id": p["id"], "canonical_name": p["preferred_name"],
               "publication_version": p["publication_version"],
               "card_version": p["card_version"],
               "last_review_date": p["last_review_date"],
               "next_review_due": p["next_review_due"]}
    if section in ("all", "identity"):
        payload.update({
            "aliases": p["aliases"], "what_it_is": p["what_it_is"],
            "molecular_identity": p["molecular_identity"],
            "not_to_be_confused_with": p["not_to_be_confused_with"],
            "formulation_route_distinctions":
                p["formulation_route_distinctions"],
            "mechanism": {"text": p["mechanism"]["text"],
                          "status": p["mechanism"]["status"]},
            "body_system_ids": p["body_system_ids"],
            "research_topic_ids": p["research_topic_ids"]})
    if section in ("all", "evidence"):
        payload.update({
            "what_researchers_have_studied": p["studied"],
            "evidence_stage": p["evidence_stage"],
            "evidence_limitations": p["evidence_limitations"],
            "safety_summary": p["safety_summary"],
            "not_established": p["not_established"],
            "claims": [_claim_out(c) for c in claims],
            "studies": [_study_out(STUDIES[s]) for s in study_ids]})
    if section in ("all", "regulatory"):
        payload["regulatory_status"] = [
            _regulatory_out(r) for r in LIB["regulatory"]
            if r["peptide_id"] == peptide_id]
    if section in ("all", "sources"):
        payload["sources"] = [_source_out(s) for s in p["source_ids"]]
    return ok(payload)


# ----------------------------------------------------------------- browse --

def browse_research_map(args):
    check_fields(args, {"body_system", "topic_id", "evidence", "limit",
                        "offset"})
    body_system = opt_str(args, "body_system")
    topic_id = opt_str(args, "topic_id")
    evidence = opt_str(args, "evidence")
    limit = opt_int(args, "limit", 25, 1, 50)
    offset = opt_int(args, "offset", 0, 0, 500)
    if body_system and body_system not in SYSTEMS:
        rejected(GENERIC_VALUE_ERROR)
    if topic_id and topic_id not in TOPICS:
        rejected(GENERIC_VALUE_ERROR)
    if evidence and evidence not in EVIDENCE_CATEGORIES:
        rejected(GENERIC_VALUE_ERROR)

    topics = [t for t in LIB["topics"]
              if (not topic_id or t["id"] == topic_id)
              and (not body_system or body_system in t["body_system_ids"])]
    connections = []
    total_claims = 0
    for topic in topics:
        claims = [c for c in LIB["claims"] if c["topic_id"] == topic["id"]
                  and (not evidence
                       or c["human_evidence_category"] == evidence)]
        total_claims += len(claims)
        connections.append({
            "topic_id": topic["id"], "topic_name": topic["name"],
            "research_goal": topic["name"],
            "body_system_ids": topic["body_system_ids"],
            "description": topic["description"],
            "peptide_ids": sorted({c["peptide_id"] for c in claims}),
            "claims": [_claim_out(c) for c in claims]})
    flat = [c for conn in connections for c in conn["claims"]]
    page = flat[offset:offset + limit]
    keep = {c["claim_id"] for c in page}
    for conn in connections:
        conn["claims"] = [c for c in conn["claims"]
                           if c["claim_id"] in keep]
    connections = [c for c in connections if c["claims"] or not flat]

    return ok({
        "map_note": "This is a research map, never a treatment map. A "
                    "topic is not a claim of benefit. Research goals here "
                    "mean what researchers are studying (topics and "
                    "models), never personal treatment goals.",
        "browse_modes": ["body_system", "research_goal"],
        "body_systems": [SYSTEMS[s] for s in
                         ([body_system] if body_system else SYSTEMS)],
        "connections": connections,
        "total_claims": total_claims, "limit": limit, "offset": offset,
        "returned_claims": len(page)})


# ---------------------------------------------------------------- compare --

def compare_peptide_evidence(args):
    check_fields(args, {"peptide_ids", "topic_id"}, required={"peptide_ids"})
    peptide_ids = args.get("peptide_ids")
    topic_id = opt_str(args, "topic_id")
    if not isinstance(peptide_ids, list) \
            or not (2 <= len(peptide_ids) <= 3) \
            or any(not isinstance(x, str) or len(x) > 80
                   for x in peptide_ids) \
            or len(set(peptide_ids)) != len(peptide_ids) \
            or any(x not in PEPTIDES for x in peptide_ids):
        rejected("Compare takes two or three peptide identifiers from the "
                 "reviewed catalog, with no repeats.")
    if topic_id and topic_id not in TOPICS:
        rejected(GENERIC_VALUE_ERROR)

    cards = []
    for pid in peptide_ids:
        p = PEPTIDES[pid]
        claims = [c for c in LIB["claims"] if c["peptide_id"] == pid
                  and (not topic_id or c["topic_id"] == topic_id)]
        us_fda = next((r for r in LIB["regulatory"]
                       if r["peptide_id"] == pid and r["jurisdiction"] == "US"
                       and "FDA" in r["regulator"]), None)
        cards.append({
            "peptide_id": pid, "preferred_name": p["preferred_name"],
            "molecular_identity": p["molecular_identity"],
            "mechanism_status": p["mechanism"]["status"],
            "evidence_stage": p["evidence_stage"],
            "claims": [_claim_out(c) for c in claims],
            "claims_note": None if claims else
                "No reviewed claims for this peptide on this topic.",
            "us_regulatory_headline":
                _regulatory_out(us_fda)["approval_status"] if us_fda else None,
            "not_established": p["not_established"]})
    return ok({
        "comparison_note": "Neutral factual comparison on the same fields "
                           "for each peptide. There is no ranking, no "
                           "suitability score, and no recommendation. A "
                           "neutral comparison is not a recommendation.",
        "topic_id": topic_id or None, "peptides": cards})


# -------------------------------------------------------------- regulatory --

def get_regulatory_record(args):
    check_fields(args, {"peptide_id", "jurisdiction"},
                 required={"peptide_id", "jurisdiction"})
    peptide_id = req_str(args, "peptide_id")
    jurisdiction = req_str(args, "jurisdiction")
    if peptide_id not in PEPTIDES:
        rejected(GENERIC_VALUE_ERROR)
    if jurisdiction not in LIB["supported_jurisdictions"]:
        rejected("That jurisdiction is not supported. Supported "
                 "jurisdictions: US federal information, and sport "
                 "(WADA). Other jurisdictions appear only after a verified "
                 "source and review process exists; US status is not "
                 "extrapolated worldwide.")
    records = [_regulatory_out(r) for r in LIB["regulatory"]
               if r["peptide_id"] == peptide_id
               and r["jurisdiction"] == jurisdiction]
    if not records:
        return ok({"status": "no_record", "peptide_id": peptide_id,
                   "jurisdiction": jurisdiction, "records": [],
                   "message": "No reviewed regulatory record exists for "
                              "this peptide in this jurisdiction. Absence "
                              "of a record is not a status conclusion."})
    return ok({"status": "ok", "peptide_id": peptide_id,
               "jurisdiction": jurisdiction, "records": records,
               "freshness_note": "Each record shows the date it was checked "
                                 "and its review due date. A record past "
                                 "its due date serves no current-status "
                                 "conclusion until rechecked."})


# ------------------------------------------------------------------ source --

def get_source_record(args):
    check_fields(args, {"source_id"}, required={"source_id"})
    source_id = req_str(args, "source_id")
    if source_id not in SOURCES and source_id not in STUDIES:
        rejected(GENERIC_VALUE_ERROR)
    base = _source_out(source_id)
    claims = []
    for c in LIB["claims"]:
        role = None
        if source_id in c["supporting_study_ids"] \
                or source_id in c["supporting_source_ids"]:
            role = "supporting"
        elif source_id in c["conflicting_study_ids"]:
            role = "conflicting"
        if role:
            claims.append({"claim_id": c["id"], "peptide_id": c["peptide_id"],
                           "topic_id": c["topic_id"], "role": role,
                           "statement": c["statement"],
                           "human_evidence_category":
                               c["human_evidence_category"]})
    peptide_ids = sorted({p["id"] for p in LIB["peptides"]
                          if source_id in p["source_ids"]}
                         | {c["peptide_id"] for c in claims})
    base.update({"supports": {"claims": claims, "peptide_ids": peptide_ids},
                 "revision": {"date_checked": base["date_checked"],
                              "dataset_version": LIBRARY_VERSION}})
    return ok(base)


# ----------------------------------------------------------------- legacy --

def list_peptide_topics(args):
    check_fields(args, {"category"})
    category = opt_str(args, "category", default="all")
    if category != "all" and category not in TOPIC_CATEGORIES:
        rejected(GENERIC_VALUE_ERROR)
    topics = []
    if category in ("all", "reference_cards"):
        for p in LIB["peptides"]:
            topics.append({"slug": p["id"], "title": p["preferred_name"],
                           "category": "reference_cards",
                           "summary": p["what_it_is"]})
    for e in LIB["explainers"]:
        if category in ("all", e["category"]):
            topics.append({"slug": e["slug"], "title": e["title"],
                           "category": e["category"],
                           "summary": e["summary"]})
    payload = {"topics": topics}
    if category in ("all", "reference_cards"):
        payload["notes"] = [LIB["index_notes"]["tb_500"]]
    return ok(payload)


def get_peptide_explainer(args):
    check_fields(args, {"slug"}, required={"slug"})
    slug = req_str(args, "slug")
    if slug not in EXPLAINERS:
        rejected(GENERIC_VALUE_ERROR,
                 topics=[{"slug": e["slug"], "title": e["title"],
                          "category": e["category"]}
                         for e in LIB["explainers"]])
    e = EXPLAINERS[slug]
    return ok({"slug": e["slug"], "title": e["title"],
               "category": e["category"], "summary": e["summary"],
               "body": e["body"], "sources_note": e["sources_note"]})


def explain_regulatory_term(args):
    check_fields(args, {"term"}, required={"term"})
    term = req_str(args, "term")
    if term not in TERMS:
        rejected(GENERIC_VALUE_ERROR,
                 terms=sorted(TERMS))
    t = TERMS[term]
    return ok({"term": t["term"], "plain_language": t["plain_language"],
               "does_not_mean": t["does_not_mean"]})


OPERATIONS = {
    "search_peptides": search_peptides,
    "get_peptide_card": get_peptide_card,
    "browse_research_map": browse_research_map,
    "compare_peptide_evidence": compare_peptide_evidence,
    "get_regulatory_record": get_regulatory_record,
    "get_source_record": get_source_record,
    "list_peptide_topics": list_peptide_topics,
    "get_peptide_explainer": get_peptide_explainer,
    "explain_regulatory_term": explain_regulatory_term,
}
