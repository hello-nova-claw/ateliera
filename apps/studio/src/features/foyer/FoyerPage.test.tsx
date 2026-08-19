import { fireEvent, render, screen } from '@testing-library/react';
import type {
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { vi } from 'vitest';
import { FoyerPage } from './FoyerPage';
import { tourExamples } from '../onboarding/tour-examples';

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

it('places temporary tour examples in the authentic Foyer spread', () => {
  const onUseTourExample = vi.fn();
  render(
    <FoyerPage
      model={empty}
      onUseTourExample={onUseTourExample}
      tourExamples={tourExamples.foyer}
    />,
  );

  expect(screen.getAllByText('A glimpse of what could live here')).toHaveLength(
    1,
  );
  expect(
    screen.getByLabelText('Example Currently becoming card'),
  ).toBeVisible();
  expect(
    screen.getByLabelText('Example How I want life to feel card'),
  ).toBeVisible();
  expect(screen.getByLabelText('Example Guiding principle card')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', {
      name: /Use Currently becoming as a starting point/,
    }),
  );
  expect(onUseTourExample).toHaveBeenCalledWith(
    tourExamples.foyer[0],
    expect.any(HTMLButtonElement),
  );
});

it('does not restore a tour starting point when its canonical Foyer slot is occupied', () => {
  const model: FoyerProjection = {
    ...empty,
    becoming: card({
      noteId: 'authored-becoming',
      cardType: 'identity',
      title: 'I create from calm',
    }),
  };

  const { unmount } = render(
    <FoyerPage model={model} tourExamples={tourExamples.foyer} />,
  );

  expect(screen.getByText('I create from calm')).toBeVisible();
  expect(
    screen.queryByLabelText('Example Currently becoming card'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByLabelText('Example How I want life to feel card'),
  ).toBeVisible();

  unmount();
  render(<FoyerPage model={model} tourExamples={tourExamples.foyer} />);

  expect(
    screen.queryByLabelText('Example Currently becoming card'),
  ).not.toBeInTheDocument();
});

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

  expect(screen.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
  expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByText('This must not appear')).not.toBeInTheDocument();
  expect(
    screen.getByRole('list', { name: 'Ateliera meanings' }).children,
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

it('renders the Gift between Becoming and the season preview, and wires Keep', () => {
  const onKeepGift = vi.fn();
  render(
    <FoyerPage
      gift={{
        kind: 'dream',
        payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
        body: 'A door in the hallway.',
        sourcePath: 'Uncharted/dream-1.md',
        intervalDays: 5,
      }}
      model={{
        ...empty,
        becoming: card({ noteId: 'becoming', title: 'A woman who creates from calm' }),
        currentSeason: card({
          noteId: 'season',
          cardType: 'season',
          title: 'A spacious winter',
        }),
      }}
      onKeepGift={onKeepGift}
    />,
  );

  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings.indexOf('A woman who creates from calm')).toBeLessThan(
    headings.indexOf('A door in the hallway.'),
  );
  expect(headings.indexOf('A door in the hallway.')).toBeLessThan(
    headings.indexOf('A spacious winter'),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  expect(onKeepGift).toHaveBeenCalled();
});

it('passes the Gift keep busy/error state through to TodaysGift', () => {
  render(
    <FoyerPage
      gift={{
        kind: 'dream',
        payload: { title: 'A door in the hallway.', excerpt: 'A door in the hallway.' },
        body: 'A door in the hallway.',
        sourcePath: 'Uncharted/dream-1.md',
        intervalDays: 5,
      }}
      giftKeepState="error"
      giftKeepError="This gift could not be kept just now."
      model={empty}
      onKeepGift={vi.fn()}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This gift could not be kept just now.',
  );
});

it('renders no Gift slot when gift is null', () => {
  render(<FoyerPage model={empty} />);
  expect(screen.queryByText("Today's gift")).not.toBeInTheDocument();
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
  expect(screen.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
});
