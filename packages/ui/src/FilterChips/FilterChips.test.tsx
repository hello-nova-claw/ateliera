import { fireEvent, render, screen } from '@testing-library/react';
import { FilterChips } from './FilterChips';

const items = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'images', label: 'Images' },
];

describe('FilterChips', () => {
  it('marks the selected chip as pressed for assistive tech', () => {
    render(<FilterChips items={items} onSelect={() => {}} selectedId="notes" />);

    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the chosen id on click', () => {
    const onSelect = vi.fn();
    render(<FilterChips items={items} onSelect={onSelect} selectedId="all" />);

    fireEvent.click(screen.getByRole('button', { name: 'Images' }));

    expect(onSelect).toHaveBeenCalledWith('images');
  });

  it('groups the chips under an accessible label', () => {
    render(
      <FilterChips
        items={items}
        label="Filter archive"
        onSelect={() => {}}
        selectedId="all"
      />,
    );

    expect(screen.getByRole('group', { name: 'Filter archive' })).toBeInTheDocument();
  });
});
