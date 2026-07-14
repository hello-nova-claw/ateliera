import { describe, expect, it } from 'vitest';

import { parseSearchLocation, serializeSearchLocation } from './search-url';

describe('search URL state', () => {
  it('round trips every typed filter with stable repeated parameters', () => {
    const state = parseSearchLocation(serializeSearchLocation('calm & kind', {
      rooms: ['reflection-garden', 'foyer'],
      semanticTypes: ['reflection', 'celebration'],
      lifeAreas: ['home'],
      seasons: ['winter'],
      statuses: ['active', 'archived'],
      tags: ['family'],
      cardTypes: ['text'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-14',
    }));

    expect(state).toEqual({
      query: 'calm & kind',
      filters: {
        rooms: ['foyer', 'reflection-garden'],
        semanticTypes: ['celebration', 'reflection'],
        lifeAreas: ['home'],
        seasons: ['winter'],
        statuses: ['active', 'archived'],
        tags: ['family'],
        cardTypes: ['text'],
        dateFrom: '2026-07-01',
        dateTo: '2026-07-14',
      },
    });
  });

  it('bounds query and filter values and ignores invalid typed values and dates', () => {
    const parameters = new URLSearchParams();
    parameters.set('q', 'x'.repeat(600));
    parameters.append('type', 'not-a-semantic-type');
    parameters.append('status', 'trashed');
    parameters.append('status', 'not-a-status');
    parameters.append('room', 'r'.repeat(300));
    parameters.set('from', '07/01/2026');
    parameters.set('to', '2026-99-99');

    expect(parseSearchLocation(`?${parameters}`)).toEqual({
      query: 'x'.repeat(512),
      filters: {},
    });
  });

  it('omits empty state and never persists the default non-trash statuses as noise', () => {
    expect(serializeSearchLocation('', {})).toBe('');
    expect(serializeSearchLocation('', {
      statuses: ['draft', 'active', 'resting', 'archived'],
    })).toBe('');
  });
});
