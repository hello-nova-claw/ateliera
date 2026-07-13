import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuickCapture } from './QuickCapture';

it('captures a body-only thought and returns a quiet completion message', async () => {
  const capture = vi.fn().mockResolvedValue({
    note: { id: 'n1', body: 'The childhood hill' },
    path: 'Inbox/the-childhood-hill.md',
    hash: 'hash',
  });
  const onRemembered = vi.fn();
  render(
    <QuickCapture
      capture={capture}
      onCancel={vi.fn()}
      onRemembered={onRemembered}
    />,
  );

  const body = screen.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  expect(body).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Remember' })).toBeDisabled();
  fireEvent.change(body, { target: { value: 'The childhood hill' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  await waitFor(() =>
    expect(capture).toHaveBeenCalledWith({ body: 'The childhood hill' }),
  );
  expect(onRemembered).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'Inbox/the-childhood-hill.md' }),
  );
});

it('keeps the thought visible and explains when local storage is unavailable', async () => {
  render(
    <QuickCapture
      capture={vi.fn().mockRejectedValue(new Error('local storage unavailable'))}
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );
  const body = screen.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  fireEvent.change(body, { target: { value: 'Keep me safe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'local storage unavailable',
  );
  expect(body).toHaveValue('Keep me safe');
});

it('keeps Place later as the default and optionally captures semantic meaning', async () => {
  const capture = vi.fn().mockResolvedValue({
    note: { id: 'n1', body: 'A wild possibility' },
    path: 'Inbox/a-wild-possibility.md',
    hash: 'hash',
  });
  render(
    <QuickCapture capture={capture} onCancel={vi.fn()} onRemembered={vi.fn()} />,
  );
  expect(screen.getByLabelText('Meaning (optional)')).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Place later' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Meaning (optional)'), {
    target: { value: 'uncharted' },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'A wild possibility' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  await waitFor(() =>
    expect(capture).toHaveBeenCalledWith({
      body: 'A wild possibility',
      semanticType: 'uncharted',
    }),
  );
});
