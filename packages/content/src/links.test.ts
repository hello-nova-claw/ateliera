import { describe, expect, it } from 'vitest';

import type { Root } from 'mdast';
import { extractLinks, extractLinksFromAst, markdownToPlainText } from './links';

describe('extractLinks', () => {
  it('extracts wiki links, aliases, stable Studio links, and local Markdown notes in source order', () => {
    expect(extractLinks('Meet [[A quiet morning]] and [[Future Self|her]]. See [proof](../Reflection/proof.md#today) and [identity](studio://note/01HX).')).toEqual([
      { kind: 'wiki', target: 'A quiet morning', label: 'A quiet morning' },
      { kind: 'wiki', target: 'Future Self', label: 'her' },
      { kind: 'path', target: '../Reflection/proof.md', label: 'proof' },
      { kind: 'id', target: '01HX', label: 'identity' },
    ]);
  });

  it('ignores images, external URLs, code spans, and fenced code', () => {
    expect(extractLinks('![cover](image.jpg) [site](https://example.com) [network](//example.com) [text](note.txt) `[[not a link]]`\n```md\n[[also ignored]]\n```\n[[kept]]')).toEqual([
      { kind: 'wiki', target: 'kept', label: 'kept' },
    ]);
  });

  it('deduplicates exact targets without losing first-seen order', () => {
    expect(extractLinks('[[One]] [[One|again]] [one](One.md)')).toEqual([
      { kind: 'wiki', target: 'One', label: 'One' },
      { kind: 'path', target: 'One.md', label: 'one' },
    ]);
  });

  it('preserves malformed URI paths for repair and ignores empty wiki targets', () => {
    expect(extractLinks('[[   ]] [broken](%E0%A4%A.md)')).toEqual([
      { kind: 'path', target: '%E0%A4%A.md', label: 'broken' },
    ]);
  });

  it('supports CommonMark angle-bracket destinations containing spaces and parentheses', () => {
    expect(extractLinks('[room](<Life Landscape/My Room (now).md>)')).toEqual([
      { kind: 'path', target: 'Life Landscape/My Room (now).md', label: 'room' },
    ]);
  });

  it('does not extract links from indented code or HTML comments', () => {
    expect(extractLinks('    [[indented]]\n\n<!-- [[commented]] [hidden](hidden.md) -->\n\n[[visible]]')).toEqual([
      { kind: 'wiki', target: 'visible', label: 'visible' },
    ]);
  });

  it('derives searchable text from rendered CommonMark rather than destinations or comments', () => {
    expect(markdownToPlainText('Visible [calm label](https://hidden.example/calm-secret) `code word` <!-- hidden comment -->')).toBe('Visible calm label code word');
  });

  it('resolves full, collapsed, and shortcut reference links through definitions', () => {
    expect(extractLinks('[proof][evidence] and [identity][] and [Evidence] plus [missing][absent] and [site][external]\n\n[evidence]: <../Reflection/Proof (now).md>\n[identity]: studio://note/01REF\n[external]: https://example.com')).toEqual([
      { kind: 'path', target: '../Reflection/Proof (now).md', label: 'proof' },
      { kind: 'id', target: '01REF', label: 'identity' },
    ]);
  });

  it('derives plain text from GFM tables without delimiter syntax', () => {
    expect(markdownToPlainText('| Name | Feeling |\n| --- | --- |\n| Anna | Calm |')).toBe('Name Feeling Anna Calm');
  });

  it('includes image alt text while omitting empty images and thematic markup', () => {
    expect(markdownToPlainText('![cover](cover.jpg) ![](quiet.jpg)\n\n---')).toBe('cover');
  });

  it('collects reference definitions recursively from blockquotes and lists', () => {
    expect(extractLinks('> [inside-quote]: quote.md\n>\n> [quote proof][inside-quote]\n\n- [inside-list]: list.md\n- [list proof][inside-list]')).toEqual([
      { kind: 'path', target: 'quote.md', label: 'quote proof' },
      { kind: 'path', target: 'list.md', label: 'list proof' },
    ]);
  });

  it('uses the first normalized reference definition in document order', () => {
    expect(extractLinks('[proof][SHARED]\n\n[shared]: first.md\n[SHARED]: second.md')).toEqual([
      { kind: 'path', target: 'first.md', label: 'proof' },
    ]);
  });

  it('leaves an unmatched linkReference unresolved without throwing', () => {
    const root: Root = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [{
          type: 'linkReference', identifier: 'missing', label: 'missing', referenceType: 'full',
          children: [{ type: 'text', value: 'missing' }],
        }],
      }],
    };
    expect(extractLinksFromAst(root)).toEqual([]);
  });
});
