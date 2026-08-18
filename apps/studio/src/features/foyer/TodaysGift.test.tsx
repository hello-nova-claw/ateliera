import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TodaysGift } from './TodaysGift';

describe('TodaysGift', () => {
  it('renders a dream Gift with a Keep action', () => {
    render(
      <TodaysGift
        gift={{ kind: 'dream', payload: { text: 'A door in the hallway.' } }}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'A door in the hallway.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('renders a resurfaced Gift with a Keep action', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'resurfaced',
          payload: { text: 'You did the thing you doubted you could.' },
        }}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByText('You did the thing you doubted you could.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('renders the calm fallback without a Keep action', () => {
    render(
      <TodaysGift
        gift={{ kind: 'line', payload: { text: 'A quiet place to begin.' } }}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'A quiet place to begin.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();
  });

  it('renders nothing when there is no profile yet', () => {
    const { container } = render(<TodaysGift gift={null} onKeep={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onKeep when the Keep button is clicked', async () => {
    const onKeep = vi.fn();
    render(
      <TodaysGift
        gift={{ kind: 'dream', payload: { text: 'A door in the hallway.' } }}
        onKeep={onKeep}
      />,
    );
    screen.getByRole('button', { name: 'Keep' }).click();
    expect(onKeep).toHaveBeenCalled();
  });
});
