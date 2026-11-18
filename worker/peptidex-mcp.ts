// PeptideX Reference Map — MCP server (Cloudflare Worker).
//
// THE deployable for the live endpoint https://mcp.peptidex.ai, which is
// a plain Cloudflare Worker (no Deno, no Node APIs — standard Fetch API
// only). Deploy worker/dist/peptidex-mcp.js (see DEPLOY.md); this .ts
// file is the source, and worker/build.mjs generates the dist module
// with the dataset inlined.
//
// Stateless Streamable HTTP MCP (JSON responses), read-only tools only.
// One versioned, reviewed dataset (../data/library.json, inlined at build
// time) serves all nine operations: the six reference-map operations of
// build spec v0.2 plus the three library operations of the education app.
// No outbound fetching at request time, no auth, no user data, no input
// logging. Rejected input is never echoed and never stored. Every payload
// ends with the spec section 7 disclaimer, verbatim.
//
// Validation note: unlike the Python/Deno mirrors, the advertised
// schemas here are fully typed (real types, enums, additionalProperties:
// false) because this JSON-RPC layer never generates schema-validation
// errors — it passes arguments straight to the operation functions,
// which enforce every constraint server-side and reject with generic,
// non-echoing errors. The typed schemas describe the contract to the
// model; enforcement does not depend on them.
//
// The data layer below is shared verbatim with the Deno edge-function
// mirror (edge-function/peptidex-mcp/index.ts); keep them in sync.

import LIBRARY from "../data/library.json" with { type: "json" };

const LIB: any = LIBRARY;
const DISCLAIMER: string = LIB.disclaimer;
const LIBRARY_VERSION: string = LIB.meta.dataset_version;

const PEPTIDES: Record<string, any> = Object.fromEntries(LIB.peptides.map((p: any) => [p.id, p]));
const STUDIES: Record<string, any> = Object.fromEntries(LIB.studies.map((s: any) => [s.id, s]));
const SOURCES: Record<string, any> = Object.fromEntries(LIB.sources.map((s: any) => [s.id, s]));
const SYSTEMS: Record<string, any> = Object.fromEntries(LIB.body_systems.map((s: any) => [s.id, s]));
const TOPICS: Record<string, any> = Object.fromEntries(LIB.topics.map((t: any) => [t.id, t]));
const EXPLAINERS: Record<string, any> = Object.fromEntries(LIB.explainers.map((e: any) => [e.slug, e]));
const TERMS: Record<string, any> = Object.fromEntries(LIB.terms.map((t: any) => [t.term, t]));
const EVIDENCE_CATEGORIES = ["laboratory/animal only", "early human", "controlled human", "not established"];
const CARD_SECTIONS = ["all", "identity", "evidence", "regulatory", "sources"];
const TOPIC_CATEGORIES: string[] = LIB.topic_categories;

const GENERIC_FIELD_ERROR = "The request included fields this operation does not " +
  "accept, or a required field was missing or had the wrong type. Send only the documented fields.";
const GENERIC_VALUE_ERROR = "A value in the request is not in this operation's " +
  "reviewed catalog. Use the catalog identifiers returned by the browse and search operations.";

class Rejected extends Error {
  payload: any;
  constructor(payload: any) { super(payload?.error ?? "rejected"); this.payload = payload; }
}
function rejected(message: string, extra: any = {}): never {
  throw new Rejected({ status: "rejected", error: message, ...extra, disclaimer: DISCLAIMER });
}
function ok(payload: any): any {
  if (payload.library_version === undefined) payload.library_version = LIBRARY_VERSION;
  payload.disclaimer = DISCLAIMER;
  return payload;
}
function checkFields(args: any, allowed: string[], required: string[] = []): void {
  if (typeof args !== "object" || args === null || Array.isArray(args)) rejected(GENERIC_FIELD_ERROR);
  const keys = Object.keys(args);
  if (keys.some((k) => !allowed.includes(k)) || required.some((r) => !(r in args))) {
    rejected(GENERIC_FIELD_ERROR);
  }
}
function optStr(args: any, name: string, def = "", maxLen = 80): string {
  const v = args[name] ?? def;
  if (typeof v !== "string" || v.length > maxLen) rejected(GENERIC_FIELD_ERROR);
  return v;
}
function reqStr(args: any, name: string, maxLen = 80): string {
  const v = args[name];
  if (typeof v !== "string" || !v || v.length > maxLen) rejected(GENERIC_FIELD_ERROR);
  return v;
}
function optInt(args: any, name: string, def: number, lo: number, hi: number): number {
  const v = args[name] ?? def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) rejected(GENERIC_FIELD_ERROR);
  return v;
}

// ------------------------------------------------------------------ search --
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Enforcement tokens for the standing exclusion (build spec v0.2 section 1).
// They exist only so queries for the excluded class are refused as out of
// scope; no member of the class is named or described in any served content.
const EXCLUDED_TOKENS = new Set(["retatrutide", "ly3437943", "semaglutide", "tirzepatide",
  "ozempic", "wegovy", "rybelsus", "mounjaro", "zepbound"]);
const EXCLUDED_COMPACT = new Set(["glp1", "retatrutide", "ly3437943", "semaglutide",
  "tirzepatide", "ozempic", "wegovy", "rybelsus", "mounjaro", "zepbound"]);
const NARRATIVE_TOKENS = new Set([
  "my", "me", "i", "diagnosed", "diagnosis", "symptom", "symptoms", "pain",
  "cancer", "diabetes", "diabetic", "condition", "disease", "should", "take",
  "taking", "took", "dose", "dosage", "dosing", "inject", "injection",
  "injections", "injected", "buy", "buying", "purchase", "order", "where",
  "treat", "treating", "treatment", "cure", "heal", "lose", "losing", "loss",
  "weight", "years", "year", "old", "teen", "teenage", "teenager", "son",
  "daughter", "child", "children", "kid", "kids", "minor", "lab", "labs",
  "blood", "result", "results", "interpret", "help", "please", "recommend",
  "recommendation", "best", "stack", "stacking", "cycle", "reconstitute",
  "reconstitution", "clinic", "pharmacy", "vendor", "price", "prices",
  "cheap", "safe", "safest", "effective", "work", "works", "use", "using",
  "used", "ignore", "instruction", "instructions", "prompt", "system",
  "reveal", "print", "output", "previous", "jailbreak", "prescribe",
  "prescription", "mg", "mcg", "iu", "ml", "units", "daily", "weekly",
]);
const NAME_ONLY_MESSAGE = "Search is name-only: enter a peptide name or alias from the catalog. " +
  "Personal health questions, dosing or purchasing questions, and lab interpretation cannot be " +
  "answered here. For any health decision, talk to a qualified clinician. General evidence for a " +
  "named peptide is in its card (get_peptide_card).";

const peptideBrief = (p: any) => ({
  peptide_id: p.id, preferred_name: p.preferred_name,
  human_evidence: p.evidence_stage.human,
  publication_version: p.publication_version, card_version: p.card_version,
});

function searchPeptides(args: any): any {
  checkFields(args, ["query", "body_system", "evidence"], ["query"]);
  const query = reqStr(args, "query");
  const bodySystem = optStr(args, "body_system");
  const evidence = optStr(args, "evidence");
  if (bodySystem && !(bodySystem in SYSTEMS)) rejected(GENERIC_VALUE_ERROR);
  if (evidence && !EVIDENCE_CATEGORIES.includes(evidence)) rejected(GENERIC_VALUE_ERROR);

  const tokens = norm(query).split(" ").filter(Boolean);
  if (tokens.some((t) => EXCLUDED_TOKENS.has(t)) || EXCLUDED_COMPACT.has(compact(query))) {
    return ok({ status: "out_of_scope", matches: [],
      message: "That substance is outside the reviewed scope of this catalog, and this " +
        "release does not cover it. No information about it is served here." });
  }
  const nq = norm(query);
  const screened = tokens.some((t) => NARRATIVE_TOKENS.has(t)) || tokens.length > 4;
  const matchOf = (p: any): string | null => {
    // Exact reviewed-alias matching only (Instinct review fix, Nov 18):
    // spaced or compacted spelling of a canonical name or reviewed alias;
    // no prefix, substring or token-subset matching.
    const names = [p.preferred_name, ...p.aliases];
    if (names.map(norm).includes(nq)) {
      return nq === norm(p.preferred_name) ? "name" : "alias";
    }
    if (names.map(compact).includes(compact(query))) {
      return compact(query) === compact(p.preferred_name) ? "name" : "alias";
    }
    return null;
  };
  const hits: any[] = [];
  for (const p of LIB.peptides) {
    const m = matchOf(p);
    if (m) hits.push([p, m]);
  }
  if (!hits.length && screened) rejected(NAME_ONLY_MESSAGE);
  const out: any[] = [];
  for (const [p, m] of hits) {
    if (bodySystem && !p.body_system_ids.includes(bodySystem)) continue;
    if (evidence && !LIB.claims.some((c: any) =>
      c.peptide_id === p.id && c.human_evidence_category === evidence)) continue;
    out.push({ ...peptideBrief(p), matched_on: m });
  }
  if (!out.length) {
    return ok({ status: "not_found", matches: [],
      message: "No peptide in the reviewed catalog matches that name. The catalog covers a small, reviewed set of peptides.",
      catalog: LIB.peptides.map(peptideBrief) });
  }
  return ok({ status: "ok", matches: out });
}

// -------------------------------------------------------------------- card --
function sourceOut(sourceId: string): any {
  if (sourceId in SOURCES) {
    const s = SOURCES[sourceId];
    return { source_id: s.id, label: s.label, type: s.type, url: s.url,
      publisher: s.publisher, date_checked: s.date_checked,
      ...(s.note ? { note: s.note } : {}) };
  }
  const s = STUDIES[sourceId];
  return { source_id: s.id, label: `${s.publication_id} — ${s.population}`,
    type: "peer_reviewed", url: s.primary_url,
    publisher: "PubMed (National Library of Medicine)",
    date_checked: LIB.meta.last_review_date };
}
const claimOut = (c: any) => ({
  claim_id: c.id, peptide_id: c.peptide_id, topic_id: c.topic_id,
  statement: c.statement, human_evidence_category: c.human_evidence_category,
  supporting_study_ids: c.supporting_study_ids,
  conflicting_study_ids: c.conflicting_study_ids,
  supporting_source_ids: c.supporting_source_ids, uncertainty: c.uncertainty,
});
const studyOut = (s: any) => ({
  study_id: s.id, publication_id: s.publication_id, primary_url: s.primary_url,
  study_type: s.study_type, species: s.species, population: s.population,
  sample_size: s.sample_size, status: s.status, dates: s.dates,
  intervention_identity: s.intervention_identity, comparator: s.comparator,
  outcomes_studied: s.outcomes_studied, results_summary: s.results_summary,
  limitations: s.limitations, funding_conflicts: s.funding_conflicts,
});

function regulatoryView(record: any, today?: string): any {
  // Past its review due date, the record's current-status conclusions are
  // withdrawn until rechecked (build spec v0.2 section 5); the regulator,
  // substance, primary document URL and checked date stay visible.
  const t = today ?? new Date().toISOString().slice(0, 10);
  const view = { ...record };
  const stale = t > record.next_review_due;
  view.status_conclusion_withdrawn = stale;
  if (stale) {
    const withdrawn = "Under review: this record passed its review due date " +
      `(checked ${record.date_checked}; recheck was due ${record.next_review_due}). ` +
      "The previous status conclusion is withdrawn until the record is rechecked " +
      "against the primary source.";
    for (const f of ["approval_status", "investigational_status",
                     "compounding_framework", "enforcement_policy_status"]) {
      if (view[f] != null) view[f] = withdrawn;
    }
  }
  return view;
}
function regulatoryOut(record: any, today?: string): any {
  const v = regulatoryView(record, today);
  return { regulatory_id: v.id, peptide_id: v.peptide_id, jurisdiction: v.jurisdiction,
    regulator: v.regulator, substance_formulation: v.substance_formulation,
    approved_indication: v.approved_indication, approval_status: v.approval_status,
    investigational_status: v.investigational_status,
    compounding_framework: v.compounding_framework,
    enforcement_policy_status: v.enforcement_policy_status,
    primary_document_url: v.primary_document_url,
    document_issue_date: v.document_issue_date,
    document_effective_date: v.document_effective_date,
    document_expiry_date: v.document_expiry_date, date_checked: v.date_checked,
    next_review_due: v.next_review_due, reviewer: v.reviewer,
    uncertainty_flags: v.uncertainty_flags, notes: v.notes,
    status_conclusion_withdrawn: v.status_conclusion_withdrawn };
}

function getPeptideCard(args: any): any {
  checkFields(args, ["peptide_id", "section"], ["peptide_id"]);
  const peptideId = reqStr(args, "peptide_id");
  const section = optStr(args, "section", "all");
  if (!(peptideId in PEPTIDES)) rejected(GENERIC_VALUE_ERROR);
  if (!CARD_SECTIONS.includes(section)) rejected(GENERIC_VALUE_ERROR);
  const p = PEPTIDES[peptideId];
  const claims = LIB.claims.filter((c: any) => c.peptide_id === peptideId);
  const studyIds: string[] = [];
  for (const sid of [...p.source_ids,
    ...claims.flatMap((c: any) => [...c.supporting_study_ids, ...c.conflicting_study_ids])]) {
    if (sid in STUDIES && !studyIds.includes(sid)) studyIds.push(sid);
  }
  const payload: any = { peptide_id: p.id, canonical_name: p.preferred_name,
    publication_version: p.publication_version, card_version: p.card_version,
    last_review_date: p.last_review_date, next_review_due: p.next_review_due };
  if (section === "all" || section === "identity") {
    Object.assign(payload, { aliases: p.aliases, what_it_is: p.what_it_is,
      molecular_identity: p.molecular_identity,
      not_to_be_confused_with: p.not_to_be_confused_with,
      formulation_route_distinctions: p.formulation_route_distinctions,
      mechanism: { text: p.mechanism.text, status: p.mechanism.status },
      body_system_ids: p.body_system_ids, research_topic_ids: p.research_topic_ids });
  }
  if (section === "all" || section === "evidence") {
    Object.assign(payload, { what_researchers_have_studied: p.studied,
      evidence_stage: p.evidence_stage, evidence_limitations: p.evidence_limitations,
      safety_summary: p.safety_summary, not_established: p.not_established,
      claims: claims.map(claimOut), studies: studyIds.map((s) => studyOut(STUDIES[s])) });
  }
  if (section === "all" || section === "regulatory") {
    payload.regulatory_status = LIB.regulatory
      .filter((r: any) => r.peptide_id === peptideId).map((r: any) => regulatoryOut(r));
  }
  if (section === "all" || section === "sources") {
    payload.sources = p.source_ids.map(sourceOut);
  }
  return ok(payload);
}

// ------------------------------------------------------------------ browse --
function browseResearchMap(args: any): any {
  checkFields(args, ["body_system", "topic_id", "evidence", "limit", "offset"]);
  const bodySystem = optStr(args, "body_system");
  const topicId = optStr(args, "topic_id");
  const evidence = optStr(args, "evidence");
  const limit = optInt(args, "limit", 25, 1, 50);
  const offset = optInt(args, "offset", 0, 0, 500);
  if (bodySystem && !(bodySystem in SYSTEMS)) rejected(GENERIC_VALUE_ERROR);
  if (topicId && !(topicId in TOPICS)) rejected(GENERIC_VALUE_ERROR);
  if (evidence && !EVIDENCE_CATEGORIES.includes(evidence)) rejected(GENERIC_VALUE_ERROR);

  const topics = LIB.topics.filter((t: any) =>
    (!topicId || t.id === topicId) && (!bodySystem || t.body_system_ids.includes(bodySystem)));
  let connections: any[] = topics.map((t: any) => {
    const claims = LIB.claims.filter((c: any) => c.topic_id === t.id &&
      (!evidence || c.human_evidence_category === evidence));
    return { topic_id: t.id, topic_name: t.name, research_goal: t.name,
      body_system_ids: t.body_system_ids,
      description: t.description,
      peptide_ids: [...new Set(claims.map((c: any) => c.peptide_id))].sort(),
      claims: claims.map(claimOut), _n: claims.length };
  });
  const totalClaims = connections.reduce((a: number, c: any) => a + c._n, 0);
  const flat = connections.flatMap((c: any) => c.claims);
  const keep = new Set(flat.slice(offset, offset + limit).map((c: any) => c.claim_id));
  for (const conn of connections) {
    conn.claims = conn.claims.filter((c: any) => keep.has(c.claim_id));
    delete conn._n;
  }
  connections = connections.filter((c: any) => c.claims.length || !flat.length);
  return ok({
    map_note: "This is a research map, never a treatment map. A topic is not a claim of benefit. " +
      "Research goals here mean what researchers are studying (topics and models), never personal treatment goals.",
    browse_modes: ["body_system", "research_goal"],
    body_systems: bodySystem ? [SYSTEMS[bodySystem]] : Object.values(SYSTEMS),
    connections, total_claims: totalClaims, limit, offset,
    returned_claims: Math.max(0, Math.min(limit, flat.length - offset)),
  });
}

// ----------------------------------------------------------------- compare --
function comparePeptideEvidence(args: any): any {
  checkFields(args, ["peptide_ids", "topic_id"], ["peptide_ids"]);
  const peptideIds = args.peptide_ids;
  const topicId = optStr(args, "topic_id");
  if (!Array.isArray(peptideIds) || peptideIds.length < 2 || peptideIds.length > 3 ||
      peptideIds.some((x: any) => typeof x !== "string" || x.length > 80) ||
      new Set(peptideIds).size !== peptideIds.length ||
      peptideIds.some((x: string) => !(x in PEPTIDES))) {
    rejected("Compare takes two or three peptide identifiers from the reviewed catalog, with no repeats.");
  }
  if (topicId && !(topicId in TOPICS)) rejected(GENERIC_VALUE_ERROR);
  const cards = peptideIds.map((pid: string) => {
    const p = PEPTIDES[pid];
    const claims = LIB.claims.filter((c: any) => c.peptide_id === pid &&
      (!topicId || c.topic_id === topicId));
    const usFda = LIB.regulatory.find((r: any) => r.peptide_id === pid &&
      r.jurisdiction === "US" && r.regulator.includes("FDA"));
    return { peptide_id: pid, preferred_name: p.preferred_name,
      molecular_identity: p.molecular_identity, mechanism_status: p.mechanism.status,
      evidence_stage: p.evidence_stage, claims: claims.map(claimOut),
      claims_note: claims.length ? null : "No reviewed claims for this peptide on this topic.",
      us_regulatory_headline: usFda ? regulatoryOut(usFda).approval_status : null,
      not_established: p.not_established };
  });
  return ok({
    comparison_note: "Neutral factual comparison on the same fields for each peptide. " +
      "There is no ranking, no suitability score, and no recommendation. A neutral " +
      "comparison is not a recommendation.",
    topic_id: topicId || null, peptides: cards });
}

// -------------------------------------------------------------- regulatory --
function getRegulatoryRecord(args: any): any {
  checkFields(args, ["peptide_id", "jurisdiction"], ["peptide_id", "jurisdiction"]);
  const peptideId = reqStr(args, "peptide_id");
  const jurisdiction = reqStr(args, "jurisdiction");
  if (!(peptideId in PEPTIDES)) rejected(GENERIC_VALUE_ERROR);
  if (!LIB.supported_jurisdictions.includes(jurisdiction)) {
    rejected("That jurisdiction is not supported. Supported jurisdictions: US federal " +
      "information, and sport (WADA). Other jurisdictions appear only after a verified " +
      "source and review process exists; US status is not extrapolated worldwide.");
  }
  const records = LIB.regulatory
    .filter((r: any) => r.peptide_id === peptideId && r.jurisdiction === jurisdiction)
    .map((r: any) => regulatoryOut(r));
  if (!records.length) {
    return ok({ status: "no_record", peptide_id: peptideId, jurisdiction, records: [],
      message: "No reviewed regulatory record exists for this peptide in this jurisdiction. " +
        "Absence of a record is not a status conclusion." });
  }
  return ok({ status: "ok", peptide_id: peptideId, jurisdiction, records,
    freshness_note: "Each record shows the date it was checked and its review due date. " +
      "A record past its due date serves no current-status conclusion until rechecked." });
}

// ------------------------------------------------------------------ source --
function getSourceRecord(args: any): any {
  checkFields(args, ["source_id"], ["source_id"]);
  const sourceId = reqStr(args, "source_id");
  if (!(sourceId in SOURCES) && !(sourceId in STUDIES)) rejected(GENERIC_VALUE_ERROR);
  const base = sourceOut(sourceId);
  const claims: any[] = [];
  for (const c of LIB.claims) {
    let role: string | null = null;
    if (c.supporting_study_ids.includes(sourceId) || c.supporting_source_ids.includes(sourceId)) role = "supporting";
    else if (c.conflicting_study_ids.includes(sourceId)) role = "conflicting";
    if (role) claims.push({ claim_id: c.id, peptide_id: c.peptide_id, topic_id: c.topic_id,
      role, statement: c.statement, human_evidence_category: c.human_evidence_category });
  }
  const peptideIds = [...new Set([
    ...LIB.peptides.filter((p: any) => p.source_ids.includes(sourceId)).map((p: any) => p.id),
    ...claims.map((c) => c.peptide_id)])].sort();
  return ok({ ...base, supports: { claims, peptide_ids: peptideIds },
    revision: { date_checked: base.date_checked, dataset_version: LIBRARY_VERSION } });
}

// ------------------------------------------------------------------ legacy --
function listPeptideTopics(args: any): any {
  checkFields(args, ["category"]);
  const category = optStr(args, "category", "all");
  if (category !== "all" && !TOPIC_CATEGORIES.includes(category)) rejected(GENERIC_VALUE_ERROR);
  const topics: any[] = [];
  if (category === "all" || category === "reference_cards") {
    for (const p of LIB.peptides) {
      topics.push({ slug: p.id, title: p.preferred_name, category: "reference_cards", summary: p.what_it_is });
    }
  }
  for (const e of LIB.explainers) {
    if (category === "all" || category === e.category) {
      topics.push({ slug: e.slug, title: e.title, category: e.category, summary: e.summary });
    }
  }
  const payload: any = { topics };
  if (category === "all" || category === "reference_cards") payload.notes = [LIB.index_notes.tb_500];
  return ok(payload);
}
function getPeptideExplainer(args: any): any {
  checkFields(args, ["slug"], ["slug"]);
  const slug = reqStr(args, "slug");
  if (!(slug in EXPLAINERS)) {
    rejected(GENERIC_VALUE_ERROR, { topics: LIB.explainers.map((e: any) =>
      ({ slug: e.slug, title: e.title, category: e.category })) });
  }
  const e = EXPLAINERS[slug];
  return ok({ slug: e.slug, title: e.title, category: e.category, summary: e.summary,
    body: e.body, sources_note: e.sources_note });
}
function explainRegulatoryTerm(args: any): any {
  checkFields(args, ["term"], ["term"]);
  const term = reqStr(args, "term");
  if (!(term in TERMS)) rejected(GENERIC_VALUE_ERROR, { terms: Object.keys(TERMS).sort() });
  const t = TERMS[term];
  return ok({ term: t.term, plain_language: t.plain_language, does_not_mean: t.does_not_mean });
}

const OPERATIONS: Record<string, (a: any) => any> = {
  search_peptides: searchPeptides,
  get_peptide_card: getPeptideCard,
  browse_research_map: browseResearchMap,
  compare_peptide_evidence: comparePeptideEvidence,
  get_regulatory_record: getRegulatoryRecord,
  get_source_record: getSourceRecord,
  list_peptide_topics: listPeptideTopics,
  get_peptide_explainer: getPeptideExplainer,
  explain_regulatory_term: explainRegulatoryTerm,
};

// ---------- MCP surface (typed schemas) ----------
const READ_ONLY = { readOnlyHint: true, destructiveHint: false,
  openWorldHint: false, idempotentHint: true };
const PIDS = ["bpc_157", "tb_500", "ghk_cu", "mots_c"];
const SYSTEM_IDS = ["musculoskeletal", "skin", "metabolic", "digestive", "nervous_system"];
const TOPIC_IDS = ["tendon_ligament_injury_models", "muscle_injury_models",
  "gut_injury_models", "wound_healing_models", "metabolic_regulation",
  "endogenous_levels_and_exercise", "skin_appearance_research"];
const SOURCE_IDS = ["src_fda_compounding_safety", "src_hhs_503a_policy",
  "src_federal_register_2026_22192", "src_wada_prohibited_list",
  "src_fda_mots_eval", "src_fda_tb500_eval", "src_fda_503a_nominations",
  "chang_2011", "hsieh_2017", "vasireddi_2025", "poolton_2026",
  "lee_2015", "reynolds_2021", "vonwalden_2021", "pickart_1973",
  "maquart_1988", "bishop_1992", "mulder_1994", "miller_2006"];
const TOOLS = [
  { name: "search_peptides", title: "Search peptides by name",
    description: "Name-only search of the reviewed peptide catalog. Pass a peptide name or reviewed alias (e.g. \"BPC-157\", \"Bepecin\", \"copper tripeptide-1\"). Matching is exact: a name followed by any other words is not a match. This is not a health question field: personal health narratives, dosing or purchasing questions are rejected and never stored. Optional filters: body_system and evidence category.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 80, description: "Peptide name or alias to look up (name only)." },
        body_system: { type: "string", enum: SYSTEM_IDS, description: "Optional body-system filter (catalog ID)." },
        evidence: { type: "string", enum: EVIDENCE_CATEGORIES, description: "Optional human-evidence category filter." } },
      required: ["query"] },
    annotations: READ_ONLY },
  { name: "get_peptide_card", title: "Get one peptide reference card",
    description: "Returns the fixed, reviewed reference card for one catalog peptide: identity, mechanism (labeled established or proposed), what researchers have studied, claim-level evidence with citations, dated regulatory records, and what is not established. Pass only the peptide_id from search_peptides or list_peptide_topics. Do not pass any personal or health information.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        peptide_id: { type: "string", enum: PIDS, description: "Catalog peptide ID, e.g. \"bpc_157\"." },
        section: { type: "string", enum: CARD_SECTIONS, description: "Card section to return (default \"all\")." } },
      required: ["peptide_id"] },
    annotations: READ_ONLY },
  { name: "browse_research_map", title: "Browse the body-system research map",
    description: "Browse the research map by body system or by research goal (a studied-for research topic), with the reviewed peptide-study claims connected to each. This is a research map, never a treatment map; a topic is not a claim of benefit, and a research goal is what researchers are studying, never a personal treatment goal. Optional: body_system, topic_id, evidence category filter, and bounded pagination (limit, offset).",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        body_system: { type: "string", enum: SYSTEM_IDS, description: "Optional body-system ID." },
        topic_id: { type: "string", enum: TOPIC_IDS, description: "Optional research-topic ID." },
        evidence: { type: "string", enum: EVIDENCE_CATEGORIES, description: "Optional human-evidence category filter." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25, description: "Max claims to return (1-50, default 25)." },
        offset: { type: "integer", minimum: 0, maximum: 500, default: 0, description: "Pagination offset (default 0)." } } },
    annotations: READ_ONLY },
  { name: "compare_peptide_evidence", title: "Compare peptide evidence side by side",
    description: "Neutral side-by-side comparison of two or three catalog peptides on the same factual fields (identity, mechanism status, evidence stage, claims, US regulatory headline, what is not established), optionally narrowed to one research topic. There is no ranking, no suitability score, and no recommendation.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        peptide_ids: { type: "array", items: { type: "string", enum: PIDS }, minItems: 2, maxItems: 3, uniqueItems: true, description: "Two or three catalog peptide IDs." },
        topic_id: { type: "string", enum: TOPIC_IDS, description: "Optional research-topic ID." } },
      required: ["peptide_ids"] },
    annotations: READ_ONLY },
  { name: "get_regulatory_record", title: "Get dated regulatory records",
    description: "Returns the reviewed regulatory records for one peptide in one supported jurisdiction, each with its primary document URL, the date it was checked, and its review due date. Approval, off-label use, compounding and enforcement are kept distinct; a record past its due date serves no current-status conclusion. Supported jurisdictions: \"US\" and \"sport_wada\".",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        peptide_id: { type: "string", enum: PIDS, description: "Catalog peptide ID." },
        jurisdiction: { type: "string", enum: ["US", "sport_wada"], description: "\"US\" or \"sport_wada\"." } },
      required: ["peptide_id", "jurisdiction"] },
    annotations: READ_ONLY },
  { name: "get_source_record", title: "Open a source record",
    description: "Opens one approved source by ID: what it is, its primary URL where one is served, when it was checked, and exactly which claims it supports or conflicts with.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        source_id: { type: "string", enum: SOURCE_IDS, description: "Source or study ID from a card, claim, or browse result." } },
      required: ["source_id"] },
    annotations: READ_ONLY },
  { name: "list_peptide_topics", title: "List library topics and reference cards",
    description: "Lists the fixed library: general peptide-science explainers by category (peptide_basics, how_science_works, research_categories, reading_research, regulatory_basics) and the reviewed reference cards (reference_cards). Default category is \"all\".",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        category: { type: "string", enum: ["all", ...TOPIC_CATEGORIES], description: "Library category, or \"all\"." } } },
    annotations: READ_ONLY },
  { name: "get_peptide_explainer", title: "Get one science explainer",
    description: "Returns one fixed, pre-written general explainer from the library by slug (from list_peptide_topics). General education only; names no specific peptide products.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        slug: { type: "string", maxLength: 80, description: "Explainer slug from list_peptide_topics." } },
      required: ["slug"] },
    annotations: READ_ONLY },
  { name: "explain_regulatory_term", title: "Explain a regulatory term",
    description: "Explains one regulatory term in plain language, with what it does not mean.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: {
        term: { type: "string", enum: ["fda_approval", "research_use_only", "prescription_only", "off_label", "clinical_trial_phases", "peer_review", "preprint", "compounded", "investigational"], description: "Regulatory term key." } },
      required: ["term"] },
    annotations: READ_ONLY },
];
const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18"];
const INSTRUCTIONS = "Reviewed, source-backed peptide reference: named-peptide " +
  "cards, a body-system research map, neutral evidence comparisons, and dated " +
  "regulatory records. Education only: no dosing, no sourcing, no personal " +
  "advice. Use search_peptides with names only; open cards and records by the " +
  "catalog IDs the tools return.";

async function handleRpc(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  const result = (value: any) => ({ jsonrpc: "2.0", id, result: value });
  const error = (code: number, message: string) =>
    ({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    switch (method) {
      case "initialize": {
        const want = params?.protocolVersion;
        return result({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(want) ? want : "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "PeptideX Reference Map", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return isNotification ? null : result({});
      case "tools/list":
        return result({ tools: TOOLS });
      case "tools/call": {
        const fn = OPERATIONS[params?.name];
        if (!fn) return error(-32602, "Unknown tool.");
        let data: any;
        try {
          data = fn(params?.arguments ?? {});
        } catch (e) {
          if (e instanceof Rejected) data = e.payload;
          else throw e;
        }
        return result({
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: data,
          isError: false,
        });
      }
      default:
        return isNotification ? null : error(-32601, "Method not found.");
    }
  } catch {
    return isNotification ? null : error(-32603, "Internal error.");
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

interface WorkerEnv {
  OPENAI_APPS_CHALLENGE_TOKEN?: string;
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (req.method === "GET" && path === "/health") {
      return json({ status: "ok", service: "peptidex-reference-map",
                    library_version: LIBRARY_VERSION });
    }
    if (req.method === "GET" && path === "/.well-known/openai-apps-challenge") {
      const token = (env.OPENAI_APPS_CHALLENGE_TOKEN ?? "").trim();
      if (!token) {
        return new Response("challenge token not configured",
          { status: 404, headers: CORS });
      }
      return new Response(token, { headers: { ...CORS, "Content-Type": "text/plain" } });
    }
    if (req.method === "GET") {
      return json({ jsonrpc: "2.0", error: { code: -32000,
        message: "GET not supported on this stateless MCP endpoint; POST JSON-RPC instead." } }, 405);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handleRpc))).filter((x) => x !== null);
      return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    const res = await handleRpc(body);
    return res === null ? new Response(null, { status: 202, headers: CORS }) : json(res);
  },
};
