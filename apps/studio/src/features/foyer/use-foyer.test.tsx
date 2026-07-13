import { act, renderHook, waitFor } from '@testing-library/react';
import type { FoyerProjection, StudioService } from '@studio/application';
import { vi } from 'vitest';
import { useFoyer } from './use-foyer';

const empty: FoyerProjection = {
  currentSeason: null,
  featured: [],
  becoming: null,
  feelings: [],
  principles: [],
  priorities: [],
  returning: null,
  image: null,
};

it('projects the Foyer and refreshes when the application revision changes', async () => {
  const projectFoyer = vi.fn(async () => empty);
  const service = {
    projectFoyer,
    indexState: () => 'ready',
  } as unknown as StudioService;
  const view = renderHook(({ revision }) => useFoyer(service, revision), {
    initialProps: { revision: 0 },
  });
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  view.rerender({ revision: 1 });
  await waitFor(() => expect(projectFoyer).toHaveBeenCalledTimes(2));
});

it('keeps a composed empty Foyer and calm error when projection fails', async () => {
  const service = {
    projectFoyer: vi.fn(async () => {
      throw new Error('Index unavailable');
    }),
    indexState: () => 'stale',
  } as unknown as StudioService;
  const { result } = renderHook(() => useFoyer(service, 0));
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.model).toEqual(empty);
  expect(result.current.error).toBe('Index unavailable');
});

it('shows a stable first load and preserves composed content while refreshing', async () => {
  let releaseFirst!: (value: FoyerProjection) => void;
  let releaseRefresh!: (value: FoyerProjection) => void;
  const first = new Promise<FoyerProjection>((resolve) => {
    releaseFirst = resolve;
  });
  const refresh = new Promise<FoyerProjection>((resolve) => {
    releaseRefresh = resolve;
  });
  const becoming = {
    noteId: 'becoming',
    path: 'Foyer/becoming.md',
    title: 'A woman who creates from calm',
    excerpt: '',
    semanticType: 'foundations' as const,
    cardType: 'identity',
    status: 'active' as const,
    updated: '2026-07-13T00:00:00.000Z',
  };
  const composed = { ...empty, becoming };
  const service = {
    projectFoyer: vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(refresh),
    indexState: () => 'ready',
  } as unknown as StudioService;
  const view = renderHook(({ revision }) => useFoyer(service, revision), {
    initialProps: { revision: 0 },
  });

  expect(view.result.current).toEqual({ model: empty, state: 'loading' });
  await act(async () => releaseFirst(composed));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  view.rerender({ revision: 1 });
  expect(view.result.current).toEqual({ model: composed, state: 'loading' });
  await act(async () => releaseRefresh(composed));
});
