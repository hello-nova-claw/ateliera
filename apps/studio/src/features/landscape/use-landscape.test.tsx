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
