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

  const fullAlmanac = {
    moonPhase: 'full' as const,
    illumination: 1,
    season: 'summer' as const,
    microSeason: { term: 'Greater Heat', gloss: 'everything ripening' },
    cycle: { day: 23, phase: 'luteal' as const },
    orientation: 'inward' as const,
  };

  it('hides the turning-year layer but keeps the moon when micro-season is off', () => {
    render(
      <TodaysAlmanac
        almanac={fullAlmanac}
        layers={{ moon: true, microSeason: false, cycle: true }}
      />,
    );
    expect(screen.queryByText('Greater Heat')).not.toBeInTheDocument();
    expect(screen.queryByText('Season')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Today's rhythm" })).toBeInTheDocument();
    expect(screen.getByText(/Full · 100% lit/)).toBeInTheDocument();
  });

  it('hides the moon fact when the moon layer is off', () => {
    render(
      <TodaysAlmanac
        almanac={fullAlmanac}
        layers={{ moon: false, microSeason: true, cycle: true }}
      />,
    );
    expect(screen.queryByText('Moon')).not.toBeInTheDocument();
    expect(screen.getByText('Greater Heat')).toBeInTheDocument();
  });

  it('hides the cycle fact when the cycle layer is off', () => {
    render(
      <TodaysAlmanac
        almanac={fullAlmanac}
        layers={{ moon: true, microSeason: true, cycle: false }}
      />,
    );
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
  });

  it('renders nothing when every layer is off', () => {
    const { container } = render(
      <TodaysAlmanac
        almanac={fullAlmanac}
        layers={{ moon: false, microSeason: false, cycle: false }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
