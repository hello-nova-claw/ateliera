import { describe, expect, it } from 'vitest';

import { DEFAULT_RHYTHM_LAYERS, resolveRhythmLayers } from './rhythm-layers';

describe('resolveRhythmLayers', () => {
  it('defaults every layer on when no preferences are saved', () => {
    expect(resolveRhythmLayers(null)).toEqual(DEFAULT_RHYTHM_LAYERS);
    expect(resolveRhythmLayers(undefined)).toEqual(DEFAULT_RHYTHM_LAYERS);
    expect(resolveRhythmLayers({})).toEqual(DEFAULT_RHYTHM_LAYERS);
  });

  it('defaults each layer on individually when others are set', () => {
    expect(resolveRhythmLayers({ rhythm: { moon: false } })).toEqual({
      moon: false,
      microSeason: true,
      cycle: true,
    });
  });

  it('reflects explicitly disabled layers', () => {
    expect(
      resolveRhythmLayers({ rhythm: { moon: false, microSeason: false, cycle: false } }),
    ).toEqual({ moon: false, microSeason: false, cycle: false });
  });
});
