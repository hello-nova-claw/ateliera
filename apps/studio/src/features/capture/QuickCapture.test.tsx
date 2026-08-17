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

it('copies a tour starting point into an ordinary editable draft', () => {
  render(
    <QuickCapture
      capture={vi.fn()}
      initialBody="Someone who creates from calm."
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );

  const body = screen.getByRole('textbox', {
    name: 'What would you like remembered?',
  });
  expect(body).toHaveValue('Someone who creates from calm.');
  fireEvent.change(body, { target: { value: 'My own words.' } });
  expect(body).toHaveValue('My own words.');
  expect(screen.queryByText('Example')).not.toBeInTheDocument();
});

it('keeps the thought visible and explains when local storage is unavailable', async () => {
  render(
    <QuickCapture
      capture={vi
        .fn()
        .mockRejectedValue(new Error('local storage unavailable'))}
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
    <QuickCapture
      capture={capture}
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Meaning (optional)')).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Place later' })).toBeVisible();
  expect(screen.getByText(/meaning is the colour lens/i)).toBeVisible();
  expect(
    screen.getByRole('option', { name: 'Vision — what I am creating' }),
  ).toBeVisible();
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

it('shows a contextually inferred meaning while preserving a safe override', () => {
  render(
    <QuickCapture
      capture={vi.fn()}
      initialSemanticType="uncharted"
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('Meaning (optional)')).toHaveValue('uncharted');
  expect(
    screen.getByText('Suggested from where you opened capture.'),
  ).toBeVisible();
  expect(screen.getByLabelText('Meaning (optional)')).not.toBeDisabled();
});

it('locks exact structural meaning so a Landscape card cannot contradict its anchor', () => {
  render(
    <QuickCapture
      capture={vi.fn()}
      initialSemanticType="vision"
      meaningLocked
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('Meaning (optional)')).toHaveValue('vision');
  expect(screen.getByLabelText('Meaning (optional)')).toBeDisabled();
  expect(
    screen.getByText('This meaning belongs to the place you are adding it.'),
  ).toBeVisible();
});

it('authors a decision horizon when capturing into a Landscape decision', async () => {
  const capture = vi.fn().mockResolvedValue({
    note: { id: 'decision', body: 'Choose childcare support' },
    path: 'Life Landscape/family/choose-childcare-support.md',
    hash: 'decision-hash',
  });
  render(
    <QuickCapture
      capture={capture}
      decisionHorizon
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Decision horizon'), {
    target: { value: '60d' },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    {
      target: { value: 'Choose childcare support' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  await waitFor(() =>
    expect(capture).toHaveBeenCalledWith({
      body: 'Choose childcare support',
      decisionHorizon: '60d',
    }),
  );
});
