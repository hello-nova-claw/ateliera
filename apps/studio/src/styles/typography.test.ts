import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const typography = readFileSync(resolve(process.cwd(), 'src/styles/typography.css'), 'utf8');

describe('Studio typography', () => {
  it('self-hosts exactly the approved family styles and weights', () => {
    expect(typography).toContain('font-family: Newsreader');
    expect(typography).toContain('font-family: "Hanken Grotesk"');
    expect(typography).toContain('font-family: Caveat');
    expect(typography).toContain('font-style: italic');
    expect(typography).toContain('font-weight: 400');
    expect(typography).toContain('font-weight: 500');
    expect(typography).toContain('font-weight: 600');
    expect(typography).toContain('font-weight: 700');
    expect(typography.match(/font-display: swap/g)).toHaveLength(18);
  });

  it('uses only bundled WOFF2 sources at runtime', () => {
    expect(typography).toContain('../assets/fonts/newsreader-normal-latin.woff2');
    expect(typography).toContain('../assets/fonts/hanken-grotesk-latin.woff2');
    expect(typography).toContain('../assets/fonts/caveat-latin.woff2');
    expect(typography).not.toMatch(/https?:|fonts\.googleapis|fonts\.gstatic/);
    expect(typography.match(/format\("woff2"\)/g)).toHaveLength(18);
  });

  it('publishes the approved fallback stacks as semantic variables', () => {
    expect(typography).toContain(
      '--studio-font-display: "Newsreader", "Iowan Old Style", "Baskerville", "Georgia", serif;',
    );
    expect(typography).toContain(
      '--studio-font-interface: "Hanken Grotesk", -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif;',
    );
    expect(typography).toContain(
      '--studio-font-handwritten: "Caveat", "Bradley Hand", cursive;',
    );
  });
});
