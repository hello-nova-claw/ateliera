import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { YearWheel } from './YearWheel';

describe('YearWheel', () => {
  it('shows the micro-season and where the wheel stands', () => {
    render(
      <YearWheel
        season="autumn"
        microSeason={{ term: 'Cold Dew', gloss: 'dew turning cold, leaves letting go' }}
      />,
    );
    expect(screen.getByText('The turning year')).toBeVisible();
    expect(screen.getByText('Cold Dew')).toBeVisible();
    expect(screen.getByText(/dew turning cold/)).toBeVisible();
    expect(screen.getByText(/The wheel stands in Autumn\./)).toBeVisible();
  });
});
