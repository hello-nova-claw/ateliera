import { describe, expect, it } from 'vitest';

import {
  defaultWisdomThemes,
  semanticTypeForWisdomKind,
  wisdomKinds,
} from './wisdom';

describe('Wisdom Garden vocabulary', () => {
  it('defines source-friendly kinds and the calm default themes', () => {
    expect(wisdomKinds).toEqual([
      'insight',
      'quote',
      'principle',
      'practice',
      'question',
      'resource',
      'synthesis',
    ]);
    expect(defaultWisdomThemes.map((theme) => theme.id)).toContain(
      'motherhood',
    );
    expect(defaultWisdomThemes.map((theme) => theme.id)).toContain(
      'nervous-system-care',
    );
    expect(semanticTypeForWisdomKind('principle')).toBe('foundations');
    expect(semanticTypeForWisdomKind('practice')).toBe('growth');
    expect(semanticTypeForWisdomKind('quote')).toBe('reflection');
  });
});
