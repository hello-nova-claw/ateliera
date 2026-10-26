import { describe, expect, it } from 'vitest';
import identityGuidance from '../../content/identity-guidance.json';
import { identityFieldGuidance, identityTitleGuidance } from './field-guidance';

describe('identity guidance content', () => {
  it('holds guidance for the seven sections and the title field', () => {
    expect(Object.keys(identityGuidance)).toEqual(['sections', 'title']);
    expect(Object.keys(identityGuidance.sections)).toHaveLength(7);
    expect(identityGuidance.sections['already-true'].example).toBe(
      "e.g. I rest before I'm depleted, not after.",
    );
    expect(identityGuidance.title.example).toBe('e.g. Unhurried mornings');
  });

  it('is the copy the Identity room uses', () => {
    expect(identityFieldGuidance).toEqual(identityGuidance.sections);
    expect(identityTitleGuidance).toEqual(identityGuidance.title);
  });
});
