import { describe, expect, it } from 'vitest';

import { editableMarkdownLinks, rewriteMarkdownLink } from './link-edit';

describe('editableMarkdownLinks', () => {
  it('locates repeated wiki, inline, and reference links without collapsing occurrences', () => {
    const markdown = [
      'See [[Old|the first]], [[Old]], [inline](Notes/Old.md), and [reference][old].',
      '',
      '[old]: studio://note/old-id',
    ].join('\n');

    expect(editableMarkdownLinks(markdown)).toEqual([
      expect.objectContaining({ index: 0, kind: 'wiki', target: 'Old', label: 'the first' }),
      expect.objectContaining({ index: 1, kind: 'wiki', target: 'Old', label: 'Old' }),
      expect.objectContaining({ index: 2, kind: 'path', target: 'Notes/Old.md', label: 'inline' }),
      expect.objectContaining({ index: 3, kind: 'id', target: 'old-id', label: 'reference' }),
    ]);
  });

  it('ignores apparent links in code and imported HTML', () => {
    const markdown = '`[[code]]`\n\n<div>[[html]]</div>\n\n[[real]]';
    expect(editableMarkdownLinks(markdown)).toEqual([
      expect.objectContaining({ kind: 'wiki', target: 'real' }),
    ]);
  });

  it('keeps the first reference definition and ignores unsafe or unsupported destinations', () => {
    const markdown = [
      '[First][same] [Missing][none] [web](https://example.com) [protocol](//example.com)',
      '[plain](note.txt) [empty](studio://note/) [encoded](Notes/My%20Note.md#part)',
      '[bad](Notes/%ZZ.md)',
      '',
      '[same]: First.md',
      '[same]: Second.md',
    ].join('\n');
    expect(editableMarkdownLinks(markdown)).toEqual([
      expect.objectContaining({ kind: 'path', target: 'First.md', label: 'First' }),
      expect.objectContaining({ kind: 'path', target: 'Notes/My Note.md', label: 'encoded' }),
      expect.objectContaining({ kind: 'path', target: 'Notes/%ZZ.md', label: 'bad' }),
    ]);
  });

  it('does not confuse ordinary shortcut references at document boundaries with wiki links', () => {
    expect(editableMarkdownLinks('[first]\n\n[first]: First.md')).toEqual([
      expect.objectContaining({ kind: 'path', target: 'First.md' }),
    ]);
    expect(editableMarkdownLinks('[last]: Last.md\n\n[last]')).toEqual([
      expect.objectContaining({ kind: 'path', target: 'Last.md' }),
    ]);
    expect(editableMarkdownLinks('A [middle][ref].\n\n[ref]: Middle.md')).toEqual([
      expect.objectContaining({ kind: 'path', target: 'Middle.md' }),
    ]);
  });

  it('keeps wiki label semantics when a matching Markdown definition also exists', () => {
    const markdown = '[[Old|friendly]] [[Old| ]]\n\n[old|friendly]: First.md\n[old|]: Second.md';
    expect(editableMarkdownLinks(markdown)).toEqual([
      expect.objectContaining({ kind: 'wiki', target: 'Old', label: 'friendly' }),
      expect.objectContaining({ kind: 'wiki', target: 'Old', label: 'Old' }),
    ]);
  });

  it('ignores incomplete and empty wiki syntax while continuing to later links', () => {
    expect(editableMarkdownLinks('[[]] then [[unfinished and [[real]]')).toEqual([
      expect.objectContaining({ kind: 'wiki', target: 'unfinished and [[real' }),
    ]);
    expect(editableMarkdownLinks('prefix [[unfinished')).toEqual([]);
  });
});

describe('rewriteMarkdownLink', () => {
  it('rewrites only the selected occurrence using AST source positions', () => {
    const source = '[[Old]] and [[Old]]';
    expect(rewriteMarkdownLink(source, 1, { kind: 'id', target: 'new-id' })).toBe(
      '[[Old]] and [Old](studio://note/new-id)',
    );
  });

  it('replaces a reference occurrence without modifying its shared definition', () => {
    const source = '[First][shared] and [Second][shared]\n\n[shared]: Missing.md';
    expect(rewriteMarkdownLink(source, 1, { kind: 'path', target: 'Found.md' })).toBe(
      '[First][shared] and [Second](Found.md)\n\n[shared]: Missing.md',
    );
  });

  it('removes link syntax while preserving the visible label', () => {
    expect(rewriteMarkdownLink('Before [[Old|friendly]] after', 0, { kind: 'remove' })).toBe(
      'Before friendly after',
    );
  });

  it('bounds occurrence and rejects unsafe destinations', () => {
    expect(() => rewriteMarkdownLink('[[Old]]', 2, { kind: 'remove' })).toThrow(RangeError);
    expect(() =>
      rewriteMarkdownLink('[[Old]]', 0, { kind: 'path', target: '../outside.md' }),
    ).toThrow('safe relative Markdown path');
    expect(() =>
      rewriteMarkdownLink('[[Old]]', 0, { kind: 'id', target: 'bad/id' }),
    ).toThrow('safe note ID');
  });

  it.each(['', 'x'.repeat(129), ' spaced ', 'e\u0301', 'bad?id']) (
    'rejects unsafe note id %j',
    (target) => {
      expect(() => rewriteMarkdownLink('[[Old]]', 0, { kind: 'id', target })).toThrow(
        'safe note ID',
      );
    },
  );

  it.each([
    '',
    'x'.repeat(1_025),
    ' spaced.md ',
    '/absolute.md',
    'back\\slash.md',
    'null\0byte.md',
    'angle>.md',
    'C:/drive.md',
    'not-markdown.txt',
  ])('rejects unsafe Markdown path %j', (target) => {
    expect(() => rewriteMarkdownLink('[[Old]]', 0, { kind: 'path', target })).toThrow(
      'safe relative Markdown path',
    );
  });

  it('allows normalized relative path segments without escaping above the vault', () => {
    expect(rewriteMarkdownLink('[[Old]]', 0, { kind: 'path', target: './Folder/../Found.md' })).toBe(
      '[Old](./Folder/../Found.md)',
    );
  });

  it.each(['', 'bad]]title', 'bad\ntitle', 'bad\rtitle'])(
    'rejects unsafe wiki target %j',
    (target) => {
      expect(() => rewriteMarkdownLink('[[Old]]', 0, { kind: 'wiki', target })).toThrow(
        'safe wiki title',
      );
    },
  );

  it('preserves a distinct label in a repaired wiki link', () => {
    expect(rewriteMarkdownLink('[[Old|friendly]]', 0, { kind: 'wiki', target: 'New' })).toBe(
      '[[New|friendly]]',
    );
    expect(rewriteMarkdownLink('[[Old]]', 0, { kind: 'wiki', target: 'Old' })).toBe('[[Old]]');
  });

  it('escapes Markdown-sensitive labels when relinking', () => {
    expect(rewriteMarkdownLink('[[Old|a\\b]c]]', 0, { kind: 'id', target: 'new' })).toBe(
      '[a\\\\b\\]c](studio://note/new)',
    );
  });

  it.each([-1, 0.5, Number.NaN])('rejects invalid occurrence %s', (occurrence) => {
    expect(() => rewriteMarkdownLink('[[Old]]', occurrence, { kind: 'remove' })).toThrow(
      'outside this note',
    );
  });
});
