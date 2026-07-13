import { createDraftRecoveryStore, type DraftRecoveryRecord } from './draft-recovery';

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
  key: 'Inbox/note.md',
  title: 'A changed title',
  body: 'Unsaved words',
  expectedHash: 'durable-hash',
  updatedAt: '2026-07-13T10:00:00.000Z',
};

it('round-trips a recovery draft through injected session-like storage', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);

  recovery.write(record);

  expect(recovery.read(record.key)).toEqual(record);
  expect([...storage.values.keys()]).toEqual([
    'studio:draft-recovery:Inbox%2Fnote.md',
  ]);
});

it('isolates malformed recovery data and allows it to be discarded', () => {
  const storage = new MemoryStorage();
  storage.setItem('studio:draft-recovery:Inbox%2Fnote.md', '{broken');
  const recovery = createDraftRecoveryStore(storage);

  expect(recovery.read(record.key)).toBeNull();
  expect(storage.values.size).toBe(0);
});

it('never treats a draft for a different durable hash as current text', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);
  recovery.write(record);

  expect(recovery.readForDurable(record.key, 'other-hash')).toEqual({
    kind: 'stale',
    draft: record,
  });
  expect(recovery.readForDurable(record.key, 'durable-hash')).toEqual({
    kind: 'recoverable',
    draft: record,
  });
});

it('removes the recovery record only when explicitly cleared', () => {
  const storage = new MemoryStorage();
  const recovery = createDraftRecoveryStore(storage);
  recovery.write(record);

  recovery.remove(record.key);

  expect(recovery.read(record.key)).toBeNull();
});
