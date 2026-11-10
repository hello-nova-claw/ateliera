import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

import {
  comment,
  diff,
  hashes,
  isJpeg,
  MARKER,
  shotName,
  SHOWN,
  stage,
  validate,
} from '../../bin/screenshots.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const jpeg = (body: string) => Buffer.concat([JPEG, Buffer.from(body)]);

function folder(files: Record<string, Buffer | string>) {
  const dir = mkdtempSync(join(tmpdir(), 'shots-test-'));
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(dir, name), content);
  return dir;
}

test('turns Xcode attachment names into catalogue names', () => {
  expect(
    shotName(
      'today--furnished--en-GB--iphone-17e_0_6B1F2C3D-4E5F-4A1B-9C8D-7E6F5A4B3C2D.png',
    ),
  ).toBe('today--furnished--en-GB--iphone-17e.jpg');
  expect(
    shotName('Screenshot_0_6B1F2C3D-4E5F-4A1B-9C8D-7E6F5A4B3C2D.png'),
  ).toBeNull();
  expect(shotName('today--empty--en-GB--iphone-17e.jpg')).toBeNull();
  expect(
    shotName('../x--y--z--w_0_6B1F2C3D-4E5F-4A1B-9C8D-7E6F5A4B3C2D.png'),
  ).toBeNull();
});

test('accepts only catalogue-named JPEGs', () => {
  expect(isJpeg(jpeg('x'))).toBe(true);
  expect(isJpeg(Buffer.from('<svg/>'))).toBe(false);
  expect(() =>
    validate(folder({ 'today--empty--en-GB--iphone-17e.jpg': jpeg('a') })),
  ).not.toThrow();
  expect(() => validate(folder({ 'notes.txt': 'hi' }))).toThrow(/Unexpected/);
  expect(() =>
    validate(folder({ 'today--empty--en-GB--iphone-17e.jpg': '<svg/>' })),
  ).toThrow(/Not a JPEG/);
  expect(() =>
    validate(
      folder({
        'today--empty--en-GB--iphone-17e.jpg': Buffer.concat([
          JPEG,
          Buffer.alloc(2 * 1024 * 1024),
        ]),
      }),
    ),
  ).toThrow(/too large/);
});

test('sorts shots into changed, new, gone and the same', () => {
  const base = new Map([
    ['a--s--l--d.jpg', '1'],
    ['b--s--l--d.jpg', '2'],
    ['c--s--l--d.jpg', '3'],
  ]);
  const head = new Map([
    ['a--s--l--d.jpg', '1'],
    ['b--s--l--d.jpg', '9'],
    ['d--s--l--d.jpg', '4'],
  ]);
  expect(diff(base, head)).toEqual({
    changed: ['b--s--l--d.jpg'],
    added: ['d--s--l--d.jpg'],
    removed: ['c--s--l--d.jpg'],
    unchanged: 1,
  });
});

test('reads no hashes from a missing folder', () => {
  expect(hashes(join(tmpdir(), 'no-such-shots-folder')).size).toBe(0);
});

test('stages only the changed and new shots', () => {
  const main = folder({
    'a--s--l--d.jpg': jpeg('a'),
    'b--s--l--d.jpg': jpeg('b'),
  });
  const head = folder({
    'a--s--l--d.jpg': jpeg('a'),
    'b--s--l--d.jpg': jpeg('B'),
    'c--s--l--d.jpg': jpeg('c'),
  });
  const pr = join(mkdtempSync(join(tmpdir(), 'shots-pr-')), 'pr-7');
  mkdirSync(pr);
  writeFileSync(join(pr, 'old--s--l--d.jpg'), jpeg('old'));
  const result = stage(main, head, pr);
  expect(result.changed).toEqual(['b--s--l--d.jpg']);
  expect(result.added).toEqual(['c--s--l--d.jpg']);
  expect(readdirSync(pr).sort()).toEqual(['b--s--l--d.jpg', 'c--s--l--d.jpg']);
});

const base = {
  repo: 'owner/repo',
  pr: '7',
  headSha: 'abcdef1234567',
  branchSha: 'f00',
};

test('says so when nothing changed', () => {
  const body = comment({
    ...base,
    diff: { changed: [], added: [], removed: [], unchanged: 5 },
  });
  expect(body.startsWith(MARKER)).toBe(true);
  expect(body).toContain('0 changed, 0 new, 0 gone, 5 the same');
  expect(body).toContain('Nothing on screen changed.');
});

test('shows changed shots beside main, pinned to the branch commit', () => {
  const body = comment({
    ...base,
    diff: {
      changed: ['today--empty--en-GB--iphone-17e.jpg'],
      added: ['find--empty--ar--iphone-17e.jpg'],
      removed: ['old--empty--ar--iphone-17e.jpg'],
      unchanged: 0,
    },
  });
  expect(body).toContain(
    'https://raw.githubusercontent.com/owner/repo/f00/main/today--empty--en-GB--iphone-17e.jpg',
  );
  expect(body).toContain(
    'https://raw.githubusercontent.com/owner/repo/f00/pr-7/today--empty--en-GB--iphone-17e.jpg',
  );
  expect(body).toContain('#### New');
  expect(body).toContain('1 gone');
  expect(body).toContain('- old--empty--ar--iphone-17e');
});

test('lists shots past the first few by name', () => {
  const many = Array.from({ length: SHOWN + 3 }, (_, i) => `s${i}--e--l--d.jpg`);
  const body = comment({
    ...base,
    diff: { changed: many, added: [], removed: [], unchanged: 0 },
  });
  expect(body).toContain('<summary>3 more</summary>');
  expect(body.match(/<img /g)).toHaveLength(SHOWN * 2);
});
