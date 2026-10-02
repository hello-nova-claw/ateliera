import { describe, expect, it } from 'vitest';
import { effectiveTitle, firstNonEmptyLine } from './note-title';

describe('firstNonEmptyLine', () => {
  it('returns the first non-empty, trimmed line', () => {
    expect(firstNonEmptyLine('\n\n  Calm morning  \nmore')).toBe('Calm morning');
  });

  it('strips a single leading heading or list marker', () => {
    expect(firstNonEmptyLine('# Calm morning\nbody')).toBe('Calm morning');
    expect(firstNonEmptyLine('- a task')).toBe('a task');
    expect(firstNonEmptyLine('> a quote')).toBe('a quote');
  });

  it('is empty for a blank body', () => {
    expect(firstNonEmptyLine('   \n\n')).toBe('');
  });
});

describe('effectiveTitle', () => {
  it('prefers an explicit title', () => {
    expect(effectiveTitle({ title: 'Named', body: 'first line' })).toBe('Named');
  });

  it('falls back to the first line when title is absent or blank', () => {
    expect(effectiveTitle({ body: 'learn to sail\nnotes' })).toBe('learn to sail');
    expect(effectiveTitle({ title: '   ', body: 'learn to sail' })).toBe('learn to sail');
  });
});
