import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { serializeNote } from '@studio/content';
import {
  applyVaultImport,
  createInMemoryVault,
  createVaultBackup,
  prepareVaultImport,
} from '@studio/storage';
import { expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { note, RecordingIndex } from './test-helpers';

async function fixtureFiles(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const path = relative(root, absolute).split(sep).join('/');
        files.set(path, new Uint8Array(await readFile(absolute)));
      }
    }
  }
  await visit(root);
  return files;
}

const encoder = new TextEncoder();

it('destructively restores the fixture and rebuilds every MVP room', async () => {
  const root = resolve(
    process.env.STUDIO_RESTORE_FIXTURE ??
      resolve(import.meta.dirname, '../../../fixtures/vaults/sample'),
  );
  const expected = await fixtureFiles(root);
  expected.set(
    '.studio/views/life-landscape.json',
    encoder.encode('{"order":["home","family"]}\n'),
  );
  expected.set('Foyer/becoming.md', encoder.encode(serializeNote(note({
    id: 'fixture-becoming',
    title: 'Becoming calm',
    cardType: 'identity',
    semanticType: 'foundations',
    rooms: ['foyer', 'identity-studio'],
  }))));
  expected.set('Current Season/winter.md', encoder.encode(serializeNote(note({
    id: 'fixture-season',
    title: 'A spacious winter',
    cardType: 'season',
    semanticType: 'vision',
    rooms: ['current-season'],
    extraFrontmatter: { season_id: '2026-winter' },
  }))));
  expected.set('Uncharted/retreat.md', encoder.encode(serializeNote(note({
    id: 'fixture-uncharted',
    title: 'What if there were a retreat?',
    cardType: 'possibility',
    semanticType: 'uncharted',
    rooms: ['uncharted'],
  }))));
  expected.set('Reflection Garden/Reflections/learned.md', encoder.encode(serializeNote(note({
    id: 'fixture-reflection',
    title: 'What I learned',
    cardType: 'reflection',
    semanticType: 'reflection',
    rooms: ['reflection-garden'],
    tags: ['calm'],
  }))));
  expected.set('Wisdom Garden/structure.md', encoder.encode(serializeNote(note({
    id: 'fixture-wisdom',
    title: 'Enough structure for surprise',
    cardType: 'principle',
    semanticType: 'foundations',
    rooms: ['wisdom-garden'],
  }))));
  const source = createInMemoryVault();
  for (const [path, bytes] of expected) {
    await source.writeBinaryAtomic(path, bytes);
  }
  await source.writeTextAtomic('.studio/index/search.db', 'disposable index');

  const backup = await createVaultBackup(source, {
    generatedAt: '2026-07-14T11:00:00.000Z',
    reason: 'manual',
  });

  // The source is deliberately abandoned here. Restore begins with an empty
  // vault and only the ZIP bytes retained above.
  const restored = createInMemoryVault();
  const plan = await prepareVaultImport(restored, backup.bytes);
  await applyVaultImport(restored, plan, { confirm: true });

  const restoredPaths = (await restored.list())
    .filter((entry) => entry.kind === 'file')
    .map((entry) => entry.path)
    .sort();
  expect(restoredPaths).toEqual([...expected.keys()].sort());
  await expect(restored.exists('.studio/index/search.db')).resolves.toBe(false);
  for (const [path, bytes] of expected) {
    await expect(restored.readBinary(path)).resolves.toEqual(bytes);
  }

  const index = new RecordingIndex();
  const studio = createStudioService({ vault: restored, index });
  await studio.rebuildIndex();
  expect(index.entries.size).toBe(6);
  expect((await studio.projectFoyer()).becoming?.noteId).toBe('fixture-becoming');
  expect((await studio.projectCurrentSeason()).current?.noteId).toBe('fixture-season');
  expect((await studio.projectUncharted()).cards.map((card) => card.noteId)).toEqual([
    'fixture-uncharted',
  ]);
  expect((await studio.projectReflectionGarden()).cards.map((card) => card.noteId)).toEqual([
    'fixture-reflection',
  ]);
  expect((await studio.projectRoom('identity-studio')).map((card) => card.noteId)).toContain(
    'fixture-becoming',
  );
  expect((await studio.projectRoom('wisdom-garden')).map((card) => card.noteId)).toContain(
    'fixture-wisdom',
  );
  const landscape = await studio.projectLandscapeBoard(['home']);
  expect(landscape.cells.flatMap((cell) => cell.noteIds)).toContain(
    '01J2ABC3DEF4GHI5JKL6ABC123',
  );
  await studio.dispose();
});
