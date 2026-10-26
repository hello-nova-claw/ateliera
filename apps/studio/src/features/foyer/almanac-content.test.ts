import { describe, expect, it } from 'vitest';
import almanac from '../../content/almanac.json';

describe('almanac content', () => {
  it('holds the inward and outward day lines', () => {
    expect(almanac).toEqual({
      orientation: {
        inward: 'A gathering day — a good time to notice how far you have come.',
        outward: 'An opening day — a good time to name what you want to make room for.',
      },
    });
  });
});
