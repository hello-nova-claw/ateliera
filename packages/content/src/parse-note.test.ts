import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { StudioNote } from '@studio/domain';
import { readFileSync } from 'node:fs';
import { inspectRepairSource, parseNote, serializeNote } from './index';

const input = `---
schema_version: 1
id: 01JTEST
card_type: vision
semantic_type: vision
status: active
rooms: []
life_areas: []
seasons: []
tags: []
created: 2026-07-13T10:00:00+10:00
updated: 2026-07-13T10:00:00+10:00
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
custom_key: keep-me
---

# Hello
`;

describe('parseNote', () => {
  it('preserves unknown frontmatter keys across a round trip', () => {
    const parsed = parseNote(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.note.extraFrontmatter).toEqual({ custom_key: 'keep-me' });
    const reparsed = parseNote(serializeNote(parsed.note));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.note.extraFrontmatter).toEqual({ custom_key: 'keep-me' });
  });

  it.each([
    'foundations',
    'vision',
    'growth',
    'reflection',
    'celebration',
    'uncharted',
  ] as const)('accepts %s', (semanticType) => {
    const parsed = parseNote(
      input.replace('semantic_type: vision', `semantic_type: ${semanticType}`),
    );
    expect(parsed.ok && parsed.note.semanticType).toBe(semanticType);
  });

  it.each([
    ['missing ID', input.replace('id: 01JTEST\n', ''), 'id'],
    [
      'invalid semantic type',
      input.replace('semantic_type: vision', 'semantic_type: action'),
      'semantic_type',
    ],
  ])('retains the body for %s', (_, text, path) => {
    const parsed = parseNote(text);
    expect(parsed).toMatchObject({
      ok: false,
      recoverable: true,
      rawBody: '\n# Hello\n',
    });
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.path === path)).toBe(true);
  });

  it('allows no title and preserves Unicode and raw HTML', () => {
    const body = '\n# Héllø 🌿\n\n<div data-note="yes">untouched</div>\n';
    const parsed = parseNote(input.replace('\n# Hello\n', body));
    expect(parsed.ok && parsed.note.title).toBeUndefined();
    expect(parsed.ok && parsed.note.body).toBe(body);
  });

  it('maps every optional recognized field', () => {
    const enriched = input
      .replace('id: 01JTEST', 'id: 01JTEST\ntitle: Home')
      .replace('life_areas: []', 'life_areas: []\nlandscape_anchor: vision')
      .replace(
        'attachments: []',
        'source: { title: Book, creator: Anna, url: https://example.test }\nsource_notes: [source-1, source-2]\nattachments: []',
      )
      .replace(
        'display: { featured: false }',
        'display: { cover: cover.jpg, featured: false }',
      );
    const parsed = parseNote(enriched);
    expect(parsed.ok && parsed.note).toMatchObject({
      title: 'Home',
      landscapeAnchor: 'vision',
      source: { title: 'Book' },
      sourceNoteIds: ['source-1', 'source-2'],
      display: { cover: 'cover.jpg' },
    });
    if (parsed.ok) {
      const reparsed = parseNote(serializeNote(parsed.note));
      expect(reparsed.ok && reparsed.note).toMatchObject({
        landscapeAnchor: 'vision',
        source: { creator: 'Anna' },
        sourceNoteIds: ['source-1', 'source-2'],
      });
    }
  });

  it('preserves CRLF line endings', () => {
    const crlf = input.replaceAll('\n', '\r\n');
    const parsed = parseNote(crlf);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.note.body).toBe('\r\n# Hello\r\n');
      const lfParsed = parseNote(input);
      expect(lfParsed.ok).toBe(true);
      if (lfParsed.ok)
        expect(serializeNote(parsed.note)).toBe(
          serializeNote(lfParsed.note).replaceAll('\n', '\r\n'),
        );
    }
  });

  it('uses the opening delimiter EOL for frontmatter and preserves a mixed-EOL body exactly', () => {
    const mixed = input
      .replaceAll('\n', '\r\n')
      .replace('\r\n# Hello\r\n', '\r\n# Hello\nnext\r\n');
    const parsed = parseNote(mixed);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.note.body).toBe('\r\n# Hello\nnext\r\n');
      const serialized = serializeNote(parsed.note);
      expect(serialized.endsWith(parsed.note.body)).toBe(true);
      expect(serialized.slice(0, -parsed.note.body.length)).not.toMatch(
        /(?<!\r)\n/,
      );
    }
  });

  it('disables YAML aliases', () => {
    const aliased = input
      .replace('rooms: []', 'rooms: &rooms []')
      .replace('life_areas: []', 'life_areas: *rooms');
    expect(parseNote(aliased)).toMatchObject({
      ok: false,
      rawBody: '\n# Hello\n',
      errors: [{ code: 'yaml-alias' }],
    });
  });

  it('classifies missing, malformed, and non-mapping metadata', () => {
    expect(parseNote('# body')).toMatchObject({
      ok: false,
      rawBody: '# body',
      errors: [{ code: 'missing-frontmatter' }],
    });
    expect(parseNote('---\nid: [\n---\nbody')).toMatchObject({
      ok: false,
      rawBody: 'body',
      errors: [{ code: 'malformed-frontmatter' }],
    });
    expect(parseNote('---\nhello\n---\nbody')).toMatchObject({
      ok: false,
      rawBody: 'body',
      errors: [{ code: 'invalid-frontmatter' }],
    });
    expect(parseNote('---\nnull\n---\nbody')).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid-frontmatter' }],
    });
    expect(parseNote('---\n[]\n---\nbody')).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid-frontmatter' }],
    });
  });

  it('classifies unterminated frontmatter and retains the entire ambiguous source', () => {
    const unterminated =
      '---\nschema_version: 1\nid: 01JTEST\n\n# Still recoverable\n';
    expect(parseNote(unterminated)).toEqual({
      ok: false,
      rawBody: unterminated,
      recoverable: true,
      errors: [
        {
          code: 'malformed-frontmatter',
          message:
            'Frontmatter is unterminated; rawBody contains the complete source because metadata and Markdown cannot be distinguished safely.',
        },
      ],
    });
  });

  it.each([
    ['created', 'not-a-date'],
    ['created', '2026-07-13'],
    ['created', '2026-99-99'],
    ['created', '2026-07-13 10:00'],
    ['created', '2026-07-13T10:00:00'],
    ['updated', 'tomorrow'],
    ['updated', '2026-07-13'],
    ['updated', '2026-07-13T10:00:00'],
  ])('rejects invalid %s timestamp: %s', (field, timestamp) => {
    const parsed = parseNote(
      input.replace(
        `${field}: 2026-07-13T10:00:00+10:00`,
        `${field}: ${timestamp}`,
      ),
    );
    expect(parsed).toMatchObject({ ok: false, rawBody: '\n# Hello\n' });
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.path === field)).toBe(true);
  });

  it('accepts timestamps with numeric offsets and Z', () => {
    const parsed = parseNote(
      input.replace(
        'updated: 2026-07-13T10:00:00+10:00',
        'updated: 2026-07-13T00:00:00Z',
      ),
    );
    expect(parsed).toMatchObject({ ok: true });
  });

  it('round trips generated valid notes with semantic equality', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 80 }),
        fc.array(fc.string({ maxLength: 20 }), { maxLength: 4 }),
        (body, tags) => {
          const note: StudioNote = {
            schemaVersion: 1,
            id: '01JTESTPROPERTY',
            title: 'A title',
            body,
            cardType: 'fragment',
            semanticType: 'reflection',
            status: 'active',
            rooms: [],
            lifeAreas: [],
            seasons: [],
            tags,
            created: '2026-07-13T10:00:00+10:00',
            updated: '2026-07-13T10:00:00+10:00',
            attachments: [],
            display: { featured: false },
            privacy: { sensitivity: 'private', aiAccess: 'ask' },
            extraFrontmatter: { custom: ['kept'] },
          };
          const parsed = parseNote(serializeNote(note));
          expect(parsed.ok).toBe(true);
          if (parsed.ok)
            expect(parsed.note).toEqual({ ...note, lineEnding: '\n' });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('round trips the representative vault fixture', () => {
    const fixture = readFileSync(
      new URL(
        '../../../fixtures/vaults/anna-sample/2026-07-13--a-calm-home--abc123.md',
        import.meta.url,
      ),
      'utf8',
    );
    const parsed = parseNote(fixture);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.note.body).toContain('Ordinary **Markdown** remains mine.');
      expect(parseNote(serializeNote(parsed.note))).toMatchObject({ ok: true });
    }
  });
});

describe('inspectRepairSource', () => {
  it('recovers safe frontmatter values, body, and CRLF without accepting aliases', () => {
    const source = [
      '---',
      'schema_version: 1',
      'semantic_type: wrong',
      'attachments:',
      '  - Media/photo.jpg',
      'custom_safe:',
      '  nested: true',
      '---',
      'Body stays exact.',
    ].join('\r\n');

    expect(inspectRepairSource(source)).toEqual({
      body: 'Body stays exact.',
      lineEnding: '\r\n',
      frontmatter: expect.objectContaining({
        attachments: ['Media/photo.jpg'],
        custom_safe: { nested: true },
      }),
    });
    expect(
      inspectRepairSource('---\na: &x value\nb: *x\n---\nBody').frontmatter,
    ).toEqual({});
  });

  it('returns the recoverable body with no metadata for malformed or unsafe mappings', () => {
    expect(inspectRepairSource('---\nbroken: [\n---\nBody')).toEqual({
      body: 'Body',
      lineEnding: '\n',
      frontmatter: {},
    });
    expect(
      inspectRepairSource('---\n- not\n- a map\n---\nBody').frontmatter,
    ).toEqual({});
    expect(inspectRepairSource('No frontmatter').body).toBe('No frontmatter');
  });

  it('drops unsafe scalar, array, nested, key, and excessively deep values', () => {
    expect(inspectRepairSource('---\n.nan\n---\nBody').frontmatter).toEqual({});
    expect(
      inspectRepairSource('---\n- safe\n- .nan\n---\nBody').frontmatter,
    ).toEqual({});
    expect(
      inspectRepairSource('---\nsafe: [.nan]\n---\nBody').frontmatter,
    ).toEqual({});
    expect(
      inspectRepairSource('---\nsafe:\n  nested: .nan\n---\nBody').frontmatter,
    ).toEqual({});
    for (const key of [
      '""',
      '"__proto__"',
      'prototype',
      'constructor',
      `"${'x'.repeat(129)}"`,
      '"é"',
    ]) {
      expect(
        inspectRepairSource(`---\n${key}: value\n---\nBody`).frontmatter,
      ).toEqual({});
    }
    const deeplyNested = Array.from(
      { length: 18 },
      (_, index) => `${'  '.repeat(index)}a:`,
    ).join('\n');
    expect(
      inspectRepairSource(
        `---\n${deeplyNested}\n${'  '.repeat(18)}value\n---\nBody`,
      ).frontmatter,
    ).toEqual({});
  });
});
