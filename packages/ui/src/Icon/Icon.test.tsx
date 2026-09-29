import { render, screen } from '@testing-library/react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('is decorative by default (hidden from assistive tech)', () => {
    const { container } = render(<Icon name="chevron" />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exposes an accessible name when a title is given', () => {
    render(<Icon name="plus" title="Add" />);

    expect(screen.getByRole('img', { name: 'Add' })).toBeVisible();
  });

  it('renders the requested glyph at the requested size', () => {
    const { container } = render(<Icon name="leaf" size={32} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('studio-icon', 'studio-icon--leaf');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('draws on the 24-unit grid so strokes stay aligned', () => {
    const { container } = render(<Icon name="sun" />);

    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '0 0 24 24',
    );
  });
});
