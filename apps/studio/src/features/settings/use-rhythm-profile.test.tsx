import type { StudioService } from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRhythmProfile } from './use-rhythm-profile';

function service(overrides: Partial<StudioService['rhythmProfile']> = {}): StudioService {
  return {
    rhythmProfile: {
      load: vi.fn(async () => ({
        profile: null,
        revision: null,
        repairRequired: false,
      })),
      save: vi.fn(),
      ...overrides,
    },
  } as unknown as StudioService;
}

describe('useRhythmProfile', () => {
  it('does nothing when service is undefined', () => {
    const { result } = renderHook(() => useRhythmProfile(undefined));
    expect(result.current.profile).toBeNull();
    expect(result.current.revision).toBeNull();
  });

  it('loads the profile and revision on mount', async () => {
    const svc = service({
      load: vi.fn(async () => ({
        profile: {
          hemisphere: 'S' as const,
          birth: {},
          natal: { placements: {} },
        },
        revision: 'r0',
        repairRequired: false,
      })),
    });
    const { result } = renderHook(() => useRhythmProfile(svc));
    await waitFor(() => expect(result.current.revision).toBe('r0'));
    expect(result.current.profile).toEqual({
      hemisphere: 'S',
      birth: {},
      natal: { placements: {} },
    });
  });

  it('leaves the profile null when the load fails', async () => {
    const svc = service({
      load: vi.fn().mockRejectedValue(new Error('vault unavailable')),
    });
    const { result } = renderHook(() => useRhythmProfile(svc));
    await waitFor(() =>
      expect((svc.rhythmProfile.load as ReturnType<typeof vi.fn>)).toHaveBeenCalled(),
    );
    expect(result.current.profile).toBeNull();
    expect(result.current.revision).toBeNull();
  });

  it('save() does nothing when service is undefined', async () => {
    const { result } = renderHook(() => useRhythmProfile(undefined));
    await result.current.save({
      hemisphere: 'N',
      birth: {},
      natal: { placements: {} },
    });
    expect(result.current.profile).toBeNull();
  });

  it('save() writes through the loaded revision and stores the returned one', async () => {
    const save = vi.fn(async (profile: unknown, revision: string | null) => ({
      profile,
      revision: `${revision ?? 'new'}-next`,
      repairRequired: false,
    }));
    const svc = service({
      load: vi.fn(async () => ({
        profile: null,
        revision: 'r0',
        repairRequired: false,
      })),
      save: save as never,
    });
    const { result } = renderHook(() => useRhythmProfile(svc));
    await waitFor(() => expect(result.current.revision).toBe('r0'));

    const next = { hemisphere: 'N' as const, birth: {}, natal: { placements: {} } };
    await act(async () => result.current.save(next));

    expect(save).toHaveBeenCalledWith(next, 'r0');
    expect(result.current.revision).toBe('r0-next');
    expect(result.current.profile).toEqual(next);
  });
});
