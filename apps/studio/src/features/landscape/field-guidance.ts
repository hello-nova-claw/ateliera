import landscapeGuidance from '../../content/landscape-guidance.json';

/**
 * Writing guidance for the Landscape surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. The copy itself is content, kept in
 * src/content/landscape-guidance.json.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const landscapeFieldGuidance = landscapeGuidance satisfies Record<
  string,
  FieldGuidance
>;
