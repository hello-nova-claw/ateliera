import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  IdentityCardProjection,
  IdentityStudioProjection,
} from '@studio/application';

import { IdentityPage } from './IdentityPage';

function card(
  noteId: string,
  title: string,
  overrides: Partial<IdentityCardProjection> = {},
): IdentityCardProjection {
  return {
    noteId,
    path: `Identity Studio/${noteId}.md`,
    hash: `hash-${noteId}`,
    title,
    excerpt: title,
    semanticType: 'foundations',
    cardType: 'identity-truth',
    status: 'active',
    created: '2026-07-01T09:00:00.000Z',
    updated: '2026-07-15T09:00:00.000Z',
    evidence: [],
    ...overrides,
  };
}

const creatingCalm = card(
  'creating-calm',
  'A woman who creates from calm and trusts her own timing',
  {
    cardType: 'identity-emerging',
    semanticType: 'growth',
    excerpt:
      'I make the next kind decision, protect a little room to think, and let small work count.',
    evidence: [
      {
        noteId: 'quiet-morning',
        path: 'Reflection Garden/Celebrations/quiet-morning.md',
        title: 'A quiet morning that still counted',
        excerpt: 'Fifteen thoughtful minutes moved the work forward.',
        semanticType: 'celebration',
        cardType: 'celebration',
        status: 'active',
        created: '2026-07-14T09:00:00.000Z',
        updated: '2026-07-14T09:00:00.000Z',
      },
    ],
  },
);

const furnished: IdentityStudioProjection = {
  currentlyBecoming: creatingCalm,
  sections: {
    'already-true': [
      card('curious', 'I am curious and able to find meaningful patterns'),
      card('present', 'I return to the people and places I love'),
    ],
    'practicing-now': [
      creatingCalm,
      card('supported', 'I let support arrive before urgency', {
        cardType: 'identity-emerging',
        semanticType: 'growth',
      }),
    ],
    'values-principles': [
      card('depth', 'Depth over novelty', { cardType: 'principle' }),
      card('family', 'Build with family life, not against it', {
        cardType: 'principle',
      }),
    ],
    'desired-feelings': [
      card('spacious', 'Spacious', {
        cardType: 'feeling',
        semanticType: 'vision',
      }),
      card('playful', 'Playful', {
        cardType: 'feeling',
        semanticType: 'vision',
      }),
    ],
    'beliefs-practice': [
      card('enough', 'Small, coherent work can be enough', {
        cardType: 'belief',
      }),
    ],
    'embodiment-cues': [
      card('pause', 'I pause before adding another commitment', {
        cardType: 'embodiment-cue',
        semanticType: 'growth',
      }),
    ],
    'identity-shifts': [
      card('collector-curator', 'From course collector to thoughtful curator', {
        cardType: 'identity-shift',
        semanticType: 'reflection',
        created: '2026-06-12T09:00:00.000Z',
      }),
    ],
  },
};

const empty: IdentityStudioProjection = {
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
};

const meta: Meta<typeof IdentityPage> = {
  title: 'Rooms/Identity Studio',
  component: IdentityPage,
  args: {
    model: furnished,
    onAdd: async () => undefined,
    onOpen: () => undefined,
    onPromote: async () => undefined,
    onReorder: async () => undefined,
    state: 'ready',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Furnished: Story = {};
export const Empty: Story = { args: { model: empty } };
export const Loading: Story = { args: { model: empty, state: 'loading' } };
export const Offline: Story = { args: { offline: true } };
export const Error: Story = {
  args: {
    error:
      'One identity note needs metadata repair. Its words remain untouched.',
    state: 'error',
  },
};
export const Dark: Story = {
  decorators: [
    (Story) => (
      <div
        className="studio-app"
        data-theme="deep-ocean"
        style={{
          minHeight: '100vh',
          padding: '32px',
          background: 'var(--studio-color-canvas)',
          color: 'var(--studio-color-ink)',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
