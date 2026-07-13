import { act, renderHook } from '@testing-library/react';
import { StudioSaveConflictError, type SavedNote } from '@studio/application';
import type { StudioNote } from '@studio/domain';
import { useAutosave } from './use-autosave';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-1',
  title: 'A note',
  body: 'Original',
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

function saved(value: StudioNote, hash: string): SavedNote {
  return { note: value, path: 'Reflection/a-note.md', hash };
}

afterEach(() => {
  vi.useRealTimers();
});

it('writes recovery immediately and autosaves once after 750ms of inactivity', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async (value: StudioNote) => saved(value, 'next-hash'));
  const writeRecovery = vi.fn();
  const removeRecovery = vi.fn();
  const { result } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save,
      writeRecovery,
      removeRecovery,
    }),
  );

  act(() => result.current.update({ ...note, body: 'Changed' }));
  expect(writeRecovery).toHaveBeenCalledOnce();
  expect(result.current.state).toBe('dirty');
  await vi.advanceTimersByTimeAsync(749);
  expect(save).not.toHaveBeenCalled();

  await act(async () => vi.advanceTimersByTimeAsync(1));

  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'Changed' }),
    'durable-hash',
  );
  expect(removeRecovery).toHaveBeenCalledOnce();
  expect(result.current.state).toBe('saved');
});

it('serializes saves and persists the latest edit after an in-flight save', async () => {
  vi.useFakeTimers();
  let releaseFirst: ((value: SavedNote) => void) | undefined;
  const save = vi
    .fn<(value: StudioNote, hash: string) => Promise<SavedNote>>()
    .mockImplementationOnce(
      (value) =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(saved(value, 'hash-1'));
        }),
    )
    .mockImplementationOnce(async (value) => saved(value, 'hash-2'));
  const { result } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save,
      writeRecovery: vi.fn(),
      removeRecovery: vi.fn(),
    }),
  );

  act(() => result.current.update({ ...note, body: 'First' }));
  await act(async () => vi.advanceTimersByTimeAsync(750));
  act(() => result.current.update({ ...note, body: 'Latest' }));
  await act(async () => vi.advanceTimersByTimeAsync(750));
  expect(save).toHaveBeenCalledTimes(1);

  await act(async () => releaseFirst?.(saved({ ...note, body: 'First' }, 'hash-1')));

  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual([
    expect.objectContaining({ body: 'Latest' }),
    'hash-1',
  ]);
});

it('flushes immediately and enters conflict without clearing the local recovery', async () => {
  vi.useFakeTimers();
  const conflict = new StudioSaveConflictError(
    { ...note, body: 'Mine' },
    '---\nid: note-1\n---\n\nThe other version',
  );
  const removeRecovery = vi.fn();
  const { result } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save: vi.fn().mockRejectedValue(conflict),
      writeRecovery: vi.fn(),
      removeRecovery,
    }),
  );

  act(() => result.current.update({ ...note, body: 'Mine' }));
  await act(async () => result.current.flush());

  expect(result.current.state).toBe('conflict');
  expect(result.current.conflict).toBe(conflict);
  expect(removeRecovery).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(result.current.state).toBe('conflict');
});

it('holds an ordinary save error until a later edit asks to retry', async () => {
  vi.useFakeTimers();
  const save = vi
    .fn<(value: StudioNote, hash: string) => Promise<SavedNote>>()
    .mockRejectedValueOnce(new Error('storage offline'))
    .mockImplementationOnce(async (value) => saved(value, 'recovered-hash'));
  const removeRecovery = vi.fn();
  const { result } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save,
      writeRecovery: vi.fn(),
      removeRecovery,
    }),
  );

  act(() => result.current.update({ ...note, body: 'Still safe' }));
  await act(async () => vi.advanceTimersByTimeAsync(750));
  expect(save).toHaveBeenCalledOnce();
  expect(result.current.state).toBe('error');
  expect(removeRecovery).not.toHaveBeenCalled();

  act(() => result.current.update({ ...note, body: 'Try after another edit' }));
  await act(async () => vi.advanceTimersByTimeAsync(750));
  expect(save).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe('saved');
});

it('retries the same preserved revision only when explicitly requested', async () => {
  vi.useFakeTimers();
  const save = vi
    .fn<(value: StudioNote, hash: string) => Promise<SavedNote>>()
    .mockRejectedValueOnce(new Error('storage offline'))
    .mockImplementationOnce(async (value) => saved(value, 'recovered-hash'));
  const { result } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save,
      writeRecovery: vi.fn(),
      removeRecovery: vi.fn(),
    }),
  );

  act(() => result.current.update({ ...note, body: 'Still safe' }));
  await act(async () => vi.advanceTimersByTimeAsync(750));

  await act(async () => {
    expect(await result.current.retry()).toBe(true);
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe('saved');
});

it('flushes a dirty draft when the editor unmounts before the debounce', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async (value: StudioNote) => saved(value, 'unmount-hash'));
  const { result, unmount } = renderHook(() =>
    useAutosave({
      initial: saved(note, 'durable-hash'),
      save,
      writeRecovery: vi.fn(),
      removeRecovery: vi.fn(),
    }),
  );
  act(() => result.current.update({ ...note, body: 'Leave safely' }));

  unmount();
  await act(async () => Promise.resolve());

  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'Leave safely' }),
    'durable-hash',
  );
});
