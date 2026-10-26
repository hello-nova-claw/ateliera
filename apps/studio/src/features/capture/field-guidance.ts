import type { LandscapeAnchor } from '@studio/domain';
import captureGuidance from '../../content/capture-guidance.json';

/**
 * Writing guidance for the Capture surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. The copy itself is content, kept in
 * src/content/capture-guidance.json.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const captureFieldGuidance = {
  quickNote: captureGuidance.quickNote,
} as const satisfies Record<string, FieldGuidance>;

/**
 * The whole capture dialog, tuned to where it was opened from. Adding a
 * "becoming" sentence from the Foyer should ask a becoming question with a
 * becoming example — not the generic "Hold this thought". Everything falls back
 * to {@link genericCaptureGuidance} when the context has no bespoke voice.
 */
export interface CaptureGuidance {
  /** Dialog heading (and accessible dialog label). */
  readonly title: string;
  /** The question asked above the field. */
  readonly prompt: string;
  /** Always-visible one-line explanation of what belongs here. */
  readonly description: string;
  /** Concrete greyed "e.g. …" example placeholder. */
  readonly example: string;
}

export const genericCaptureGuidance: CaptureGuidance = {
  ...captureGuidance.generic,
  description: captureFieldGuidance.quickNote.description,
  example: captureFieldGuidance.quickNote.example,
};

/**
 * Bespoke copy for the three Foyer slots, keyed by their capture placement.
 * Mirrors each Foyer section's own prompt so the dialog feels like a
 * continuation of the card you tapped, not a generic note box.
 */
export const foyerCaptureGuidance = captureGuidance.foyer satisfies Record<
  string,
  CaptureGuidance
>;

/** Capturing an open possibility from Uncharted — the room's own permissive voice. */
export const unchartedCaptureGuidance: CaptureGuidance =
  captureGuidance.uncharted;

/**
 * Capturing into a Life Landscape cell, keyed by anchor. The prompt mirrors each
 * anchor's own question in the Landscape room, so the dialog feels continuous.
 */
export const landscapeCaptureGuidance =
  captureGuidance.landscape satisfies Record<LandscapeAnchor, CaptureGuidance>;
