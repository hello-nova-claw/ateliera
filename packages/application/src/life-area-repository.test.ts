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
    expect(snapshot.repairRequired).toBe(false);
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
    expect(loaded).toEqual({ ...saved, repairRequired: false });

    const renamed = loaded.areas.map((area) =>
      area.id === 'home' ? { ...area, title: 'A Calm Home' } : area,
    );
    const updated = await repository.save(renamed, loaded.revision);
    expect(updated.areas.find((area) => area.id === 'home')?.title).toBe(
      'A Calm Home',
    );
    expect(updated.revision).not.toBe(loaded.revision);
  });

  it('falls back from malformed config without replacing its original bytes', async () => {
    const vault = createInMemoryVault();
    const text = '{';
    const malformed = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);
    const repository = createLifeAreaRepository(vault);

    const snapshot = await repository.load();

    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.revision).toBe(malformed.hash);
    expect(snapshot.areas[0]).toMatchObject({ id: 'family', order: 0 });
    await expect(vault.readText(LIFE_AREA_CONFIG_PATH)).resolves.toEqual({
      text,
      hash: malformed.hash,
    });
  });

  it('never overwrites a concurrent edit when saving from a malformed fallback', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, '{');
    const repository = createLifeAreaRepository(vault);
    const fallback = await repository.load();
    await vault.writeTextAtomic(
      LIFE_AREA_CONFIG_PATH,
      JSON.stringify({ version: 1, areas: customAreas }),
    );

    await expect(
      repository.save(fallback.areas, fallback.revision),
    ).rejects.toBeInstanceOf(VaultConflictError);
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

  it('falls back from structurally invalid config without publishing defaults', async () => {
    for (const text of [
      '{"version":0,"areas":[]}',
      '{"version":1,"areas":[{"id":"home"}]}',
    ]) {
      const vault = createInMemoryVault();
      const original = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);
      const snapshot = await createLifeAreaRepository(vault).load();
      expect(snapshot.repairRequired).toBe(true);
      expect(snapshot.revision).toBe(original.hash);
      expect(snapshot.areas).toHaveLength(defaultLifeAreas.length);
      await expect(vault.readText(LIFE_AREA_CONFIG_PATH)).resolves.toMatchObject({
        text,
      });
    }
  });

  it('uses size metadata to preserve oversized config without reading it', async () => {
    const vault = createInMemoryVault();
    const text = `{"version":2,"areas":[],"padding":"${'x'.repeat(65_537)}"}\n`;
    const original = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);
    const read = vi.spyOn(vault, 'readText');

    const snapshot = await createLifeAreaRepository(vault).load();

    expect(snapshot).toMatchObject({
      revision: original.hash,
      repairRequired: true,
    });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    await expect(vault.readText(LIFE_AREA_CONFIG_PATH)).resolves.toMatchObject({
      text,
      hash: original.hash,
    });
  });

  it('keeps oversized bytes recoverable when metadata becomes stale before read', async () => {
    const vault = createInMemoryVault();
    const text = ' '.repeat(65_537);
    const original = await vault.writeTextAtomic(LIFE_AREA_CONFIG_PATH, text);
    vi.spyOn(vault, 'list').mockResolvedValueOnce([
      {
        path: LIFE_AREA_CONFIG_PATH,
        kind: 'file',
        size: 1,
        contentHash: original.hash,
      },
    ]);

    const snapshot = await createLifeAreaRepository(vault).load();

    expect(snapshot).toMatchObject({
      revision: original.hash,
      repairRequired: true,
    });
    await expect(vault.readText(LIFE_AREA_CONFIG_PATH)).resolves.toMatchObject({
      text,
    });
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
    await repository.save(customAreas, null);
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(
      new VaultUnavailableError('storage unavailable'),
    );
    vi.spyOn(vault, 'exists').mockResolvedValueOnce(true);

    await expect(repository.load()).rejects.toThrow('storage unavailable');
  });

  it('propagates unexpected adapter errors without probing for absence', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    await repository.save(customAreas, null);
    const exists = vi.spyOn(vault, 'exists');
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new TypeError('adapter bug'));

    await expect(repository.load()).rejects.toThrow('adapter bug');
    expect(exists).not.toHaveBeenCalled();
  });

  it('uses the missing fallback when metadata lookup reports an absent path', async () => {
    const vault = createInMemoryVault();
    vi.spyOn(vault, 'list').mockRejectedValueOnce(new VaultUnavailableError());
    vi.spyOn(vault, 'exists').mockResolvedValueOnce(false);

    await expect(createLifeAreaRepository(vault).load()).resolves.toMatchObject({
      revision: null,
      repairRequired: false,
    });
  });

  it('does not hide metadata outages when the config path exists', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    await repository.save(customAreas, null);
    vi.spyOn(vault, 'list').mockRejectedValueOnce(
      new VaultUnavailableError('metadata unavailable'),
    );

    await expect(repository.load()).rejects.toThrow('metadata unavailable');
  });

  it('propagates unexpected metadata errors without probing for absence', async () => {
    const vault = createInMemoryVault();
    const exists = vi.spyOn(vault, 'exists');
    vi.spyOn(vault, 'list').mockRejectedValueOnce(new TypeError('metadata bug'));

    await expect(createLifeAreaRepository(vault).load()).rejects.toThrow(
      'metadata bug',
    );
    expect(exists).not.toHaveBeenCalled();
  });

  it.each([
    { path: LIFE_AREA_CONFIG_PATH, kind: 'directory' as const },
    { path: LIFE_AREA_CONFIG_PATH, kind: 'file' as const },
  ])('rejects unusable config metadata for a $kind entry', async (entry) => {
    const vault = createInMemoryVault();
    vi.spyOn(vault, 'list').mockResolvedValueOnce([entry]);

    await expect(createLifeAreaRepository(vault).load()).rejects.toThrow(
      'metadata is unavailable',
    );
  });

  it('falls back safely when config disappears after metadata preflight', async () => {
    const vault = createInMemoryVault();
    const repository = createLifeAreaRepository(vault);
    await repository.save(customAreas, null);
    vi.spyOn(vault, 'readText').mockImplementationOnce(async () => {
      await vault.remove(LIFE_AREA_CONFIG_PATH);
      throw new VaultUnavailableError();
    });

    await expect(repository.load()).resolves.toMatchObject({
      revision: null,
      repairRequired: false,
    });
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
