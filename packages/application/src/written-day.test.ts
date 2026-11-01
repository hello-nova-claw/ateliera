import { parseNote } from '@studio/content';
import { writtenDay } from '@studio/domain';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

// 08:00 on 2 November 2026 in Melbourne is 21:00 on 1 November in UTC, and
// 14:00 on 1 November in Los Angeles. These tests run under
// TZ=Australia/Melbourne, America/Los_Angeles and UTC, and must give the same
// answers in each: the zone comes from the service, never the host.
const melbourneMorning = new Date('2026-11-01T21:00:00.000Z');

function melbourneService() {
  const vault = createInMemoryVault();
  let now = melbourneMorning;
  const service = createStudioService({
    vault,
    index: new RecordingIndex(),
    clock: () => now,
    timeZone: 'Australia/Melbourne',
    generateId: () => '01JTESTWRITTENDAY000000000',
  });
  return {
    service,
    vault,
    advance(to: Date) {
      now = to;
    },
  };
}

describe('the day an entry was written', () => {
  it('stores created and updated with the writer’s offset and names the file by that day', async () => {
    const { service, vault } = melbourneService();

    const captured = await service.capture({ body: 'A morning page.' });

    expect(captured.note.created).toBe('2026-11-02T08:00:00.000+11:00');
    expect(captured.note.updated).toBe('2026-11-02T08:00:00.000+11:00');
    expect(captured.path.split('/').at(-1)).toMatch(/^2026-11-02--/u);
    const stored = parseNote((await vault.readText(captured.path)).text);
    expect(stored.ok && stored.note.created).toBe('2026-11-02T08:00:00.000+11:00');
    expect(stored.ok && writtenDay(stored.note.created)).toBe('2026-11-02');
  });

  it('keeps the writer’s offset when the entry is saved again', async () => {
    const { service, advance } = melbourneService();
    const captured = await service.capture({ body: 'A morning page.' });
    advance(new Date('2026-11-02T09:15:00.000Z'));

    const saved = await service.save({
      path: captured.path,
      note: { ...captured.note, body: 'A morning page, revised.' },
      expectedHash: captured.hash,
    });

    expect(saved.note.created).toBe('2026-11-02T08:00:00.000+11:00');
    expect(saved.note.updated).toBe('2026-11-02T20:15:00.000+11:00');
  });

  it('keeps an instant that sorts with the UTC timestamps already in a vault', async () => {
    const { service } = melbourneService();
    const captured = await service.capture({ body: 'A morning page.' });

    expect(Date.parse(captured.note.created)).toBe(melbourneMorning.valueOf());
  });
});
