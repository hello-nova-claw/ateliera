import { describe, expect, it } from 'vitest';
import type { StudioNote } from '@studio/domain';
import { parseNote, serializeNote } from './index';

// Golden notes for the native app's frontmatter reader and writer. Each case is
// one string written by `serializeNote` as a title, a top-level unknown key, a
// nested map value, a list item and a value inside a list of maps, so the
// Swift tests can check every quoting style and indent against the web output
// byte for byte. Regenerate with `pnpm --filter @studio/content exec vitest
// run src/yaml-parity.test.ts -u --coverage.enabled=false`.

const handPicked = [
  '',
  'plain words',
  'Note: "quoted"',
  "it's: here",
  'both \' and " quotes',
  'back\\slash',
  'a \\"tricky\\" one: yes',
  ' leading space',
  'trailing space ',
  'colon at end:',
  'a #hashtag',
  'a#b',
  '#hash first',
  '- dash space',
  '-dash',
  '?',
  '? q',
  ':colon first',
  ': colon space',
  '[bracket',
  '{brace',
  '&anchor',
  '*alias',
  '!tag',
  '|pipe',
  '>fold',
  '%percent',
  '@at',
  '`tick',
  ',comma',
  '~',
  'null',
  'Null',
  'NULL',
  'nUll',
  'true',
  'True',
  'TRUE',
  'tRUE',
  'false',
  'yes',
  'no',
  '5',
  '-5',
  '+5',
  '007',
  '0x1F',
  '0o17',
  '1.5',
  '.5',
  '1.',
  '1e3',
  '1E-3',
  '.inf',
  '-.Inf',
  '.nan',
  '.NaN',
  '2026-07-14',
  '2026-07-14T09:00:00+10:00',
  'https://example.com/a?b=c#d',
  'tab\there',
  '\ttab first',
  'nul\u0000byte',
  'bell\u0007',
  'esc\u001b[0m',
  'cr\rhere',
  'del\u007f',
  'nel\u0085',
  'nbsp x',
  ' nbsp first',
  'line sep',
  'para sep',
  'Morgenröte',
  'moon \u{1F319} emoji',
  '---',
  '---x',
  '...',
  'two\nlines',
  'trailing newline\n',
  'two trailing\n\n',
  '\nleading newline',
  ' indented\nsecond',
  'space before \nnewline',
  'newline then\n space',
  'ends with\n  ',
  'a\n---\nb',
  'x\nresurface_kind: wish\nresurface_due: 2020-01-01',
  'done\n---\nbody',
  'control\u0001 and\nnewline in a string long enough to fold',
  'control\u0001\n\nblank line in a string long enough to fold',
  'control\u0001 \n space then newline long enough to fold',
  'short\u0001\nfold',
];

// A small seeded generator (mulberry32) so the corpus never changes unless this
// file does, whatever version of a property-testing library is installed.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pieces = [
  'a',
  'b',
  'Z',
  '0',
  '1',
  '.',
  'e',
  'x',
  '+',
  '/',
  '=',
  ' ',
  ' ',
  '\t',
  '\n',
  '\r',
  ':',
  ': ',
  '#',
  ' #',
  '-',
  '- ',
  '?',
  ',',
  '[',
  ']',
  '{',
  '}',
  '&',
  '*',
  '!',
  '|',
  '>',
  "'",
  '"',
  '%',
  '@',
  '`',
  '\\',
  '~',
  '---',
  'true',
  'null',
  '1e3',
  '\u0000',
  '\u0001',
  '\u0007',
  '\u0008',
  '\u000b',
  '\u000c',
  '\u001b',
  '\u001f',
  '\u007f',
  '\u0085',
  ' ',
  ' ',
  ' ',
  '　',
  'é',
  '\u{1F319}',
];

function generated(count: number): string[] {
  const random = mulberry32(20261101);
  const out: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const length = Math.floor(random() * 10);
    let value = '';
    for (let i = 0; i < length; i += 1)
      value += pieces[Math.floor(random() * pieces.length)];
    out.push(value);
  }
  return out;
}

const values = [...new Set([...handPicked, ...generated(160)])];

function noteWith(value: string): StudioNote {
  return {
    schemaVersion: 1,
    id: '01JPARITY',
    title: value,
    body: '',
    cardType: 'fragment',
    semanticType: 'reflection',
    status: 'active',
    rooms: [],
    lifeAreas: [],
    seasons: [],
    tags: [],
    created: '2026-07-14T09:00:00+10:00',
    updated: '2026-07-14T09:00:00+10:00',
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: {
      top: value,
      map: { inner: value },
      list: [value],
      seq: [{ key: value }],
    },
  };
}

describe('YAML parity goldens', () => {
  const cases = values.map((value) => ({
    value,
    note: serializeNote(noteWith(value)),
  }));

  it('reads every golden back to the string it was written from', () => {
    for (const { value, note } of cases) {
      const parsed = parseNote(note);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.note.title).toBe(value);
        expect(parsed.note.extraFrontmatter).toEqual(
          noteWith(value).extraFrontmatter,
        );
      }
    }
  });

  it('matches the committed golden file', async () => {
    await expect(`${JSON.stringify(cases, null, 2)}\n`).toMatchFileSnapshot(
      '../../../fixtures/yaml-parity/scalars.json',
    );
  });
});
