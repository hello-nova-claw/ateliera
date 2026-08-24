import './GuidedField.css';
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface GuidedFieldProps {
  /**
   * The control's `id`, also used to derive a stable id for the description so
   * it can be wired to the control via `aria-describedby`.
   */
  controlId: string;
  /**
   * Always-visible, one-line explanation of what belongs in the field. This is
   * the field's meaning — never placeholder-only — and is associated with the
   * control for assistive technology.
   */
  description: ReactNode;
  /** The field's visible name, rendered as a real `<label>`. */
  label: ReactNode;
  /**
   * The control (textarea/input/select). It keeps its own `placeholder`
   * (the greyed "e.g. …" example) and receives `aria-describedby` automatically.
   */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/**
 * Wraps a single form control with a real label and an always-visible,
 * associated description. The concrete example lives in the control's own
 * `placeholder`; GuidedField owns the label + description + `aria-describedby`
 * wiring only.
 */
export function GuidedField({
  controlId,
  description,
  label,
  children,
}: GuidedFieldProps) {
  const descriptionId = `${controlId}-description`;
  const control = Children.only(children);
  const describedControl = isValidElement(control)
    ? cloneElement(control, {
        'aria-describedby': [descriptionId, control.props['aria-describedby']]
          .filter(Boolean)
          .join(' '),
      })
    : control;

  return (
    <div className="studio-guided-field">
      <label className="studio-guided-field__label" htmlFor={controlId}>
        {label}
      </label>
      <p className="studio-guided-field__description" id={descriptionId}>
        {description}
      </p>
      {describedControl}
    </div>
  );
}
