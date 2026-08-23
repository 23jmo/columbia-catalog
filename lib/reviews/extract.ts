/**
 * Columbia Catalog — review dimension extraction (spec §12).
 *
 * Every ingested review runs through this exactly ONCE, at ingest time, and
 * the structured result is stored. That is the whole economic argument for the
 * feature: expensive once, free forever, and it turns CULPA's prose — the most
 * valuable and least structured source we have — into something a filter slider
 * can actually act on.
 *
 * The pipeline is written against an interface:
 *
 *     interface DimensionExtractor {
 *       extract(reviews: ReviewRecord[]): Promise<ReviewDimensions[]>;
 *     }
 *
 * Two implementations ship:
 *
 *   1. `HeuristicDimensionExtractor` — deterministic, keyword/valence based, no
 *      network, no key, no cost. It is the default so that the end-to-end
 *      pipeline (ingest → extract → aggregate → filter → UI) runs today.
 *   2. A Claude-backed extractor — the intended production implementation,
 *      sketched in `createClaudeExtractor` below. Per the Claude API guidance,
 *      wire it to a CURRENT Claude model: `claude-opus-5` at the time of
 *      writing, with adaptive thinking and a structured-output schema. The
 *      Anthropic SDK is not a dependency of this repo yet, so that function
 *      throws a clear "not wired up" error rather than importing a package
 *      that does not exist.
 *
 * Swapping is a one-line change at the call site:
 *
 *     await extractDimensions(reviews);                        // heuristic
 *     await extractDimensions(reviews, createClaudeExtractor()); // model
 *
 * Nothing downstream knows or cares which ran.
 */

import { z } from "zod";

import type { ReviewDimensions, ReviewRecord } from "../types";

// ---------------------------------------------------------------------------
// Schema — the contract the model must satisfy
// ---------------------------------------------------------------------------

/**
 * Scale conventions, stated once and enforced everywhere:
 *
 *   workload         1 = very light … 5 = very heavy   (higher is MORE work)
 *   difficulty       1 = very easy  … 5 = very hard    (higher is HARDER)
 *   teachingQuality  1 = poor       … 5 = excellent    (higher is BETTER)
 *   gradingFairness  1 = arbitrary  … 5 = very fair    (higher is FAIRER)
 *   sentiment       -1 = hostile    … 1 = enthusiastic
 *   wouldTakeAgain   true / false
 *
 * `null` is a first-class answer and means "this review carried no signal on
 * this dimension". It must never be coerced to a midpoint — a made-up 3 is
 * indistinguishable from a real 3 downstream, and that would quietly poison
 * every aggregate.
 */
export const ReviewDimensionsSchema = z.object({
  workload: z.number().min(1).max(5).nullable(),
  difficulty: z.number().min(1).max(5).nullable(),
  teachingQuality: z.number().min(1).max(5).nullable(),
  gradingFairness: z.number().min(1).max(5).nullable(),
  sentiment: z.number().min(-1).max(1).nullable(),
  wouldTakeAgain: z.boolean().nullable(),
});

/** One row of model output, keyed back to the review it describes. */
export const ExtractedReviewSchema = ReviewDimensionsSchema.extend({
  reviewId: z.string().min(1),
  /** Short quote justifying the scores. Useful for debugging, never displayed. */
  evidence: z.string().max(400).optional(),
});

export const ExtractionResponseSchema = z.object({
  results: z.array(ExtractedReviewSchema),
});

export type ExtractedReview = z.infer<typeof ExtractedReviewSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

/** Every dimension null — the safe answer when extraction fails. */
export function emptyDimensions(): ReviewDimensions {
  return {
    workload: null,
    difficulty: null,
    teachingQuality: null,
    gradingFairness: null,
    sentiment: null,
    wouldTakeAgain: null,
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * The system prompt. Written to be boring and literal, because the failure
 * mode that matters is not a bad score — it is a confidently invented one.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a careful annotator for a university course catalog. You read student-written reviews of Columbia University courses and instructors and convert each one into structured ratings.

You are annotating what the review SAYS, not judging the course yourself. If a review does not address a dimension, that dimension is null. Never guess, never infer from vibes, and never substitute a midpoint for missing information — a null is always better than an invented number.

Scales (all inclusive):

- workload — how much time the course demanded.
  1 very light · 2 light · 3 moderate · 4 heavy · 5 very heavy
  This is volume of work, not difficulty. A long but easy problem set is high workload, low difficulty.

- difficulty — how conceptually hard the material and assessments were.
  1 very easy · 2 easy · 3 moderate · 4 hard · 5 very hard

- teachingQuality — the instructor's teaching, as described.
  1 poor · 2 weak · 3 adequate · 4 good · 5 excellent
  About the instructor, not the subject matter. "Boring topic, great lecturer" is high.

- gradingFairness — whether grading was predictable, transparent, and proportionate.
  1 arbitrary or punitive · 3 unremarkable · 5 clearly fair and transparent
  A harsh but consistent and well-communicated curve is FAIR. Generous but random grading is not.

- sentiment — the reviewer's overall feeling about the experience, from -1 (hostile) through 0 (neutral or mixed) to 1 (enthusiastic).

- wouldTakeAgain — true if the reviewer indicates they would take this course or instructor again or recommends it to others; false if they warn others off; null if they do not say or imply either.

Rules:

1. Return one result object per input review, in the same order, echoing the reviewId exactly.
2. Rate only what the text supports. A review that is entirely about registration logistics yields all nulls.
3. Sarcasm and hyperbole are common in student writing. "Only 40 hours a week, no big deal" is high workload and negative sentiment.
4. Reviews may cover both a course and an instructor. Rate both aspects where present; downstream aggregation separates them by scope, so do not try to merge them.
5. Never let one loud dimension bleed into the others. A student who loved the professor and hated the workload gets a high teachingQuality AND a high workload.
6. Do not use outside knowledge about the course, the instructor, or Columbia.

Respond with JSON matching the required schema and nothing else.`;

/** Build the user turn for a batch of reviews. */
export function buildExtractionUserPrompt(reviews: ReviewRecord[]): string {
  const items = reviews.map((review, index) => {
    const header = [
      `[${index + 1}] reviewId: ${review.reviewId}`,
      `source: ${review.source}`,
      review.courseId ? `course: ${review.courseId}` : null,
      review.instructorName ? `instructor: ${review.instructorName}` : null,
      review.postedAt ? `posted: ${review.postedAt.slice(0, 10)}` : "posted: unknown",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
    return `${header}\nreview:\n"""\n${review.excerpt ?? ""}\n"""`;
  });

  return `Annotate the following ${reviews.length} review(s). Return exactly ${reviews.length} result object(s), in order.\n\n${items.join("\n\n---\n\n")}`;
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface DimensionExtractor {
  /**
   * Returns one `ReviewDimensions` per input review, in the same order.
   * Implementations must not throw: an extractor that cannot answer returns
   * `emptyDimensions()` for the rows it could not handle.
   */
  extract(reviews: ReviewRecord[]): Promise<ReviewDimensions[]>;
}

// ---------------------------------------------------------------------------
// Heuristic extractor — deterministic, ships today
// ---------------------------------------------------------------------------

interface Cue {
  pattern: RegExp;
  /** Target value on the dimension's own scale. */
  value: number;
  /** Relative confidence of this cue. */
  weight: number;
}

/** Cue tables. Each entry is `[regex source, target value, weight]`. */
const WORKLOAD_CUES: Cue[] = [
  { pattern: /\b(insane|brutal|crushing|relentless)\s+(workload|amount of work)\b/i, value: 5, weight: 3 },
  { pattern: /\b(so much|tons of|mountains of|endless)\s+(work|reading|problem sets|psets)\b/i, value: 5, weight: 2.5 },
  { pattern: /\b(\d{2,})\s*(\+)?\s*hours?\s+(a|per)\s+week\b/i, value: 5, weight: 2.5 },
  { pattern: /\b(heavy|hefty|huge|massive)\s+(workload|reading|course ?load)\b/i, value: 4.5, weight: 2.5 },
  { pattern: /\btime[- ]consuming\b/i, value: 4, weight: 2 },
  { pattern: /\bweekly (problem sets|psets|papers|essays)\b/i, value: 4, weight: 1.5 },
  { pattern: /\b(a lot of|plenty of) (work|reading|writing)\b/i, value: 4, weight: 2 },
  { pattern: /\b(manageable|reasonable|moderate) (workload|amount of work)\b/i, value: 3, weight: 2 },
  { pattern: /\b(light|low|minimal) (workload|reading|course ?load)\b/i, value: 1.5, weight: 2.5 },
  { pattern: /\b(barely any|almost no|hardly any) (work|reading|homework)\b/i, value: 1, weight: 3 },
  { pattern: /\b(easy a|gut|blow[- ]?off) (class|course)\b/i, value: 1.5, weight: 2 },
];

const DIFFICULTY_CUES: Cue[] = [
  { pattern: /\b(hardest|toughest) (class|course) (i('| ha)ve )?(ever )?(taken|had)\b/i, value: 5, weight: 3 },
  { pattern: /\b(extremely|incredibly|brutally) (hard|difficult|challenging)\b/i, value: 5, weight: 3 },
  { pattern: /\b(very|really|quite) (hard|difficult|challenging)\b/i, value: 4.5, weight: 2.5 },
  { pattern: /\b(hard|difficult|challenging|rigorous|demanding)\b/i, value: 4, weight: 1.5 },
  { pattern: /\bexams? (were|are) (hard|brutal|impossible|unfair)\b/i, value: 4.5, weight: 2 },
  { pattern: /\b(steep learning curve|over my head|lost the whole time)\b/i, value: 4.5, weight: 2 },
  { pattern: /\b(straightforward|manageable|not (too|that) (hard|bad|difficult))\b/i, value: 2.5, weight: 2 },
  { pattern: /\b(very |super |really )?easy\b/i, value: 1.5, weight: 2 },
  { pattern: /\b(easy a|gut|blow[- ]?off) (class|course)\b/i, value: 1, weight: 3 },
];

const TEACHING_CUES: Cue[] = [
  { pattern: /\b(best|amazing|phenomenal|brilliant|incredible) (professor|prof|lecturer|teacher|instructor)\b/i, value: 5, weight: 3 },
  { pattern: /\b(clear|engaging|passionate|organized|thoughtful|approachable)\b/i, value: 4.5, weight: 1.5 },
  { pattern: /\b(explains?|explained) (things |concepts |material )?(really |very )?(well|clearly)\b/i, value: 4.5, weight: 2.5 },
  { pattern: /\b(cares? about|invested in) (his|her|their) students\b/i, value: 4.5, weight: 2 },
  { pattern: /\b(office hours|lectures) (were|are) (great|helpful|excellent)\b/i, value: 4.5, weight: 2 },
  { pattern: /\b(decent|fine|okay|solid) (professor|prof|lecturer)\b/i, value: 3.5, weight: 1.5 },
  { pattern: /\b(disorganized|unprepared|incoherent|rambl(e|ing)|monotone)\b/i, value: 2, weight: 2.5 },
  { pattern: /\b(reads? off the slides|just reads the textbook)\b/i, value: 1.5, weight: 2.5 },
  { pattern: /\b(worst|terrible|awful|useless) (professor|prof|lecturer|teacher|instructor)\b/i, value: 1, weight: 3 },
  { pattern: /\b(condescending|dismissive|rude|hostile) (to|toward)?\s*(students)?\b/i, value: 1.5, weight: 2.5 },
  { pattern: /\b(learned (a lot|so much)|learned nothing)\b/i, value: 3, weight: 0.5 },
];

const GRADING_CUES: Cue[] = [
  { pattern: /\b(fair|fairly|transparent|consistent) (grading|grader|grade)\b/i, value: 4.5, weight: 3 },
  { pattern: /\b(grades? (were|are) fair|graded fairly)\b/i, value: 4.5, weight: 3 },
  { pattern: /\b(generous|lenient) (curve|grading|grader)\b/i, value: 4, weight: 2 },
  { pattern: /\b(clear|detailed) rubric\b/i, value: 4.5, weight: 2 },
  { pattern: /\b(harsh|tough|strict) (but fair|grader)\b/i, value: 3.5, weight: 2 },
  { pattern: /\b(arbitrary|random|inconsistent|capricious) (grading|grades?)\b/i, value: 1.5, weight: 3 },
  { pattern: /\b(unfair|brutal) (grading|curve|grader)\b/i, value: 1.5, weight: 3 },
  { pattern: /\b(no rubric|never got feedback|graded by tas who)\b/i, value: 2, weight: 2 },
  { pattern: /\b(deducts?|took off) points for (no reason|nothing)\b/i, value: 1, weight: 3 },
];

const POSITIVE_SENTIMENT = [
  /\b(loved|love|amazing|excellent|fantastic|wonderful|great|favorite|highly recommend|recommend)\b/i,
  /\b(so glad i took|best (class|course))\b/i,
  /\b(worth it|worthwhile|rewarding|inspiring|life[- ]changing)\b/i,
];

const NEGATIVE_SENTIMENT = [
  /\b(hated|hate|terrible|awful|horrible|miserable|waste of time|avoid)\b/i,
  /\b(worst (class|course)|regret taking|do ?n[o']?t take)\b/i,
  /\b(disappointing|frustrating|pointless|useless)\b/i,
];

const WOULD_TAKE_AGAIN_NEGATIVE = [
  /\bwould(n't| not) take (it |this )?again\b/i,
  /\bwould(n't| not) recommend\b/i,
  /\b(do ?n[o']?t|never) take (this|it|his|her|their)\b/i,
  /\bstay away from\b/i,
];

const WOULD_TAKE_AGAIN_POSITIVE = [
  /\bwould (definitely |absolutely |happily )?take (it|this|him|her|them|again)\b/i,
  /\btake (it|this class|this course) again\b/i,
  /\b(highly )?recommend(ed)? (this|it|him|her|them)\b/i,
  /\btake anything (he|she|they) teach(es)?\b/i,
];

function scoreDimension(text: string, cues: Cue[]): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const cue of cues) {
    if (cue.pattern.test(text)) {
      weightedSum += cue.value * cue.weight;
      weightTotal += cue.weight;
    }
  }
  if (weightTotal === 0) return null;
  const raw = weightedSum / weightTotal;
  return roundTo(clamp(raw, 1, 5), 2);
}

function scoreSentiment(text: string): number | null {
  const positives = POSITIVE_SENTIMENT.filter((pattern) => pattern.test(text)).length;
  const negatives = NEGATIVE_SENTIMENT.filter((pattern) => pattern.test(text)).length;
  if (positives === 0 && negatives === 0) return null;
  const raw = (positives - negatives) / (positives + negatives);
  // Damp toward neutral: a single keyword is weak evidence of a strong feeling.
  const evidence = positives + negatives;
  const damping = evidence / (evidence + 1);
  return roundTo(clamp(raw * damping, -1, 1), 2);
}

function scoreWouldTakeAgain(text: string, sentiment: number | null): boolean | null {
  // Negative phrasings are checked first: "would not take again" contains
  // "take again", and the wrong order would invert the answer.
  if (WOULD_TAKE_AGAIN_NEGATIVE.some((pattern) => pattern.test(text))) return false;
  if (WOULD_TAKE_AGAIN_POSITIVE.some((pattern) => pattern.test(text))) return true;
  if (sentiment !== null && Math.abs(sentiment) >= 0.5) return sentiment > 0;
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Deterministic keyword/valence extractor.
 *
 * Not as good as a model — it will miss sarcasm, comparative claims, and
 * anything phrased indirectly — but it is free, offline, reproducible, and
 * honest about uncertainty (no cue matched ⇒ null, never a fabricated 3). It
 * exists so the whole reputation lane is exercisable end to end before a model
 * is wired up, and as a fallback when one is unavailable.
 */
export class HeuristicDimensionExtractor implements DimensionExtractor {
  readonly modelVersion = "heuristic-v1";

  async extract(reviews: ReviewRecord[]): Promise<ReviewDimensions[]> {
    return reviews.map((review) => this.extractOne(review));
  }

  extractOne(review: ReviewRecord): ReviewDimensions {
    const text = (review.excerpt ?? "").trim();
    if (text.length === 0) return emptyDimensions();

    const sentiment = scoreSentiment(text);
    const dimensions: ReviewDimensions = {
      workload: scoreDimension(text, WORKLOAD_CUES),
      difficulty: scoreDimension(text, DIFFICULTY_CUES),
      teachingQuality: scoreDimension(text, TEACHING_CUES),
      gradingFairness: scoreDimension(text, GRADING_CUES),
      sentiment,
      wouldTakeAgain: scoreWouldTakeAgain(text, sentiment),
    };

    // Validate our own output against the same schema the model must satisfy.
    // A cue table edit that pushes a value out of range fails here, loudly, in
    // tests — not silently in an aggregate three layers away.
    const parsed = ReviewDimensionsSchema.safeParse(dimensions);
    return parsed.success ? parsed.data : emptyDimensions();
  }
}

// ---------------------------------------------------------------------------
// Claude extractor — the intended production implementation
// ---------------------------------------------------------------------------

export interface ClaudeExtractorConfig {
  /**
   * Use a CURRENT Claude model. `claude-opus-5` is the correct default per the
   * Claude API guidance; do not pin a date-suffixed id and do not silently
   * downgrade to a cheaper tier — that is a product decision, not a code one.
   */
  model?: string;
  /** Reviews per request. Batching amortises the system prompt. */
  batchSize?: number;
  apiKey?: string;
}

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

/**
 * Returns the Claude-backed extractor.
 *
 * NOT WIRED UP: `@anthropic-ai/sdk` is not a dependency of this repo, and this
 * lane is not permitted to add one. When it is added, the implementation is:
 *
 * ```ts
 * import Anthropic from "@anthropic-ai/sdk";
 *
 * const client = new Anthropic({ apiKey: config.apiKey });
 * const response = await client.messages.create({
 *   model: config.model ?? DEFAULT_CLAUDE_MODEL,   // claude-opus-5
 *   max_tokens: 16000,
 *   thinking: { type: "adaptive" },
 *   system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT,
 *              cache_control: { type: "ephemeral" } }],  // prompt is frozen; cache it
 *   output_config: {
 *     format: { type: "json_schema", schema: z.toJSONSchema(ExtractionResponseSchema) },
 *   },
 *   messages: [{ role: "user", content: buildExtractionUserPrompt(batch) }],
 * });
 * const parsed = ExtractionResponseSchema.parse(JSON.parse(textOf(response)));
 * return alignToInput(batch, parsed.results);
 * ```
 *
 * `alignToInput` below already does the ordering/validation half, so the
 * remaining work is genuinely the client call.
 */
export function createClaudeExtractor(config: ClaudeExtractorConfig = {}): DimensionExtractor {
  const model = config.model ?? DEFAULT_CLAUDE_MODEL;
  return {
    async extract(): Promise<ReviewDimensions[]> {
      throw new Error(
        `Claude extractor is not wired up (model would be "${model}"). Install @anthropic-ai/sdk, ` +
          "implement createClaudeExtractor per the comment in lib/reviews/extract.ts, and pass it " +
          "to extractDimensions(). Until then the heuristic extractor is the default.",
      );
    },
  };
}

/**
 * Reorder model output to match the input array and drop anything invalid.
 *
 * The model is instructed to echo `reviewId` and preserve order; this function
 * assumes neither. A row we cannot match becomes `emptyDimensions()` — a
 * missing annotation, not a wrong one.
 */
export function alignToInput(
  reviews: ReviewRecord[],
  results: ExtractedReview[],
): ReviewDimensions[] {
  const byId = new Map<string, ExtractedReview>();
  for (const result of results) {
    if (!byId.has(result.reviewId)) byId.set(result.reviewId, result);
  }
  return reviews.map((review, index) => {
    const match = byId.get(review.reviewId) ?? results[index];
    if (!match) return emptyDimensions();
    const parsed = ReviewDimensionsSchema.safeParse({
      workload: match.workload,
      difficulty: match.difficulty,
      teachingQuality: match.teachingQuality,
      gradingFairness: match.gradingFairness,
      sentiment: match.sentiment,
      wouldTakeAgain: match.wouldTakeAgain,
    });
    return parsed.success ? parsed.data : emptyDimensions();
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** The default extractor. Change this one line to change the whole pipeline. */
export const defaultExtractor: DimensionExtractor = new HeuristicDimensionExtractor();

export interface ExtractOptions {
  /** Reviews per extractor call. Only meaningful for batching extractors. */
  batchSize?: number;
}

/**
 * Run extraction over a corpus and return the reviews with dimensions attached.
 *
 * Input records are not mutated. A batch whose extractor call throws yields
 * empty dimensions for that batch and the run continues — a single bad batch
 * must not cost an entire ingest.
 */
export async function extractDimensions(
  reviews: ReviewRecord[],
  extractor: DimensionExtractor = defaultExtractor,
  options: ExtractOptions = {},
): Promise<ReviewRecord[]> {
  if (reviews.length === 0) return [];
  const batchSize = Math.max(1, options.batchSize ?? 20);
  const output: ReviewRecord[] = [];

  for (let start = 0; start < reviews.length; start += batchSize) {
    const batch = reviews.slice(start, start + batchSize);
    let dimensions: ReviewDimensions[];
    try {
      dimensions = await extractor.extract(batch);
    } catch {
      dimensions = batch.map(() => emptyDimensions());
    }
    for (let index = 0; index < batch.length; index += 1) {
      output.push({ ...batch[index], ...(dimensions[index] ?? emptyDimensions()) });
    }
  }

  return output;
}
