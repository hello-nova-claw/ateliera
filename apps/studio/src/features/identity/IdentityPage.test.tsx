import type {
  IdentityCardProjection,
  IdentityStudioProjection,
} from '@studio/application';
import { identitySectionDefinitions } from '@studio/domain';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { vi } from 'vitest';

import { IdentityPage } from './IdentityPage';

function card(
  overrides: Partial<IdentityCardProjection> = {},
): IdentityCardProjection {
  return {
    noteId: 'identity-one',
    path: 'Identity Studio/identity-one.md',
    hash: 'identity-hash',
    title: 'I create from calm',
    excerpt: 'I protect quiet space before the day becomes busy.',
    semanticType: 'growth',
    cardType: 'identity-emerging',
    status: 'active',
    created: '2026-07-01T00:00:00.000Z',
    updated: '2026-07-02T00:00:00.000Z',
    evidence: [],
    ...overrides,
  };
}

function projection(): IdentityStudioProjection {
  const practicing = card();
  return {
    currentlyBecoming: practicing,
    sections: {
      'already-true': [
        card({
          noteId: 'true-one',
          title: 'I am thoughtful',
          cardType: 'identity-truth',
          semanticType: 'foundations',
          evidence: [
            {
              noteId: 'evidence-one',
              path: 'Reflection Garden/Celebrations/evidence.md',
              title: 'I chose depth',
              excerpt: 'I made room for the slower answer.',
              semanticType: 'celebration',
              cardType: 'celebration',
              status: 'active',
              created: '2026-07-10T00:00:00.000Z',
              updated: '2026-07-10T00:00:00.000Z',
            },
          ],
        }),
      ],
      'practicing-now': [
        practicing,
        card({ noteId: 'identity-two', title: 'I trust my timing' }),
      ],
      'values-principles': [],
      'desired-feelings': [],
      'beliefs-practice': [],
      'embodiment-cues': [],
      'identity-shifts': [],
    },
  };
}

it('composes the complete Identity Studio and opens cards and evidence', () => {
  const onOpen = vi.fn();
  render(
    <IdentityPage
      model={projection()}
      onAdd={vi.fn()}
      onOpen={onOpen}
      onPromote={vi.fn()}
      onReorder={vi.fn()}
      state="ready"
    />,
  );

  expect(
    screen.getByRole('heading', { level: 1, name: 'Identity Studio' }),
  ).toBeVisible();
  expect(screen.getByText('who I am, and who I am becoming')).toBeVisible();
  expect(screen.getAllByText('I create from calm')).toHaveLength(2);
  for (const section of identitySectionDefinitions) {
    expect(
      screen.getByRole('heading', { level: 2, name: section.label }),
    ).toBeVisible();
  }

  fireEvent.click(screen.getByRole('button', { name: 'Open I am thoughtful' }));
  expect(onOpen).toHaveBeenLastCalledWith(
    expect.objectContaining({ noteId: 'true-one' }),
    expect.any(HTMLButtonElement),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Open evidence I chose depth' }),
  );
  expect(onOpen).toHaveBeenLastCalledWith(
    expect.objectContaining({ noteId: 'evidence-one' }),
    expect.any(HTMLButtonElement),
  );
});

it('adds a thought through the section where it belongs', async () => {
  const onAdd = vi.fn(async () => undefined);
  render(
    <IdentityPage
      model={projection()}
      onAdd={onAdd}
      onOpen={vi.fn()}
      onPromote={vi.fn()}
      onReorder={vi.fn()}
      state="ready"
    />,
  );

  const section = screen.getByRole('region', { name: 'Beliefs in practice' });
  fireEvent.click(
    within(section).getByRole('button', { name: 'Add a belief' }),
  );
  fireEvent.change(within(section).getByLabelText('A short title (optional)'), {
    target: { value: 'Support can be simple' },
  });
  fireEvent.change(within(section).getByLabelText('Belief in practice'), {
    target: { value: 'I can ask before everything becomes urgent.' },
  });
  fireEvent.click(
    within(section).getByRole('button', { name: 'Remember this belief' }),
  );

  expect(onAdd).toHaveBeenCalledWith('beliefs-practice', {
    body: 'I can ask before everything becomes urgent.',
    title: 'Support can be simple',
  });
  await waitFor(() =>
    expect(
      within(section).queryByLabelText('Belief in practice'),
    ).not.toBeInTheDocument(),
  );
});

it('promotes and reorders practicing identities with named buttons', async () => {
  const onPromote = vi.fn();
  const onReorder = vi.fn();
  render(
    <IdentityPage
      model={projection()}
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      onPromote={onPromote}
      onReorder={onReorder}
      state="ready"
    />,
  );

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Make I trust my timing currently becoming',
    }),
  );
  expect(onPromote).toHaveBeenCalledWith('identity-two');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Move I trust my timing up' }),
    ).toBeEnabled(),
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Move I trust my timing up' }),
  );
  expect(onReorder).toHaveBeenCalledWith('practicing-now', [
    'identity-two',
    'identity-one',
  ]);
  await screen.findByText('This section has been rearranged.');
});

it('keeps loading, empty, error, stale, and offline states calm and explicit', () => {
  const { rerender } = render(
    <IdentityPage
      model={{
        currentlyBecoming: null,
        sections: {
          'already-true': [],
          'practicing-now': [],
          'values-principles': [],
          'desired-feelings': [],
          'beliefs-practice': [],
          'embodiment-cues': [],
          'identity-shifts': [],
        },
      }}
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      onPromote={vi.fn()}
      onReorder={vi.fn()}
      state="loading"
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Gathering this room');

  rerender(
    <IdentityPage
      error="Identity Studio could not be gathered."
      model={projection()}
      offline
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      onPromote={vi.fn()}
      onReorder={vi.fn()}
      state="error"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Identity Studio could not be gathered.',
  );
  expect(screen.getByText(/remains available offline/i)).toBeVisible();
});
