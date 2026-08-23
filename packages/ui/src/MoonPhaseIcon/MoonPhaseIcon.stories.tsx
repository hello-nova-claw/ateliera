import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonPhaseIcon } from './MoonPhaseIcon';

const meta: Meta<typeof MoonPhaseIcon> = {
  title: 'Primitives/MoonPhaseIcon',
  component: MoonPhaseIcon,
  args: { illumination: 0.85, litSide: 'right', size: 48, label: 'Waxing gibbous' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WaxingGibbous: Story = {};

const PHASES = [
  { label: 'New', illumination: 0, litSide: 'right' },
  { label: 'Waxing crescent', illumination: 0.15, litSide: 'right' },
  { label: 'First quarter', illumination: 0.5, litSide: 'right' },
  { label: 'Waxing gibbous', illumination: 0.85, litSide: 'right' },
  { label: 'Full', illumination: 1, litSide: 'right' },
  { label: 'Waning gibbous', illumination: 0.85, litSide: 'left' },
  { label: 'Last quarter', illumination: 0.5, litSide: 'left' },
  { label: 'Waning crescent', illumination: 0.15, litSide: 'left' },
] as const;

export const AllPhases: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
      {PHASES.map((phase) => (
        <figure
          key={phase.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            margin: 0,
            font: 'var(--studio-type-meta)',
          }}
        >
          <MoonPhaseIcon
            illumination={phase.illumination}
            label={phase.label}
            litSide={phase.litSide}
            size={48}
          />
          <figcaption>
            {phase.label}
            <br />
            {Math.round(phase.illumination * 100)}%
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};
