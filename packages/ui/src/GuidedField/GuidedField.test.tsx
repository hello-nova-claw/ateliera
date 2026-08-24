import { render, screen } from '@testing-library/react';
import { GuidedField } from './GuidedField';

it('renders the label as the control accessible name', () => {
  render(
    <GuidedField
      controlId="note"
      description="What belongs here."
      label="Quick note"
    >
      <textarea id="note" />
    </GuidedField>,
  );
  expect(screen.getByRole('textbox', { name: 'Quick note' })).toBeVisible();
});

it('shows the description and associates it with the control', () => {
  render(
    <GuidedField
      controlId="note"
      description="Anything you want the Studio to hold."
      label="Quick note"
    >
      <textarea id="note" />
    </GuidedField>,
  );
  const control = screen.getByRole('textbox', { name: 'Quick note' });
  const description = screen.getByText('Anything you want the Studio to hold.');
  expect(description).toBeVisible();
  expect(control).toHaveAccessibleDescription(
    'Anything you want the Studio to hold.',
  );
  expect(control.getAttribute('aria-describedby')).toBe(description.id);
});

it('renders the caller-provided control as its children', () => {
  render(
    <GuidedField controlId="pick" description="Choose one." label="Meaning">
      <select id="pick">
        <option>Reflection</option>
      </select>
    </GuidedField>,
  );
  expect(screen.getByRole('combobox', { name: 'Meaning' })).toBeVisible();
});

it('preserves an existing aria-describedby on the control', () => {
  render(
    <GuidedField controlId="note" description="What belongs here." label="Note">
      <textarea aria-describedby="extra-hint" id="note" />
    </GuidedField>,
  );
  const control = screen.getByRole('textbox', { name: 'Note' });
  const description = screen.getByText('What belongs here.');
  expect(control.getAttribute('aria-describedby')).toBe(
    `${description.id} extra-hint`,
  );
});
