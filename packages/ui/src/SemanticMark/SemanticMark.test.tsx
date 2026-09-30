import { render, screen } from '@testing-library/react';
import { SemanticMark } from './SemanticMark';

describe('SemanticMark', () => {
  it('does not rely on color to communicate Vision', () => {
    render(<SemanticMark type="vision" labelMode="visible" />);

    expect(screen.getByText('Vision')).toBeVisible();
  });

  it('provides an accessible name when its label is visually hidden', () => {
    render(<SemanticMark type="growth" />);

    expect(screen.getByText('Growth')).toHaveClass('visually-hidden');
  });

  it('draws the meaning-specific line glyph inside a decorative badge', () => {
    const { container } = render(<SemanticMark type="growth" labelMode="visible" />);

    expect(container.querySelector('.studio-icon--leaf')).not.toBeNull();
    expect(container.querySelector('.semantic-mark__badge')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('maps reflection to the moon glyph', () => {
    const { container } = render(<SemanticMark type="reflection" />);

    expect(container.querySelector('.studio-icon--moon')).not.toBeNull();
  });
});
