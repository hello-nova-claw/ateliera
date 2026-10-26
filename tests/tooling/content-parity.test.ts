import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const apple = 'apple/Ateliera/Content';

/**
 * Content both apps show is kept as one file per platform, byte for byte the
 * same, so the native app stays golden-matched to the web packages.
 */
const shared = [
  ['packages/rhythm/src/content', 'micro-seasons.json'],
  ['packages/domain/src/content', 'identity-prompts.json'],
  ['packages/domain/src/content', 'landscape-prompts.json'],
  ['apps/studio/src/content', 'wisdom-guidance.json'],
  ['apps/studio/src/content', 'identity-guidance.json'],
  ['apps/studio/src/content', 'landscape-guidance.json'],
  ['apps/studio/src/content', 'reflection-guidance.json'],
  ['apps/studio/src/content', 'season-guidance.json'],
  ['apps/studio/src/content', 'almanac.json'],
] as const;

test.each(shared)('%s/%s matches the native app copy', async (folder, name) => {
  const web = await readFile(resolve(root, folder, name), 'utf8');
  const native = await readFile(resolve(root, apple, name), 'utf8');
  expect(native).toBe(web);
});
