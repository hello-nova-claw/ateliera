import { describe, expect, it } from 'vitest';
import microSeasons from './content/micro-seasons.json';
import { resolveMicroSeason } from './rhythm';

describe('micro-season content', () => {
  it('holds the 24 micro-seasons in calendar order', () => {
    expect(microSeasons).toHaveLength(24);
    expect(microSeasons[0]).toEqual({
      month: 1,
      day: 5,
      term: 'The Deep Quiet',
      gloss: 'the year at its stillest, everything held',
    });
    expect(microSeasons[23]?.term).toBe('The Long Night');
    for (const entry of microSeasons) {
      expect(Object.keys(entry).sort()).toEqual(['day', 'gloss', 'month', 'term']);
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.gloss.length).toBeGreaterThan(0);
    }
  });

  it('is the table the engine resolves against', () => {
    for (const entry of microSeasons) {
      expect(resolveMicroSeason(entry.month, entry.day, 'N')).toEqual({
        term: entry.term,
        gloss: entry.gloss,
      });
    }
  });
});
