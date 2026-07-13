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
