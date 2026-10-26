import { describe, expect, it } from 'vitest';
import tourExampleCopy from '../../content/tour-examples.json';
import { tourExamples } from './tour-examples';

describe('tour example content', () => {
  it('holds the sixteen example bodies, keyed by preview', () => {
    expect(Object.keys(tourExampleCopy)).toHaveLength(16);
    expect(tourExampleCopy['foyer-becoming']).toBe(
      'Someone who creates from calm and trusts her own timing.',
    );
    expect(tourExampleCopy['reflection-then']).toBe(
      'Today I chose calm over urgency, and the important work still moved forward.',
    );
  });

  it('is the copy the tour shows', () => {
    const examples = Object.values(tourExamples).flat();
    expect(examples.map((example) => example.previewKey)).toEqual(
      Object.keys(tourExampleCopy),
    );
    for (const example of examples) {
      const body = tourExampleCopy[example.previewKey as keyof typeof tourExampleCopy];
      expect(example.body).toBe(body);
      if (example.startingPoint) expect(example.startingPoint.body).toBe(body);
    }
  });
});
