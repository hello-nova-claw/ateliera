import type { Meta, StoryObj } from '@storybook/react-vite';
import { SemanticMark } from './SemanticMark';

const meta: Meta<typeof SemanticMark> = {
  title: 'Primitives/SemanticMark',
  component: SemanticMark,
  args: { labelMode: 'visible', type: 'vision' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Vision: Story = {};

export const AllMeanings: Story = {
  render: () => (
    <div className="semantic-mark-preview">
      <SemanticMark labelMode="visible" type="foundations" />
      <SemanticMark labelMode="visible" type="vision" />
      <SemanticMark labelMode="visible" type="growth" />
      <SemanticMark labelMode="visible" type="reflection" />
      <SemanticMark labelMode="visible" type="celebration" />
      <SemanticMark labelMode="visible" type="uncharted" />
    </div>
  ),
};
