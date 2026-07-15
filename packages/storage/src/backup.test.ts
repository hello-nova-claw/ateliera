import { expect, it, vi } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import {
  createVaultBackup,
  restoreVaultBackup,
  runWithPreMigrationBackup,
} from './backup';

it('creates a named portable backup and restores it', async () => {
  const source = createInMemoryVault();
  await source.writeTextAtomic('Inbox/hill.md', '# Hill\n');
  await source.writeTextAtomic(
    '.studio/settings.json',
    '{"version":1,"onboarding":{"version":1,"status":"in-progress","currentStep":"foyer","updatedAt":"2026-07-14T12:00:00.000Z"}}',
  );
  const backup = await createVaultBackup(source, {
    generatedAt: '2026-07-14T12:34:56.000Z',
    reason: 'manual',
  });
  expect(backup.fileName).toBe('ateliera-backup-2026-07-14T123456Z.zip');

  const target = createInMemoryVault();
  await restoreVaultBackup(target, backup.bytes, { confirm: true });
  await expect(target.readText('Inbox/hill.md')).resolves.toMatchObject({ text: '# Hill\n' });
  await expect(target.readText('.studio/settings.json')).resolves.toMatchObject({
    text: expect.stringContaining('"currentStep":"foyer"'),
  });
});

it('persists a complete backup before allowing a migration to mutate the vault', async () => {
  const vault = createInMemoryVault();
  await vault.writeTextAtomic('Notes/before.md', 'before');
  const order: string[] = [];

  await runWithPreMigrationBackup(
    vault,
    async (backup) => {
      order.push(`backup:${backup.reason}`);
      const restored = createInMemoryVault();
      await restoreVaultBackup(restored, backup.bytes, { confirm: true });
      expect((await restored.readText('Notes/before.md')).text).toBe('before');
    },
    async () => {
      order.push('migration');
      await vault.writeTextAtomic('Notes/after.md', 'after');
    },
    { generatedAt: '2026-07-14T10:00:00.000Z' },
  );

  expect(order).toEqual(['backup:pre-migration', 'migration']);
});

it('does not begin a migration when its automatic backup cannot be persisted', async () => {
  const vault = createInMemoryVault();
  const migration = vi.fn(async () => undefined);

  await expect(runWithPreMigrationBackup(
    vault,
    async () => {
      throw new Error('backup destination unavailable');
    },
    migration,
  )).rejects.toThrow('backup destination unavailable');
  expect(migration).not.toHaveBeenCalled();
});
