import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeasonTimeline } from './SeasonTimeline';

const seasons = [
  { id: 'spring', name: 'Spring', theme: 'Renewal & growth', dateRange: 'Mar – May 2026' },
  { id: 'summer', name: 'Summer', theme: 'Expansion & joy', dateRange: 'Jun – Aug 2026' },
  { id: 'autumn', name: 'Autumn', theme: 'Integration & release', dateRange: 'Sep – Nov 2026' },
  { id: 'winter', name: 'Winter', theme: 'Rest & reflection', dateRange: 'Dec – Feb 2027' },
];

const meta: Meta<typeof SeasonTimeline> = {
  title: 'Primitives/SeasonTimeline',
  component: SeasonTimeline,
  args: { seasons, currentId: 'autumn' },
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

export const YourChapters: Story = {};
