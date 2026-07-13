import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { FoyerPage } from './FoyerPage';

function card(
  overrides: Partial<StudioCardProjection> = {},
): StudioCardProjection {
  return {
    noteId: crypto.randomUUID(),
    path: 'Foyer/note.md',
    title: 'A note',
    excerpt: 'A quiet note for this season.',
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

const full: FoyerProjection = {
  currentSeason: card({
    noteId: 'season',
    cardType: 'season',
    title: 'The season of enough',
    excerpt:
      'A winter for making home easier, creating from calm, and leaving room to notice.',
  }),
  featured: [],
  becoming: card({
    noteId: 'becoming',
    cardType: 'identity',
    title: 'A woman who creates from calm',
    excerpt: 'I am practicing creating from calm rather than urgency.',
  }),
  feelings: ['Spacious', 'Creative', 'Present', 'Well held'].map(
    (title, index) =>
      card({
        noteId: `feeling-${index}`,
        cardType: 'feeling',
        semanticType: 'vision',
        title,
        excerpt: title,
      }),
  ),
  principles: [
    card({
      noteId: 'principle-1',
      cardType: 'principle',
      title: 'Structure and surprise',
      excerpt:
        'Create enough structure that imagination has somewhere to surprise you.',
    }),
    card({
      noteId: 'principle-2',
      cardType: 'principle',
      title: 'Small still counts',
      excerpt: 'A practice that survives ordinary Tuesdays can become a life.',
    }),
    card({
      noteId: 'principle-3',
      cardType: 'principle',
      title: 'Create before consuming',
      excerpt: 'Give the clearest part of the day to what wants to be made.',
    }),
  ],
  priorities: [
    'Make home easier',
    'Protect creative time',
    'Rest without earning it',
  ].map((title, index) =>
    card({
      noteId: `priority-${index}`,
      cardType: 'priority',
      semanticType: 'growth',
      title,
    }),
  ),
  returning: card({
    noteId: 'return',
    cardType: 'reflection',
    semanticType: 'celebration',
    title: 'Interruptions did not undo the practice',
    excerpt:
      'I returned without making the interruption mean that the practice had failed.',
  }),
  image: {
    noteId: 'image',
    path: 'Foyer/image.md',
    alt: 'Soft morning light across a green hillside',
    caption: 'the childhood hill',
    source:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3Cdefs%3E%3ClinearGradient id='s' x2='0' y2='1'%3E%3Cstop stop-color='%23dce8ed'/%3E%3Cstop offset='1' stop-color='%23f6e9c6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='600' fill='url(%23s)'/%3E%3Cpath d='M0 430 Q250 280 520 390 T800 330 V600 H0Z' fill='%2392aa7c'/%3E%3Cpath d='M0 500 Q300 350 800 460 V600 H0Z' fill='%236f8d64'/%3E%3C/svg%3E",
  },
};

const meta: Meta<typeof FoyerPage> = {
  title: 'Rooms/Foyer',
  component: FoyerPage,
  args: { model: full, onCreate: () => undefined, onOpen: () => undefined },
  decorators: [
    (Story) => (
      <div style={{ margin: '0 auto', maxWidth: '1180px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { model: empty } };
export const Partial: Story = {
  args: {
    model: {
      ...empty,
      becoming: full.becoming,
      feelings: full.feelings.slice(0, 2),
    },
  },
};
export const Full: Story = {};
export const Dense: Story = {
  args: {
    model: {
      ...full,
      becoming: card({
        noteId: 'long',
        cardType: 'identity',
        title:
          'A woman who can hold tenderness, intellectual curiosity, meaningful work, and the gloriously unfinished reality of family life without compressing any of it into a slogan',
        excerpt:
          'Long words remain whole: Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft.',
      }),
    },
  },
};
export const Loading: Story = { args: { model: empty, state: 'loading' } };
export const IndexStale: Story = { args: { model: full, state: 'stale' } };
export const Offline: Story = { args: { model: full, state: 'offline' } };
export const Error: Story = {
  args: {
    error: 'The index needs a quiet rebuild. Your notes remain in the Studio.',
    model: empty,
    state: 'error',
  },
};
export const MissingImage: Story = {
  args: {
    model: {
      ...full,
      image: { ...full.image!, source: '/missing-foyer-image.jpg' },
    },
  },
};
export const Dark: Story = {
  decorators: [
    (Story) => (
      <div
        className="studio-app"
        data-theme="deep-ocean"
        style={{
          background: 'var(--studio-color-canvas)',
          color: 'var(--studio-color-ink)',
          minHeight: '100vh',
          padding: '32px',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
