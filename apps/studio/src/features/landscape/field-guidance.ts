/**
 * Writing guidance for the Landscape surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. Copy is data, not scattered JSX, so it stays easy to review.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const landscapeFieldGuidance = {
  newArea: {
    description:
      'A part of your life you want to tend. Five to ten keeps the Landscape spacious.',
    example: 'e.g. Body & energy',
  },
  renameArea: {
    description: 'A name that feels like yours.',
    example: 'e.g. Home & belonging',
  },
} as const satisfies Record<string, FieldGuidance>;
