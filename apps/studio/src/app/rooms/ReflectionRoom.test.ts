import { describe, expect, it } from 'vitest';

import { canonicalReflectionConnection } from './reflection-connection';

describe('canonicalReflectionConnection', () => {
  const available = [
    { id: 'home', kind: 'life-area' as const, label: 'Home' },
    { id: 'current-season', kind: 'season' as const, label: 'Current Season' },
  ];

  it('resolves only the exact canonical kind and ID', () => {
    expect(canonicalReflectionConnection(
      { id: 'home', kind: 'life-area', label: 'Invented label' },
      available,
    )).toBe(available[0]);
    expect(canonicalReflectionConnection(
      { id: 'home', kind: 'season', label: 'Wrong kind' },
      available,
    )).toBeUndefined();
  });

  it('rejects stale season and life-area IDs instead of choosing a fallback', () => {
    expect(canonicalReflectionConnection(
      { id: 'missing-area', kind: 'life-area', label: 'Missing area' },
      available,
    )).toBeUndefined();
    expect(canonicalReflectionConnection(
      { id: 'historical-season', kind: 'season', label: 'Historical season' },
      available,
    )).toBeUndefined();
  });
});
