import type {
  CaptureNoteInput,
  WisdomGardenProjection,
  WisdomThemePreference,
} from '@studio/application';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { vi } from 'vitest';

import { WisdomPage } from './WisdomPage';

const themes: WisdomThemePreference[] = [
  { id: 'identity', title: 'Identity', hidden: false, order: 0 },
  { id: 'rest', title: 'Rest', hidden: false, order: 1 },
];

const model: WisdomGardenProjection = {
  themes: [
    { id: 'identity', title: 'Identity', count: 2 },
    { id: 'rest', title: 'Rest', count: 0 },
  ],
  cards: [
    {
      noteId: 'source-one',
      path: 'Wisdom Garden/one.md',
      hash: 'one',
      title: 'Identity can be practiced',
      excerpt: 'A useful idea.',
      semanticType: 'reflection',
      cardType: 'quote',
      status: 'active',
      updated: '2026-07-16T00:00:00.000Z',
      themes: ['identity'],
      source: { creator: 'A thoughtful teacher', title: 'A useful book' },
      sourceNoteIds: [],
    },
    {
      noteId: 'source-two',
      path: 'Wisdom Garden/two.md',
      hash: 'two',
      title: 'Support makes identity durable',
      excerpt: 'Structure matters.',
      semanticType: 'foundations',
      cardType: 'principle',
      status: 'active',
      updated: '2026-07-15T00:00:00.000Z',
      themes: ['identity'],
      sourceNoteIds: [],
    },
  ],
};

it('reads by theme, preserves type and source, and opens a note', () => {
  const onOpen = vi.fn();
  render(<WisdomPage model={model} onOpen={onOpen} themes={themes} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Wisdom Garden' }),
  ).toBeVisible();
  expect(screen.getByText('Quote')).toBeVisible();
  expect(
    screen.getByText('A thoughtful teacher · A useful book'),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open Identity can be practiced' }),
  );
  expect(onOpen).toHaveBeenCalledWith(
    model.cards[0],
    expect.any(HTMLButtonElement),
  );
});

it('keeps unthemed and imported-theme notes reachable through All ideas', () => {
  render(
    <WisdomPage
      model={{
        ...model,
        cards: [
          ...model.cards,
          {
            ...model.cards[0]!,
            noteId: 'unplaced',
            path: 'Wisdom Garden/unplaced.md',
            title: 'A thought without a configured theme',
            themes: ['imported-theme'],
          },
        ],
      }}
      themes={themes}
    />,
  );

  expect(
    screen.queryByText('A thought without a configured theme'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All ideas' }));
  expect(
    screen.getByText('A thought without a configured theme'),
  ).toBeVisible();
});

it('creates a synthesis with stable source IDs and readable stable links', async () => {
  const onCapture = vi.fn<(input: CaptureNoteInput) => Promise<void>>(
    async () => undefined,
  );
  render(<WisdomPage model={model} onCapture={onCapture} themes={themes} />);

  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select Identity can be practiced' }),
  );
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Select Support makes identity durable',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Synthesize 2 notes' }));
  fireEvent.change(screen.getByLabelText('Synthesis title'), {
    target: { value: 'Identity needs practical support' },
  });
  fireEvent.change(screen.getByLabelText('What connects these ideas?'), {
    target: { value: 'Identity becomes durable when daily life can hold it.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep synthesis' }));

  await waitFor(() =>
    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Identity needs practical support',
        wisdom: expect.objectContaining({
          kind: 'synthesis',
          themes: ['identity'],
          sourceNoteIds: ['source-one', 'source-two'],
        }),
        body: expect.stringContaining(
          '[Identity can be practiced](studio://note/source-one)',
        ),
      }),
    ),
  );
  expect(onCapture.mock.calls[0]?.[0].body).toContain(
    '[Support makes identity durable](studio://note/source-two)',
  );
});

it('supports a personal response and editable theme contents', async () => {
  const onCapture = vi.fn<(input: CaptureNoteInput) => Promise<void>>(
    async () => undefined,
  );
  const onSaveThemes = vi.fn(async () => undefined);
  render(
    <WisdomPage
      model={model}
      onCapture={onCapture}
      onSaveThemes={onSaveThemes}
      themes={themes}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Make it mine' }));
  fireEvent.change(screen.getByLabelText('What do you believe?'), {
    target: { value: 'I need practices that fit an ordinary family week.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep my response' }));
  await waitFor(() =>
    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'What I believe about Identity',
        wisdom: { kind: 'insight', themes: ['identity'] },
      }),
    ),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit themes' }));
  const editor = screen.getByRole('region', { name: 'Edit Wisdom themes' });
  fireEvent.change(within(editor).getByDisplayValue('Rest'), {
    target: { value: 'Deep rest' },
  });
  fireEvent.click(within(editor).getByRole('button', { name: 'Save themes' }));
  await waitFor(() =>
    expect(onSaveThemes).toHaveBeenCalledWith([
      themes[0],
      { ...themes[1], title: 'Deep rest' },
    ]),
  );
});

it.each([
  ['loading', 'Gathering the Wisdom Garden…'],
  ['offline', 'Stored locally. The garden remains available offline.'],
  ['repair', 'Some Wisdom Garden settings need repair.'],
  ['error', 'The Wisdom Garden could not be gathered.'],
] as const)('renders the %s state calmly', (state, message) => {
  render(
    <WisdomPage
      model={{ cards: [], themes: [] }}
      state={state}
      themes={themes}
    />,
  );
  expect(screen.getByText(message)).toBeVisible();
});

it('invites the first note without turning emptiness into a metric', () => {
  render(<WisdomPage model={{ cards: [], themes: [] }} themes={themes} />);
  expect(
    screen.getByText('Begin with one idea worth returning to.'),
  ).toBeVisible();
  expect(screen.queryByText(/0 notes/u)).not.toBeInTheDocument();
});

it('guides the idea composer with a description and a ghost example', () => {
  render(<WisdomPage model={model} onCapture={vi.fn()} themes={themes} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add an idea' }));

  expect(screen.getByLabelText('Idea')).toHaveAttribute(
    'placeholder',
    "e.g. You don't rise to your goals; you fall to your systems.",
  );
  expect(
    screen.getByText(
      'The insight, quote, or principle, in your own words or theirs.',
    ),
  ).toBeVisible();
});
