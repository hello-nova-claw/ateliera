import type { Meta, StoryObj } from '@storybook/react-vite';
import { PromptField } from './PromptField';

const meta: Meta<typeof PromptField> = {
  title: 'Primitives/PromptField',
  component: PromptField,
  args: {
    title: 'Already true',
    helper: 'What feels quietly and honestly true?',
    entries: [
      {
        id: '1',
        body: 'I need more space than I used to think I did.',
        date: '14 September 2026',
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="primitive-preview" style={{ maxInlineSize: '30rem' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Empty: Story = {
  args: {
    title: 'Practising now',
    helper: 'What quality are you learning to inhabit?',
    entries: [],
  },
};
