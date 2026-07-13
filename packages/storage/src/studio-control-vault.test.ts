import { describe, expect, it } from 'vitest';

import { PathEscapeError } from './conflict';
import { createInMemoryVault } from './in-memory-vault';
import { createStudioControlVault } from './studio-control-vault';

describe('Studio control vault', () => {
  it('permits only Trash and backup control paths', async () => {
    const vault = createInMemoryVault();
    const control = createStudioControlVault(vault);
    await expect(
      control.writeTextAtomic('.studio/Trash/manifest.json', '{}'),
    ).resolves.toBeDefined();
    await expect(
      control.writeTextAtomic('.studio/backups/a/manifest.json', '{}'),
    ).resolves.toBeDefined();
    await expect(
      control.writeTextAtomic('.studio/settings.json', '{}'),
    ).rejects.toBeInstanceOf(PathEscapeError);
    await expect(control.readText('Notes/private.md')).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it('allows only the two exact season transaction records', async () => {
    const vault = createInMemoryVault();
    const control = createStudioControlVault(vault);
    await expect(
      control.writeTextAtomic('.studio/season/active.json', '{"version":1}', {
        expectedMissing: true,
      }),
    ).resolves.toHaveProperty('hash');
    await expect(
      control.writeTextAtomic(
        '.studio/season/close-journal.json',
        '{"version":1}',
        { expectedMissing: true },
      ),
    ).resolves.toHaveProperty('hash');
    await expect(
      control.writeTextAtomic('.studio/season/other.json', '{}'),
    ).rejects.toThrow(PathEscapeError);
  });

  it('allows only explicit moves across the user/control boundary', async () => {
    const vault = createInMemoryVault();
    const control = createStudioControlVault(vault);
    await vault.writeTextAtomic('Notes/a.md', 'a');
    await control.moveInto('Notes/a.md', '.studio/Trash/items/a/a.md');
    await control.moveOut('.studio/Trash/items/a/a.md', 'Notes/restored.md');
    await expect(vault.readText('Notes/restored.md')).resolves.toMatchObject({
      text: 'a',
    });

    await expect(
      control.moveInto('.studio/views/a.json', '.studio/Trash/a.json'),
    ).rejects.toBeInstanceOf(PathEscapeError);
    await expect(
      control.moveInto('Notes/.studio-attack.md', '.studio/Trash/a.json'),
    ).rejects.toBeInstanceOf(PathEscapeError);
    await expect(
      control.moveOut('.studio/Trash/a.json', '.studio/views/a.json'),
    ).rejects.toBeInstanceOf(PathEscapeError);
  });
});
