import type { StudioService } from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useSeason } from './use-season';

it('loads canonical Landscape priorities and creates a selectable canonical note', async () => {
  const capture = vi.fn(async () => ({
    path: 'Life Landscape/home/protect-creative-time.md',
    hash: 'new-hash',
    note: { id: 'priority-new', title: 'Protect creative time' },
  }));
  const service = {
    capture,
    seasonTransactions: {
      readActive: vi.fn(async () => ({
        hash: null,
        value: {
          version: 1,
          revision: 0,
          activeNoteId: null,
          activePath: null,
          operation: null,
        },
      })),
    },
    lifeAreas: {
      load: vi.fn(async () => ({
        revision: null,
        repairRequired: false,
        areas: [{ id: 'home', title: 'Home', hidden: false, order: 0 }],
      })),
    },
    projectCurrentSeason: vi.fn(async () => ({
      current: null,
      conflicts: [],
    })),
    projectRoom: vi.fn(async (room: string) =>
      room === 'life-landscape'
        ? [
            {
              noteId: 'priority-home',
              title: 'Make home easier',
              path: 'Life Landscape/home/make-home-easier.md',
              excerpt: '',
              semanticType: 'vision',
              cardType: 'vision',
              status: 'active',
              updated: '2026-07-14T00:00:00.000Z',
            },
          ]
        : [],
    ),
    load: vi.fn(async (path: string) => ({
      path,
      hash: 'home-hash',
      note: { id: 'priority-home', title: 'Make home easier' },
    })),
  } as unknown as StudioService;

  const { result } = renderHook(() => useSeason(service, 0));
  await waitFor(() => expect(result.current.state).toBe('ready'));
  expect(result.current.priorityCandidates).toEqual([
    {
      noteId: 'priority-home',
      title: 'Make home easier',
      hash: 'home-hash',
      path: 'Life Landscape/home/make-home-easier.md',
    },
  ]);

  await act(async () => {
    await expect(
      result.current.createPriority('Protect creative time'),
    ).resolves.toEqual({
      noteId: 'priority-new',
      title: 'Protect creative time',
      hash: 'new-hash',
      path: 'Life Landscape/home/protect-creative-time.md',
    });
  });
  expect(capture).toHaveBeenCalledWith({
    body: 'Protect creative time',
    title: 'Protect creative time',
    landscape: { lifeArea: 'home', anchor: 'vision' },
  });
  expect(result.current.priorityCandidates).toContainEqual({
    noteId: 'priority-new',
    title: 'Protect creative time',
    hash: 'new-hash',
    path: 'Life Landscape/home/protect-creative-time.md',
  });
});
