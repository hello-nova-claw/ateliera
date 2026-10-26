import seasonGuidance from '../../content/season-guidance.json';

/**
 * Writing guidance for the Season surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. The copy itself is content, kept in
 * src/content/season-guidance.json.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

export const seasonFieldGuidance = seasonGuidance.fields satisfies Record<
  string,
  FieldGuidance
>;

/**
 * Description for the priorities fieldset — a grouped control, so the guidance
 * renders as an associated description near the legend rather than through
 * GuidedField (which wraps a single control).
 */
export const seasonPrioritiesGuidance = seasonGuidance.priorities;
