import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoomHeading } from './RoomHeading';
import './RoomHeading.stories.css';

const meta: Meta<typeof RoomHeading> = {
  title: 'Primitives/RoomHeading',
  component: RoomHeading,
  args: {
    eyebrow: 'life by design',
    title: 'Your life, held together',
    intro:
      'A private studio for designing a life from the inside out. Everything here stays on your own device.',
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

export const Default: Story = {};

// The greeting is display italic now, not a marker-pen hand; the title is the
// single hero. See ADR-009 and the type & token spec.
export const WithoutIntro: Story = {
  args: {
    eyebrow: 'currently becoming',
    title: 'A season of rest',
    intro: undefined,
  },
};

interface Specimen {
  token: string;
  className: string;
  sample: string;
}

// Every type token from tokens.css at its real size, in scale order. This
// specimen is the contract: a new contributor can see what each token is for.
const specimens: Specimen[] = [
  {
    token: '--studio-type-eyebrow',
    className: 'type-specimen__sample--eyebrow',
    sample: 'currently becoming',
  },
  {
    token: '--studio-type-greeting',
    className: 'type-specimen__sample--greeting',
    sample: 'life by design',
  },
  {
    token: '--studio-type-room-title',
    className: 'type-specimen__sample--room-title',
    sample: 'Room title, one hero per room',
  },
  {
    token: '--studio-type-page-subtitle',
    className: 'type-specimen__sample--page-subtitle',
    sample:
      'Page subtitle. A private studio for designing a life from the inside out.',
  },
  {
    token: '--studio-type-section',
    className: 'type-specimen__sample--section',
    sample: 'Section heading',
  },
  {
    token: '--studio-type-card-title',
    className: 'type-specimen__sample--card-title',
    sample: 'Card title',
  },
  {
    token: '--studio-type-body',
    className: 'type-specimen__sample--body',
    sample:
      'Body. A practice that survives ordinary Tuesdays can become a life, and the measure it sits on is 576px so every module shares an edge.',
  },
  {
    token: '--studio-type-meta',
    className: 'type-specimen__sample--meta',
    sample: 'Meta. What would an ordinary Tuesday look like if this were true?',
  },
  {
    token: '--studio-type-quote',
    className: 'type-specimen__sample--quote',
    sample: 'Quote. Small, attentive steps become visible evidence over time.',
  },
  {
    token: '--studio-type-label',
    className: 'type-specimen__sample--label',
    sample: 'Label text',
  },
  {
    token: '--studio-type-control',
    className: 'type-specimen__sample--control',
    sample: 'Control · Open season',
  },
  {
    token: '--studio-type-signature',
    className: 'type-specimen__sample--signature',
    sample: 'inside out',
  },
];

export const TypeScale: StoryObj = {
  render: () => (
    <section aria-label="Studio type scale" className="type-specimen">
      {specimens.map((specimen) => (
        <div className="type-specimen__row" key={specimen.token}>
          <p className="type-specimen__token">{specimen.token}</p>
          <p className={`type-specimen__sample ${specimen.className}`}>
            {specimen.sample}
          </p>
        </div>
      ))}
    </section>
  ),
};
