import { defaultLifeAreas } from '@studio/domain';
import {
  VaultConflictError,
  VaultUnavailableError,
  createInMemoryVault,
} from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  LIFE_AREA_CONFIG_PATH,
  MAX_LIFE_AREAS,
  UnsupportedLifeAreaConfigError,
  createLifeAreaRepository,
  type LifeAreaPreference,
} from './life-area-repository';
import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

const customAreas: LifeAreaPreference[] = [
  { id: 'home', title: 'Our Home', hidden: false, order: 1 },
  { id: 'family', title: 'Family Life', hidden: true, order: 0 },
  { id: 'slow-business', title: 'Slow Business', hidden: false, order: 2 },
];

describe('life area repository', () => {
  it('returns ordered defaults and an exact missing revision when config is absent', async () => {
    const repository = createLifeAreaRepository(createInMemoryVault());

    const snapshot = await repository.load();

    expect(snapshot.revision).toBeNull();
    expect(snapshot.repaired).toBe(false);
    expect(snapshot.areas).toEqual(
      defaultLifeAreas.map((area, order) => ({
        ...area,
        hidden: order >= 5,
        order,
      })),
    );
    expect(snapshot.areas.filter((area) => !area.hidden)).toHaveLength(5);
  });

  it('persists renamed, custom, hidden, and reordered areas with exact CAS', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);

    const saved = await repository.save(customAreas, null);
    expect(saved.revision).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved.areas.map((area) => area.id)).toEqual([
      'family',
      'home',
      'slow-business',
    ]);
    expect(saved.areas[0]).toMatchObject({ title: 'Family Life', hidden: true });

    const loaded = await repository.load();
    expect(loaded).toEqual({ ...saved, repaired: false });

    const renamed = loaded.areas.map((area) =>
      area.id === 'home' ? { ...area, title: 'A Calm Home' } : area,
    );
    const updated = await repository.save(renamed, loaded.revision);
    expect(updated.areas.find((area) => area.id === 'home')?.title).toBe(
      'A Calm Home',
    );
    expect(updated.revision).not.toBe(loaded.revision);
  });

  it('repairs malformed config to defaults against the observed hash', async () => {
    const vault = createInMemoryVault();
    const malformed = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, '{');
    const repository = createLifeAreaRepository(vault);

    const snapshot = await repository.load();

    expect(snapshot.repaired).toBe(true);
    expect(snapshot.revision).not.toBe(malformed.hash);
    expect(snapshot.areas[0]).toMatchObject({ id: 'family', order: 0 });
    await expect(repository.load()).resolves.toEqual({
      ...snapshot,
      repaired: false,
    });
  });

  it('never overwrites a concurrent edit while repairing malformed config', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, '{');
    const repository = createLifeAreaRepository(vault);
    const originalWrite = vault.writeTextAtomic.bind(vault);
    vi.spyOn(vault, 'writeTextAtomic').mockImplementationOnce(
      async (path, text, condition) => {
        await originalWrite(
          LIFE_AREA_CONFIG_PATH,
          JSON.stringify({ version: 1, areas: customAreas }),
        );
        return originalWrite(path, text, condition);
      },
    );

    await expect(repository.load()).rejects.toBeInstanceOf(VaultConflictError);
    expect((await repository.load()).areas).toEqual(
      [...customAreas].sort((left, right) => left.order - right.order),
    );
  });

  it('rejects stale and missing-only writes rather than replacing durable config', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    const first = await repository.save(customAreas, null);
    const changed = customAreas.map((area) =>
      area.id === 'home' ? { ...area, title: 'Changed Elsewhere' } : area,
    );
    await repository.save(changed, first.revision);

    await expect(repository.save(customAreas, first.revision)).rejects.toBeInstanceOf(
      VaultConflictError,
    );
    await expect(repository.save(customAreas, null)).rejects.toBeInstanceOf(
      VaultConflictError,
    );
    expect((await repository.load()).areas[1]?.title).toBe('Changed Elsewhere');
  });

  it.each([
    ['empty', []],
    ['too many', Array.from({ length: MAX_LIFE_AREAS + 1 }, (_, order) => ({ id: `area-${order}`, title: `Area ${order}`, hidden: false, order }))],
    ['invalid slug', [{ id: 'Home!', title: 'Home', hidden: false, order: 0 }]],
    ['blank title', [{ id: 'home', title: '   ', hidden: false, order: 0 }]],
    ['non-text title', [{ id: 'home', title: 42, hidden: false, order: 0 }]],
    ['long title', [{ id: 'home', title: 'x'.repeat(101), hidden: false, order: 0 }]],
    ['duplicate id', [{ id: 'home', title: 'Home', hidden: false, order: 0 }, { id: 'home', title: 'Elsewhere', hidden: false, order: 1 }]],
    ['duplicate normalized title', [{ id: 'home', title: ' Café ', hidden: false, order: 0 }, { id: 'food', title: 'Cafe\u0301', hidden: false, order: 1 }]],
    ['duplicate order', [{ id: 'home', title: 'Home', hidden: false, order: 0 }, { id: 'family', title: 'Family', hidden: false, order: 0 }]],
    ['invalid hidden', [{ id: 'home', title: 'Home', hidden: 'no', order: 0 }]],
    ['invalid order', [{ id: 'home', title: 'Home', hidden: false, order: -1 }]],
  ])('rejects %s state before writing', async (_label, areas) => {
    const vault = createInMemoryVault();
    const write = vi.spyOn(vault, 'writeTextAtomic');
    const repository = createLifeAreaRepository(vault);

    await expect(
      repository.save(areas as LifeAreaPreference[], null),
    ).rejects.toThrow('Life area');
    expect(write).not.toHaveBeenCalled();
  });

  it('falls back and repairs oversized and structurally invalid config', async () => {
    for (const text of [
      ' '.repeat(65_537),
      '{"version":1,"areas":[{"id":"home"}]}',
    ]) {
      const vault = createInMemoryVault();
      await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);
      const snapshot = await createLifeAreaRepository(vault).load();
      expect(snapshot.repaired).toBe(true);
      expect(snapshot.areas).toHaveLength(defaultLifeAreas.length);
    }
  });

  it('preserves configuration written by a newer schema version', async () => {
    const vault = createInMemoryVault();
    const text = '{"version":2,"areas":[],"future":true}\n';
    const original = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);

    await expect(createLifeAreaRepository(vault).load()).rejects.toBeInstanceOf(
      UnsupportedLifeAreaConfigError,
    );
    await expect(vault.readText(LIFE_AREA_CONFIG_PATH)).resolves.toEqual({
      text,
      hash: original.hash,
    });
  });

  it('does not hide real read failures behind the missing-config fallback', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(
      new VaultUnavailableError('storage unavailable'),
    );
    vi.spyOn(vault, 'exists').mockResolvedValueOnce(true);

    await expect(repository.load()).rejects.toThrow('storage unavailable');
  });

  it('propagates unexpected adapter errors without probing for absence', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    const exists = vi.spyOn(vault, 'exists');
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new TypeError('adapter bug'));

    await expect(repository.load()).rejects.toThrow('adapter bug');
    expect(exists).not.toHaveBeenCalled();
  });
});

describe('StudioService life area repository boundary', () => {
  it('exposes a vault-backed repository by default', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const initial = await service.lifeAreas.load();
    const changed = initial.areas.map((area) =>
      area.id === 'home' ? { ...area, title: 'Our Home' } : area,
    );

    await service.lifeAreas.save(changed, initial.revision);

    const reopened = createStudioService({ vault, index: new RecordingIndex() });
    expect(
      (await reopened.lifeAreas.load()).areas.find((area) => area.id === 'home')
        ?.title,
    ).toBe('Our Home');
  });

  it('uses the injected repository required by native adapters', () => {
    const lifeAreas = {
      load: vi.fn(),
      save: vi.fn(),
    };
    const service = createStudioService({
      vault: createInMemoryVault(),
      index: new RecordingIndex(),
      lifeAreas,
    });

    expect(service.lifeAreas).toBe(lifeAreas);
  });
});
