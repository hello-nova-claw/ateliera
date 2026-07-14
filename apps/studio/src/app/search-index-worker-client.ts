import type {
  IndexEntry,
  IndexedContent,
  IndexedLink,
  IndexedNoteRecord,
  IndexPort,
  IndexRebuildProgress,
  SearchFacets,
  SearchFilters,
  SearchHit,
} from '@studio/index';
import type { StudioNote } from '@studio/domain';

import {
  assertBoundedSearchIndexRequest,
  isSearchIndexResponse,
  SEARCH_INDEX_MAX_IN_FLIGHT,
  type SearchIndexMethod,
  type SearchIndexRequest,
} from './search-index-worker-protocol';

interface SearchWorkerLike {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: SearchIndexRequest): void;
  terminate(): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  onProgress?: (progress: IndexRebuildProgress) => void;
}

export interface SearchIndexWorkerClient extends IndexPort {
  close(): Promise<void>;
}

interface ClientOptions { timeoutMs: number; rebuildTimeoutMs?: number }

class WorkerIndexClient implements SearchIndexWorkerClient {
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly onMessage = (event: MessageEvent<unknown>) => { this.receive(event.data); };

  constructor(private readonly worker: SearchWorkerLike, private readonly options: ClientOptions) {
    worker.addEventListener('message', this.onMessage);
  }

  upsert(note: StudioNote, path: string, hash: string, content: IndexedContent): Promise<void> {
    return this.request('upsert', [note, path, hash, content]);
  }
  remove(id: string): Promise<void> { return this.request('remove', [id]); }
  getById(id: string): Promise<IndexedNoteRecord | null> { return this.request('getById', [id]); }
  getManyById(ids: string[]): Promise<IndexedNoteRecord[]> { return this.request('getManyById', [ids]); }
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]> {
    return this.request('search', filters === undefined ? [query] : [query, filters]);
  }
  facets(query: string, filters?: SearchFilters): Promise<SearchFacets> {
    return this.request('facets', filters === undefined ? [query] : [query, filters]);
  }
  backlinks(id: string): Promise<string[]> { return this.request('backlinks', [id]); }
  forwardLinks(id: string): Promise<IndexedLink[]> { return this.request('forwardLinks', [id]); }
  rebuild(entries: IndexEntry[], onProgress?: (progress: IndexRebuildProgress) => void): Promise<void> {
    return this.request('rebuild', [entries], onProgress, this.options.rebuildTimeoutMs ?? 120_000);
  }
  clear(): Promise<void> { return this.request('clear', []); }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    if (this.closed) return Promise.resolve();
    this.closePromise = this.request<void>('close', []).finally(() => this.shutdown(new Error('Search index worker is closed.')));
    return this.closePromise;
  }

  private request<T>(
    method: SearchIndexMethod,
    args: unknown[],
    onProgress?: (progress: IndexRebuildProgress) => void,
    timeoutMs = this.options.timeoutMs,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Search index worker is closed.'));
    if (this.pending.size >= SEARCH_INDEX_MAX_IN_FLIGHT) {
      return Promise.reject(new Error('Search index worker is busy.'));
    }
    const request = { id: this.nextId, method, args } satisfies SearchIndexRequest;
    try { assertBoundedSearchIndexRequest(request); }
    catch (error) { return Promise.reject(error); }
    this.nextId += 1;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        const timeout = new Error(`Search index ${method} timed out.`);
        reject(timeout);
        this.shutdown(new Error('Search index worker is closed after a timeout.'));
      }, timeoutMs);
      this.pending.set(request.id, {
        resolve: (value) => { resolve(value as T); },
        reject,
        timer,
        ...(onProgress === undefined ? {} : { onProgress }),
      });
      try { this.worker.postMessage(request); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(error instanceof Error ? error : new Error('Search index request could not be sent.'));
      }
    });
  }

  private receive(value: unknown): void {
    if (!isSearchIndexResponse(value)) return;
    const pending = this.pending.get(value.id);
    if (pending === undefined) return;
    if (value.type === 'progress') {
      try { pending.onProgress?.(value.progress); } catch { /* Observers cannot break indexing. */ }
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(value.id);
    if (value.type === 'result') pending.resolve(value.value);
    else {
      const error = new Error(value.error.message);
      error.name = value.error.name;
      pending.reject(error);
    }
  }

  private shutdown(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function createSearchIndexWorkerClient(): SearchIndexWorkerClient {
  const worker = new Worker(new URL('./search-index-worker.ts', import.meta.url), { type: 'module' });
  return new WorkerIndexClient(worker, { timeoutMs: 15_000, rebuildTimeoutMs: 120_000 });
}

export function createSearchIndexWorkerClientForTest(
  worker: SearchWorkerLike,
  options: ClientOptions,
): SearchIndexWorkerClient {
  return new WorkerIndexClient(worker, options);
}
