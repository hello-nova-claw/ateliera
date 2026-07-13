import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SeasonRecord } from '@studio/application';
import { createSeasonDraft } from '@studio/domain';

import { SeasonPage } from './SeasonPage';

const state = {
  ...createSeasonDraft('2026-winter', '2026-07-14T00:00:00.000Z'),
  title: 'Winter — Making room',
  startsOn: '2026-07-14',
  endsOn: '2026-09-30',
  statement:
    'making enough physical and mental room for family, creativity, and sustainable work',
  status: 'active' as const,
  feelings: ['Calm', 'Capable', 'Curious', 'Connected'],
  priorities: [
    'Make home easier',
    'Build a useful Studio',
    'Support family rhythms',
  ],
  decisions: [
    {
      id: 'd1',
      text: 'Choose the smallest genuinely useful first version',
      horizon: '30' as const,
      kind: 'decision' as const,
    },
    {
      id: 'd2',
      text: 'Try one protected creative morning each week',
      horizon: '60' as const,
      kind: 'experiment' as const,
    },
    {
      id: 'd3',
      text: 'Review what created spaciousness',
      horizon: '90' as const,
      kind: 'decision' as const,
    },
  ],
  practices: ['Create before consuming', 'A five-minute appreciation return'],
  supports: ['Two childcare mornings', 'A deliberately small scope'],
  constraints: ['Toddler sleep changes', 'Energy is not uniform'],
  enough:
    'The house becomes easier in the places that most affect daily life; The Studio reaches a genuinely usable first version; family rhythms feel supported rather than optimised.',
  notNow: [
    'Buying another personal-development course',
    'Building every future Inner Studio feature',
    'A perfect whole-house system',
  ],
};

const record: SeasonRecord = {
  state,
  path: 'Current Season/winter.md',
  hash: 'hash',
  note: {
    schemaVersion: 1,
    id: 'season-note',
    title: state.title,
    body: '',
    cardType: 'season',
    semanticType: 'growth',
    status: 'active',
    rooms: ['current-season', 'foyer'],
    lifeAreas: [],
    seasons: [],
    tags: ['season'],
    created: state.created,
    updated: state.updated,
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: { season_id: state.id },
    lineEnding: '\n',
  },
};

const priorityCandidates = state.priorities.map((title, index) => ({
  noteId: `priority-${index + 1}`,
  title,
  hash: `priority-hash-${index + 1}`,
}));

const canonicalRecord: SeasonRecord = {
  ...record,
  state: {
    ...record.state,
    priorities: priorityCandidates.map(({ noteId }) => noteId),
  },
};

const meta: Meta<typeof SeasonPage> = {
  title: 'Rooms/Current Season',
  component: SeasonPage,
  args: {
    priorityCandidates,
    record: canonicalRecord,
    state: 'ready',
  },
  decorators: [
    (Story) => (
      <div style={{ margin: '0 auto', maxWidth: '1152px' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Empty: Story = { args: { record: null } };
export const Wizard: Story = {
  args: {
    record: {
      ...canonicalRecord,
      state: { ...canonicalRecord.state, status: 'draft' },
    },
    wizardStep: 'feelings',
  },
};
export const Conflict: Story = { args: { conflicts: [record] } };
export const LongText: Story = {
  args: {
    record: {
      ...canonicalRecord,
      state: {
        ...canonicalRecord.state,
        title:
          'A season that makes room for tenderness, family reality, ambitious creative thinking, and the unfinished edges of ordinary life',
      },
    },
    priorityCandidates: [
      {
        noteId: 'priority-1',
        title:
          'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft',
        hash: 'priority-hash-1',
      },
      ...priorityCandidates.slice(1),
    ],
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
