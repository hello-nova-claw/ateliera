import {
  SearchRepairConflictError,
  type StudioSearchRepairItem,
} from '@studio/application';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RepairPanel } from './RepairPanel';

const metadata: StudioSearchRepairItem = {
  kind: 'metadata',
  path: 'Reflection Garden/broken.md',
  hash: 'old-hash',
  sourceText: '---\ntitle: Kept title\nlegacy_key: kept\n---\r\nWords remain.\r\n',
  rawBody: 'Words remain.\r\n',
  errors: [{ code: 'invalid-frontmatter', path: 'id', message: 'Required' }],
};

const metadataWithRecognizedContext: StudioSearchRepairItem = {
  ...metadata,
  sourceText: `---
id: kept-context
title: Kept context
card_type: text
semantic_type: reflection
status: not-a-status
rooms: [life-landscape]
life_areas: [home]
landscape_anchor: vision
seasons: []
tags: []
created: 2026-07-13T00:00:00.000Z
updated: 2026-07-14T00:00:00.000Z
source: { title: A Book, creator: Anna, url: https://example.test/book }
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
Words remain.
`,
};

const metadataWithInvalidTimestamps: StudioSearchRepairItem = {
  ...metadata,
  sourceText: `---
id: timestamp-repair
title: Repair dates
card_type: reflection
semantic_type: reflection
status: active
rooms: [reflection-garden]
life_areas: []
seasons: []
tags: []
created: yesterday
updated: tomorrow
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
Words remain.
`,
  errors: [
    { code: 'invalid-frontmatter', path: 'created', message: 'Invalid ISO datetime' },
    { code: 'invalid-frontmatter', path: 'updated', message: 'Invalid ISO datetime' },
  ],
};

const broken: StudioSearchRepairItem = {
  kind: 'broken-link',
  path: 'Reflection Garden/link.md',
  hash: 'link-hash',
  sourceText: '---\nvalid: true\n---\nA [[Missing place]].',
  noteId: 'note-1',
  occurrence: 0,
  linkKind: 'wiki',
  target: 'Missing place',
  label: 'Missing place',
  start: 2,
  end: 19,
  state: 'ambiguous',
  candidateIds: ['candidate-a', 'candidate-b'],
};

describe('RepairPanel', () => {
  it('shows exact metadata errors and the untouched raw body before repair', () => {
    render(<RepairPanel items={[metadata]} />);
    expect(screen.getByText('id · Required')).toBeVisible();
    fireEvent.click(screen.getByText('Read the untouched body'));
    expect(screen.getByText(/Words remain/)).toBeVisible();
    expect(screen.getByDisplayValue('Kept title')).toBeVisible();
  });

  it('submits a complete metadata repair without editing the source body', async () => {
    const onRepairMetadata = vi.fn(async () => undefined);
    render(<RepairPanel items={[metadata]} onRepairMetadata={onRepairMetadata} />);
    fireEvent.change(screen.getByLabelText('Stable note ID'), { target: { value: 'repaired-note' } });
    fireEvent.change(screen.getByLabelText('Card type'), { target: { value: 'reflection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Repair metadata' }));
    await screen.findByRole('status');
    expect(onRepairMetadata).toHaveBeenCalledWith(
      metadata,
      expect.objectContaining({
        id: 'repaired-note',
        title: 'Kept title',
        body: 'Words remain.\r\n',
        cardType: 'reflection',
      }),
    );
  });

  it('preserves valid source and Landscape context while repairing another field', async () => {
    const onRepairMetadata = vi.fn(async () => undefined);
    render(
      <RepairPanel
        items={[metadataWithRecognizedContext]}
        onRepairMetadata={onRepairMetadata}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Repair metadata' }));
    await screen.findByRole('status');

    expect(onRepairMetadata).toHaveBeenCalledWith(
      metadataWithRecognizedContext,
      expect.objectContaining({
        landscapeAnchor: 'vision',
        source: {
          title: 'A Book',
          creator: 'Anna',
          url: 'https://example.test/book',
        },
      }),
    );
  });

  it('exposes malformed timestamps as accessible editable repair fields', async () => {
    const onRepairMetadata = vi.fn(async () => undefined);
    render(
      <RepairPanel
        items={[metadataWithInvalidTimestamps]}
        onRepairMetadata={onRepairMetadata}
      />,
    );

    const created = screen.getByRole('textbox', { name: 'Created' });
    const updated = screen.getByRole('textbox', { name: 'Updated' });
    expect(created).toHaveValue('yesterday');
    expect(updated).toHaveValue('tomorrow');
    expect(created).toHaveAccessibleDescription(/ISO 8601 timestamp including a timezone/u);
    expect(updated).toHaveAccessibleDescription(/ISO 8601 timestamp including a timezone/u);

    fireEvent.change(created, { target: { value: '2026-07-13T00:00:00.000Z' } });
    fireEvent.change(updated, { target: { value: '2026-07-14T00:00:00.000Z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Repair metadata' }));
    await screen.findByRole('status');

    expect(onRepairMetadata).toHaveBeenCalledWith(
      metadataWithInvalidTimestamps,
      expect.objectContaining({
        created: '2026-07-13T00:00:00.000Z',
        updated: '2026-07-14T00:00:00.000Z',
      }),
    );
  });

  it('relinks or removes one exact broken-link occurrence with busy protection', () => {
    const onRepairLink = vi.fn(() => new Promise<void>(() => undefined));
    render(<RepairPanel items={[broken]} onRepairLink={onRepairLink} />);
    expect(screen.getByText(/candidate-a/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('New target'), { target: { value: 'Known place' } });
    const relink = screen.getByRole('button', { name: 'Relink' });
    fireEvent.click(relink);
    fireEvent.click(relink);
    expect(onRepairLink).toHaveBeenCalledTimes(1);
    expect(onRepairLink).toHaveBeenCalledWith(broken, { kind: 'wiki', target: 'Known place' });
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeDisabled();
  });

  it('keeps a conflict visible and restores the exact retry control', async () => {
    const onRepairLink = vi.fn(async () => {
      throw new SearchRepairConflictError('Attempted local version.', 'Durable external version.');
    });
    render(<RepairPanel items={[broken]} onRepairLink={onRepairLink} />);
    const remove = screen.getByRole('button', { name: 'Remove link' });
    fireEvent.click(remove);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Both versions have been preserved/u);
    expect(screen.getByText('Attempted local version.')).toBeVisible();
    expect(screen.getByText('Durable external version.')).toBeVisible();
    await waitFor(() => expect(remove).toHaveFocus());
  });

  it('renders a calm empty repair state', () => {
    render(<RepairPanel items={[]} />);
    expect(screen.getByText('Nothing needs repair.')).toBeVisible();
  });
});
