import { describe, expect, it } from 'vitest';
import reflectionGuidance from '../../content/reflection-guidance.json';
import { reflectionFieldGuidance } from './field-guidance';

describe('reflection guidance content', () => {
  it('holds guidance for the sentence to keep', () => {
    expect(Object.keys(reflectionGuidance)).toEqual(['sentenceToKeep']);
    expect(reflectionGuidance.sentenceToKeep.example).toBe(
      'e.g. I do my clearest thinking in the first hour, before messages.',
    );
  });

  it('is the copy the Reflection room uses', () => {
    expect(reflectionFieldGuidance).toEqual(reflectionGuidance);
  });
});
