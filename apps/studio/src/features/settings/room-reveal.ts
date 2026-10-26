import type { StoredStudioPreferences } from '@studio/application';
import roomReveals from '../../content/room-reveals.json';
import { resolveRoomVisibility, type RoomId } from './room-visibility';

/**
 * Guided reveal (plan §6.2). When the person's own activity crosses a low
 * threshold, the Studio may offer to open ONE currently-off optional room. This
 * module is the pure heart of that: it takes plain "activity signals" plus the
 * current preferences and returns the single next room to offer, or none.
 *
 * The vocabulary and thresholds live here in the app layer; the application
 * layer's preferences store stays a generic map of string keys.
 */

/**
 * The person's own activity, expressed as the cheapest signals the shell can
 * gather. Counts are approximate — this is calm relevance, not analytics.
 */
export interface ActivitySignals {
  /** How many captures exist (approximate is fine). */
  captureCount: number;
  /** Any life area has a card placed on the Landscape. */
  hasPlacedLifeAreaCard: boolean;
  /** A current season exists. */
  hasSeason: boolean;
  /** A capture has been saved with a quote/source, or a Reflection/Growth meaning. */
  hasWisdomSource: boolean;
}

/**
 * The optional rooms that can be revealed, in priority order. When several
 * qualify at once, the earliest in this list is offered first; the rest wait
 * their turn on later evaluations (only one invitation is ever pending). Inbox
 * is intentionally absent — it stays off, with no reveal (plan §6.2).
 */
const REVEALABLE_ROOMS: readonly {
  id: Extract<RoomId, 'identity' | 'season' | 'reflection' | 'wisdom' | 'uncharted'>;
  /** The invitation copy, in Anna's voice (src/content/room-reveals.json). */
  copy: string;
  /** Whether the person's activity makes this room relevant now. */
  qualifies: (signals: ActivitySignals) => boolean;
}[] = [
  {
    id: 'identity',
    copy: roomReveals.identity,
    qualifies: (signals) => signals.captureCount >= 3,
  },
  {
    id: 'season',
    copy: roomReveals.season,
    qualifies: (signals) => signals.hasPlacedLifeAreaCard,
  },
  {
    id: 'reflection',
    copy: roomReveals.reflection,
    qualifies: (signals) => signals.hasSeason || signals.captureCount >= 5,
  },
  {
    id: 'wisdom',
    copy: roomReveals.wisdom,
    qualifies: (signals) => signals.hasWisdomSource,
  },
  {
    id: 'uncharted',
    copy: roomReveals.uncharted,
    qualifies: (signals) => signals.captureCount >= 7,
  },
];

export interface RoomRevealOffer {
  room: RoomId;
  copy: string;
}

/**
 * The single next room to offer, or `null` when nothing should be surfaced.
 *
 * A room is only offered when it is:
 *  - revealable (an optional room in {@link REVEALABLE_ROOMS}; never core/utility),
 *  - currently OFF (a room already on is never re-offered),
 *  - not already accepted or dismissed (each reveal fires at most once, ever), and
 *  - relevant now (its activity threshold is met).
 *
 * When several qualify, the earliest in priority order wins, deterministically.
 * This function is pure: identical inputs always yield the same result.
 */
export function selectRoomReveal(
  signals: ActivitySignals,
  preferences: StoredStudioPreferences | null | undefined,
): RoomRevealOffer | null {
  const visibility = resolveRoomVisibility(preferences);
  const reveals = preferences?.reveals ?? {};
  for (const candidate of REVEALABLE_ROOMS) {
    if (visibility[candidate.id]) continue; // already on — never re-offer
    if (reveals[candidate.id] !== undefined) continue; // accepted or dismissed already
    if (!candidate.qualifies(signals)) continue;
    return { room: candidate.id, copy: candidate.copy };
  }
  return null;
}
