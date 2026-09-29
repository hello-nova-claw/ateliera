import { fireEvent, render, screen } from '@testing-library/react';
import { PromptField } from './PromptField';

const entries = [
  { id: '1', body: 'I need more space than I used to think I did.', date: '14 September 2026' },
];

describe('PromptField', () => {
  it('associates the helper text with the section heading', () => {
    render(
      <PromptField
        entries={entries}
        helper="What feels quietly and honestly true?"
        onAdd={() => {}}
        title="Already true"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Already true' })).toBeVisible();
    expect(
      screen.getByText('What feels quietly and honestly true?'),
    ).toBeVisible();
  });

  it('renders each entry with its date', () => {
    render(<PromptField entries={entries} onAdd={() => {}} title="Already true" />);

    expect(
      screen.getByText('I need more space than I used to think I did.'),
    ).toBeVisible();
    expect(screen.getByText('14 September 2026')).toBeVisible();
  });

  it('fires onAdd when the add control is used', () => {
    const onAdd = vi.fn();
    render(<PromptField entries={entries} onAdd={onAdd} title="Already true" />);

    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(onAdd).toHaveBeenCalledOnce();
  });
});
