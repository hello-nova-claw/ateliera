import type { StoredStudioPreferences } from '@studio/application';
import type { RhythmLayers } from './rhythm-layers';

/**
 * Room and Foyer-section vocabulary lives here, in the app layer. The application
 * layer's preferences store stays deliberately generic (a map of string keys to
 * 'on'/'off'), so the words "identity", "almanac", and so on never leak downward.
 *
 * Visibility is progressive disclosure, never deletion: a hidden room is still
 * routed and deep-linkable — only its place in the palette and navigation changes.
 */

export type RoomId =
  | 'foyer'
  | 'landscape'
  | 'search'
  | 'settings'
  | 'identity'
  | 'season'
  | 'uncharted'
  | 'wisdom'
  | 'reflection'
  | 'inbox';

/**
 * `core`: always present, cannot be hidden (home + the one "designing" surface).
 * `utility`: always reachable, but not part of the "designing a life" surface.
 * `optional`: off for newly created Studios; turned on deliberately in Settings
 * (a later step adds the guided-reveal offer).
 */
export type RoomKind = 'core' | 'utility' | 'optional';

export interface RoomDefinition {
  id: RoomId;
  /** The palette command label, e.g. "Open Identity Studio". */
  label: string;
  /** The room's name on its own, e.g. "Identity Studio". */
  name: string;
  kind: RoomKind;
  /** One-line purpose, in Anna's voice, for the Settings Rooms panel. */
  purpose: string;
}

export const ROOMS: readonly RoomDefinition[] = [
  {
    id: 'foyer',
    label: 'Open Foyer',
    name: 'Foyer',
    kind: 'core',
    purpose: 'Home. A calm gathering of where you are right now.',
  },
  {
    id: 'landscape',
    label: 'Open Life Landscape',
    name: 'Life Landscape',
    kind: 'core',
    purpose: 'See your whole life at a glance, then step into one area to tend it.',
  },
  {
    id: 'search',
    label: 'Search the Studio',
    name: 'Search',
    kind: 'utility',
    purpose: 'Find anything you have written by a feeling, place, person, or idea.',
  },
  {
    id: 'settings',
    label: 'Open Settings',
    name: 'Settings',
    kind: 'utility',
    purpose: 'Rooms, rhythms, backups — the quiet controls for your Studio.',
  },
  {
    id: 'identity',
    label: 'Open Identity Studio',
    name: 'Identity Studio',
    kind: 'optional',
    purpose:
      "Notice who you already are and who you're practising becoming, and keep the small evidence that it's changing.",
  },
  {
    id: 'season',
    label: 'Open Current Season',
    name: 'Current Season',
    kind: 'optional',
    purpose:
      "Name what matters now as a gentle chapter — priorities, experiments, and what you're setting down. Not a deadline.",
  },
  {
    id: 'uncharted',
    label: 'Open Uncharted',
    name: 'Uncharted',
    kind: 'optional',
    purpose: "Keep possibilities that don't need a plan, an answer, or a reason yet.",
  },
  {
    id: 'wisdom',
    label: 'Open Wisdom Garden',
    name: 'Wisdom Garden',
    kind: 'optional',
    purpose: 'Keep ideas worth returning to, and make them your own.',
  },
  {
    id: 'reflection',
    label: 'Open Reflection Garden',
    name: 'Reflection Garden',
    kind: 'optional',
    purpose:
      "Gather what you're learning and celebrating, so the Studio remembers with you.",
  },
  {
    id: 'inbox',
    label: 'Open Inbox',
    name: 'Inbox',
    kind: 'optional',
    purpose: 'A holding place for thoughts you have captured but not yet placed.',
  },
];

export const OPTIONAL_ROOMS: readonly RoomDefinition[] = ROOMS.filter(
  (room) => room.kind === 'optional',
);

export type RoomVisibility = Record<RoomId, boolean>;

/**
 * Which rooms are currently on. Core and utility rooms are always on. An optional
 * room is on unless preferences explicitly turn it off — so an existing Studio
 * (no preferences file, i.e. `{}`) shows every room, and only a seeded new Studio
 * starts small.
 */
export function resolveRoomVisibility(
  preferences: StoredStudioPreferences | null | undefined,
): RoomVisibility {
  const rooms = preferences?.rooms;
  const visibility = {} as RoomVisibility;
  for (const room of ROOMS) {
    if (room.kind === 'core' || room.kind === 'utility') {
      visibility[room.id] = true;
    } else {
      visibility[room.id] = rooms?.[room.id] !== 'off';
    }
  }
  return visibility;
}

export function isRoomVisible(
  id: RoomId,
  preferences: StoredStudioPreferences | null | undefined,
): boolean {
  return resolveRoomVisibility(preferences)[id];
}

export type FoyerSectionId =
  | 'becoming'
  | 'feelings'
  | 'principles'
  | 'almanac'
  | 'gift'
  | 'seasonPreview'
  | 'returnCard'
  | 'cover';

export interface FoyerSectionDefinition {
  id: FoyerSectionId;
  label: string;
  purpose: string;
  /** True when this section is additionally gated by the rhythm layers. */
  rhythmGated?: boolean;
}

export const FOYER_SECTIONS: readonly FoyerSectionDefinition[] = [
  {
    id: 'becoming',
    label: 'Becoming',
    purpose: 'The quality you are practising becoming, front and centre.',
  },
  {
    id: 'gift',
    label: "Today's Gift",
    purpose: 'A single note the Studio brings back to you each day.',
  },
  {
    id: 'feelings',
    label: 'Feelings',
    purpose: 'The feelings you want more room for lately.',
  },
  {
    id: 'principles',
    label: 'Principles',
    purpose: 'A few values you want to steer by.',
  },
  {
    id: 'almanac',
    label: 'Almanac',
    purpose: "Today's rhythms — the season, the moon, your cycle.",
    rhythmGated: true,
  },
  {
    id: 'seasonPreview',
    label: 'Season preview',
    purpose: 'A glimpse of your current season and its priorities.',
  },
  {
    id: 'returnCard',
    label: 'Return card',
    purpose: 'A gentle invitation back to something you set down.',
  },
  {
    id: 'cover',
    label: 'Cover image',
    purpose: 'A photograph that greets you at the door.',
  },
];

export type FoyerSectionVisibility = Record<FoyerSectionId, boolean>;

/**
 * Which Foyer sections are on. An absent key means on, so an existing Studio shows
 * every section and only a seeded new Studio hides the extras. This does NOT apply
 * the additional rhythm-layer gate — use {@link isFoyerSectionVisible} for the
 * almanac, which stays hidden when every rhythm layer is off.
 */
export function resolveFoyerSections(
  preferences: StoredStudioPreferences | null | undefined,
): FoyerSectionVisibility {
  const sections = preferences?.foyerSections;
  const visibility = {} as FoyerSectionVisibility;
  for (const section of FOYER_SECTIONS) {
    visibility[section.id] = sections?.[section.id] !== 'off';
  }
  return visibility;
}

/**
 * Whether a single Foyer section should render. The almanac has an extra gate: even
 * when its section switch is on, it stays hidden if every rhythm layer is off.
 */
export function isFoyerSectionVisible(
  id: FoyerSectionId,
  preferences: StoredStudioPreferences | null | undefined,
  rhythmLayers: RhythmLayers,
): boolean {
  if (resolveFoyerSections(preferences)[id] === false) return false;
  if (id === 'almanac') {
    return rhythmLayers.moon || rhythmLayers.microSeason || rhythmLayers.cycle;
  }
  return true;
}

/**
 * The explicit sparse preferences seeded when a NEW Studio is created. It records
 * the small-core room states and reduced Foyer sections so that "absent file" can
 * continue to mean "existing Studio → show everything". Core and utility rooms are
 * intentionally omitted (they can never be hidden), keeping the file minimal.
 */
export const NEW_STUDIO_PREFERENCES: StoredStudioPreferences = {
  rooms: Object.fromEntries(
    OPTIONAL_ROOMS.map((room) => [room.id, 'off'] as const),
  ),
  foyerSections: Object.fromEntries(
    FOYER_SECTIONS.filter((section) => section.id !== 'becoming' && section.id !== 'gift').map(
      (section) => [section.id, 'off'] as const,
    ),
  ),
};
