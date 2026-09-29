import type { Meta, StoryObj } from '@storybook/react-vite';
import { ListRow } from './ListRow';

const meta: Meta<typeof ListRow> = {
  title: 'Primitives/ListRow',
  component: ListRow,
  args: {
    title: 'The power of stillness',
    meta: '12 September 2026',
    href: '#open',
  },
  decorators: [
    (Story) => (
      <div className="primitive-preview" style={{ maxInlineSize: '28rem' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Archive: StoryObj = {
  render: () => (
    <div style={{ maxInlineSize: '28rem' }}>
      <ListRow href="#a" meta="12 September 2026" title="The power of stillness" />
      <ListRow href="#b" meta="3 August 2026" title="Lessons from a difficult season" />
      <ListRow href="#c" meta="21 July 2026" title="A conversation that stayed" />
      <ListRow href="#d" meta="14 June 2026" title="What I know now" />
    </div>
  ),
};
