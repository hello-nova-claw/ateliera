import { fireEvent, render, screen } from '@testing-library/react';
import type {
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { vi } from 'vitest';
import { FoyerPage } from './FoyerPage';

function card(
  overrides: Partial<StudioCardProjection> = {},
): StudioCardProjection {
  return {
    noteId: 'note',
    path: 'Foyer/note.md',
    title: 'A note',
    excerpt: 'A quiet excerpt.',
    semanticType: 'foundations',
    cardType: 'note',
    status: 'active',
    updated: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

const empty: FoyerProjection = {
  currentSeason: null,
  featured: [],
  becoming: null,
  feelings: [],
  principles: [],
  priorities: [],
  returning: null,
  image: null,
};

it('invites only three starting choices in an empty Foyer', () => {
  const onCreate = vi.fn();
  render(<FoyerPage model={empty} onCreate={onCreate} />);

  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByText('What are you currently becoming?')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Add a becoming sentence' }),
  );
  expect(onCreate).toHaveBeenCalledWith(
    'becoming',
    expect.any(HTMLButtonElement),
  );
});

it('composes populated editorial slots without turning cards into giant buttons', () => {
  const onOpen = vi.fn();
  const model: FoyerProjection = {
    currentSeason: card({
      noteId: 'season',
      cardType: 'season',
      title: 'A spacious winter',
    }),
    featured: [],
    becoming: card({
      noteId: 'becoming',
      cardType: 'identity',
      title: 'A woman who creates from calm',
    }),
    feelings: [
      card({
        noteId: 'feeling',
        cardType: 'feeling',
        title: 'Spacious',
        semanticType: 'vision',
      }),
    ],
    principles: [
      card({
        noteId: 'principle',
        cardType: 'principle',
        title: 'Structure and surprise',
      }),
    ],
    priorities: [
      card({
        noteId: 'one',
        cardType: 'priority',
        title: 'Create before consuming',
      }),
      card({ noteId: 'two', cardType: 'priority', title: 'Make home easier' }),
      card({
        noteId: 'three',
        cardType: 'priority',
        title: 'Rest without earning it',
      }),
      card({
        noteId: 'four',
        cardType: 'priority',
        title: 'This must not appear',
      }),
    ],
    returning: card({
      noteId: 'return',
      cardType: 'reflection',
      semanticType: 'celebration',
      title: 'You returned gently',
    }),
    image: {
      noteId: 'image',
      path: 'Foyer/image.md',
      hash: 'image-hash',
      source: '/morning.jpg',
      alt: 'Morning light',
      caption: 'Morning light in the kitchen',
    },
  };
  render(
    <FoyerPage
      cover={{ state: 'ready', url: 'blob:morning' }}
      model={model}
      onOpen={onOpen}
    />,
  );

  expect(screen.getByRole('heading', { name: 'The Studio' })).toBeVisible();
  expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByText('This must not appear')).not.toBeInTheDocument();
  expect(
    screen.getByRole('list', { name: 'The Studio meanings' }).children,
  ).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Edit becoming' }));
  expect(onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ noteId: 'becoming' }),
    expect.any(HTMLButtonElement),
  );
});

it('collapses a missing optional image into a calm repair note', () => {
  render(
    <FoyerPage
      model={{
        ...empty,
        image: {
          noteId: 'image',
          path: 'Foyer/image.md',
          hash: 'image-hash',
          source: '/missing.jpg',
          alt: 'A hillside',
        },
      }}
      cover={{ state: 'unavailable', reason: 'missing' }}
    />,
  );
  expect(screen.getByText('This image is not available here.')).toBeVisible();
  expect(screen.getByText('A hillside')).toBeVisible();
});

it('never renders a raw cover reference and offers non-destructive removal', () => {
  const onRemoveImage = vi.fn();
  render(
    <FoyerPage
      model={{
        ...empty,
        image: {
          noteId: 'image',
          path: 'Foyer/image.md',
          hash: 'image-hash',
          source: 'https://tracker.example/image.jpg',
          alt: 'A hillside',
        },
      }}
      cover={{ state: 'unavailable', reason: 'unsafe-reference' }}
      onRemoveImage={onRemoveImage}
    />,
  );
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove this image' }));
  expect(onRemoveImage).toHaveBeenCalledWith(
    expect.objectContaining({ noteId: 'image', hash: 'image-hash' }),
    expect.any(HTMLButtonElement),
  );
});

it('announces loading and recoverable errors without replacing the fixed structure', () => {
  const view = render(
    <FoyerPage model={empty} onCreate={vi.fn()} state="loading" />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Gathering the Foyer');
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByTestId('foyer-skeleton')).toBeVisible();
  view.rerender(
    <FoyerPage
      error="The index needs a quiet rebuild."
      model={empty}
      state="error"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The index needs a quiet rebuild.',
  );
  expect(screen.getByRole('heading', { name: 'The Studio' })).toBeVisible();
});
