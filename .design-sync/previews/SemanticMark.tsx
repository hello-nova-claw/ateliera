import * as React from 'react';
import { SemanticMark } from '@studio/ui';

// Owned preview. The storybook "All Meanings" story arranges its six marks in a
// vertical grid via the story-local `.semantic-mark-preview` class defined in
// .storybook/preview.css — which is page decoration and doesn't ship to the
// bundle. Reproduce the same vertical rhythm here with an inline grid using the
// shipped spacing token, so the card matches the storybook render exactly.

export const Vision = () => <SemanticMark labelMode="visible" type="vision" />;

export const AllMeanings = () => (
  <div
    style={{
      display: 'grid',
      gap: 'var(--studio-space-4)',
      justifyItems: 'start',
    }}
  >
    <SemanticMark labelMode="visible" type="foundations" />
    <SemanticMark labelMode="visible" type="vision" />
    <SemanticMark labelMode="visible" type="growth" />
    <SemanticMark labelMode="visible" type="reflection" />
    <SemanticMark labelMode="visible" type="celebration" />
    <SemanticMark labelMode="visible" type="uncharted" />
  </div>
);
