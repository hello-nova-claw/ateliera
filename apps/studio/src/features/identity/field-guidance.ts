import type { IdentitySection } from '@studio/domain';

/**
 * Writing guidance for the Identity surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

/** Guidance for each identity section kind's main writing field. */
export const identityFieldGuidance = {
  'already-true': {
    description:
      "A quality you no longer have to force — it's just how you are now.",
    example: "e.g. I rest before I'm depleted, not after.",
  },
  'practicing-now': {
    description: "Something you're growing into, not yet automatic.",
    example: 'e.g. Saying "let me think about it" instead of an instant yes.',
  },
  'values-principles': {
    description: 'A value you want to steer by.',
    example: 'e.g. Depth over breadth — a few things, done with care.',
  },
  'desired-feelings': {
    description: 'A feeling you want more room for in ordinary days.',
    example: 'e.g. Unhurried.',
  },
  'beliefs-practice': {
    description: 'A belief, and how it shows up in what you do.',
    example: 'e.g. My work is enough — so I stop at a good stopping point.',
  },
  'embodiment-cues': {
    description: "A small physical reminder of who you're being.",
    example: 'e.g. Shoulders down, slow exhale, before I open the laptop.',
  },
  'identity-shifts': {
    description: "A change you've noticed in yourself, however small.",
    example: 'e.g. I used to over-explain; lately I let a "no" stand.',
  },
} as const satisfies Record<IdentitySection, FieldGuidance>;

/** Guidance for the optional short-title field, shared across sections. */
export const identityTitleGuidance = {
  description: 'Optional. A handful of words to find this by later.',
  example: 'e.g. Unhurried mornings',
} as const satisfies FieldGuidance;
