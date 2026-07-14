import { describe, expect, it } from 'vitest';

import { isSafeMarkdownUrl, renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  it('treats imported raw HTML as inert text', () => {
    const html = renderMarkdown(
      '<img src=x onerror="alert(1)"><script>alert(2)</script><svg onload=alert(3)>',
    );

    expect(html).not.toMatch(/<(?:script|svg|img)\b/i);
    expect(html).not.toMatch(/\bon(?:error|load)\s*=/i);
    expect(html).toBe('<p>alert(2)</p>');
  });

  it('removes active URL schemes while preserving safe relative and HTTPS links', () => {
    const html = renderMarkdown(
      '[bad](javascript:alert(1)) [encoded](java%0ascript:alert(2)) ' +
        '[local](../Notes/A%20quiet%20day.md) [web](https://example.com/path?q=1)',
    );

    expect(html).not.toMatch(/javascript|java%0ascript/i);
    expect(html).toContain('href="../Notes/A%20quiet%20day.md"');
    expect(html).toContain('href="https://example.com/path?q=1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('does not load remote, active, or SVG image sources', () => {
    const html = renderMarkdown(
      '![remote](https://tracker.example/pixel.png) ![active](data:text/html;base64,AAAA) ' +
        '![svg](Attachments/drawing.svg) ![photo](Attachments/photo.jpg)',
    );

    expect(html).not.toContain('tracker.example');
    expect(html).not.toContain('data:text');
    expect(html).not.toContain('drawing.svg');
    expect(html).toContain('src="Attachments/photo.jpg"');
    expect(html).toContain('alt="photo"');
  });

  it('escapes Markdown text and attributes without weakening GFM structure', () => {
    const html = renderMarkdown('# A & B\n\n| Key | Value |\n| --- | --- |\n| `<safe>` | **yes** |');

    expect(html).toContain('<h1>A &amp; B</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>&lt;safe&gt;</code>');
    expect(html).toContain('<strong>yes</strong>');
  });
});

describe('isSafeMarkdownUrl', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,hello',
    'file:///private/notes.md',
    '//tracker.example/image.png',
    '\\server\\share',
  ])('rejects active or authority-changing URL %j', (url) => {
    expect(isSafeMarkdownUrl(url, 'link')).toBe(false);
  });

  it.each(['Notes/Today.md', '../Notes/Today.md', '#heading', 'https://example.com', 'mailto:me@example.com'])(
    'accepts safe link URL %j',
    (url) => {
      expect(isSafeMarkdownUrl(url, 'link')).toBe(true);
    },
  );
});
