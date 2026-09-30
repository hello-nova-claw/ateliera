import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, type IconName } from './Icon';

const names: IconName[] = [
  'waves',
  'sun',
  'leaf',
  'moon',
  'sparkle',
  'constellation',
  'chevron',
  'back',
  'plus',
  'more',
];

const meta: Meta<typeof Icon> = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'leaf', size: 24 },
  decorators: [
    (Story) => (
      <div className="primitive-preview" style={{ color: 'var(--studio-color-ink)' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const TheSet: StoryObj = {
  render: () => (
    <ul
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, auto)',
        gap: 'var(--studio-space-6)',
        margin: 0,
        padding: 0,
        listStyle: 'none',
        color: 'var(--studio-color-ink)',
      }}
    >
      {names.map((name) => (
        <li
          key={name}
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 'var(--studio-space-2)',
            font: 'var(--studio-type-meta)',
            color: 'var(--studio-color-ink-soft)',
          }}
        >
          <Icon name={name} size={28} />
          {name}
        </li>
      ))}
    </ul>
  ),
};

export const MeaningColours: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--studio-space-5)' }}>
      <Icon name="waves" size={28} style={{ color: 'var(--studio-color-foundation)' }} />
      <Icon name="sun" size={28} style={{ color: 'var(--studio-color-vision)' }} />
      <Icon name="leaf" size={28} style={{ color: 'var(--studio-color-growth)' }} />
      <Icon name="moon" size={28} style={{ color: 'var(--studio-color-reflection)' }} />
      <Icon name="sparkle" size={28} style={{ color: 'var(--studio-color-celebration)' }} />
      <Icon
        name="constellation"
        size={28}
        style={{ color: 'var(--studio-color-uncharted)' }}
      />
    </div>
  ),
};
