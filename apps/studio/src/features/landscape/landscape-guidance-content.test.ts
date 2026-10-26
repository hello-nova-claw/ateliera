import { describe, expect, it } from 'vitest';
import landscapeGuidance from '../../content/landscape-guidance.json';
import { landscapeFieldGuidance } from './field-guidance';

describe('landscape guidance content', () => {
  it('holds guidance for naming and renaming a life area', () => {
    expect(Object.keys(landscapeGuidance)).toEqual(['newArea', 'renameArea']);
    expect(landscapeGuidance.newArea.example).toBe('e.g. Body & energy');
  });

  it('is the copy the Landscape room uses', () => {
    expect(landscapeFieldGuidance).toEqual(landscapeGuidance);
  });
});
