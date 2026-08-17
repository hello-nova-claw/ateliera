import { defaultWisdomThemes } from '@studio/domain';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import {
  WISDOM_THEME_CONFIG_PATH,
  createWisdomThemeRepository,
} from './wisdom-theme-repository';

describe('Wisdom theme repository', () => {
  it('starts with the calm defaults and saves an editable ordered contents', async () => {
    const vault = createInMemoryVault();
    const repository = createWisdomThemeRepository(vault);
    const initial = await repository.load();
    expect(initial.themes.map((theme) => theme.id)).toEqual(
      defaultWisdomThemes.map((theme) => theme.id),
    );

    const saved = await repository.save(
      [
        { id: 'motherhood', title: 'Motherhood', hidden: false, order: 0 },
        { id: 'slow-living', title: 'Slow living', hidden: false, order: 1 },
      ],
      initial.revision,
    );

    expect(saved.themes[1]).toMatchObject({
      id: 'slow-living',
      title: 'Slow living',
    });
    expect(await vault.exists(WISDOM_THEME_CONFIG_PATH)).toBe(true);
  });

  it('shows recoverable defaults without overwriting malformed bytes', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(WISDOM_THEME_CONFIG_PATH, '{broken', {
      expectedMissing: true,
    });
    const snapshot = await createWisdomThemeRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.revision).not.toBeNull();
    expect((await vault.readText(WISDOM_THEME_CONFIG_PATH)).text).toBe(
      '{broken',
    );
  });

  it('rejects unsafe ordering and refuses to downgrade a future config version', async () => {
    const vault = createInMemoryVault();
    const repository = createWisdomThemeRepository(vault);
    await expect(
      repository.save(
        [{ id: 'rest', title: 'Rest', hidden: false, order: -1 }],
        null,
      ),
    ).rejects.toThrow('between 0 and 39');

    await vault.writeTextAtomic(
      WISDOM_THEME_CONFIG_PATH,
      '{"version":2,"themes":[]}',
      { expectedMissing: true },
    );
    await expect(repository.load()).rejects.toThrow('newer version');
  });
});
