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
    expect(result.current.microSeason.term).toBe('The Deep Quiet');
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
    expect(result.current.microSeason.term).toBe('The Slow Heat');
  });

  it('still reads a rhythm with no service, defaulting to the north', () => {
    const { result } = renderHook(() => useAlmanac(undefined, DATE));
    expect(result.current.season).toBe('winter');
    expect(result.current.microSeason.term).toBe('The Deep Quiet');
  });

  it('leans outward at the new moon and inward at the full moon', () => {
    const outward = renderHook(() => useAlmanac(undefined, '2026-08-12'));
    expect(outward.result.current.orientation).toBe('outward');
    const inward = renderHook(() => useAlmanac(undefined, '2026-08-28'));
    expect(inward.result.current.orientation).toBe('inward');
  });

  it('surfaces the cycle when a profile carries a cycle basis', async () => {
    const load = vi.fn().mockResolvedValue({
      profile: {
        hemisphere: 'N',
        cycle: { lastPeriodStart: '2026-08-01', avgLengthDays: 28 },
        natal: { placements: {} },
      },
      revision: 'r1',
      repairRequired: false,
    });
    const { result } = renderHook(() => useAlmanac(service(load), '2026-08-23'));
    await waitFor(() => expect(result.current.cycle).toBeDefined());
    expect(result.current.cycle).toEqual({ day: 23, phase: 'luteal' });
  });

  it('has no cycle without a profile', () => {
    const { result } = renderHook(() => useAlmanac(undefined, DATE));
    expect(result.current.cycle).toBeUndefined();
  });
});
