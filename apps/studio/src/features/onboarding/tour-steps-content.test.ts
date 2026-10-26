import { describe, expect, it } from 'vitest';
import tourSteps from '../../content/tour-steps.json';

describe('tour step content', () => {
  it('holds one description for each of the five tour rooms', () => {
    expect(Object.keys(tourSteps)).toEqual([
      'foyer',
      'landscape',
      'season',
      'uncharted',
      'reflection',
    ]);
    expect(tourSteps.foyer).toMatch(/^The Foyer holds a few things/);
    expect(tourSteps.reflection).toMatch(/begins to remember with you\.$/);
  });
});
