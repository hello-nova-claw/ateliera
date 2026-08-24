import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoomRevealInvitation } from './RoomRevealInvitation';

describe('RoomRevealInvitation', () => {
  const copy = 'There is a room for who you are becoming — Identity Studio.';

  it('announces the offer through a polite live region, not a modal dialog', () => {
    render(<RoomRevealInvitation copy={copy} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    const region = screen.getByRole('complementary');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('offers exactly two plain actions: open it, or not yet', () => {
    render(<RoomRevealInvitation copy={copy} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Open it', 'Not yet']);
  });

  it('calls onAccept when the person opens the room', () => {
    const accept = vi.fn();
    render(<RoomRevealInvitation copy={copy} onAccept={accept} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(accept).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when the person is not yet ready', () => {
    const dismiss = vi.fn();
    render(<RoomRevealInvitation copy={copy} onAccept={vi.fn()} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('disables its actions while a choice is being remembered', () => {
    render(
      <RoomRevealInvitation busy copy={copy} onAccept={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Open it' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeDisabled();
  });
});
