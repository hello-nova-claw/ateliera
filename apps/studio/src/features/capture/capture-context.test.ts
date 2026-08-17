import { describe, expect, it } from 'vitest';

import { captureMeaningForContext } from './capture-context';

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
