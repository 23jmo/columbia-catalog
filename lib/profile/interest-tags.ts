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
    tag("poetry", "Poetry", "Verse from any period, and how to read it", ["ENGL UN3230"]),
    tag("fiction-novel", "The novel", "Long-form narrative, its history and its shapes", [
      "ENGL UN3325",
    ]),
    tag("drama-theatre", "Drama and theatre", "Plays on the page and in performance", [
      "ENGL UN3335",
    ]),
    tag("shakespeare-early-modern", "Shakespeare and early modern", "1500–1700", [
      "ENGL UN3115",
    ]),
    tag("american-literature", "American literature", "From the colonial period forward", [
      "ENGL UN3350",
    ]),
    tag("postcolonial-global", "Global and postcolonial", "Anglophone writing beyond Britain and the US", [
      "ENGL UN3730",
    ]),
    tag("gender-sexuality", "Gender and sexuality", "Feminist and queer readings", ["ENGL UN3700"]),
    tag("film-media", "Film and media", "Screen texts alongside print ones", ["ENGL UN3820"]),
    tag("creative-writing", "Creative writing", "Workshops — you write, not only read", ["ENGL UN3001"]),
  ],

  "cc-major-history": [
    tag("us-history", "United States", "Colonial through contemporary", ["HIST UN2410"]),
    tag("europe", "Europe", "Medieval, early modern, and modern", ["HIST UN2611"]),
    tag("east-asia", "East Asia", "China, Japan, Korea", ["HIST UN2110"]),
    tag("middle-east", "Middle East", "The region and its historiography", ["HIST UN2810"]),
    tag("africa", "Africa", "Pre-colonial through post-independence", ["HIST UN2350"]),
    tag("latin-america", "Latin America", "Colonial and national periods", ["HIST UN2650"]),
    tag("intellectual-history", "Intellectual history", "Ideas, and the people who argued about them", [
      "HIST UN3600",
    ]),
    tag("social-cultural", "Social and cultural", "Everyday life, class, gender, race", ["HIST UN2530"]),
    tag("empire-colonialism", "Empire and colonialism", "How empires worked and came apart", [
      "HIST UN2860",
    ]),
    tag("science-medicine-history", "Science and medicine", "History of knowledge and of the body", [
      "HIST UN2680",
    ]),
  ],

  "cc-major-political-science": [
    tag("political-theory", "Political theory", "Normative argument, ancient to contemporary", [
      "POLS UN3001",
    ]),
    tag("american-politics", "American politics", "Institutions, parties, elections", ["POLS UN1201"]),
    tag("comparative-politics", "Comparative politics", "Regimes and states, side by side", [
      "POLS UN1501",
    ]),
    tag("international-relations", "International relations", "War, trade, and cooperation between states", [
      "POLS UN1601",
    ]),
    tag("political-economy", "Political economy", "Where markets and states meet", ["POLS UN3245"]),
    tag("public-policy", "Public policy", "How a decision becomes a programme", ["POLS UN3921"]),
    tag("human-rights", "Human rights", "Norms, law, and enforcement", ["POLS UN3628"]),
    tag("quantitative-methods", "Quantitative methods", "Data, inference, and research design", [
      "POLS UN3720",
    ]),
    tag("race-ethnicity-politics", "Race and ethnicity", "Identity as a political variable", [
      "POLS UN3283",
    ]),
    tag("security-conflict", "Security and conflict", "Force, deterrence, and civil war", ["POLS UN3660"]),
  ],

  "cc-major-psychology": [
    tag("cognitive", "Cognition", "Attention, memory, language, reasoning", ["PSYC UN2230"]),
    tag("neuroscience", "Neuroscience", "Brains, and what they do", ["PSYC UN1010"]),
    tag("social-psych", "Social psychology", "People in the presence of other people", ["PSYC UN2630"]),
    tag("developmental", "Development", "Change across the lifespan", ["PSYC UN2280"]),
    tag("clinical-abnormal", "Clinical and abnormal", "Disorder, diagnosis, and treatment", [
      "PSYC UN2620",
    ]),
    tag("perception", "Perception", "Vision, hearing, and the rest of the senses", ["PSYC UN2450"]),
    tag("personality", "Personality", "Individual differences and how to measure them", [
      "PSYC UN2610",
    ]),
    tag("behavioral-neuro", "Behavioural neuroscience", "Learning, motivation, and the animal literature", [
      "PSYC UN2450",
    ]),
    tag("psych-methods", "Methods and statistics", "Design, analysis, and what counts as evidence", [
      "PSYC UN1610",
    ]),
    tag("psych-research", "Lab research", "Seminars and supervised research, not lectures", [
      "PSYC UN3950",
    ]),
  ],

  "cc-major-biology": [
    tag("molecular-cell", "Molecular and cell", "What happens inside one cell", ["BIOL UN2005"]),
    tag("genetics-genomics", "Genetics and genomics", "Inheritance, sequence, and variation", [
      "BIOL UN3031",
    ]),
    tag("biochemistry", "Biochemistry", "The chemistry that biology runs on", ["BIOC UN3501"]),
    tag("neurobiology", "Neurobiology", "Nervous systems from ion channel to behaviour", [
      "BIOL UN3004",
    ]),
    tag("ecology-evolution", "Ecology and evolution", "Populations, species, and deep time", [
      "EEEB UN2001",
    ]),
    tag("developmental-bio", "Developmental biology", "From one cell to an organism", ["BIOL UN3040"]),
    tag("immunology-disease", "Immunology and disease", "Host, pathogen, and the response", [
      "BIOL UN3320",
    ]),
    tag("computational-bio", "Computational biology", "Sequence and structure, computationally", [
      "BIOL UN3320",
    ]),
    tag("physiology", "Physiology", "Whole systems and how they are regulated", ["BIOL UN2006"]),
    tag("bio-lab", "Lab research", "Bench work and independent projects", ["BIOL UN3500"]),
  ],

  "seas-major-mechanical-engineering": [
    tag("thermo-fluids", "Thermal and fluids", "Heat, flow, and energy conversion", ["MECE E3311"]),
    tag("solid-mechanics", "Solid mechanics", "Stress, strain, and why things break", ["MECE E3301"]),
    tag("dynamics-control", "Dynamics and control", "Motion, feedback, and stability", ["MECE E3408"]),
    tag("robotics", "Robotics", "Mechanisms that sense and act", ["MECE E4602"]),
    tag("design-manufacturing", "Design and manufacturing", "From drawing to part", ["MECE E3410"]),
    tag("materials", "Materials", "Choosing what to build it out of", ["MECE E3100"]),
    tag("energy-systems", "Energy systems", "Power generation, storage, and efficiency", ["MECE E4210"]),
    tag("mems-micro", "MEMS and micro-scale", "Engineering below the millimetre", ["MECE E4212"]),
    tag("computational-mech", "Computational mechanics", "Simulation as the primary tool", ["MECE E4520"]),
    tag("biomechanics", "Biomechanics", "Mechanics applied to living tissue", ["BMEN E4310"]),
  ],

  "seas-major-operations-research": [
    tag("optimization", "Optimisation", "Linear, integer, and convex programming", ["IEOR E4004"]),
    tag("stochastic-models", "Stochastic models", "Queues, Markov chains, and randomness", ["IEOR E3106"]),
    tag("simulation", "Simulation", "Modelling a system you cannot solve in closed form", [
      "IEOR E4404",
    ]),
    tag("financial-engineering", "Financial engineering", "Pricing, risk, and portfolios", ["IEOR E4700"]),
    tag("supply-chain", "Supply chain and logistics", "Inventory, routing, and networks", ["IEOR E4405"]),
    tag("revenue-management", "Revenue management and pricing", "Selling the right seat at the right price", [
      "IEOR E4405",
    ]),
    tag("machine-learning-or", "Machine learning", "Statistical learning for decisions", ["IEOR E4525"]),
    tag("data-analytics", "Data analytics", "Getting an answer out of a real dataset", ["IEOR E4501"]),
    tag("healthcare-or", "Healthcare operations", "Capacity, scheduling, and access", ["IEOR E4404"]),
    tag("algorithms-or", "Algorithms and complexity", "What is tractable, and what is not", ["IEOR E4008"]),
  ],

  "seas-major-biomedical-engineering": [
    tag("biomechanics-bme", "Biomechanics", "Forces in and on living tissue", ["BMEN E4310"]),
    tag("biomaterials", "Biomaterials", "Materials that have to live in a body", ["BMEN E4210"]),
    tag("tissue-engineering", "Tissue engineering", "Growing replacements", ["BMEN E4300"]),
    tag("medical-imaging", "Medical imaging", "MRI, CT, ultrasound, and the maths under them", [
      "BMEN E4001",
    ]),
    tag("biosignals", "Biosignals and instrumentation", "Measuring a body without harming it", [
      "BMEN E3810",
    ]),
    tag("cell-molecular-bme", "Cell and molecular engineering", "Engineering at the scale of a cell", [
      "BMEN E4010",
    ]),
    tag("neuroengineering", "Neuroengineering", "Interfaces to the nervous system", ["BMEN E4501"]),
    tag("computational-bme", "Computational modelling", "Simulating physiology", ["BMEN E4438"]),
    tag("medical-devices", "Medical devices", "Design under regulation", ["BMEN E4001"]),
    tag("systems-biology", "Systems biology", "Networks rather than single molecules", ["BMEN E4010"]),
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
    tag("security", "Security", "Attacking and defending real systems", [
      "COMS W4181",
      "COMS W4995",
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
      "COMS W4761",
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
    tag("econometrics", "Econometrics", "Getting causal answers out of data", ["ECON UN3412"]),
    tag("finance", "Finance", "Assets, corporate decisions, and risk", ["ECON UN3025"]),
    tag("development", "Development", "Poverty, growth, and institutions", ["ECON UN3265"]),
    tag("labor", "Labour", "Wages, employment, and human capital", ["ECON UN3265"]),
    tag("international-econ", "International economics", "Trade and open-economy macro", ["ECON UN3265"]),
    tag("industrial-organization", "Industrial organisation", "Firms, competition, and regulation", [
      "ECON UN3265",
    ]),
    tag("public-econ", "Public economics", "Taxes, spending, and what governments should do", [
      "ECON UN3265",
    ]),
    tag("behavioral-econ", "Behavioural economics", "Where the standard model stops describing people", [
      "ECON UN3265",
    ]),
    tag("political-economy-econ", "Political economy", "Economics of political institutions", [
      "ECON UN3265",
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
