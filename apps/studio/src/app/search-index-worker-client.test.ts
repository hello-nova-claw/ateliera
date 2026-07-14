import { describe, expect, it, vi } from 'vitest';

import { createSearchIndexWorkerClientForTest } from './search-index-worker-client';

interface PostedMessage { id: number; method: string; args: unknown[] }

class FakeWorker {
  readonly posted: PostedMessage[] = [];
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  terminated = false;

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: PostedMessage): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }

  reply(message: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener(new MessageEvent('message', { data: message }));
    }
  }
}

describe('search index worker client', () => {
  it('correlates results and rebuild progress without cloning callbacks', async () => {
    const worker = new FakeWorker();
    const client = createSearchIndexWorkerClientForTest(worker, { timeoutMs: 1_000 });
    const progress = vi.fn();
    const rebuilding = client.rebuild([], progress);
    expect(worker.posted[0]).toMatchObject({ id: 1, method: 'rebuild', args: [[]] });
    worker.reply({ type: 'progress', id: 1, progress: { phase: 'indexing', processed: 0, total: 0 } });
    worker.reply({ type: 'result', id: 1, value: undefined });
    await expect(rebuilding).resolves.toBeUndefined();
    expect(progress).toHaveBeenCalledWith({ phase: 'indexing', processed: 0, total: 0 });
  });

  it('rejects bounded requests before posting them', async () => {
    const worker = new FakeWorker();
    const client = createSearchIndexWorkerClientForTest(worker, { timeoutMs: 1_000 });
    await expect(client.search('x'.repeat(513))).rejects.toThrow('512');
    expect(worker.posted).toEqual([]);
  });

  it('terminates and rejects every pending call after a timeout', async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const client = createSearchIndexWorkerClientForTest(worker, { timeoutMs: 20 });
      const first = client.search('calm');
      const second = client.backlinks('note');
      const firstExpectation = expect(first).rejects.toThrow('timed out');
      const secondExpectation = expect(second).rejects.toThrow('closed');
      await vi.advanceTimersByTimeAsync(21);
      await firstExpectation;
      await secondExpectation;
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates safe worker errors and closes exactly once', async () => {
    const worker = new FakeWorker();
    const client = createSearchIndexWorkerClientForTest(worker, { timeoutMs: 1_000 });
    const search = client.search('calm');
    worker.reply({ type: 'error', id: 1, error: { name: 'SearchError', message: 'Index unavailable' } });
    await expect(search).rejects.toMatchObject({ name: 'SearchError', message: 'Index unavailable' });

    const closing = client.close();
    worker.reply({ type: 'result', id: 2, value: null });
    await closing;
    await client.close();
    expect(worker.terminated).toBe(true);
    await expect(client.search('later')).rejects.toThrow('closed');
  });
});
