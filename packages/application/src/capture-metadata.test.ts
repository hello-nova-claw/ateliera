import { describe, expect, it } from 'vitest';
import { capturePlacementMetadata } from './capture-metadata';

describe('Gift placement routing', () => {
  it('routes a dream Gift to Uncharted', () => {
    expect(capturePlacementMetadata('uncharted')).toMatchObject({
      rooms: ['uncharted'],
      semanticType: 'uncharted',
    });
  });

  it('routes evidence, reframe, and wish Gifts to Reflection Garden', () => {
    expect(capturePlacementMetadata('reflection')).toMatchObject({
      rooms: ['reflection-garden'],
      semanticType: 'reflection',
    });
  });
});
