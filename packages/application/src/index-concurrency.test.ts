import { serializeNote } from '@studio/content';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { assertion(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 0)); }
  }
  assertion();
}

describe('index mutation sequencing', () => {
  it('serializes concurrent save upserts in durable-generation order', async () => {
    const index = new RecordingIndex();
    const first = deferred();
    const second = deferred();
    const calls: string[] = [];
    let active = 0;
    let maximumActive = 0;
    index.upsert = async (value) => {
      calls.push(value.id);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await (calls.length === 1 ? first.promise : second.promise);
      active -= 1;
    };
    const service = createStudioService({ vault: createInMemoryVault(), index });

    const saveA = service.save({ note: note({ id: 'a' }), path: 'Notes/a.md', expectedMissing: true });
    const saveB = service.save({ note: note({ id: 'b' }), path: 'Notes/b.md', expectedMissing: true });
    await eventually(() => expect(calls).toEqual(['a']));
    first.resolve();
    await eventually(() => expect(calls).toEqual(['a', 'b']));
    second.resolve();
    await Promise.all([saveA, saveB]);

    expect(maximumActive).toBe(1);
    expect(service.indexState()).toBe('ready');
  });

  it('keeps the index stale until a save committed during rebuild is indexed', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/original.md', serializeNote(note({ id: 'original' })));
    const index = new RecordingIndex();
    const rebuildGate = deferred();
    const upsertGate = deferred();
    const actions: string[] = [];
    index.rebuild = async () => {
      actions.push('rebuild-start');
      await rebuildGate.promise;
      actions.push('rebuild-end');
    };
    index.upsert = async (value) => {
      actions.push(`upsert-${value.id}-start`);
      await upsertGate.promise;
      actions.push(`upsert-${value.id}-end`);
    };
    const service = createStudioService({ vault, index });

    const rebuilding = service.rebuildIndex();
    await eventually(() => expect(actions).toEqual(['rebuild-start']));
    const saving = service.save({
      note: note({ id: 'during' }),
      path: 'Notes/during.md',
      expectedMissing: true,
    });
    await eventually(() => expect(service.indexState()).toBe('stale'));
    rebuildGate.resolve();
    await rebuilding;
    expect(service.indexState()).toBe('stale');
    await eventually(() => expect(actions).toContain('upsert-during-start'));
    upsertGate.resolve();
    await saving;

    expect(actions).toEqual([
      'rebuild-start',
      'rebuild-end',
      'upsert-during-start',
      'upsert-during-end',
    ]);
    expect(service.indexState()).toBe('ready');
  });
});
