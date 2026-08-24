import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuickCapture } from './QuickCapture';
import { foyerCaptureGuidance } from './field-guidance';

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
  expect(
    screen.getByText(
      "Anything you want the Studio to hold — a thought, a line, a fragment. It doesn't need to be finished.",
    ),
  ).toBeVisible();
  expect(body).toHaveAttribute(
    'placeholder',
    'e.g. Kept choosing rest today instead of pushing through.',
  );
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

it('speaks in the voice of where capture was opened', () => {
  render(
    <QuickCapture
      capture={vi.fn()}
      guidance={foyerCaptureGuidance['foyer-becoming']}
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );

  expect(
    screen.getByRole('heading', { name: 'Name a becoming' }),
  ).toBeVisible();
  const body = screen.getByRole('textbox', {
    name: 'What are you currently becoming?',
  });
  expect(body).toHaveAttribute(
    'placeholder',
    "e.g. I'm becoming someone who rests before they're depleted.",
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

it('hides a locked meaning entirely, yet still applies it to the capture', async () => {
  const capture = vi.fn().mockResolvedValue({
    note: { id: 'n1', body: 'A calm vision' },
    path: 'Foyer/a-calm-vision.md',
    hash: 'hash',
  });
  render(
    <QuickCapture
      capture={capture}
      initialSemanticType="vision"
      meaningLocked
      onCancel={vi.fn()}
      onRemembered={vi.fn()}
    />,
  );

  // A meaning that can't be changed here is not shown as a disabled control.
  expect(screen.queryByLabelText('Meaning (optional)')).not.toBeInTheDocument();
  expect(
    screen.queryByText('This meaning belongs to the place you are adding it.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/meaning is the colour lens/i),
  ).not.toBeInTheDocument();

  // …but the locked meaning still travels with the saved note.
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'A calm vision' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));
  await waitFor(() =>
    expect(capture).toHaveBeenCalledWith({
      body: 'A calm vision',
      semanticType: 'vision',
    }),
  );
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
