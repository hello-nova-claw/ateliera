import type { Preview } from '@storybook/react-vite';
import React from 'react';
import '../apps/studio/src/styles/tokens.css';
import '../apps/studio/src/styles/reset.css';
import '../apps/studio/src/styles/typography.css';
import './preview.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <main
        aria-label="Component preview"
        className="studio-app"
        data-theme="chamomile"
      >
        <h1 className="visually-hidden">Component preview</h1>
        <Story />
      </main>
    ),
  ],
  parameters: {
    a11y: { test: 'error' },
    controls: { expanded: true },
    layout: 'fullscreen',
  },
};

export default preview;
