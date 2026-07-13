import {
  UnsupportedLifeAreaConfigError,
  type StudioService,
} from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useLandscape } from './use-landscape';

it('keeps future life-area configuration unavailable and blocks every mutation', async () => {
  const save = vi.fn();
  const service = {
    indexState: () => 'ready',
    lifeAreas: {
      load: vi.fn(async () => {
        throw new UnsupportedLifeAreaConfigError(2);
      }),
      save,
    },
    projectLandscapeBoard: vi.fn(async () => ({ cells: [] })),
  } as unknown as StudioService;
  const { result } = renderHook(() => useLandscape(service, 0));

  await waitFor(() =>
    expect(result.current.configUnavailable).toBe('unsupported'),
  );
  await expect(
    act(async () => result.current.addArea({ title: 'Should not save' })),
  ).rejects.toThrow('newer version');
  expect(save).not.toHaveBeenCalled();
});

it('reprojects the durable note after an exact-hash move conflict', async () => {
  const original = {
    noteId: 'note-1',
    path: 'Life Landscape/home/note.md',
    hash: 'old-hash',
    title: 'My version',
    excerpt: 'My version',
    semanticType: 'vision' as const,
    cardType: 'vision',
    status: 'active' as const,
    created: '2026-07-14T00:00:00.000Z',
    updated: '2026-07-14T00:00:00.000Z',
    lifeAreas: ['home'],
    anchor: 'vision' as const,
    seasons: [],
    tags: [],
  };
  const durable = { ...original, hash: 'durable-hash', title: 'Durable version' };
  const boardWith = (card: typeof original) => ({
    cells: [{
      lifeArea: 'home',
      anchor: 'vision' as const,
      featured: card,
      additionalCount: 0,
      noteIds: [card.noteId],
      cards: [card],
    }],
  });
  const projectLandscapeBoard = vi
    .fn()
    .mockResolvedValueOnce(boardWith(original))
    .mockResolvedValue(boardWith(durable));
  const service = {
    indexState: () => 'ready',
    lifeAreas: {
      load: vi.fn(async () => ({
        areas: [{ id: 'home', title: 'Home', hidden: false, order: 0 }],
        revision: null,
        repairRequired: false,
      })),
    },
    projectLandscapeBoard,
    updateLandscapePlacement: vi.fn(async () => {
      throw new Error(
        'This note changed elsewhere. Both versions have been preserved for review.',
      );
    }),
  } as unknown as StudioService;
  const { result } = renderHook(() => useLandscape(service, 0));
  await waitFor(() => expect(result.current.state).toBe('ready'));

  let conflict: unknown;
  await act(async () => {
    try {
      await result.current.move({
        card: original,
        lifeAreas: ['home'],
        anchor: 'practices',
      });
    } catch (reason) {
      conflict = reason;
    }
  });
  expect(conflict).toEqual(expect.objectContaining({
    message: expect.stringContaining('changed elsewhere'),
  }));
  await waitFor(() => expect(projectLandscapeBoard).toHaveBeenCalledTimes(2));
  expect(result.current.board.cells[0]?.cards).toEqual([durable]);
});
