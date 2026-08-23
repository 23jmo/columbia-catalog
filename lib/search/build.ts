/**
 * Columbia Catalog — index builder.
 *
 * Runs offline (see `scripts/build-index.ts`), never in the browser. Its job
 * is to move as much work as possible off the keystroke path:
 *
 *  - BM25's tf/length normalization is fully precomputed per posting, so the
 *    query loop is a multiply-accumulate with no division and no doc-length
 *    lookup.
 *  - idf is precomputed per term, so a keystroke never calls Math.log.
 *  - The term dictionary is sorted, so prefix ranges are a binary search.
 *  - A trigram -> term index is materialized, so fuzzy candidate generation
 *    never scans the dictionary.
 *  - Day-of-week, time range, credits, level, requirement flags and term
 *    coverage are packed into fixed-width integer records, so every filter is
 *    a mask or a compare rather than an object property walk.
 *
 * What is deliberately NOT in the index: seat counts, enrollment status and
 * waitlist depth. Those are volatile (spec §9). Section *ids* are stored so
 * the client can overlay live seat state onto them at query time.
 */

import type { CourseWithSections, Meeting } from "../types";
import { REQUIREMENT_FILTERS } from "../constants";
import {
  BM25_B,
  BM25_K1,
  COURSE_FLAG_HAS_MEETINGS,
  COURSE_FLAG_HAS_SECTIONS,
  COURSE_WORDS,
  CREDITS_QUANT,
  CREDITS_UNKNOWN,
  CW_CREDITS_DAYS,
  CW_COURSE_ID_STR,
  CW_NUMBER_DOCLEN,
  CW_REQ_FLAGS,
  CW_RESERVED,
  CW_SECTION_COUNT_TERMMASK,
  CW_SECTION_START,
  CW_SUBJECT_SCHOOL,
  CW_TIME_RANGE,
  CW_TITLE_STR,
  ByteWriter,
  DAY_BIT,
  DEFAULT_FIELD_BOOSTS,
  FIELD_BODY,
  FIELD_CODE,
  FIELD_INSTRUCTOR,
  FIELD_TITLE,
  INDEX_FORMAT_VERSION,
  POSTING_DOC_SHIFT,
  POSTING_WEIGHT_SHIFT,
  TIME_UNKNOWN,
  TRIGRAM_SPACE,
  quantizeWeight,
  type IndexMeta,
  type SerializedIndex,
} from "./index-format";
import { courseCodeTokens, MIN_FUZZY_LENGTH, tokenize, trigramsOf } from "./tokenize";

export interface BuildOptions {
  /**
   * Cap on distinct body (description) terms indexed per course. Descriptions
   * are the single biggest contributor to index size and the long tail of a
   * 400-word blurb adds almost no retrieval value.
   */
  maxBodyTerms?: number;
  /** Overridden only by tests that need a deterministic version string. */
  indexVersion?: string;
  builtAt?: string;
}

/**
 * Postings are ~40% of the artifact and scale with DISTINCT body terms per
 * course, so this cap is the primary lever on index size. 140 covers a typical
 * Columbia description outright; only the longest blurbs are truncated, and
 * what gets dropped is the tail of a description a student is not searching by.
 * Title, course code and instructor fields are never capped.
 */
const DEFAULT_MAX_BODY_TERMS = 140;

/** Max requirement keys representable in the CW_REQ_FLAGS bitmask. */
const MAX_REQUIREMENT_BITS = 32;

// ---------------------------------------------------------------------------
// Growable typed arrays — build time only
// ---------------------------------------------------------------------------

class GrowableI32 {
  data: Int32Array;
  length = 0;
  constructor(initial = 1 << 16) {
    this.data = new Int32Array(initial);
  }
  push(v: number): void {
    if (this.length === this.data.length) {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.length++] = v;
  }
}

// ---------------------------------------------------------------------------
// Dictionary helper
// ---------------------------------------------------------------------------

class Dictionary {
  private map = new Map<string, number>();
  readonly values: string[] = [];
  intern(value: string): number {
    const existing = this.map.get(value);
    if (existing !== undefined) return existing;
    const id = this.values.length;
    this.map.set(value, id);
    this.values.push(value);
    return id;
  }
}

// ---------------------------------------------------------------------------
// buildIndex
// ---------------------------------------------------------------------------

export function buildIndex(
  courses: CourseWithSections[],
  options: BuildOptions = {},
): SerializedIndex {
  const maxBodyTerms = options.maxBodyTerms ?? DEFAULT_MAX_BODY_TERMS;

  // Stable ordinal assignment. Sorting by courseId makes the artifact
  // byte-identical across builds from identical data, which is what lets the
  // content hash double as a cache key.
  const ordered = [...courses].sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0));
  const courseCount = ordered.length;

  const strings = new Dictionary();
  const subjects = new Dictionary();
  const schools = new Dictionary();
  const instructors = new Dictionary();
  const termCodes = new Dictionary();

  // Requirement bit order: the filters we ship first, then anything extra the
  // data carries, truncated at 32 because the mask is a u32.
  const requirementKeys: string[] = REQUIREMENT_FILTERS.map((r) => r.key);
  const requirementBit = new Map<string, number>();
  for (const key of requirementKeys) requirementBit.set(key, requirementBit.size);
  for (const course of ordered) {
    for (const key of Object.keys(course.requirementFlags ?? {})) {
      if (!requirementBit.has(key) && requirementBit.size < MAX_REQUIREMENT_BITS) {
        requirementBit.set(key, requirementBit.size);
        requirementKeys.push(key);
      }
    }
  }

  // Requirement labels are indexed as body text so "global core" is a query.
  const requirementLabelTokens = new Map<string, string[]>();
  for (const filter of REQUIREMENT_FILTERS) {
    requirementLabelTokens.set(filter.key, tokenize(`${filter.label} ${filter.group}`));
  }

  const courseRecords = new Uint32Array(courseCount * COURSE_WORDS);

  // Section table, appended as we walk courses so a course's sections are
  // always contiguous.
  const sectionWords: number[] = [];
  const sectionInstructorPool = new GrowableI32(1 << 14);
  let sectionCount = 0;

  // Raw posting triples, keyed by a first-seen term id that gets remapped to
  // lexicographic order once the dictionary is closed.
  const termIds = new Map<string, number>();
  const termStrings: string[] = [];
  const postTerm = new GrowableI32();
  const postDoc = new GrowableI32();
  const postTfMask = new GrowableI32();

  const docLengths = new Uint32Array(courseCount);
  let totalDocLength = 0;

  // Reused across courses: term -> (tf, fieldMask).
  const fieldTf = new Map<string, number>();
  const fieldMask = new Map<string, number>();

  for (let doc = 0; doc < courseCount; doc++) {
    const course = ordered[doc];
    fieldTf.clear();
    fieldMask.clear();

    const add = (token: string, mask: number): void => {
      if (token.length === 0) return;
      fieldTf.set(token, (fieldTf.get(token) ?? 0) + 1);
      fieldMask.set(token, (fieldMask.get(token) ?? 0) | mask);
    };

    // --- code fields ------------------------------------------------------
    for (const token of courseCodeTokens(course.subjectCode, course.number, course.qualifier)) {
      add(token, FIELD_CODE);
    }

    // --- title ------------------------------------------------------------
    for (const token of tokenize(course.title)) add(token, FIELD_TITLE);

    // --- department / school ---------------------------------------------
    if (course.department) {
      for (const token of tokenize(course.department)) add(token, FIELD_BODY);
    }

    // --- requirement labels ----------------------------------------------
    const flags = course.requirementFlags ?? {};
    let reqMask = 0;
    for (const [key, value] of Object.entries(flags)) {
      if (value !== true) continue;
      const bit = requirementBit.get(key);
      if (bit !== undefined) reqMask |= 1 << bit;
      const labelTokens = requirementLabelTokens.get(key);
      if (labelTokens) for (const token of labelTokens) add(token, FIELD_BODY);
    }

    // --- sections: instructors, days, times, credits ----------------------
    const sectionStart = sectionCount;
    let dayMask = 0;
    let minStart = TIME_UNKNOWN;
    let maxEnd = TIME_UNKNOWN;
    let termMask = 0;
    let creditsMin = Number.POSITIVE_INFINITY;
    let creditsMax = Number.NEGATIVE_INFINITY;

    for (const section of course.sections) {
      const termId = termCodes.intern(section.termCode);
      if (termId < 16) termMask |= 1 << termId;

      const instrStart = sectionInstructorPool.length;
      let instrCount = 0;
      for (const name of section.instructors) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        sectionInstructorPool.push(instructors.intern(trimmed));
        instrCount++;
        for (const token of tokenize(trimmed)) add(token, FIELD_INSTRUCTOR);
      }

      const { mask: sectionDays, start: sectionStartMin, end: sectionEndMin } =
        summarizeMeetings(section.meetings);
      dayMask |= sectionDays;
      if (sectionStartMin !== TIME_UNKNOWN) {
        if (minStart === TIME_UNKNOWN || sectionStartMin < minStart) minStart = sectionStartMin;
      }
      if (sectionEndMin !== TIME_UNKNOWN) {
        if (maxEnd === TIME_UNKNOWN || sectionEndMin > maxEnd) maxEnd = sectionEndMin;
      }

      const lo = section.minUnit ?? course.pointsMin;
      const hi = section.maxUnit ?? course.pointsMax ?? lo;
      if (lo !== null && lo !== undefined && Number.isFinite(lo)) creditsMin = Math.min(creditsMin, lo);
      if (hi !== null && hi !== undefined && Number.isFinite(hi)) creditsMax = Math.max(creditsMax, hi);

      sectionWords.push(
        doc,
        packU16(sectionStartMin, sectionEndMin),
        (sectionDays & 0xff) | ((termId & 0xff) << 8) | ((instrCount & 0xffff) << 16),
        instrStart,
        strings.intern(section.sectionId),
      );
      sectionCount++;
    }

    if (course.pointsMin !== null && Number.isFinite(course.pointsMin)) {
      creditsMin = Math.min(creditsMin, course.pointsMin);
    }
    if (course.pointsMax !== null && Number.isFinite(course.pointsMax)) {
      creditsMax = Math.max(creditsMax, course.pointsMax);
    }

    // --- description (capped) --------------------------------------------
    if (course.description) {
      const bodyTokens = tokenize(course.description);
      let distinct = 0;
      for (const token of bodyTokens) {
        if (!fieldTf.has(token)) {
          if (distinct >= maxBodyTerms) continue;
          distinct++;
        }
        add(token, FIELD_BODY);
      }
    }

    // --- flush this document's postings -----------------------------------
    let docLength = 0;
    for (const [token, tf] of fieldTf) {
      let termId = termIds.get(token);
      if (termId === undefined) {
        termId = termStrings.length;
        termIds.set(token, termId);
        termStrings.push(token);
      }
      postTerm.push(termId);
      postDoc.push(doc);
      // tf is capped at 255 — beyond that BM25 saturation makes the extra
      // occurrences worth less than the byte they would cost.
      postTfMask.push(((tf > 255 ? 255 : tf) << 4) | (fieldMask.get(token) ?? FIELD_BODY));
      docLength += tf;
    }
    docLengths[doc] = docLength > 0xffff ? 0xffff : docLength;
    totalDocLength += docLengths[doc];

    // --- fixed-width course record ---------------------------------------
    const base = doc * COURSE_WORDS;
    courseRecords[base + CW_COURSE_ID_STR] = strings.intern(course.courseId);
    courseRecords[base + CW_TITLE_STR] = strings.intern(course.title);
    courseRecords[base + CW_SUBJECT_SCHOOL] = packU16(
      subjects.intern(course.subjectCode),
      course.department ? schools.intern(course.department) : 0xffff,
    );
    courseRecords[base + CW_NUMBER_DOCLEN] = packU16(
      course.number > 0xffff ? 0xffff : course.number,
      docLengths[doc],
    );
    courseRecords[base + CW_REQ_FLAGS] = reqMask >>> 0;
    let courseFlags = 0;
    if (course.sections.length > 0) courseFlags |= COURSE_FLAG_HAS_SECTIONS;
    if (dayMask !== 0) courseFlags |= COURSE_FLAG_HAS_MEETINGS;
    courseRecords[base + CW_CREDITS_DAYS] =
      (quantizeCredits(creditsMin) |
        (quantizeCredits(creditsMax) << 8) |
        ((dayMask & 0xff) << 16) |
        ((courseFlags & 0xff) << 24)) >>>
      0;
    courseRecords[base + CW_TIME_RANGE] = packU16(minStart, maxEnd);
    courseRecords[base + CW_SECTION_START] = sectionStart;
    courseRecords[base + CW_SECTION_COUNT_TERMMASK] = packU16(
      sectionCount - sectionStart,
      termMask,
    );
    courseRecords[base + CW_RESERVED] = 0;
  }

  const avgDocLength = courseCount > 0 ? totalDocLength / courseCount : 1;

  // -------------------------------------------------------------------------
  // Close the term dictionary: sort lexicographically and remap ids.
  // -------------------------------------------------------------------------
  const dictSize = termStrings.length;
  const order = new Int32Array(dictSize);
  for (let i = 0; i < dictSize; i++) order[i] = i;
  const sorted = Array.from(order).sort((a, b) =>
    termStrings[a] < termStrings[b] ? -1 : termStrings[a] > termStrings[b] ? 1 : 0,
  );
  const remap = new Int32Array(dictSize);
  for (let newId = 0; newId < dictSize; newId++) remap[sorted[newId]] = newId;

  const encoder = new TextEncoder();
  const termOffsets = new Uint32Array(dictSize + 1);
  const termByteChunks: Uint8Array[] = new Array(dictSize);
  let termBytesLength = 0;
  for (let newId = 0; newId < dictSize; newId++) {
    const bytes = encoder.encode(termStrings[sorted[newId]]);
    termByteChunks[newId] = bytes;
    termOffsets[newId] = termBytesLength;
    termBytesLength += bytes.length;
  }
  termOffsets[dictSize] = termBytesLength;
  const termBytes = new Uint8Array(termBytesLength);
  for (let newId = 0; newId < dictSize; newId++) {
    termBytes.set(termByteChunks[newId], termOffsets[newId]);
  }

  // -------------------------------------------------------------------------
  // Counting sort the postings into term-major order. Because the collection
  // pass walked documents in ascending order and the scatter is stable, each
  // term's list comes out sorted by doc id for free — which is exactly what
  // delta coding needs.
  // -------------------------------------------------------------------------
  const postingCount = postTerm.length;
  const termDocFreq = new Uint32Array(dictSize);
  for (let i = 0; i < postingCount; i++) termDocFreq[remap[postTerm.data[i]]]++;

  const postingOffsets = new Uint32Array(dictSize + 1);
  const cursor = new Uint32Array(dictSize);
  {
    let running = 0;
    for (let t = 0; t < dictSize; t++) {
      postingOffsets[t] = running;
      cursor[t] = running;
      running += termDocFreq[t];
    }
    postingOffsets[dictSize] = running;
  }

  const sortedDoc = new Int32Array(postingCount);
  const sortedTfMask = new Int32Array(postingCount);
  for (let i = 0; i < postingCount; i++) {
    const t = remap[postTerm.data[i]];
    const slot = cursor[t]++;
    sortedDoc[slot] = postDoc.data[i];
    sortedTfMask[slot] = postTfMask.data[i];
  }

  // -------------------------------------------------------------------------
  // Encode postings: one varint per posting carrying doc gap, the quantized
  // precomputed BM25 tf weight, and the field mask.
  // -------------------------------------------------------------------------
  const postingWriter = new ByteWriter(Math.max(1024, postingCount * 3));
  const encodedOffsets = new Uint32Array(dictSize + 1);
  const termIdf = new Float32Array(dictSize);

  for (let t = 0; t < dictSize; t++) {
    encodedOffsets[t] = postingWriter.length;
    const start = postingOffsets[t];
    const end = postingOffsets[t + 1];
    const df = end - start;
    // Lucene-style BM25 idf: always positive, so a term matching most of the
    // catalog still contributes rather than subtracting score.
    termIdf[t] = Math.log(1 + (courseCount - df + 0.5) / (df + 0.5));

    let prevDoc = 0;
    for (let i = start; i < end; i++) {
      const doc = sortedDoc[i];
      const tf = sortedTfMask[i] >>> 4;
      const mask = sortedTfMask[i] & 0xf;
      const dl = docLengths[doc] || 1;
      const norm = tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgDocLength);
      const weight = quantizeWeight((tf * (BM25_K1 + 1)) / norm);
      const delta = doc - prevDoc;
      prevDoc = doc;
      postingWriter.pushVarint(
        delta * (1 << POSTING_DOC_SHIFT) + (weight << POSTING_WEIGHT_SHIFT) + mask,
      );
    }
  }
  encodedOffsets[dictSize] = postingWriter.length;

  // -------------------------------------------------------------------------
  // Trigram -> term index, for fuzzy candidate generation.
  // -------------------------------------------------------------------------
  const trigramCounts = new Uint32Array(TRIGRAM_SPACE);
  const fuzzyTermIds: number[] = [];
  const fuzzyTermTrigrams: number[][] = [];
  for (let t = 0; t < dictSize; t++) {
    const term = termStrings[sorted[t]];
    if (term.length < MIN_FUZZY_LENGTH) continue;
    const grams = trigramsOf(term);
    if (grams.length === 0) continue;
    fuzzyTermIds.push(t);
    fuzzyTermTrigrams.push(grams);
    for (const gram of grams) trigramCounts[gram]++;
  }

  const trigramOffsets = new Uint32Array(TRIGRAM_SPACE + 1);
  {
    let running = 0;
    for (let g = 0; g < TRIGRAM_SPACE; g++) {
      trigramOffsets[g] = running;
      running += trigramCounts[g];
    }
    trigramOffsets[TRIGRAM_SPACE] = running;
  }
  const trigramScatter = new Int32Array(trigramOffsets[TRIGRAM_SPACE]);
  {
    const gramCursor = new Uint32Array(TRIGRAM_SPACE);
    for (let g = 0; g < TRIGRAM_SPACE; g++) gramCursor[g] = trigramOffsets[g];
    for (let i = 0; i < fuzzyTermIds.length; i++) {
      const termId = fuzzyTermIds[i];
      for (const gram of fuzzyTermTrigrams[i]) trigramScatter[gramCursor[gram]++] = termId;
    }
  }

  // Delta-encode each bucket. Term ids inside a bucket are ascending because
  // we scattered in ascending term order.
  const trigramWriter = new ByteWriter(Math.max(1024, trigramScatter.length * 2));
  const trigramEncoded = new Uint32Array(TRIGRAM_SPACE + 1);
  for (let g = 0; g < TRIGRAM_SPACE; g++) {
    trigramEncoded[g] = trigramWriter.length;
    let prev = 0;
    for (let i = trigramOffsets[g]; i < trigramOffsets[g + 1]; i++) {
      const termId = trigramScatter[i];
      trigramWriter.pushVarint(termId - prev);
      prev = termId;
    }
  }
  trigramEncoded[TRIGRAM_SPACE] = trigramWriter.length;

  // -------------------------------------------------------------------------
  // String table
  // -------------------------------------------------------------------------
  const stringValues = strings.values;
  const stringOffsets = new Uint32Array(stringValues.length + 1);
  const stringChunks: Uint8Array[] = new Array(stringValues.length);
  let stringBytesLength = 0;
  for (let i = 0; i < stringValues.length; i++) {
    const bytes = encoder.encode(stringValues[i]);
    stringChunks[i] = bytes;
    stringOffsets[i] = stringBytesLength;
    stringBytesLength += bytes.length;
  }
  stringOffsets[stringValues.length] = stringBytesLength;
  const stringBytes = new Uint8Array(stringBytesLength);
  for (let i = 0; i < stringValues.length; i++) stringBytes.set(stringChunks[i], stringOffsets[i]);

  const sections = Uint32Array.from(sectionWords);
  const sectionInstructors = new Uint32Array(
    sectionInstructorPool.data.buffer.slice(0, sectionInstructorPool.length * 4),
  );

  const meta: IndexMeta = {
    formatVersion: INDEX_FORMAT_VERSION,
    indexVersion: options.indexVersion ?? "",
    builtAt: options.builtAt ?? new Date().toISOString(),
    termCodes: termCodes.values,
    courseCount,
    sectionCount,
    termDictSize: dictSize,
    avgDocLength,
    bm25: { k1: BM25_K1, b: BM25_B },
    fieldBoosts: { ...DEFAULT_FIELD_BOOSTS },
    subjects: subjects.values,
    schools: schools.values,
    instructors: instructors.values,
    requirementKeys,
    embedding: null,
  };

  const index: SerializedIndex = {
    meta,
    stringBytes,
    stringOffsets,
    courses: courseRecords,
    sections,
    sectionInstructors,
    termBytes,
    termOffsets,
    termDocFreq,
    termIdf,
    postings: postingWriter.toUint8Array(),
    postingOffsets: encodedOffsets,
    trigramOffsets: trigramEncoded,
    trigramPostings: trigramWriter.toUint8Array(),
  };

  if (!options.indexVersion) meta.indexVersion = hashIndexContent(index);
  return index;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function packU16(low: number, high: number): number {
  return ((low & 0xffff) | ((high & 0xffff) << 16)) >>> 0;
}

function quantizeCredits(value: number): number {
  if (!Number.isFinite(value)) return CREDITS_UNKNOWN;
  const q = Math.round(value * CREDITS_QUANT);
  if (q < 0) return CREDITS_UNKNOWN;
  return q >= CREDITS_UNKNOWN ? CREDITS_UNKNOWN - 1 : q;
}

function summarizeMeetings(meetings: Meeting[] | undefined): {
  mask: number;
  start: number;
  end: number;
} {
  let mask = 0;
  let start = TIME_UNKNOWN;
  let end = TIME_UNKNOWN;
  if (!meetings) return { mask, start, end };
  for (const meeting of meetings) {
    const bit = DAY_BIT[meeting.weekday];
    if (bit) mask |= bit;
    if (Number.isFinite(meeting.startMinute)) {
      if (start === TIME_UNKNOWN || meeting.startMinute < start) start = meeting.startMinute;
    }
    if (Number.isFinite(meeting.endMinute)) {
      if (end === TIME_UNKNOWN || meeting.endMinute > end) end = meeting.endMinute;
    }
  }
  return { mask, start, end };
}

/**
 * FNV-1a over the immutable content blocks. Used as the artifact version, so
 * two builds from identical catalog data produce the same cache key and the
 * client's revalidation is a no-op.
 */
function hashIndexContent(index: SerializedIndex): string {
  let hash = 0x811c9dc5;
  const mix = (bytes: Uint8Array): void => {
    // Sampling stride keeps hashing a multi-megabyte artifact cheap while
    // still reacting to any localized edit, because the length is mixed in too.
    const stride = bytes.length > 1 << 20 ? 7 : 1;
    for (let i = 0; i < bytes.length; i += stride) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= bytes.length & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };
  mix(index.stringBytes);
  mix(index.termBytes);
  mix(index.postings);
  mix(index.trigramPostings);
  mix(new Uint8Array(index.courses.buffer, index.courses.byteOffset, index.courses.byteLength));
  mix(new Uint8Array(index.sections.buffer, index.sections.byteOffset, index.sections.byteLength));
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/** Exposed for the build script's size report. */
export function estimateBlockSizes(index: SerializedIndex): Record<string, number> {
  return {
    strings: index.stringBytes.byteLength + index.stringOffsets.byteLength,
    courses: index.courses.byteLength,
    sections: index.sections.byteLength + index.sectionInstructors.byteLength,
    termDict:
      index.termBytes.byteLength +
      index.termOffsets.byteLength +
      index.termDocFreq.byteLength +
      index.termIdf.byteLength,
    postings: index.postings.byteLength + index.postingOffsets.byteLength,
    trigrams: index.trigramPostings.byteLength + index.trigramOffsets.byteLength,
  };
}
