import { expect, it } from 'vitest';
import { createNoteId, suggestFilename } from './filenames';

it('creates sortable, unique 26-character IDs', () => {
  const first = createNoteId(1_000);
  const second = createNoteId(2_000);
  expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(second > first).toBe(true);
  expect(second).not.toBe(first);
  expect(createNoteId()).toHaveLength(26);
});

it('keeps the timestamp prefix stable while generating unique IDs in the same millisecond', () => {
  const ids = new Set(Array.from({ length: 100 }, () => createNoteId(1_000)));
  expect(ids.size).toBe(100);
  expect(new Set([...ids].map((id) => id.slice(0, 10)))).toEqual(
    new Set(['00000000Z8']),
  );
  expect([...ids].every((id) => id >= '00000000Z80000000000000000')).toBe(true);
});

it('does not throw for unusual created values', () => {
  expect(
    suggestFilename({
      created: 'not-a-date',
      cardType: 'note',
      id: '01JTESTABCDEF',
    }),
  ).toBe('1970-01-01--note--abcdef.md');
});

it.each(['2026-99-99', '2026-02-30junk'])(
  'uses the epoch fallback for an invalid calendar prefix: %s',
  (created) => {
    expect(
      suggestFilename({ created, cardType: 'note', id: '01JTESTABCDEF' }),
    ).toBe('1970-01-01--note--abcdef.md');
  },
);

it('uses a valid leap-day prefix', () => {
  expect(
    suggestFilename({
      created: '2024-02-29T12:00:00Z',
      cardType: 'note',
      id: '01JTESTABCDEF',
    }),
  ).toBe('2024-02-29--note--abcdef.md');
});

it('uses safe fallbacks for unusual metadata', () => {
  expect(
    suggestFilename({
      created: '2026/07/13 UTC',
      title: '🌿',
      cardType: 'fragment',
      id: '01JTESTABCDEF',
    }),
  ).toBe('2026-07-13--note--abcdef.md');
});

it('suggests a portable canonical filename', () => {
  expect(
    suggestFilename({
      created: '2026-07-13T10:00:00+10:00',
      title: 'Café & Home 🌿',
      cardType: 'vision',
      id: '01JTESTABCDEF',
    }),
  ).toBe('2026-07-13--cafe-home--abcdef.md');
});

it('falls back to card type when title is absent', () => {
  expect(
    suggestFilename({
      created: '2026-07-13',
      cardType: 'Quick Note',
      id: '01JTESTABCDEF',
    }),
  ).toBe('2026-07-13--quick-note--abcdef.md');
});
