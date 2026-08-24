import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createInMemoryVault,
  createVaultBackup,
  prepareVaultImport,
  type VaultBackup,
} from '@studio/storage';
import type { StudioService } from '@studio/application';
import { vi } from 'vitest';

import SettingsRoom from './SettingsRoom';

function rhythmProfileService(
  overrides: Partial<StudioService['rhythmProfile']> = {},
): StudioService {
  return {
    rhythmProfile: {
      load: vi.fn(async () => ({
        profile: null,
        revision: null,
        repairRequired: false,
      })),
      save: vi.fn(),
      ...overrides,
    },
    preferences: {
      load: vi.fn(async () => ({
        preferences: {},
        revision: null,
        repairRequired: false,
      })),
      save: vi.fn(),
    },
  } as unknown as StudioService;
}

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
  expect(backup?.fileName).toMatch(/^ateliera-backup-.*\.zip$/u);
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

it('previews the actual current path for a stable-ID conflict', async () => {
  const source = createInMemoryVault();
  await source.writeTextAtomic(
    'Inbox/renamed.md',
    '---\nid: shared-note\ntype: reflection\n---\n\nfrom backup\n',
  );
  const backup = await createVaultBackup(source, {
    generatedAt: '2026-07-14T09:00:00.000Z',
    reason: 'manual',
  });
  const target = createInMemoryVault();
  await target.writeTextAtomic(
    'Archive/original.md',
    '---\nid: shared-note\ntype: reflection\n---\n\ncurrent words\n',
  );
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

  expect(await screen.findByText(
    'Backup file Inbox/renamed.md would replace current file Archive/original.md.',
  )).toBeVisible();
});

it('keeps portability unavailable until a Studio is open', () => {
  render(<SettingsRoom />);
  expect(screen.getByText('Open a Studio to create or restore a portable backup.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Download portable backup' })).toBeDisabled();
  expect(screen.getByLabelText('Choose a Studio backup')).toBeDisabled();
});

it.each([
  ['continue', 'Continue the tour'],
  ['restart', 'Start the tour again'],
] as const)('offers a %s first-visit action', (tourAction, label) => {
  const onStartTour = vi.fn();
  render(
    <SettingsRoom onStartTour={onStartTour} tourAction={tourAction} />,
  );

  fireEvent.click(screen.getByRole('button', { name: label }));

  expect(onStartTour).toHaveBeenCalledOnce();
});

it('keeps the rhythm profile section hidden until a Studio is open', () => {
  render(<SettingsRoom />);
  expect(screen.queryByRole('heading', { name: 'Rhythm profile' })).not.toBeInTheDocument();
});

it('offers the rhythm profile section once a Studio service is supplied', async () => {
  const save = vi.fn(async (profile: unknown, revision: string | null) => ({
    profile,
    revision: revision ?? 'r1',
    repairRequired: false,
  }));
  const service = rhythmProfileService({
    load: vi.fn(async () => ({
      profile: {
        hemisphere: 'S' as const,
        birth: { date: '1990-01-01' },
        natal: { placements: { sun: 'Capricorn' } },
      },
      revision: 'r0',
      repairRequired: false,
    })),
    save: save as never,
  });

  render(<SettingsRoom service={service} />);

  await waitFor(() =>
    expect(screen.getByLabelText('Birth date')).toHaveValue('1990-01-01'),
  );
  expect(screen.getByRole('heading', { name: 'Rhythm profile' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith(expect.anything(), 'r0');
});

it('remounts the rhythm profile form once its async load resolves', async () => {
  let resolveLoad: (value: {
    profile: null;
    revision: string | null;
    repairRequired: boolean;
  }) => void = () => undefined;
  const load = vi.fn(
    () =>
      new Promise<{
        profile: null;
        revision: string | null;
        repairRequired: boolean;
      }>((resolve) => {
        resolveLoad = resolve;
      }),
  );
  const service = rhythmProfileService({ load: load as never });

  render(<SettingsRoom service={service} />);
  expect(screen.getByRole('heading', { name: 'Rhythm profile' })).toBeVisible();
  expect(screen.getByLabelText('Birth date')).toHaveValue('');

  fireEvent.change(screen.getByLabelText('Birth date'), {
    target: { value: '2000-06-15' },
  });
  expect(screen.getByLabelText('Birth date')).toHaveValue('2000-06-15');

  resolveLoad({
    profile: {
      hemisphere: 'N',
      birth: { date: '1990-01-01' },
      natal: { placements: {} },
    } as never,
    revision: 'r0',
    repairRequired: false,
  });

  await waitFor(() =>
    expect(screen.getByLabelText('Birth date')).toHaveValue('1990-01-01'),
  );
});
