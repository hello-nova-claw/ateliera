import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  LandscapeBoardProjection,
  LandscapeCardProjection,
} from '@studio/application';
import { defaultLifeAreas, landscapeAnchors } from '@studio/domain';

import { LandscapePage } from './LandscapePage';

const areas = [...defaultLifeAreas];

function card(
  lifeArea: string,
  anchor: (typeof landscapeAnchors)[number],
  index = 0,
): LandscapeCardProjection {
  const labels = {
    vision: 'A life that feels spacious and deeply lived',
    'identity-values-feelings': 'I move with curiosity and quiet confidence',
    decisions: 'Choose one meaningful direction for this season',
    practices: 'Return to a small nourishing rhythm',
    'structure-strategy': 'Make room, ask for help, protect what matters',
  } as const;
  return {
    noteId: `${lifeArea}-${anchor}-${index}`,
    path: `Life Landscape/${lifeArea}-${anchor}-${index}.md`,
    hash: `${lifeArea}-${anchor}-${index}-hash`,
    title: labels[anchor],
    excerpt:
      'An ordinary expression of the life I am creating, held lightly enough to evolve.',
    semanticType:
      anchor === 'vision'
        ? 'vision'
        : anchor === 'identity-values-feelings' ||
            anchor === 'structure-strategy'
          ? 'foundations'
          : 'growth',
    cardType: anchor,
    status: 'active',
    updated: '2026-07-13T00:00:00.000Z',
    lifeAreas: [lifeArea],
    anchor,
    ...(anchor === 'decisions'
      ? { decisionHorizon: index === 0 ? ('30d' as const) : ('90d' as const) }
      : {}),
  };
}

function board(
  activeAreas = areas.slice(0, 5),
  dense = false,
): LandscapeBoardProjection {
  return {
    cells: activeAreas.flatMap((area) =>
      landscapeAnchors.map((anchor, row) => {
        const cards =
          dense || (area.id === 'home' && row < 3)
            ? [
                card(area.id, anchor),
                ...(dense
                  ? [card(area.id, anchor, 1), card(area.id, anchor, 2)]
                  : []),
              ]
            : [];
        return {
          lifeArea: area.id,
          anchor,
          featured: cards[0] ?? null,
          additionalCount: Math.max(0, cards.length - 1),
          noteIds: cards.map((item) => item.noteId),
          cards,
        };
      }),
    ),
  };
}

const meta = {
  title: 'Rooms/Life Landscape',
  component: LandscapePage,
  args: {
    areas: areas.slice(0, 5),
    board: board(),
    onNavigate: () => undefined,
    onMove: async () => ({ hash: 'moved-hash' }),
    onReorder: async () => undefined,
    path: '/landscape',
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LandscapePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { board: board(areas.slice(0, 5), false) },
};
export const SparseMatrix: Story = {};
export const DenseMatrix: Story = {
  args: { areas, board: board(areas, true) },
};
export const Focus: Story = { args: { path: '/landscape/home' } };
export const Lens: Story = { args: { path: '/landscape/lens/vision' } };
export const DarkFocus: Story = {
  args: { path: '/landscape/home' },
  decorators: [
    (Story) => (
      <div className="studio-app" data-theme="deep-ocean">
        <Story />
      </div>
    ),
  ],
};
