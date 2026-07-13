import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Card } from './Card';

function InteractiveReflection() {
  const [status, setStatus] = useState('');

  return (
    <>
      <Card
        actions={
          <button type="button" onClick={() => setStatus('Reflection opened')}>
            Open reflection
          </button>
        }
        excerpt="Small, attentive steps become visible evidence over time."
        semanticType="reflection"
        title="What I learned"
      />
      <p aria-live="polite" className="visually-hidden" role="status">
        {status}
      </p>
    </>
  );
}

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
      <div className="primitive-preview">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Reflection: Story = {
  render: () => <InteractiveReflection />,
};

export const Uncharted: Story = {
  args: {
    excerpt: 'A possibility can stay open without becoming an obligation.',
    semanticType: 'uncharted',
    title: 'A cabin near the sea',
  },
};
