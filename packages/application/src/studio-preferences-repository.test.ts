import { VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  STUDIO_PREFERENCES_CONFIG_PATH,
  createStudioPreferencesRepository,
  type StoredStudioPreferences,
} from './studio-preferences-repository';

const sample: StoredStudioPreferences = {
  rooms: { identity: 'on', season: 'off' },
  foyerSections: { feelings: 'off', almanac: 'on' },
  rhythm: { moon: true, microSeason: true, cycle: false },
  reveals: { season: 'accepted', wisdom: 'dismissed' },
};

describe('Studio preferences repository', () => {
  it('defaults to empty preferences until any are saved', async () => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    const initial = await repository.load();
    expect(initial.preferences).toEqual({});
    expect(initial.revision).toBeNull();
    expect(initial.repairRequired).toBe(false);

    const saved = await repository.save(sample, initial.revision);
    expect(saved.preferences).toEqual(sample);
    expect(await vault.exists(STUDIO_PREFERENCES_CONFIG_PATH)).toBe(true);
  });

  it('accepts empty preferences meaning "all defaults"', async () => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    const saved = await repository.save({}, null);
    expect(saved.preferences).toEqual({});
    expect(await repository.load()).toMatchObject({ preferences: {} });
  });

  it('accepts a sparse set of overrides', async () => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    const sparse: StoredStudioPreferences = { rhythm: { cycle: false } };
    const saved = await repository.save(sparse, null);
    expect(saved.preferences).toEqual(sparse);
    expect(await repository.load()).toMatchObject({ preferences: sparse });
  });

  it('shows recoverable defaults without overwriting malformed bytes', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(STUDIO_PREFERENCES_CONFIG_PATH, '{broken', {
      expectedMissing: true,
    });
    const snapshot = await createStudioPreferencesRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.preferences).toEqual({});
    expect(snapshot.revision).not.toBeNull();
    expect((await vault.readText(STUDIO_PREFERENCES_CONFIG_PATH)).text).toBe('{broken');
  });

  it('refuses to downgrade a future config version', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      STUDIO_PREFERENCES_CONFIG_PATH,
      '{"version":2,"preferences":{}}',
      { expectedMissing: true },
    );
    await expect(
      createStudioPreferencesRepository(vault).load(),
    ).rejects.toThrow('newer version');
  });

  it('round-trips saved preferences and updates them with a non-null revision', async () => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    const saved = await repository.save(sample, null);

    const reloaded = await repository.load();
    expect(reloaded.preferences).toEqual(sample);
    expect(reloaded.revision).toBe(saved.revision);
    expect(reloaded.repairRequired).toBe(false);

    const updated: StoredStudioPreferences = {
      ...sample,
      rooms: { identity: 'on', season: 'on' },
    };
    const resaved = await repository.save(updated, reloaded.revision);
    expect(resaved.preferences).toEqual(updated);
    expect(await repository.load()).toMatchObject({ preferences: updated });
  });

  it('shows recoverable defaults for a well-shaped but invalid stored file', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      STUDIO_PREFERENCES_CONFIG_PATH,
      '{"version":1,"preferences":{"rooms":{"identity":"maybe"}}}',
      { expectedMissing: true },
    );
    const snapshot = await createStudioPreferencesRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.preferences).toEqual({});
    expect((await vault.readText(STUDIO_PREFERENCES_CONFIG_PATH)).text).toContain(
      'maybe',
    );
  });

  it('shows recoverable defaults for an envelope missing the preferences field', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(STUDIO_PREFERENCES_CONFIG_PATH, '{"version":1}', {
      expectedMissing: true,
    });
    const snapshot = await createStudioPreferencesRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
  });

  it('shows recoverable defaults for a config that exceeds the byte cap', async () => {
    const vault = createInMemoryVault();
    const oversized = JSON.stringify({
      version: 1,
      preferences: { reveals: { pad: 'x'.repeat(70 * 1024) } },
    });
    await vault.writeTextAtomic(STUDIO_PREFERENCES_CONFIG_PATH, oversized, {
      expectedMissing: true,
    });
    const snapshot = await createStudioPreferencesRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
  });

  it('rethrows an unavailable read when the config path still exists', async () => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    await repository.save(sample, null);
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(
      new VaultUnavailableError('backend offline'),
    );
    await expect(repository.load()).rejects.toThrow('backend offline');
  });

  const invalidPreferences: ReadonlyArray<[string, unknown]> = [
    ['an unexpected top-level key', { ...sample, extra: true }],
    ['a non-object rooms', { rooms: 'nope' }],
    ['a rooms array', { rooms: ['identity'] }],
    ['a room value outside on/off', { rooms: { identity: 'maybe' } }],
    ['a non-object foyerSections', { foyerSections: 7 }],
    ['a foyer section value outside on/off', { foyerSections: { almanac: true } }],
    ['a non-object rhythm', { rhythm: 'nope' }],
    ['an unexpected rhythm key', { rhythm: { moon: true, stars: true } }],
    ['a non-boolean rhythm value', { rhythm: { moon: 'yes' } }],
    ['a non-object reveals', { reveals: [] }],
    ['a reveal value outside accepted/dismissed', { reveals: { season: 'later' } }],
  ];

  it.each(invalidPreferences)('rejects %s', async (_label, invalid) => {
    const vault = createInMemoryVault();
    const repository = createStudioPreferencesRepository(vault);
    await expect(
      repository.save(invalid as StoredStudioPreferences, null),
    ).rejects.toThrow();
  });
});
