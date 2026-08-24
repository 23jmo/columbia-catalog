/**
 * Columbia Catalog — browser-side index loading.
 *
 * The one honest cost of local search is the first download (spec §19), so
 * this module is built around three ideas:
 *
 *  1. **Cache-first, revalidate after.** A cached artifact is handed to the
 *     engine immediately; the manifest is fetched in parallel and, only if the
 *     version moved, a fresh artifact is downloaded and swapped in. A returning
 *     student gets working search before the network answers.
 *
 *  2. **Progressive.** `ready` resolves on the LEXICAL index alone. The
 *     embedding block (when one exists) loads afterwards and is attached to
 *     the live engine. Search is never blocked on semantics, and there is
 *     never a spinner in the search box.
 *
 *  3. **Versioned and self-rejecting.** Artifacts are immutable and content-
 *     addressed. A format-version mismatch — a client running old code against
 *     a new artifact, or the reverse — is detected at decode and the cache is
 *     purged rather than mis-read.
 *
 * Nothing here runs on the server. Every browser API is feature-detected so
 * importing the module during SSR is harmless.
 */

import { SearchEngine, type SearchEngineOptions } from "./engine";
import { createFoldInQueryEmbedder } from "./query-embedder";
import {
  IndexFormatError,
  decodeEmbeddingBlock,
  decodeIndex,
  INDEX_FORMAT_VERSION,
  type SerializedIndex,
} from "./index-format";

// ---------------------------------------------------------------------------
// Manifest — the small JSON the client fetches first
// ---------------------------------------------------------------------------

export interface ManifestArtifact {
  url: string;
  bytes: number;
  gzipBytes: number;
}

export interface ManifestEmbedding extends ManifestArtifact {
  dims: number;
  model: string;
}

export interface SearchIndexManifest {
  formatVersion: number;
  /** Content-derived; changes only when the catalog content changes. */
  version: string;
  builtAt: string;
  terms: string[];
  courseCount: number;
  sectionCount: number;
  lexical: ManifestArtifact;
  /** Null while no embedding provider is wired up. */
  embedding: ManifestEmbedding | null;
}

// ---------------------------------------------------------------------------
// IndexedDB (feature-detected, failures are non-fatal)
// ---------------------------------------------------------------------------

const DB_NAME = "columbia-catalog-search";
const DB_VERSION = 1;
const STORE = "artifacts";
const MANIFEST_KEY = "manifest";

interface CachedArtifact {
  key: string;
  version: string;
  formatVersion: number;
  bytes: ArrayBuffer;
  storedAt: number;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolvePromise) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolvePromise(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolvePromise(request.result);
    request.onerror = () => resolvePromise(null);
    request.onblocked = () => resolvePromise(null);
  });
}

function idbGet<T>(db: IDBDatabase | null, key: string): Promise<T | null> {
  if (!db) return Promise.resolve(null);
  return new Promise((resolvePromise) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolvePromise((request.result as T) ?? null);
      request.onerror = () => resolvePromise(null);
    } catch {
      resolvePromise(null);
    }
  });
}

function idbPut(db: IDBDatabase | null, value: unknown): Promise<void> {
  if (!db) return Promise.resolve();
  return new Promise((resolvePromise) => {
    try {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value);
      request.onsuccess = () => resolvePromise();
      request.onerror = () => resolvePromise();
    } catch {
      resolvePromise();
    }
  });
}

function idbDelete(db: IDBDatabase | null, key: string): Promise<void> {
  if (!db) return Promise.resolve();
  return new Promise((resolvePromise) => {
    try {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
      request.onsuccess = () => resolvePromise();
      request.onerror = () => resolvePromise();
    } catch {
      resolvePromise();
    }
  });
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type LoadStage =
  | "start"
  | "cache-hit"
  | "cache-miss"
  | "downloading-lexical"
  | "lexical-ready"
  | "revalidating"
  | "updated"
  | "downloading-embeddings"
  | "semantic-ready"
  | "semantic-unavailable"
  | "error";

export interface LoadProgress {
  stage: LoadStage;
  /** 0..1 when the response advertised a length, otherwise null. */
  fraction: number | null;
  version?: string;
  detail?: string;
}

export interface LoadSearchIndexOptions {
  /** Defaults to `/index/manifest.json`. */
  manifestUrl?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Set false to bypass IndexedDB entirely. */
  cache?: boolean;
  /** Set false to skip the embedding block even when one exists. */
  semantic?: boolean;
  engineOptions?: SearchEngineOptions;
  onProgress?: (progress: LoadProgress) => void;
  /**
   * Called when revalidation found a newer artifact and swapped the engine.
   * The UI should re-run its current query against the new engine.
   */
  onUpdate?: (engine: SearchEngine, manifest: SearchIndexManifest) => void;
}

export interface SearchIndexHandle {
  /** Resolves as soon as LEXICAL search is usable. */
  readonly ready: Promise<SearchEngine>;
  /** Resolves true when embeddings were attached, false when unavailable. */
  readonly semanticReady: Promise<boolean>;
  /** The live engine, or null before `ready` resolves. */
  readonly engine: SearchEngine | null;
  readonly manifest: SearchIndexManifest | null;
}

class SearchIndexLoader implements SearchIndexHandle {
  engine: SearchEngine | null = null;
  manifest: SearchIndexManifest | null = null;
  readonly ready: Promise<SearchEngine>;
  readonly semanticReady: Promise<boolean>;

  private resolveReady!: (engine: SearchEngine) => void;
  private rejectReady!: (error: unknown) => void;
  private resolveSemantic!: (value: boolean) => void;
  private readonly options: Required<
    Pick<LoadSearchIndexOptions, "manifestUrl" | "cache" | "semantic">
  > &
    LoadSearchIndexOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LoadSearchIndexOptions) {
    this.options = {
      manifestUrl: options.manifestUrl ?? "/index/manifest.json",
      cache: options.cache !== false,
      semantic: options.semantic !== false,
      ...options,
    };
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.ready = new Promise((resolvePromise, rejectPromise) => {
      this.resolveReady = resolvePromise;
      this.rejectReady = rejectPromise;
    });
    this.semanticReady = new Promise((resolvePromise) => {
      this.resolveSemantic = resolvePromise;
    });
    void this.run();
  }

  private report(stage: LoadStage, fraction: number | null = null, detail?: string): void {
    this.options.onProgress?.({ stage, fraction, version: this.manifest?.version, detail });
  }

  private async run(): Promise<void> {
    this.report("start");
    const db = this.options.cache ? await openDb() : null;

    // --- 1. serve from cache immediately, if we have anything at all --------
    let servedVersion: string | null = null;
    const cachedManifest = await idbGet<{ key: string; manifest: SearchIndexManifest }>(
      db,
      MANIFEST_KEY,
    );
    if (cachedManifest?.manifest && cachedManifest.manifest.formatVersion === INDEX_FORMAT_VERSION) {
      const cached = await idbGet<CachedArtifact>(db, lexicalKey(cachedManifest.manifest.version));
      if (cached && cached.formatVersion === INDEX_FORMAT_VERSION) {
        try {
          this.manifest = cachedManifest.manifest;
          this.adopt(decodeIndex(cached.bytes));
          servedVersion = cached.version;
          this.report("cache-hit", 1, `version ${servedVersion}`);
        } catch (error) {
          await this.purge(db, cachedManifest.manifest.version, error);
        }
      }
    }
    if (!servedVersion) this.report("cache-miss");

    // --- 2. manifest (revalidate) ------------------------------------------
    let manifest: SearchIndexManifest;
    try {
      if (servedVersion) this.report("revalidating");
      manifest = await this.fetchManifest();
    } catch (error) {
      // Offline with a warm cache is a completely fine state: search still
      // works, it is just not revalidated.
      if (servedVersion) {
        this.report("error", null, "manifest unreachable; using cached index");
        void this.loadEmbeddings(db, this.manifest);
        return;
      }
      this.report("error", null, String(error));
      this.rejectReady(error);
      this.resolveSemantic(false);
      return;
    }

    if (manifest.formatVersion !== INDEX_FORMAT_VERSION) {
      const error = new IndexFormatError(
        `Server index format ${manifest.formatVersion} != client ${INDEX_FORMAT_VERSION}. ` +
          `The client build is out of date.`,
        true,
      );
      if (servedVersion) {
        this.report("error", null, error.message);
        this.resolveSemantic(false);
        return;
      }
      this.rejectReady(error);
      this.resolveSemantic(false);
      return;
    }

    // --- 3. download if the version moved (or we had nothing) --------------
    if (servedVersion === manifest.version) {
      this.manifest = manifest;
      await idbPut(db, { key: MANIFEST_KEY, manifest });
      void this.loadEmbeddings(db, manifest);
      return;
    }

    this.report("downloading-lexical", 0, `version ${manifest.version}`);
    try {
      const bytes = await this.download(manifest.lexical.url, manifest.lexical.bytes, (fraction) =>
        this.report("downloading-lexical", fraction),
      );
      const index = decodeIndex(bytes);
      this.manifest = manifest;
      const swapped = servedVersion !== null;
      this.adopt(index);
      await idbPut(db, {
        key: lexicalKey(manifest.version),
        version: manifest.version,
        formatVersion: INDEX_FORMAT_VERSION,
        bytes,
        storedAt: Date.now(),
      } satisfies CachedArtifact);
      await idbPut(db, { key: MANIFEST_KEY, manifest });
      if (servedVersion) await idbDelete(db, lexicalKey(servedVersion));
      this.report(swapped ? "updated" : "lexical-ready", 1, `version ${manifest.version}`);
      if (swapped && this.engine) this.options.onUpdate?.(this.engine, manifest);
    } catch (error) {
      if (servedVersion) {
        // Keep serving the cached engine; a failed update is not an outage.
        this.report("error", null, `update failed: ${String(error)}`);
      } else {
        this.report("error", null, String(error));
        this.rejectReady(error);
        this.resolveSemantic(false);
        return;
      }
    }

    void this.loadEmbeddings(db, manifest);
  }

  private adopt(index: SerializedIndex): void {
    const engine = new SearchEngine(index, this.options.engineOptions);
    // Deliberately does NOT carry the previous query embedder over. The
    // fold-in embedder is bound to the postings and document ordinals of the
    // index it was built from, so reusing it against a swapped index would
    // read the right postings for the wrong courses — a silent mis-ranking,
    // not a crash. `loadEmbeddings` runs immediately after adoption and
    // rebuilds it against the new pair.
    this.engine = engine;
    this.resolveReady(engine);
  }

  private async purge(db: IDBDatabase | null, version: string, error: unknown): Promise<void> {
    this.report("error", null, `cached index rejected: ${String(error)}`);
    await idbDelete(db, lexicalKey(version));
    await idbDelete(db, embeddingKey(version));
    await idbDelete(db, MANIFEST_KEY);
  }

  private async fetchManifest(): Promise<SearchIndexManifest> {
    const response = await this.fetchImpl(this.options.manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Manifest fetch failed: ${response.status}`);
    return (await response.json()) as SearchIndexManifest;
  }

  /**
   * Fetch with progress. Falls back to a plain arrayBuffer() when the response
   * is not streamable (older Safari, some test doubles).
   */
  private async download(
    url: string,
    expectedBytes: number,
    onFraction: (fraction: number | null) => void,
  ): Promise<ArrayBuffer> {
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`Index fetch failed: ${response.status} ${url}`);
    const body = response.body;
    if (!body || typeof body.getReader !== "function") {
      const buffer = await response.arrayBuffer();
      onFraction(1);
      return buffer;
    }
    const declared = Number(response.headers.get("content-length")) || expectedBytes || 0;
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onFraction(declared > 0 ? Math.min(1, received / declared) : null);
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged.buffer;
  }

  /**
   * The progressive tail. Runs after `ready` has already resolved, so nothing
   * the user does is blocked on it.
   */
  private async loadEmbeddings(
    db: IDBDatabase | null,
    manifest: SearchIndexManifest | null,
  ): Promise<void> {
    if (!this.options.semantic || !manifest?.embedding || !this.engine) {
      this.report("semantic-unavailable", null, "no embedding block in this artifact");
      this.resolveSemantic(false);
      return;
    }
    try {
      const cached = await idbGet<CachedArtifact>(db, embeddingKey(manifest.version));
      let bytes: ArrayBuffer;
      if (cached && cached.formatVersion === INDEX_FORMAT_VERSION) {
        bytes = cached.bytes;
      } else {
        this.report("downloading-embeddings", 0);
        bytes = await this.download(manifest.embedding.url, manifest.embedding.bytes, (fraction) =>
          this.report("downloading-embeddings", fraction),
        );
        await idbPut(db, {
          key: embeddingKey(manifest.version),
          version: manifest.version,
          formatVersion: INDEX_FORMAT_VERSION,
          bytes,
          storedAt: Date.now(),
        } satisfies CachedArtifact);
      }
      const block = decodeEmbeddingBlock(bytes);
      this.engine.attachEmbeddings(block);

      // The block alone is inert: `hasSemantic` needs a query embedder too.
      // The fold-in embedder derives the query's direction from postings the
      // lexical index already holds, so this needs no model, no download and
      // no network — see lib/search/query-embedder.ts.
      const embedder = createFoldInQueryEmbedder(this.engine.index, block);
      if (!embedder) {
        this.report("semantic-unavailable", null, "embedding block does not match the index");
        this.resolveSemantic(false);
        return;
      }
      this.engine.setQueryEmbedder(embedder);
      this.report("semantic-ready", 1);
      this.resolveSemantic(true);
    } catch (error) {
      this.report("semantic-unavailable", null, String(error));
      this.resolveSemantic(false);
    }
  }
}

function lexicalKey(version: string): string {
  return `lexical:${version}`;
}

function embeddingKey(version: string): string {
  return `embedding:${version}`;
}

/**
 * Start loading the search index. Returns immediately; await `handle.ready`
 * for a usable engine.
 */
export function loadSearchIndex(options: LoadSearchIndexOptions = {}): SearchIndexHandle {
  return new SearchIndexLoader(options);
}

/**
 * Build an engine from bytes you already have (server-rendered preload, tests,
 * or the Web Worker, which receives the buffer by transfer).
 */
export function engineFromBytes(
  bytes: ArrayBuffer,
  options?: SearchEngineOptions,
): SearchEngine {
  return new SearchEngine(decodeIndex(bytes), options);
}

/** Drop every cached artifact. Exposed for a "reset local data" affordance. */
export async function clearIndexCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolvePromise) => {
    try {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      request.onsuccess = () => resolvePromise();
      request.onerror = () => resolvePromise();
    } catch {
      resolvePromise();
    }
  });
}
