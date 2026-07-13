import type { Meta, StoryObj } from '@storybook/react-vite';

import { UnchartedPage } from './UnchartedPage';

const cards = [
  {
    noteId: 'retreat', path: 'Uncharted/retreat.md', hash: 'one',
    title: 'What if I created a thoughtful retreat?',
    excerpt: 'A place for identity, creativity, and meaningful life design without urgency or guru culture.',
    semanticType: 'uncharted' as const, cardType: 'possibility', status: 'active' as const,
    updated: '2026-07-14T09:00:00.000Z', horizon: 'near' as const, seasons: [],
  },
  {
    noteId: 'hill', path: 'Uncharted/hill.md', hash: 'two',
    title: 'Could I find the childhood hill again?',
    excerpt: 'There was countryside, a path, and a hill I once tried to return to in dreams.',
    semanticType: 'uncharted' as const, cardType: 'possibility', status: 'active' as const,
    updated: '2026-07-13T09:00:00.000Z', horizon: 'near' as const, seasons: [],
  },
  {
    noteId: 'gate', path: 'Uncharted/gate.md', hash: 'three',
    title: 'A place I cannot name yet',
    excerpt: 'There is only a gate, late-afternoon light, and a feeling of open country.',
    semanticType: 'uncharted' as const, cardType: 'possibility', status: 'active' as const,
    updated: '2026-07-12T09:00:00.000Z', horizon: 'beyond' as const, seasons: [],
  },
];

const meta: Meta<typeof UnchartedPage> = {
  title: 'Rooms/Uncharted',
  component: UnchartedPage,
  args: { model: { cards }, activeSeason: { id: 'winter', title: 'Making room' } },
  decorators: [(Story) => <div style={{ margin: '0 auto', maxWidth: '1180px' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Sparse: Story = { args: { model: { cards: cards.slice(0, 1) } } };
export const Empty: Story = { args: { model: { cards: [] } } };
export const Dense: Story = {
  args: {
    model: {
      cards: Array.from({ length: 12 }, (_, index) => ({
        ...cards[index % cards.length]!,
        noteId: `possibility-${index}`,
        path: `Uncharted/possibility-${index}.md`,
        title: `${cards[index % cards.length]!.title} ${index + 1}`,
      })),
    },
  },
};
export const LongText: Story = {
  args: {
    model: {
      cards: [{
        ...cards[0]!,
        title: 'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft and a possibility that refuses to fit neatly inside the present map',
      }],
    },
  },
};
export const Dark: Story = {
  decorators: [(Story) => <div className="studio-app" data-theme="deep-ocean" style={{ background: 'var(--studio-color-canvas)', color: 'var(--studio-color-ink)', minHeight: '100vh', padding: '32px' }}><Story /></div>],
};

