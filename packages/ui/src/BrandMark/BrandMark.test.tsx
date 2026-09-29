import { render, screen } from '@testing-library/react';
import { BrandMark } from './BrandMark';

describe('BrandMark', () => {
  it('names the mark for assistive tech when shown alone', () => {
    render(<BrandMark />);

    expect(screen.getByRole('img', { name: 'Ateliera' })).toBeInTheDocument();
  });

  it('draws seven stars, one of them bright', () => {
    const { container } = render(<BrandMark />);

    expect(container.querySelectorAll('.studio-brand-mark__star')).toHaveLength(7);
    expect(
      container.querySelectorAll('.studio-brand-mark__star--bright'),
    ).toHaveLength(1);
  });

  it('renders the wordmark lockup as real text with the mark decorative', () => {
    const { container } = render(<BrandMark variant="lockup" />);

    expect(screen.getByText('Ateliera')).toBeVisible();
    expect(screen.getByText('STUDIO')).toBeVisible();
    // The glyph is decorative in the lockup; the text carries the name.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the foil tone as a modifier', () => {
    const { container } = render(<BrandMark tone="foil" />);

    expect(container.querySelector('.studio-brand-mark')).toHaveClass(
      'studio-brand-mark--foil',
    );
  });
});
