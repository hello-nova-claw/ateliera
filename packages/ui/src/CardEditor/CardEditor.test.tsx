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
  fireEvent.click(screen.getByText('Note details'));
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
      conflict={{
        local: { ...note, title: 'My title', body: 'Mine' },
        remote: { ...note, title: 'Other title', body: 'The other version' },
      }}
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
  expect(screen.getByRole('region', { name: 'Your version' })).toHaveTextContent('Mine');
  expect(screen.getByRole('region', { name: 'Your version' })).toHaveTextContent('My title');
  expect(screen.getByRole('region', { name: 'Other version' })).toHaveTextContent('The other version');
  expect(screen.getByRole('region', { name: 'Other version' })).toHaveTextContent('Other title');
  expect(screen.getByLabelText('Title')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Keep mine as a sibling' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep other' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Merge manually' })).toBeVisible();
});

it('prevents duplicate conflict actions and explains retryable failures', () => {
  const { rerender } = render(
    <CardEditor
      conflict={{ local: { ...note, body: 'Mine' }, remote: note }}
      conflictActionState="busy"
      note={{ ...note, body: 'Mine' }}
      onChange={vi.fn()}
      onFlush={vi.fn()}
      onKeepMine={vi.fn()}
      onKeepOther={vi.fn()}
      onManualMerge={vi.fn()}
      saveState="conflict"
    />,
  );

  expect(screen.getByRole('button', { name: 'Keeping mine…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Keep other' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Merge manually' })).toBeDisabled();

  rerender(
    <CardEditor
      conflict={{ local: { ...note, body: 'Mine' }, remote: note }}
      conflictActionError="The sibling could not be saved. Try again."
      conflictActionState="error"
      note={{ ...note, body: 'Mine' }}
      onChange={vi.fn()}
      onFlush={vi.fn()}
      onKeepMine={vi.fn()}
      onKeepOther={vi.fn()}
      onManualMerge={vi.fn()}
      saveState="conflict"
    />,
  );

  expect(screen.getByText('The sibling could not be saved. Try again.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep mine as a sibling' })).toBeEnabled();
});

it('warns when browser recovery storage is unavailable', () => {
  render(
    <CardEditor
      note={note}
      onChange={vi.fn()}
      onFlush={vi.fn()}
      recoveryUnavailable
      saveState="dirty"
    />,
  );

  expect(screen.getByRole('status', { name: 'Recovery unavailable' })).toHaveTextContent(
    'keep this editor open',
  );
});

it('focuses a newly appearing conflict summary once without stealing focus again', () => {
  const props = {
    note,
    onChange: vi.fn(),
    onFlush: vi.fn(),
    onKeepMine: vi.fn(),
    onKeepOther: vi.fn(),
    onManualMerge: vi.fn(),
  };
  const { rerender } = render(<CardEditor {...props} saveState="dirty" />);

  rerender(
    <CardEditor
      {...props}
      conflict={{ local: { ...note, body: 'Mine' }, remote: note }}
      saveState="conflict"
    />,
  );
  const summary = screen.getByRole('alert');
  expect(summary).toHaveFocus();

  const keepOther = screen.getByRole('button', { name: 'Keep other' });
  keepOther.focus();
  rerender(
    <CardEditor
      {...props}
      conflict={{ local: { ...note, body: 'Mine' }, remote: note }}
      conflictActionState="busy"
      saveState="conflict"
    />,
  );
  expect(keepOther).toHaveFocus();
});

it('focuses a newly appearing save error once and leaves later focus alone', () => {
  const props = { note, onChange: vi.fn(), onFlush: vi.fn(), onRetrySave: vi.fn() };
  const { rerender } = render(<CardEditor {...props} saveState="dirty" />);

  rerender(
    <CardEditor {...props} saveError="Disk unavailable" saveState="error" />,
  );
  const error = screen.getByRole('alert');
  expect(error).toHaveFocus();

  const retry = screen.getByRole('button', { name: 'Try saving again' });
  retry.focus();
  rerender(
    <CardEditor {...props} saveError="Disk still unavailable" saveState="error" />,
  );
  expect(retry).toHaveFocus();
});
