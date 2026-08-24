/**
 * Writing guidance for the Reflection surface: a one-line description of what
 * belongs in the field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const reflectionFieldGuidance = {
  sentenceToKeep: {
    description:
      'One thing you noticed, learned, or want to remember. A single sentence is plenty.',
    example:
      'e.g. I do my clearest thinking in the first hour, before messages.',
  },
} as const satisfies Record<string, FieldGuidance>;
