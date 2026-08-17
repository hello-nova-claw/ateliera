import type {
  StudioService,
  WisdomGardenProjection,
} from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useWisdom } from './use-wisdom';

const empty: WisdomGardenProjection = { cards: [], themes: [] };

function service(overrides: Partial<StudioService> = {}): StudioService {
  return {
    projectWisdomGarden: vi.fn(async () => empty),
    repairs: vi.fn(async () => []),
    capture: vi.fn(async () => ({}) as never),
    wisdomThemes: {
      load: vi.fn(async () => ({
        themes: [
          { id: 'identity', title: 'Identity', hidden: false, order: 0 },
        ],
        revision: null,
        repairRequired: false,
      })),
      save: vi.fn(async (themes) => ({
        themes: [...themes],
        revision: 'next',
        repairRequired: false,
      })),
    },
    indexState: vi.fn(() => 'ready'),
    ...overrides,
  } as unknown as StudioService;
}

it('loads projection and theme preferences and refreshes after capture', async () => {
  const studio = service();
  const view = renderHook(() => useWisdom(studio, 0));
  await waitFor(() => expect(view.result.current.state).toBe('ready'));
  expect(view.result.current.themes[0]?.title).toBe('Identity');

  await act(() =>
    view.result.current.capture({
      body: 'A thought',
      wisdom: { kind: 'insight', themes: ['identity'] },
    }),
  );
  await waitFor(() =>
    expect(studio.projectWisdomGarden).toHaveBeenCalledTimes(2),
  );
});

it('exposes repair state without overwriting malformed settings', async () => {
  const studio = service({
    wisdomThemes: {
      load: vi.fn(async () => ({
        themes: [],
        revision: 'broken',
        repairRequired: true,
      })),
      save: vi.fn(),
    },
  });
  const view = renderHook(() => useWisdom(studio, 0));
  await waitFor(() => expect(view.result.current.state).toBe('repair'));
});
