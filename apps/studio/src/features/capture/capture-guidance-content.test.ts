import { describe, expect, it } from 'vitest';
import captureGuidance from '../../content/capture-guidance.json';
import {
  captureFieldGuidance,
  foyerCaptureGuidance,
  genericCaptureGuidance,
  landscapeCaptureGuidance,
  unchartedCaptureGuidance,
} from './field-guidance';

describe('capture guidance content', () => {
  it('holds the generic, Foyer, Uncharted and Landscape capture copy', () => {
    expect(Object.keys(captureGuidance)).toEqual([
      'quickNote',
      'generic',
      'foyer',
      'uncharted',
      'landscape',
    ]);
    expect(Object.keys(captureGuidance.foyer)).toHaveLength(3);
    expect(Object.keys(captureGuidance.landscape)).toHaveLength(5);
    expect(captureGuidance.generic.title).toBe('Hold this thought');
    expect(captureGuidance.landscape['structure-strategy'].example).toBe(
      'e.g. Phone charges outside the bedroom.',
    );
  });

  it('is the copy the capture dialog uses', () => {
    expect(captureFieldGuidance.quickNote).toEqual(captureGuidance.quickNote);
    expect(genericCaptureGuidance).toEqual({
      ...captureGuidance.generic,
      ...captureGuidance.quickNote,
    });
    expect(foyerCaptureGuidance).toEqual(captureGuidance.foyer);
    expect(unchartedCaptureGuidance).toEqual(captureGuidance.uncharted);
    expect(landscapeCaptureGuidance).toEqual(captureGuidance.landscape);
  });
});
