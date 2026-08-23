/**
 * Columbia Catalog — serialized search index format.
 *
 * ---------------------------------------------------------------------------
 * WHY A BINARY FORMAT
 * ---------------------------------------------------------------------------
 * The entire catalog (~10–15k courses) ships to the browser. JSON would cost
 * us twice: once on the wire (even gzipped, JSON's punctuation and numeric
 * text are pure overhead) and once at load (JSON.parse allocates tens of
 * thousands of objects, then the GC pays for them for the rest of the
 * session). A flat binary blob decodes into a handful of typed arrays that
 * are already in their final query-time shape — zero per-document objects,
 * zero parse loop, and the hot path never allocates.
 *
 * Everything in here is IMMUTABLE catalog data. Volatile state (seat counts,
 * enrollment status, waitlist depth) is deliberately NOT in the index — it is
 * overlaid at query/render time. See spec §9.
 *
 * ---------------------------------------------------------------------------
 * CONTAINER LAYOUT
 * ---------------------------------------------------------------------------
 * All multi-byte integers are little-endian (every platform we target is LE;
 * the reader asserts the magic word, which would fail loudly on a BE host).
 *
 *   offset  size  field
 *   ------  ----  -----------------------------------------------------------
 *   0       4     magic         = INDEX_MAGIC ("CUCA" as LE u32)
 *   4       4     formatVersion = INDEX_FORMAT_VERSION
 *   8       4     blockCount
 *   12      4     totalByteLength (sanity check against a truncated download)
 *   16      12*n  block directory: [tag u32][offset u32][byteLength u32] * n
 *   ...           block payloads, each padded to a 4-byte boundary
 *
 * Blocks are self-describing and order-independent, so a future version can
 * add a block (say, prerequisite graph edges) without breaking older readers
 * that simply skip unknown tags. Removing or changing the meaning of an
 * existing block requires bumping INDEX_FORMAT_VERSION; the client rejects a
 * mismatched artifact and refetches rather than mis-decoding a stale one.
 *
 * ---------------------------------------------------------------------------
 * BLOCKS
 * ---------------------------------------------------------------------------
 * META  UTF-8 JSON. Small header data: version, term codes, BM25 constants,
 *       the subject / school / instructor / requirement dictionaries whose
 *       integer ids the fixed-width records refer to.
 *
 * STRB  String blob (UTF-8), STRO string offsets (u32, count+1). Holds course
 *       ids, section ids and titles. Referenced everywhere by index.
 *
 * CRSE  Course records. Struct-of-fixed-width, COURSE_WORDS u32 words each.
 *       One record per course ordinal; a course ordinal IS the document id
 *       used by the inverted index.
 *
 * SECT  Section records, SECTION_WORDS u32 words each.
 * SINS  Section instructor ids (u32), a flat pool sliced by each section.
 *
 * TRMB  Term dictionary bytes (UTF-8, concatenated).
 * TRMO  Term dictionary offsets (u32, termCount+1).
 *       The dictionary is sorted lexicographically. Because tokenization
 *       restricts terms to [a-z0-9], JS string order == UTF-8 byte order, so
 *       a binary search finds any prefix range in O(log n).
 * TRDF  Per-term document frequency (u32).
 * TRIDF Per-term precomputed BM25 idf (f32). Precomputed so a keystroke never
 *       calls Math.log.
 *
 * POST  Postings, varint-coded, concatenated per term.
 * POSO  Posting list offsets into POST (u32, termCount+1).
 *
 *       One posting is a SINGLE varint packing three fields:
 *
 *           (docDelta << 12) | (weight8 << 4) | fieldMask
 *
 *       - docDelta   gap from the previous doc id in the list (lists are
 *                    ascending, so gaps are small and varints stay short).
 *       - weight8    the BM25 term-frequency component, precomputed at build
 *                    time and quantized to 8 bits. Because both tf and the
 *                    document length are known at build time, the whole
 *                    tf/length normalization collapses into one byte and the
 *                    query-time inner loop is just
 *                        score += idf[t] * WEIGHT_TABLE[weight8] * boost
 *                    with no division and no length lookup.
 *       - fieldMask  4 bits: which fields this term occurred in (title, code,
 *                    instructor, body). Drives the field boosts at query time
 *                    via a 16-entry lookup table.
 *
 * TGRO  Trigram index offsets — a DENSE u32 array of TRIGRAM_SPACE+1 entries.
 * TGRP  Trigram postings: term ids, delta-coded varints.
 *       Trigrams are packed into a single integer over a 37-symbol alphabet
 *       (a-z, 0-9, '$' padding), so lookup is an array index, not a hash.
 *       This is what makes fuzzy matching cheap: candidate terms for a
 *       misspelling come from trigram overlap, and bounded Levenshtein runs
 *       over a few dozen candidates instead of the whole dictionary.
 *
 * ---------------------------------------------------------------------------
 * EMBEDDING ARTIFACT (separate file, optional)
 * ---------------------------------------------------------------------------
 * Semantic search is a SEPARATE download so lexical search is usable before
 * it lands (spec §19: "a progressive path"). Its container reuses the same
 * header, with magic EMBED_MAGIC.
 *
 * EMBB  Binary-quantized vectors: docCount * (dims/32) u32 words, 1 bit per
 *       dimension. Cosine similarity is approximated by Hamming distance,
 *       computed with a branch-free popcount over Uint32Array.
 * EMBQ  OPTIONAL int8 rescore vectors (docCount * dims) — used to re-rank the
 *       top ~200 Hamming hits in (near) float precision.
 * EMBS  OPTIONAL per-doc dequantization scale for EMBQ (f32, docCount).
 *
 * No embedding provider is wired up yet, so the build script emits no
 * embedding artifact and the engine runs lexical-only. Adding embeddings
 * later means producing a Float32Array per course and calling
 * `buildEmbeddingBlock` — no change to the lexical format, the engine's
 * fusion step, or the client loader.
 */

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/** "CUCA" little-endian. */
export const INDEX_MAGIC = 0x41435543;
/** "CUCE" little-endian — the embedding sidecar. */
export const EMBED_MAGIC = 0x45435543;

/**
 * Bump on ANY incompatible change to block meaning or record layout. The
 * client refuses to decode an artifact whose formatVersion differs and
 * refetches instead of silently mis-reading it.
 */
export const INDEX_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Block tags
// ---------------------------------------------------------------------------

function tag(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

export const BLOCK = {
  META: tag("META"),
  STRB: tag("STRB"),
  STRO: tag("STRO"),
  CRSE: tag("CRSE"),
  SECT: tag("SECT"),
  SINS: tag("SINS"),
  TRMB: tag("TRMB"),
  TRMO: tag("TRMO"),
  TRDF: tag("TRDF"),
  TIDF: tag("TIDF"),
  POST: tag("POST"),
  POSO: tag("POSO"),
  TGRO: tag("TGRO"),
  TGRP: tag("TGRP"),
  EMBB: tag("EMBB"),
  EMBQ: tag("EMBQ"),
  EMBS: tag("EMBS"),
} as const;

// ---------------------------------------------------------------------------
// Course record layout — COURSE_WORDS u32 words per course
// ---------------------------------------------------------------------------

export const COURSE_WORDS = 10;

export const CW_COURSE_ID_STR = 0; // u32 index into the string table
export const CW_TITLE_STR = 1; // u32 index into the string table
export const CW_SUBJECT_SCHOOL = 2; // subjectId in low u16 | schoolId in high u16
export const CW_NUMBER_DOCLEN = 3; // course number low u16 | doc token length high u16
export const CW_REQ_FLAGS = 4; // bitmask over meta.requirementKeys (max 32)
export const CW_CREDITS_DAYS = 5; // creditsMinQ u8 | creditsMaxQ u8 | dayMask u8 | flags u8
export const CW_TIME_RANGE = 6; // earliest start minute low u16 | latest end minute high u16
export const CW_SECTION_START = 7; // u32 index into the section table
export const CW_SECTION_COUNT_TERMMASK = 8; // sectionCount low u16 | termMask high u16
export const CW_RESERVED = 9; // reserved, keeps the stride a power of two friendly

/** Set when at least one section has a parsed meeting time. */
export const COURSE_FLAG_HAS_MEETINGS = 1 << 0;
/** Set when at least one section is a lecture-like primary component. */
export const COURSE_FLAG_HAS_SECTIONS = 1 << 1;

/**
 * Credits are stored as quarter-points in a u8 (0–63.75 covers every real
 * Columbia course and keeps the record fixed width). `null` credits encode as
 * CREDITS_UNKNOWN.
 */
export const CREDITS_QUANT = 4;
export const CREDITS_UNKNOWN = 0xff;

/** Sentinel used when a course has no parsed meeting times at all. */
export const TIME_UNKNOWN = 0xffff;

// ---------------------------------------------------------------------------
// Section record layout — SECTION_WORDS u32 words per section
// ---------------------------------------------------------------------------

export const SECTION_WORDS = 5;

export const SW_COURSE_ORD = 0; // u32 owning course ordinal
export const SW_TIME = 1; // startMinute low u16 | endMinute high u16
export const SW_DAYS_TERM_INSTR = 2; // dayMask u8 | termId u8 | instructorCount u16
export const SW_INSTR_START = 3; // u32 index into the SINS pool
export const SW_SECTION_ID_STR = 4; // u32 index into the string table

// ---------------------------------------------------------------------------
// Weekday bitmap — bit 0 = Sunday .. bit 6 = Saturday
// ---------------------------------------------------------------------------

export const DAY_BIT: Record<string, number> = {
  Su: 1 << 0,
  Mo: 1 << 1,
  Tu: 1 << 2,
  We: 1 << 3,
  Th: 1 << 4,
  Fr: 1 << 5,
  Sa: 1 << 6,
};

// ---------------------------------------------------------------------------
// Field masks carried in every posting
// ---------------------------------------------------------------------------

export const FIELD_TITLE = 1 << 0;
export const FIELD_CODE = 1 << 1;
export const FIELD_INSTRUCTOR = 1 << 2;
export const FIELD_BODY = 1 << 3;
export const FIELD_MASK_BITS = 4;
export const FIELD_MASK = 0b1111;

/** Per-field multipliers folded into a 16-entry lookup at query time. */
export const DEFAULT_FIELD_BOOSTS = {
  title: 4.0,
  code: 6.0,
  instructor: 2.5,
  body: 1.0,
} as const;

export type FieldBoosts = { title: number; code: number; instructor: number; body: number };

/**
 * Precompute boost[mask] for all 16 field-mask combinations. A term that
 * appears in several fields takes the strongest boost rather than the sum, so
 * a word repeated in title and body cannot outweigh an exact code hit.
 */
export function buildFieldBoostTable(b: FieldBoosts): Float32Array {
  const table = new Float32Array(16);
  for (let mask = 0; mask < 16; mask++) {
    let best = 0;
    if (mask & FIELD_TITLE) best = Math.max(best, b.title);
    if (mask & FIELD_CODE) best = Math.max(best, b.code);
    if (mask & FIELD_INSTRUCTOR) best = Math.max(best, b.instructor);
    if (mask & FIELD_BODY) best = Math.max(best, b.body);
    table[mask] = best === 0 ? b.body : best;
  }
  return table;
}

// ---------------------------------------------------------------------------
// BM25 weight quantization
// ---------------------------------------------------------------------------

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/**
 * tf*(k1+1)/(tf + k1*(1-b+b*dl/avgdl)) is bounded above by k1+1 = 2.2, so a
 * ceiling of 2.5 leaves headroom and gives ~0.01 resolution in 8 bits — far
 * finer than ranking can perceive.
 */
export const WEIGHT_CEILING = 2.5;

export function quantizeWeight(w: number): number {
  const q = Math.round((w / WEIGHT_CEILING) * 255);
  return q < 0 ? 0 : q > 255 ? 255 : q;
}

/** Dequantization lookup: WEIGHT_TABLE[q] recovers the BM25 tf component. */
export const WEIGHT_TABLE = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = (i / 255) * WEIGHT_CEILING;
  return t;
})();

export const POSTING_WEIGHT_SHIFT = FIELD_MASK_BITS; // 4
export const POSTING_DOC_SHIFT = FIELD_MASK_BITS + 8; // 12

// ---------------------------------------------------------------------------
// Trigram alphabet — 37 symbols: a-z, 0-9, '$' (padding)
// ---------------------------------------------------------------------------

export const TRIGRAM_ALPHABET_SIZE = 37;
export const TRIGRAM_PAD = 36;
export const TRIGRAM_SPACE = TRIGRAM_ALPHABET_SIZE ** 3; // 50653

/** Map a folded character code to its alphabet slot, or -1 if out of range. */
export function trigramSymbol(code: number): number {
  if (code >= 97 && code <= 122) return code - 97; // a-z
  if (code >= 48 && code <= 57) return 26 + (code - 48); // 0-9
  if (code === 36) return TRIGRAM_PAD; // '$'
  return -1;
}

export function packTrigram(a: number, b: number, c: number): number {
  return (a * TRIGRAM_ALPHABET_SIZE + b) * TRIGRAM_ALPHABET_SIZE + c;
}

// ---------------------------------------------------------------------------
// Metadata (the META block, stored as JSON)
// ---------------------------------------------------------------------------

export interface IndexEmbeddingInfo {
  /** Vector dimensionality, e.g. 384. Must be a multiple of 32. */
  dims: number;
  docCount: number;
  /** True when an int8 rescore block accompanies the binary codes. */
  hasRescore: boolean;
  /** Free-form provenance, e.g. "bge-small-en-v1.5". */
  model: string;
}

export interface IndexMeta {
  formatVersion: number;
  /** Content-derived build id. The client caches and revalidates on this. */
  indexVersion: string;
  builtAt: string;
  /** Term codes covered, in termId order. A section's termId indexes this. */
  termCodes: string[];
  courseCount: number;
  sectionCount: number;
  termDictSize: number;
  avgDocLength: number;
  bm25: { k1: number; b: number };
  fieldBoosts: FieldBoosts;
  /** Dictionaries whose integer ids appear in the fixed-width records. */
  subjects: string[];
  schools: string[];
  instructors: string[];
  /** Requirement keys, in bit order within CW_REQ_FLAGS. Max 32. */
  requirementKeys: string[];
  /** Present only when the embedding sidecar exists for this version. */
  embedding: IndexEmbeddingInfo | null;
}

// ---------------------------------------------------------------------------
// The in-memory index — what buildIndex() produces and the engine queries
// ---------------------------------------------------------------------------

/**
 * `SerializedIndex` is the decoded, query-ready form. `encodeIndex` turns it
 * into the wire bytes; `decodeIndex` returns views over the received buffer
 * WITHOUT copying, so loading is O(1) per block rather than O(n) per record.
 */
export interface SerializedIndex {
  meta: IndexMeta;

  stringBytes: Uint8Array;
  stringOffsets: Uint32Array; // length = stringCount + 1

  courses: Uint32Array; // courseCount * COURSE_WORDS
  sections: Uint32Array; // sectionCount * SECTION_WORDS
  sectionInstructors: Uint32Array;

  termBytes: Uint8Array;
  termOffsets: Uint32Array; // length = termCount + 1
  termDocFreq: Uint32Array; // length = termCount
  termIdf: Float32Array; // length = termCount

  postings: Uint8Array;
  postingOffsets: Uint32Array; // length = termCount + 1

  trigramOffsets: Uint32Array; // length = TRIGRAM_SPACE + 1
  trigramPostings: Uint8Array;
}

export interface EmbeddingBlock {
  info: IndexEmbeddingInfo;
  /** docCount * (dims / 32) words. */
  binary: Uint32Array;
  /** docCount * dims, or null when no rescore data shipped. */
  rescore: Int8Array | null;
  /** docCount per-doc scale for `rescore`, or null. */
  rescoreScale: Float32Array | null;
}

// ---------------------------------------------------------------------------
// Varint codec (LEB128, unsigned)
// ---------------------------------------------------------------------------

/** Growable byte sink used by the builder. Not used at query time. */
export class ByteWriter {
  private buf: Uint8Array;
  length = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let next = this.buf.length * 2;
    while (next < this.length + extra) next *= 2;
    const grown = new Uint8Array(next);
    grown.set(this.buf.subarray(0, this.length));
    this.buf = grown;
  }

  pushByte(b: number): void {
    this.ensure(1);
    this.buf[this.length++] = b & 0xff;
  }

  pushVarint(value: number): void {
    this.ensure(5);
    let v = value >>> 0;
    while (v >= 0x80) {
      this.buf[this.length++] = (v & 0x7f) | 0x80;
      v = Math.floor(v / 128);
    }
    this.buf[this.length++] = v;
  }

  pushBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.length);
    this.length += bytes.length;
  }

  toUint8Array(): Uint8Array {
    return this.buf.subarray(0, this.length);
  }
}

/**
 * Varint reader with an explicit cursor field instead of a return tuple —
 * the query path decodes hundreds of thousands of varints per second and must
 * not allocate a result object per read.
 */
export class VarintCursor {
  pos = 0;
  value = 0;

  constructor(public bytes: Uint8Array) {}

  reset(pos: number): void {
    this.pos = pos;
  }

  /** Reads one varint into `this.value` and advances `this.pos`. */
  next(): number {
    const bytes = this.bytes;
    let p = this.pos;
    let byte = bytes[p++];
    let result = byte & 0x7f;
    if (byte >= 0x80) {
      byte = bytes[p++];
      result |= (byte & 0x7f) << 7;
      if (byte >= 0x80) {
        byte = bytes[p++];
        result |= (byte & 0x7f) << 14;
        if (byte >= 0x80) {
          byte = bytes[p++];
          result += (byte & 0x7f) * 2097152;
          if (byte >= 0x80) {
            byte = bytes[p++];
            result += (byte & 0x7f) * 268435456;
          }
        }
      }
    }
    this.pos = p;
    this.value = result;
    return result;
  }
}

// ---------------------------------------------------------------------------
// Container encode / decode
// ---------------------------------------------------------------------------

interface RawBlock {
  tag: number;
  bytes: Uint8Array;
}

function align4(n: number): number {
  return (n + 3) & ~3;
}

function packBlocks(magic: number, blocks: RawBlock[]): Uint8Array {
  const headerSize = 16 + blocks.length * 12;
  let total = align4(headerSize);
  const offsets: number[] = [];
  for (const block of blocks) {
    offsets.push(total);
    total = align4(total + block.bytes.length);
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, INDEX_FORMAT_VERSION, true);
  view.setUint32(8, blocks.length, true);
  view.setUint32(12, total, true);

  for (let i = 0; i < blocks.length; i++) {
    const base = 16 + i * 12;
    view.setUint32(base, blocks[i].tag, true);
    view.setUint32(base + 4, offsets[i], true);
    view.setUint32(base + 8, blocks[i].bytes.length, true);
    out.set(blocks[i].bytes, offsets[i]);
  }
  return out;
}

export class IndexFormatError extends Error {
  constructor(
    message: string,
    /** True when the artifact is simply from another format generation. */
    readonly staleFormat: boolean = false,
  ) {
    super(message);
    this.name = "IndexFormatError";
  }
}

function unpackBlocks(magic: number, buffer: ArrayBuffer): Map<number, Uint8Array> {
  if (buffer.byteLength < 16) throw new IndexFormatError("Index artifact is truncated");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== magic) {
    throw new IndexFormatError("Index artifact has a bad magic word");
  }
  const formatVersion = view.getUint32(4, true);
  if (formatVersion !== INDEX_FORMAT_VERSION) {
    throw new IndexFormatError(
      `Index format ${formatVersion} != expected ${INDEX_FORMAT_VERSION}`,
      true,
    );
  }
  const blockCount = view.getUint32(8, true);
  const totalByteLength = view.getUint32(12, true);
  if (totalByteLength !== buffer.byteLength) {
    throw new IndexFormatError(
      `Index artifact length ${buffer.byteLength} != declared ${totalByteLength}`,
    );
  }

  const blocks = new Map<number, Uint8Array>();
  for (let i = 0; i < blockCount; i++) {
    const base = 16 + i * 12;
    const blockTag = view.getUint32(base, true);
    const offset = view.getUint32(base + 4, true);
    const length = view.getUint32(base + 8, true);
    if (offset + length > buffer.byteLength) {
      throw new IndexFormatError("Index block overruns the artifact");
    }
    blocks.set(blockTag, new Uint8Array(buffer, offset, length));
  }
  return blocks;
}

function requireBlock(blocks: Map<number, Uint8Array>, blockTag: number, name: string): Uint8Array {
  const found = blocks.get(blockTag);
  if (!found) throw new IndexFormatError(`Index artifact is missing the ${name} block`);
  return found;
}

/**
 * Reinterpret a byte view as u32s. Blocks are written 4-byte aligned so the
 * common case is a zero-copy view; the copy branch exists only for readers
 * that hand us an unaligned slice.
 */
function asU32(bytes: Uint8Array): Uint32Array {
  if ((bytes.byteOffset & 3) === 0) {
    return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2);
  }
  return new Uint32Array(bytes.slice().buffer);
}

function asF32(bytes: Uint8Array): Float32Array {
  if ((bytes.byteOffset & 3) === 0) {
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2);
  }
  return new Float32Array(bytes.slice().buffer);
}

function u32Bytes(arr: Uint32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function f32Bytes(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeIndex(index: SerializedIndex): Uint8Array {
  const meta: IndexMeta = { ...index.meta, formatVersion: INDEX_FORMAT_VERSION };
  return packBlocks(INDEX_MAGIC, [
    { tag: BLOCK.META, bytes: textEncoder.encode(JSON.stringify(meta)) },
    { tag: BLOCK.STRB, bytes: index.stringBytes },
    { tag: BLOCK.STRO, bytes: u32Bytes(index.stringOffsets) },
    { tag: BLOCK.CRSE, bytes: u32Bytes(index.courses) },
    { tag: BLOCK.SECT, bytes: u32Bytes(index.sections) },
    { tag: BLOCK.SINS, bytes: u32Bytes(index.sectionInstructors) },
    { tag: BLOCK.TRMB, bytes: index.termBytes },
    { tag: BLOCK.TRMO, bytes: u32Bytes(index.termOffsets) },
    { tag: BLOCK.TRDF, bytes: u32Bytes(index.termDocFreq) },
    { tag: BLOCK.TIDF, bytes: f32Bytes(index.termIdf) },
    { tag: BLOCK.POST, bytes: index.postings },
    { tag: BLOCK.POSO, bytes: u32Bytes(index.postingOffsets) },
    { tag: BLOCK.TGRO, bytes: u32Bytes(index.trigramOffsets) },
    { tag: BLOCK.TGRP, bytes: index.trigramPostings },
  ]);
}

export function decodeIndex(buffer: ArrayBuffer): SerializedIndex {
  const blocks = unpackBlocks(INDEX_MAGIC, buffer);
  const meta = JSON.parse(
    textDecoder.decode(requireBlock(blocks, BLOCK.META, "META")),
  ) as IndexMeta;

  return {
    meta,
    stringBytes: requireBlock(blocks, BLOCK.STRB, "STRB"),
    stringOffsets: asU32(requireBlock(blocks, BLOCK.STRO, "STRO")),
    courses: asU32(requireBlock(blocks, BLOCK.CRSE, "CRSE")),
    sections: asU32(requireBlock(blocks, BLOCK.SECT, "SECT")),
    sectionInstructors: asU32(requireBlock(blocks, BLOCK.SINS, "SINS")),
    termBytes: requireBlock(blocks, BLOCK.TRMB, "TRMB"),
    termOffsets: asU32(requireBlock(blocks, BLOCK.TRMO, "TRMO")),
    termDocFreq: asU32(requireBlock(blocks, BLOCK.TRDF, "TRDF")),
    termIdf: asF32(requireBlock(blocks, BLOCK.TIDF, "TIDF")),
    postings: requireBlock(blocks, BLOCK.POST, "POST"),
    postingOffsets: asU32(requireBlock(blocks, BLOCK.POSO, "POSO")),
    trigramOffsets: asU32(requireBlock(blocks, BLOCK.TGRO, "TGRO")),
    trigramPostings: requireBlock(blocks, BLOCK.TGRP, "TGRP"),
  };
}

// ---------------------------------------------------------------------------
// Embedding sidecar
// ---------------------------------------------------------------------------

export function encodeEmbeddingBlock(block: EmbeddingBlock): Uint8Array {
  const blocks: RawBlock[] = [
    { tag: BLOCK.META, bytes: textEncoder.encode(JSON.stringify(block.info)) },
    { tag: BLOCK.EMBB, bytes: u32Bytes(block.binary) },
  ];
  if (block.rescore && block.rescoreScale) {
    blocks.push({
      tag: BLOCK.EMBQ,
      bytes: new Uint8Array(
        block.rescore.buffer,
        block.rescore.byteOffset,
        block.rescore.byteLength,
      ),
    });
    blocks.push({ tag: BLOCK.EMBS, bytes: f32Bytes(block.rescoreScale) });
  }
  return packBlocks(EMBED_MAGIC, blocks);
}

export function decodeEmbeddingBlock(buffer: ArrayBuffer): EmbeddingBlock {
  const blocks = unpackBlocks(EMBED_MAGIC, buffer);
  const info = JSON.parse(
    textDecoder.decode(requireBlock(blocks, BLOCK.META, "META")),
  ) as IndexEmbeddingInfo;
  const binary = asU32(requireBlock(blocks, BLOCK.EMBB, "EMBB"));
  const rescoreBytes = blocks.get(BLOCK.EMBQ);
  const scaleBytes = blocks.get(BLOCK.EMBS);
  return {
    info,
    binary,
    rescore: rescoreBytes
      ? new Int8Array(rescoreBytes.buffer, rescoreBytes.byteOffset, rescoreBytes.byteLength)
      : null,
    rescoreScale: scaleBytes ? asF32(scaleBytes) : null,
  };
}

/**
 * Turn dense float vectors into the shipped embedding block. This is the ONLY
 * function that has to exist for semantic search to switch on — the engine,
 * the client loader and the index format already handle everything else.
 *
 * @param vectors  one Float32Array per course ordinal, all of length `dims`.
 * @param withRescore  also emit int8 vectors for the top-k float rescore pass.
 *                     Costs dims bytes per course, so it is opt-in.
 */
export function buildEmbeddingBlock(
  vectors: Float32Array[],
  dims: number,
  model: string,
  withRescore = false,
): EmbeddingBlock {
  if (dims % 32 !== 0) throw new Error(`Embedding dims must be a multiple of 32, got ${dims}`);
  const docCount = vectors.length;
  const words = dims >>> 5;
  const binary = new Uint32Array(docCount * words);
  const rescore = withRescore ? new Int8Array(docCount * dims) : null;
  const rescoreScale = withRescore ? new Float32Array(docCount) : null;

  for (let doc = 0; doc < docCount; doc++) {
    const vec = vectors[doc];
    if (vec.length !== dims) throw new Error(`Vector ${doc} has length ${vec.length}, want ${dims}`);
    const base = doc * words;
    // Binary quantization: sign bit per dimension. For unit-norm embeddings
    // this preserves ~95% of neighbour ordering at 1/32 the size.
    for (let d = 0; d < dims; d++) {
      if (vec[d] > 0) binary[base + (d >>> 5)] |= 1 << (d & 31);
    }
    if (rescore && rescoreScale) {
      let maxAbs = 0;
      for (let d = 0; d < dims; d++) {
        const a = vec[d] < 0 ? -vec[d] : vec[d];
        if (a > maxAbs) maxAbs = a;
      }
      const scale = maxAbs === 0 ? 1 : maxAbs / 127;
      rescoreScale[doc] = scale;
      const off = doc * dims;
      for (let d = 0; d < dims; d++) {
        const q = Math.round(vec[d] / scale);
        rescore[off + d] = q < -127 ? -127 : q > 127 ? 127 : q;
      }
    }
  }

  return {
    info: { dims, docCount, hasRescore: withRescore, model },
    binary,
    rescore,
    rescoreScale,
  };
}

// ---------------------------------------------------------------------------
// String table access
// ---------------------------------------------------------------------------

/** Decode one string out of the string table. */
export function readString(index: SerializedIndex, id: number): string {
  const start = index.stringOffsets[id];
  const end = index.stringOffsets[id + 1];
  return textDecoder.decode(index.stringBytes.subarray(start, end));
}

/** Decode one dictionary term. */
export function readTerm(index: SerializedIndex, termId: number): string {
  const start = index.termOffsets[termId];
  const end = index.termOffsets[termId + 1];
  return textDecoder.decode(index.termBytes.subarray(start, end));
}

export function termCount(index: SerializedIndex): number {
  return index.termOffsets.length - 1;
}

/**
 * Binary search the sorted term dictionary for an exact term, comparing bytes
 * directly so no string is materialized during lookup.
 * @returns termId, or -1.
 */
export function lookupTerm(index: SerializedIndex, needle: Uint8Array): number {
  const { termBytes, termOffsets } = index;
  let lo = 0;
  let hi = termOffsets.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cmp = compareTermAt(termBytes, termOffsets, mid, needle);
    if (cmp === 0) return mid;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** First termId whose bytes are >= `needle`. Used for prefix ranges. */
export function lowerBoundTerm(index: SerializedIndex, needle: Uint8Array): number {
  const { termBytes, termOffsets } = index;
  let lo = 0;
  let hi = termOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareTermAt(termBytes, termOffsets, mid, needle) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** True when the dictionary entry at `termId` starts with `prefix`. */
export function termHasPrefix(index: SerializedIndex, termId: number, prefix: Uint8Array): boolean {
  const start = index.termOffsets[termId];
  const end = index.termOffsets[termId + 1];
  if (end - start < prefix.length) return false;
  const bytes = index.termBytes;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[start + i] !== prefix[i]) return false;
  }
  return true;
}

function compareTermAt(
  termBytes: Uint8Array,
  termOffsets: Uint32Array,
  termId: number,
  needle: Uint8Array,
): number {
  const start = termOffsets[termId];
  const end = termOffsets[termId + 1];
  const len = end - start;
  const n = len < needle.length ? len : needle.length;
  for (let i = 0; i < n; i++) {
    const a = termBytes[start + i];
    const b = needle[i];
    if (a !== b) return a < b ? -1 : 1;
  }
  return len === needle.length ? 0 : len < needle.length ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Hamming distance helpers (semantic candidate generation)
// ---------------------------------------------------------------------------

/** Branch-free 32-bit popcount (Hacker's Delight). */
export function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}
