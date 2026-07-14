import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createInMemoryVault,
  createVaultBackup,
  prepareVaultImport,
  type VaultBackup,
} from '@studio/storage';
import { vi } from 'vitest';

import SettingsRoom from './SettingsRoom';

it('creates a complete portable backup from the active vault', async () => {
  const vault = createInMemoryVault();
  await vault.writeTextAtomic('Reflection Garden/quiet.md', '# A quiet morning\n');
  await vault.writeBinaryAtomic('Attachments/hill.jpg', new Uint8Array([1, 2, 3]));
  await vault.writeTextAtomic('.studio/config/landscape-areas.json', '{"version":1}');
  await vault.writeTextAtomic('.studio/index/search.db', 'disposable');
  let savedBackup: VaultBackup | undefined;
  const saveBackup = vi.fn(async (backup: VaultBackup) => {
    savedBackup = backup;
  });

  render(<SettingsRoom saveBackup={saveBackup} vault={vault} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download portable backup' }));

  await waitFor(() => expect(saveBackup).toHaveBeenCalledTimes(1));
  const backup = savedBackup;
  expect(backup?.fileName).toMatch(/^the-studio-backup-.*\.zip$/u);
  const clean = createInMemoryVault();
  const plan = await prepareVaultImport(clean, backup!.bytes);
  expect(plan.items.map((item) => item.path)).toEqual([
    '.studio/config/landscape-areas.json',
    'Attachments/hill.jpg',
    'Reflection Garden/quiet.md',
  ]);
  expect(plan.manifest.excludedCaches).toContain('.studio/index/search.db');
});

it('previews and restores only after explicit confirmation', async () => {
  const source = createInMemoryVault();
  await source.writeTextAtomic('Inbox/hill.md', 'from backup');
  const backup = await createVaultBackup(source, {
    generatedAt: '2026-07-14T09:00:00.000Z',
    reason: 'manual',
  });
  const target = createInMemoryVault();
  await target.writeTextAtomic('Inbox/hill.md', 'current words');
  const file = new File([backup.bytes.slice().buffer as ArrayBuffer], backup.fileName, {
    type: 'application/zip',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => backup.bytes.slice().buffer,
  });

  render(<SettingsRoom vault={target} />);
  fireEvent.change(screen.getByLabelText('Choose a Studio backup'), {
    target: { files: [file] },
  });
  expect(await screen.findByRole('heading', { name: 'Review this restore' })).toBeVisible();
  expect((await target.readText('Inbox/hill.md')).text).toBe('current words');

  fireEvent.click(screen.getByRole('checkbox', {
    name: 'I understand that 1 existing file will be overwritten',
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore this backup' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Restore complete');
  expect((await target.readText('Inbox/hill.md')).text).toBe('from backup');
});

it('keeps portability unavailable until a Studio is open', () => {
  render(<SettingsRoom />);
  expect(screen.getByText('Open a Studio to create or restore a portable backup.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Download portable backup' })).toBeDisabled();
  expect(screen.getByLabelText('Choose a Studio backup')).toBeDisabled();
});
