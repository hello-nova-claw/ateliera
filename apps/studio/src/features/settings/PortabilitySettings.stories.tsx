import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  PortabilitySettings,
  type PortabilityPreview,
} from './PortabilitySettings';

const preview: PortabilityPreview = {
  archiveName: 'the-studio-2026-07-14.zip',
  exportedAt: '2026-07-14T09:00:00.000Z',
  items: [
    {
      action: 'create',
      path: 'Reflection Garden/A quiet morning.md',
      size: 812,
    },
    {
      action: 'create',
      path: 'Uncharted/The childhood hill.md',
      size: 1_024,
    },
    {
      action: 'overwrite',
      path: '.studio/settings.json',
      size: 214,
    },
    {
      action: 'skip',
      path: 'Attachments/hill-at-dusk.jpg',
      size: 48_120,
    },
  ],
};

const conflictPreview: PortabilityPreview = {
  ...preview,
  items: [
    ...preview.items,
    {
      action: 'conflict',
      path: 'Identity/Future self.md',
      size: 642,
      reason:
        'The current file belongs to future-self-now; this backup belongs to future-self-then.',
    },
  ],
};

const meta: Meta<typeof PortabilitySettings> = {
  title: 'Rooms/Settings/Portability',
  component: PortabilitySettings,
  args: {
    onExport: async () => undefined,
    onPrepareRestore: async () => preview,
    onRestore: async () => undefined,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          margin: '0 auto',
          maxWidth: '1120px',
          padding: '48px 32px',
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Preview: Story = {};

export const Conflict: Story = {
  args: {
    onPrepareRestore: async () => conflictPreview,
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
          padding: '1px',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
