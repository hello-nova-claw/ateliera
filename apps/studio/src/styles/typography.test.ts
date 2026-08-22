import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const typography = readFileSync(
  resolve(import.meta.dirname, 'typography.css'),
  'utf8',
);

describe('Studio typography', () => {
  it('self-hosts exactly the approved family styles and weights', () => {
    expect(typography).toContain('font-family: "Source Serif 4"');
    expect(typography).toContain('font-family: Figtree');
    expect(typography).toContain('font-family: "Nothing You Could Do"');
    expect(typography).toContain('font-style: italic');
    expect(typography).toContain('font-weight: 300');
    expect(typography).toContain('font-weight: 400');
    expect(typography).toContain('font-weight: 500');
    expect(typography).toContain('font-weight: 600');
    // 700 is unused under the revised type scale (ADR-009).
    expect(typography).not.toContain('font-weight: 700');
    expect(typography.match(/font-display: swap/g)).toHaveLength(15);
  });

  it('uses only bundled WOFF2 sources at runtime', () => {
    expect(typography).toContain(
      '../assets/fonts/source-serif-4-normal-latin.woff2',
    );
    expect(typography).toContain('../assets/fonts/figtree-latin.woff2');
    expect(typography).toContain(
      '../assets/fonts/nothing-you-could-do-latin.woff2',
    );
    expect(typography).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic/);
    expect(typography.match(/format\("woff2"\)/g)).toHaveLength(15);
  });

  it('publishes the approved fallback stacks as semantic variables', () => {
    expect(typography).toContain(
      '--studio-font-display: "Source Serif 4", "Iowan Old Style", "Charter", "Georgia", serif;',
    );
    expect(typography).toContain(
      '--studio-font-interface: "Figtree", -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif;',
    );
    expect(typography).toContain(
      '--studio-font-handwritten: "Nothing You Could Do", "Bradley Hand", cursive;',
    );
  });
});
