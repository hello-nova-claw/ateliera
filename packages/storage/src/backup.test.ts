import { expect, it } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import { createVaultBackup, restoreVaultBackup } from './backup';

it('creates a named portable backup and restores it', async () => {
  const source = createInMemoryVault();
  await source.writeTextAtomic('Inbox/hill.md', '# Hill\n');
  const backup = await createVaultBackup(source, {
    generatedAt: '2026-07-14T12:34:56.000Z',
    reason: 'manual',
  });
  expect(backup.fileName).toBe('the-studio-backup-2026-07-14T123456Z.zip');

  const target = createInMemoryVault();
  await restoreVaultBackup(target, backup.bytes, { confirm: true });
  await expect(target.readText('Inbox/hill.md')).resolves.toMatchObject({ text: '# Hill\n' });
});
