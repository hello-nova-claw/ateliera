import { VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  RHYTHM_PROFILE_CONFIG_PATH,
  createRhythmProfileRepository,
  type StoredRhythmProfile,
} from './rhythm-profile-repository';

const sample: StoredRhythmProfile = {
  hemisphere: 'S',
  cycle: { lastPeriodStart: '2026-08-01', avgLengthDays: 28 },
  birth: {
    date: '1990-01-01',
    timeLocal: '08:00',
    timeZone: 'Pacific/Auckland',
    lat: -36.85,
    lon: 174.76,
    place: 'Auckland',
  },
  natal: { placements: { sun: 'Capricorn', moon: 'Leo', rising: 'Virgo' } },
};

describe('Rhythm profile repository', () => {
  it('has no profile until one is saved', async () => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    const initial = await repository.load();
    expect(initial.profile).toBeNull();
    expect(initial.revision).toBeNull();

    const saved = await repository.save(sample, initial.revision);
    expect(saved.profile).toEqual(sample);
    expect(await vault.exists(RHYTHM_PROFILE_CONFIG_PATH)).toBe(true);
  });

  it('shows a recoverable null profile without overwriting malformed bytes', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(RHYTHM_PROFILE_CONFIG_PATH, '{broken', {
      expectedMissing: true,
    });
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.revision).not.toBeNull();
    expect((await vault.readText(RHYTHM_PROFILE_CONFIG_PATH)).text).toBe('{broken');
  });

  it('refuses to downgrade a future config version', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      RHYTHM_PROFILE_CONFIG_PATH,
      '{"version":2,"profile":null}',
      { expectedMissing: true },
    );
    await expect(createRhythmProfileRepository(vault).load()).rejects.toThrow(
      'newer version',
    );
  });

  it('round-trips a saved profile through load() and updates it with a non-null expectedRevision', async () => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    const saved = await repository.save(sample, null);

    const reloaded = await repository.load();
    expect(reloaded.profile).toEqual(sample);
    expect(reloaded.revision).toBe(saved.revision);
    expect(reloaded.repairRequired).toBe(false);

    const updated: StoredRhythmProfile = {
      ...sample,
      hemisphere: 'N',
      natal: { placements: { sun: 'Aquarius' } },
    };
    const resaved = await repository.save(updated, reloaded.revision);
    expect(resaved.profile).toEqual(updated);
    expect(await repository.load()).toMatchObject({ profile: updated });
  });

  it('accepts a profile with only its required fields, omitting cycle and optional birth fields', async () => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    const minimal: StoredRhythmProfile = {
      hemisphere: 'N',
      birth: {},
      natal: { placements: {} },
    };
    const saved = await repository.save(minimal, null);
    expect(saved.profile).toEqual(minimal);
    expect(await repository.load()).toMatchObject({ profile: minimal });
  });

  it('shows a recoverable null profile for a well-shaped but invalid stored profile', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      RHYTHM_PROFILE_CONFIG_PATH,
      '{"version":1,"profile":{"hemisphere":"west","birth":{},"natal":{"placements":{}}}}',
      { expectedMissing: true },
    );
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.profile).toBeNull();
    expect((await vault.readText(RHYTHM_PROFILE_CONFIG_PATH)).text).toContain('west');
  });

  it('recognizes a stored profile explicitly cleared to null', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      RHYTHM_PROFILE_CONFIG_PATH,
      '{"version":1,"profile":null}',
      { expectedMissing: true },
    );
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.profile).toBeNull();
    expect(snapshot.repairRequired).toBe(false);
  });

  it('shows a recoverable null profile for an envelope missing the profile field', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(RHYTHM_PROFILE_CONFIG_PATH, '{"version":1}', {
      expectedMissing: true,
    });
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
  });

  it('shows a recoverable null profile for a config that exceeds the byte cap', async () => {
    const vault = createInMemoryVault();
    const oversized = JSON.stringify({
      version: 1,
      profile: { ...sample, natal: { placements: { pad: 'x'.repeat(70 * 1024) } } },
    });
    await vault.writeTextAtomic(RHYTHM_PROFILE_CONFIG_PATH, oversized, {
      expectedMissing: true,
    });
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
  });

  it('rethrows an unavailable read when the config path still exists', async () => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    await repository.save(sample, null);
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(
      new VaultUnavailableError('backend offline'),
    );
    await expect(repository.load()).rejects.toThrow('backend offline');
  });

  const invalidProfiles: ReadonlyArray<[string, unknown]> = [
    ['a hemisphere outside N/S', { ...sample, hemisphere: 'west' }],
    ['a non-object birth', { ...sample, birth: 'nope' }],
    ['a birth with an unexpected key', { ...sample, birth: { ...sample.birth, extra: true } }],
    ['a birth field with the wrong type', { ...sample, birth: { ...sample.birth, lat: 'north' } }],
    [
      'a profile missing natal',
      { hemisphere: sample.hemisphere, cycle: sample.cycle, birth: sample.birth },
    ],
    ['a non-object natal', { ...sample, natal: 'nope' }],
    ['natal placements that are not a record', { ...sample, natal: { placements: ['sun'] } }],
    [
      'a natal placement with a non-string value',
      { ...sample, natal: { placements: { sun: 42 } } },
    ],
    ['a non-object cycle', { ...sample, cycle: 'nope' }],
    [
      'a cycle missing lastPeriodStart',
      { ...sample, cycle: { avgLengthDays: 28 } },
    ],
    [
      'a cycle with an empty lastPeriodStart',
      { ...sample, cycle: { ...sample.cycle, lastPeriodStart: '' } },
    ],
    [
      'a cycle with a non-positive avgLengthDays',
      { ...sample, cycle: { ...sample.cycle, avgLengthDays: 0 } },
    ],
    ['a profile with an unexpected top-level key', { ...sample, extra: true }],
  ];

  it.each(invalidProfiles)('rejects a profile with %s', async (_label, invalid) => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    await expect(
      repository.save(invalid as StoredRhythmProfile, null),
    ).rejects.toThrow();
  });
});
