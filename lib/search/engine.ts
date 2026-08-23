/**
 * Columbia Catalog — the query engine.
 *
 * This class runs IN THE BROWSER, on every keystroke, against the local index.
 * The budget is one frame: 16 ms from keystroke to results (spec §19). Two
 * consequences shape the whole file:
 *
 *  1. **No allocation in the hot path.** Every buffer the query needs is
 *     allocated once, at construction, and reused. "Clearing" a buffer between
 *     queries is done with an epoch stamp rather than a fill, so per-query work
 *     is proportional to the documents actually touched, not to catalog size.
 *
 *  2. **No work that the builder could have done.** idf, the BM25 length
 *     normalization, the sorted dictionary, the trigram index, and every
 *     filterable attribute arrive precomputed. The engine multiplies and
 *     compares; it does not parse, normalize, or allocate objects per document.
 *
 * Ranking is a fusion of four signals, in descending order of trustworthiness:
 *
 *   exact course code  >  title match  >  BM25 over all fields  >  semantics
 *
 * Fuzzy matching never brute-forces edit distance over the dictionary. The
 * trigram index shortlists a few hundred candidates and bounded Levenshtein
 * runs only on those.
 */

import type { SearchFilters, SearchHit, SearchResult, TermCode, Weekday } from "../types";
import type { CourseListItem } from "../catalog-list-types";
import type { SearchFacets } from "@/components/catalog/search-source";
import {
  buildFacetsForTerm,
  coursesForTerm,
  seatOverlayEntriesForTerm,
} from "./display-facets";
import {
  buildFieldBoostTable,
  CREDITS_QUANT,
  CREDITS_UNKNOWN,
  COURSE_WORDS,
  CW_CREDITS_DAYS,
  CW_COURSE_ID_STR,
  CW_NUMBER_DOCLEN,
  CW_REQ_FLAGS,
  CW_SECTION_COUNT_TERMMASK,
  CW_SECTION_START,
  CW_SUBJECT_SCHOOL,
  CW_TIME_RANGE,
  CW_TITLE_STR,
  DAY_BIT,
  FIELD_TITLE,
  POSTING_DOC_SHIFT,
  SECTION_WORDS,
  SW_DAYS_TERM_INSTR,
  SW_INSTR_START,
  SW_SECTION_ID_STR,
  SW_TIME,
  TIME_UNKNOWN,
  TRIGRAM_SPACE,
  VarintCursor,
  WEIGHT_TABLE,
  lowerBoundTerm,
  lookupTerm,
  popcount32,
  readString,
  termHasPrefix,
  type EmbeddingBlock,
  type SerializedIndex,
} from "./index-format";
import {
  boundedEditDistance,
  foldText,
  fuzzyBudget,
  parseQuery,
  trigramsInto,
  type ParsedQuery,
  type QueryTermGroup,
} from "./tokenize";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Additive score for a document whose canonical code the user typed exactly. */
const EXACT_CODE_BOOST = 250;
/** Additive score when every non-trivial query term appears in the title. */
const FULL_TITLE_BOOST = 60;
/** Additive score when the title *starts* with the query. */
const TITLE_PREFIX_BOOST = 35;

/** Prefix expansion guards — bound the as-you-type fan-out. */
const MAX_PREFIX_TERMS = 24;
const MAX_PREFIX_SCAN = 4096;
const MAX_PREFIX_POSTINGS = 60_000;
const PREFIX_WEIGHT = 0.6;

/** Fuzzy guards. */
const MAX_FUZZY_CANDIDATES = 384;
const MAX_FUZZY_TERMS = 6;
/** Trigrams shared by more than this many dictionary terms carry no signal. */
const TRIGRAM_BUCKET_CAP = 4096;
const FUZZY_WEIGHT_BY_DISTANCE = [1, 0.55, 0.3];

/** Default cap on materialized hits. `total` is always the true match count. */
const DEFAULT_MAX_HITS = 2000;

const nowMs: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

// ---------------------------------------------------------------------------
// Overlays — the volatile half of the data, never baked into the index
// ---------------------------------------------------------------------------

/** Live seat state, keyed by section id. See spec §9 "live seat overlay". */
export interface SeatOverlayEntry {
  sectionId: string;
  hasOpenSeats: boolean;
}

/**
 * Aggregated reputation, keyed by course id. Course quality and instructor
 * quality are separate numbers and are never averaged (AGENTS.md).
 */
export interface ReputationOverlayEntry {
  courseId: string;
  workload: number | null;
  teachingQuality: number | null;
}

export interface SearchEngineOptions {
  /**
   * Maximum SearchHit objects materialized per query. The virtualized list
   * never renders more than a few dozen rows; this exists so a filter-free
   * query cannot spend its frame budget allocating 15k objects. `total`
   * reports the real match count regardless.
   */
  maxHits?: number;
  /** Weight of the semantic signal in the fusion, once embeddings are loaded. */
  semanticWeight?: number;
  /** How many Hamming-ranked hits get the float rescore pass. */
  rescoreDepth?: number;
}

/**
 * Supplied by the host app once an embedding model is available. Returning
 * null (the default, since no provider is wired up) keeps search lexical-only.
 */
export type QueryEmbedder = (query: string) => Float32Array | null;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SearchEngine {
  readonly index: SerializedIndex;
  readonly courseCount: number;
  readonly sectionCount: number;

  /** Decoded once at construction — every hit needs its course id. */
  readonly courseIds: string[];
  private readonly displayByCourseId: Map<string, CourseListItem>;
  private readonly displayByOrd: CourseListItem[];
  private readonly sectionIdCache: (string | undefined)[];

  private readonly maxHits: number;
  private readonly semanticWeight: number;
  private readonly rescoreDepth: number;

  // --- per-query scratch, allocated once ----------------------------------
  private readonly score: Float32Array;
  private readonly stamp: Int32Array;
  private readonly groupMask: Uint32Array;
  private readonly touched: Int32Array;
  private touchedCount = 0;
  private epoch = 0;

  private readonly hitDoc: Int32Array;
  private readonly hitScore: Float32Array;
  private readonly order: Int32Array;
  private readonly matchedSections: Int32Array;

  private readonly trigramCount: Uint16Array;
  private readonly trigramStamp: Int32Array;
  private trigramEpoch = 0;
  private readonly fuzzyCandidates: Int32Array;
  private readonly trigramScratch: Int32Array;
  private readonly prefixTerms: Int32Array;
  private readonly prefixDf: Int32Array;
  private readonly groupTermScratch: Int32Array;

  private readonly cursor: VarintCursor;
  private readonly trigramCursor: VarintCursor;
  private readonly boostTable: Float32Array;
  private readonly encoder = new TextEncoder();

  // --- filter lookup tables, sized by dictionary --------------------------
  private readonly subjectAllow: Uint8Array;
  private readonly schoolAllow: Uint8Array;
  private readonly instructorAllow: Uint8Array;
  private readonly subjectIdByFolded: Map<string, number>;
  private readonly schoolIdByFolded: Map<string, number>;
  private readonly instructorIdByFolded: Map<string, number>;
  private readonly requirementBitByKey: Map<string, number>;
  private readonly termIdByCode: Map<string, number>;

  // --- overlays -----------------------------------------------------------
  private seatOpen: Uint8Array | null = null;
  private sectionOrdinalById: Map<string, number> | null = null;
  private repWorkload: Float32Array | null = null;
  private repTeaching: Float32Array | null = null;
  private repHas: Uint8Array | null = null;

  // --- semantics ----------------------------------------------------------
  private embedding: EmbeddingBlock | null = null;
  private queryEmbedder: QueryEmbedder | null = null;
  private semanticScratch: Float32Array | null = null;
  private queryCode: Uint32Array | null = null;

  constructor(index: SerializedIndex, options: SearchEngineOptions = {}) {
    this.index = index;
    this.courseCount = index.meta.courseCount;
    this.sectionCount = index.meta.sectionCount;
    this.maxHits = options.maxHits ?? DEFAULT_MAX_HITS;
    this.semanticWeight = options.semanticWeight ?? 12;
    this.rescoreDepth = options.rescoreDepth ?? 200;

    const n = this.courseCount;
    this.score = new Float32Array(n);
    this.stamp = new Int32Array(n);
    this.groupMask = new Uint32Array(n);
    this.touched = new Int32Array(n);
    this.hitDoc = new Int32Array(n);
    this.hitScore = new Float32Array(n);
    this.order = new Int32Array(n);
    this.matchedSections = new Int32Array(Math.max(1, this.sectionCount));

    const dictSize = index.meta.termDictSize;
    this.trigramCount = new Uint16Array(dictSize);
    this.trigramStamp = new Int32Array(dictSize);
    this.fuzzyCandidates = new Int32Array(MAX_FUZZY_CANDIDATES);
    this.trigramScratch = new Int32Array(64);
    this.prefixTerms = new Int32Array(MAX_PREFIX_TERMS);
    this.prefixDf = new Int32Array(MAX_PREFIX_TERMS);
    this.groupTermScratch = new Int32Array(MAX_PREFIX_TERMS + MAX_FUZZY_TERMS + 4);

    this.cursor = new VarintCursor(index.postings);
    this.trigramCursor = new VarintCursor(index.trigramPostings);
    this.boostTable = buildFieldBoostTable(index.meta.fieldBoosts);

    // Decode course ids up front: every returned hit needs one, and doing it
    // lazily would put a TextDecoder call in the frame budget.
    this.courseIds = new Array<string>(n);
    for (let doc = 0; doc < n; doc++) {
      this.courseIds[doc] = readString(index, index.courses[doc * COURSE_WORDS + CW_COURSE_ID_STR]);
    }

    this.displayByOrd = index.display;
    this.displayByCourseId = new Map<string, CourseListItem>();
    for (let doc = 0; doc < n; doc++) {
      const item = index.display[doc];
      if (item) this.displayByCourseId.set(this.courseIds[doc], item);
    }
    this.sectionIdCache = new Array<string | undefined>(this.sectionCount);

    this.subjectAllow = new Uint8Array(index.meta.subjects.length);
    this.schoolAllow = new Uint8Array(Math.max(1, index.meta.schools.length));
    this.instructorAllow = new Uint8Array(Math.max(1, index.meta.instructors.length));
    this.subjectIdByFolded = foldedIndex(index.meta.subjects);
    this.schoolIdByFolded = foldedIndex(index.meta.schools);
    this.instructorIdByFolded = foldedIndex(index.meta.instructors);
    this.requirementBitByKey = new Map(index.meta.requirementKeys.map((k, i) => [k, i]));
    this.termIdByCode = new Map(index.meta.termCodes.map((c, i) => [c, i]));
  }

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------

  /**
   * Install live seat state. Until this is called, `openSeatsOnly` is inert —
   * the index has no idea which sections are open, and silently returning zero
   * results would be worse than ignoring an unanswerable filter.
   */
  setSeatOverlay(entries: Iterable<SeatOverlayEntry>): void {
    if (!this.sectionOrdinalById) {
      const map = new Map<string, number>();
      for (let s = 0; s < this.sectionCount; s++) map.set(this.sectionId(s), s);
      this.sectionOrdinalById = map;
    }
    const open = this.seatOpen ?? new Uint8Array(Math.max(1, this.sectionCount));
    open.fill(0);
    for (const entry of entries) {
      const ordinal = this.sectionOrdinalById.get(entry.sectionId);
      if (ordinal !== undefined && entry.hasOpenSeats) open[ordinal] = 1;
    }
    this.seatOpen = open;
  }

  clearSeatOverlay(): void {
    this.seatOpen = null;
  }

  /** Install aggregated reputation for the workload / teaching-quality filters. */
  setReputationOverlay(entries: Iterable<ReputationOverlayEntry>): void {
    const workload = this.repWorkload ?? new Float32Array(this.courseCount);
    const teaching = this.repTeaching ?? new Float32Array(this.courseCount);
    const has = this.repHas ?? new Uint8Array(this.courseCount);
    workload.fill(0);
    teaching.fill(0);
    has.fill(0);
    const byId = new Map<string, number>();
    for (let doc = 0; doc < this.courseCount; doc++) byId.set(this.courseIds[doc], doc);
    for (const entry of entries) {
      const doc = byId.get(entry.courseId);
      if (doc === undefined) continue;
      has[doc] = 1;
      workload[doc] = entry.workload ?? Number.NaN;
      teaching[doc] = entry.teachingQuality ?? Number.NaN;
    }
    this.repWorkload = workload;
    this.repTeaching = teaching;
    this.repHas = has;
  }

  clearReputationOverlay(): void {
    this.repWorkload = null;
    this.repTeaching = null;
    this.repHas = null;
  }

  // -------------------------------------------------------------------------
  // Semantics (progressive — lexical search works without any of this)
  // -------------------------------------------------------------------------

  attachEmbeddings(block: EmbeddingBlock): void {
    if (block.info.docCount !== this.courseCount) {
      throw new Error(
        `Embedding block covers ${block.info.docCount} docs, index has ${this.courseCount}`,
      );
    }
    this.embedding = block;
    this.semanticScratch = new Float32Array(this.courseCount);
    this.queryCode = new Uint32Array(block.info.dims >>> 5);
  }

  setQueryEmbedder(embedder: QueryEmbedder | null): void {
    this.queryEmbedder = embedder;
  }

  /** True only when both an embedding block and a query embedder are present. */
  get hasSemantic(): boolean {
    return this.embedding !== null && this.queryEmbedder !== null;
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  search(filters: SearchFilters): SearchResult {
    const started = nowMs();
    const index = this.index;
    const courses = index.courses;
    const n = this.courseCount;

    const plan = this.planFilters(filters);
    const parsed = filters.q ? parseQuery(filters.q) : EMPTY_QUERY;

    // --- lexical retrieval --------------------------------------------------
    let requiredMask = 0;
    let usedQuery = false;
    if (!parsed.isEmpty) {
      this.epoch++;
      this.touchedCount = 0;
      requiredMask = this.retrieve(parsed);
      usedQuery = true;
      this.applyCodeBoosts(parsed);
      this.applyTitleBoosts(parsed);
    }

    // --- semantic fusion ----------------------------------------------------
    if (usedQuery && this.hasSemantic) {
      this.applySemantic(parsed);
    }

    // --- filtering + collection --------------------------------------------
    let hitCount = 0;
    const score = this.score;
    const groupMask = this.groupMask;

    // The collection loop is written out twice rather than behind a callback:
    // a closure here would force a context allocation and defeat inlining on
    // the one loop that runs once per catalog entry.
    const hitDocBuf = this.hitDoc;
    const hitScoreBuf = this.hitScore;
    const sectionPass = plan.sectionFilterActive;

    if (usedQuery) {
      const touched = this.touched;
      const count = this.touchedCount;
      for (let i = 0; i < count; i++) {
        const doc = touched[i];
        if ((groupMask[doc] & requiredMask) !== requiredMask) continue;
        if (!this.passesCourseFilters(doc, plan)) continue;
        if (sectionPass && this.collectMatchingSections(doc, plan) === 0) continue;
        hitDocBuf[hitCount] = doc;
        hitScoreBuf[hitCount] = score[doc];
        hitCount++;
      }
    } else {
      // No query: every course is a candidate. Ranking falls back to catalog
      // order (lower course numbers first) so browsing is stable and useful.
      for (let doc = 0; doc < n; doc++) {
        if (!this.passesCourseFilters(doc, plan)) continue;
        if (sectionPass && this.collectMatchingSections(doc, plan) === 0) continue;
        hitDocBuf[hitCount] = doc;
        hitScoreBuf[hitCount] = -(courses[doc * COURSE_WORDS + CW_NUMBER_DOCLEN] & 0xffff);
        hitCount++;
      }
    }

    // --- sort ---------------------------------------------------------------
    const order = this.order.subarray(0, hitCount);
    for (let i = 0; i < hitCount; i++) order[i] = i;
    const hitScore = this.hitScore;
    const hitDoc = this.hitDoc;
    order.sort((a, b) => {
      const diff = hitScore[b] - hitScore[a];
      if (diff !== 0) return diff;
      // Deterministic tie-break: catalog order (courseId ascending).
      return hitDoc[a] - hitDoc[b];
    });

    // --- materialize --------------------------------------------------------
    const limit = hitCount < this.maxHits ? hitCount : this.maxHits;
    const hits: SearchHit[] = new Array(limit);
    for (let i = 0; i < limit; i++) {
      const slot = order[i];
      const doc = hitDoc[slot];
      let matchedSectionIds: string[] | null = null;
      if (plan.reportSections) {
        const matched = this.collectMatchingSections(doc, plan);
        matchedSectionIds = new Array(matched);
        for (let k = 0; k < matched; k++) {
          matchedSectionIds[k] = this.sectionId(this.matchedSections[k]);
        }
      }
      hits[i] = { courseId: this.courseIds[doc], score: hitScore[slot], matchedSectionIds };
    }

    return { hits, total: hitCount, elapsedMs: nowMs() - started };
  }

  /** Row display record for a hit. From the DISP block baked at index build. */
  getCourse(courseId: string): CourseListItem | undefined {
    return this.displayByCourseId.get(courseId);
  }

  /** Filter menu values for one term. */
  facetsForTerm(termCode: TermCode): SearchFacets {
    return buildFacetsForTerm(this.displayByOrd, termCode);
  }

  /** Courses with at least one section in the term — for empty-state copy. */
  totalCoursesForTerm(termCode: TermCode): number {
    return coursesForTerm(this.displayByOrd, termCode).length;
  }

  /** Initial seat overlay from the index snapshot until live polling lands. */
  seatOverlayForTerm(termCode: TermCode): SeatOverlayEntry[] {
    return seatOverlayEntriesForTerm(this.displayByOrd, termCode);
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Walk postings for every query group and accumulate BM25 into `score`.
   * @returns the bitmask of groups a document must match to be a candidate.
   *          A group whose terms are absent from the dictionary entirely is
   *          excluded from the requirement, so one unknown word (a professor's
   *          nickname, "columbia") cannot zero out an otherwise good query.
   */
  private retrieve(parsed: ParsedQuery): number {
    const groups = parsed.groups;
    const groupCount = groups.length > 32 ? 32 : groups.length;
    let requiredMask = 0;

    for (let g = 0; g < groupCount; g++) {
      const group = groups[g];
      const bit = 1 << g;
      const termCount = this.resolveGroupTerms(group);
      if (termCount === 0) continue;
      // A group that resolved to at least one real term is required, unless it
      // is a low-signal stopword (variant weight below 1).
      if (group.variants[0].weight >= 1) requiredMask |= bit;
      for (let i = 0; i < termCount; i++) {
        const packed = this.groupTermScratch[i];
        const termId = packed >>> 8;
        const weight = (packed & 0xff) / 100;
        this.accumulate(termId, weight, bit);
      }
    }
    return requiredMask;
  }

  /**
   * Resolve one query group into concrete dictionary term ids, packed as
   * `(termId << 8) | round(weight * 100)` in `groupTermScratch`.
   *
   * Order of attack: exact variants first (cheapest, strongest), then prefix
   * expansion for the trailing token, then trigram-shortlisted fuzzy candidates
   * only if the literal token is not in the dictionary at all.
   */
  private resolveGroupTerms(group: QueryTermGroup): number {
    const scratch = this.groupTermScratch;
    let count = 0;
    const push = (termId: number, weight: number): void => {
      if (count >= scratch.length) return;
      for (let i = 0; i < count; i++) if (scratch[i] >>> 8 === termId) return;
      const w = Math.round(Math.min(2.55, weight) * 100);
      scratch[count++] = (termId << 8) | w;
    };

    let literalFound = false;
    for (let v = 0; v < group.variants.length; v++) {
      const variant = group.variants[v];
      const bytes = this.encoder.encode(variant.text);
      const termId = lookupTerm(this.index, bytes);
      if (termId >= 0) {
        push(termId, variant.weight);
        if (v === 0) literalFound = true;
      }
    }

    if (group.allowPrefix) {
      const added = this.expandPrefix(group.variants[0].text, push);
      if (added > 0) literalFound = true;
    }

    if (!literalFound && group.allowFuzzy) {
      this.expandFuzzy(group.variants[0].text, push);
    }

    return count;
  }

  /**
   * Prefix expansion for as-you-type. Binary-searches the sorted dictionary for
   * the range start, then keeps the highest-document-frequency terms in the
   * range — "comp" should reach "computer" before "compactification".
   */
  private expandPrefix(prefix: string, push: (termId: number, weight: number) => void): number {
    const index = this.index;
    const bytes = this.encoder.encode(prefix);
    const start = lowerBoundTerm(index, bytes);
    const dictSize = index.meta.termDictSize;
    const terms = this.prefixTerms;
    const dfs = this.prefixDf;
    let kept = 0;
    let minDf = 0;
    let minSlot = 0;
    let scanned = 0;

    for (let termId = start; termId < dictSize && scanned < MAX_PREFIX_SCAN; termId++, scanned++) {
      if (!termHasPrefix(index, termId, bytes)) break;
      const df = index.termDocFreq[termId];
      if (kept < MAX_PREFIX_TERMS) {
        terms[kept] = termId;
        dfs[kept] = df;
        kept++;
        if (kept === MAX_PREFIX_TERMS) {
          minDf = dfs[0];
          minSlot = 0;
          for (let i = 1; i < kept; i++) {
            if (dfs[i] < minDf) {
              minDf = dfs[i];
              minSlot = i;
            }
          }
        }
      } else if (df > minDf) {
        terms[minSlot] = termId;
        dfs[minSlot] = df;
        minDf = dfs[0];
        minSlot = 0;
        for (let i = 1; i < kept; i++) {
          if (dfs[i] < minDf) {
            minDf = dfs[i];
            minSlot = i;
          }
        }
      }
    }

    // Spend the posting budget on the most frequent terms first, so a one- or
    // two-character prefix degrades by dropping rare terms, not by blowing the
    // frame budget.
    let budget = MAX_PREFIX_POSTINGS;
    let added = 0;
    for (let round = 0; round < kept; round++) {
      let best = -1;
      let bestDf = -1;
      for (let i = 0; i < kept; i++) {
        if (dfs[i] > bestDf) {
          bestDf = dfs[i];
          best = i;
        }
      }
      if (best < 0 || bestDf < 0) break;
      dfs[best] = -1;
      if (bestDf > budget) continue;
      budget -= bestDf;
      // An exact hit on the prefix itself keeps full weight; longer completions
      // are discounted so "data" beats "database" when the user typed "data".
      const isExact = index.termOffsets[terms[best] + 1] - index.termOffsets[terms[best]] === bytes.length;
      push(terms[best], isExact ? 1 : PREFIX_WEIGHT);
      added++;
    }
    return added;
  }

  /**
   * Typo tolerance. Candidate terms come from trigram overlap with the typed
   * token; only those candidates pay for a bounded Levenshtein computation.
   * The dictionary is never scanned.
   */
  private expandFuzzy(term: string, push: (termId: number, weight: number) => void): void {
    const budget = fuzzyBudget(term.length);
    if (budget === 0) return;

    const index = this.index;
    const gramCount = trigramsInto(term, this.trigramScratch);
    if (gramCount === 0) return;

    this.trigramEpoch++;
    const stamp = this.trigramStamp;
    const counts = this.trigramCount;
    const epoch = this.trigramEpoch;
    const candidates = this.fuzzyCandidates;
    let candidateCount = 0;

    // A candidate must share at least this many trigrams. Derived from the
    // edit budget: each edit destroys at most 3 trigrams.
    const threshold = Math.max(1, gramCount - 3 * budget);
    const cursor = this.trigramCursor;

    for (let g = 0; g < gramCount && candidateCount < MAX_FUZZY_CANDIDATES; g++) {
      const gram = this.trigramScratch[g];
      if (gram < 0 || gram >= TRIGRAM_SPACE) continue;
      const start = index.trigramOffsets[gram];
      const end = index.trigramOffsets[gram + 1];
      if (end - start > TRIGRAM_BUCKET_CAP * 2) continue; // non-discriminative
      cursor.reset(start);
      let termId = 0;
      let walked = 0;
      while (cursor.pos < end && walked < TRIGRAM_BUCKET_CAP) {
        termId += cursor.next();
        walked++;
        if (stamp[termId] !== epoch) {
          stamp[termId] = epoch;
          counts[termId] = 1;
        } else {
          counts[termId]++;
        }
        if (counts[termId] === threshold && candidateCount < MAX_FUZZY_CANDIDATES) {
          candidates[candidateCount++] = termId;
        }
      }
    }

    // Rank the shortlist by (edit distance asc, document frequency desc).
    let kept = 0;
    const bestTerms = this.prefixTerms;
    const bestDist = this.prefixDf;
    for (let i = 0; i < candidateCount; i++) {
      const termId = candidates[i];
      const candidate = this.readTermAscii(termId);
      const dist = boundedEditDistance(term, candidate, budget);
      if (dist > budget || dist === 0) continue;
      if (kept < MAX_FUZZY_TERMS) {
        bestTerms[kept] = termId;
        bestDist[kept] = dist;
        kept++;
      } else {
        let worst = 0;
        for (let k = 1; k < kept; k++) if (bestDist[k] > bestDist[worst]) worst = k;
        if (dist < bestDist[worst]) {
          bestTerms[worst] = termId;
          bestDist[worst] = dist;
        }
      }
    }
    for (let i = 0; i < kept; i++) {
      push(bestTerms[i], FUZZY_WEIGHT_BY_DISTANCE[bestDist[i]] ?? 0.25);
    }
  }

  /**
   * The inner loop. One varint per posting yields the doc gap, the precomputed
   * BM25 tf weight and the field mask — so scoring is a table lookup and a
   * multiply-accumulate, with no division and no branch on field type.
   */
  private accumulate(termId: number, weight: number, groupBit: number): void {
    const index = this.index;
    const start = index.postingOffsets[termId];
    const end = index.postingOffsets[termId + 1];
    if (start === end) return;

    const idf = index.termIdf[termId] * weight;
    const cursor = this.cursor;
    cursor.reset(start);
    const score = this.score;
    const stamp = this.stamp;
    const groupMask = this.groupMask;
    const touched = this.touched;
    const boost = this.boostTable;
    const epoch = this.epoch;
    let touchedCount = this.touchedCount;
    let doc = 0;

    while (cursor.pos < end) {
      const packed = cursor.next();
      doc += packed >>> POSTING_DOC_SHIFT;
      const contribution = idf * WEIGHT_TABLE[(packed >>> 4) & 0xff] * boost[packed & 0xf];
      if (stamp[doc] !== epoch) {
        stamp[doc] = epoch;
        score[doc] = contribution;
        groupMask[doc] = groupBit;
        touched[touchedCount++] = doc;
      } else {
        score[doc] += contribution;
        groupMask[doc] |= groupBit;
      }
    }
    this.touchedCount = touchedCount;
  }

  /**
   * Exact course-code match dominates everything else. A student who types
   * "COMS 4118" wants that course first, not the best BM25 match for "coms".
   */
  private applyCodeBoosts(parsed: ParsedQuery): void {
    if (parsed.codeTokens.length === 0) return;
    const index = this.index;
    const score = this.score;
    const stamp = this.stamp;
    const groupMask = this.groupMask;
    const touched = this.touched;
    const epoch = this.epoch;
    const cursor = this.cursor;

    for (const code of parsed.codeTokens) {
      const termId = lookupTerm(index, this.encoder.encode(code));
      if (termId < 0) continue;
      const start = index.postingOffsets[termId];
      const end = index.postingOffsets[termId + 1];
      cursor.reset(start);
      let doc = 0;
      while (cursor.pos < end) {
        const packed = cursor.next();
        doc += packed >>> POSTING_DOC_SHIFT;
        if (stamp[doc] !== epoch) {
          stamp[doc] = epoch;
          score[doc] = EXACT_CODE_BOOST;
          groupMask[doc] = 0xffffffff;
          touched[this.touchedCount++] = doc;
        } else {
          score[doc] += EXACT_CODE_BOOST;
          // An exact code hit satisfies the query outright, so it is exempt
          // from the "all terms must match" requirement.
          groupMask[doc] = 0xffffffff;
        }
      }
    }
  }

  /**
   * Title boosts. Documents where every substantive query term occurs in the
   * title outrank documents that merely mention them in a description, and a
   * title that *starts* with the query outranks one that contains it.
   */
  private applyTitleBoosts(parsed: ParsedQuery): void {
    const groups = parsed.groups;
    if (groups.length === 0) return;
    const index = this.index;
    const score = this.score;
    const stamp = this.stamp;
    const epoch = this.epoch;
    const cursor = this.cursor;

    // Count, per touched doc, how many substantive query groups hit the title.
    let substantive = 0;
    const perDoc = this.titleHitScratch();
    for (let g = 0; g < groups.length && g < 32; g++) {
      const group = groups[g];
      if (group.variants[0].weight < 1) continue;
      substantive++;
      const termId = lookupTerm(index, this.encoder.encode(group.variants[0].text));
      if (termId < 0) continue;
      const start = index.postingOffsets[termId];
      const end = index.postingOffsets[termId + 1];
      cursor.reset(start);
      let doc = 0;
      while (cursor.pos < end) {
        const packed = cursor.next();
        doc += packed >>> POSTING_DOC_SHIFT;
        if ((packed & FIELD_TITLE) === 0) continue;
        if (stamp[doc] !== epoch) continue;
        perDoc[doc] += 1;
      }
    }
    if (substantive === 0) return;

    const touched = this.touched;
    const count = this.touchedCount;
    const foldedQuery = parsed.folded;
    for (let i = 0; i < count; i++) {
      const doc = touched[i];
      const hits = perDoc[doc];
      if (hits === 0) continue;
      if (hits >= substantive) {
        score[doc] += FULL_TITLE_BOOST;
        const title = readString(index, index.courses[doc * COURSE_WORDS + CW_TITLE_STR]);
        if (foldText(title).startsWith(foldedQuery)) score[doc] += TITLE_PREFIX_BOOST;
      } else {
        score[doc] += (FULL_TITLE_BOOST * hits) / substantive / 2;
      }
      perDoc[doc] = 0;
    }
  }

  private titleHitBuffer: Uint8Array | null = null;
  private titleHitScratch(): Uint8Array {
    if (!this.titleHitBuffer) this.titleHitBuffer = new Uint8Array(this.courseCount);
    return this.titleHitBuffer;
  }

  /**
   * Semantic fusion. Hamming distance over binary-quantized vectors ranks the
   * whole catalog cheaply (one popcount per 32 dimensions), then the top
   * `rescoreDepth` get an int8 dot-product rescore when that block shipped.
   */
  private applySemantic(parsed: ParsedQuery): void {
    const block = this.embedding;
    const embedder = this.queryEmbedder;
    const sims = this.semanticScratch;
    const queryCode = this.queryCode;
    if (!block || !embedder || !sims || !queryCode) return;

    const vector = embedder(parsed.raw);
    if (!vector) return;

    const dims = block.info.dims;
    const words = dims >>> 5;
    queryCode.fill(0);
    for (let d = 0; d < dims; d++) {
      if (vector[d] > 0) queryCode[d >>> 5] |= 1 << (d & 31);
    }

    const binary = block.binary;
    const n = this.courseCount;
    const invDims = 1 / dims;
    for (let doc = 0; doc < n; doc++) {
      const base = doc * words;
      let distance = 0;
      for (let w = 0; w < words; w++) distance += popcount32(binary[base + w] ^ queryCode[w]);
      // Hamming -> cosine proxy in [-1, 1].
      sims[doc] = 1 - 2 * distance * invDims;
    }

    // Float rescore over the top slice.
    if (block.rescore && block.rescoreScale) {
      const depth = this.rescoreDepth;
      const topDocs = this.selectTop(sims, depth);
      for (let i = 0; i < topDocs.length; i++) {
        const doc = topDocs[i];
        const off = doc * dims;
        const scale = block.rescoreScale[doc];
        let dot = 0;
        let norm = 0;
        for (let d = 0; d < dims; d++) {
          const value = block.rescore[off + d] * scale;
          dot += value * vector[d];
          norm += value * value;
        }
        sims[doc] = norm > 0 ? dot / Math.sqrt(norm) : sims[doc];
      }
    }

    // Fuse into the lexical scores of documents we already touched. Semantic
    // similarity re-ranks lexical candidates; it does not invent new ones,
    // which keeps recall predictable and the filter pass bounded.
    const touched = this.touched;
    const count = this.touchedCount;
    const score = this.score;
    const weight = this.semanticWeight;
    for (let i = 0; i < count; i++) {
      const doc = touched[i];
      score[doc] += weight * sims[doc];
    }
  }

  private semanticOrder: Int32Array | null = null;
  private selectTop(values: Float32Array, depth: number): Int32Array {
    const n = values.length;
    const k = depth < n ? depth : n;
    let order = this.semanticOrder;
    if (!order || order.length !== n) order = this.semanticOrder = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => values[b] - values[a]);
    return order.subarray(0, k);
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  private planFilters(filters: SearchFilters): FilterPlan {
    const plan = this.plan;
    plan.reset();

    if (filters.subjects && filters.subjects.length > 0) {
      this.subjectAllow.fill(0);
      let any = false;
      for (const subject of filters.subjects) {
        const id = this.subjectIdByFolded.get(foldText(subject));
        if (id !== undefined) {
          this.subjectAllow[id] = 1;
          any = true;
        }
      }
      plan.subjects = true;
      plan.subjectsMatchable = any;
    }

    if (filters.schools && filters.schools.length > 0) {
      this.schoolAllow.fill(0);
      let any = false;
      for (const school of filters.schools) {
        const id = this.schoolIdByFolded.get(foldText(school));
        if (id !== undefined) {
          this.schoolAllow[id] = 1;
          any = true;
        }
      }
      plan.schools = true;
      plan.schoolsMatchable = any;
    }

    if (filters.instructors && filters.instructors.length > 0) {
      this.instructorAllow.fill(0);
      let any = false;
      for (const name of filters.instructors) {
        const id = this.instructorIdByFolded.get(foldText(name));
        if (id !== undefined) {
          this.instructorAllow[id] = 1;
          any = true;
        }
      }
      plan.instructors = true;
      plan.instructorsMatchable = any;
    }

    if (filters.levelRange) {
      plan.levelMin = filters.levelRange[0];
      plan.levelMax = filters.levelRange[1];
      plan.level = true;
    }

    if (filters.creditsMin !== undefined || filters.creditsMax !== undefined) {
      plan.credits = true;
      plan.creditsMin = filters.creditsMin ?? 0;
      plan.creditsMax = filters.creditsMax ?? Number.POSITIVE_INFINITY;
    }

    if (filters.requirements && filters.requirements.length > 0) {
      let mask = 0;
      for (const key of filters.requirements) {
        const bit = this.requirementBitByKey.get(key);
        if (bit !== undefined) mask |= 1 << bit;
      }
      plan.requirementMask = mask >>> 0;
      plan.requirements = true;
    }

    if (filters.termCode !== undefined) {
      const termId = this.termIdByCode.get(filters.termCode);
      plan.termId = termId ?? -1;
      plan.term = true;
    }

    if (filters.days && filters.days.length > 0) {
      let mask = 0;
      for (const day of filters.days as Weekday[]) mask |= DAY_BIT[day] ?? 0;
      plan.dayMask = mask;
      plan.days = mask !== 0;
    }

    if (filters.startAfterMinute !== undefined) {
      plan.startAfter = filters.startAfterMinute;
      plan.time = true;
    }
    if (filters.endBeforeMinute !== undefined) {
      plan.endBefore = filters.endBeforeMinute;
      plan.time = true;
    }

    // openSeatsOnly is only meaningful with a live overlay installed.
    plan.openSeats = filters.openSeatsOnly === true && this.seatOpen !== null;

    if (this.repHas) {
      plan.maxWorkload = filters.maxWorkload;
      plan.minTeachingQuality = filters.minTeachingQuality;
      plan.includeUnrated = filters.includeUnrated !== false;
      plan.reputation =
        filters.maxWorkload !== undefined ||
        filters.minTeachingQuality !== undefined ||
        filters.includeUnrated === false;
    }

    // Section-level filters force a per-section pass. Per spec §6, the ones
    // that make matching sections user-visible are days, time, instructor and
    // open seats — a term filter narrows but does not "surface" sections.
    plan.reportSections = plan.days || plan.time || plan.instructors || plan.openSeats;
    plan.sectionFilterActive = plan.reportSections || plan.term;
    return plan;
  }

  private readonly plan = new FilterPlan();

  private passesCourseFilters(doc: number, plan: FilterPlan): boolean {
    const courses = this.index.courses;
    const base = doc * COURSE_WORDS;

    if (plan.subjects) {
      if (!plan.subjectsMatchable) return false;
      if (this.subjectAllow[courses[base + CW_SUBJECT_SCHOOL] & 0xffff] === 0) return false;
    }
    if (plan.schools) {
      if (!plan.schoolsMatchable) return false;
      const schoolId = courses[base + CW_SUBJECT_SCHOOL] >>> 16;
      if (schoolId === 0xffff || this.schoolAllow[schoolId] === 0) return false;
    }
    if (plan.level) {
      const number = courses[base + CW_NUMBER_DOCLEN] & 0xffff;
      if (number < plan.levelMin || number > plan.levelMax) return false;
    }
    if (plan.requirements) {
      // OR semantics: a course qualifies if it satisfies ANY selected
      // requirement. Students filter to "what can this count for", not to
      // "what counts for all of these at once".
      if ((courses[base + CW_REQ_FLAGS] & plan.requirementMask) === 0) return false;
    }
    if (plan.credits) {
      const packed = courses[base + CW_CREDITS_DAYS];
      const minQ = packed & 0xff;
      const maxQ = (packed >>> 8) & 0xff;
      // Unknown credits fail an explicit credits filter: the student asked a
      // question about credits and we cannot answer it for this course.
      if (minQ === CREDITS_UNKNOWN || maxQ === CREDITS_UNKNOWN) return false;
      const lo = minQ / CREDITS_QUANT;
      const hi = maxQ / CREDITS_QUANT;
      if (hi < plan.creditsMin || lo > plan.creditsMax) return false;
    }
    if (plan.term) {
      if (plan.termId < 0 || plan.termId >= 16) return false;
      const termMask = courses[base + CW_SECTION_COUNT_TERMMASK] >>> 16;
      if ((termMask & (1 << plan.termId)) === 0) return false;
    }
    if (plan.days) {
      // Course-level fast reject. The stored mask is the UNION over sections,
      // so it can only prove a negative: if no section meets on any selected
      // day, no section can fit inside them. Containment is decided per
      // section in collectMatchingSections.
      const dayMask = (courses[base + CW_CREDITS_DAYS] >>> 16) & 0xff;
      if ((dayMask & plan.dayMask) === 0) return false;
    }
    if (plan.time) {
      // Same shape as the day filter: the union range can only prove that no
      // section could possibly fit the window.
      const packed = courses[base + CW_TIME_RANGE];
      const earliest = packed & 0xffff;
      const latest = packed >>> 16;
      if (earliest === TIME_UNKNOWN || latest === TIME_UNKNOWN) return false;
      if (latest < plan.startAfter || earliest > plan.endBefore) return false;
    }
    if (plan.reputation) {
      const has = this.repHas;
      const workload = this.repWorkload;
      const teaching = this.repTeaching;
      if (has && workload && teaching) {
        if (has[doc] === 0) {
          if (!plan.includeUnrated) return false;
        } else {
          if (plan.maxWorkload !== undefined) {
            const value = workload[doc];
            if (Number.isNaN(value)) {
              if (!plan.includeUnrated) return false;
            } else if (value > plan.maxWorkload) return false;
          }
          if (plan.minTeachingQuality !== undefined) {
            const value = teaching[doc];
            if (Number.isNaN(value)) {
              if (!plan.includeUnrated) return false;
            } else if (value < plan.minTeachingQuality) return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Walk a course's sections and record the ordinals that satisfy every active
   * section-level filter. Results land in `this.matchedSections`.
   * @returns how many sections matched.
   */
  private collectMatchingSections(doc: number, plan: FilterPlan): number {
    const index = this.index;
    const courses = index.courses;
    const base = doc * COURSE_WORDS;
    const start = courses[base + CW_SECTION_START];
    const count = courses[base + CW_SECTION_COUNT_TERMMASK] & 0xffff;
    const sections = index.sections;
    const out = this.matchedSections;
    let matched = 0;

    for (let i = 0; i < count; i++) {
      const ordinal = start + i;
      const sbase = ordinal * SECTION_WORDS;
      const daysTermInstr = sections[sbase + SW_DAYS_TERM_INSTR];

      if (plan.term) {
        if (((daysTermInstr >>> 8) & 0xff) !== plan.termId) continue;
      }
      if (plan.days) {
        // CONTAINMENT semantics: the section must meet ONLY on selected days.
        // This matches the time-window filter, which requires a meeting to fit
        // entirely inside the window. Together the two controls answer one
        // coherent question — "what can I fit into the time I have free?" —
        // rather than two different ones. A section with no parsed meeting
        // days cannot be shown to satisfy a day filter, so it is excluded.
        const dayMask = daysTermInstr & 0xff;
        if (dayMask === 0 || (dayMask & ~plan.dayMask) !== 0) continue;
      }
      if (plan.time) {
        const packed = sections[sbase + SW_TIME];
        const startMinute = packed & 0xffff;
        const endMinute = packed >>> 16;
        if (startMinute === TIME_UNKNOWN || endMinute === TIME_UNKNOWN) continue;
        if (startMinute < plan.startAfter || endMinute > plan.endBefore) continue;
      }
      if (plan.instructors) {
        if (!plan.instructorsMatchable) continue;
        const instrCount = daysTermInstr >>> 16;
        const instrStart = sections[sbase + SW_INSTR_START];
        let hit = false;
        for (let k = 0; k < instrCount; k++) {
          if (this.instructorAllow[index.sectionInstructors[instrStart + k]] === 1) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
      }
      if (plan.openSeats) {
        const open = this.seatOpen;
        if (!open || open[ordinal] === 0) continue;
      }
      out[matched++] = ordinal;
    }
    return matched;
  }

  // -------------------------------------------------------------------------
  // String access
  // -------------------------------------------------------------------------

  /** Section ids are decoded on first use and cached; most are never needed. */
  sectionId(ordinal: number): string {
    const cached = this.sectionIdCache[ordinal];
    if (cached !== undefined) return cached;
    const value = readString(
      this.index,
      this.index.sections[ordinal * SECTION_WORDS + SW_SECTION_ID_STR],
    );
    this.sectionIdCache[ordinal] = value;
    return value;
  }

  courseTitle(doc: number): string {
    return readString(this.index, this.index.courses[doc * COURSE_WORDS + CW_TITLE_STR]);
  }

  /**
   * Dictionary terms are guaranteed ASCII by the tokenizer, so they decode with
   * fromCharCode — roughly an order of magnitude cheaper than TextDecoder for
   * the short strings fuzzy matching compares.
   */
  private readTermAscii(termId: number): string {
    const { termBytes, termOffsets } = this.index;
    const start = termOffsets[termId];
    const end = termOffsets[termId + 1];
    let out = "";
    for (let i = start; i < end; i++) out += String.fromCharCode(termBytes[i]);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Filter plan — one reused object, so planning allocates nothing per keystroke
// ---------------------------------------------------------------------------

class FilterPlan {
  subjects = false;
  subjectsMatchable = false;
  schools = false;
  schoolsMatchable = false;
  instructors = false;
  instructorsMatchable = false;
  level = false;
  levelMin = 0;
  levelMax = 0;
  credits = false;
  creditsMin = 0;
  creditsMax = 0;
  requirements = false;
  requirementMask = 0;
  term = false;
  termId = -1;
  days = false;
  dayMask = 0;
  time = false;
  startAfter = 0;
  endBefore = 24 * 60;
  openSeats = false;
  reputation = false;
  maxWorkload: number | undefined = undefined;
  minTeachingQuality: number | undefined = undefined;
  includeUnrated = true;
  sectionFilterActive = false;
  reportSections = false;

  reset(): void {
    this.subjects = false;
    this.subjectsMatchable = false;
    this.schools = false;
    this.schoolsMatchable = false;
    this.instructors = false;
    this.instructorsMatchable = false;
    this.level = false;
    this.credits = false;
    this.requirements = false;
    this.requirementMask = 0;
    this.term = false;
    this.termId = -1;
    this.days = false;
    this.dayMask = 0;
    this.time = false;
    this.startAfter = 0;
    this.endBefore = 24 * 60;
    this.openSeats = false;
    this.reputation = false;
    this.maxWorkload = undefined;
    this.minTeachingQuality = undefined;
    this.includeUnrated = true;
    this.sectionFilterActive = false;
    this.reportSections = false;
  }
}

const EMPTY_QUERY: ParsedQuery = {
  raw: "",
  folded: "",
  groups: [],
  codeTokens: [],
  isEmpty: true,
};

function foldedIndex(values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    const folded = foldText(values[i]);
    if (!map.has(folded)) map.set(folded, i);
  }
  return map;
}
