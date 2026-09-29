import type { Meta, StoryObj } from '@storybook/react-vite';
import { BrandMark } from './BrandMark';

const meta: Meta<typeof BrandMark> = {
  title: 'Brand/BrandMark',
  component: BrandMark,
  args: { variant: 'mark', tone: 'ink', size: 48 },
  decorators: [
    (Story) => (
      <div className="primitive-preview">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Mark: Story = {};

export const Foil: Story = { args: { tone: 'foil' } };

export const Lockup: Story = { args: { variant: 'lockup', size: 64 } };

export const LockupFoil: Story = {
  args: { variant: 'lockup', tone: 'foil', size: 64 },
};
