import { fireEvent, render, screen } from '@testing-library/react';
import { ListRow } from './ListRow';

describe('ListRow', () => {
  it('renders a link when given href', () => {
    render(<ListRow href="#open" meta="12 September 2026" title="The power of stillness" />);

    const link = screen.getByRole('link', { name: /The power of stillness/ });
    expect(link).toHaveAttribute('href', '#open');
  });

  it('renders a button that fires onOpen when no href', () => {
    const onOpen = vi.fn();
    render(<ListRow onOpen={onOpen} title="Lessons from a difficult season" />);

    fireEvent.click(screen.getByRole('button', { name: /Lessons from a difficult season/ }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows the thumbnail as decorative when a source is given', () => {
    const { container } = render(
      <ListRow thumbSrc="photo.jpg" title="A conversation that stayed" onOpen={() => {}} />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
  });
});
