import { createDraftRecoveryStore, type SavedNote, type StudioService } from '@studio/application';
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
