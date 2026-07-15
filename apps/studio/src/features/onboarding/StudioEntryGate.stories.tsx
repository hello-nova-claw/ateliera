import type { Meta, StoryObj } from '@storybook/react-vite';
import { StudioEntryGate } from './StudioEntryGate';
import '../../app/app.css';

const anna = {
  name: 'Anna’s Studio',
  vaultId: 'studio:anna',
  createdAt: '2026-07-15T00:00:00.000Z',
};

const quietWork = {
  name: 'Quiet Work',
  vaultId: 'studio:quiet-work',
  createdAt: '2026-07-15T01:00:00.000Z',
};

const meta: Meta<typeof StudioEntryGate> = {
  title: 'Onboarding/Studio Entry Gate',
  component: StudioEntryGate,
  args: {
    browserStudios: [],
    error: undefined,
    isNative: false,
    onCreate: () => undefined,
    onOpen: () => undefined,
    studioAction: null,
    themePicker: <button type="button">Theme</button>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Returning: Story = {
  args: { browserStudios: [anna] },
};

export const SeveralSpaces: Story = {
  args: { browserStudios: [anna, quietWork] },
};

export const Native: Story = {
  args: { isNative: true },
};

export const Error: Story = {
  args: {
    error:
      'This Studio Space could not be opened. Choose its folder and try again.',
    isNative: true,
  },
};

export const LongName: Story = {
  args: {
    browserStudios: [
      {
        ...anna,
        name: 'A spacious place for family, curiosity, meaningful work, and ideas still becoming',
      },
    ],
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div className="studio-app" data-theme="deep-ocean">
        <Story />
      </div>
    ),
  ],
};
