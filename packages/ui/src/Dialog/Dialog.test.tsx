import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

it('closes with Escape and returns focus to its trigger', () => {
  const onClose = vi.fn();
  const trigger = document.createElement('button');
  trigger.textContent = 'Open';
  document.body.append(trigger);
  trigger.focus();

  const { rerender } = render(
    <Dialog isOpen label="A quiet dialog" onClose={onClose}>
      <button type="button">Inside</button>
    </Dialog>,
  );
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  rerender(
    <Dialog isOpen={false} label="A quiet dialog" onClose={onClose}>
      <button type="button">Inside</button>
    </Dialog>,
  );
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it('traps keyboard focus within the dialog', () => {
  render(
    <Dialog isOpen label="Focus test" onClose={() => undefined}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Dialog>,
  );
  const first = screen.getByRole('button', { name: 'First' });
  const last = screen.getByRole('button', { name: 'Last' });
  last.focus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
  expect(first).toHaveFocus();
});
