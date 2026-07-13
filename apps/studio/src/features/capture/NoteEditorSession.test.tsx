import {
  StudioSaveConflictError,
  createDraftRecoveryStore,
  type SavedNote,
  type StudioService,
} from '@studio/application';
import { serializeNote } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoteEditorSession } from './NoteEditorSession';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-1',
  title: 'Durable title',
  body: 'Durable words',
  cardType: 'note',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection-garden'],
  lifeAreas: ['family'],
  seasons: ['2026-winter'],
  tags: ['quiet'],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-13T00:00:00.000Z',
  attachments: ['image.jpg'],
  display: { cover: 'image.jpg', featured: true },
  privacy: { sensitivity: 'sensitive', aiAccess: 'never' },
  extraFrontmatter: { custom: 'preserved' },
  lineEnding: '\r\n',
};

const initial: SavedNote = {
  note,
  path: 'Reflection/durable.md',
  hash: 'current-hash',
};

function mockService(overrides: Partial<StudioService> = {}): StudioService {
  return {
    capture: vi.fn(),
    dispose: vi.fn(),
    indexState: vi.fn(() => 'ready'),
    load: vi.fn(async () => initial),
    projectCurrentSeason: vi.fn(),
    projectFoyer: vi.fn(),
    projectLandscape: vi.fn(),
    projectRoom: vi.fn(),
    projectStream: vi.fn(),
    rebuildIndex: vi.fn(),
    repairs: vi.fn(),
    save: vi.fn(async ({ note: savedNote, path }) => ({
      note: savedNote,
      path,
      hash: 'saved-hash',
    })),
    archive: vi.fn(),
    unarchive: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    reconcileTrash: vi.fn(async () => []),
    start: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    views: {} as StudioService['views'],
    ...overrides,
  } as StudioService;
}

function seedStaleDraft(): void {
  createDraftRecoveryStore(sessionStorage).write({
    studioId: 'studio-a',
    path: initial.path,
    title: 'Local title',
    body: 'Local unsaved words',
    expectedHash: 'old-hash',
    updatedAt: '2026-07-13T01:00:00.000Z',
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

it('treats a stale recovery as a read-only conflict and never autosaves it', async () => {
  vi.useFakeTimers();
  seedStaleDraft();
  const service = mockService();
  render(
    <NoteEditorSession
      initial={initial}
      onClose={vi.fn()}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Another version exists');
  expect(screen.getByRole('region', { name: 'Your version' })).toHaveTextContent(
    'Local unsaved words',
  );
  expect(screen.getByRole('region', { name: 'Other version' })).toHaveTextContent(
    'Durable words',
  );
  expect(screen.getByLabelText('Markdown body')).toHaveAttribute('contenteditable', 'false');
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(service.save).not.toHaveBeenCalled();
});

it('keeps mine as a unique complete sibling without touching the durable note', async () => {
  seedStaleDraft();
  const onClose = vi.fn();
  const service = mockService();
  render(
    <NoteEditorSession
      initial={initial}
      onClose={onClose}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Keep mine as a sibling' }));
  await waitFor(() => expect(service.save).toHaveBeenCalledOnce());

  expect(service.save).toHaveBeenCalledOnce();
  const input = vi.mocked(service.save).mock.calls[0]?.[0];
  expect(input).toMatchObject({ expectedMissing: true });
  expect(input?.path).not.toBe(initial.path);
  expect(input?.note).toMatchObject({
    ...note,
    id: expect.not.stringMatching(/^note-1$/),
    title: 'Local title',
    body: 'Local unsaved words',
  });
  expect(onClose).toHaveBeenCalledOnce();
  expect(createDraftRecoveryStore(sessionStorage).read('studio-a', initial.path)).toBeNull();
});

it('turns rapid duplicate Keep mine activation into exactly one durable write', async () => {
  seedStaleDraft();
  let finish: (() => void) | undefined;
  const save = vi.fn(
    ({ note: savedNote, path }) =>
      new Promise<SavedNote>((resolve) => {
        finish = () => resolve({ note: savedNote, path, hash: 'sibling-hash' });
      }),
  );
  const service = mockService({ save });
  render(
    <NoteEditorSession
      initial={initial}
      onClose={vi.fn()}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );
  const action = screen.getByRole('button', { name: 'Keep mine as a sibling' });

  fireEvent.click(action);
  fireEvent.click(action);

  expect(save).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Keeping mine…' })).toBeDisabled();
  await act(async () => finish?.());
});

it('preserves recovery and enables retry when sibling creation fails', async () => {
  seedStaleDraft();
  const service = mockService({ save: vi.fn().mockRejectedValue(new Error('Storage offline')) });
  render(
    <NoteEditorSession
      initial={initial}
      onClose={vi.fn()}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Keep mine as a sibling' }));

  expect(await screen.findByText(/Storage offline.*still preserved/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Keep mine as a sibling' })).toBeEnabled();
  expect(createDraftRecoveryStore(sessionStorage).read('studio-a', initial.path)).not.toBeNull();
});

it('merges a stale draft explicitly and saves against the current durable hash', async () => {
  vi.useFakeTimers();
  seedStaleDraft();
  const service = mockService();
  render(
    <NoteEditorSession
      initial={initial}
      onClose={vi.fn()}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Merge manually' }));
  expect(screen.queryByText('Another version exists')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Markdown body')).toHaveTextContent('Local unsaved words');
  expect(screen.getByLabelText('Markdown body')).toHaveTextContent('Durable words');

  await act(async () => vi.advanceTimersByTimeAsync(750));
  expect(service.save).toHaveBeenCalledWith(
    expect.objectContaining({ expectedHash: 'current-hash' }),
  );
});

it('keeps the editor open after a failed close flush and offers a retry', async () => {
  const onClose = vi.fn();
  const service = mockService({
    save: vi.fn().mockRejectedValue(new Error('Disk unavailable')),
  });
  render(
    <NoteEditorSession
      initial={initial}
      onClose={onClose}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );

  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Waiting safely' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));

  expect(await screen.findByText(/could not be saved.*Retry before closing/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Try saving again' })).toBeEnabled();
  expect(onClose).not.toHaveBeenCalled();
});

it('begins a live manual merge with both versions preserved in recovery', async () => {
  const attempted = { ...note, title: 'Local title' };
  const remote = { ...note, title: 'Remote title', body: 'Remote words' };
  const onClose = vi.fn();
  const save = vi
    .fn()
    .mockRejectedValueOnce(new StudioSaveConflictError(attempted, serializeNote(remote)))
    .mockImplementationOnce(async ({ note: savedNote, path }) => ({
      note: savedNote,
      path,
      hash: 'merged-hash',
    }));
  const service = mockService({
    load: vi.fn(async () => ({ ...initial, note: remote, hash: 'remote-hash' })),
    save,
  });
  render(
    <NoteEditorSession
      initial={initial}
      onClose={onClose}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await screen.findByRole('button', { name: 'Merge manually' });

  fireEvent.click(screen.getByRole('button', { name: 'Merge manually' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Markdown body')).toHaveTextContent('Durable words');
    expect(screen.getByLabelText('Markdown body')).toHaveTextContent('Remote words');
  });
  expect(createDraftRecoveryStore(sessionStorage).read('studio-a', initial.path)).toMatchObject({
    expectedHash: 'remote-hash',
    body: expect.stringContaining('Remote words'),
  });
  expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');

  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      path: initial.path,
      expectedHash: 'remote-hash',
      note: expect.objectContaining({
        body: expect.stringContaining('Remote words'),
      }),
    }),
  );
});

it('keeps both live conflict versions available when manual merge loading fails', async () => {
  const attempted = { ...note, title: 'Local title' };
  const remote = { ...note, title: 'Remote title', body: 'Remote words' };
  const service = mockService({
    load: vi.fn().mockRejectedValue(new Error('Remote read failed')),
    save: vi.fn().mockRejectedValueOnce(
      new StudioSaveConflictError(attempted, serializeNote(remote)),
    ),
  });
  render(
    <NoteEditorSession
      initial={initial}
      onClose={vi.fn()}
      requestClose={0}
      service={service}
      studioId="studio-a"
    />,
  );
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
  await screen.findByRole('button', { name: 'Merge manually' });

  fireEvent.click(screen.getByRole('button', { name: 'Merge manually' }));

  expect(await screen.findByText(/Remote read failed.*still preserved/i)).toBeVisible();
  expect(screen.getByRole('region', { name: 'Your version' })).toHaveTextContent(
    'Local title',
  );
  expect(screen.getByRole('region', { name: 'Other version' })).toHaveTextContent(
    'Remote title',
  );
  expect(createDraftRecoveryStore(sessionStorage).read('studio-a', initial.path)).not.toBeNull();
});
