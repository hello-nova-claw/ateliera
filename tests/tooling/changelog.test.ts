import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { fold, foldInto, parseFragment } from '../../bin/changelog.mjs';

test('a fragment gives one entry per non-empty line, without bullets', () => {
  expect(parseFragment('* First.\n\n- Second.\r\nThird.\n')).toEqual(['First.', 'Second.', 'Third.']);
});

test('entries go under an existing Unreleased heading, after its entries', () => {
  const before = '# Changelog\n\n## Unreleased\n\n- Old.\n\n## 0.1.0\n\n- Shipped.\n';
  expect(foldInto(before, ['New.'])).toBe(
    '# Changelog\n\n## Unreleased\n\n- Old.\n- New.\n\n## 0.1.0\n\n- Shipped.\n',
  );
});

test('an Unreleased heading is opened above the latest release when missing', () => {
  const before = '# Changelog\n\n## 0.1.0\n\n- Shipped.\n';
  expect(foldInto(before, ['New.'])).toBe(
    '# Changelog\n\n## Unreleased\n\n- New.\n\n## 0.1.0\n\n- Shipped.\n',
  );
});

test('fold adds fragments in issue order and deletes them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'changelog-'));
  await mkdir(join(root, 'changelog'));
  await writeFile(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n');
  await writeFile(join(root, 'changelog', '132-delete.txt'), 'Delete everything.\n');
  await writeFile(join(root, 'changelog', '40-drafts.txt'), 'Drafts stay private.\n');
  await writeFile(join(root, 'changelog', '.gitkeep'), '');

  expect(await fold(root)).toBe(2);
  expect(await readFile(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
    '# Changelog\n\n## Unreleased\n\n- Drafts stay private.\n- Delete everything.\n',
  );
  expect(await readdir(join(root, 'changelog'))).toEqual(['.gitkeep']);
});
