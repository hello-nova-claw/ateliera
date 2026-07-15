import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UnchartedProjection } from '@studio/application';
import { vi } from 'vitest';

import { UnchartedPage } from './UnchartedPage';
import { tourExamples } from '../onboarding/tour-examples';

const model: UnchartedProjection = {
  cards: [
    {
      noteId: 'near',
      path: 'Uncharted/near.md',
      hash: 'near-hash',
      title: 'A week beside the sea',
      excerpt: 'I wonder what would become clear with more horizon.',
      semanticType: 'uncharted',
      cardType: 'possibility',
      status: 'active',
      updated: '2026-07-14T00:00:00.000Z',
      horizon: 'near',
      seasons: [],
    },
    {
      noteId: 'beyond',
      path: 'Uncharted/beyond.md',
      hash: 'beyond-hash',
      title: 'A place I cannot name yet',
      excerpt: 'There is only a gate and a feeling of open country.',
      semanticType: 'uncharted',
      cardType: 'possibility',
      status: 'active',
      updated: '2026-07-13T00:00:00.000Z',
      horizon: 'beyond',
      seasons: [],
    },
  ],
};

it('places temporary possibilities at their authentic horizons', () => {
  const onUseTourExample = vi.fn();
  render(
    <UnchartedPage
      model={{ cards: [] }}
      onUseTourExample={onUseTourExample}
      tourExamples={tourExamples.uncharted}
    />,
  );
  expect(screen.getAllByText('A glimpse of what could live here')).toHaveLength(
    1,
  );
  expect(screen.getByLabelText('Example Near card')).toBeVisible();
  expect(screen.getByLabelText('Example Beyond the Gate card')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: /Use Near as a starting point/ }),
  );
  expect(onUseTourExample).toHaveBeenCalledWith(
    tourExamples.uncharted[0],
    expect.any(HTMLButtonElement),
  );
});

it('keeps Uncharted spacious and free of execution pressure', () => {
  render(<UnchartedPage model={model} />);
  expect(screen.getByRole('heading', { name: 'What if…?' })).toBeVisible();
  expect(screen.getByText('Near possibilities')).toBeVisible();
  expect(screen.getByText('Beyond the gate')).toBeVisible();
  expect(
    screen.getByText('A place I cannot name yet').closest('article'),
  ).toHaveClass('uncharted-card--beyond');
  expect(document.body).not.toHaveTextContent(
    /\b(?:due|overdue|progress|streak|deadline|status)\b/i,
  );
});

it('captures a possibility and can leave it beyond the gate', async () => {
  const onCapture = vi.fn(async () => undefined);
  render(<UnchartedPage model={{ cards: [] }} onCapture={onCapture} />);
  fireEvent.change(screen.getByLabelText('What if…'), {
    target: { value: 'I made a place for a recurring childhood hill.' },
  });
  fireEvent.click(screen.getByLabelText('Leave this beyond the gate'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep this possibility' }),
  );
  expect(onCapture).toHaveBeenCalledWith(
    'I made a place for a recurring childhood hill.',
    'beyond',
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Remembered');
});

it('invites by link while retaining the visible Uncharted meaning', async () => {
  const onInvite = vi.fn(async () => undefined);
  render(
    <UnchartedPage
      activeSeason={{ id: '2026-winter', title: 'Making room' }}
      model={model}
      onInvite={onInvite}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Invite A week beside the sea into Making room',
    }),
  );
  await waitFor(() => expect(onInvite).toHaveBeenCalledWith(model.cards[0]));
  expect(screen.getAllByText('Uncharted').length).toBeGreaterThan(0);
});

it('keeps a failed invitation visible and focused for retry', async () => {
  const onInvite = vi.fn(async () => {
    throw new Error('Another version exists.');
  });
  render(
    <UnchartedPage
      activeSeason={{ id: '2026-winter', title: 'Making room' }}
      model={model}
      onInvite={onInvite}
    />,
  );
  const invite = screen.getByRole('button', {
    name: 'Invite A week beside the sea into Making room',
  });
  fireEvent.click(invite);
  expect(await screen.findByText('Another version exists.')).toBeVisible();
  await waitFor(() => expect(invite).toHaveFocus());
  expect(screen.getByText('A week beside the sea')).toBeVisible();
});

it('guards a card against rapid duplicate invitations without losing focus', async () => {
  let resolveInvite!: () => void;
  const pending = new Promise<void>((resolve) => {
    resolveInvite = resolve;
  });
  const onInvite = vi.fn(() => pending);
  render(
    <UnchartedPage
      activeSeason={{ id: '2026-winter', title: 'Making room' }}
      model={model}
      onInvite={onInvite}
    />,
  );
  const invite = screen.getByRole('button', {
    name: 'Invite A week beside the sea into Making room',
  });
  invite.focus();
  fireEvent.click(invite);
  fireEvent.click(invite);
  expect(invite).toBeDisabled();
  expect(onInvite).toHaveBeenCalledTimes(1);
  resolveInvite();
  await waitFor(() => expect(invite).not.toBeDisabled());
  expect(invite).toHaveFocus();
});

it('preserves the room structure through loading, stale and repair states', () => {
  const view = render(<UnchartedPage model={{ cards: [] }} state="loading" />);
  expect(screen.getByRole('status')).toHaveTextContent('Gathering Uncharted');
  view.rerender(<UnchartedPage model={model} state="stale" />);
  expect(screen.getByRole('status')).toHaveTextContent('what is here');
  view.rerender(
    <UnchartedPage
      error="One possibility needs metadata repair. Its words remain untouched."
      model={model}
      state="error"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('words remain untouched');
  expect(screen.getByRole('heading', { name: 'What if…?' })).toBeVisible();
});
