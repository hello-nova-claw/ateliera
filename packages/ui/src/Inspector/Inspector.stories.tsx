import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StudioNote } from '@studio/domain';
import { Inspector, type InspectorResult } from './Inspector';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'quiet-morning',
  title: 'A quiet morning that worked',
  body: 'The kitchen was still. I noticed that leaving ten unplanned minutes made the whole morning feel more spacious.',
  cardType: 'reflection',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection-garden'],
  lifeAreas: ['family', 'home'],
  seasons: ['winter-2026'],
  tags: ['calm', 'spaciousness'],
  created: '2026-07-13T08:10:00.000Z',
  updated: '2026-07-14T07:45:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: {},
};

const fullResult: InspectorResult = {
  note,
  path: 'Reflection Garden/A quiet morning that worked.md',
  hash: 'storybook-hash',
  backlinks: [
    { id: 'winter-intention', path: 'Current Season/Winter intention.md', title: 'A gentler winter' },
    { id: 'same-a', path: 'Wisdom/First calm note.md', title: 'Calm' },
    { id: 'same-b', path: 'Wisdom/Second calm note.md', title: 'Calm' },
  ],
  forwardLinks: [
    {
      occurrence: 0, linkKind: 'id', target: 'winter-intention', label: 'A gentler winter',
      start: 0, end: 22, state: 'resolved', targetId: 'winter-intention',
    },
    {
      occurrence: 1, linkKind: 'wiki', target: 'Old rhythm', label: 'Old rhythm',
      start: 23, end: 37, state: 'broken',
    },
    {
      occurrence: 2, linkKind: 'wiki', target: 'Home', label: 'Home',
      start: 38, end: 46, state: 'ambiguous', candidateIds: ['home-vision', 'home-foundation'],
    },
  ],
};

const meta: Meta<typeof Inspector> = {
  title: 'Overlays/Inspector',
  component: Inspector,
  args: {
    isOpen: true,
    onClose: () => undefined,
    onOpenNote: async () => undefined,
    onReconnect: async () => undefined,
    onRepairLink: async () => undefined,
    onRepairMissing: async () => undefined,
    onRestoreArchived: async () => undefined,
    onRetry: async () => undefined,
    result: fullResult,
  },
  decorators: [
    (Story) => (
      <div className="studio-app" style={{ minHeight: '100vh' }}>
        <button type="button">Inspector opener</button>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};

export const Sparse: Story = {
  args: {
    result: {
      ...fullResult,
      note: { ...note, title: 'One sentence', body: 'Today, enough was enough.', tags: [] },
      backlinks: [],
      forwardLinks: [],
    },
  },
};

export const Dense: Story = {
  args: {
    result: {
      ...fullResult,
      note: {
        ...note,
        body: Array.from(
          { length: 12 },
          (_, index) => `Reflection ${index + 1}: a long, user-authored thought that wraps without being clipped.`,
        ).join('\n\n'),
      },
    },
  },
};

export const Archived: Story = {
  args: { result: { ...fullResult, note: { ...note, status: 'archived' } } },
};

export const OfflineWithContent: Story = { args: { state: 'offline' } };
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = {
  args: { errorMessage: 'The Studio folder is unavailable. The Markdown file has not changed.', state: 'error' },
};
export const Missing: Story = { args: { state: 'missing' } };
