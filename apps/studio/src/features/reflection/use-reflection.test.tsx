import { act, renderHook, waitFor } from '@testing-library/react';
import type { SavedNote, StudioService } from '@studio/application';
import { afterEach, beforeEach, vi } from 'vitest';

import { useReflection } from './use-reflection';

const card = {
  noteId: 'reflection',
  path: 'Reflection Garden/Reflections/a.md',
  hash: 'reflection-hash',
  title: 'A quiet learning',
  excerpt: 'Five minutes changed the afternoon.',
  semanticType: 'reflection' as const,
  cardType: 'reflection',
  status: 'active' as const,
  created: '2026-07-14T00:00:00.000Z',
  updated: '2026-07-14T00:00:00.000Z',
  lifeAreas: [],
  seasons: [],
  tags: [],
  linkedNoteIds: [],
  evidenceConnections: [],
};

function reflectionService(cards: readonly typeof card[]) {
  return {
    projectReflectionGarden: vi.fn(async () => ({ cards, themes: [] })),
    projectRoom: vi.fn(async () => []),
    projectUncharted: vi.fn(async () => ({ cards: [] })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    lifeAreas: { load: vi.fn(async () => ({ areas: [] })) },
    repairs: vi.fn(async () => []),
    indexState: vi.fn(() => 'ready'),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(), writable: true },
    revokeObjectURL: { configurable: true, value: vi.fn(), writable: true },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('captures, opens and links one canonical Reflection entry', async () => {
  const saved = { path: card.path, hash: card.hash, note: { id: card.noteId } } as SavedNote;
  const capture = vi.fn(async () => saved);
  const linkReflectionEvidence = vi.fn(async () => saved);
  const service = {
    projectReflectionGarden: vi.fn(async () => ({ cards: [card], themes: [] })),
    projectRoom: vi.fn(async () => [{ ...card, noteId: 'identity', title: 'Creates from calm' }]),
    projectUncharted: vi.fn(async () => ({ cards: [] })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    lifeAreas: { load: vi.fn(async () => ({ areas: [{ id: 'home', title: 'Home', hidden: false }] })) },
    repairs: vi.fn(async () => []),
    indexState: vi.fn(() => 'ready'),
    capture,
    linkReflectionEvidence,
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  expect(view.result.current.connections).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'identity', kind: 'note', label: 'Creates from calm' }),
    { id: 'home', kind: 'life-area', label: 'Home' },
  ]));

  let opened: SavedNote | undefined;
  await act(async () => {
    opened = await view.result.current.capture('reflection', 'Five quiet minutes', true);
  });
  expect(capture).toHaveBeenCalledWith(expect.objectContaining({
    placement: 'reflection',
    title: 'Five quiet minutes',
  }));
  expect(opened).toBe(saved);

  await act(async () => view.result.current.connect(card, {
    id: 'identity', kind: 'note', label: 'Creates from calm',
  }));
  expect(linkReflectionEvidence).toHaveBeenCalledWith({
    path: card.path,
    expectedHash: card.hash,
    noteIds: ['identity'],
  });
});

it('keeps valid entries visible when another entry needs metadata repair', async () => {
  const service = {
    projectReflectionGarden: vi.fn(async () => ({ cards: [card], themes: [] })),
    projectRoom: vi.fn(async () => []),
    projectUncharted: vi.fn(async () => ({ cards: [] })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    lifeAreas: { load: vi.fn(async () => ({ areas: [] })) },
    repairs: vi.fn(async () => [{ path: 'Reflection Garden/broken.md' }]),
    indexState: vi.fn(() => 'ready'),
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('error'));
  expect(view.result.current.model.cards).toEqual([card]);
});

it('coalesces rapid evidence writes and reprojects the durable card after failure', async () => {
  let rejectConnection!: (reason: Error) => void;
  const pending = new Promise<never>((_resolve, reject) => {
    rejectConnection = reject;
  });
  const projectReflectionGarden = vi
    .fn()
    .mockResolvedValueOnce({ cards: [card], themes: [] })
    .mockResolvedValue({ cards: [{ ...card, hash: 'durable-hash' }], themes: [] });
  const linkReflectionEvidence = vi.fn(() => pending);
  const service = {
    ...reflectionService([]),
    projectReflectionGarden,
    linkReflectionEvidence,
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  const connection = { id: 'home', kind: 'life-area' as const, label: 'Home' };

  let firstError: unknown;
  let secondError: unknown;
  await act(async () => {
    const first = view.result.current.connect(card, connection).catch((reason: unknown) => {
      firstError = reason;
    });
    const second = view.result.current.connect(card, connection).catch((reason: unknown) => {
      secondError = reason;
    });
    rejectConnection(new Error('Another version exists.'));
    await Promise.all([first, second]);
  });

  expect(linkReflectionEvidence).toHaveBeenCalledTimes(1);
  expect(firstError).toBeInstanceOf(Error);
  expect(secondError).toBeInstanceOf(Error);
  await waitFor(() => expect(projectReflectionGarden).toHaveBeenCalledTimes(2));
  expect(view.result.current.model.cards[0]?.hash).toBe('durable-hash');
});

it('resolves optional images through the vault media boundary and revokes object URLs', async () => {
  const createObjectURL = vi.mocked(URL.createObjectURL);
  createObjectURL.mockReturnValue('blob:private-image');
  const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
  const withCover = { ...card, coverReference: '../../Attachments/private.png' };
  const service = {
    projectReflectionGarden: vi.fn(async () => ({ cards: [withCover], themes: [] })),
    projectRoom: vi.fn(async () => []),
    projectUncharted: vi.fn(async () => ({ cards: [] })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    lifeAreas: { load: vi.fn(async () => ({ areas: [] })) },
    repairs: vi.fn(async () => []),
    indexState: vi.fn(() => 'ready'),
    resolveCover: vi.fn(async () => ({
      kind: 'available' as const,
      path: 'Attachments/private.png',
      mimeType: 'image/png' as const,
      bytes: new Uint8Array([1, 2, 3]),
    })),
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));
  await waitFor(() => expect(view.result.current.imageUrls).toEqual({
    reflection: 'blob:private-image',
  }));
  expect(service.resolveCover).toHaveBeenCalledWith(withCover.path);
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-image');
});

it('isolates successful, missing, unsafe and failed Reflection images', async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first-private-image')
    .mockReturnValueOnce('blob:second-private-image');
  const cards = [
    { ...card, noteId: 'first', path: 'Reflection Garden/Reflections/first.md', coverReference: '../../Attachments/first.png' },
    { ...card, noteId: 'missing', path: 'Reflection Garden/Reflections/missing.md', coverReference: '../../Attachments/missing.png' },
    { ...card, noteId: 'unsafe', path: 'Reflection Garden/Reflections/unsafe.md', coverReference: 'https://example.test/private.png' },
    { ...card, noteId: 'broken', path: 'Reflection Garden/Reflections/broken.md', coverReference: '../../Attachments/broken.png' },
    { ...card, noteId: 'second', path: 'Reflection Garden/Reflections/second.md', coverReference: '../../Attachments/second.png' },
  ];
  const service = {
    ...reflectionService(cards),
    resolveCover: vi.fn(async (path: string) => {
      if (path.endsWith('/missing.md')) {
        return {
          kind: 'unavailable' as const,
          reason: 'missing' as const,
          reference: '../../Attachments/missing.png',
        };
      }
      if (path.endsWith('/unsafe.md')) {
        return {
          kind: 'unavailable' as const,
          reason: 'unsafe-reference' as const,
          reference: 'https://example.test/private.png',
        };
      }
      if (path.endsWith('/broken.md')) throw new Error('vault temporarily unavailable');
      return {
        kind: 'available' as const,
        path: `Attachments/${path.endsWith('/first.md') ? 'first' : 'second'}.png`,
        mimeType: 'image/png' as const,
        bytes: new Uint8Array([1, 2, 3]),
      };
    }),
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));

  await waitFor(() => expect(view.result.current.imageUrls).toEqual({
    first: 'blob:first-private-image',
    second: 'blob:second-private-image',
  }));
  expect([...view.result.current.imageUnavailableIds]).toEqual([
    'missing',
    'unsafe',
    'broken',
  ]);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
});

it('revokes every object URL when media resolution is abandoned', async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:already-prepared')
    .mockReturnValueOnce('blob:late-private-image');
  const lateMedia = deferred<{
    kind: 'available';
    path: string;
    mimeType: 'image/png';
    bytes: Uint8Array<ArrayBuffer>;
  }>();
  const cards = [
    { ...card, noteId: 'prepared', path: 'Reflection Garden/Reflections/prepared.md', coverReference: '../../Attachments/prepared.png' },
    { ...card, noteId: 'late', path: 'Reflection Garden/Reflections/late.md', coverReference: '../../Attachments/late.png' },
  ];
  const service = {
    ...reflectionService(cards),
    resolveCover: vi.fn(async (path: string) => {
      if (path.endsWith('/late.md')) return lateMedia.promise;
      return {
        kind: 'available' as const,
        path: 'Attachments/prepared.png',
        mimeType: 'image/png' as const,
        bytes: new Uint8Array([1, 2, 3]),
      };
    }),
  } as unknown as StudioService;
  const view = renderHook(() => useReflection(service, 0));

  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob)));
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:already-prepared');

  lateMedia.resolve({
    kind: 'available',
    path: 'Attachments/late.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([4, 5, 6]),
  });
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(
    'blob:late-private-image',
  ));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
