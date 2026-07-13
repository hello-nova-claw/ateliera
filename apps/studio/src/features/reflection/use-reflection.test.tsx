import { act, renderHook, waitFor } from '@testing-library/react';
import type { SavedNote, StudioService } from '@studio/application';
import { vi } from 'vitest';

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
};

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
    { id: 'identity', kind: 'note', label: 'Creates from calm' },
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

it('resolves optional images through the vault media boundary and revokes object URLs', async () => {
  const createObjectURL = vi.fn(() => 'blob:private-image');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
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
  vi.unstubAllGlobals();
});
