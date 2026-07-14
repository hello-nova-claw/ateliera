import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import {
  PortabilitySettings,
  type PortabilityPreview,
} from './PortabilitySettings';

const preview: PortabilityPreview = {
  archiveName: 'the-studio-2026-07-14.zip',
  exportedAt: '2026-07-14T09:00:00.000Z',
  items: [
    { action: 'create', path: 'Reflection Garden/quiet.md', size: 812 },
    { action: 'overwrite', path: '.studio/settings.json', size: 214 },
    { action: 'skip', path: 'Attachments/hill.jpg', size: 4_812 },
    {
      action: 'conflict',
      path: 'Identity/future-self.md',
      size: 642,
      reason: 'A different note already uses this identity.',
    },
  ],
};

it('offers a portable backup without productivity language', async () => {
  const onExport = vi.fn(async () => undefined);
  render(<PortabilitySettings onExport={onExport} />);

  const exportButton = screen.getByRole('button', { name: 'Download portable backup' });
  fireEvent.click(exportButton);
  expect(exportButton).toBeDisabled();
  await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(exportButton).not.toBeDisabled());
  expect(screen.getByRole('status')).toHaveTextContent('Your portable backup is ready');
  expect(screen.queryByText(/streak|overdue|progress/i)).not.toBeInTheDocument();
});

it('validates a ZIP before presenting an exact restore preview', async () => {
  const onPrepareRestore = vi.fn(async () => preview);
  render(<PortabilitySettings onPrepareRestore={onPrepareRestore} />);

  const file = new File(['safe archive'], 'the-studio.zip', {
    type: 'application/zip',
  });
  fireEvent.change(screen.getByLabelText('Choose a Studio backup'), {
    target: { files: [file] },
  });

  expect(await screen.findByRole('heading', { name: 'Review this restore' })).toBeVisible();
  expect(onPrepareRestore).toHaveBeenCalledWith(file);
  const summary = screen.getByRole('list', { name: 'Restore summary' });
  expect(within(summary).getByText('to create').closest('li')).toHaveTextContent('1 to create');
  expect(within(summary).getByText('to overwrite').closest('li')).toHaveTextContent('1 to overwrite');
  expect(within(summary).getByText('unchanged').closest('li')).toHaveTextContent('1 unchanged');
  expect(within(summary).getByText('conflict').closest('li')).toHaveTextContent('1 conflict');
  expect(screen.getAllByText('Identity/future-self.md')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Restore this backup' })).toBeDisabled();
});

it('requires an explicit choice for every conflict before restore', async () => {
  const onRestore = vi.fn(async () => undefined);
  render(
    <PortabilitySettings
      onPrepareRestore={vi.fn(async () => preview)}
      onRestore={onRestore}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose a Studio backup'), {
    target: {
      files: [new File(['safe archive'], 'the-studio.zip', { type: 'application/zip' })],
    },
  });
  await screen.findByRole('heading', { name: 'Review this restore' });
  const useBackup = screen.getByRole('radio', {
    name: 'Use the file from this backup for Identity/future-self.md',
  });
  fireEvent.click(useBackup);
  fireEvent.click(screen.getByRole('checkbox', {
    name: 'I understand that 2 existing files will be overwritten',
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore this backup' }));

  await waitFor(() => expect(onRestore).toHaveBeenCalledWith(preview, {
    'Identity/future-self.md': 'overwrite',
  }));
});

it('requires explicit confirmation, serializes restore, and restores exact focus', async () => {
  const clearPreview: PortabilityPreview = {
    ...preview,
    items: preview.items.filter((item) => item.action !== 'conflict'),
  };
  let finishRestore!: () => void;
  const onRestore = vi.fn(
    () => new Promise<void>((resolve) => {
      finishRestore = resolve;
    }),
  );
  render(
    <PortabilitySettings
      onPrepareRestore={vi.fn(async () => clearPreview)}
      onRestore={onRestore}
    />,
  );
  fireEvent.change(screen.getByLabelText('Choose a Studio backup'), {
    target: {
      files: [new File(['safe archive'], 'the-studio.zip', { type: 'application/zip' })],
    },
  });
  const confirm = await screen.findByRole('checkbox', {
    name: 'I understand that 1 existing file will be overwritten',
  });
  const restore = screen.getByRole('button', { name: 'Restore this backup' });
  expect(restore).toBeDisabled();
  fireEvent.click(confirm);
  restore.focus();
  fireEvent.click(restore);
  fireEvent.click(restore);
  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(restore).toBeDisabled();
  finishRestore();
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Restore complete. Your Studio is ready to reopen',
  );
  await waitFor(() => expect(restore).toHaveFocus());
});

it('keeps a failed archive untouched and offers an exact retry', async () => {
  const onPrepareRestore = vi
    .fn()
    .mockRejectedValueOnce(new Error('This backup did not pass checksum validation.'))
    .mockResolvedValueOnce(preview);
  render(<PortabilitySettings onPrepareRestore={onPrepareRestore} />);
  const input = screen.getByLabelText('Choose a Studio backup');
  fireEvent.change(input, {
    target: {
      files: [new File(['unsafe archive'], 'the-studio.zip', { type: 'application/zip' })],
    },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('checksum validation');
  const retry = screen.getByRole('button', { name: 'Check this backup again' });
  retry.focus();
  fireEvent.click(retry);
  expect(await screen.findByRole('heading', { name: 'Review this restore' })).toBeVisible();
  expect(onPrepareRestore).toHaveBeenCalledTimes(2);
});
