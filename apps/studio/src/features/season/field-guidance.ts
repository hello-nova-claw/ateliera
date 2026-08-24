/**
 * Writing guidance for the Season surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const seasonFieldGuidance = {
  name: {
    description:
      'A short name for this chapter — evocative, not a deadline.',
    example: 'e.g. Quiet foundations',
  },
  carryAsLearning: {
    description:
      'One thing from the last stretch you want to bring forward.',
    example:
      'e.g. Protecting mornings mattered more than any to-do list.',
  },
  statement: {
    description: 'Finish the sentence in a few words.',
    example: "e.g. …tending what I've already started.",
  },
  feelings: {
    description: 'A few feelings you want this season to have. One per line.',
    example: 'e.g. steady · spacious · warm',
  },
  newPriority: {
    description: "A focus that isn't a life area yet.",
    example: 'e.g. Finish the studio rewrite',
  },
  decisions30: {
    description:
      'Small experiments or decisions for the next month. One per line.',
    example: 'e.g. Try a 4-day writing week',
  },
  decisions60: {
    description: 'Slightly further out. One per line.',
    example: 'e.g. Decide whether to keep the Tuesday commitment',
  },
  decisions90: {
    description: 'The horizon of this season. One per line.',
    example: 'e.g. Revisit where I live',
  },
  practices: {
    description: 'Repeatable things that support the season. One per line.',
    example: 'e.g. Walk before screens',
  },
  supports: {
    description:
      'People, tools, or conditions you can lean on. One per line.',
    example: 'e.g. Thursday call with Sam',
  },
  constraints: {
    description:
      'Honest limits to design around, without judgement. One per line.',
    example: 'e.g. Low energy until the meds settle',
  },
  enough: {
    description: 'Name "enough" now, so you can recognise it later.',
    example: 'e.g. If mornings stay mine, this season did its work.',
  },
  notNow: {
    description:
      "What you're deliberately not doing now — resting, not backlog. One per line.",
    example: 'e.g. Learning a new language',
  },
  celebration: {
    description: 'Something worth marking from this season.',
    example: 'e.g. I kept the promise about mornings.',
  },
  learning: {
    description: "One lesson you're taking forward.",
    example: 'e.g. Constraints made me more, not less, creative.',
  },
  identity: {
    description: 'A way you changed across this chapter.',
    example: 'e.g. Someone who stops at enough.',
  },
} as const satisfies Record<string, FieldGuidance>;

/**
 * Description for the priorities fieldset — a grouped control, so the guidance
 * renders as an associated description near the legend rather than through
 * GuidedField (which wraps a single control).
 */
export const seasonPrioritiesGuidance = {
  description:
    'Up to three areas that deserve the clearest attention now.',
} as const;
