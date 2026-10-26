import wisdomGuidance from '../../content/wisdom-guidance.json';

/**
 * Writing guidance for the Wisdom surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. The copy itself is content, kept in
 * src/content/wisdom-guidance.json.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const wisdomFieldGuidance = wisdomGuidance satisfies Record<
  string,
  FieldGuidance
>;
