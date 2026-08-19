import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TodaysGift } from './TodaysGift';

describe('TodaysGift', () => {
  it('renders a dream Gift with a Keep action', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'dream',
          payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway leads somewhere new.' },
          body: 'A door in the hallway leads somewhere new.',
          sourcePath: 'Uncharted/dream-1.md',
          intervalDays: 5,
        }}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'A door in the hallway.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A door in the hallway leads somewhere new.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('renders a resurfaced Gift with a Keep action', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'resurfaced',
          payload: {
            title: 'You did the thing you doubted you could.',
            excerpt: 'You did the thing you doubted you could, and it mattered.',
          },
          body: 'You did the thing you doubted you could, and it mattered.',
          sourcePath: 'Reflection Garden/evidence-1.md',
          intervalDays: 3,
        }}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByText('You did the thing you doubted you could, and it mattered.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('renders the calm fallback without a Keep action', () => {
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

  it('calls onKeep when the Keep button is clicked', async () => {
    const onKeep = vi.fn();
    render(
      <TodaysGift
        gift={{
          kind: 'dream',
          payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
          body: 'A door in the hallway.',
          sourcePath: 'Uncharted/dream-1.md',
          intervalDays: 5,
        }}
        onKeep={onKeep}
      />,
    );
    screen.getByRole('button', { name: 'Keep' }).click();
    expect(onKeep).toHaveBeenCalled();
  });

  it('disables the Keep button and shows "Keeping…" while busy', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'dream',
          payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
          body: 'A door in the hallway.',
          sourcePath: 'Uncharted/dream-1.md',
          intervalDays: 5,
        }}
        onKeep={vi.fn()}
        keepState="busy"
      />,
    );
    const button = screen.getByRole('button', { name: 'Keeping…' });
    expect(button).toBeDisabled();
  });

  it('shows the keep error message when keeping fails', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'dream',
          payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
          body: 'A door in the hallway.',
          sourcePath: 'Uncharted/dream-1.md',
          intervalDays: 5,
        }}
        onKeep={vi.fn()}
        keepState="error"
        keepError="This gift could not be kept just now."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This gift could not be kept just now.',
    );
  });

  it('shows a success confirmation once kept', () => {
    render(
      <TodaysGift
        gift={{
          kind: 'dream',
          payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
          body: 'A door in the hallway.',
          sourcePath: 'Uncharted/dream-1.md',
          intervalDays: 5,
        }}
        onKeep={vi.fn()}
        keepState="success"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Kept.');
  });
});
