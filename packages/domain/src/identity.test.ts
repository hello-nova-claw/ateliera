import { describe, expect, it } from 'vitest';

import {
  identitySectionDefinitions,
  identitySectionForCardType,
} from './identity';

describe('Identity Studio sections', () => {
  it('keeps the editorial sections stable and maps shared Foyer cards', () => {
    expect(identitySectionDefinitions.map((section) => section.id)).toEqual([
      'already-true',
      'practicing-now',
      'values-principles',
      'desired-feelings',
      'beliefs-practice',
      'embodiment-cues',
      'identity-shifts',
    ]);
    expect(identitySectionForCardType('identity')).toBe('practicing-now');
    expect(identitySectionForCardType('principle')).toBe('values-principles');
    expect(identitySectionForCardType('feeling')).toBe('desired-feelings');
    expect(identitySectionForCardType('unrelated')).toBeUndefined();
  });
});
