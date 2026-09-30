import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save reflection', variant: 'primary' },
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

export const Primary: Story = {};

export const Secondary: Story = {
  args: { children: 'Cancel', variant: 'secondary' },
};

export const Quiet: Story = {
  args: { children: 'Add', variant: 'quiet' },
};

export const AllThree: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--studio-space-4)', alignItems: 'center' }}>
      <Button variant="primary">Save</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="quiet">Add</Button>
    </div>
  ),
};
