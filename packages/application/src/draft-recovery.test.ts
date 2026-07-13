import { createDraftRecoveryStore, type DraftRecoveryRecord } from './draft-recovery';
import { expect, it } from 'vitest';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const record: DraftRecoveryRecord = {
  studioId: 'studio:anna',
  path: 'Inbox/note.md',
  title: 'A changed title',
  body: 'Unsaved words',
  expectedHash: 'durable-hash',
  updatedAt: '2026-07-13T10:00:00.000Z',
};

it('round-trips a recovery draft through injected session-like storage', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);

  expect(recovery.write(record)).toBe(true);

  expect(recovery.read(record.studioId, record.path)).toEqual(record);
  expect([...storage.values.keys()]).toEqual([
    'studio:draft-recovery:studio%3Aanna:Inbox%2Fnote.md',
  ]);
});

it('isolates malformed recovery data and allows it to be discarded', () => {
  const storage = new MemoryStorage();
  storage.setItem('studio:draft-recovery:studio%3Aanna:Inbox%2Fnote.md', '{broken');
  const recovery = createDraftRecoveryStore(storage);

  expect(recovery.read(record.studioId, record.path)).toBeNull();
  expect(storage.values.size).toBe(0);
});

it.each([
  null,
  {},
  { ...record, studioId: 'another-studio' },
  { ...record, path: 'another-note' },
  { ...record, body: 1 },
  { ...record, expectedHash: 1 },
  { ...record, updatedAt: 1 },
  { ...record, updatedAt: 'not-a-date' },
  { ...record, title: 1 },
])('removes structurally invalid recovery data (%#)', (invalid) => {
  const storage = new MemoryStorage();
  storage.setItem(
    'studio:draft-recovery:studio%3Aanna:Inbox%2Fnote.md',
    JSON.stringify(invalid),
  );
  const recovery = createDraftRecoveryStore(storage);

  expect(recovery.read(record.studioId, record.path)).toBeNull();
  expect(storage.values.size).toBe(0);
});

it('never treats a draft for a different durable hash as current text', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);
  recovery.write(record);

  expect(recovery.readForDurable(record.studioId, record.path, 'other-hash')).toEqual({
    kind: 'stale',
    draft: record,
  });
  expect(recovery.readForDurable(record.studioId, record.path, 'durable-hash')).toEqual({
    kind: 'recoverable',
    draft: record,
  });
});

it('reports when no recovery draft exists', () => {
  const recovery = createDraftRecoveryStore(new MemoryStorage());

  expect(recovery.readForDurable(record.studioId, record.path, 'durable-hash')).toEqual({
    kind: 'none',
  });
});

it('removes the recovery record only when explicitly cleared', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);
  recovery.write(record);

  expect(recovery.remove(record.studioId, record.path)).toBe(true);

  expect(recovery.read(record.studioId, record.path)).toBeNull();
});

it('never exposes a draft at the same path from another Studio', () => {
  const recovery = createDraftRecoveryStore(new MemoryStorage());
  recovery.write(record);

  expect(recovery.read('studio:family', record.path)).toBeNull();
});

it('degrades safely when session storage is unavailable', () => {
  const unavailable = {
    getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
  };
  const recovery = createDraftRecoveryStore(unavailable);

  expect(recovery.read(record.studioId, record.path)).toBeNull();
  expect(recovery.write(record)).toBe(false);
  expect(recovery.remove(record.studioId, record.path)).toBe(false);
});
