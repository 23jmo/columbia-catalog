/**
 * Hand-authored interest tags, scoped to the program a student declared.
 *
 * ── Why these are authored rather than derived ──────────────────────────────
 *
 * The obvious alternative is to cluster the catalog and label the clusters.
 * That produces tags nobody would pick: LSA on course descriptions separates
 * "COMS W4118 Operating Systems" from "COMS W4111 Databases" far less cleanly
 * than a CS student's own mental model does, because both descriptions are
 * mostly the same registrar boilerplate. A student knows whether they want
 * systems or theory; the corpus does not.
 *
 * So the tag list per major is curriculum judgement, transcribed from how each
 * department actually organises its own electives, and it is short on purpose —
 * eight to twelve options is one screen and one decision. Thirty would be a
 * survey.
 *
 * ── `exemplars` is the seam to the vector engine ────────────────────────────
 *
 * `lib/recommend/` blends a taste vector — the weighted mean of the LSA vectors
 * of a student's courses — into its score. A declared interest has no course
 * behind it, so each tag carries two or three exemplar courses whose vectors
 * ARE the tag's seed. That mapping lives here, next to the label a student
 * reads, rather than in the engine: it is a claim about the curriculum
 * ("Machine Learning is what AI/ML means at Columbia"), and a claim about the
 * curriculum belongs in a reviewed file a person can check against the
 * Bulletin.
 *
 * Exemplars are written in the Bulletin's spelling (`COMS W4771`) and passed
 * through `toCourseId` at the boundary, matching every other requirement
 * definition in the repo.
 *
 * IMPORTANT, and the reason nothing downstream depends on this yet: there is no
 * server-side `CourseVectorSource` today. The LSA vectors live only in
 * `public/index/*.emb.bin`, a browser artifact, so taste currently scores zero
 * in production and the seed vectors below are inert. They are authored anyway
 * because the alternative — authoring them later, under time pressure, by
 * whoever is wiring the vector loader — is how curriculum judgement turns into
 * whatever course came to mind first.
 *
 * Tags are stored in `student_profiles.interest_tags` as opaque strings
 * (migration 0032), capped at 24 by a check constraint.
 *
 * ── Barnard is not Columbia with different codes ────────────────────────────
 *
 * Added 2026-08-30, and the reason each Barnard list is authored separately
 * rather than aliased to the Columbia major of the same name is that the
 * departments genuinely teach different things. Three that decided it:
 *
 *   - Barnard History offers no Middle East field and almost no East Asia.
 *     Reusing the College's list would put two tags on the screen whose
 *     exemplars are courses her department does not teach.
 *   - Barnard Psychology runs an animal-cognition group — The Dog, Canine
 *     Cognition, Cephalopod Cognition — that the College's list has no tag for
 *     at all. It is one of the most distinctive things about the major.
 *   - Barnard Economics is built around political economy, gender, inequality
 *     and health, and has no industrial-organisation course. The College's
 *     `industrial-organization` tag would seed from nothing.
 *
 * Where a tag means exactly the same thing on both sides it REUSES the same id
 * (`development`, `poetry`, `ecology-evolution`), so the id keeps its meaning
 * across the whole file and a student who transfers keeps her pick. New ids
 * exist only where the concept is genuinely new.
 *
 * A reused id must carry the SAME LABEL everywhere, and the test enforces it.
 * The id is what the database stores; the label is only how it is drawn. Two
 * labels behind one id means the string in `interest_tags` no longer says what
 * the student saw when she picked it, and `interestTagsForPrograms` — which
 * de-duplicates by id and keeps the first — would silently choose one of them
 * for a double major. Where Barnard's version of a field is genuinely broader,
 * widen the BLURB, not the label.
 *
 * ── Every exemplar was re-derived from the catalog on 2026-08-30 ───────────
 *
 * The Columbia College and SEAS lists predate that audit and did not survive
 * it. `scripts/verify-interest-tag-exemplars.ts` found 33 of 156 exemplars
 * naming a course the catalog does not hold; reading the survivors' TITLES
 * next to their tags found roughly as many again that resolved to the wrong
 * course. Both classes were fixed by dumping each department's actual
 * inventory and re-choosing, tag by tag.
 *
 * Two lessons are worth keeping, because both are invisible from inside this
 * file:
 *
 *   - Columbia's field electives are mostly GU-coded at 4000, not UN-coded at
 *     3000. Every one of the seven Economics fields that shared a placeholder
 *     has a real course — `ECON GU4400` Labor Economics, `ECON GU4500`
 *     International Trade — that an author looking only at UN 3000-level
 *     listings will never see. The old lists have exactly that shape.
 *   - A department does not always own its own field. Columbia teaches East
 *     Asian history largely out of EAAS, biochemistry out of BIOL rather than
 *     any BIOC code, and creative writing out of WRIT rather than ENGL. Three
 *     tags were wrong for that reason alone.
 *
 * So: run the script before adding a tag, and print the exemplar's title next
 * to it before believing it. A code that resolves is not a code that is right,
 * and neither failure is visible on screen — a wrongly-seeded tag renders,
 * gets picked, and quietly recommends the wrong things forever.
 */

import type { BulletinCode } from "@/lib/requirements/code";

export interface InterestTag {
  /**
   * Stable, stored verbatim in `student_profiles.interest_tags`. Never
   * renamed — a rename silently drops every student who picked it, because the
   * column holds the string and not a foreign key.
   */
  id: string;
  /** What the student reads. */
  label: string;
  /** One short line, shown under the label so the tag is not a guessing game. */
  blurb: string;
  /**
   * Courses whose LSA vectors seed this tag. Two or three, chosen because they
   * are unambiguously *about* the tag rather than because they are popular.
   */
  exemplars: BulletinCode[];
}

/**
 * Tags offered for a program id. Programs absent from this map get the empty
 * list, and the interest step then skips itself rather than showing a student
 * an empty screen — see `interestTagsForPrograms`.
 */
const TAGS_BY_PROGRAM: Record<string, InterestTag[]> = {
  /* ======================================================================
   * Computer Science — the College and SEAS majors and the minor share a
   * list, because the electives are literally the same courses; only the
   * required core around them differs.
   * ====================================================================== */
  "cc-major-computer-science": computerScienceTags(),
  "seas-major-computer-science": computerScienceTags(),
  "cc-minor-computer-science": computerScienceTags(),

  "cc-major-economics": economicsTags(),
  "cc-concentration-economics": economicsTags(),

  "cc-major-english": [
    tag("literary-theory", "Literary theory", "Criticism, poetics, how reading works", [
      "ENGL UN3011",
    ]),
    tag("poetry", "Poetry", "Verse from any period, and how to read it", [
      "ENGL UN2404",
      "ENGL UN3576",
    ]),
    tag("fiction-novel", "The novel", "Long-form narrative, its history and its shapes", [
      "ENGL UN2802",
      "ENGL UN3480",
    ]),
    tag("drama-theatre", "Drama and theatre", "Plays on the page and in performance", [
      "ENGL UN2702",
      "ENGL UN2703",
    ]),
    tag("shakespeare-early-modern", "Shakespeare and early modern", "1500–1700", [
      "ENGL UN3335",
      "ENGL UN3336",
    ]),
    tag("american-literature", "American literature", "From the colonial period forward", [
      "ENGL UN3710",
      "ENGL UN2603",
    ]),
    tag("postcolonial-global", "Global and postcolonial", "Anglophone writing beyond Britain and the US", [
      "ENGL UN3438",
      "ENGL UN3851",
    ]),
    tag("gender-sexuality", "Gender and sexuality", "Feminist and queer readings", [
      "ENGL UN3440",
      "ENGL UN3486",
    ]),
    tag("film-media", "Film and media", "Screen texts alongside print ones", [
      "ENGL UN3985",
      "ENGL GU4669",
    ]),
    // Workshops are WRIT, not ENGL. This tag used to carry `ENGL UN3001`,
    // which is Literary Texts & Critical Methods — a criticism course, and so
    // the seed vector for "you write, not only read" was the vector of the one
    // thing creative writing is not.
    tag("creative-writing", "Creative writing", "Workshops — you write, not only read", [
      "WRIT UN2100",
      "WRIT UN2300",
    ]),
  ],

  /*
   * Medical Humanities is intentionally organised around the kinds of inquiry
   * the GS Bulletin names for the student's individualized nexus, not around a
   * made-up department taxonomy. Exemplars are current ICLS offerings printed
   * on that same Bulletin page for Fall 2026.
   */
  "gs-major-medical-humanities": [
    tag(
      "narrative-medicine",
      "Narrative medicine",
      "How stories shape illness, care, and the patient experience",
      ["CPLS UN3931", "CPLS GU4227"],
    ),
    tag(
      "end-of-life-care",
      "End-of-life care",
      "Palliative care, service, grief, and the ethics of comfort",
      ["CPLS UN3931"],
    ),
    tag(
      "literature-medicine",
      "Literature and medicine",
      "How fiction represents bodies, disease, anatomy, and diagnosis",
      ["CPLS GU4227"],
    ),
    tag(
      "health-justice",
      "Health justice",
      "Medical racism, anti-racist care, and public-health power",
      ["CPLS GU4325"],
    ),
    tag(
      "bioethics",
      "Bioethics",
      "The moral questions inside research, treatment, and health systems",
      ["CPLS UN3931", "CPLS GU4325"],
    ),
    tag(
      "psychoanalysis",
      "Mind and psychoanalysis",
      "Freud, theories of mind, and their cultural afterlives",
      ["CLPS GU4200", "CLPS GU4202"],
    ),
  ],

  "cc-major-history": [
    tag("us-history", "United States", "Colonial through contemporary", [
      "HIST UN1501",
      "HIST UN2432",
    ]),
    tag("europe", "Europe", "Medieval, early modern, and modern", [
      "HIST UN2100",
      "HIST UN2323",
    ]),
    // Columbia teaches most of its East Asia history out of EAAS, not HIST;
    // a HIST-only exemplar list for this field is why the old code was wrong.
    tag("east-asia", "East Asia", "China, Japan, Korea", [
      "HIST UN2851",
      "EAAS UN3927",
    ]),
    tag("middle-east", "Middle East", "The region and its historiography", [
      "HIST UN2719",
      "HIST UN2701",
    ]),
    tag("africa", "Africa", "Pre-colonial through post-independence", [
      "HIST UN2772",
      "HIST UN2438",
    ]),
    tag("latin-america", "Latin America", "Colonial and national periods", [
      "HIST UN2660",
      "HIST UN2661",
    ]),
    tag("intellectual-history", "Intellectual history", "Ideas, and the people who argued about them", [
      "HIST UN2310",
      "HIST UN2478",
    ]),
    tag("social-cultural", "Social and cultural", "Everyday life, class, gender, race", [
      "HIST UN2072",
      "HIST UN3908",
    ]),
    tag("empire-colonialism", "Empire and colonialism", "How empires worked and came apart", [
      "HIST UN2342",
      "HIST GU4394",
    ]),
    tag("science-medicine-history", "Science and medicine", "History of knowledge and of the body", [
      "HIST UN2978",
      "HIST UN2523",
    ]),
  ],

  "cc-major-political-science": [
    tag("political-theory", "Political theory", "Normative argument, ancient to contemporary", [
      "POLS UN1101",
      "POLS GU4134",
    ]),
    tag("american-politics", "American politics", "Institutions, parties, elections", [
      "POLS UN1201",
      "POLS UN3222",
    ]),
    tag("comparative-politics", "Comparative politics", "Regimes and states, side by side", [
      "POLS UN1501",
      "POLS UN3534",
    ]),
    tag("international-relations", "International relations", "War, trade, and cooperation between states", [
      "POLS UN1601",
      "POLS UN3631",
    ]),
    tag("political-economy", "Political economy", "Where markets and states meet", [
      "POLS UN3630",
      "POLS GU4865",
    ]),
    // `POLS UN3921` is the American Politics Seminar, not a policy course. It
    // resolved, so no check caught it; it just seeded the wrong field.
    tag("public-policy", "Public policy", "How a decision becomes a programme", [
      "POLS GU4242",
      "POLS UN3213",
    ]),
    tag("human-rights", "Human rights", "Norms, law, and enforcement", [
      "POLS UN3002",
      "POLS UN3285",
    ]),
    tag("quantitative-methods", "Quantitative methods", "Data, inference, and research design", [
      "POLS UN3720",
      "POLS UN3704",
    ]),
    tag("race-ethnicity-politics", "Race and ethnicity", "Identity as a political variable", [
      "POLS UN3255",
      "POLS UN3516",
    ]),
    tag("security-conflict", "Security and conflict", "Force, deterrence, and civil war", [
      "POLS UN3623",
      "POLS UN3622",
    ]),
  ],

  "cc-major-psychology": [
    tag("cognitive", "Cognition", "Attention, memory, language, reasoning", [
      "PSYC UN2210",
      "PSYC UN2235",
    ]),
    // Was `PSYC UN1010`, which is nothing: the College’s intro is UN1001 and
    // `PSYC BC1010` is Barnard’s lab. The old code was a blend of the two.
    tag("neuroscience", "Neuroscience", "Brains, and what they do", [
      "PSYC UN2430",
      "PSYC UN1950",
    ]),
    tag("social-psych", "Social psychology", "People in the presence of other people", [
      "PSYC UN2630",
      "PSYC UN2260",
    ]),
    tag("developmental", "Development", "Change across the lifespan", [
      "PSYC UN2280",
      "PSYC UN2481",
    ]),
    tag("clinical-abnormal", "Clinical and abnormal", "Disorder, diagnosis, and treatment", [
      "PSYC UN2620",
      "PSYC UN3625",
    ]),
    // Perception and behavioural neuroscience both pointed at `PSYC UN2450`,
    // so two tags on one screen shared a single seed vector and could never
    // rank a course differently.
    tag("perception", "Perception", "Vision, hearing, and the rest of the senses", [
      "PSYC GU4265",
      "PSYC UN3476",
    ]),
    tag("personality", "Personality", "Individual differences and how to measure them", [
      "PSYC UN2610",
    ]),
    tag("behavioral-neuro", "Behavioural neuroscience", "Learning, motivation, and the animal literature", [
      "PSYC UN2450",
      "PSYC UN2460",
    ]),
    tag("psych-methods", "Methods and statistics", "Design, analysis, and what counts as evidence", [
      "PSYC UN1610",
      "PSYC UN1420",
    ]),
    tag("psych-research", "Lab research", "Seminars and supervised research, not lectures", [
      "PSYC UN3950",
    ]),
  ],

  "cc-major-biology": [
    tag("molecular-cell", "Molecular and cell", "What happens inside one cell", [
      "BIOL UN3041",
      "BIOL UN2005",
    ]),
    tag("genetics-genomics", "Genetics and genomics", "Inheritance, sequence, and variation", [
      "BIOL UN3031",
      "BIOL GU4510",
    ]),
    // Biochemistry is taught in BIOL, not in a BIOC subject code — `BIOC UN3501`
    // has never existed in this catalog.
    tag("biochemistry", "Biochemistry", "The chemistry that biology runs on", [
      "BIOL UN3300",
      "BIOL GU4501",
    ]),
    tag("neurobiology", "Neurobiology", "Nervous systems from ion channel to behaviour", [
      "BIOL UN3004",
      "BIOL UN3005",
    ]),
    tag("ecology-evolution", "Ecology and evolution", "Populations, species, and deep time", [
      "EEEB UN2001",
      "EEEB UN2002",
    ]),
    tag("developmental-bio", "Developmental biology", "From one cell to an organism", [
      "BIOL UN3022",
    ]),
    // `BIOL UN3320` is Regulation of Behaviors for Survival, and it was the
    // seed for BOTH immunology and computational biology.
    tag("immunology-disease", "Immunology and disease", "Host, pathogen, and the response", [
      "BIOL UN3073",
      "BIOL GU4310",
    ]),
    tag("computational-bio", "Computational biology", "Sequence and structure, computationally", [
      "BIOL GU4402",
      "BIOL GU4036",
    ]),
    tag("physiology", "Physiology", "Whole systems and how they are regulated", [
      "BIOL UN3006",
    ]),
    tag("bio-lab", "Lab research", "Bench work and independent projects", [
      "BIOL UN3500",
      "BIOL UN3052",
    ]),
  ],

  "seas-major-mechanical-engineering": [
    tag("thermo-fluids", "Thermal and fluids", "Heat, flow, and energy conversion", [
      "MECE E3311",
      "MECE E3100",
    ]),
    // Every one of the four tags below used to name the course belonging to a
    // DIFFERENT tag on this same list: solid mechanics pointed at
    // Thermodynamics, dynamics at Computer Graphics, materials at Fluids.
    tag("solid-mechanics", "Solid mechanics", "Stress, strain, and why things break", [
      "MECE E3414",
    ]),
    tag("dynamics-control", "Dynamics and control", "Motion, feedback, and stability", [
      "MECE E4401",
      "MECE E4430",
    ]),
    tag("robotics", "Robotics", "Mechanisms that sense and act", [
      "MECE E4602",
      "MECE E4611",
    ]),
    tag("design-manufacturing", "Design and manufacturing", "From drawing to part", [
      "MECE E3430",
      "MECE E4606",
    ]),
    tag("materials", "Materials", "Choosing what to build it out of", [
      "MECE E4461",
      "MECE E4460",
    ]),
    tag("energy-systems", "Energy systems", "Power generation, storage, and efficiency", [
      "MECE E4211",
      "MECE E4350",
    ]),
    tag("mems-micro", "MEMS and micro-scale", "Engineering below the millimetre", [
      "MECE E4212",
      "MECE E4214",
    ]),
    tag("computational-mech", "Computational mechanics", "Simulation as the primary tool", [
      "MECE E4520",
    ]),
    tag("biomechanics", "Biomechanics", "Mechanics applied to living tissue", [
      "BMEN E4310",
      "BMEN E4302",
    ]),
  ],

  "seas-major-operations-research": [
    tag("optimization", "Optimisation", "Linear, integer, and convex programming", [
      "IEOR E4004",
      "IEOR E3608",
    ]),
    tag("stochastic-models", "Stochastic models", "Queues, Markov chains, and randomness", [
      "IEOR E3106",
      "IEOR E4106",
    ]),
    tag("simulation", "Simulation", "Modelling a system you cannot solve in closed form", [
      "IEOR E4404",
      "IEOR E3404",
    ]),
    tag("financial-engineering", "Financial engineering", "Pricing, risk, and portfolios", [
      "IEOR E4700",
      "IEOR E4602",
    ]),
    // Supply chain and revenue management both used to name Production
    // Scheduling, and healthcare named Simulation — three tags, two seeds
    // borrowed from their neighbours.
    tag("supply-chain", "Supply chain and logistics", "Inventory, routing, and networks", [
      "IEOR E4108",
      "IEOR E4418",
    ]),
    tag("revenue-management", "Revenue management and pricing", "Selling the right seat at the right price", [
      "IEOR E4601",
    ]),
    tag("machine-learning-or", "Machine learning", "Statistical learning for decisions", [
      "IEOR E4525",
      "IEOR E4212",
    ]),
    tag("data-analytics", "Data analytics", "Getting an answer out of a real dataset", [
      "IEOR E4501",
      "IEOR E4534",
    ]),
    tag("healthcare-or", "Healthcare operations", "Capacity, scheduling, and access", [
      "IEOR E4507",
    ]),
    tag("algorithms-or", "Algorithms and complexity", "What is tractable, and what is not", [
      "IEOR E4008",
    ]),
  ],

  "seas-major-biomedical-engineering": [
    tag("biomechanics-bme", "Biomechanics", "Forces in and on living tissue", [
      "BMEN E4310",
      "BMEN E4302",
    ]),
    // The worst list in the file before 2026-08-30: five of ten tags named a
    // BMEN number the department does not use (E4210, E4300, E4010 twice,
    // E4438), and three of the survivors doubled up on E4001.
    tag("biomaterials", "Biomaterials", "Materials that have to live in a body", [
      "BMEN E4501",
      "BMEN E4535",
    ]),
    tag("tissue-engineering", "Tissue engineering", "Growing replacements", [
      "BMEN E4510",
      "BMEN E4525",
    ]),
    tag("medical-imaging", "Medical imaging", "MRI, CT, ultrasound, and the maths under them", [
      "BMEN E4894",
      "BMEN E4430",
    ]),
    tag("biosignals", "Biosignals and instrumentation", "Measuring a body without harming it", [
      "BMEN E4420",
      "BMEN E4470",
    ]),
    tag("cell-molecular-bme", "Cell and molecular engineering", "Engineering at the scale of a cell", [
      "BMEN E4330",
      "BMEN E4550",
    ]),
    tag("neuroengineering", "Neuroengineering", "Interfaces to the nervous system", [
      "BMEN E4050",
      "BMEN E4545",
    ]),
    // Quantitative Physiology is the department’s modelling sequence, so it
    // belongs here rather than under imaging and devices, where it sat.
    tag("computational-bme", "Computational modelling", "Simulating physiology", [
      "BMEN E4001",
      "BMEN E4002",
    ]),
    tag("medical-devices", "Medical devices", "Design under regulation", [
      "BMEN E4592",
      "BMEN E4590",
    ]),
    tag("systems-biology", "Systems biology", "Networks rather than single molecules", [
      "BMEN E4500",
      "BMEN E4583",
    ]),
  ],

  /* ======================================================================
   * Barnard College
   *
   * Read off each department's own course inventory, not off the Columbia
   * major of the same name. See the Barnard section of the file header for
   * why that distinction is load-bearing rather than tidy.
   * ====================================================================== */

  // The two Economics tracks share a list because they share a department and
  // draw electives from the same ECON BC courses. What differs between them is
  // required coursework, which is the audit's job, not this file's.
  "bc-major-economics": barnardEconomicsTags(),
  "bc-major-political-economy": barnardEconomicsTags(),

  "bc-major-psychology": [
    tag("cognitive", "Cognition", "Attention, memory, and reasoning", [
      "PSYC BC2115",
      "PSYC BC3145",
    ]),
    tag("perception", "Perception", "Vision, hearing, and the rest of the senses", [
      "PSYC BC2110",
      "PSYC BC3164",
    ]),
    tag("social-psych", "Social psychology", "People in the presence of other people", [
      "PSYC BC2138",
      "PSYC BC3384",
    ]),
    tag("developmental", "Development", "Change across the lifespan", [
      "PSYC BC2129",
      "PSYC BC3382",
    ]),
    tag("clinical-abnormal", "Clinical and abnormal", "Disorder, diagnosis, and treatment", [
      "PSYC BC2141",
      "PSYC BC2156",
    ]),
    tag("personality", "Personality", "Individual differences and how to measure them", [
      "PSYC BC2125",
    ]),
    tag("learning-behavior", "Learning and behaviour", "Conditioning, motivation, and the animal literature", [
      "PSYC BC2107",
    ]),
    // Barnard's own, and the reason this list is not the College's: the
    // department runs a dog- and cephalopod-cognition group with real seminars.
    tag("animal-cognition", "Animal cognition", "What non-human minds can do", [
      "PSYC BC3390",
      "PSYC BC3179",
    ]),
    tag("cultural-psych", "Cultural psychology", "How culture shapes mind and self", [
      "PSYC BC3162",
      "PSYC BC3165",
    ]),
    tag("language-psych", "Language", "Acquisition, bilingualism, and the brain", [
      "PSYC BC3369",
      "PSYC BC3383",
    ]),
    tag("health-wellbeing", "Health and well-being", "Behaviour, stress, and flourishing", [
      "PSYC BC3373",
      "PSYC BC3088",
    ]),
    tag("psych-research", "Lab research", "Supervised research and field practica, not lectures", [
      "PSYC BC3617",
      "PSYC BC3473",
    ]),
  ],

  "bc-major-computer-science": [
    /*
     * This list deliberately spans two hosts. Barnard's own COMS BC offerings
     * are human-centered by design — accessibility, privacy, misinformation,
     * computational sound — while theory and systems are taken at Columbia,
     * because Barnard does not teach them and the major's electives draw from
     * `COMS`, `CSOR`, `CSEE` and the rest regardless of campus.
     */
    tag("ai-ml", "AI and machine learning", "Learning from data; models that decide", [
      "COMS BC3707",
      "COMS W4771",
    ]),
    tag("nlp", "Natural language", "Text, speech, and language models", ["COMS BC3705"]),
    tag("graphics-vision", "Graphics and vision", "Making images, and understanding them", [
      "COMS BC3160",
      "COMS BC3168",
    ]),
    tag("security", "Security", "Cryptography, and defending systems people actually use", [
      "COMS BC3262",
      "COMS BC3422",
    ]),
    tag("privacy-society", "Privacy and society", "Surveillance, misinformation, and design ethics", [
      "COMS BC3420",
      "COMS BC3423",
    ]),
    tag("hci", "Human–computer interaction", "Interfaces, accessibility, and the people using them", [
      "COMS BC3162",
    ]),
    tag("data-visualization", "Data visualisation", "Making a dataset legible", ["COMS BC3122"]),
    tag("networks-social", "Networks", "Graphs, and the social structures they encode", [
      "COMS BC3411",
    ]),
    tag("creative-computing", "Creative computing", "Sound, embedded systems, and computing as a medium", [
      "COMS BC3430",
      "COMS BC3930",
    ]),
    tag("robotics-cs", "Robotics", "Perception, optimisation, and control", ["COMS BC3159"]),
    tag("theory", "Theory", "Algorithms, complexity, what is computable", [
      "CSOR W4231",
      "COMS W3261",
    ]),
    tag("systems", "Systems", "Operating systems, networks, distributed machines", [
      "COMS W4118",
      "CSEE W4119",
    ]),
  ],

  "bc-major-political-science": [
    tag("political-theory", "Political theory", "Normative argument, ancient to contemporary", [
      "POLS BC1110",
      "POLS BC3016",
    ]),
    tag("american-politics", "American politics", "Institutions, parties, elections", [
      "POLS BC1210",
      "POLS BC3025",
    ]),
    tag("comparative-politics", "Comparative politics", "Regimes and states, side by side", [
      "POLS BC1510",
      "POLS BC3426",
    ]),
    tag("international-relations", "International relations", "War, trade, and cooperation between states", [
      "POLS BC1610",
      "POLS BC3607",
    ]),
    tag("constitutional-law", "Law and the constitution", "Rights, liberties, and how courts decide", [
      "POLS BC3438",
      "POLS BC3521",
    ]),
    tag("security-conflict", "Security and conflict", "Force, violence, and civil war", [
      "POLS BC3054",
      "POLS BC3118",
    ]),
    tag("race-ethnicity-politics", "Race and ethnicity", "Identity as a political variable", [
      "POLS BC3695",
      "POLS BC3021",
    ]),
    tag("gender-politics", "Gender and politics", "Feminist thought, and gender as policy", [
      "POLS BC3035",
      "POLS BC3445",
    ]),
    tag("human-rights", "Human rights", "Norms, law, and enforcement", ["POLS BC3410"]),
    tag("democracy-authoritarianism", "Democracy and authoritarianism", "How regimes consolidate and break down", [
      "POLS BC3421",
      "POLS BC3697",
    ]),
    tag("environmental-politics", "Climate and environment", "The politics of a warming world", [
      "POLS BC1605",
      "POLS BC3120",
    ]),
    tag("political-data", "Data and methods", "Quantitative research design for politics", [
      "POLS BC3731",
    ]),
  ],

  "bc-major-sociology": [
    tag("race-ethnicity-society", "Race and ethnicity", "Structure, identity, and inequality", [
      "SOCI BC3219",
      "SOCI BC3214",
    ]),
    tag("gender-sexuality-society", "Gender and sexuality", "Work, bodies, and trans lives", [
      "SOCI BC3920",
      "SOCI BC3948",
    ]),
    tag("inequality-stratification", "Inequality", "Class, closure, and who gets what", [
      "SOCI BC3249",
      "SOCI BC3939",
    ]),
    tag("health-society", "Health and society", "Structural determinants and global health", [
      "SOCI BC3202",
      "SOCI BC3946",
    ]),
    tag("education-society", "Education", "Schools as sorting machines", [
      "SOCI BC3148",
      "SOCI BC3947",
    ]),
    tag("immigration-migration", "Immigration", "Movement, settlement, and belonging", [
      "SOCI BC3927",
      "SOCI BC3236",
    ]),
    tag("science-technology-society", "Science and technology", "Expertise, digital life, and its inequalities", [
      "SOCI BC3251",
      "SOCI BC3015",
    ]),
    tag("surveillance-privacy", "Surveillance", "Being watched, and by whom", ["SOCI BC3705"]),
    tag("culture-media-society", "Culture and media", "Art, food, and taste as social facts", [
      "SOCI BC3242",
      "SOCI BC3922",
    ]),
    tag("environment-society", "Environment", "Ecology as a social problem", ["SOCI BC3244"]),
    tag("community-activism", "Communities and activism", "Organising, and social change", [
      "SOCI BC3907",
      "SOCI BC3934",
    ]),
    tag("law-politics-society", "Law and politics", "Rules, states, and their sociology", [
      "SOCI BC3925",
      "SOCI BC3928",
    ]),
  ],

  "bc-major-history": [
    /*
     * No Middle East and no East Asia tag, unlike the College's list. Barnard's
     * department does not staff those fields — the nearest courses are a China
     * gender seminar and a food-environment seminar — and a tag whose exemplars
     * are courses the department never offers is worse than an absent tag.
     */
    tag("us-history", "United States", "Colonial through contemporary", [
      "HIST BC1401",
      "HIST BC2413",
    ]),
    tag("europe", "Europe", "Early modern through modern", ["HIST BC1101", "HIST BC1302"]),
    tag("latin-america", "Latin America", "Colonial, national, and Cold War", [
      "HIST BC2699",
      "HIST BC2697",
    ]),
    tag("africa", "Africa", "Pre-colonial through post-independence", [
      "HIST BC1760",
      "HIST BC3788",
    ]),
    tag("medieval-early-modern", "Medieval and early modern", "The global Middle Ages forward", [
      "HIST BC1062",
      "HIST BC2199",
    ]),
    tag("gender-history", "Gender and sexuality", "Women, gender, and power in the past", [
      "HIST BC2195",
      "HIST BC2567",
    ]),
    tag("science-medicine-history", "Science and medicine", "History of knowledge and of the body", [
      "HIST BC3193",
      "HIST BC3076",
    ]),
    tag("empire-colonialism", "Empire and colonialism", "How empires worked and came apart", [
      "HIST BC2321",
      "HIST BC2803",
    ]),
    tag("capitalism-economic-history", "Capitalism", "Markets, labour, and global inequality over time", [
      "HIST BC2101",
      "HIST BC2985",
    ]),
    tag("migration-history", "Migration", "Movement of people, and why", [
      "HIST BC2980",
      "HIST BC3870",
    ]),
    tag("environmental-history", "Environment", "Climate, water, and the material past", [
      "HIST BC2385",
      "HIST BC3379",
    ]),
    tag("urban-history", "Cities", "New York and other cities as historical subjects", [
      "HIST BC2405",
      "HIST BC2477",
    ]),
  ],

  "bc-major-neuroscience-and-behavior": [
    tag("cellular-molecular-neuro", "Cellular and molecular", "Neurons, channels, and synapses", [
      "NSBV BC3361",
      "BIOL BC3362",
    ]),
    tag("systems-behavioral-neuro", "Systems and behaviour", "Circuits, and the behaviour they produce", [
      "NSBV BC3001",
    ]),
    tag("cognitive-neuro", "Cognitive neuroscience", "Mapping mind onto brain", ["NSBV BC2009"]),
    tag("developmental-neuro", "Development", "Brains that are still being built", [
      "NSBV BC2025",
      "NSBV BC3376",
    ]),
    tag("computational-neuro", "Computational neuroscience", "Models, coding, and the neural code", [
      "NSBV BC2004",
      "NSBV BC3386",
    ]),
    tag("clinical-neuro-disorders", "Disorders of mind and brain", "Psychiatric and neurological disease", [
      "NSBV BC2006",
      "NSBV BC3388",
    ]),
    tag("sensory-neuro", "Senses", "Vision, flavour, and perception at the periphery", [
      "NSBV BC3381",
      "NSBV BC2005",
    ]),
    tag("hormones-stress", "Hormones and stress", "Endocrine influence on behaviour", [
      "NSBV BC2154",
      "NSBV BC3392",
    ]),
    tag("sleep-rhythms", "Sleep and rhythms", "Oscillations, dreaming, and time", [
      "NSBV BC3398",
      "NSBV BC3384",
    ]),
    tag("neuroethology", "Neuroethology", "Natural behaviour in real animals", [
      "NSBV BC3385",
      "NSBV BC3390",
    ]),
    tag("neuroethics", "Neuroethics", "What we ought to do with this knowledge", ["NSBV BC3387"]),
    tag("neuro-research", "Lab research", "Guided research and thesis seminars", [
      "NSBV BC3593",
      "NSBV BC3591",
    ]),
  ],

  "bc-major-biology": [
    tag("molecular-cell", "Molecular and cell", "What happens inside one cell", [
      "BIOL BC3310",
      "BIOL BC3303",
    ]),
    tag("genetics-genomics", "Genetics and genomics", "Inheritance, sequence, and variation", [
      "BIOL BC2100",
      "BIOL BC3308",
    ]),
    tag("ecology-evolution", "Ecology and evolution", "Populations, species, and deep time", [
      "BIOL BC2272",
      "BIOL BC2278",
    ]),
    tag("microbiology-disease", "Microbiology and disease", "Microbes, hosts, and public health", [
      "BIOL BC3320",
      "BIOL BC3322",
    ]),
    tag("developmental-bio", "Developmental biology", "From one cell to an organism", [
      "BIOL BC3352",
      "BIOL BC3356",
    ]),
    tag("physiology", "Physiology", "Whole systems, anatomy, and how they are regulated", [
      "BIOL BC3360",
      "BIOL BC2342",
    ]),
    tag("neurobiology", "Neurobiology", "Nervous systems at the cellular level", ["BIOL BC3362"]),
    tag("animal-behavior", "Animal behaviour", "Behaviour and organismal natural history", [
      "BIOL BC2280",
      "BIOL BC3333",
    ]),
    tag("plant-biology", "Plant biology", "Plant evolution, diversity, and the lab", [
      "BIOL BC2240",
      "BIOL BC1009",
    ]),
    tag("computational-bio", "Computational biology", "Code and sequence data as the method", [
      "BIOL BC2490",
      "BIOL BC3007",
    ]),
    tag("biochemistry", "Biochemistry", "The chemistry that biology runs on", ["BIOL BC3000"]),
    tag("bio-lab", "Lab research", "Bench work, guided research, and the thesis", [
      "BIOL BC3593",
      "BIOL BC3591",
    ]),
  ],

  "bc-major-english": [
    tag("creative-writing", "Creative writing", "Workshops — you write, not only read", [
      "ENGL BC3107",
      "ENGL BC3110",
    ]),
    tag("literary-theory", "Literary theory", "Criticism, psychoanalysis, how reading works", [
      "ENGL BC3194",
      "ENGL BC3171",
    ]),
    tag("shakespeare-early-modern", "Shakespeare and early modern", "1500–1700, on the page and the stage", [
      "ENGL BC3163",
      "ENGL BC3169",
    ]),
    tag("medieval-literature", "Medieval", "Chaucer, lyric, and the literature before print", [
      "ENGL BC3155",
      "ENGL BC3161",
    ]),
    tag("american-literature", "American literature", "From the colonial period forward", [
      "ENGL BC3181",
      "ENGL BC3183",
    ]),
    tag("poetry", "Poetry", "Verse from any period, and how to read it", [
      "ENGL BC3185",
      "ENGL BC3118",
    ]),
    tag("fiction-novel", "The novel", "Long-form narrative, its history and its shapes", [
      "ENGL BC3188",
      "ENGL BC3173",
    ]),
    tag("postcolonial-global", "Global and postcolonial", "Anglophone writing beyond Britain and the US", [
      "ENGL BC3521",
      "ENGL BC3207",
    ]),
    tag("gender-sexuality", "Gender and sexuality", "Feminist and queer readings", [
      "ENGL BC3750",
      "ENGL BC3599",
    ]),
    tag("race-ethnicity-literature", "Race and ethnicity", "Latinx, Black, and diasporic writing", [
      "ENGL BC3250",
      "ENGL BC3218",
    ]),
    // Barnard teaches comics as a field, with its own introductory course.
    tag("comics-graphic-novels", "Comics and graphic novels", "Sequential art as literature", [
      "ENGL BC1901",
      "ENGL BC1295",
    ]),
    tag("film-media", "Film and media", "Screen texts alongside print ones", [
      "ENGL BC3993",
      "ENGL BC3252",
    ]),
  ],

  "bc-major-urban-studies": [
    /*
     * Every exemplar is `URBS UN`, not `URBS BC`. That is the program's own
     * numbering — see `bc-major-urban-studies.ts` — and it must not be
     * "corrected" here either.
     */
    tag("urban-planning", "Urban planning", "How a city decides what gets built", ["URBS UN2520"]),
    tag("urban-sociology", "Urban sociology", "City life as social structure", ["URBS UN3420"]),
    tag("gis-spatial", "GIS and spatial analysis", "Mapping, data, and where things are", [
      "URBS UN2200",
      "URBS UN2100",
    ]),
    tag("housing-policy", "Housing", "Policy, equity, and the American dream", ["URBS UN3452"]),
    tag("race-space", "Race and space", "Segregation, schools, and metropolitics", [
      "URBS UN3315",
      "URBS UN3310",
    ]),
    tag("urban-ethnography", "Ethnography", "Fieldwork as the way to know a place", [
      "URBS UN3308",
    ]),
    tag("environmental-justice", "Environmental justice", "Who bears the cost of the built environment", [
      "URBS UN3451",
    ]),
    tag("community-development", "Community development", "Neighbourhoods, and who shapes them", [
      "URBS UN3450",
    ]),
    tag("global-cities", "Global cities", "Cities elsewhere, comparatively", [
      "URBS UN3351",
      "URBS UN3252",
    ]),
    tag("urban-geography", "Urban geography", "Form, region, and spatial order", ["URBS UN2300"]),
    tag("built-environment", "Built environment and heritage", "Buildings, preservation, and memory", [
      "URBS UN3250",
      "URBS UN3993",
    ]),
    tag("arts-public-space", "Arts and public space", "Commons, collectives, and culture in the city", [
      "URBS UN3600",
    ]),
  ],
};

function computerScienceTags(): InterestTag[] {
  return [
    tag("ai-ml", "AI and machine learning", "Learning from data; agents that decide", [
      "COMS W4701",
      "COMS W4771",
    ]),
    tag("systems", "Systems", "Operating systems, networks, distributed machines", [
      "COMS W4118",
      "CSEE W4119",
    ]),
    tag("theory", "Theory", "Algorithms, complexity, what is computable", [
      "CSOR W4231",
      "COMS W3261",
    ]),
    // `COMS W4995` is Topics in Computer Science, a rotating shell whose
    // description is registrar boilerplate; it seeded security with nothing.
    tag("security", "Security", "Attacking and defending real systems", [
      "COMS W4181",
      "COMS W4261",
    ]),
    tag("graphics-vision", "Graphics and vision", "Making images, and understanding them", [
      "COMS W4160",
      "COMS W4731",
    ]),
    tag("hci", "Human–computer interaction", "Interfaces, and the people using them", [
      "COMS W4170",
    ]),
    tag("software-engineering", "Software engineering", "Building things that other people maintain", [
      "COMS W4156",
      "COMS W3157",
    ]),
    tag("databases-data", "Databases and data", "Storage, query engines, data at scale", [
      "COMS W4111",
    ]),
    tag("nlp", "Natural language", "Text, speech, and language models", ["COMS W4705"]),
    tag("robotics-cs", "Robotics", "Perception and control on real hardware", ["COMS W4733"]),
    tag("computational-biology-cs", "Computational biology", "Algorithms aimed at biological data", [
      "COMS E4762",
      "BINF GU4009",
    ]),
    tag("programming-languages", "Programming languages", "Compilers, type systems, semantics", [
      "COMS W4115",
    ]),
  ];
}

function economicsTags(): InterestTag[] {
  return [
    tag("micro-theory", "Microeconomic theory", "Choice, markets, and equilibrium", ["ECON UN3211"]),
    tag("macro-theory", "Macroeconomic theory", "Growth, cycles, and aggregate demand", ["ECON UN3213"]),
    tag("econometrics", "Econometrics", "Getting causal answers out of data", [
      "ECON UN3412",
      "ECON GU4412",
    ]),
    tag("finance", "Finance", "Assets, corporate decisions, and risk", [
      "ECON UN3025",
      "ECON GU4280",
    ]),
    /*
     * Seven of these eleven tags used to name `ECON UN3265` Money and Banking.
     * Not a transcription slip — a placeholder that was never replaced, and
     * one the field checker could not see, because Money and Banking is a real
     * course. Development, labour, trade, IO, public and behavioural economics
     * all shared one seed vector, so the recommender ranked them identically
     * and no screen ever looked wrong. Columbia’s field electives are GU-coded
     * at 4000, which is why looking only at UN-coded 3000-level courses — the
     * shape of the original list — finds none of them.
     */
    tag("development", "Development", "Poverty, growth, and institutions", [
      "ECON GU4321",
      "ECON GU4301",
    ]),
    tag("labor", "Labour", "Wages, employment, and human capital", ["ECON GU4400"]),
    tag("international-econ", "International economics", "Trade and open-economy macro", [
      "ECON GU4500",
      "ECON GU4505",
    ]),
    tag("industrial-organization", "Industrial organisation", "Firms, competition, and regulation", [
      "ECON GU4251",
      "ECON GU4260",
    ]),
    tag("public-econ", "Public economics", "Taxes, spending, and what governments should do", [
      "ECON GU4465",
      "ECON UN3902",
    ]),
    tag("behavioral-econ", "Behavioural economics", "Where the standard model stops describing people", [
      "ECON GU4840",
      "ECON GU4850",
    ]),
    tag("political-economy-econ", "Political economy", "Economics of political institutions", [
      "ECON GU4370",
    ]),
  ];
}

/**
 * Barnard Economics, both tracks.
 *
 * Not `economicsTags()` with BC codes swapped in. The College's list carries
 * `micro-theory`, `macro-theory`, `finance` and `industrial-organization`;
 * Barnard's department teaches intermediate theory as required core rather than
 * as an elective field, has no industrial-organisation course, and its elective
 * catalogue is built around political economy, inequality, gender, health,
 * education and economic history. Those are the tags a Barnard economics
 * student would actually recognise as choices.
 */
function barnardEconomicsTags(): InterestTag[] {
  return [
    // The department's signature, and a required course on both tracks.
    tag("political-economy-econ", "Political economy", "Economic power, institutions, and the history of the field", [
      "ECON BC3041",
    ]),
    tag("inequality-poverty", "Inequality and poverty", "Distribution, and who is left out", [
      "ECON BC3011",
    ]),
    tag("development", "Development", "Poverty, growth, and institutions", [
      "ECON BC2020",
      "ECON BC3029",
    ]),
    tag("gender-econ", "Economics of gender", "Gender as an economic variable", ["ECON BC2010"]),
    tag("health-econ", "Health economics", "Care, cost, and outcomes", [
      "ECON BC3050",
      "ECON BC2017",
    ]),
    tag("labor", "Labour", "Wages, employment, and human capital", [
      "ECON BC3019",
      "ECON BC3081",
    ]),
    tag("education-econ", "Economics of education", "Schooling as investment and as policy", [
      "ECON BC3012",
    ]),
    tag("economic-history", "Economic history", "How we got the economy we have", [
      "ECON BC3013",
      "ECON BC3028",
    ]),
    tag("international-econ", "International economics", "Open-economy macro and monetary policy", [
      "ECON BC3038",
      "ECON BC3043",
    ]),
    tag("behavioral-econ", "Behavioural economics", "Game theory, and where the standard model stops describing people", [
      "ECON BC3048",
      "ECON BC3080",
    ]),
    tag("public-econ", "Public economics", "Taxes, spending, and what governments should do", [
      "ECON BC3026",
    ]),
    tag("econometrics", "Econometrics", "Getting causal answers out of data", [
      "ECON BC3018",
      "ECON BC3068",
    ]),
  ];
}

function tag(
  id: string,
  label: string,
  blurb: string,
  exemplars: BulletinCode[],
): InterestTag {
  return { id, label, blurb, exemplars };
}

/**
 * Every tag offered to a student in these programs, de-duplicated by id and in
 * declaration order.
 *
 * De-duplication is not cosmetic: a CS major who is also a CS minor would
 * otherwise be offered "systems" twice, and the second checkbox would silently
 * toggle the first.
 *
 * A program with no authored list contributes nothing rather than erroring —
 * the registry gains programs faster than this file does, and a student in a
 * newly-added major should get an onboarding flow that skips a step, not one
 * that crashes.
 */
export function interestTagsForPrograms(programIds: readonly string[]): InterestTag[] {
  const seen = new Set<string>();
  const tags: InterestTag[] = [];

  for (const programId of programIds) {
    for (const candidate of TAGS_BY_PROGRAM[programId] ?? []) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      tags.push(candidate);
    }
  }

  return tags;
}

/** Program ids that have an authored tag list. Exported for the test. */
export function programsWithInterestTags(): string[] {
  return Object.keys(TAGS_BY_PROGRAM);
}

/**
 * Drop tags that no authored list offers.
 *
 * Called on the way INTO the database, so a stale tag from an older deploy — or
 * anything a hand-rolled POST invented — cannot reach `interest_tags` and sit
 * there matching nothing forever.
 */
export function knownInterestTagIds(): Set<string> {
  const ids = new Set<string>();
  for (const tags of Object.values(TAGS_BY_PROGRAM)) {
    for (const candidate of tags) ids.add(candidate.id);
  }
  return ids;
}
