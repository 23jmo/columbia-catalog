/**
 * LionPlan — search Web Worker.
 *
 * Search itself fits in a frame, but it should not be *sharing* that frame
 * with React reconciliation, virtualized list measurement and paint. Running
 * the engine on a worker means the main thread's only job per keystroke is to
 * post a message and render the reply — the input caret never stutters, even
 * on a filter change that touches the whole catalog.
 *
 * This file is BOTH the worker entry point and the main-thread client. The
 * install guard at the bottom runs the message handler only inside a real
 * DedicatedWorkerGlobalScope, so importing `SearchWorkerClient` from a React
 * component is inert.
 *
 * Two ways to get the index in:
 *   - `initFromManifest` — the worker fetches and caches it itself (preferred:
 *     the download and the IndexedDB writes stay off the main thread too).
 *   - `initFromBytes` — the host already has the bytes and transfers them.
 *
 * Semantic search stays optional. `attachEmbeddings` can arrive at any time
 * after init; queries before it are lexical, queries after it are hybrid.
 */

import type { SearchFilters, SearchResult } from "../types";
import type { IndexMeta } from "./index-format";
import { decodeEmbeddingBlock } from "./index-format";
import { SearchEngine, type ReputationOverlayEntry, type SeatOverlayEntry, type SearchEngineOptions } from "./engine";
import { createFoldInQueryEmbedder } from "./query-embedder";
import { engineFromBytes, loadSearchIndex, type LoadProgress } from "./client";

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

export type SearchWorkerRequest =
  | {
      kind: "initFromManifest";
      id: number;
      manifestUrl?: string;
      semantic?: boolean;
      engineOptions?: SearchEngineOptions;
    }
  | { kind: "initFromBytes"; id: number; bytes: ArrayBuffer; engineOptions?: SearchEngineOptions }
  | { kind: "attachEmbeddings"; id: number; bytes: ArrayBuffer }
  | { kind: "search"; id: number; filters: SearchFilters }
  | { kind: "setSeatOverlay"; id: number; entries: SeatOverlayEntry[] }
  | { kind: "setReputationOverlay"; id: number; entries: ReputationOverlayEntry[] }
  | { kind: "clearSeatOverlay"; id: number };

export interface SearchWorkerReadyPayload {
  meta: IndexMeta;
  hasSemantic: boolean;
}

export type SearchWorkerResponse =
  | { kind: "ready"; id: number; payload: SearchWorkerReadyPayload }
  | { kind: "result"; id: number; result: SearchResult }
  | { kind: "ok"; id: number }
  | { kind: "progress"; id: number; progress: LoadProgress }
  | { kind: "error"; id: number; message: string };

// ---------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------

interface WorkerScope {
  postMessage(message: SearchWorkerResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/**
 * Wire the message handler onto a worker-like scope. Exported so tests can
 * drive the exact same code path with a fake scope instead of a real Worker.
 */
export function installSearchWorker(scope: WorkerScope): void {
  let engine: SearchEngine | null = null;

  const fail = (id: number, error: unknown): void => {
    scope.postMessage({ kind: "error", id, message: error instanceof Error ? error.message : String(error) });
  };

  const requireEngine = (id: number): SearchEngine | null => {
    if (!engine) {
      fail(id, new Error("Search worker received a query before the index was initialized"));
      return null;
    }
    return engine;
  };

  scope.addEventListener("message", (event: MessageEvent) => {
    const request = event.data as SearchWorkerRequest;
    if (!request || typeof request.id !== "number") return;

    switch (request.kind) {
      case "initFromManifest": {
        const handle = loadSearchIndex({
          manifestUrl: request.manifestUrl,
          semantic: request.semantic,
          engineOptions: request.engineOptions,
          onProgress: (progress) => scope.postMessage({ kind: "progress", id: request.id, progress }),
          onUpdate: (updated) => {
            engine = updated;
          },
        });
        handle.ready.then(
          (ready) => {
            engine = ready;
            scope.postMessage({
              kind: "ready",
              id: request.id,
              payload: { meta: ready.index.meta, hasSemantic: ready.hasSemantic },
            });
          },
          (error) => fail(request.id, error),
        );
        return;
      }
      case "initFromBytes": {
        try {
          engine = engineFromBytes(request.bytes, request.engineOptions);
          scope.postMessage({
            kind: "ready",
            id: request.id,
            payload: { meta: engine.index.meta, hasSemantic: engine.hasSemantic },
          });
        } catch (error) {
          fail(request.id, error);
        }
        return;
      }
      case "attachEmbeddings": {
        const active = requireEngine(request.id);
        if (!active) return;
        try {
          const block = decodeEmbeddingBlock(request.bytes);
          active.attachEmbeddings(block);
          // Same pairing as the main-thread client: the block is only half of
          // `hasSemantic`. Attaching one without the other leaves the sidecar
          // downloaded, decoded, and never consulted.
          active.setQueryEmbedder(createFoldInQueryEmbedder(active.index, block));
          scope.postMessage({ kind: "ok", id: request.id });
        } catch (error) {
          fail(request.id, error);
        }
        return;
      }
      case "search": {
        const active = requireEngine(request.id);
        if (!active) return;
        try {
          scope.postMessage({ kind: "result", id: request.id, result: active.search(request.filters) });
        } catch (error) {
          fail(request.id, error);
        }
        return;
      }
      case "setSeatOverlay": {
        const active = requireEngine(request.id);
        if (!active) return;
        active.setSeatOverlay(request.entries);
        scope.postMessage({ kind: "ok", id: request.id });
        return;
      }
      case "clearSeatOverlay": {
        const active = requireEngine(request.id);
        if (!active) return;
        active.clearSeatOverlay();
        scope.postMessage({ kind: "ok", id: request.id });
        return;
      }
      case "setReputationOverlay": {
        const active = requireEngine(request.id);
        if (!active) return;
        active.setReputationOverlay(request.entries);
        scope.postMessage({ kind: "ok", id: request.id });
        return;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Main-thread client
// ---------------------------------------------------------------------------

interface Pending {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  kind: SearchWorkerRequest["kind"];
}

export interface SearchWorkerClientOptions {
  /** Inject a worker (or a fake) instead of constructing one. */
  worker?: Worker;
  onProgress?: (progress: LoadProgress) => void;
}

/**
 * Typed proxy around the worker. Every method returns a promise that settles
 * when the worker replies to that specific request id.
 */
export class SearchWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly onProgress?: (progress: LoadProgress) => void;
  /** Sequence of the most recent search, so stale replies can be dropped. */
  private latestSearchId = 0;

  meta: IndexMeta | null = null;

  constructor(options: SearchWorkerClientOptions = {}) {
    this.worker =
      options.worker ??
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "catalog-search" });
    this.onProgress = options.onProgress;
    this.worker.addEventListener("message", (event: MessageEvent) => this.handle(event));
    this.worker.addEventListener("error", (event) => {
      const error = new Error(`Search worker error: ${(event as ErrorEvent).message ?? "unknown"}`);
      for (const [, entry] of this.pending) entry.reject(error);
      this.pending.clear();
    });
  }

  private handle(event: MessageEvent): void {
    const response = event.data as SearchWorkerResponse;
    if (!response || typeof response.id !== "number") return;
    if (response.kind === "progress") {
      this.onProgress?.(response.progress);
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) return;
    this.pending.delete(response.id);
    if (response.kind === "error") {
      entry.reject(new Error(response.message));
      return;
    }
    if (response.kind === "ready") {
      this.meta = response.payload.meta;
      (entry.resolve as (value: SearchWorkerReadyPayload) => void)(response.payload);
      return;
    }
    if (response.kind === "result") {
      (entry.resolve as (value: SearchResult) => void)(response.result);
      return;
    }
    (entry.resolve as (value: void) => void)(undefined);
  }

  private send<T>(request: SearchWorkerRequest, transfer?: Transferable[]): Promise<T> {
    return new Promise<T>((resolvePromise, rejectPromise) => {
      this.pending.set(request.id, {
        resolve: resolvePromise as (value: never) => void,
        reject: rejectPromise,
        kind: request.kind,
      });
      if (transfer && transfer.length > 0) this.worker.postMessage(request, transfer);
      else this.worker.postMessage(request);
    });
  }

  /** Let the worker fetch, cache and decode the artifact itself. */
  init(options: { manifestUrl?: string; semantic?: boolean; engineOptions?: SearchEngineOptions } = {}): Promise<SearchWorkerReadyPayload> {
    return this.send<SearchWorkerReadyPayload>({
      kind: "initFromManifest",
      id: this.nextId++,
      manifestUrl: options.manifestUrl,
      semantic: options.semantic,
      engineOptions: options.engineOptions,
    });
  }

  /** Hand over bytes you already hold. The buffer is TRANSFERRED, not copied. */
  initFromBytes(bytes: ArrayBuffer, engineOptions?: SearchEngineOptions): Promise<SearchWorkerReadyPayload> {
    return this.send<SearchWorkerReadyPayload>(
      { kind: "initFromBytes", id: this.nextId++, bytes, engineOptions },
      [bytes],
    );
  }

  attachEmbeddings(bytes: ArrayBuffer): Promise<void> {
    return this.send<void>({ kind: "attachEmbeddings", id: this.nextId++, bytes }, [bytes]);
  }

  search(filters: SearchFilters): Promise<SearchResult> {
    const id = this.nextId++;
    this.latestSearchId = id;
    return this.send<SearchResult>({ kind: "search", id, filters });
  }

  /**
   * Keystroke-friendly search: resolves null for any request that a newer
   * keystroke has already superseded, so callers never render stale results
   * and never need their own race guard.
   */
  async searchLatest(filters: SearchFilters): Promise<SearchResult | null> {
    const id = this.nextId;
    const result = await this.search(filters);
    return id >= this.latestSearchId ? result : null;
  }

  setSeatOverlay(entries: SeatOverlayEntry[]): Promise<void> {
    return this.send<void>({ kind: "setSeatOverlay", id: this.nextId++, entries });
  }

  clearSeatOverlay(): Promise<void> {
    return this.send<void>({ kind: "clearSeatOverlay", id: this.nextId++ });
  }

  setReputationOverlay(entries: ReputationOverlayEntry[]): Promise<void> {
    return this.send<void>({ kind: "setReputationOverlay", id: this.nextId++, entries });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Worker install guard
// ---------------------------------------------------------------------------

declare const WorkerGlobalScope: (new () => unknown) | undefined;

function isWorkerScope(): boolean {
  return (
    typeof WorkerGlobalScope !== "undefined" &&
    typeof self !== "undefined" &&
    self instanceof WorkerGlobalScope
  );
}

if (isWorkerScope()) {
  installSearchWorker(self as unknown as WorkerScope);
}
