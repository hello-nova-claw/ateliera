import { fireEvent, render, screen } from '@testing-library/react';
import { SeasonTimeline } from './SeasonTimeline';

const seasons = [
  { id: 'spring', name: 'Spring', theme: 'Renewal & growth', dateRange: 'Mar – May 2026' },
  { id: 'summer', name: 'Summer', theme: 'Expansion & joy', dateRange: 'Jun – Aug 2026' },
  { id: 'autumn', name: 'Autumn', theme: 'Integration & release', dateRange: 'Sep – Nov 2026' },
];

describe('SeasonTimeline', () => {
  it('renders each season as an ordered list item', () => {
    render(<SeasonTimeline currentId="autumn" seasons={seasons} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('marks the current season for assistive tech', () => {
    render(<SeasonTimeline currentId="autumn" seasons={seasons} />);

    const current = screen.getByText('Autumn').closest('li');
    expect(current).toHaveAttribute('aria-current', 'true');
  });

  it('fires onSelect with the season id when a season is activated', () => {
    const onSelect = vi.fn();
    render(<SeasonTimeline currentId="spring" onSelect={onSelect} seasons={seasons} />);

    fireEvent.click(screen.getByRole('button', { name: /Summer/ }));

    expect(onSelect).toHaveBeenCalledWith('summer');
  });
});
