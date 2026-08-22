import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SemanticMark } from '../SemanticMark/SemanticMark';
import { Card } from './Card';
import './Card.stories.css';

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

// The stock-fill rule (type & token spec §5): a `--studio-stock-*` fill belongs
// only to something that genuinely is a card. A note listed inside a room is a
// hairline-ruled row with a coloured mark, never a filled panel.
export const ListRowVsCard: StoryObj = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="fill-rule">
      <section aria-label="List rows" className="fill-rule__group">
        <p className="fill-rule__caption">
          <strong>List row</strong> — a note inside a room. Hairline rule,
          coloured mark, no fill.
        </p>
        <ul className="fill-rule__rows">
          <li className="fill-rule__row">
            <SemanticMark labelMode="hidden" type="reflection" />
            <h3 className="fill-rule__row-title">What I learned</h3>
            <a className="fill-rule__row-action" href="#open">
              Open
            </a>
          </li>
          <li className="fill-rule__row">
            <SemanticMark labelMode="hidden" type="growth" />
            <h3 className="fill-rule__row-title">A small repair</h3>
            <a className="fill-rule__row-action" href="#open">
              Open
            </a>
          </li>
        </ul>
      </section>
      <section aria-label="Card" className="fill-rule__group">
        <p className="fill-rule__caption">
          <strong>Card</strong> — a Landscape note or Season tile. A{' '}
          <code>--studio-stock-*</code> fill is allowed here.
        </p>
        <article className="fill-rule__card">
          <SemanticMark labelMode="visible" type="reflection" />
          <h3 className="fill-rule__card-title">What I learned</h3>
          <p className="fill-rule__card-excerpt">
            Small, attentive steps become visible evidence over time.
          </p>
        </article>
      </section>
    </div>
  ),
};
