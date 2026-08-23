import type { StudioService } from '@studio/application';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAlmanac } from './use-almanac';

const DATE = '2026-01-15';

function service(load: ReturnType<typeof vi.fn>): StudioService {
  return { rhythmProfile: { load } } as unknown as StudioService;
}

describe('useAlmanac', () => {
  it('reads the northern-hemisphere rhythm when no profile is saved', async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ profile: null, revision: null, repairRequired: false });
    const { result } = renderHook(() => useAlmanac(service(load), DATE));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current.season).toBe('winter');
    expect(result.current.microSeason.term).toBe('Lesser Cold');
    expect(result.current.moonPhase).toBeDefined();
    expect(result.current.illumination).toBeGreaterThanOrEqual(0);
    expect(result.current.illumination).toBeLessThanOrEqual(1);
  });

  it('flips the felt season for a southern-hemisphere profile', async () => {
    const load = vi.fn().mockResolvedValue({
      profile: { hemisphere: 'S', natal: { placements: {} } },
      revision: 'r1',
      repairRequired: false,
    });
    const { result } = renderHook(() => useAlmanac(service(load), DATE));
    await waitFor(() => expect(result.current.season).toBe('summer'));
    expect(result.current.microSeason.term).toBe('Lesser Heat');
  });

  it('still reads a rhythm with no service, defaulting to the north', () => {
    const { result } = renderHook(() => useAlmanac(undefined, DATE));
    expect(result.current.season).toBe('winter');
    expect(result.current.microSeason.term).toBe('Lesser Cold');
  });
});
