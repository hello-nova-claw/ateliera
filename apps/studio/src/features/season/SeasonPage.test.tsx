import type { SeasonRecord } from '@studio/application';
import { createSeasonDraft, type SeasonWizardStep } from '@studio/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { SeasonPage } from './SeasonPage';
import { tourExamples } from '../onboarding/tour-examples';

function record(overrides = {}): SeasonRecord {
  const state = {
    ...createSeasonDraft('winter', '2026-07-14T00:00:00.000Z'),
    title: 'A spacious winter',
    statement: 'making room',
    status: 'active' as const,
    startsOn: '2026-07-14',
    endsOn: '2026-09-30',
    feelings: ['Calm', 'Curious'],
    priorities: ['Home', 'Studio', 'Family'],
    enough: 'A useful first version.',
    practices: ['Create before consuming'],
    supports: ['Childcare'],
    constraints: ['Energy'],
    notNow: ['A perfect whole-house system'],
    decisions: [
      {
        id: 'd1',
        text: 'Choose the smallest useful scope',
        horizon: '30' as const,
        kind: 'decision' as const,
      },
    ],
    ...overrides,
  };
  return {
    state,
    path: `Current Season/${state.id}.md`,
    hash: 'hash',
    note: {
      schemaVersion: 1,
      id: state.id,
      title: state.title,
      body: '',
      cardType: 'season',
      semanticType: 'growth',
      status: state.status,
      rooms: ['current-season'],
      lifeAreas: [],
      seasons: [],
      tags: [],
      created: state.created,
      updated: state.updated,
      attachments: [],
      display: { featured: false },
      privacy: { sensitivity: 'private', aiAccess: 'ask' },
      extraFrontmatter: { season_id: state.id },
    },
  };
}

it('renders the accepted editorial season cover and keeps Not now collapsed', () => {
  render(<SeasonPage record={record()} state="ready" />);
  expect(
    screen.getByRole('heading', { level: 1, name: 'A spacious winter' }),
  ).toBeVisible();
  expect(screen.getByText('This is a season of making room')).toBeVisible();
  expect(screen.getAllByRole('article', { name: /Priority/ })).toHaveLength(3);
  expect(screen.getByText('A useful first version.')).toBeVisible();
  expect(screen.getByText('A perfect whole-house system')).not.toBeVisible();
  fireEvent.click(screen.getByText('Not now'));
  expect(screen.getByText('A perfect whole-house system')).toBeVisible();
});

it('starts gently from the empty state', () => {
  const onBegin = vi.fn();
  render(<SeasonPage record={null} state="ready" onBegin={onBegin} />);
  fireEvent.click(screen.getByRole('button', { name: 'Begin a season' }));
  expect(onBegin).toHaveBeenCalledOnce();
});

it('furnishes the empty room with a coherent temporary season cover', () => {
  render(
    <SeasonPage
      record={null}
      state="ready"
      tourExamples={tourExamples.season}
    />,
  );
  expect(screen.getByText('A glimpse of what could live here')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'A season of gentle foundations' }),
  ).toBeVisible();
  expect(screen.getAllByText('Example')).toHaveLength(4);
  expect(screen.getByText('Launching everything at once.')).toBeVisible();
});

it('keeps a temporary season cover secondary to an existing season', () => {
  render(
    <SeasonPage
      record={record()}
      state="ready"
      tourExamples={tourExamples.season}
    />,
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'A spacious winter' }),
  ).toBeVisible();
  expect(
    screen.getByRole('heading', {
      level: 2,
      name: 'A season of gentle foundations',
    }),
  ).toBeVisible();
});

it('persists explicit date clearing when revising the name and dates step', () => {
  const onSaveStep = vi.fn();
  render(
    <SeasonPage
      record={record({ status: 'draft' })}
      state="ready"
      wizardStep="name-dates"
      onSaveStep={onSaveStep}
    />,
  );
  fireEvent.change(screen.getByLabelText('Starts'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('Ends'), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onSaveStep).toHaveBeenCalledWith(
    'name-dates',
    expect.objectContaining({ startsOn: null, endsOn: null }),
  );
});

it('shows interruptible wizard progress, validates step errors, and saves a step', () => {
  const onSaveStep = vi.fn();
  const draft = record({
    status: 'draft',
    completedSteps: ['name-dates'] as SeasonWizardStep[],
  });
  render(
    <SeasonPage
      record={draft}
      state="ready"
      wizardStep="prior-reflection"
      onSaveStep={onSaveStep}
    />,
  );
  expect(screen.getByText('Step 2 of 9')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert')).toHaveTextContent('reflection');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Skip this reflection for now' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onSaveStep).toHaveBeenCalledWith(
    'prior-reflection',
    expect.objectContaining({
      skippedPriorReflection: true,
    }),
  );
});

it('requires an explicit choice to retain a fourth priority', () => {
  render(
    <SeasonPage
      priorityCandidates={[
        { noteId: 'home-note', title: 'Home', hash: 'home-hash' },
        { noteId: 'studio-note', title: 'Studio', hash: 'studio-hash' },
        { noteId: 'family-note', title: 'Family', hash: 'family-hash' },
        { noteId: 'rest-note', title: 'Rest', hash: 'rest-hash' },
      ]}
      record={record({ status: 'draft' })}
      state="ready"
      wizardStep="priorities"
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Rest' }));
  expect(screen.getByText(/three priorities/i)).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: /keep all four/i }),
  ).toBeVisible();
});

it('stores canonical note IDs while presenting priority titles', async () => {
  const onSaveStep = vi.fn();
  render(
    <SeasonPage
      onSaveStep={onSaveStep}
      priorityCandidates={[
        {
          noteId: 'landscape-home',
          title: 'Make home easier',
          hash: 'home-hash',
        },
      ]}
      record={record({ status: 'draft', priorities: [] })}
      state="ready"
      wizardStep="priorities"
    />,
  );

  fireEvent.click(screen.getByRole('checkbox', { name: 'Make home easier' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await waitFor(() =>
    expect(onSaveStep).toHaveBeenCalledWith(
      'priorities',
      { priorities: ['landscape-home'] },
      { priorityOverride: false },
    ),
  );
});

it('creates a canonical Landscape priority and selects its note ID', async () => {
  const onCreatePriority = vi.fn().mockResolvedValue({
    noteId: 'new-priority',
    title: 'Protect creative time',
    hash: 'new-hash',
  });
  const onSaveStep = vi.fn();
  render(
    <SeasonPage
      onCreatePriority={onCreatePriority}
      onSaveStep={onSaveStep}
      priorityCandidates={[]}
      record={record({ status: 'draft', priorities: [] })}
      state="ready"
      wizardStep="priorities"
    />,
  );

  fireEvent.change(screen.getByLabelText('New Landscape priority'), {
    target: { value: '  Protect creative time  ' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Landscape priority' }),
  );

  await waitFor(() =>
    expect(onCreatePriority).toHaveBeenCalledWith('Protect creative time'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() =>
    expect(onSaveStep).toHaveBeenCalledWith(
      'priorities',
      { priorities: ['new-priority'] },
      { priorityOverride: false },
    ),
  );
});

it('requires, trims, and awaits close reflections without dismissing failures', async () => {
  let rejectClose: (reason: Error) => void = () => undefined;
  const onCloseSeason = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectClose = reject;
      }),
  );
  render(
    <SeasonPage
      onCloseSeason={onCloseSeason}
      priorityCandidates={[
        { noteId: 'Home', title: 'Make home easier', hash: 'home-hash' },
        {
          noteId: 'Studio',
          title: 'Build a useful Studio',
          hash: 'studio-hash',
        },
        {
          noteId: 'Family',
          title: 'Support family rhythms',
          hash: 'family-hash',
        },
      ]}
      record={record()}
      state="ready"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Archive season and letter' }),
  );
  const requiredError = await screen.findByRole('alert');
  expect(requiredError).toHaveTextContent(
    'Add what you celebrate before closing this season.',
  );
  await waitFor(() => expect(requiredError).toHaveFocus());

  fireEvent.change(screen.getByLabelText('What do you celebrate?'), {
    target: { value: '  We made room.  ' },
  });
  fireEvent.change(screen.getByLabelText('What did you learn?'), {
    target: { value: '  Small was enough.  ' },
  });
  fireEvent.change(screen.getByLabelText('Who did you become?'), {
    target: { value: '  More trusting.  ' },
  });
  for (const title of [
    'Make home easier',
    'Build a useful Studio',
    'Support family rhythms',
  ]) {
    fireEvent.change(screen.getByRole('combobox', { name: title }), {
      target: { value: 'return-landscape' },
    });
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Archive season and letter' }),
  );
  const submit = screen.getByRole('button', { name: 'Closing season…' });
  expect(submit).toBeDisabled();
  expect(submit).toHaveAttribute('aria-busy', 'true');
  expect(
    screen.getByRole('dialog', { name: 'Close this season' }),
  ).toBeVisible();
  expect(onCloseSeason).toHaveBeenCalledWith(
    expect.objectContaining({
      celebration: 'We made room.',
      learning: 'Small was enough.',
      identity: 'More trusting.',
      dispositions: expect.arrayContaining([
        expect.objectContaining({
          noteId: 'Home',
          title: 'Make home easier',
          expectedHash: 'home-hash',
        }),
      ]),
    }),
  );

  rejectClose(new Error('The season changed elsewhere. Try again.'));
  const saveError = await screen.findByRole('alert');
  expect(saveError).toHaveTextContent(
    'The season changed elsewhere. Try again.',
  );
  await waitFor(() => expect(saveError).toHaveFocus());
  expect(
    screen.getByRole('dialog', { name: 'Close this season' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Archive season and letter' }),
  ).toBeEnabled();
});

it('refuses to close against an unavailable priority revision', async () => {
  const onCloseSeason = vi.fn();
  render(
    <SeasonPage
      onCloseSeason={onCloseSeason}
      priorityCandidates={[
        { noteId: 'Home', title: 'Make home easier', hash: '' },
      ]}
      record={record({ priorities: ['Home'] })}
      state="ready"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
  fireEvent.change(screen.getByLabelText('What do you celebrate?'), {
    target: { value: 'We made room.' },
  });
  fireEvent.change(screen.getByLabelText('What did you learn?'), {
    target: { value: 'Small was enough.' },
  });
  fireEvent.change(screen.getByLabelText('Who did you become?'), {
    target: { value: 'More trusting.' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Make home easier' }), {
    target: { value: 'return-landscape' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Archive season and letter' }),
  );

  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent(
    'Refresh this season before closing; Make home easier changed or is unavailable.',
  );
  await waitFor(() => expect(error).toHaveFocus());
  expect(onCloseSeason).not.toHaveBeenCalled();
});

it('surfaces active-season conflicts without silently choosing one', () => {
  render(
    <SeasonPage
      record={record()}
      conflicts={[record({ id: 'other', title: 'Another season' })]}
      state="ready"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'More than one season is active',
  );
});
