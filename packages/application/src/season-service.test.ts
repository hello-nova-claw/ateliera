import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createSeasonService } from './season-service';
import { StudioSaveConflictError, createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

function setup() {
  const vault = createInMemoryVault();
  const studio = createStudioService({
    vault,
    index: new RecordingIndex(),
    clock: () => new Date('2026-07-14T00:00:00.000Z'),
    generateId: () => '01SEASONNOTE',
  });
  return {
    vault,
    studio,
    seasons: createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => '01SEASONNOTE',
    }),
  };
}

describe('season service', () => {
  it('persists each wizard step and recovers the draft at the next incomplete step', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({
      title: 'A spacious winter',
      startsOn: '2026-07-14',
      endsOn: '2026-10-01',
    });
    const reflected = await seasons.saveStep(begun, 'prior-reflection', {
      skippedPriorReflection: true,
    });

    const recovered = await seasons.recoverWizard();
    expect(recovered?.record.state.title).toBe('A spacious winter');
    expect(recovered?.step).toBe('feelings');
    expect(reflected.hash).not.toBe(begun.hash);
  });

  it('uses exact-hash saves and leaves both versions available on conflict', async () => {
    const { seasons, studio } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    await studio.save({
      note: { ...begun.note, body: 'An outside edit.' },
      path: begun.path,
      expectedHash: begun.hash,
    });

    await expect(seasons.saveStep(begun, 'feelings', {
      feelings: ['calm'],
    })).rejects.toBeInstanceOf(StudioSaveConflictError);
  });

  it('allows exactly one active season and never activates a draft implicitly', async () => {
    const { seasons } = setup();
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of ['prior-reflection', 'feelings', 'priorities', 'decisions-practices',
      'supports-constraints', 'enough', 'not-now', 'confirm'] as const) {
      record = await seasons.saveStep(record, step,
        step === 'prior-reflection' ? { skippedPriorReflection: true } : {});
    }
    record = await seasons.activateSeason(record);
    expect(record.state.status).toBe('active');
    await expect(seasons.beginSeason({ title: 'Spring' })).rejects.toThrow('active season');
  });

  it('preserves unknown metadata and stores canonical season_id relationships', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    begun.note.extraFrontmatter.future_key = { retained: true };
    const saved = await seasons.saveStep(begun, 'feelings', { feelings: ['calm'] });
    expect(saved.note.extraFrontmatter.future_key).toEqual({ retained: true });
    expect(saved.note.extraFrontmatter.season_id).toBe(saved.state.id);
  });
});
