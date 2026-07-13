import { fireEvent, render, screen } from '@testing-library/react';
import type { StudioNote } from '@studio/domain';
import { CardEditor } from './CardEditor';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-1',
  title: 'A quiet beginning',
  body: 'The hill was green.',
  cardType: 'note',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection'],
  lifeAreas: [],
  seasons: [],
  tags: [],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-13T00:00:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: {},
};

it('exposes title, Markdown body, metadata, and a deduplicated save state', async () => {
  const onChange = vi.fn();
  render(
    <CardEditor
      note={note}
      onChange={onChange}
      onFlush={vi.fn()}
      saveState="saving"
    />,
  );

  expect(screen.getByLabelText('Title')).toHaveValue('A quiet beginning');
  expect(
    await screen.findByRole('textbox', { name: 'Markdown body' }),
  ).toHaveTextContent('The hill was green.');
  expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  fireEvent.click(screen.getByRole('button', { name: 'Note details' }));
  expect(screen.getByLabelText('Semantic meaning')).toHaveValue('reflection');
  expect(screen.getByLabelText('Status')).toHaveValue('active');

  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Changed' },
  });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Changed' }),
  );
});

it('offers restore or discard without silently replacing durable text', () => {
  const onRestoreDraft = vi.fn();
  const onDiscardDraft = vi.fn();
  render(
    <CardEditor
      note={note}
      onChange={vi.fn()}
      onDiscardDraft={onDiscardDraft}
      onFlush={vi.fn()}
      onRestoreDraft={onRestoreDraft}
      recoveryDraft={{ title: 'Recovered', body: 'Unsaved words' }}
      saveState="idle"
    />,
  );

  expect(screen.getByText('Unsaved words are waiting.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Restore draft' }));
  expect(onRestoreDraft).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  expect(onDiscardDraft).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Title')).toHaveValue('A quiet beginning');
});

it('preserves both conflict versions and exposes all explicit resolutions', () => {
  render(
    <CardEditor
      conflict={{ local: { ...note, body: 'Mine' }, remoteBody: 'The other version' }}
      note={{ ...note, body: 'Mine' }}
      onChange={vi.fn()}
      onFlush={vi.fn()}
      onKeepMine={vi.fn()}
      onKeepOther={vi.fn()}
      onManualMerge={vi.fn()}
      saveState="conflict"
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Another version exists');
  expect(screen.getByText('Mine')).toBeVisible();
  expect(screen.getByText('The other version')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep mine as a sibling' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep other' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Merge manually' })).toBeVisible();
});
