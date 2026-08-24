/**
 * Writing guidance for the Wisdom surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const wisdomFieldGuidance = {
  idea: {
    description:
      'The insight, quote, or principle, in your own words or theirs.',
    example: "e.g. You don't rise to your goals; you fall to your systems.",
  },
  title: {
    description: 'Optional. A short handle for this idea.',
    example: 'e.g. Systems over goals',
  },
  creator: {
    description: 'Who said or made it.',
    example: 'e.g. James Clear',
  },
  sourceTitle: {
    description: 'Where you met it.',
    example: 'e.g. Atomic Habits',
  },
  sourceUrl: {
    description: 'Optional link back to it.',
    example: 'e.g. https://…',
  },
  synthesis: {
    description: "The thread you see running through the ones you've chosen.",
    example: 'e.g. All three are really about lowering the cost of starting.',
  },
  makeItMine: {
    description:
      "Your own take — what you've observed, how it fits your life.",
    example: 'e.g. For me this shows up as: prepare the space the night before.',
  },
} as const satisfies Record<string, FieldGuidance>;
