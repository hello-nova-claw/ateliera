/**
 * Writing guidance for the Capture surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const captureFieldGuidance = {
  quickNote: {
    description:
      "Anything you want the Studio to hold — a thought, a line, a fragment. It doesn't need to be finished.",
    example: 'e.g. Kept choosing rest today instead of pushing through.',
  },
} as const satisfies Record<string, FieldGuidance>;

import type { LandscapeAnchor } from '@studio/domain';

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
  title: 'Hold this thought',
  prompt: 'What would you like remembered?',
  description: captureFieldGuidance.quickNote.description,
  example: captureFieldGuidance.quickNote.example,
};

/**
 * Bespoke copy for the three Foyer slots, keyed by their capture placement.
 * Mirrors each Foyer section's own prompt so the dialog feels like a
 * continuation of the card you tapped, not a generic note box.
 */
export const foyerCaptureGuidance = {
  'foyer-becoming': {
    title: 'Name a becoming',
    prompt: 'What are you currently becoming?',
    description:
      "A short sentence about who you're growing into — present tense, as if it is already beginning. It can change any time.",
    example: "e.g. I'm becoming someone who rests before they're depleted.",
  },
  'foyer-feeling': {
    title: 'Make room for a feeling',
    prompt: 'What feeling would you like to make room for?',
    description:
      'A feeling you want more of in ordinary days. One word or a short phrase is plenty.',
    example: 'e.g. Unhurried.',
  },
  'foyer-principle': {
    title: 'Name a guiding principle',
    prompt: 'What supports this life?',
    description: 'A value or principle you want to steer by.',
    example: 'e.g. Depth over breadth — a few things, done with care.',
  },
} as const satisfies Record<string, CaptureGuidance>;

/** Capturing an open possibility from Uncharted — the room's own permissive voice. */
export const unchartedCaptureGuidance: CaptureGuidance = {
  title: 'Leave a possibility',
  prompt: 'What if…?',
  description:
    "A possibility that doesn't need a plan, an answer, or a reason yet. Begin anywhere.",
  example: 'e.g. What if I only worked mornings?',
};

/**
 * Capturing into a Life Landscape cell, keyed by anchor. The prompt mirrors each
 * anchor's own question in the Landscape room, so the dialog feels continuous.
 */
export const landscapeCaptureGuidance = {
  vision: {
    title: 'Add to Vision',
    prompt: 'What would an ordinary Tuesday look like if this were true?',
    description:
      "A picture of the life you're creating in this area — concrete and ordinary, not grand.",
    example: 'e.g. Mornings unhurried, one deep-work block, home by six.',
  },
  'identity-values-feelings': {
    title: 'Add to Identity, values & feelings',
    prompt: 'Who is the version of me living this?',
    description: 'Who you are being in this area, and what you value here.',
    example: 'e.g. Someone who says no without a long explanation.',
  },
  decisions: {
    title: 'Add a decision',
    prompt: 'What can I choose in the next 30, 60, or 90 days?',
    description: 'A choice or experiment you can act on soon.',
    example: 'e.g. Try a four-day writing week for a month.',
  },
  practices: {
    title: 'Add a practice',
    prompt: 'What rhythm lets this be lived repeatedly?',
    description: 'A repeatable rhythm that keeps this alive.',
    example: 'e.g. Walk before screens.',
  },
  'structure-strategy': {
    title: 'Add to Structure & strategy',
    prompt: 'What supports it — time, environment, help, boundary, money, system?',
    description: 'The time, space, help, boundary, or system that holds this up.',
    example: 'e.g. Phone charges outside the bedroom.',
  },
} as const satisfies Record<LandscapeAnchor, CaptureGuidance>;
