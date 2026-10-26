import { describe, expect, it } from 'vitest';
import wisdomGuidance from '../../content/wisdom-guidance.json';
import { wisdomFieldGuidance } from './field-guidance';

describe('wisdom guidance content', () => {
  it('holds a description and example for each of the seven Wisdom fields', () => {
    expect(Object.keys(wisdomGuidance)).toEqual([
      'idea',
      'title',
      'creator',
      'sourceTitle',
      'sourceUrl',
      'synthesis',
      'makeItMine',
    ]);
    expect(wisdomGuidance.idea.description).toBe(
      'The insight, quote, or principle, in your own words or theirs.',
    );
    expect(wisdomGuidance.makeItMine.example).toBe(
      'e.g. For me this shows up as: prepare the space the night before.',
    );
  });

  it('is the copy the Wisdom room uses', () => {
    expect(wisdomFieldGuidance).toEqual(wisdomGuidance);
  });
});
