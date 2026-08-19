import type { StudioService } from '@studio/application';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTodaysGift } from './use-todays-gift';

const TODAY = '2026-08-18';

function service(overrides: {
  rhythmProfileLoad: ReturnType<typeof vi.fn>;
  searchHits?: Array<{ id: string }>;
  records?: Array<{
    note: {
      resurfaceKind?: 'evidence' | 'reframe' | 'wish' | 'dream';
      resurfaceDue?: string;
      resurfaceIntervalDays?: number;
      body: string;
    };
    path: string;
    hash: string;
  }>;
  load?: ReturnType<typeof vi.fn>;
}) {
  return {
    rhythmProfile: { load: overrides.rhythmProfileLoad },
    index: {
      search: vi.fn().mockResolvedValue(overrides.searchHits ?? []),
      getManyById: vi.fn().mockResolvedValue(overrides.records ?? []),
    },
    ...(overrides.load ? { load: overrides.load } : {}),
  } as unknown as StudioService;
}

describe('useTodaysGift', () => {
  it('returns null (no Gift slot) when no rhythm profile is saved', async () => {
    const svc = service({
      rhythmProfileLoad: vi
        .fn()
        .mockResolvedValue({ profile: null, revision: null, repairRequired: false }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() =>
      expect((svc as unknown as { rhythmProfile: { load: ReturnType<typeof vi.fn> } }).rhythmProfile.load).toHaveBeenCalled(),
    );
    expect(result.current.gift).toBeNull();
  });

  it('returns the calm fallback when a profile exists but nothing is due', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('line'));
    expect(result.current.gift).toEqual({
      kind: 'line',
      payload: { title: 'A quiet place to begin.', excerpt: '' },
    });
  });

  it('returns a dream Gift when a due dream card exists in the pool', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'dream-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'dream',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 5,
            body: 'A door in the hallway.',
          },
          path: 'Uncharted/dream-1.md',
          hash: 'hash-1',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: { body: 'A door in the hallway.' },
        path: 'Uncharted/dream-1.md',
        hash: 'hash-1',
      }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('dream'));
    expect(result.current.gift).toEqual({
      kind: 'dream',
      payload: {
        title: 'A door in the hallway.',
        excerpt: 'A door in the hallway.',
      },
      body: 'A door in the hallway.',
      sourcePath: 'Uncharted/dream-1.md',
      intervalDays: 5,
    });
  });

  it('returns a resurfaced Gift for a non-dream due card', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'evidence-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'evidence',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 3,
            body: 'You did the thing you doubted you could.',
          },
          path: 'Reflection Garden/evidence-1.md',
          hash: 'hash-2',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: { body: 'You did the thing you doubted you could.' },
        path: 'Reflection Garden/evidence-1.md',
        hash: 'hash-2',
      }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('resurfaced'));
  });

  it('prefers the note title over the projected excerpt when one exists', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'evidence-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'evidence',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 3,
            body: 'The body text, which is not the title.',
          },
          path: 'Reflection Garden/evidence-1.md',
          hash: 'hash-2',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: {
          title: 'A named reflection',
          body: 'The body text, which is not the title.',
        },
        path: 'Reflection Garden/evidence-1.md',
        hash: 'hash-2',
      }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('resurfaced'));
    expect(result.current.gift?.payload.title).toBe('A named reflection');
  });

  it('falls back to "Untitled" when the note has no title and no body text', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'evidence-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'evidence',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 3,
            body: '',
          },
          path: 'Reflection Garden/evidence-1.md',
          hash: 'hash-2',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: { body: '' },
        path: 'Reflection Garden/evidence-1.md',
        hash: 'hash-2',
      }),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('resurfaced'));
    expect(result.current.gift?.payload.title).toBe('Untitled');
  });

  it('falls back to the calm Gift when the index query fails', async () => {
    const svc = {
      rhythmProfile: {
        load: vi.fn().mockResolvedValue({
          profile: { hemisphere: 'S', natal: { placements: {} } },
          revision: 'r1',
          repairRequired: false,
        }),
      },
      index: {
        search: vi.fn().mockRejectedValue(new Error('index unavailable')),
        getManyById: vi.fn(),
      },
    } as unknown as StudioService;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('line'));
  });

  it('falls back to the calm Gift when the rhythm profile fails to load', async () => {
    const svc = {
      rhythmProfile: {
        load: vi.fn().mockRejectedValue(new Error('vault unavailable')),
      },
      index: {
        search: vi.fn(),
        getManyById: vi.fn(),
      },
    } as unknown as StudioService;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('line'));
  });

  it('falls back to the calm Gift when the source note fails to load', async () => {
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'dream-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'dream',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 5,
            body: 'A door in the hallway.',
          },
          path: 'Uncharted/dream-1.md',
          hash: 'hash-1',
        },
      ],
      load: vi.fn().mockRejectedValue(new Error('file not found')),
    });
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('line'));
  });

  it('does nothing when service is undefined', () => {
    const { result } = renderHook(() => useTodaysGift(undefined, TODAY));
    expect(result.current.gift).toBeNull();
  });

  it('keep() does nothing when there is no gift, service is undefined, or the gift is the calm fallback', async () => {
    const capture = vi.fn();
    const svcNull = service({
      rhythmProfileLoad: vi
        .fn()
        .mockResolvedValue({ profile: null, revision: null, repairRequired: false }),
    });
    (svcNull as unknown as { capture: typeof capture }).capture = capture;
    const nullGift = renderHook(() => useTodaysGift(svcNull, TODAY));
    await waitFor(() => expect(nullGift.result.current.gift).toBeNull());
    await nullGift.result.current.keep();
    expect(capture).not.toHaveBeenCalled();

    const undefinedService = renderHook(() => useTodaysGift(undefined, TODAY));
    await undefinedService.result.current.keep();
    expect(capture).not.toHaveBeenCalled();

    const svcCalm = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
    });
    (svcCalm as unknown as { capture: typeof capture }).capture = capture;
    const calmGift = renderHook(() => useTodaysGift(svcCalm, TODAY));
    await waitFor(() => expect(calmGift.result.current.gift?.kind).toBe('line'));
    await calmGift.result.current.keep();
    expect(capture).not.toHaveBeenCalled();
  });

  it('keep() captures a dream Gift to the uncharted placement', async () => {
    const capture = vi.fn().mockResolvedValue({
      note: { body: 'A door in the hallway.' },
      path: 'Uncharted/captured.md',
      hash: 'hash-3',
    });
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'dream-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'dream',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 5,
            body: 'A door in the hallway.',
          },
          path: 'Uncharted/dream-1.md',
          hash: 'hash-1',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: { body: 'A door in the hallway.' },
        path: 'Uncharted/dream-1.md',
        hash: 'hash-1',
      }),
    });
    const save = vi.fn().mockResolvedValue({
      note: { body: 'A door in the hallway.' },
      path: 'Uncharted/dream-1.md',
      hash: 'hash-1-next',
    });
    (svc as unknown as { capture: typeof capture }).capture = capture;
    (svc as unknown as { save: typeof save }).save = save;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('dream'));

    await result.current.keep();

    expect(capture).toHaveBeenCalledWith({
      body: 'A door in the hallway.',
      placement: 'uncharted',
    });
  });

  it('keep() captures a resurfaced Gift to the reflection placement', async () => {
    const capture = vi.fn().mockResolvedValue({
      note: { body: 'You did the thing you doubted you could.' },
      path: 'Reflection Garden/captured.md',
      hash: 'hash-4',
    });
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'evidence-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'evidence',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 3,
            body: 'You did the thing you doubted you could.',
          },
          path: 'Reflection Garden/evidence-1.md',
          hash: 'hash-2',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: { body: 'You did the thing you doubted you could.' },
        path: 'Reflection Garden/evidence-1.md',
        hash: 'hash-2',
      }),
    });
    const save = vi.fn().mockResolvedValue({
      note: { body: 'You did the thing you doubted you could.' },
      path: 'Reflection Garden/evidence-1.md',
      hash: 'hash-2-next',
    });
    (svc as unknown as { capture: typeof capture }).capture = capture;
    (svc as unknown as { save: typeof save }).save = save;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('resurfaced'));

    await result.current.keep();

    expect(capture).toHaveBeenCalledWith({
      body: 'You did the thing you doubted you could.',
      placement: 'reflection',
    });
  });

  it('keep() advances the source card past a 1-day interval to the SM-2 first-pass step', async () => {
    const capture = vi.fn().mockResolvedValue({
      note: { body: 'A door in the hallway.' },
      path: 'Uncharted/captured.md',
      hash: 'hash-3',
    });
    const save = vi.fn().mockResolvedValue({
      note: { body: 'A door in the hallway.' },
      path: 'Uncharted/dream-1.md',
      hash: 'hash-1-next',
    });
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'dream-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'dream',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 1,
            body: 'A door in the hallway.',
          },
          path: 'Uncharted/dream-1.md',
          hash: 'hash-1',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: {
          resurfaceKind: 'dream',
          resurfaceDue: '2026-08-01',
          resurfaceIntervalDays: 1,
          body: 'A door in the hallway.',
        },
        path: 'Uncharted/dream-1.md',
        hash: 'hash-1',
      }),
    });
    (svc as unknown as { capture: typeof capture }).capture = capture;
    (svc as unknown as { save: typeof save }).save = save;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('dream'));

    await result.current.keep();

    expect(save).toHaveBeenCalledWith({
      note: expect.objectContaining({
        resurfaceKind: 'dream',
        resurfaceIntervalDays: 6,
        resurfaceDue: '2026-08-24',
      }),
      path: 'Uncharted/dream-1.md',
      expectedHash: 'hash-1',
    });
  });

  it('keep() advances the source card past a multi-day interval by the SM-2 ease factor, rolling over a month boundary', async () => {
    const capture = vi.fn().mockResolvedValue({
      note: { body: 'You did the thing you doubted you could.' },
      path: 'Reflection Garden/captured.md',
      hash: 'hash-4',
    });
    const save = vi.fn().mockResolvedValue({
      note: { body: 'You did the thing you doubted you could.' },
      path: 'Reflection Garden/evidence-1.md',
      hash: 'hash-2-next',
    });
    const svc = service({
      rhythmProfileLoad: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
      searchHits: [{ id: 'evidence-1' }],
      records: [
        {
          note: {
            resurfaceKind: 'evidence',
            resurfaceDue: '2026-08-01',
            resurfaceIntervalDays: 10,
            body: 'You did the thing you doubted you could.',
          },
          path: 'Reflection Garden/evidence-1.md',
          hash: 'hash-2',
        },
      ],
      load: vi.fn().mockResolvedValue({
        note: {
          resurfaceKind: 'evidence',
          resurfaceDue: '2026-08-01',
          resurfaceIntervalDays: 10,
          body: 'You did the thing you doubted you could.',
        },
        path: 'Reflection Garden/evidence-1.md',
        hash: 'hash-2',
      }),
    });
    (svc as unknown as { capture: typeof capture }).capture = capture;
    (svc as unknown as { save: typeof save }).save = save;
    const { result } = renderHook(() => useTodaysGift(svc, TODAY));
    await waitFor(() => expect(result.current.gift?.kind).toBe('resurfaced'));

    await result.current.keep();

    // sm2Interval(10, 4) = round(10 * 2.5) = 25; 2026-08-18 + 25 days = 2026-09-12.
    expect(save).toHaveBeenCalledWith({
      note: expect.objectContaining({
        resurfaceIntervalDays: 25,
        resurfaceDue: '2026-09-12',
      }),
      path: 'Reflection Garden/evidence-1.md',
      expectedHash: 'hash-2',
    });
  });
});
