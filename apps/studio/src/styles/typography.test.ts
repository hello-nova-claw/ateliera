import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const typography = readFileSync(
  resolve(import.meta.dirname, 'typography.css'),
  'utf8',
);

describe('Studio typography', () => {
  it('self-hosts exactly the approved family styles and weights', () => {
    expect(typography).toContain('font-family: "Cormorant Garamond"');
    expect(typography).toContain('font-family: Figtree');
    expect(typography).toContain('font-family: "Nothing You Could Do"');
    expect(typography).toContain('font-style: italic');
    // Cormorant ships 400/500; Figtree still supplies 600. 300 retired.
    expect(typography).not.toContain('font-weight: 300');
    expect(typography).toContain('font-weight: 400');
    expect(typography).toContain('font-weight: 500');
    expect(typography).toContain('font-weight: 600');
    // 700 is unused under the revised type scale (ADR-009).
    expect(typography).not.toContain('font-weight: 700');
    expect(typography.match(/font-display: swap/g)).toHaveLength(13);
  });

  it('uses only bundled WOFF2 sources at runtime', () => {
    expect(typography).toContain(
      '../assets/fonts/cormorant-garamond-normal-latin.woff2',
    );
    expect(typography).toContain('../assets/fonts/figtree-latin.woff2');
    expect(typography).toContain(
      '../assets/fonts/nothing-you-could-do-latin.woff2',
    );
    expect(typography).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic/);
    expect(typography.match(/format\("woff2"\)/g)).toHaveLength(13);
  });

  it('publishes the approved fallback stacks as semantic variables', () => {
    expect(typography).toContain(
      '--studio-font-display: "Cormorant Garamond", "Iowan Old Style", "Georgia", serif;',
    );
    expect(typography).toContain(
      '--studio-font-interface: "Figtree", -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif;',
    );
    expect(typography).toContain(
      '--studio-font-handwritten: "Nothing You Could Do", "Bradley Hand", cursive;',
    );
  });
});
