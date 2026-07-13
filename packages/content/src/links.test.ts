import { describe, expect, it } from 'vitest';

import { extractLinks } from './links';

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
});
