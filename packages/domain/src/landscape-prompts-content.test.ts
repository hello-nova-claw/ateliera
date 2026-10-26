import { describe, expect, it } from 'vitest';
import landscapePrompts from './content/landscape-prompts.json';
import { landscapeAnchorDefinitions } from './landscape';

describe('landscape prompt content', () => {
  it('holds one prompt for each of the five landscape anchors', () => {
    expect(Object.keys(landscapePrompts)).toEqual([
      'vision',
      'identity-values-feelings',
      'decisions',
      'practices',
      'structure-strategy',
    ]);
    expect(landscapePrompts.vision).toBe(
      'What would an ordinary Tuesday look like if this were true?',
    );
    expect(landscapePrompts['structure-strategy']).toBe(
      'What time, environment, help, boundary, money, or system supports it?',
    );
  });

  it('is what the anchor definitions ask', () => {
    for (const anchor of landscapeAnchorDefinitions) {
      expect(anchor.prompt).toBe(landscapePrompts[anchor.id]);
    }
  });
});
