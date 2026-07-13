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
});
