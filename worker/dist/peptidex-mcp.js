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
// No auth, no user data, no input logging. The MCP surface makes no
// outbound fetch at request time; the single exception in this module is
// the /demo route below, which streams the OpenAI apps demo video from
// this repo (the MP4 is too large to inline into a Worker script).
// Rejected input is never echoed and never stored. Every payload
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

const LIBRARY = {"meta":{"dataset_name":"PeptideX Reference Map — reviewed reference dataset","dataset_version":"2026-11-18.1","build_spec":"PeptideX Reference Map Build Spec v0.2 (18 November 2026)","published_on":"2026-11-18","editorial_reviewer":"loyd (content owner); seed card texts consolidated in document 09 (2026-11-17) after Instinct review fixes","last_review_date":"2026-11-18","seed_peptides":["bpc_157","tb_500","ghk_cu","mots_c"],"exclusions":"An entire class of substances is out of scope for this release by standing decision (build spec v0.2 section 1); no member of that class is named or described anywhere in this dataset. The exclusion stays enforced in the serving layer.","review_cadence":"Regulatory records: recheck weekly and before each release (next_review_due on each record). Evidence: monthly. A regulatory record past its review due date serves no current-status conclusion until rechecked."},"disclaimer":"PeptideX is an educational resource about peptide science. It is not medical advice and does not diagnose, treat, or recommend any substance for any person. It provides no dosing information and does not help anyone obtain any drug or research chemical. Talk to a qualified clinician about any health decision.","supported_jurisdictions":["US","sport_wada"],"body_systems":[{"id":"musculoskeletal","name":"Musculoskeletal","description":"Muscles, tendons, ligaments and bone as research subjects. This is a research map, not a treatment map."},{"id":"skin","name":"Skin","description":"Skin and surface tissues as research subjects, including skin-applied (topical) formulations. This is a research map, not a treatment map."},{"id":"metabolic","name":"Metabolic","description":"Energy, glucose and mitochondrial signaling as research subjects. This is a research map, not a treatment map."},{"id":"digestive","name":"Digestive","description":"The gut and digestive tissues as research subjects. This is a research map, not a treatment map."},{"id":"nervous_system","name":"Nervous system","description":"The nervous system as a research subject. No seed peptide in this release has reviewed claims linked here. This is a research map, not a treatment map."}],"topics":[{"id":"tendon_ligament_injury_models","name":"Tendon and ligament injury models","body_system_ids":["musculoskeletal"],"description":"Laboratory and animal studies of tendon and ligament injury, plus the small human literature that exists. A topic is not a claim of benefit."},{"id":"muscle_injury_models","name":"Muscle injury models","body_system_ids":["musculoskeletal"],"description":"Laboratory and animal studies of muscle injury and repair pathways. A topic is not a claim of benefit."},{"id":"gut_injury_models","name":"Gut injury models","body_system_ids":["digestive"],"description":"Laboratory and animal studies of injury to digestive tissues. A topic is not a claim of benefit."},{"id":"wound_healing_models","name":"Wound healing models","body_system_ids":["musculoskeletal","skin"],"description":"Laboratory, animal and human studies of wound closure and tissue repair, including skin-applied formulations. A topic is not a claim of benefit."},{"id":"metabolic_regulation","name":"Metabolic regulation","body_system_ids":["metabolic"],"description":"Cell and animal studies of energy and glucose regulation pathways. A topic is not a claim of benefit."},{"id":"endogenous_levels_and_exercise","name":"The body's own peptide levels and exercise","body_system_ids":["metabolic"],"description":"Human observational studies measuring peptides the body makes itself, for example before and after exercise. Measuring a level is not a study of administering the substance. A topic is not a claim of benefit."},{"id":"skin_appearance_research","name":"Skin appearance research","body_system_ids":["skin"],"description":"Human studies of skin-applied preparations and skin appearance outcomes. A topic is not a claim of benefit."}],"sources":[{"id":"src_fda_compounding_safety","label":"FDA: Certain Bulk Drug Substances for Use in Compounding that May Present Significant Safety Risks","type":"regulator","url":"https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks","publisher":"U.S. Food and Drug Administration","date_checked":"2026-11-17"},{"id":"src_hhs_503a_policy","label":"HHS: Enforcement Discretion Policy Regarding 503A Compounding Using Certain Peptide Bulk Drug Substances, incl. Appendix A/B","type":"regulator","url":"https://www.hhs.gov/sites/default/files/hhs-503a-peptide-enforcement-discretion-policy-appendix-b.pdf","publisher":"U.S. Department of Health and Human Services","date_checked":"2026-11-17"},{"id":"src_federal_register_2026_22192","label":"Federal Register notice 2026-22192, October 30, 2026","type":"regulator","url":null,"publisher":"Federal Register","date_checked":"2026-11-17","note":"Cited as text in the reviewed cards; no URL is served for this source."},{"id":"src_wada_prohibited_list","label":"WADA Prohibited List","type":"regulator","url":"https://www.wada-ama.org/en/prohibited-list","publisher":"World Anti-Doping Agency","date_checked":"2026-11-17"},{"id":"src_fda_mots_eval","label":"FDA: Evaluation of MOTS-c bulk drug substances, May 2026","type":"regulator","url":"https://www.fda.gov/media/193347/download","publisher":"U.S. Food and Drug Administration","date_checked":"2026-11-17"},{"id":"src_fda_tb500_eval","label":"FDA: Evaluation of TB-500-related bulk drug substances, May 2026","type":"regulator","url":"https://www.fda.gov/media/193349/download","publisher":"U.S. Food and Drug Administration","date_checked":"2026-11-18"},{"id":"src_fda_503a_nominations","label":"FDA: Bulk Drug Substances Nominated for Use in Compounding Under Section 503A of the Federal Food, Drug, and Cosmetic Act (list updated May 14, 2026)","type":"regulator","url":"https://www.fda.gov/media/94155/download?attachment","publisher":"U.S. Food and Drug Administration","date_checked":"2026-11-18"}],"studies":[{"id":"chang_2011","publication_id":"PMID:21030672","primary_url":"https://pubmed.ncbi.nlm.nih.gov/21030672/","study_type":"laboratory_in_vitro","species":"rat (cells)","population":"Rat tendon cells in culture","sample_size":null,"status":"published","dates":{"year":2011},"intervention_identity":"BPC-157 applied to cultured cells","comparator":"Untreated cultured cells","outcomes_studied":["cell migration","cell survival under stress","FAK-paxillin signaling"],"results_summary":"Researchers reported more cell migration and survival under stress, linked to FAK-paxillin signaling.","limitations":"Cell study only. The mechanism has not been shown in people.","funding_conflicts":null},{"id":"hsieh_2017","publication_id":"PMID:27847966","primary_url":"https://pubmed.ncbi.nlm.nih.gov/27847966/","study_type":"laboratory_and_animal","species":"cell, chick membrane, rat","population":"Cell cultures, chick membrane preparations and rats","sample_size":null,"status":"published","dates":{"year":2017},"intervention_identity":"BPC-157 in laboratory and animal models","comparator":"Control preparations","outcomes_studied":["new blood-vessel formation","VEGFR2 signaling","nitric-oxide system activity"],"results_summary":"Researchers reported new blood-vessel formation linked to VEGFR2 signaling and the nitric-oxide system.","limitations":"Laboratory and animal findings only; not shown in people.","funding_conflicts":null},{"id":"vasireddi_2025","publication_id":"PMID:40756949","primary_url":"https://pubmed.ncbi.nlm.nih.gov/40756949/","study_type":"systematic_review","species":"mixed (literature)","population":"The published musculoskeletal literature on BPC-157","sample_size":null,"status":"published","dates":{"year":2025},"intervention_identity":"BPC-157 (as studied across the reviewed literature)","comparator":null,"outcomes_studied":["evidence base composition"],"results_summary":"The review counted 36 studies of BPC-157 in musculoskeletal research, of which 35 were preclinical and 1 was clinical.","limitations":"A count of study designs is not a finding of benefit; the underlying literature is mostly preclinical and much of it comes from a single research group.","funding_conflicts":null},{"id":"poolton_2026","publication_id":"PMID:42885452","primary_url":"https://pubmed.ncbi.nlm.nih.gov/42885452/","study_type":"systematic_review","species":"human (literature)","population":"All human evidence on BPC-157 located by the review","sample_size":30,"status":"published","dates":{"year":2026},"intervention_identity":"BPC-157 (as reported in the three underlying human reports)","comparator":null,"outcomes_studied":["human evidence quality and certainty"],"results_summary":"The review found 3 human studies (30 people in total): a retrospective chart review with phone follow-up of 16 patients with knee pain at one clinic (no control group, no validated outcome measures; some also received another peptide), a 12-person retrospective report in interstitial cystitis, and a two-person prospective pilot evaluating the safety of intravenous BPC-157, all three from the same clinician. It rated them poor quality and the overall certainty of evidence very low.","limitations":"The underlying reports lacked control groups and validated measures and were small.","funding_conflicts":null},{"id":"lee_2015","publication_id":"PMID:25738459","primary_url":"https://pubmed.ncbi.nlm.nih.gov/25738459/","study_type":"laboratory_and_animal","species":"mouse and cell","population":"Mice and cell systems in the first description of MOTS-c","sample_size":null,"status":"published","dates":{"year":2015},"intervention_identity":"MOTS-c in cell and mouse models","comparator":"Control animals and preparations","outcomes_studied":["folate cycle and purine synthesis pathways","AMPK activation","diet-related metabolic changes in mice"],"results_summary":"Researchers reported that MOTS-c acts mainly on skeletal muscle in mice and affects the folate cycle and purine synthesis, leading to activation of the enzyme AMPK.","limitations":"Mouse and cell findings only. FDA's evaluation notes that the molecular target through which MOTS-c acts remains unknown. Not shown in people.","funding_conflicts":"Some researchers on the early MOTS-c studies disclosed financial ties to a company developing related compounds."},{"id":"reynolds_2021","publication_id":"PMID:33473109","primary_url":"https://pubmed.ncbi.nlm.nih.gov/33473109/","study_type":"laboratory_and_animal","species":"mouse; human observational component","population":"Mice of different ages; human measurements of the body's own MOTS-c around exercise","sample_size":null,"status":"published","dates":{"year":2021},"intervention_identity":"MOTS-c in mouse models; measurement of endogenous MOTS-c in people","comparator":"Control animals; resting measurements","outcomes_studied":["age-related metabolic changes in mice","physical performance in mice","the body's own MOTS-c levels in muscle and blood around exercise"],"results_summary":"Mouse studies reported effects on diet-related and age-related metabolic changes and on physical performance in young, middle-aged and old mice. A human component reported exercise-related increases in the body's own MOTS-c in muscle and blood.","limitations":"The human component measured the MOTS-c the body makes itself; it does not establish the effects or safety of MOTS-c given as a preparation. Mouse findings may not apply to people.","funding_conflicts":"Some researchers on the early MOTS-c studies disclosed financial ties to a company developing related compounds."},{"id":"vonwalden_2021","publication_id":"PMID:34351816","primary_url":"https://pubmed.ncbi.nlm.nih.gov/34351816/","study_type":"human_observational","species":"human","population":"30 adults in an endurance-exercise study","sample_size":30,"status":"published","dates":{"year":2021},"intervention_identity":"No substance administered; measurement of the body's own MOTS-c","comparator":"Baseline measurements","outcomes_studied":["the body's own MOTS-c levels after endurance exercise","link between MOTS-c levels and fitness"],"results_summary":"The study found only a non-significant trend in the body's own MOTS-c after endurance exercise and no link to fitness.","limitations":"Observational measurement of naturally occurring MOTS-c; it cannot show cause and effect and says nothing about administered MOTS-c.","funding_conflicts":null},{"id":"pickart_1973","publication_id":"PMID:4349963","primary_url":"https://pubmed.ncbi.nlm.nih.gov/4349963/","study_type":"laboratory_in_vitro","species":"human (samples)","population":"Human plasma samples in the first description of GHK","sample_size":null,"status":"published","dates":{"year":1973},"intervention_identity":"Identification of the GHK peptide in human plasma","comparator":null,"outcomes_studied":["presence and identity of the peptide"],"results_summary":"First description of the three-amino-acid peptide glycyl-L-histidyl-L-lysine (GHK) in human plasma in the 1970s.","limitations":"An identification study; it is not evidence of any clinical effect.","funding_conflicts":null},{"id":"maquart_1988","publication_id":"PMID:3169264","primary_url":"https://pubmed.ncbi.nlm.nih.gov/3169264/","study_type":"laboratory_in_vitro","species":"cell culture","population":"Fibroblast cells in culture","sample_size":null,"status":"published","dates":{"year":1988},"intervention_identity":"GHK-Cu applied to cultured fibroblasts","comparator":"Untreated cultured cells","outcomes_studied":["collagen production by fibroblasts in culture"],"results_summary":"The study reported increased collagen production by fibroblasts in culture. Early cell studies also proposed that GHK-Cu acts as a carrier that moves copper into cells.","limitations":"Cell-culture findings do not establish clinical effects in people, and these effects have not been established in human tissue.","funding_conflicts":null},{"id":"bishop_1992","publication_id":"PMID:1495150","primary_url":"https://pubmed.ncbi.nlm.nih.gov/1495150/","study_type":"human_randomized_trial","species":"human","population":"Patients with venous stasis ulcers; 86 evaluable patients","sample_size":86,"status":"published","dates":{"year":1992},"intervention_identity":"Tripeptide-copper cream applied to skin","comparator":"Placebo cream","outcomes_studied":["ulcer healing"],"results_summary":"A randomized, evaluator-blinded trial: the tripeptide-copper cream performed no better than placebo.","limitations":"A single older trial in one ulcer type; a null result for this formulation and population.","funding_conflicts":null},{"id":"mulder_1994","publication_id":"PMID:17147644","primary_url":"https://pubmed.ncbi.nlm.nih.gov/17147644/","study_type":"human_randomized_trial","species":"human","population":"Patients with diabetic foot ulcers at multiple centers, all also receiving standardized wound care","sample_size":null,"status":"published","dates":{"year":1994},"intervention_identity":"GHK-Cu gel applied to skin, plus standardized wound care","comparator":"Vehicle gel, plus standardized wound care","outcomes_studied":["ulcer area closure over time"],"results_summary":"A multicenter randomized, evaluator-blinded, placebo-controlled trial: ulcer area closed faster with the gel than with the vehicle gel. That is a measure of area change, not the share of patients healed.","limitations":"The trial was never replicated, and the product never became an approved drug.","funding_conflicts":null},{"id":"miller_2006","publication_id":"PMID:16847171","primary_url":"https://pubmed.ncbi.nlm.nih.gov/16847171/","study_type":"human_randomized_trial","species":"human","population":"People recovering after laser skin resurfacing; 13 people completed","sample_size":13,"status":"published","dates":{"year":2006},"intervention_identity":"GHK-Cu skin products applied to skin after laser resurfacing","comparator":"Comparison skin products","outcomes_studied":["redness","wrinkles","overall skin quality","participant satisfaction"],"results_summary":"A randomized trial: blinded and computer assessments found no differences in redness, wrinkles or overall skin quality. Participants using the GHK-Cu products reported higher satisfaction.","limitations":"Very small sample (13 people completed); satisfaction was self-reported while the blinded assessments were null.","funding_conflicts":null}],"peptides":[{"id":"bpc_157","preferred_name":"BPC-157","aliases":["Body protection compound 157","pentadecapeptide BPC 157","Bepecin","PL 14736","PL-10","PLD-116","BPC157"],"what_it_is":"A synthetic 15-amino-acid peptide derived from a protein described in human gastric juice. It has been studied mainly in laboratory and animal models of tissue injury. Much of the animal literature comes from a single research group, so independent replication is limited.","molecular_identity":"A synthetic 15-amino-acid peptide; a partial sequence of the larger body protection compound protein described in human gastric juice.","not_to_be_confused_with":["The larger body protection compound protein described in gastric juice (BPC-157 is a 15-amino-acid partial sequence of it)","Different salt forms, which regulators treat as different substances","Combination products with other peptides, which are a different thing"],"formulation_route_distinctions":"Different salt forms are treated as different substances by regulators. Combination products with other peptides are not the same as BPC-157 alone.","mechanism":{"status":"proposed","text":"Proposed, from lab and animal studies only: in rat tendon cells, researchers reported more cell migration and survival under stress, linked to FAK-paxillin signaling. In cell, chick-membrane and rat studies, they reported new blood-vessel formation linked to VEGFR2 signaling and the nitric-oxide system. These mechanisms have not been shown in people."},"body_system_ids":["musculoskeletal","digestive"],"research_topic_ids":["tendon_ligament_injury_models","muscle_injury_models","gut_injury_models","wound_healing_models"],"safety_summary":"The human evidence is insufficient to establish safety. The only human reports are three small uncontrolled reports (30 people in total), one of them a two-person prospective pilot that evaluated the safety of intravenous BPC-157; a 2026 systematic review rated the reports poor quality and the overall certainty of evidence very low. FDA states that compounded drugs containing BPC-157 may pose immunogenicity and impurity risks and that the agency lacks sufficient information to know whether the drug would cause harm when administered to humans. The identity and purity of products labeled for research use are not established.","evidence_limitations":"The systematic reviews cited in this dataset located no controlled human data, and the small uncontrolled human reports that exist are insufficient to establish safety. Animal findings may not apply to people. The human reports lacked control groups and validated measures, and were small.","evidence_stage":{"lab":"Yes.","animal":"Yes (mostly rodents).","human":"Three small uncontrolled reports; no published randomized controlled trial was found in the literature searched through 2026-11-17.","limits":"The systematic reviews cited in this dataset located no controlled human data, and the small uncontrolled human reports that exist are insufficient to establish safety. Animal findings may not apply to people. The human reports lacked control groups and validated measures, and were small."},"studied":["Cell and animal studies, mostly in rats, of tendon, muscle, ligament, bone and gut injury models. A 2025 systematic review of the musculoskeletal literature counted 36 studies, of which 35 were preclinical and 1 was clinical.","Human reports are few and small: a retrospective chart review with phone follow-up of 16 patients with knee pain at one clinic (no control group, no validated outcome measures; some also received another peptide), a 12-person retrospective report in interstitial cystitis (a bladder pain condition), and a two-person prospective pilot evaluating the safety of intravenous BPC-157, all three from the same clinician. A 2026 systematic review of all human evidence found these 3 studies (30 people in total), rated them poor quality, and rated the overall certainty of evidence very low.","Small registered studies exist. A trial registration is not evidence that a substance works, and no registered trial had reported results in the sources searched through 2026-11-17."],"not_established":["Effectiveness for any condition in people","Safety in people","Whether lab or animal mechanisms apply in humans","The identity and purity of products labeled for research use"],"source_ids":["src_fda_compounding_safety","src_hhs_503a_policy","src_federal_register_2026_22192","src_wada_prohibited_list","chang_2011","hsieh_2017","vasireddi_2025","poolton_2026"],"publication_version":"1.0","card_version":"2026-11-17","editorial_reviewer":"loyd (content owner); card text from reviewed document 09, verified 2026-11-17","last_review_date":"2026-11-17","next_review_due":"2026-12-17"},{"id":"tb_500","preferred_name":"TB-500","aliases":["TB500"],"what_it_is":"A synthetic seven-amino-acid fragment of thymosin beta-4, a 43-amino-acid protein. TB-500 is a common name, not a USAN (United States Adopted Name), and multiple salts and derivatives are sold under the name. FDA states that TB-500 and thymosin beta-4 are not the same substance.","molecular_identity":"A synthetic seven-amino-acid fragment of the 43-amino-acid protein thymosin beta-4. The name does not map reliably to one molecule in commerce: multiple salts and derivatives are sold under it.","not_to_be_confused_with":["Full-length thymosin beta-4, the 43-amino-acid protein (a different substance; the human trials in this area tested the full-length protein)","The non-acetylated form used in the fragment's animal studies, whose profile FDA says cannot be extrapolated to TB-500","Other salts and derivatives sold under the same common name"],"formulation_route_distinctions":"Fragment versus full-length protein is the central distinction: most of the evidence in this area concerns the full-length protein, not the fragment. Salt and derivative forms sold under the name also differ from one another.","mechanism":{"status":"proposed","text":"No mechanism has been established for TB-500 itself. Claims made for the fragment borrow from research on full-length thymosin beta-4, a different substance. The one direct in-vitro test of TB-500 itself located in FDA's evaluation did not outperform control."},"body_system_ids":["musculoskeletal","skin"],"research_topic_ids":["wound_healing_models"],"safety_summary":"FDA's evaluation of TB-500 bulk substances (May 2026) documents safety concerns for specified peptide substances and routes. FDA found no information in the medical literature where TB-500 itself was administered to patients for any condition, so there is no human safety record for the fragment itself. The identity of products sold under the name varies, because multiple salts and derivatives are sold under it.","evidence_limitations":"Most evidence in this area concerns full-length thymosin beta-4, a different substance. The fragment's animal data used a different (non-acetylated) form whose profile FDA says cannot be extrapolated to TB-500. There are no human administration studies of the fragment itself in the sources searched through 2026-11-17.","evidence_stage":{"lab":"One direct in-vitro test of TB-500 itself did not outperform control (per FDA's evaluation).","animal":"Animal data exist for a different (non-acetylated) form; FDA states its profile cannot be extrapolated to TB-500.","human":"None. FDA found no published study in which TB-500 itself was administered to patients for any condition (sources searched through 2026-11-17).","limits":"Most evidence in this area concerns full-length thymosin beta-4, a different substance, and cannot be read as evidence about the fragment."},"studied":["FDA's evaluation records that the human trials in this area tested full-length thymosin beta-4, not TB-500.","The fragment's animal data used a non-acetylated form whose profile FDA says cannot be extrapolated to TB-500.","The one direct in-vitro test of TB-500 itself located in FDA's evaluation did not outperform control."],"not_established":["Any effect of TB-500 itself in people (it has never been administered to patients in any published study located)","Safety of TB-500 itself in people","Equivalence between TB-500 and full-length thymosin beta-4 (FDA states they are not the same substance)","The identity of any specific product sold under the name"],"source_ids":["src_fda_compounding_safety","src_fda_tb500_eval","src_hhs_503a_policy"],"publication_version":"1.0","card_version":"2026-11-17","editorial_reviewer":"loyd (content owner); identity and evidence statements from FDA's evaluation as recorded in reviewed document 09, verified 2026-11-17","last_review_date":"2026-11-17","next_review_due":"2026-12-17"},{"id":"ghk_cu","preferred_name":"GHK-Cu","aliases":["Copper tripeptide-1","prezatide copper","glycyl-L-histidyl-L-lysine copper(II)","GHKCu"],"what_it_is":"A small three-amino-acid peptide (glycine-histidine-lysine) that binds copper. It was first described in human plasma in the 1970s. It is sold as an ingredient in skin-care cosmetics; it is not an approved drug ingredient.","molecular_identity":"The tripeptide glycyl-L-histidyl-L-lysine bound to copper(II).","not_to_be_confused_with":["GHK without copper (the free tripeptide), a different substance; studies of one do not automatically describe the other","Other copper peptides with different amino-acid sequences","Skin-applied cosmetic products versus injectable preparations: every published human study used skin-applied formulations, and FDA's listed concern applies to injectable routes"],"formulation_route_distinctions":"Every published human study used skin-applied (topical) formulations. FDA's compounding position distinguishes routes: GHK-Cu except for injectable routes sits in Category 1 of the 503A nominations (under evaluation), while the injectable form's nomination was withdrawn.","mechanism":{"status":"proposed","text":"Proposed, from cell-culture studies: early cell studies proposed that it acts as a carrier that moves copper into cells, and a 1988 study reported increased collagen production by fibroblasts in culture. Cell-culture findings do not establish clinical effects in people, and these effects have not been established in human tissue."},"body_system_ids":["skin"],"research_topic_ids":["wound_healing_models","skin_appearance_research"],"safety_summary":"The human record is topical only: three small randomized trials from 1992-2006 with mixed results. No published human trial of GHK-Cu given by injection was found in the sources searched through 2026-11-17, and FDA noted possible immunogenicity and impurity concerns and limited human data for compounded injectables. Cosmetic availability is not drug evidence: cosmetics do not undergo FDA premarket approval.","evidence_limitations":"The human trials are old, small, and mixed; the one positive result was never replicated. Much of the review literature comes from the peptide's discoverer and colleagues; the discoverer founded a company selling copper-peptide products, a conflict of interest readers should know about. The three trials in this dataset are the independent human record.","evidence_stage":{"lab":"Yes.","animal":"Yes (rodent wound models; preclinical only).","human":"Topical only: the randomized human studies located by the stated search are three small topical trials from 1992-2006 with mixed results. No published human trial of GHK-Cu given by injection was found in the sources searched through 2026-11-17.","limits":"The human trials are old, small, and mixed; the one positive result was never replicated. Cosmetic availability is not drug evidence."},"studied":["Cell-culture studies of cell growth, copper uptake and collagen production, and rodent wound studies: laboratory and animal work only.","A 1992 randomized, evaluator-blinded trial in venous stasis ulcers (86 evaluable patients): a tripeptide-copper cream performed no better than placebo.","A 1994 multicenter randomized, evaluator-blinded, placebo-controlled trial of a GHK-Cu gel in diabetic foot ulcers, with all patients also receiving standardized wound care: ulcer area closed faster with the gel than with the vehicle gel. That is a measure of area change, not the share of patients healed; the trial was never replicated, and the product never became an approved drug.","A 2006 randomized trial after laser skin resurfacing (13 people completed): blinded and computer assessments found no differences in redness, wrinkles or overall skin quality. Participants using the GHK-Cu products reported higher satisfaction.","Much of the review literature comes from the peptide's discoverer and colleagues; the discoverer founded a company selling copper-peptide products, a conflict of interest readers should know about. The three trials above are the independent human record."],"not_established":["Any benefit beyond the mixed topical record described in this card","Any effect or safety of injected GHK-Cu in people","Long-term outcomes of any use"],"source_ids":["src_fda_compounding_safety","src_fda_503a_nominations","pickart_1973","maquart_1988","bishop_1992","mulder_1994","miller_2006"],"publication_version":"1.0","card_version":"2026-11-17","editorial_reviewer":"loyd (content owner); card text from reviewed document 09, verified 2026-11-17","last_review_date":"2026-11-17","next_review_due":"2026-12-17"},{"id":"mots_c","preferred_name":"MOTS-c","aliases":["Mitochondrial open reading frame of the 12S rRNA-c","mitochondria-derived peptide MOTS-c","MOTSc"],"what_it_is":"A 16-amino-acid peptide encoded in mitochondrial DNA rather than nuclear DNA. It was first described in 2015 and is studied as a possible signaling molecule in metabolism. It is a research compound, not a medicine.","molecular_identity":"A 16-amino-acid peptide encoded by an open reading frame in the mitochondrial 12S rRNA region of mitochondrial DNA.","not_to_be_confused_with":["Humanin and other mitochondrial-derived peptides","The MOTS-c the body makes itself (measured in blood or muscle) versus MOTS-c given as a substance: different questions, different evidence","CB4211, a chemically modified analogue developed from MOTS-c, which is a separate molecule; its results are not MOTS-c results","Different salt forms, which regulators treat as different substances"],"formulation_route_distinctions":"Measurements of the body's own MOTS-c do not establish the effects or safety of an administered preparation. An analogue's results are not MOTS-c results. Different salt forms are treated as different substances by regulators.","mechanism":{"status":"proposed","text":"Proposed, from mouse and cell studies: researchers reported that it acts mainly on skeletal muscle in mice and affects the folate cycle and purine synthesis, leading to activation of the enzyme AMPK. FDA's evaluation notes that the molecular target through which MOTS-c acts remains unknown. These mechanisms have not been shown in people."},"body_system_ids":["metabolic"],"research_topic_ids":["metabolic_regulation","endogenous_levels_and_exercise"],"safety_summary":"There is no human safety record for MOTS-c given as a substance: FDA's May 2026 evaluation did not identify clinical studies evaluating administration of MOTS-c in human subjects and had not identified any human exposure data for drug products containing MOTS-c by any route. What a person's own blood level of MOTS-c means for their health is not established.","evidence_limitations":"Mouse findings may not apply to people. Observational human data cannot show cause and effect, and the human data measure the body's own MOTS-c, not an administered preparation.","evidence_stage":{"lab":"Yes.","animal":"Yes (mice).","human":"Observational measurements of naturally occurring MOTS-c only; no completed human study of MOTS-c given as a substance was identified in the sources searched through 2026-11-17.","limits":"Mouse findings may not apply to people. Observational human data cannot show cause and effect."},"studied":["Mouse studies of diet-related and age-related metabolic changes and of physical performance in young, middle-aged and old mice. Findings were reported in mice only.","Human studies that measured the body's own MOTS-c levels, for example before and after exercise. Results are mixed: one study reported exercise-related increases in muscle and blood, and another (30 adults) found only a non-significant trend after endurance exercise and no link to fitness. These are measurements of the MOTS-c the body makes itself; they do not establish the effects or safety of MOTS-c given as a preparation.","Some researchers on the early studies disclosed financial ties to a company developing related compounds."],"not_established":["Any effect of MOTS-c given to people","Safety in people","Whether mouse findings carry over to humans","What a person's blood level of MOTS-c means for their health"],"source_ids":["src_fda_mots_eval","src_fda_compounding_safety","src_hhs_503a_policy","src_federal_register_2026_22192","src_wada_prohibited_list","lee_2015","reynolds_2021","vonwalden_2021"],"publication_version":"1.0","card_version":"2026-11-17","editorial_reviewer":"loyd (content owner); card text from reviewed document 09, verified 2026-11-17","last_review_date":"2026-11-17","next_review_due":"2026-12-17"}],"claims":[{"id":"bpc_claim_tendon_cells","peptide_id":"bpc_157","topic_id":"tendon_ligament_injury_models","statement":"In rat tendon cells in culture, BPC-157 was reported to increase cell migration and survival under stress, linked to FAK-paxillin signaling.","supporting_study_ids":["chang_2011"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"laboratory/animal only","uncertainty":"Cell findings only; the mechanism has not been shown in people.","editorial_review":"loyd, 2026-11-17; bounded to the cited study's system and design."},{"id":"bpc_claim_vessel_formation","peptide_id":"bpc_157","topic_id":"wound_healing_models","statement":"In cell, chick-membrane and rat studies, BPC-157 was reported to promote new blood-vessel formation, linked to VEGFR2 signaling and the nitric-oxide system.","supporting_study_ids":["hsieh_2017"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"laboratory/animal only","uncertainty":"Laboratory and animal findings only; not shown in people.","editorial_review":"loyd, 2026-11-17; bounded to the cited study's systems."},{"id":"bpc_claim_human_reports","peptide_id":"bpc_157","topic_id":"tendon_ligament_injury_models","statement":"The human evidence consists of three small uncontrolled reports (30 people in total, including a 16-patient retrospective chart review in knee pain); a 2026 systematic review rated them poor quality and the overall certainty of evidence very low.","supporting_study_ids":["poolton_2026"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"early human","uncertainty":"No control groups and no validated outcome measures in the underlying reports; all three reports came from the same clinician.","editorial_review":"loyd, 2026-11-17; statement reports the review's own ratings."},{"id":"bpc_claim_no_controlled_human","peptide_id":"bpc_157","topic_id":"muscle_injury_models","statement":"No published randomized controlled trial of BPC-157 in humans was found in the literature searched through 2026-11-17; a 2025 systematic review of the musculoskeletal literature counted 36 studies, of which 35 were preclinical and 1 was clinical.","supporting_study_ids":["poolton_2026","vasireddi_2025"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"not established","uncertainty":"Scoped to the published literature and registries searched through 2026-11-17.","editorial_review":"loyd, 2026-11-17; absence claim scoped to the stated search and date."},{"id":"mots_claim_mouse_metabolic","peptide_id":"mots_c","topic_id":"metabolic_regulation","statement":"In mice, MOTS-c was reported to affect diet-related and age-related metabolic changes and physical performance, with a proposed pathway through the folate cycle, purine synthesis and AMPK activation in skeletal muscle.","supporting_study_ids":["lee_2015","reynolds_2021"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"laboratory/animal only","uncertainty":"Mouse and cell findings only; FDA notes the molecular target remains unknown; not shown in people.","editorial_review":"loyd, 2026-11-17; mechanism labeled proposed, as in the reviewed card."},{"id":"mots_claim_exercise_levels","peptide_id":"mots_c","topic_id":"endogenous_levels_and_exercise","statement":"Human studies measuring the body's own MOTS-c around exercise report mixed results: one reported exercise-related increases in muscle and blood, while a study of 30 adults found only a non-significant trend after endurance exercise and no link to fitness.","supporting_study_ids":["reynolds_2021"],"conflicting_study_ids":["vonwalden_2021"],"supporting_source_ids":[],"human_evidence_category":"early human","uncertainty":"Small observational studies with conflicting results. These measurements concern the MOTS-c the body makes itself, not MOTS-c given as a preparation.","editorial_review":"loyd, 2026-11-17; supporting and conflicting studies both cited, per the reviewed card."},{"id":"mots_claim_administered_not_established","peptide_id":"mots_c","topic_id":"metabolic_regulation","statement":"No completed human study of MOTS-c administered as a substance was identified in the sources searched through 2026-11-17. FDA's May 2026 evaluation did not identify clinical studies evaluating administration of MOTS-c in human subjects and had not identified any human exposure data for drug products containing MOTS-c by any route.","supporting_study_ids":[],"conflicting_study_ids":[],"supporting_source_ids":["src_fda_mots_eval"],"human_evidence_category":"not established","uncertainty":"Scoped to the sources searched through 2026-11-17 and to FDA's May 2026 evaluation.","editorial_review":"loyd, 2026-11-17; rests on the regulator's own evaluation."},{"id":"ghk_claim_ulcer_trials","peptide_id":"ghk_cu","topic_id":"wound_healing_models","statement":"In skin-applied (topical) trials of GHK-Cu for ulcers, results were mixed: a 1992 randomized trial in venous stasis ulcers (86 evaluable patients) found a tripeptide-copper cream no better than placebo, while a 1994 multicenter randomized trial in diabetic foot ulcers reported faster ulcer-area closure with a GHK-Cu gel than with vehicle, an area measure rather than the share of patients healed.","supporting_study_ids":["mulder_1994"],"conflicting_study_ids":["bishop_1992"],"supporting_source_ids":[],"human_evidence_category":"controlled human","uncertainty":"Old, small trials with conflicting results; the one positive result was never replicated and the product never became an approved drug.","editorial_review":"loyd, 2026-11-17; null and positive results stated side by side."},{"id":"ghk_claim_resurfacing_null","peptide_id":"ghk_cu","topic_id":"skin_appearance_research","statement":"In a 2006 randomized trial after laser skin resurfacing (13 people completed), blinded and computer assessments found no differences in redness, wrinkles or overall skin quality with GHK-Cu products; participants reported higher satisfaction.","supporting_study_ids":["miller_2006"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"controlled human","uncertainty":"Very small sample; the blinded assessments were null while self-reported satisfaction was higher.","editorial_review":"loyd, 2026-11-17; null result stated as the finding."},{"id":"ghk_claim_cell_culture","peptide_id":"ghk_cu","topic_id":"skin_appearance_research","statement":"In cell culture, GHK-Cu was reported to increase collagen production by fibroblasts (1988), and early cell studies proposed it acts as a carrier moving copper into cells. Cell-culture findings do not establish clinical effects in people.","supporting_study_ids":["maquart_1988","pickart_1973"],"conflicting_study_ids":[],"supporting_source_ids":[],"human_evidence_category":"laboratory/animal only","uncertainty":"Cell-culture findings only; not established in human tissue.","editorial_review":"loyd, 2026-11-17; includes the reviewed card's explicit limitation."},{"id":"ghk_claim_injectable_not_established","peptide_id":"ghk_cu","topic_id":"wound_healing_models","statement":"No published human trial of GHK-Cu given by injection was found in the sources searched through 2026-11-17; every published human study used skin-applied formulations.","supporting_study_ids":[],"conflicting_study_ids":[],"supporting_source_ids":["src_fda_compounding_safety"],"human_evidence_category":"not established","uncertainty":"Scoped to the sources searched through 2026-11-17.","editorial_review":"loyd, 2026-11-17; absence claim scoped to the stated search and date."},{"id":"tb500_claim_no_human_administration","peptide_id":"tb_500","topic_id":"wound_healing_models","statement":"TB-500 itself has never been administered to patients in any published study located in the sources searched through 2026-11-17; FDA found no information in the medical literature where TB-500 itself was administered to patients for any condition. The human trials in this area tested full-length thymosin beta-4, a different substance.","supporting_study_ids":[],"conflicting_study_ids":[],"supporting_source_ids":["src_fda_compounding_safety","src_fda_tb500_eval"],"human_evidence_category":"not established","uncertainty":"Scoped to FDA's evaluation and the sources searched through 2026-11-17.","editorial_review":"loyd, 2026-11-17; rests on FDA's evaluation as recorded in reviewed document 09."},{"id":"tb500_claim_fragment_distinction","peptide_id":"tb_500","topic_id":"wound_healing_models","statement":"TB-500 is a seven-amino-acid fragment of the 43-amino-acid protein thymosin beta-4, and FDA states the two are not the same substance. The fragment's animal data used a different (non-acetylated) form whose profile FDA says cannot be extrapolated to TB-500, and the one direct in-vitro test of TB-500 itself located in FDA's evaluation did not outperform control.","supporting_study_ids":[],"conflicting_study_ids":[],"supporting_source_ids":["src_fda_compounding_safety","src_fda_tb500_eval"],"human_evidence_category":"not established","uncertainty":"Identity and evidence statements rest on FDA's evaluation; the name also covers multiple salts and derivatives in commerce.","editorial_review":"loyd, 2026-11-17; fragment discipline applied per build spec v0.2 section 1."}],"regulatory":[{"id":"reg_bpc_us_fda","peptide_id":"bpc_157","jurisdiction":"US","regulator":"U.S. Food and Drug Administration (FDA)","substance_formulation":"BPC-157, bulk drug substance for compounding","approved_indication":null,"approval_status":"Not an FDA-approved drug. BPC-157 is not on the 503A bulks list.","investigational_status":"No approved product exists. FDA states it lacks sufficient information to know whether the drug would cause harm when administered to humans.","compounding_framework":"BPC-157 was removed from FDA's Category 2 safety-risk list in April 2026 when its 503A nomination was withdrawn (FDA's 503A nominations list); removal is not approval and BPC-157 is not on the 503A bulks list. FDA's compounding safety page states compounded drugs containing BPC-157 may pose immunogenicity and impurity risks.","enforcement_policy_status":"See the separate HHS record for the October 2026 draft enforcement-discretion policy, which names BPC-157 in its Appendix A.","primary_document_url":"https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks","document_issue_date":null,"document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; verified against the regulator's own text (document 09)","uncertainty_flags":[],"notes":"An enforcement or compounding position is not an approval. Status fields verified 2026-11-17."},{"id":"reg_bpc_us_hhs","peptide_id":"bpc_157","jurisdiction":"US","regulator":"U.S. Department of Health and Human Services (HHS)","substance_formulation":"BPC-157, as listed in Appendix A of the HHS enforcement-discretion policy","approved_indication":null,"approval_status":"Not an approval. HHS states compounded drugs are not FDA-approved, and the policy is not binding.","investigational_status":null,"compounding_framework":"The policy concerns 503A compounding by certain state-licensed pharmacies, federal facilities and licensed physicians under strict conditions while FDA rulemaking proceeds.","enforcement_policy_status":"Draft, interim enforcement-discretion policy (October 2026): HHS states it does not intend to take enforcement action against certain state-licensed pharmacies, federal facilities and licensed physicians compounding a specified form under strict conditions while FDA rulemaking proceeds. This is not an approval, and not permission to obtain or use anything.","primary_document_url":"https://www.hhs.gov/sites/default/files/hhs-503a-peptide-enforcement-discretion-policy-appendix-b.pdf","document_issue_date":"2026-10-30","document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; read from the HHS policy document itself (document 09)","uncertainty_flags":["draft_policy_not_final","non_binding"],"notes":"Federal Register notice 2026-22192 (October 30, 2026) accompanies the policy. A draft or announced policy is not an effective final rule or an FDA approval."},{"id":"reg_bpc_wada","peptide_id":"bpc_157","jurisdiction":"sport_wada","regulator":"World Anti-Doping Agency (WADA)","substance_formulation":"BPC-157","approved_indication":null,"approval_status":"Named in class S0 of the WADA Prohibited List: prohibited at all times in sport.","investigational_status":null,"compounding_framework":null,"enforcement_policy_status":null,"primary_document_url":"https://www.wada-ama.org/en/prohibited-list","document_issue_date":null,"document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; verified against the WADA Prohibited List (document 09)","uncertainty_flags":[],"notes":"Sport eligibility is a separate question from drug approval."},{"id":"reg_mots_us_fda","peptide_id":"mots_c","jurisdiction":"US","regulator":"U.S. Food and Drug Administration (FDA)","substance_formulation":"MOTS-c, bulk drug substances","approved_indication":null,"approval_status":"Not an FDA-approved drug, and not on the 503A bulks list. FDA's 503A nominations list records MOTS-c's nomination as withdrawn (April 2026); MOTS-c does not appear on FDA's compounding safety page.","investigational_status":"In its May 2026 evaluation of MOTS-c bulk substances, FDA stated that it did not identify clinical studies evaluating administration of MOTS-c in human subjects, and that it had not identified any human exposure data for drug products containing MOTS-c by any route.","compounding_framework":"See approval_status: nominated but withdrawn; not on the 503A bulks list.","enforcement_policy_status":"See the separate HHS record for the October 2026 draft enforcement-discretion policy, which names MOTS-c in its Appendix A.","primary_document_url":"https://www.fda.gov/media/193347/download","document_issue_date":"2026-05-11","document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; verified against FDA's evaluation (document 09)","uncertainty_flags":[],"notes":"FDA's evaluation is dated May 2026 and is kept distinct from HHS's later (October 2026) discussion; see the conflict note on the HHS record."},{"id":"reg_mots_us_hhs","peptide_id":"mots_c","jurisdiction":"US","regulator":"U.S. Department of Health and Human Services (HHS)","substance_formulation":"MOTS-c, as listed in Appendix A of the HHS enforcement-discretion policy","approved_indication":null,"approval_status":"Not an approval. HHS states compounded drugs are not FDA-approved, and the policy is not binding.","investigational_status":null,"compounding_framework":"The policy concerns 503A compounding by certain licensed compounders under strict conditions while FDA rulemaking proceeds.","enforcement_policy_status":"Draft, interim, non-binding enforcement-discretion policy (October 2026): HHS states it does not intend to take enforcement action against certain licensed compounders under strict conditions while rulemaking proceeds. This is not an approval, and not permission to obtain or use anything.","primary_document_url":"https://www.hhs.gov/sites/default/files/hhs-503a-peptide-enforcement-discretion-policy-appendix-b.pdf","document_issue_date":"2026-10-30","document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; read from the HHS policy document itself (document 09)","uncertainty_flags":["draft_policy_not_final","non_binding","conflicts_with_fda_evaluation"],"notes":"Conflict flag: HHS's discussion, written later than FDA's May 2026 evaluation, described documented historical use of compounded MOTS-c and cited a trial of a modified MOTS-c analogue, a different molecule. That discussion does not change FDA's finding about MOTS-c itself, recorded in the FDA record."},{"id":"reg_mots_wada","peptide_id":"mots_c","jurisdiction":"sport_wada","regulator":"World Anti-Doping Agency (WADA)","substance_formulation":"MOTS-c","approved_indication":null,"approval_status":"Named in class S4.4.1 of the WADA Prohibited List (AMPK activators): prohibited at all times in sport.","investigational_status":null,"compounding_framework":null,"enforcement_policy_status":null,"primary_document_url":"https://www.wada-ama.org/en/prohibited-list","document_issue_date":null,"document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; verified against the WADA Prohibited List (document 09)","uncertainty_flags":[],"notes":"Sport eligibility is a separate question from drug approval."},{"id":"reg_ghk_us_fda","peptide_id":"ghk_cu","jurisdiction":"US","regulator":"U.S. Food and Drug Administration (FDA)","substance_formulation":"GHK-Cu (distinguished by route: skin-applied versus injectable)","approved_indication":null,"approval_status":"No FDA-approved drug product contains GHK-Cu. Its lawful consumer presence is as a cosmetic ingredient; cosmetics do not undergo FDA premarket approval, so being sold in a cream is not a drug finding.","investigational_status":null,"compounding_framework":"GHK-Cu except for injectable routes sits in Category 1 of FDA's 503A nominations: under evaluation under an interim policy, which is not approval and not placement on the 503A bulks list. The injectable form's nomination was withdrawn, with FDA noting possible immunogenicity and impurity concerns and limited human data for compounded injectables.","enforcement_policy_status":"GHK-Cu is not among the substances in HHS's October 2026 draft enforcement-discretion policy.","primary_document_url":"https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks","document_issue_date":null,"document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; verified against FDA's compounding safety page and 503A nominations list (document 09)","uncertainty_flags":["interim_category_under_evaluation"],"notes":"Route matters: the Category 1 position excludes injectable routes. Category 1 is an interim evaluation status, not approval."},{"id":"reg_tb500_us_fda","peptide_id":"tb_500","jurisdiction":"US","regulator":"U.S. Food and Drug Administration (FDA)","substance_formulation":"TB-500, bulk drug substance (a seven-amino-acid fragment of thymosin beta-4; not the full-length protein)","approved_indication":null,"approval_status":"Not an FDA-approved drug. No FDA-approved product contains TB-500.","investigational_status":"FDA's evaluation of TB-500 bulk substances (May 2026) found no information in the medical literature where TB-500 itself was administered to patients for any condition.","compounding_framework":"FDA's compounding safety page addresses TB-500 among specified peptide substances whose use in compounding may present significant safety risks. A safety page is not a complete legal-status determination.","enforcement_policy_status":"See the separate HHS record for the October 2026 draft enforcement-discretion policy, which names TB-500 in its Appendix A.","primary_document_url":"https://www.fda.gov/media/193349/download","document_issue_date":"2026-05-15","document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; from FDA's evaluation and compounding safety page (document 09 and build spec v0.2 source basis)","uncertainty_flags":[],"notes":"FDA states TB-500 and thymosin beta-4 are not the same substance; status statements here concern the fragment only."},{"id":"reg_tb500_us_hhs","peptide_id":"tb_500","jurisdiction":"US","regulator":"U.S. Department of Health and Human Services (HHS)","substance_formulation":"TB-500, as listed in Appendix A of the HHS enforcement-discretion policy","approved_indication":null,"approval_status":"Not an approval. HHS states compounded drugs are not FDA-approved, and the policy is not binding.","investigational_status":null,"compounding_framework":"The policy concerns 503A compounding by certain state-licensed pharmacies, federal facilities and licensed physicians under strict conditions while FDA rulemaking proceeds.","enforcement_policy_status":"Draft, interim enforcement-discretion policy (October 2026): HHS states it does not intend to take enforcement action against certain state-licensed pharmacies, federal facilities and licensed physicians compounding a specified form under strict conditions while FDA rulemaking proceeds. This is not an approval, and not permission to obtain or use anything.","primary_document_url":"https://www.hhs.gov/sites/default/files/hhs-503a-peptide-enforcement-discretion-policy-appendix-b.pdf","document_issue_date":"2026-10-30","document_effective_date":null,"document_expiry_date":null,"date_checked":"2026-11-17","next_review_due":"2026-11-24","reviewer":"loyd; Appendix A membership read from the HHS policy document (document 09 review notes)","uncertainty_flags":["draft_policy_not_final","non_binding"],"notes":"Inclusion in the draft policy's Appendix A is an enforcement-discretion statement only; it does not change the fragment's approval status and does not merge TB-500 with thymosin beta-4."}],"explainers":[{"slug":"what-is-a-peptide","category":"peptide_basics","title":"What is a peptide?","summary":"A peptide is a short chain of amino acids — a small, precise message molecule the body makes and uses constantly.","body":"A peptide is a short chain of amino acids — the same building blocks that make up proteins. If a protein is a long paragraph, a peptide is a short phrase: typically a few to a few dozen amino acids linked in a specific order. The order is the whole point. Change one link in the chain and the message the molecule carries changes with it.\n\nThe body makes thousands of peptides on its own. Many act as messengers: released in one place, they travel to cells elsewhere and instruct them — release another substance, grow, repair, stand down. Others are fragments of ordinary proteins, including the pieces digestion creates from the protein in food.\n\nScientists study peptides because they are precise. A peptide usually fits one kind of receptor — a docking site on a cell — the way a key fits one lock, so its signal is specific rather than broad. That precision comes with fragility: the body is full of enzymes whose job is to dismantle peptides, and most are broken down within minutes. Peptides are, by design, temporary signals.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard biochemistry references (e.g., Lehninger Principles of Biochemistry) and National Institutes of Health educational resources."},{"slug":"how-peptides-signal","category":"peptide_basics","title":"How peptides work as signals in the body","summary":"Signaling peptides bind to specific receptors on cells, triggering brief, amplified cascades — pulses, not permanent states.","body":"Cells coordinate chemically, and peptides are one of the body's main messaging systems. A signaling peptide is released by one cell, drifts through the fluid around cells or rides the bloodstream, and binds to a receptor — a docking site on a target cell shaped for that particular signal.\n\nBinding switches the receptor on. The receptor triggers a cascade inside the cell, and the cell changes its behavior: it may release signals of its own, take up nutrients, divide, or quiet down. Three features of this system matter for understanding the science.\n\nFirst, specificity: a signal fits its own receptor, not others, so messages are addressed rather than broadcast. Second, amplification: one binding event can set off a chain that affects many molecules, so a tiny amount of signal can have a large — but still controlled — effect. Third, brevity: enzymes dismantle signaling peptides quickly, so signals arrive as pulses. The body turns them off as deliberately as it turns them on.\n\nResearchers study these pathways first to understand normal physiology. Most published work is about how the system operates, not about intervening in it.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard cell-biology and biochemistry textbook accounts of peptide signaling and receptor function."},{"slug":"peptides-in-everyday-science","category":"peptide_basics","title":"Peptides in everyday science","summary":"Peptides appear wherever proteins do — digestion, skin biology, nature's defenses, food science — each field with its own evidence standards.","body":"Peptides are not exotic laboratory inventions. They show up wherever proteins do, and several ordinary fields of science work with them every day.\n\nDigestion is the most familiar example: breaking down the protein in food produces peptides, some of which the gut absorbs, and researchers study the roles such fragments play in normal physiology. Skin biology involves peptide signals that help coordinate the renewal and maintenance of tissue, an active area of dermatology and materials research. In nature, many organisms produce peptides as part of their defenses, and scientists study those molecules to understand how they interact with microbes under laboratory conditions. Food science and agriculture also work with peptides, as ingredients and as objects of study.\n\nOne caution ties these fields together: the word \"peptide\" on a label names a category of molecule, not a promise of any effect. What matters is the specific evidence for a specific use — which is exactly what the reading-research explainers in this library are for.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard biochemistry references and National Institutes of Health educational resources on proteins and digestion."},{"slug":"how-peptides-are-made-in-a-lab","category":"how_science_works","title":"How peptides are made in a lab","summary":"Research peptides are usually built one amino acid at a time by automated machines — and making the molecule is the easy part of the science.","body":"Most research peptides are built rather than harvested. The standard approach, developed in the second half of the twentieth century and now heavily automated, assembles a peptide one amino acid at a time on a tiny solid support: each building block is added in the intended sequence, the growing chain stays anchored while it is built, and at the end the finished chain is released and cleaned up for use in experiments.\n\nAutomation changed the field. A machine can produce a short, precise sequence quickly, so a laboratory can obtain exactly the molecule it wants to study. Longer and more complex chains are a different story: they can fold wrongly, clump together, or break, and the yield of usable material falls as length grows. Living cells are also used to produce some larger peptide and protein molecules, by giving them the genetic instructions — a different route with its own complications.\n\nHowever a peptide is made, making it is the easy part of the science. The hard part is everything that comes after: showing what it does, in what system, how reliably — and whether any of it survives the move from a dish to a living body.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard biochemistry and peptide-chemistry textbook accounts of solid-phase peptide synthesis."},{"slug":"why-peptides-are-hard-to-study","category":"how_science_works","title":"Why peptides are hard to study","summary":"The body dismantles peptides within minutes, so stability and delivery are the field's central unsolved scientific problems.","body":"Peptides are, by design, temporary. The body treats loose peptides as material to recycle: enzymes in the gut, the blood, and tissues cut them apart, and the kidneys clear the pieces. A peptide that performs beautifully in a dish may last only minutes inside a living system.\n\nThat creates the field's central scientific problem: stability. Researchers study how a sequence might resist breakdown for longer, and how a fragile molecule could reach its intended target intact at all — a delivery problem that remains unsolved for most peptides. It also creates a measurement problem. Experiments in a dish can hold a peptide at concentrations, and for durations, that a body would never sustain, so dish results can look far stronger than anything physiology would allow.\n\nThis is why peptide papers so often end with the same honest sentence in different words: promising in the model, unproven beyond it. The distance between those two statements is most of what peptide science is working on.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard pharmacology and biochemistry textbook accounts of peptide stability and metabolism."},{"slug":"lab-bench-to-approved-medicine","category":"how_science_works","title":"From lab bench to approved medicine: the long road","summary":"Discovery becomes an approved medicine through staged testing over a decade or more — and most candidates fail along the way, by design.","body":"A discovery becomes an approved medicine through a staged process built to answer three questions in order: is it safe enough to test in people, does it do anything measurable, and does that benefit outweigh its risks in real patients?\n\nThe stages run from basic research — what the molecule is and what it does in dishes and animals — into phased human trials: small safety studies first, then larger studies looking for an effect, then large confirmatory trials. After that, a regulator reviews the complete body of data, not the headlines, and decides whether the evidence supports approval for a specific use.\n\nMost candidates fail somewhere along this road. That is the system working as intended, not malfunctioning: the gauntlet exists precisely because early promise is common and real benefit is rare. The journey commonly takes a decade or more, which is why \"being studied\" and \"approved\" are separated by years of evidence rather than by an announcement.\n\nAnything that has not completed this road may be interesting science. It is not an approved medicine, and no label wording changes that.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on U.S. Food and Drug Administration educational materials on the drug development and approval process."},{"slug":"categories-researchers-study","category":"research_categories","title":"Categories of peptides researchers study","summary":"Peptide research is organized by field — signaling, antimicrobial, structural, and others — and a category being studied says nothing about any product.","body":"Researchers organize peptide research by the questions being asked, not by products. A few of the main fields:\n\nSignaling peptides are the molecules cells use to coordinate with one another. Researchers are studying how these pathways work in areas such as metabolism, growth, and repair — mostly basic physiology, in cells and animals.\n\nAntimicrobial peptides are molecules many organisms produce as part of their natural defenses. Researchers are studying how they interact with microbes in laboratory settings, and what those interactions reveal about immunity in general.\n\nStructural peptides are studied for the shapes they form and the materials those shapes can create — a field that belongs as much to materials science as to biology.\n\nOther active areas include peptides in neuroscience, skin biology, and agriculture. Two cautions apply to all of them. A category being studied describes a research question, not a treatment. And in every one of these fields, most of the work is early-stage — the distance from a research category to anything a person could use is the full length of the road described in the explainer on how medicines get approved.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on standard biochemistry references and National Institutes of Health research overviews."},{"slug":"animal-vs-human-studies","category":"research_categories","title":"Animal studies vs human studies: why the gap matters","summary":"A result in a mouse is a result in a mouse — animal work is essential and preclinical, and it cannot substitute for human trials.","body":"A result in a mouse is a result in a mouse. Animal studies are essential science: they reveal mechanisms, flag dangers early, and decide what is worth the cost and risk of testing in people. What they cannot do is substitute for human evidence.\n\nSpecies differ in exactly the ways that matter here. Metabolism differs — a peptide dismantled in minutes by human enzymes may circulate far longer in a rodent. Receptors differ, lifespans differ, and the diseases researchers model in animals are simplified versions of human conditions. Amounts used in animal work are also scaled in ways that do not translate directly to people.\n\nThis is why regulators require phased human trials, and why careful scientists describe animal findings as \"preclinical\": before the clinic, not instead of it. When a headline converts a rodent result into a human promise, it has skipped the very step where most candidates fail — and it has usually skipped it on purpose, because the honest version is less exciting.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on National Institutes of Health guidance on preclinical research and the translation of animal findings."},{"slug":"read-a-study-critically","category":"reading_research","title":"How to read a peptide study critically","summary":"Five checks — system, sample size, controls, what was measured, and who paid — separate a finding worth taking seriously from a headline.","body":"Five checks, in order, will carry you through most research claims.\n\nFirst: what system? A dish, an animal, or people. Each answers a different question, and only the last one is about human beings.\n\nSecond: how many? Tiny samples produce dramatic-looking results by chance. Look for the number of subjects and whether the study was large enough to detect what it claims.\n\nThird: compared to what? Without a control group — and ideally blinding, so neither the subjects nor the people measuring know who received what — apparent improvement may be expectation, the passage of time, or noise.\n\nFourth: what was actually measured? A laboratory marker moving is not the same as a health outcome improving. Results built on substitute measures, presented as if they were outcomes, deserve special skepticism.\n\nFifth: who paid, and where was it published? Funding does not invalidate work, but it is context. And a peer-reviewed journal has had independent experts check the paper; a preprint has not had that check yet.\n\nA study that survives all five checks is worth taking seriously — as one study. What a body of evidence says is a separate question, covered in the explainer on systematic reviews.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on National Institutes of Health and National Library of Medicine guidance on evaluating health research."},{"slug":"red-flags-in-headlines","category":"reading_research","title":"Red flags in peptide headlines","summary":"\"Breakthrough\" language, before-and-after imagery, unnamed sources, and urgency are marketing tells — here is how to spot them.","body":"Certain phrases and devices should slow you down whenever health research is being sold to you.\n\n\"Breakthrough\" and \"miracle.\" Reporting that sounds like advertising usually is advertising.\n\nBefore-and-after imagery. It shows two photographs, not a controlled comparison. It is a marketing device, not evidence — and its presence is itself information about the seller.\n\n\"Clinically studied,\" with no citation. Studied is not shown. The study may be in animals, tiny, unpublished, or about a different molecule entirely.\n\nA single dramatic percentage with no sample size attached. Real findings come with numbers of subjects and measures of uncertainty.\n\nTestimonials in place of data, and urgency — limited offers, expiring discounts — attached to anything health-related.\n\nAnd the quietest red flag: a claim that names no checkable source. Reputable research can always be traced to a paper, a trial-registry entry, or a regulator's record. A headline that cannot survive the five checks in \"How to read a peptide study critically\" is a sales pitch wearing a lab coat.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on National Library of Medicine and U.S. Food and Drug Administration guidance on health claims and misleading marketing."},{"slug":"what-is-a-systematic-review","category":"reading_research","title":"What a systematic review is, and why one study is rarely the answer","summary":"Systematic reviews gather and grade every study on a question — the strongest summary of evidence, and the antidote to cherry-picked single papers.","body":"Single studies disagree. They use different samples, different methods, and different luck — so a literature can contain one paper showing a striking effect and several quieter ones showing none.\n\nA systematic review is the antidote. Researchers define, in advance, a precise question and the rules for finding every study that bears on it. They then gather those studies, grade their quality, and summarize what the whole body of evidence says. Its stricter cousin, the meta-analysis, also pools the numbers statistically. Done well, this is the strongest form of evidence summary there is, because it shows the entire landscape — including the null results and failures that never became headlines.\n\nDone badly, it averages strong and weak studies into false confidence, which is why good reviews grade study quality instead of treating every paper as equal.\n\nThe practical lesson is simple: trust bodies of evidence over single papers. Any claim resting on one small study — however exciting — is a preliminary sketch, not a conclusion.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on National Library of Medicine guidance on systematic reviews and evidence synthesis."},{"slug":"what-fda-approval-means","category":"regulatory_basics","title":"What FDA approval means — and what it doesn't","summary":"Approval is specific: one product, one use, one population, judged on full trial data — and it never transfers to other products or uses.","body":"In the United States, FDA approval means that a specific product, manufactured to a defined standard, has been shown — in adequate, well-controlled trials — to be safe and effective for a specific use, in a specific population, and that its benefits for that use outweigh its known risks.\n\nEvery qualifier in that sentence carries weight. Approval is not a judgment that a molecule is \"good.\" It does not transfer to other uses, other populations, or other products made from similar ingredients. And it is not necessarily permanent: regulators can and do revise or withdraw approvals as new evidence accumulates.\n\nApproval also says nothing about substances that have never been through the process. A published paper is not an approval. A patent is not an approval. A citation count is not an approval. A label reading \"research use only\" is not an approval. And a product being sold is not evidence that it was ever reviewed.\n\nThe regulator keeps public records of what is actually approved. That record — not marketing language — is the ground truth.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on U.S. Food and Drug Administration educational materials on drug approval."},{"slug":"what-research-use-only-means","category":"regulatory_basics","title":"What \"research use only\" actually means","summary":"The label marks laboratory materials, full stop — it is not a loophole for human use and implies no pharmaceutical testing or standards.","body":"\"Research use only\" is a regulatory label for materials supplied for laboratory work: experiments in dishes, instruments, and controlled research settings. It marks the boundary of what the material was made and sold for.\n\nIt is not a loophole. The label does not create a legal category of human use. It does not imply the material was manufactured to pharmaceutical standards. And it does not come with the testing — for identity, purity, sterility, or effect — that approved medicines are required to undergo. Materials under this label have not been evaluated by regulators for use in people.\n\nThat is why the label matters when marketing points the other way. When a seller pairs \"research use only\" with imagery or testimonials suggesting personal use, the label and the marketing contradict each other — and the label is the legally meaningful part.\n\nIn short: research use only means research use only.\n\nThis is general education only. For any question about your own health, talk to a qualified clinician.","sources_note":"Based on U.S. Food and Drug Administration guidance on research-use-only labeling."}],"terms":[{"term":"fda_approval","plain_language":"FDA approval is a U.S. regulator's decision that a specific product, manufactured to a defined standard, has been shown in adequate clinical trials to be safe and effective for a specific use, with its benefits outweighing its known risks for that use.","does_not_mean":"It does not mean a substance or ingredient is approved in general, for other uses, or in other products — and approval is never conferred by a published paper, a patent, a citation count, or the fact that something is being sold."},{"term":"research_use_only","plain_language":"A label for materials supplied solely for laboratory research. It defines the legal purpose of the material: experiments in controlled research settings, not use in or on people.","does_not_mean":"It is not a loophole for human use, not a quality grade, and not evidence that the material was made or tested to pharmaceutical standards."},{"term":"prescription_only","plain_language":"A legal category for medicines that may be supplied to a patient only under a clinician's prescription, because using them safely requires professional judgment and monitoring.","does_not_mean":"It does not mean the medicine is stronger, better, or more desirable than a non-prescription option. The category describes a legal safeguard, not a ranking of quality or power."},{"term":"off_label","plain_language":"Off-label use is when a clinician prescribes an approved medicine for a use, population, or form that the regulator did not approve. The practice is legal and sometimes supported by evidence, but that particular use has not itself passed the approval process.","does_not_mean":"It does not mean the use is approved, endorsed by the regulator, or backed by the same level of trial evidence as the approved use."},{"term":"clinical_trial_phases","plain_language":"The staged testing of a candidate medicine in people. Phase 1 checks basic safety in a small group. Phase 2 explores whether the candidate shows an effect, and at what cost in side effects. Phase 3 confirms benefit and risk in a large group. Only after these stages can a regulator consider approval.","does_not_mean":"Being \"in trials\" — even in Phase 3 — does not mean a product works or will be approved. Most candidates fail somewhere along the way."},{"term":"peer_review","plain_language":"The process in which independent experts in the same field examine a study before a journal publishes it, checking its methods, analysis, and whether its conclusions follow from its data. It is a quality filter.","does_not_mean":"It does not mean the findings are proven true. Peer-reviewed papers can be wrong and are sometimes retracted — and work that has not been through review at all, such as a preprint, has not yet had even that check."},{"term":"preprint","plain_language":"A complete study manuscript posted publicly before peer review, so other researchers can read and respond to it early. Preprints are labeled as not yet peer-reviewed.","does_not_mean":"A preprint is not a published, vetted finding. Its numbers and conclusions may change — or the work may be withdrawn — after review, so it should be read with extra caution."},{"term":"compounded","plain_language":"Compounding is when a pharmacy prepares a customized version of a medicine for an individual patient's prescription — for example, when a patient cannot use the standard manufactured form. Compounded preparations are not FDA-approved as finished products.","does_not_mean":"It does not mean a compounded preparation has passed the FDA approval process. This explainer states the regulatory fact only; it makes no claim about any compounded product's safety, quality, or effects."},{"term":"investigational","plain_language":"\"Investigational\" describes a substance that researchers are studying but that no regulator has approved for any medical use. It may be tested in a laboratory, in animals, or — only inside regulated clinical trials — in people. The word names a status: being studied is not the same as being approved, available, or shown to work.","does_not_mean":"It does not mean the substance is safe, effective, legally available as a treatment, or likely to be approved. Most investigational substances never become approved medicines, and material sold outside regulated trials is not the product the researchers studied."}],"topic_categories":["peptide_basics","how_science_works","research_categories","reading_research","regulatory_basics","reference_cards"],"index_notes":{"tb_500":"TB-500 is a laboratory fragment of the protein thymosin beta-4 — not the same substance. It has never been studied in humans, and it is not an approved medicine."}};

const LIB      = LIBRARY;
const DISCLAIMER         = LIB.disclaimer;
const LIBRARY_VERSION         = LIB.meta.dataset_version;

const PEPTIDES                      = Object.fromEntries(LIB.peptides.map((p     ) => [p.id, p]));
const STUDIES                      = Object.fromEntries(LIB.studies.map((s     ) => [s.id, s]));
const SOURCES                      = Object.fromEntries(LIB.sources.map((s     ) => [s.id, s]));
const SYSTEMS                      = Object.fromEntries(LIB.body_systems.map((s     ) => [s.id, s]));
const TOPICS                      = Object.fromEntries(LIB.topics.map((t     ) => [t.id, t]));
const EXPLAINERS                      = Object.fromEntries(LIB.explainers.map((e     ) => [e.slug, e]));
const TERMS                      = Object.fromEntries(LIB.terms.map((t     ) => [t.term, t]));
const EVIDENCE_CATEGORIES = ["laboratory/animal only", "early human", "controlled human", "not established"];
const CARD_SECTIONS = ["all", "identity", "evidence", "regulatory", "sources"];
const TOPIC_CATEGORIES           = LIB.topic_categories;

const GENERIC_FIELD_ERROR = "The request included fields this operation does not " +
  "accept, or a required field was missing or had the wrong type. Send only the documented fields.";
const GENERIC_VALUE_ERROR = "A value in the request is not in this operation's " +
  "reviewed catalog. Use the catalog identifiers returned by the browse and search operations.";

class Rejected extends Error {
  payload     ;
  constructor(payload     ) { super(payload?.error ?? "rejected"); this.payload = payload; }
}
function rejected(message        , extra      = {})        {
  throw new Rejected({ status: "rejected", error: message, ...extra, disclaimer: DISCLAIMER });
}
function ok(payload     )      {
  if (payload.library_version === undefined) payload.library_version = LIBRARY_VERSION;
  payload.disclaimer = DISCLAIMER;
  return payload;
}
function checkFields(args     , allowed          , required           = [])       {
  if (typeof args !== "object" || args === null || Array.isArray(args)) rejected(GENERIC_FIELD_ERROR);
  const keys = Object.keys(args);
  if (keys.some((k) => !allowed.includes(k)) || required.some((r) => !(r in args))) {
    rejected(GENERIC_FIELD_ERROR);
  }
}
function optStr(args     , name        , def = "", maxLen = 80)         {
  const v = args[name] ?? def;
  if (typeof v !== "string" || v.length > maxLen) rejected(GENERIC_FIELD_ERROR);
  return v;
}
function reqStr(args     , name        , maxLen = 80)         {
  const v = args[name];
  if (typeof v !== "string" || !v || v.length > maxLen) rejected(GENERIC_FIELD_ERROR);
  return v;
}
function optInt(args     , name        , def        , lo        , hi        )         {
  const v = args[name] ?? def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) rejected(GENERIC_FIELD_ERROR);
  return v;
}

// ------------------------------------------------------------------ search --
const norm = (s        ) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const compact = (s        ) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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

const peptideBrief = (p     ) => ({
  peptide_id: p.id, preferred_name: p.preferred_name,
  human_evidence: p.evidence_stage.human,
  publication_version: p.publication_version, card_version: p.card_version,
});

function searchPeptides(args     )      {
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
  const matchOf = (p     )                => {
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
  const hits        = [];
  for (const p of LIB.peptides) {
    const m = matchOf(p);
    if (m) hits.push([p, m]);
  }
  if (!hits.length && screened) rejected(NAME_ONLY_MESSAGE);
  const out        = [];
  for (const [p, m] of hits) {
    if (bodySystem && !p.body_system_ids.includes(bodySystem)) continue;
    if (evidence && !LIB.claims.some((c     ) =>
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
function sourceOut(sourceId        )      {
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
const claimOut = (c     ) => ({
  claim_id: c.id, peptide_id: c.peptide_id, topic_id: c.topic_id,
  statement: c.statement, human_evidence_category: c.human_evidence_category,
  supporting_study_ids: c.supporting_study_ids,
  conflicting_study_ids: c.conflicting_study_ids,
  supporting_source_ids: c.supporting_source_ids, uncertainty: c.uncertainty,
});
const studyOut = (s     ) => ({
  study_id: s.id, publication_id: s.publication_id, primary_url: s.primary_url,
  study_type: s.study_type, species: s.species, population: s.population,
  sample_size: s.sample_size, status: s.status, dates: s.dates,
  intervention_identity: s.intervention_identity, comparator: s.comparator,
  outcomes_studied: s.outcomes_studied, results_summary: s.results_summary,
  limitations: s.limitations, funding_conflicts: s.funding_conflicts,
});

function regulatoryView(record     , today         )      {
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
function regulatoryOut(record     , today         )      {
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

function getPeptideCard(args     )      {
  checkFields(args, ["peptide_id", "section"], ["peptide_id"]);
  const peptideId = reqStr(args, "peptide_id");
  const section = optStr(args, "section", "all");
  if (!(peptideId in PEPTIDES)) rejected(GENERIC_VALUE_ERROR);
  if (!CARD_SECTIONS.includes(section)) rejected(GENERIC_VALUE_ERROR);
  const p = PEPTIDES[peptideId];
  const claims = LIB.claims.filter((c     ) => c.peptide_id === peptideId);
  const studyIds           = [];
  for (const sid of [...p.source_ids,
    ...claims.flatMap((c     ) => [...c.supporting_study_ids, ...c.conflicting_study_ids])]) {
    if (sid in STUDIES && !studyIds.includes(sid)) studyIds.push(sid);
  }
  const payload      = { peptide_id: p.id, canonical_name: p.preferred_name,
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
      .filter((r     ) => r.peptide_id === peptideId).map((r     ) => regulatoryOut(r));
  }
  if (section === "all" || section === "sources") {
    payload.sources = p.source_ids.map(sourceOut);
  }
  return ok(payload);
}

// ------------------------------------------------------------------ browse --
function browseResearchMap(args     )      {
  checkFields(args, ["body_system", "topic_id", "evidence", "limit", "offset"]);
  const bodySystem = optStr(args, "body_system");
  const topicId = optStr(args, "topic_id");
  const evidence = optStr(args, "evidence");
  const limit = optInt(args, "limit", 25, 1, 50);
  const offset = optInt(args, "offset", 0, 0, 500);
  if (bodySystem && !(bodySystem in SYSTEMS)) rejected(GENERIC_VALUE_ERROR);
  if (topicId && !(topicId in TOPICS)) rejected(GENERIC_VALUE_ERROR);
  if (evidence && !EVIDENCE_CATEGORIES.includes(evidence)) rejected(GENERIC_VALUE_ERROR);

  const topics = LIB.topics.filter((t     ) =>
    (!topicId || t.id === topicId) && (!bodySystem || t.body_system_ids.includes(bodySystem)));
  let connections        = topics.map((t     ) => {
    const claims = LIB.claims.filter((c     ) => c.topic_id === t.id &&
      (!evidence || c.human_evidence_category === evidence));
    return { topic_id: t.id, topic_name: t.name, research_goal: t.name,
      body_system_ids: t.body_system_ids,
      description: t.description,
      peptide_ids: [...new Set(claims.map((c     ) => c.peptide_id))].sort(),
      claims: claims.map(claimOut), _n: claims.length };
  });
  const totalClaims = connections.reduce((a        , c     ) => a + c._n, 0);
  const flat = connections.flatMap((c     ) => c.claims);
  const keep = new Set(flat.slice(offset, offset + limit).map((c     ) => c.claim_id));
  for (const conn of connections) {
    conn.claims = conn.claims.filter((c     ) => keep.has(c.claim_id));
    delete conn._n;
  }
  connections = connections.filter((c     ) => c.claims.length || !flat.length);
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
function comparePeptideEvidence(args     )      {
  checkFields(args, ["peptide_ids", "topic_id"], ["peptide_ids"]);
  const peptideIds = args.peptide_ids;
  const topicId = optStr(args, "topic_id");
  if (!Array.isArray(peptideIds) || peptideIds.length < 2 || peptideIds.length > 3 ||
      peptideIds.some((x     ) => typeof x !== "string" || x.length > 80) ||
      new Set(peptideIds).size !== peptideIds.length ||
      peptideIds.some((x        ) => !(x in PEPTIDES))) {
    rejected("Compare takes two or three peptide identifiers from the reviewed catalog, with no repeats.");
  }
  if (topicId && !(topicId in TOPICS)) rejected(GENERIC_VALUE_ERROR);
  const cards = peptideIds.map((pid        ) => {
    const p = PEPTIDES[pid];
    const claims = LIB.claims.filter((c     ) => c.peptide_id === pid &&
      (!topicId || c.topic_id === topicId));
    const usFda = LIB.regulatory.find((r     ) => r.peptide_id === pid &&
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
function getRegulatoryRecord(args     )      {
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
    .filter((r     ) => r.peptide_id === peptideId && r.jurisdiction === jurisdiction)
    .map((r     ) => regulatoryOut(r));
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
function getSourceRecord(args     )      {
  checkFields(args, ["source_id"], ["source_id"]);
  const sourceId = reqStr(args, "source_id");
  if (!(sourceId in SOURCES) && !(sourceId in STUDIES)) rejected(GENERIC_VALUE_ERROR);
  const base = sourceOut(sourceId);
  const claims        = [];
  for (const c of LIB.claims) {
    let role                = null;
    if (c.supporting_study_ids.includes(sourceId) || c.supporting_source_ids.includes(sourceId)) role = "supporting";
    else if (c.conflicting_study_ids.includes(sourceId)) role = "conflicting";
    if (role) claims.push({ claim_id: c.id, peptide_id: c.peptide_id, topic_id: c.topic_id,
      role, statement: c.statement, human_evidence_category: c.human_evidence_category });
  }
  const peptideIds = [...new Set([
    ...LIB.peptides.filter((p     ) => p.source_ids.includes(sourceId)).map((p     ) => p.id),
    ...claims.map((c) => c.peptide_id)])].sort();
  return ok({ ...base, supports: { claims, peptide_ids: peptideIds },
    revision: { date_checked: base.date_checked, dataset_version: LIBRARY_VERSION } });
}

// ------------------------------------------------------------------ legacy --
function listPeptideTopics(args     )      {
  checkFields(args, ["category"]);
  const category = optStr(args, "category", "all");
  if (category !== "all" && !TOPIC_CATEGORIES.includes(category)) rejected(GENERIC_VALUE_ERROR);
  const topics        = [];
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
  const payload      = { topics };
  if (category === "all" || category === "reference_cards") payload.notes = [LIB.index_notes.tb_500];
  return ok(payload);
}
function getPeptideExplainer(args     )      {
  checkFields(args, ["slug"], ["slug"]);
  const slug = reqStr(args, "slug");
  if (!(slug in EXPLAINERS)) {
    rejected(GENERIC_VALUE_ERROR, { topics: LIB.explainers.map((e     ) =>
      ({ slug: e.slug, title: e.title, category: e.category })) });
  }
  const e = EXPLAINERS[slug];
  return ok({ slug: e.slug, title: e.title, category: e.category, summary: e.summary,
    body: e.body, sources_note: e.sources_note });
}
function explainRegulatoryTerm(args     )      {
  checkFields(args, ["term"], ["term"]);
  const term = reqStr(args, "term");
  if (!(term in TERMS)) rejected(GENERIC_VALUE_ERROR, { terms: Object.keys(TERMS).sort() });
  const t = TERMS[term];
  return ok({ term: t.term, plain_language: t.plain_language, does_not_mean: t.does_not_mean });
}

const OPERATIONS                                  = {
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

async function handleRpc(msg     )                      {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  const result = (value     ) => ({ jsonrpc: "2.0", id, result: value });
  const error = (code        , message        ) =>
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
        let data     ;
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
const json = (body     , status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });

                     
                                       
                          
 

// ------------------------------------------------------------- demo video --
// The OpenAI apps demo video is a 2.4 MB MP4 — too large to inline into
// a Worker script — so it is committed in this repo at demo/
// peptidex-walkthrough.mp4 and this route streams it from the repo's
// raw URL, passing Range requests through so players can seek. This is
// the ONLY outbound fetch the Worker makes and the only route serving
// non-MCP content. The DEMO_VIDEO_URL env binding overrides the
// upstream (tests point it at a local file server); production leaves
// it unset. Exact path only — every other /demo/* path 404s.
const DEMO_VIDEO_PATH = "/demo/peptidex-walkthrough.mp4";
const DEMO_VIDEO_UPSTREAM =
  "https://raw.githubusercontent.com/loyd-vitalbridgex/peptidex-mcp/main/demo/peptidex-walkthrough.mp4";
const DEMO_VIDEO_CACHE = "public, max-age=31536000, immutable";

async function upstreamLength(url        )                         {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

async function serveDemoVideo(req         , env           )                    {
  const upstream = (env.DEMO_VIDEO_URL ?? "").trim() || DEMO_VIDEO_UPSTREAM;
  const fwd = new Headers();
  let range = req.headers.get("range");
  if (range) {
    // The upstream CDN serves explicit ranges (bytes=A-B, bytes=A-) but
    // rejects suffix ranges (bytes=-N) with 501, so a suffix range is
    // rewritten to the equivalent explicit range using a HEAD for the
    // object length. An unparseable or multi-range header is dropped —
    // a server may ignore Range and answer 200 with the full body.
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && m[1] === "" && m[2] !== "" && Number(m[2]) > 0) {
      const len = await upstreamLength(upstream);
      if (len !== null) {
        const n = Math.min(Number(m[2]), len);
        range = `bytes=${len - n}-${len - 1}`;
      } else {
        range = null;
      }
    } else if (!m || (m[1] === "" && m[2] === "")) {
      range = null;
    }
    if (range) fwd.set("Range", range);
  }
  const ifRange = req.headers.get("if-range");
  if (ifRange && range) fwd.set("If-Range", ifRange);
  let up          ;
  try {
    up = await fetch(upstream, { method: req.method, headers: fwd });
  } catch {
    return new Response("demo video temporarily unavailable",
      { status: 502, headers: CORS });
  }
  if (!up.ok && up.status !== 416) {
    return new Response("demo video temporarily unavailable",
      { status: 502, headers: CORS });
  }
  const headers = new Headers(CORS);
  headers.set("Content-Type", "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", DEMO_VIDEO_CACHE);
  const len = up.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  const crange = up.headers.get("content-range");
  if (crange) headers.set("Content-Range", crange);
  return new Response(up.body, { status: up.status, headers });
}

export default {
  async fetch(req         , env           )                    {
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
    if ((req.method === "GET" || req.method === "HEAD") &&
        path === DEMO_VIDEO_PATH) {
      return serveDemoVideo(req, env);
    }
    if (path.startsWith("/demo/")) {
      return new Response("not found", { status: 404, headers: CORS });
    }
    if (req.method === "GET") {
      return json({ jsonrpc: "2.0", error: { code: -32000,
        message: "GET not supported on this stateless MCP endpoint; POST JSON-RPC instead." } }, 405);
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    let body     ;
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
