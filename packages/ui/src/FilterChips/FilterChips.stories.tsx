import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FilterChips } from './FilterChips';

const items = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'images', label: 'Images' },
  { id: 'reflections', label: 'Reflections' },
];

function Interactive() {
  const [selectedId, setSelectedId] = useState('all');
  return (
    <FilterChips
      items={items}
      label="Filter archive"
      onSelect={setSelectedId}
      selectedId={selectedId}
    />
  );
}

const meta: Meta<typeof FilterChips> = {
  title: 'Primitives/FilterChips',
  component: FilterChips,
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

export const Interactive_: Story = { render: () => <Interactive /> };

export const Selected: Story = {
  args: { items, selectedId: 'notes', label: 'Filter archive', onSelect: () => {} },
};
