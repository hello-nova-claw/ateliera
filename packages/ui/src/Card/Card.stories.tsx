import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Primitives/Card',
  component: Card,
  args: {
    excerpt: 'Small, attentive steps become visible evidence over time.',
    semanticType: 'reflection',
    title: 'What I learned',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36rem' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Reflection: Story = {
  args: {
    actions: <button type="button">Open reflection</button>,
  },
};

export const Uncharted: Story = {
  args: {
    excerpt: 'A possibility can stay open without becoming an obligation.',
    semanticType: 'uncharted',
    title: 'A cabin near the sea',
  },
};
