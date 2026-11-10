import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReflectionGardenProjection } from '@studio/application';
import { vi } from 'vitest';

import { ReflectionPage } from './ReflectionPage';
import { tourExamples } from '../onboarding/tour-examples';

const model: ReflectionGardenProjection = {
  cards: [
    {
      noteId: 'now',
      path: 'Reflection Garden/Reflections/now.md',
      hash: 'now-hash',
      title: 'I returned without making it a failure',
      excerpt: 'The interruption did not erase the practice.',
      semanticType: 'reflection',
      cardType: 'reflection',
      status: 'active',
      updated: '2026-07-14T09:00:00.000Z',
      created: '2026-07-14T09:00:00.000Z',
      lifeAreas: ['family'],
      seasons: ['2026-winter'],
      tags: ['calm'],
      linkedNoteIds: ['identity-1'],
      evidenceConnections: [
        {
          kind: 'life-area',
          id: 'family',
          label: 'Family',
          targetState: 'available',
        },
        {
          kind: 'season',
          id: '2026-winter',
          label: 'Winter 2026',
          targetState: 'available',
        },
        { kind: 'note', id: 'identity-1', targetState: 'available' },
      ],
      thenNoteId: 'then',
    },
    {
      noteId: 'then',
      path: 'Reflection Garden/Celebrations/then.md',
      hash: 'then-hash',
      title: 'A morning that held',
      excerpt: 'Fifteen minutes still counted.',
      semanticType: 'celebration',
      cardType: 'celebration',
      status: 'active',
      updated: '2025-07-14T09:00:00.000Z',
      created: '2025-07-14T09:00:00.000Z',
      lifeAreas: [],
      seasons: [],
      tags: ['calm'],
      linkedNoteIds: [],
      evidenceConnections: [],
    },
  ],
  themes: [{ name: 'calm', count: 2 }],
};

it('shows the temporary reflection and celebration as a Then and Now pairing', () => {
  render(
    <ReflectionPage
      model={{ cards: [], themes: [] }}
      tourExamples={tourExamples.reflection}
    />,
  );
  expect(screen.getByText('A glimpse of what could live here')).toBeVisible();
  const preview = screen.getByRole('region', { name: 'Example Then and now' });
  expect(
    within(preview).getByLabelText('Example Reflection card'),
  ).toBeVisible();
  expect(
    within(preview).getByLabelText('Example Celebration card'),
  ).toBeVisible();
  expect(within(preview).queryByRole('time')).not.toBeInTheDocument();
});

it('offers Garden, Reflection, Celebration and Themes without a heatmap', () => {
  render(<ReflectionPage model={model} />);
  expect(
    screen.getByRole('tablist', { name: 'Reflection Garden view' }),
  ).toBeVisible();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  const stream = screen.getByRole('region', { name: 'Garden entries' });
  expect(
    within(stream)
      .getByText('I returned without making it a failure')
      .closest('article'),
  ).toHaveClass('reflection-entry--reflection');
  expect(
    within(stream).getByText('A morning that held').closest('article'),
  ).toHaveClass('reflection-entry--celebration');
  expect(screen.queryByText(/heatmap|streak/i)).not.toBeInTheDocument();
});

it('keeps the view filters in the aside with quiet counts', () => {
  render(<ReflectionPage model={model} />);
  const aside = screen.getByRole('complementary', {
    name: 'Reflection Garden views',
  });
  expect(within(aside).getByRole('tablist')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Garden' })).toHaveTextContent('2');
  expect(screen.getByRole('tab', { name: 'Celebration' })).toHaveTextContent(
    '1',
  );
});

it('filters the stream and reveals a deterministic theme reading view', () => {
  render(<ReflectionPage model={model} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Celebration' }));
  expect(screen.getByText('A morning that held')).toBeVisible();
  expect(
    screen.queryByText('I returned without making it a failure'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Themes' }));
  fireEvent.click(screen.getByRole('button', { name: 'calm, 2 entries' }));
  expect(
    screen.getByText('I returned without making it a failure'),
  ).toBeVisible();
  expect(screen.getByText('A morning that held')).toBeVisible();
});

it('captures a one-sentence reflection and supports opening the full editor', async () => {
  const onCapture = vi.fn(async () => undefined);
  render(<ReflectionPage model={model} onCapture={onCapture} />);
  fireEvent.change(screen.getByLabelText('A sentence to keep'), {
    target: {
      value: 'I noticed that five quiet minutes changed the afternoon.',
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep reflection' }));
  await waitFor(() =>
    expect(onCapture).toHaveBeenCalledWith(
      'reflection',
      'I noticed that five quiet minutes changed the afternoon.',
      false,
      expect.any(HTMLButtonElement),
    ),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Remembered');
  expect(
    screen.getByText(
      'One thing you noticed, learned, or want to remember. A single sentence is plenty.',
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('A sentence to keep')).toHaveAttribute(
    'placeholder',
    'e.g. I do my clearest thinking in the first hour, before messages.',
  );

  fireEvent.change(screen.getByLabelText('A sentence to keep'), {
    target: { value: 'There is more I want to explore.' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue in the editor' }),
  );
  await waitFor(() =>
    expect(onCapture).toHaveBeenLastCalledWith(
      'reflection',
      'There is more I want to explore.',
      true,
      expect.any(HTMLButtonElement),
    ),
  );
});

it('shows linked evidence and an optional Then & now pair', () => {
  render(
    <ReflectionPage
      connections={[
        { id: 'family', kind: 'life-area', label: 'Family' },
        { id: '2026-winter', kind: 'season', label: 'Winter 2026' },
        { id: 'identity-1', kind: 'note', label: 'Creates from calm' },
      ]}
      model={model}
    />,
  );
  expect(
    screen.getByRole('region', { name: 'Then and now' }),
  ).toHaveTextContent('A morning that held');
  expect(
    screen.getByLabelText(
      'Connections for I returned without making it a failure',
    ),
  ).toHaveTextContent('Family');
});

it('keeps same-label canonical evidence distinct and opens the exact target', async () => {
  const onOpenConnection = vi.fn();
  const duplicateEvidence = {
    ...model.cards[0]!,
    linkedNoteIds: ['identity-1', 'identity-2'],
    evidenceConnections: [
      {
        kind: 'note' as const,
        id: 'identity-1',
        targetState: 'available' as const,
      },
      {
        kind: 'note' as const,
        id: 'identity-2',
        targetState: 'available' as const,
      },
    ],
  };
  render(
    <ReflectionPage
      connections={[
        { id: 'identity-1', kind: 'note', label: 'Creates from calm' },
        { id: 'identity-2', kind: 'note', label: 'Creates from calm' },
      ]}
      model={{ cards: [duplicateEvidence], themes: [] }}
      onOpenConnection={onOpenConnection}
    />,
  );
  const first = screen.getByRole('button', {
    name: 'Open Creates from calm, identity-1',
  });
  const second = screen.getByRole('button', {
    name: 'Open Creates from calm, identity-2',
  });
  fireEvent.click(second);
  await waitFor(() =>
    expect(onOpenConnection).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'note', id: 'identity-2' }),
      second,
    ),
  );
  expect(first).toBeVisible();
});

it('serializes evidence opening and preserves exact focus when click-time validation fails', async () => {
  let rejectOpen!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, reject) => {
    rejectOpen = reject;
  });
  const onOpenConnection = vi.fn(() => pending);
  render(
    <ReflectionPage
      connections={[{ id: 'family', kind: 'life-area', label: 'Family' }]}
      model={{ cards: [model.cards[0]!], themes: [] }}
      onOpenConnection={onOpenConnection}
    />,
  );
  const evidence = screen.getByRole('button', { name: 'Open Family, family' });
  evidence.focus();
  fireEvent.click(evidence);
  fireEvent.click(evidence);
  expect(onOpenConnection).toHaveBeenCalledTimes(1);
  expect(evidence).toBeDisabled();
  rejectOpen(
    new Error('The connected life area Family is no longer available.'),
  );
  expect(
    await screen.findByText(
      'The connected life area Family is no longer available.',
    ),
  ).toBeVisible();
  await waitFor(() => expect(evidence).not.toBeDisabled());
  expect(evidence).toHaveFocus();
});

it('leaves missing and archived evidence visible as calm repair states', () => {
  render(
    <ReflectionPage
      model={{
        cards: [
          {
            ...model.cards[0]!,
            evidenceConnections: [
              { kind: 'note', id: 'gone', targetState: 'missing' },
              { kind: 'note', id: 'resting', targetState: 'archived' },
              {
                kind: 'life-area',
                id: 'old-home',
                label: 'Old Home',
                targetState: 'archived',
              },
              { kind: 'life-area', id: 'lost-area', targetState: 'missing' },
              {
                kind: 'season',
                id: 'past-season',
                label: 'A Past Season',
                targetState: 'archived',
              },
              { kind: 'season', id: 'lost-season', targetState: 'missing' },
            ],
            linkedNoteIds: ['gone', 'resting'],
          },
        ],
        themes: [],
      }}
    />,
  );
  expect(
    screen.getByText('The connected note gone is not available here.'),
  ).toBeVisible();
  expect(
    screen.getByText('The connected note resting is archived.'),
  ).toBeVisible();
  expect(
    screen.getByText('The connected life area Old Home is archived.'),
  ).toBeVisible();
  expect(
    screen.getByText(
      'The connected life area lost-area is not available here.',
    ),
  ).toBeVisible();
  expect(
    screen.getByText('The connected season A Past Season is historical.'),
  ).toBeVisible();
  expect(
    screen.getByText('The connected season lost-season is not available here.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', {
      name: /Open.*(?:gone|resting|old-home|lost-area|past-season|lost-season)/,
    }),
  ).not.toBeInTheDocument();
});

it('guards rapid evidence writes and preserves selection and exact focus on failure', async () => {
  let rejectConnection!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, reject) => {
    rejectConnection = reject;
  });
  const onConnect = vi.fn(() => pending);
  render(
    <ReflectionPage
      connections={[
        { id: 'identity-2', kind: 'note', label: 'Creates from calm' },
      ]}
      model={{ cards: [model.cards[0]!], themes: [] }}
      onConnect={onConnect}
    />,
  );
  const select = screen.getByLabelText('Connect evidence');
  fireEvent.change(select, { target: { value: 'note:identity-2' } });
  const connect = screen.getByRole('button', { name: 'Connect' });
  connect.focus();
  fireEvent.click(connect);
  fireEvent.click(connect);
  expect(connect).toBeDisabled();
  expect(onConnect).toHaveBeenCalledTimes(1);
  rejectConnection(new Error('Another version exists.'));
  expect(await screen.findByText('Another version exists.')).toBeVisible();
  await waitFor(() => expect(connect).not.toBeDisabled());
  expect(select).toHaveValue('note:identity-2');
  expect(connect).toHaveFocus();
});

it('keeps recoverable loading, offline, stale and malformed states calm', () => {
  const view = render(
    <ReflectionPage model={{ cards: [], themes: [] }} state="loading" />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Gathering the garden');
  view.rerender(<ReflectionPage model={model} state="offline" />);
  expect(screen.getByRole('status')).toHaveTextContent('Stored locally');
  view.rerender(<ReflectionPage model={model} state="stale" />);
  expect(screen.getByRole('status')).toHaveTextContent('what is here');
  view.rerender(
    <ReflectionPage
      error="One entry needs metadata repair. Its words remain untouched."
      model={model}
      state="error"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('words remain untouched');
});

it('shows a quiet image repair state without rendering a raw vault reference', () => {
  render(
    <ReflectionPage
      imageUnavailableIds={new Set(['now'])}
      model={{
        ...model,
        cards: [
          {
            ...model.cards[0]!,
            coverReference: '../../Attachments/private.png',
          },
        ],
      }}
    />,
  );
  expect(
    screen.getByText(
      'This image is not available here. The entry remains intact.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('../../Attachments/private.png');
});

it('dates each entry by the day it was written in its own zone', () => {
  // Written at 08:00 in Melbourne, which is still 1 November wherever the test runs
  // west of it.
  const card = {
    ...model.cards[0]!,
    noteId: 'melbourne-morning',
    created: '2026-11-02T08:00:00.000+11:00',
    updated: '2026-11-02T08:00:00.000+11:00',
  };
  const { container } = render(
    <ReflectionPage model={{ ...model, cards: [card] }} />,
  );

  const time = container.querySelector('time[datetime="2026-11-02T08:00:00.000+11:00"]');
  expect(time?.textContent).toBe('2 November 2026');
});
