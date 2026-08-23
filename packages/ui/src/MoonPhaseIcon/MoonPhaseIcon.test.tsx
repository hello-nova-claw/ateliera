import { render, screen } from '@testing-library/react';
import { MoonPhaseIcon } from './MoonPhaseIcon';

describe('MoonPhaseIcon', () => {
  it('exposes an accessible label when one is given', () => {
    render(
      <MoonPhaseIcon illumination={0.5} litSide="right" label="First quarter" />,
    );
    expect(screen.getByRole('img', { name: 'First quarter' })).toBeInTheDocument();
  });

  it('is decorative when no label is given', () => {
    const { container } = render(
      <MoonPhaseIcon illumination={0.5} litSide="right" />,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws no lit shape for a new moon', () => {
    render(<MoonPhaseIcon illumination={0} litSide="right" label="New moon" />);
    expect(screen.queryByTestId('moon-lit')).not.toBeInTheDocument();
  });

  it('fills the whole disc for a full moon', () => {
    render(<MoonPhaseIcon illumination={1} litSide="right" label="Full moon" />);
    expect(screen.getByTestId('moon-lit').tagName.toLowerCase()).toBe('circle');
  });

  it('draws a terminator path for a partial phase', () => {
    render(
      <MoonPhaseIcon illumination={0.3} litSide="left" label="Waning crescent" />,
    );
    expect(screen.getByTestId('moon-lit').tagName.toLowerCase()).toBe('path');
  });
});
