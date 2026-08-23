import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TodaysAlmanac } from './TodaysAlmanac';

describe('TodaysAlmanac', () => {
  it('shows the micro-season, felt season, and moon', () => {
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
        }}
      />,
    );
    expect(screen.getByText('Lesser Cold')).toBeInTheDocument();
    expect(screen.getByText(/deep stillness/)).toBeInTheDocument();
    expect(screen.getByText(/Winter/)).toBeInTheDocument();
    expect(screen.getByText(/Waxing crescent/)).toBeInTheDocument();
  });

  it('renders nothing when there is no almanac', () => {
    const { container } = render(<TodaysAlmanac />);
    expect(container).toBeEmptyDOMElement();
  });
});
