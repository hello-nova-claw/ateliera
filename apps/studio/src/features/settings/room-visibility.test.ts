import { describe, expect, it } from 'vitest';

import {
  FOYER_SECTIONS,
  NEW_STUDIO_PREFERENCES,
  OPTIONAL_ROOMS,
  ROOMS,
  isFoyerSectionVisible,
  isRoomVisible,
  resolveFoyerSections,
  resolveRoomVisibility,
} from './room-visibility';

describe('ROOMS catalogue', () => {
  it('classifies rooms into core, utility, and optional', () => {
    const core = ROOMS.filter((room) => room.kind === 'core').map((r) => r.id);
    const utility = ROOMS.filter((room) => room.kind === 'utility').map((r) => r.id);
    const optional = ROOMS.filter((room) => room.kind === 'optional').map((r) => r.id);
    expect(core).toEqual(['foyer', 'landscape']);
    expect(utility).toEqual(['search', 'settings']);
    expect(optional).toEqual([
      'identity',
      'season',
      'uncharted',
      'wisdom',
      'reflection',
      'inbox',
    ]);
  });

  it('exposes only the optional rooms as OPTIONAL_ROOMS', () => {
    expect(OPTIONAL_ROOMS.map((room) => room.id)).toEqual([
      'identity',
      'season',
      'uncharted',
      'wisdom',
      'reflection',
      'inbox',
    ]);
  });
});

describe('resolveRoomVisibility', () => {
  it('shows every room for an existing Studio (no preferences file)', () => {
    const visibility = resolveRoomVisibility(null);
    for (const room of ROOMS) {
      expect(visibility[room.id]).toBe(true);
    }
    expect(resolveRoomVisibility(undefined).identity).toBe(true);
    expect(resolveRoomVisibility({}).season).toBe(true);
  });

  it('keeps core and utility rooms on even when explicitly set off', () => {
    const visibility = resolveRoomVisibility({
      rooms: { foyer: 'off', landscape: 'off', search: 'off', settings: 'off' },
    });
    expect(visibility.foyer).toBe(true);
    expect(visibility.landscape).toBe(true);
    expect(visibility.search).toBe(true);
    expect(visibility.settings).toBe(true);
  });

  it('hides an optional room only when explicitly off', () => {
    const visibility = resolveRoomVisibility({
      rooms: { identity: 'off', season: 'on' },
    });
    expect(visibility.identity).toBe(false);
    expect(visibility.season).toBe(true);
    // An optional room with no key still defaults on (existing Studio behaviour).
    expect(visibility.wisdom).toBe(true);
  });

  it('reflects the small-core new-Studio seed', () => {
    const visibility = resolveRoomVisibility(NEW_STUDIO_PREFERENCES);
    expect(visibility.foyer).toBe(true);
    expect(visibility.landscape).toBe(true);
    expect(visibility.search).toBe(true);
    expect(visibility.settings).toBe(true);
    expect(visibility.identity).toBe(false);
    expect(visibility.season).toBe(false);
    expect(visibility.uncharted).toBe(false);
    expect(visibility.wisdom).toBe(false);
    expect(visibility.reflection).toBe(false);
    expect(visibility.inbox).toBe(false);
  });
});

describe('isRoomVisible', () => {
  it('answers per room path segment', () => {
    expect(isRoomVisible('identity', NEW_STUDIO_PREFERENCES)).toBe(false);
    expect(isRoomVisible('foyer', NEW_STUDIO_PREFERENCES)).toBe(true);
    expect(isRoomVisible('identity', {})).toBe(true);
  });
});

describe('resolveFoyerSections', () => {
  it('shows every section for an existing Studio (absent key = on)', () => {
    const sections = resolveFoyerSections(null);
    for (const section of FOYER_SECTIONS) {
      expect(sections[section.id]).toBe(true);
    }
    expect(resolveFoyerSections({}).feelings).toBe(true);
  });

  it('hides a section only when explicitly off', () => {
    const sections = resolveFoyerSections({
      foyerSections: { feelings: 'off', almanac: 'on' },
    });
    expect(sections.feelings).toBe(false);
    expect(sections.almanac).toBe(true);
    expect(sections.becoming).toBe(true);
  });

  it('reflects the reduced new-Studio seed', () => {
    const sections = resolveFoyerSections(NEW_STUDIO_PREFERENCES);
    expect(sections.becoming).toBe(true);
    expect(sections.gift).toBe(true);
    expect(sections.feelings).toBe(false);
    expect(sections.principles).toBe(false);
    expect(sections.almanac).toBe(false);
    expect(sections.seasonPreview).toBe(false);
    expect(sections.returnCard).toBe(false);
    expect(sections.cover).toBe(false);
  });
});

describe('isFoyerSectionVisible', () => {
  it('gates the almanac additionally by the rhythm layers', () => {
    const allLayersOff = { moon: false, microSeason: false, cycle: false };
    const someLayerOn = { moon: true, microSeason: false, cycle: false };
    // Section on, but every rhythm layer off -> almanac still hidden.
    expect(
      isFoyerSectionVisible('almanac', {}, allLayersOff),
    ).toBe(false);
    expect(
      isFoyerSectionVisible('almanac', {}, someLayerOn),
    ).toBe(true);
    // Section off wins regardless of rhythm layers.
    expect(
      isFoyerSectionVisible('almanac', { foyerSections: { almanac: 'off' } }, someLayerOn),
    ).toBe(false);
  });

  it('does not gate non-almanac sections by rhythm layers', () => {
    const allLayersOff = { moon: false, microSeason: false, cycle: false };
    expect(isFoyerSectionVisible('becoming', {}, allLayersOff)).toBe(true);
  });
});

describe('NEW_STUDIO_PREFERENCES', () => {
  it('is a valid sparse preferences object with explicit offs', () => {
    expect(NEW_STUDIO_PREFERENCES.rooms).toBeDefined();
    expect(NEW_STUDIO_PREFERENCES.foyerSections).toBeDefined();
    // Core/utility rooms are not listed (they cannot be hidden anyway).
    expect(NEW_STUDIO_PREFERENCES.rooms?.foyer).toBeUndefined();
    expect(NEW_STUDIO_PREFERENCES.rooms?.landscape).toBeUndefined();
  });
});
