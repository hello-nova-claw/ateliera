import { describe, expect, it } from 'vitest';
import { searchPlaces } from './places';

describe('searchPlaces', () => {
  it('returns nothing for an empty query', async () => {
    expect(await searchPlaces('')).toEqual([]);
    expect(await searchPlaces('   ')).toEqual([]);
  });

  it('finds a place and derives its coordinates, timezone, and hemisphere', async () => {
    const results = await searchPlaces('Auckland');
    const auckland = results.find((p) => p.name === 'Auckland' && p.country === 'NZ');
    expect(auckland).toBeDefined();
    expect(auckland?.timeZone).toBe('Pacific/Auckland');
    expect(auckland?.hemisphere).toBe('S');
    expect(auckland?.lat).toBeLessThan(0);
    expect(auckland?.lon).toBeCloseTo(174.76, 1);
  });

  it('derives a northern hemisphere from a positive latitude', async () => {
    const london = (await searchPlaces('London')).find((p) => p.country === 'GB');
    expect(london?.hemisphere).toBe('N');
    expect(london?.timeZone).toBe('Europe/London');
  });

  it('ranks the most populous match first and respects the limit', async () => {
    const results = await searchPlaces('London', 5);
    expect(results.length).toBeLessThanOrEqual(5);
    // London, GB dwarfs every other London, so it leads the results.
    expect(results[0]?.country).toBe('GB');
  });

  it('orders prefix matches ahead of mid-string matches', async () => {
    const results = await searchPlaces('york', 20);
    expect(results[0]?.name.toLowerCase().startsWith('york')).toBe(true);
    // Once a non-prefix (mid-string) match appears, no prefix match follows it.
    const firstMidString = results.findIndex(
      (p) => !p.name.toLowerCase().startsWith('york'),
    );
    if (firstMidString !== -1) {
      expect(
        results
          .slice(firstMidString)
          .every((p) => !p.name.toLowerCase().startsWith('york')),
      ).toBe(true);
    }
  });

  it('is case-insensitive', async () => {
    const lower = await searchPlaces('paris', 3);
    const upper = await searchPlaces('PARIS', 3);
    expect(lower[0]?.name).toBe(upper[0]?.name);
  });
});
