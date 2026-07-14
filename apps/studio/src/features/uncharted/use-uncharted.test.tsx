import { act, renderHook, waitFor } from '@testing-library/react';
import type { SavedNote, StudioService } from '@studio/application';
import { vi } from 'vitest';

import { useUncharted } from './use-uncharted';

const possibility = {
  noteId: 'possibility',
  path: 'Uncharted/a.md',
  hash: 'hash-a',
  title: 'A possibility',
  excerpt: 'What if…',
  semanticType: 'uncharted' as const,
  cardType: 'possibility',
  status: 'active' as const,
  updated: '2026-07-14T00:00:00.000Z',
  horizon: 'near' as const,
  seasons: [],
};

it('loads, captures and exact-links an Uncharted possibility', async () => {
  const capture = vi.fn(async () => ({ path: 'Uncharted/new.md' } as SavedNote));
  const inviteUnchartedToSeason = vi.fn(async () => ({}) as never);
  const service = {
    projectUncharted: vi.fn(async () => ({ cards: [possibility] })),
    projectCurrentSeason: vi.fn(async () => ({
      current: { ...possibility, noteId: 'season-note', path: 'Current Season/winter.md', title: 'Making room' },
      conflicts: [],
    })),
    load: vi.fn(async () => ({
      path: 'Current Season/winter.md',
      hash: 'season-hash',
      note: { extraFrontmatter: { season_id: '2026-winter' } },
    })),
    repairs: vi.fn(async () => []),
    indexState: vi.fn(() => 'ready'),
    capture,
    inviteUnchartedToSeason,
  } as unknown as StudioService;
  const view = renderHook(() => useUncharted(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  expect(view.result.current.activeSeason).toEqual({ id: '2026-winter', title: 'Making room' });

  await act(async () => view.result.current.capture('A hillside returns', 'beyond'));
  expect(capture).toHaveBeenCalledWith(expect.objectContaining({
    placement: 'uncharted',
    unchartedHorizon: 'beyond',
    title: 'A hillside returns',
  }));
  await act(async () => view.result.current.invite(possibility));
  expect(inviteUnchartedToSeason).toHaveBeenCalledWith({
    path: possibility.path,
    expectedHash: possibility.hash,
    seasonId: '2026-winter',
  });
});

it('surfaces malformed room notes without replacing valid possibilities', async () => {
  const service = {
    projectUncharted: vi.fn(async () => ({ cards: [possibility] })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    repairs: vi.fn(async () => [{ path: 'Uncharted/broken.md' }]),
    indexState: vi.fn(() => 'ready'),
  } as unknown as StudioService;
  const view = renderHook(() => useUncharted(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('error'));
  expect(view.result.current.model.cards).toEqual([possibility]);
  expect(view.result.current.error).toContain('words remain untouched');
});

it('coalesces rapid invitations and refreshes the durable card after failure', async () => {
  let rejectInvite!: (reason: Error) => void;
  const invitation = new Promise<never>((_resolve, reject) => {
    rejectInvite = reject;
  });
  const projectUncharted = vi
    .fn()
    .mockResolvedValueOnce({ cards: [possibility] })
    .mockResolvedValue({ cards: [{ ...possibility, hash: 'durable-hash' }] });
  const inviteUnchartedToSeason = vi.fn(() => invitation);
  const service = {
    projectUncharted,
    projectCurrentSeason: vi.fn(async () => ({
      current: { ...possibility, path: 'Current Season/winter.md', title: 'Making room' },
      conflicts: [],
    })),
    load: vi.fn(async () => ({
      note: { extraFrontmatter: { season_id: '2026-winter' } },
    })),
    repairs: vi.fn(async () => []),
    indexState: vi.fn(() => 'ready'),
    inviteUnchartedToSeason,
  } as unknown as StudioService;
  const view = renderHook(() => useUncharted(service, 0));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));

  let firstError: unknown;
  let secondError: unknown;
  await act(async () => {
    const first = view.result.current.invite(possibility).catch((reason: unknown) => {
      firstError = reason;
    });
    const second = view.result.current.invite(possibility).catch((reason: unknown) => {
      secondError = reason;
    });
    rejectInvite(new Error('Another version exists.'));
    await Promise.all([first, second]);
  });

  expect(inviteUnchartedToSeason).toHaveBeenCalledTimes(1);
  expect(firstError).toBeInstanceOf(Error);
  expect(secondError).toBeInstanceOf(Error);
  await waitFor(() => expect(projectUncharted).toHaveBeenCalledTimes(2));
  expect(view.result.current.model.cards[0]?.hash).toBe('durable-hash');
});
