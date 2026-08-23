import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TodaysAlmanac } from './TodaysAlmanac';

describe('TodaysAlmanac', () => {
  it('shows the micro-season, orientation, felt season, and moon', () => {
    render(
      <TodaysAlmanac
        almanac={{
          moonPhase: 'waxing-crescent',
          illumination: 0.18,
          season: 'winter',
          microSeason: {
            term: 'Lesser Cold',
            gloss: 'deep stillness, the year at its quietest',
          },
          orientation: 'outward',
        }}
      />,
    );
    expect(screen.getByText('Lesser Cold')).toBeInTheDocument();
    expect(screen.getByText(/deep stillness/)).toBeInTheDocument();
    expect(screen.getByText(/An opening day/)).toBeInTheDocument();
    expect(screen.getByText(/Winter/)).toBeInTheDocument();
    expect(screen.getByText(/Waxing crescent/)).toBeInTheDocument();
  });

  it('shows the cycle when the almanac carries one', () => {
    render(
      <TodaysAlmanac
        almanac={{
          moonPhase: 'full',
          illumination: 1,
          season: 'summer',
          microSeason: { term: 'Greater Heat', gloss: 'everything ripening' },
          cycle: { day: 23, phase: 'luteal' },
          orientation: 'inward',
        }}
      />,
    );
    expect(screen.getByText(/A gathering day/)).toBeInTheDocument();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
    expect(screen.getByText(/Day 23 · Luteal/)).toBeInTheDocument();
  });

  it('omits the cycle fact when there is none', () => {
    render(
      <TodaysAlmanac
        almanac={{
          moonPhase: 'new',
          illumination: 0,
          season: 'summer',
          microSeason: { term: 'Start of Autumn', gloss: 'a first cool edge' },
          orientation: 'outward',
        }}
      />,
    );
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no almanac', () => {
    const { container } = render(<TodaysAlmanac />);
    expect(container).toBeEmptyDOMElement();
  });
});
