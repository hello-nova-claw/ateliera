import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TodaysGift } from './TodaysGift';
import { GIFT_GRADES } from './use-todays-gift';

const dreamGift = {
  kind: 'dream' as const,
  payload: {
    title: 'A door in the hallway.',
    excerpt: 'A door in the hallway leads somewhere new.',
  },
  body: 'A door in the hallway leads somewhere new.',
  sourcePath: 'Uncharted/dream-1.md',
  intervalDays: 5,
};

describe('TodaysGift', () => {
  it('renders a dream Gift with the three recall grades', () => {
    render(<TodaysGift gift={dreamGift} onKeep={vi.fn()} />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'A door in the hallway.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A door in the hallway leads somewhere new.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'This landed deeply' }),
    ).toBeInTheDocument();
  });

  it('renders the calm fallback without any grade actions', () => {
    render(
      <TodaysGift
        gift={{ kind: 'line', payload: { title: 'A quiet place to begin.', excerpt: '' } }}
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

  it('grades each recall with its SM-2 quality', () => {
    const onKeep = vi.fn();
    render(<TodaysGift gift={dreamGift} onKeep={onKeep} />);
    screen.getByRole('button', { name: 'Not now' }).click();
    screen.getByRole('button', { name: 'Keep' }).click();
    screen.getByRole('button', { name: 'This landed deeply' }).click();
    expect(onKeep).toHaveBeenNthCalledWith(1, GIFT_GRADES.notNow);
    expect(onKeep).toHaveBeenNthCalledWith(2, GIFT_GRADES.keep);
    expect(onKeep).toHaveBeenNthCalledWith(3, GIFT_GRADES.deeply);
  });

  it('disables the grade actions while busy', () => {
    render(<TodaysGift gift={dreamGift} onKeep={vi.fn()} keepState="busy" />);
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
  });

  it('shows the keep error message when keeping fails', () => {
    render(
      <TodaysGift
        gift={dreamGift}
        onKeep={vi.fn()}
        keepState="error"
        keepError="This gift could not be kept just now."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This gift could not be kept just now.',
    );
  });

  it('shows the success confirmation message once acted on', () => {
    render(
      <TodaysGift
        gift={dreamGift}
        onKeep={vi.fn()}
        keepState="success"
        keepMessage="Set aside — it will return soon."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Set aside — it will return soon.',
    );
  });
});
