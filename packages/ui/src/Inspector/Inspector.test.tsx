import { act, fireEvent, render, screen } from '@testing-library/react';
import type { StudioNote } from '@studio/domain';
import { Inspector, type InspectorResult } from './Inspector';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-1',
  title: '<img src=x onerror=alert(1)> A quiet beginning',
  body: '<script>alert("never")</script>\nThe hill was green.',
  cardType: 'note',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection-garden'],
  lifeAreas: ['family'],
  seasons: ['winter'],
  tags: ['calm'],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-14T00:00:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: { custom: 'kept' },
};

const result: InspectorResult = {
  note,
  path: 'Reflection/A quiet beginning.md',
  hash: 'hash-1',
  backlinks: [
    { id: 'same-title-a', path: 'One.md', title: 'Same title' },
    { id: 'same-title-b', path: 'Two.md', title: 'Same title' },
  ],
  forwardLinks: [
    {
      occurrence: 0,
      linkKind: 'wiki',
      target: 'Known',
      label: 'Known note',
      start: 0,
      end: 9,
      state: 'resolved',
      targetId: 'known-id',
    },
    {
      occurrence: 1,
      linkKind: 'wiki',
      target: 'Missing',
      label: 'Missing note',
      start: 10,
      end: 21,
      state: 'broken',
    },
    {
      occurrence: 2,
      linkKind: 'wiki',
      target: 'Shared',
      label: 'Shared note',
      start: 22,
      end: 31,
      state: 'ambiguous',
      candidateIds: ['shared-a', 'shared-b'],
    },
  ],
};

it('renders safe note text in a labelled inspector and discloses details only on request', () => {
  const { container } = render(
    <Inspector isOpen onClose={vi.fn()} result={result} />,
  );

  expect(screen.getByRole('dialog', { name: 'Inspect A quiet beginning' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)> A quiet beginning' })).toBeVisible();
  expect(screen.getByText(/<script>alert/)).toBeVisible();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('Reflection/A quiet beginning.md')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Same title/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show note details' }));
  expect(screen.getByText('Reflection/A quiet beginning.md')).toBeVisible();
  expect(screen.getByText('private')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Show links' }));
  expect(screen.getAllByText('Same title')).toHaveLength(2);
  expect(screen.getByText('Broken link')).toBeVisible();
  expect(screen.getByText('Choose a destination')).toBeVisible();
});

it('keeps duplicate titles distinct and invokes typed open and repair callbacks', async () => {
  const onOpenNote = vi.fn();
  const onRepairLink = vi.fn();
  render(
    <Inspector
      isOpen
      onClose={vi.fn()}
      onOpenNote={onOpenNote}
      onRepairLink={onRepairLink}
      result={result}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show links' }));
  const duplicateButtons = screen.getAllByRole('button', { name: 'Open Same title' });
  await act(async () => { fireEvent.click(duplicateButtons[1]!); });
  expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({
    direction: 'backlink', id: 'same-title-b', path: 'Two.md',
  }));

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open Known note' })); });
  expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({
    direction: 'forward', id: 'known-id', state: 'resolved',
  }));

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Repair Missing note' })); });
  expect(onRepairLink).toHaveBeenCalledWith(expect.objectContaining({
    occurrence: 1, state: 'broken', target: 'Missing',
  }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose destination for Shared note' }));
  });
  expect(onRepairLink).toHaveBeenCalledWith(expect.objectContaining({
    candidateIds: ['shared-a', 'shared-b'], state: 'ambiguous',
  }));
});

it('guards each async control from duplicate activation and restores its exact focus', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const onOpenNote = vi.fn(() => pending);
  render(
    <Inspector isOpen onClose={vi.fn()} onOpenNote={onOpenNote} result={result} />,
  );
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show links' }));
  const open = screen.getAllByRole<HTMLButtonElement>('button', { name: 'Open Same title' })[0]!;
  open.focus();
  fireEvent.click(open);
  fireEvent.click(open);
  expect(onOpenNote).toHaveBeenCalledOnce();
  expect(open).toBeDisabled();
  expect(open).toHaveAttribute('aria-busy', 'true');

  const focusStates: boolean[] = [];
  const restoreFocus = open.focus.bind(open);
  vi.spyOn(open, 'focus').mockImplementation(() => {
    focusStates.push(open.disabled);
    restoreFocus();
  });

  await act(async () => { finish(); await pending; });
  expect(open).toBeEnabled();
  expect(focusStates).toEqual([false]);
  expect(open).toHaveFocus();
});

it.each([
  ['loading', 'Opening this note…'],
  ['error', 'This note could not be opened.'],
  ['offline', 'Stored locally'],
  ['missing', 'This note is not here yet.'],
] as const)('renders a calm, repair-friendly %s state', (state, copy) => {
  render(
    <Inspector
      {...(state === 'error' ? { errorMessage: 'The vault is unavailable.' } : {})}
      isOpen
      onClose={vi.fn()}
      onReconnect={vi.fn()}
      onRetry={vi.fn()}
      state={state}
    />,
  );
  expect(screen.getByText(copy)).toBeVisible();
  if (state === 'error') expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  if (state === 'offline') expect(screen.getByRole('button', { name: 'Reconnect' })).toBeVisible();
  if (state === 'missing') expect(screen.getByText(/Search or repair its link/)).toBeVisible();
});

it('offers archived restoration without making archived content inaccessible', async () => {
  const onRestoreArchived = vi.fn();
  render(
    <Inspector
      isOpen
      onClose={vi.fn()}
      onRestoreArchived={onRestoreArchived}
      result={{ ...result, note: { ...note, status: 'archived' } }}
    />,
  );
  expect(screen.getAllByText('Archived')).toHaveLength(2);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Restore note' })); });
  expect(onRestoreArchived).toHaveBeenCalledWith(note.id);
});

it('closes on Escape and restores the exact invoking control', () => {
  const trigger = document.createElement('button');
  trigger.textContent = 'Inspect note';
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const { rerender } = render(
    <Inspector isOpen onClose={onClose} result={result} />,
  );
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  rerender(<Inspector isOpen={false} onClose={onClose} result={result} />);
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it('treats an absent ready result as missing and offers link repair when available', async () => {
  const onRepairMissing = vi.fn();
  render(
    <Inspector isOpen onClose={vi.fn()} onRepairMissing={onRepairMissing} />,
  );
  expect(screen.getByText('This note is not here yet.')).toBeVisible();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Search and repair links' }));
  });
  expect(onRepairMissing).toHaveBeenCalledOnce();
});

it('preserves focus and explains an action failure without closing the note', async () => {
  const onRepairLink = vi.fn().mockRejectedValue(new Error('unavailable'));
  render(
    <Inspector isOpen onClose={vi.fn()} onRepairLink={onRepairLink} result={result} />,
  );
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show links' }));
  const repair = screen.getByRole('button', { name: 'Repair Missing note' });
  repair.focus();
  await act(async () => { fireEvent.click(repair); });
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was changed');
  expect(repair).toBeEnabled();
  expect(repair).toHaveFocus();
  expect(document.querySelector('.inspector__body')).toHaveTextContent('The hill was green.');
});
