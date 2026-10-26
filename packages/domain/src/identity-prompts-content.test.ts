import { describe, expect, it } from 'vitest';
import identityPrompts from './content/identity-prompts.json';
import { identitySectionDefinitions } from './identity';

describe('identity prompt content', () => {
  it('holds one prompt for each of the seven identity sections', () => {
    expect(Object.keys(identityPrompts)).toEqual([
      'already-true',
      'practicing-now',
      'values-principles',
      'desired-feelings',
      'beliefs-practice',
      'embodiment-cues',
      'identity-shifts',
    ]);
    expect(identityPrompts['already-true']).toBe(
      'What already feels quietly and honestly true?',
    );
    expect(identityPrompts['identity-shifts']).toBe(
      'What language or assumption has changed over time?',
    );
  });

  it('is what the section definitions ask', () => {
    for (const section of identitySectionDefinitions) {
      expect(section.prompt).toBe(identityPrompts[section.id]);
    }
  });
});
