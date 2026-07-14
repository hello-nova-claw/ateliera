/// <reference lib="webworker" />

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { IndexEntry, IndexedContent, IndexPort, SearchFilters } from '@studio/index';
import { createSqliteIndex } from '@studio/index/sqlite-index';
import type { StudioNote } from '@studio/domain';

import {
  parseSearchIndexRequest,
  type SearchIndexRequest,
  type SearchIndexResponse,
} from './search-index-worker-protocol';
import { createSqliteDriverFromWasmDatabase, type WasmDatabase } from './search-index-worker-sqlite';

const worker = self as DedicatedWorkerGlobalScope;
let indexPromise: Promise<IndexPort> | undefined;
let closed = false;
let queue = Promise.resolve();

function getIndex(): Promise<IndexPort> {
  if (closed) return Promise.reject(new Error('Search index worker is closed.'));
  indexPromise ??= sqlite3InitModule().then((sqlite3) => {
    const database = new sqlite3.oo1.DB(':memory:', 'c') as WasmDatabase;
    return createSqliteIndex(createSqliteDriverFromWasmDatabase(database));
  });
  return indexPromise;
}

function post(response: SearchIndexResponse): void { worker.postMessage(response); }

function safeError(error: unknown): { name: string; message: string } {
  if (!(error instanceof Error)) return { name: 'Error', message: 'Search index request failed.' };
  return {
    name: error.name.slice(0, 100) || 'Error',
    message: error.message.slice(0, 500) || 'Search index request failed.',
  };
}

async function dispatch(request: SearchIndexRequest): Promise<unknown> {
  if (request.method === 'close') {
    if (!closed) {
      closed = true;
      const index = await indexPromise;
      if (index !== undefined && 'close' in index && typeof index.close === 'function') index.close();
    }
    return undefined;
  }
  const index = await getIndex();
  switch (request.method) {
    case 'upsert': {
      const [note, path, hash, content] = request.args as [StudioNote, string, string, IndexedContent];
      return index.upsert(note, path, hash, content);
    }
    case 'remove': return index.remove(request.args[0] as string);
    case 'getById': return index.getById(request.args[0] as string);
    case 'getManyById': return index.getManyById(request.args[0] as string[]);
    case 'search': return index.search(request.args[0] as string, request.args[1] as SearchFilters | undefined);
    case 'facets': return index.facets(request.args[0] as string, request.args[1] as SearchFilters | undefined);
    case 'backlinks': return index.backlinks(request.args[0] as string);
    case 'forwardLinks': return index.forwardLinks(request.args[0] as string);
    case 'rebuild': return index.rebuild(request.args[0] as IndexEntry[], (progress) => {
      post({ type: 'progress', id: request.id, progress });
    });
    case 'clear': return index.clear();
  }
}

async function handle(value: unknown): Promise<void> {
  let request: SearchIndexRequest;
  try { request = parseSearchIndexRequest(value); }
  catch (error) {
    const id = typeof value === 'object' && value !== null && Number.isSafeInteger((value as { id?: unknown }).id)
      ? (value as { id: number }).id
      : 0;
    post({ type: 'error', id, error: safeError(error) });
    return;
  }
  try {
    const result = await dispatch(request);
    post({ type: 'result', id: request.id, value: result });
  } catch (error) {
    post({ type: 'error', id: request.id, error: safeError(error) });
  }
}

worker.addEventListener('message', (event: MessageEvent<unknown>) => {
  queue = queue.then(() => handle(event.data));
});
