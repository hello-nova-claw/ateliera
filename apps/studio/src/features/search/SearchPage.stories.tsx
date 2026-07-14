import type { SearchHit } from '@studio/index';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SearchPage } from './SearchPage';

const hits: SearchHit[] = [
  {
    id: 'quiet-morning',
    path: 'Reflection Garden/quiet-morning.md',
    title: 'A quiet morning that worked',
    snippet: 'I wrote for fifteen minutes. My toddler interrupted twice, and it still counted. Calm can be small.',
    highlightRanges: [{ start: 84, end: 88 }],
    score: 12,
    semanticType: 'celebration',
    cardType: 'celebration',
    status: 'active',
    updated: '2026-07-14T09:00:00.000Z',
    matchReason: { field: 'body', strategy: 'keyword', text: 'calm' },
  },
  {
    id: 'future-home',
    path: 'Life Landscape/Home/future-home.md',
    title: 'A home that supports ordinary family life',
    snippet: 'The rooms feel calm enough to live in, not arranged for a photograph.',
    highlightRanges: [{ start: 15, end: 19 }],
    score: 8,
    semanticType: 'vision',
    cardType: 'text',
    status: 'active',
    updated: '2026-07-12T09:00:00.000Z',
    matchReason: { field: 'body', strategy: 'keyword', text: 'calm' },
  },
  {
    id: 'calm-practice',
    path: 'Wisdom Garden/calm-practice.md',
    title: 'Create before consuming',
    snippet: 'A twenty-minute practice that protects the calm beginning of a day.',
    highlightRanges: [{ start: 42, end: 46 }],
    score: 5,
    semanticType: 'foundations',
    cardType: 'principle',
    status: 'resting',
    updated: '2026-06-18T09:00:00.000Z',
    matchReason: { field: 'tags', strategy: 'fuzzy-tag', text: 'calm', distance: 1 },
  },
];

const facets = {
  rooms: [
    { value: 'reflection-garden', count: 1 },
    { value: 'life-landscape', count: 1 },
    { value: 'wisdom-garden', count: 1 },
  ],
  semanticTypes: [
    { value: 'celebration', count: 1 },
    { value: 'foundations', count: 1 },
    { value: 'vision', count: 1 },
  ],
  lifeAreas: [{ value: 'home', count: 1 }],
  seasons: [{ value: 'winter', count: 1 }],
  statuses: [{ value: 'active', count: 2 }, { value: 'resting', count: 1 }],
  tags: [{ value: 'calm', count: 3 }, { value: 'family', count: 1 }],
  cardTypes: [{ value: 'text', count: 1 }, { value: 'celebration', count: 1 }, { value: 'principle', count: 1 }],
};

const meta: Meta<typeof SearchPage> = {
  title: 'Rooms/Search',
  component: SearchPage,
  args: {
    model: {
      facets,
      filters: {},
      query: 'calm',
      repairCount: 2,
      results: hits,
      state: 'ready',
    },
    onFiltersChange: () => undefined,
    onOpenRepairQueue: () => undefined,
    onOpenResult: () => undefined,
    onQueryChange: () => undefined,
  },
  decorators: [(Story) => (
    <div style={{ margin: '0 auto', maxWidth: '920px', padding: '48px 32px' }}>
      <Story />
    </div>
  )],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {};
export const Empty: Story = {
  args: { model: { facets, filters: {}, query: 'ocean', repairCount: 0, results: [], state: 'ready' } },
};
export const Loading: Story = {
  args: { model: { facets, filters: {}, query: 'calm', repairCount: 0, results: [], state: 'loading' } },
};
export const Offline: Story = {
  args: { model: { facets, filters: {}, query: 'calm', repairCount: 0, results: hits, state: 'offline' } },
};
export const Error: Story = {
  args: { model: { error: 'The local index needs rebuilding. Your notes remain untouched.', facets, filters: {}, query: '', repairCount: 1, results: [], state: 'error' } },
};
export const Dense: Story = {
  args: {
    model: {
      facets,
      filters: {},
      query: 'calm',
      repairCount: 2,
      results: Array.from({ length: 18 }, (_, index) => ({
        ...hits[index % hits.length]!,
        id: `result-${index}`,
        title: `${hits[index % hits.length]!.title} · ${index + 1}`,
      })),
      state: 'ready',
    },
  },
};
export const Dark: Story = {
  decorators: [(Story) => (
    <div className="studio-app" data-theme="deep-ocean" style={{ background: 'var(--studio-color-canvas)', color: 'var(--studio-color-ink)', minHeight: '100vh', padding: '48px 32px' }}>
      <Story />
    </div>
  )],
};
