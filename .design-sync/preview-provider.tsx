// Preview wrapper for design-sync. Reproduces the essential context the
// repo's .storybook/preview.tsx decorator provides: the `.studio-app` root
// class plus the default `chamomile` theme. Every colour token in
// apps/studio/src/styles/tokens.css is scoped under `.studio-app`, so without
// this wrapper previews render with no colours at all. Shipped to the bundle
// via cfg.extraEntries and named as cfg.provider.component.
import React from 'react';

export function StudioThemeRoot({ children }: { children?: React.ReactNode }) {
  return (
    <div className="studio-app" data-theme="chamomile">
      {children}
    </div>
  );
}
