import { describe, expect, it } from 'vitest';
import seasonGuidance from '../../content/season-guidance.json';
import { seasonFieldGuidance, seasonPrioritiesGuidance } from './field-guidance';

describe('season guidance content', () => {
  it('holds guidance for the sixteen season fields and the priorities', () => {
    expect(Object.keys(seasonGuidance)).toEqual(['fields', 'priorities']);
    expect(Object.keys(seasonGuidance.fields)).toHaveLength(16);
    expect(seasonGuidance.fields.name.example).toBe('e.g. Quiet foundations');
    expect(seasonGuidance.fields.identity.example).toBe(
      'e.g. Someone who stops at enough.',
    );
  });

  it('is the copy the Season room uses', () => {
    expect(seasonFieldGuidance).toEqual(seasonGuidance.fields);
    expect(seasonPrioritiesGuidance).toEqual(seasonGuidance.priorities);
  });
});
