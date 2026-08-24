import { describe, expect, it } from 'vitest';

import {
  captureGuidanceForContext,
  captureMeaningForContext,
} from './capture-context';
import { genericCaptureGuidance } from './field-guidance';

describe('capture guidance context', () => {
  it('gives each Foyer slot its own voice', () => {
    const becoming = captureGuidanceForContext({ placement: 'foyer-becoming' });
    expect(becoming.title).toBe('Name a becoming');
    expect(becoming.prompt).toBe('What are you currently becoming?');
    expect(becoming.example).toContain('becoming someone who rests');

    expect(captureGuidanceForContext({ placement: 'foyer-feeling' }).prompt).toBe(
      'What feeling would you like to make room for?',
    );
    expect(
      captureGuidanceForContext({ placement: 'foyer-principle' }).prompt,
    ).toBe('What supports this life?');
  });

  it('gives Uncharted its permissive voice', () => {
    const uncharted = captureGuidanceForContext({ placement: 'uncharted' });
    expect(uncharted.title).toBe('Leave a possibility');
    expect(uncharted.prompt).toBe('What if…?');
  });

  it('tunes Landscape capture to the anchor', () => {
    expect(
      captureGuidanceForContext({
        landscape: { lifeArea: 'home', anchor: 'practices' },
      }).title,
    ).toBe('Add a practice');
    expect(
      captureGuidanceForContext({
        landscape: { lifeArea: 'home', anchor: 'vision' },
      }).prompt,
    ).toBe('What would an ordinary Tuesday look like if this were true?');
  });

  it('falls back to the generic voice elsewhere', () => {
    expect(captureGuidanceForContext({})).toEqual(genericCaptureGuidance);
    expect(captureGuidanceForContext({ placement: 'reflection' })).toEqual(
      genericCaptureGuidance,
    );
  });
});

describe('capture meaning context', () => {
  it('infers exact placement and Landscape meanings as locked', () => {
    expect(captureMeaningForContext({ placement: 'foyer-feeling' })).toEqual({
      semanticType: 'vision',
      locked: true,
    });
    expect(
      captureMeaningForContext({
        landscape: { lifeArea: 'home', anchor: 'practices' },
      }),
    ).toEqual({ semanticType: 'growth', locked: true });
  });

  it('suggests a room meaning without preventing an override', () => {
    expect(captureMeaningForContext({ path: '/uncharted' })).toEqual({
      semanticType: 'uncharted',
      locked: false,
    });
    expect(captureMeaningForContext({ path: '/foyer' })).toBeUndefined();
  });
});
