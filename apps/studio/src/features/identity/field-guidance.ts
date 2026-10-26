import type { IdentitySection } from '@studio/domain';
import identityGuidance from '../../content/identity-guidance.json';

/**
 * Writing guidance for the Identity surface: a one-line description of what
 * belongs in each field, plus a concrete greyed example shown as the control's
 * placeholder. The copy itself is content, kept in
 * src/content/identity-guidance.json.
 */
export interface FieldGuidance {
  /** Always-visible, one-line explanation of what belongs in the field. */
  readonly description: string;
  /** Concrete example, rendered greyed as the control's "e.g. …" placeholder. */
  readonly example: string;
}

/** Guidance for each identity section kind's main writing field. */
export const identityFieldGuidance = identityGuidance.sections satisfies Record<
  IdentitySection,
  FieldGuidance
>;

/** Guidance for the optional short-title field, shared across sections. */
export const identityTitleGuidance =
  identityGuidance.title satisfies FieldGuidance;
