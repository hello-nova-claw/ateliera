import type { Meta, StoryObj } from '@storybook/react-vite';

import { ReflectionPage } from './ReflectionPage';

const cards = [
  {
    noteId: 'now', path: 'Reflection Garden/Reflections/now.md', hash: 'one',
    title: 'I returned without making the interruption mean failure',
    excerpt: 'The practice could be small, interrupted, and still belong to me.',
    semanticType: 'reflection' as const, cardType: 'reflection', status: 'active' as const,
    created: '2026-07-14T09:00:00.000Z', updated: '2026-07-14T09:00:00.000Z',
    lifeAreas: ['family'], seasons: ['winter'], tags: ['calm', 'ordinary-life'],
    linkedNoteIds: ['identity'], thenNoteId: 'then',
  },
  {
    noteId: 'then', path: 'Reflection Garden/Celebrations/then.md', hash: 'two',
    title: 'A quiet morning that worked',
    excerpt: 'I wrote for fifteen minutes. My toddler interrupted twice, and it still counted.',
    semanticType: 'celebration' as const, cardType: 'celebration', status: 'active' as const,
    created: '2025-07-14T09:00:00.000Z', updated: '2025-07-14T09:00:00.000Z',
    lifeAreas: ['creativity'], seasons: [], tags: ['calm', 'evidence'], linkedNoteIds: [],
  },
];

const meta: Meta<typeof ReflectionPage> = {
  title: 'Rooms/Reflection Garden',
  component: ReflectionPage,
  args: {
    model: { cards, themes: [{ name: 'calm', count: 2 }, { name: 'evidence', count: 1 }] },
    connections: [{ id: 'identity', kind: 'note', label: 'A woman who creates from calm' }],
  },
  decorators: [(Story) => <div style={{ margin: '0 auto', maxWidth: '1000px' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Garden: Story = {};
export const Empty: Story = { args: { model: { cards: [], themes: [] } } };
export const Dense: Story = {
  args: {
    model: {
      cards: Array.from({ length: 16 }, (_, index) => {
        const source = { ...cards[index % 2]! };
        delete source.thenNoteId;
        return {
          ...source,
          noteId: `entry-${index}`,
          path: `Reflection Garden/entry-${index}.md`,
          title: `${source.title} ${index + 1}`,
        };
      }),
      themes: [{ name: 'calm', count: 10 }, { name: 'evidence', count: 6 }],
    },
  },
};
export const Loading: Story = { args: { model: { cards: [], themes: [] }, state: 'loading' } };
export const Malformed: Story = { args: { error: 'One entry needs metadata repair. Its words remain untouched.', state: 'error' } };
export const Dark: Story = {
  decorators: [(Story) => <div className="studio-app" data-theme="deep-ocean" style={{ background: 'var(--studio-color-canvas)', color: 'var(--studio-color-ink)', minHeight: '100vh', padding: '32px' }}><Story /></div>],
};
