import type { StoredStudioPreferences } from '@studio/application';
import { describe, expect, it } from 'vitest';

import { selectRoomReveal, type ActivitySignals } from './room-reveal';
import { NEW_STUDIO_PREFERENCES, ROOMS } from './room-visibility';

const quiet: ActivitySignals = {
  captureCount: 0,
  hasPlacedLifeAreaCard: false,
  hasSeason: false,
  hasWisdomSource: false,
};

const nonRevealableRooms = ROOMS.filter(
  (room) => room.kind !== 'optional' || room.id === 'inbox',
).map((room) => room.id);

/** A deterministic sweep of every signal combination, for property-ish checks. */
function everyScenario(): ActivitySignals[] {
  const counts = [0, 2, 3, 4, 5, 6, 7, 12];
  const scenarios: ActivitySignals[] = [];
  for (const captureCount of counts)
    for (const hasPlacedLifeAreaCard of [false, true])
      for (const hasSeason of [false, true])
        for (const hasWisdomSource of [false, true])
          scenarios.push({
            captureCount,
            hasPlacedLifeAreaCard,
            hasSeason,
            hasWisdomSource,
          });
  return scenarios;
}

const revealValues = ['accepted', 'dismissed'] as const;

/** Every subset of rooms marked accepted/dismissed, as a reveals map. */
function everyRevealMap(): Record<string, 'accepted' | 'dismissed'>[] {
  const ids = ROOMS.map((room) => room.id);
  const maps: Record<string, 'accepted' | 'dismissed'>[] = [];
  // Cover each single-room state plus the fully-recorded case — enough to
  // exercise the once-only and current-state guards without a full power set.
  maps.push({});
  for (const id of ids)
    for (const value of revealValues) maps.push({ [id]: value });
  maps.push(Object.fromEntries(ids.map((id) => [id, 'dismissed' as const])));
  return maps;
}

describe('selectRoomReveal', () => {
  it('offers nothing when no activity has crossed a threshold', () => {
    expect(selectRoomReveal(quiet, NEW_STUDIO_PREFERENCES)).toBeNull();
  });

  it('offers Identity once 3 captures exist', () => {
    const offer = selectRoomReveal(
      { ...quiet, captureCount: 3 },
      NEW_STUDIO_PREFERENCES,
    );
    expect(offer).toEqual({
      room: 'identity',
      copy: 'There is a room for who you are becoming — Identity Studio.',
    });
  });

  it('offers Season when a life area has a placed card', () => {
    // Enough captures that Identity is already accepted, so Season is next.
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: { identity: 'accepted' },
      rooms: { ...NEW_STUDIO_PREFERENCES.rooms, identity: 'on' },
    };
    const offer = selectRoomReveal(
      { ...quiet, hasPlacedLifeAreaCard: true },
      prefs,
    );
    expect(offer?.room).toBe('season');
  });

  it('offers Reflection when a season exists', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: { identity: 'dismissed', season: 'dismissed' },
    };
    const offer = selectRoomReveal({ ...quiet, hasSeason: true }, prefs);
    expect(offer?.room).toBe('reflection');
  });

  it('offers Reflection when 5+ captures exist (season absent)', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: { identity: 'dismissed', season: 'dismissed' },
    };
    const offer = selectRoomReveal({ ...quiet, captureCount: 5 }, prefs);
    expect(offer?.room).toBe('reflection');
  });

  it('offers Wisdom when a capture carries a source or meaning', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: {
        identity: 'dismissed',
        season: 'dismissed',
        reflection: 'dismissed',
      },
    };
    const offer = selectRoomReveal({ ...quiet, hasWisdomSource: true }, prefs);
    expect(offer?.room).toBe('wisdom');
  });

  it('offers Uncharted once 7+ captures exist', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: {
        identity: 'dismissed',
        reflection: 'dismissed',
      },
    };
    const offer = selectRoomReveal({ ...quiet, captureCount: 7 }, prefs);
    expect(offer?.room).toBe('uncharted');
  });

  it('never re-offers a room already accepted', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: { identity: 'accepted' },
      rooms: { ...NEW_STUDIO_PREFERENCES.rooms, identity: 'on' },
    };
    const offer = selectRoomReveal({ ...quiet, captureCount: 10 }, prefs);
    expect(offer?.room).not.toBe('identity');
  });

  it('never re-offers a room already dismissed', () => {
    const prefs: StoredStudioPreferences = {
      ...NEW_STUDIO_PREFERENCES,
      reveals: { identity: 'dismissed' },
    };
    const offer = selectRoomReveal({ ...quiet, captureCount: 10 }, prefs);
    expect(offer?.room).not.toBe('identity');
  });

  it('never offers a room that is already on', () => {
    // Existing Studio: empty prefs => every optional room is on.
    const offer = selectRoomReveal(
      {
        captureCount: 20,
        hasPlacedLifeAreaCard: true,
        hasSeason: true,
        hasWisdomSource: true,
      },
      {},
    );
    expect(offer).toBeNull();
  });

  it('picks a deterministic priority order when several qualify', () => {
    // Everything qualifies at once; Identity is first in priority order.
    const offer = selectRoomReveal(
      {
        captureCount: 20,
        hasPlacedLifeAreaCard: true,
        hasSeason: true,
        hasWisdomSource: true,
      },
      NEW_STUDIO_PREFERENCES,
    );
    expect(offer?.room).toBe('identity');
  });

  it('never offers a core, utility, or Inbox room (across every scenario)', () => {
    for (const signals of everyScenario())
      for (const reveals of everyRevealMap()) {
        const offer = selectRoomReveal(signals, {
          ...NEW_STUDIO_PREFERENCES,
          reveals,
        });
        if (offer !== null)
          expect(nonRevealableRooms).not.toContain(offer.room);
      }
  });

  it('never offers a room whose reveal was already recorded', () => {
    for (const signals of everyScenario())
      for (const reveals of everyRevealMap()) {
        const offer = selectRoomReveal(signals, {
          ...NEW_STUDIO_PREFERENCES,
          reveals,
        });
        if (offer !== null) expect(reveals[offer.room]).toBeUndefined();
      }
  });

  it('never offers a room that is already on (across every scenario)', () => {
    // Existing Studio (empty prefs): every optional room is on, so nothing fires.
    for (const signals of everyScenario())
      expect(selectRoomReveal(signals, {})).toBeNull();
  });
});
