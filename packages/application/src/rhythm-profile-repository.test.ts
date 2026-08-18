import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

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
});
