import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StudioNote } from '@studio/domain';
import { CardEditor } from './CardEditor';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-editor-story',
  title: 'The childhood hill',
  body: 'A quiet place with long grass and a path toward the horizon.',
  cardType: 'note',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection-garden'],
  lifeAreas: [],
  seasons: [],
  tags: [],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-13T00:00:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: {},
};

const meta: Meta<typeof CardEditor> = {
  title: 'Primitives/CardEditor',
  component: CardEditor,
  args: {
    note,
    onChange: () => undefined,
    onFlush: () => undefined,
    saveState: 'idle',
  },
  decorators: [
    (Story) => (
      <div className="primitive-preview">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Recovery: Story = {
  args: {
    recoveryDraft: { title: 'The hill', body: 'Words waiting safely.' },
    onDiscardDraft: () => undefined,
    onRestoreDraft: () => undefined,
  },
};

export const Conflict: Story = {
  args: {
    conflict: {
      local: {
        ...note,
        title: 'My version',
        body: 'The words I wrote locally.',
      },
      remote: {
        ...note,
        title: 'Other version',
        body: 'The durable words elsewhere.',
      },
    },
    note: { ...note, title: 'My version', body: 'The words I wrote locally.' },
    onKeepMine: () => undefined,
    onKeepOther: () => undefined,
    onManualMerge: () => undefined,
    saveState: 'conflict',
  },
};

export const Busy: Story = {
  args: {
    ...Conflict.args,
    conflictActionState: 'busy',
  },
};

export const Error: Story = {
  args: {
    onRetrySave: () => undefined,
    saveError: 'The note could not be saved. Your words are still waiting.',
    saveState: 'error',
  },
};
