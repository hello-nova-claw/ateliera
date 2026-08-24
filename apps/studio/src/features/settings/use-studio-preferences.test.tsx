import type { StudioService } from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStudioPreferences } from './use-studio-preferences';

function service(
  overrides: Partial<StudioService['preferences']> = {},
): StudioService {
  return {
    preferences: {
      load: vi.fn(async () => ({
        preferences: {},
        revision: null,
        repairRequired: false,
      })),
      save: vi.fn(),
      ...overrides,
    },
  } as unknown as StudioService;
}

describe('useStudioPreferences', () => {
  it('does nothing when service is undefined', () => {
    const { result } = renderHook(() => useStudioPreferences(undefined));
    expect(result.current.preferences).toEqual({});
    expect(result.current.revision).toBeNull();
  });

  it('loads preferences and revision on mount', async () => {
    const svc = service({
      load: vi.fn(async () => ({
        preferences: { rhythm: { moon: false } },
        revision: 'r0',
        repairRequired: false,
      })),
    });
    const { result } = renderHook(() => useStudioPreferences(svc));
    await waitFor(() => expect(result.current.revision).toBe('r0'));
    expect(result.current.preferences).toEqual({ rhythm: { moon: false } });
  });

  it('leaves preferences empty when the load fails', async () => {
    const svc = service({
      load: vi.fn().mockRejectedValue(new Error('vault unavailable')),
    });
    const { result } = renderHook(() => useStudioPreferences(svc));
    await waitFor(() =>
      expect(svc.preferences.load as ReturnType<typeof vi.fn>).toHaveBeenCalled(),
    );
    expect(result.current.preferences).toEqual({});
    expect(result.current.revision).toBeNull();
  });

  it('save() writes through the loaded revision and stores the returned one', async () => {
    const save = vi.fn(async (preferences: unknown, revision: string | null) => ({
      preferences,
      revision: `${revision ?? 'new'}-next`,
      repairRequired: false,
    }));
    const svc = service({
      load: vi.fn(async () => ({
        preferences: {},
        revision: 'r0',
        repairRequired: false,
      })),
      save: save as never,
    });
    const { result } = renderHook(() => useStudioPreferences(svc));
    await waitFor(() => expect(result.current.revision).toBe('r0'));

    const next = { rhythm: { cycle: false } };
    await act(async () => result.current.save(next));

    expect(save).toHaveBeenCalledWith(next, 'r0');
    expect(result.current.revision).toBe('r0-next');
    expect(result.current.preferences).toEqual(next);
  });
});
