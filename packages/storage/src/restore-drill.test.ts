import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { expect, it } from 'vitest';

import { createVaultBackup } from './backup';
import { createInMemoryVault } from './in-memory-vault';
import { applyVaultImport, prepareVaultImport } from './import';

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

it('destructively restores the fixture from only its portable backup', async () => {
  const root = resolve(
    process.env.STUDIO_RESTORE_FIXTURE ?? 'fixtures/vaults/anna-sample',
  );
  const expected = await fixtureFiles(root);
  expected.set(
    '.studio/views/life-landscape.json',
    new TextEncoder().encode('{"order":["home","family"]}\n'),
  );
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
});
