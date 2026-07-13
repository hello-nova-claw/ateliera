import { describe, expect, it } from 'vitest';

import { VaultUnavailableError } from './conflict';
import { createInMemoryVault } from './in-memory-vault';
import {
  createRevisionStore,
  RevisionLimitError,
  type RevisionManifest,
} from './revisions';

const encoder = new TextEncoder();

async function seedSnapshot(
  vault: ReturnType<typeof createInMemoryVault>,
  root: string,
  manifest: RevisionManifest,
  contents: Record<string, string>,
): Promise<void> {
  for (const [path, text] of Object.entries(contents)) {
    await vault.writeTextAtomic(path, text);
  }
  await vault.writeTextAtomic(`${root}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('local revision snapshots', () => {
  it('stores exact bytes and a dated manifest before a bounded operation', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'line one\r\nline two\r\n');
    await vault.writeBinaryAtomic('Attachments/a.bin', new Uint8Array([0, 255, 4]));
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T02:03:04.000Z'),
      generateId: () => 'snap1',
    });

    const snapshot = await store.create('conflict-resolution', ['Notes/a.md', 'Attachments/a.bin']);
    expect(snapshot.manifest.reason).toBe('conflict-resolution');
    expect(snapshot.manifest.files).toHaveLength(2);
    expect(await vault.readBinary(snapshot.manifest.files[0]!.snapshotPath)).toEqual(
      await vault.readBinary(snapshot.manifest.files[0]!.originalPath),
    );
  });

  it('retains only the newest daily snapshot inside 30 days and never touches Archive', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'note');
    await vault.writeTextAtomic('Archive/forever.md', 'user archive');
    let now = new Date('2026-07-13T12:00:00.000Z');
    let id = 0;
    const store = createRevisionStore(vault, {
      clock: () => now,
      generateId: () => `s${++id}`,
      retentionDays: 30,
    });

    await store.create('migration', ['Notes/a.md']);
    now = new Date('2026-07-13T13:00:00.000Z');
    await store.create('migration', ['Notes/a.md']);
    now = new Date('2026-08-13T13:00:00.000Z');
    await store.create('migration', ['Notes/a.md']);

    const manifests = (await vault.list('.studio/backups')).filter((entry) => entry.path.endsWith('/manifest.json'));
    expect(manifests).toHaveLength(1);
    expect((await vault.readText('Archive/forever.md')).text).toBe('user archive');
  });

  it('leaves a recoverable manifest when copying a later file fails', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'a');
    await vault.writeTextAtomic('Notes/b.md', 'b');
    const read = vault.readBinary.bind(vault);
    vault.readBinary = async (path) => {
      if (path === 'Notes/b.md') throw new Error('disk unavailable');
      return read(path);
    };
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T02:03:04.000Z'),
      generateId: () => 'partial',
    });

    await expect(store.create('multi-file-rename', ['Notes/a.md', 'Notes/b.md'])).rejects.toThrow();
    const manifest = await vault.readText('.studio/backups/2026-07-13/2026-07-13T02-03-04-000Z--partial/manifest.json');
    expect(JSON.parse(manifest.text)).toMatchObject({ state: 'incomplete', files: [{ originalPath: 'Notes/a.md' }] });
  });

  it('ignores incomplete, malformed, and content-corrupt snapshots when choosing daily retention', async () => {
    const vault = createInMemoryVault();
    const goodRoot = '.studio/backups/2026-07-13/2026-07-13T08-00-00-000Z--good';
    const goodCopy = await vault.writeTextAtomic(`${goodRoot}/files/Notes/good.md`, 'good');
    await seedSnapshot(vault, goodRoot, {
      version: 1,
      id: 'good',
      reason: 'migration',
      createdAt: '2026-07-13T08:00:00.000Z',
      state: 'complete',
      files: [{
        originalPath: 'Notes/good.md',
        snapshotPath: `${goodRoot}/files/Notes/good.md`,
        hash: goodCopy.hash,
      }],
    }, {});

    const incompleteRoot = '.studio/backups/2026-07-13/2026-07-13T10-00-00-000Z--incomplete';
    await seedSnapshot(vault, incompleteRoot, {
      version: 1,
      id: 'incomplete',
      reason: 'migration',
      createdAt: '2026-07-13T10:00:00.000Z',
      state: 'incomplete',
      files: [],
    }, {});

    const corruptRoot = '.studio/backups/2026-07-13/2026-07-13T11-00-00-000Z--corrupt';
    await seedSnapshot(vault, corruptRoot, {
      version: 1,
      id: 'corrupt',
      reason: 'migration',
      createdAt: '2026-07-13T11:00:00.000Z',
      state: 'complete',
      files: [{
        originalPath: 'Notes/corrupt.md',
        snapshotPath: `${corruptRoot}/files/Notes/corrupt.md`,
        hash: '0'.repeat(64),
      }],
    }, { [`${corruptRoot}/files/Notes/corrupt.md`]: 'not the declared bytes' });

    const malformedRoot = '.studio/backups/2026-07-13/2026-07-13T12-00-00-000Z--malformed';
    await vault.writeTextAtomic(`${malformedRoot}/manifest.json`, JSON.stringify({
      version: 1,
      id: 'malformed',
      reason: 'made-up',
      createdAt: '2026-07-13T12:00:00.000Z',
      state: 'complete',
      files: [],
    }));

    await createRevisionStore(vault, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
    }).prune();

    await expect(vault.exists(`${goodRoot}/manifest.json`)).resolves.toBe(true);
    await expect(vault.exists(`${incompleteRoot}/manifest.json`)).resolves.toBe(true);
    await expect(vault.exists(`${corruptRoot}/manifest.json`)).resolves.toBe(true);
    await expect(vault.exists(`${malformedRoot}/manifest.json`)).resolves.toBe(true);
  });

  it('hashes snapshot bytes instead of trusting forged adapter hash metadata', async () => {
    const vault = createInMemoryVault();
    const roots = [
      '.studio/backups/2026-07-13/2026-07-13T08-00-00-000Z--good',
      '.studio/backups/2026-07-13/2026-07-13T09-00-00-000Z--forged',
    ];
    for (const [index, root] of roots.entries()) {
      const copyPath = `${root}/files/Notes/a.md`;
      const copy = await vault.writeTextAtomic(copyPath, `declared-${index}`);
      await seedSnapshot(vault, root, {
        version: 1,
        id: index === 0 ? 'good' : 'forged',
        reason: 'migration',
        createdAt: `2026-07-13T0${8 + index}:00:00.000Z`,
        state: 'complete',
        files: [{ originalPath: 'Notes/a.md', snapshotPath: copyPath, hash: copy.hash }],
      }, {});
      if (index === 1) {
        const changed = await vault.readText(copyPath);
        await vault.writeTextAtomic(copyPath, 'different bytes', { expectedHash: changed.hash });
        const list = vault.list.bind(vault);
        vault.list = async (prefix) => (await list(prefix)).map((entry) =>
          entry.path === copyPath ? { ...entry, contentHash: copy.hash } : entry);
      }
    }

    await createRevisionStore(vault, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
    }).prune();

    await expect(vault.exists(`${roots[0]}/manifest.json`)).resolves.toBe(true);
    await expect(vault.exists(`${roots[1]}/manifest.json`)).resolves.toBe(true);
  });

  it('uses the manifest path as a deterministic tie-break for equal timestamps', async () => {
    const vault = createInMemoryVault();
    const createdAt = '2026-07-13T12:00:00.000Z';
    for (const id of ['a-first', 'z-last']) {
      const root = `.studio/backups/2026-07-13/2026-07-13T12-00-00-000Z--${id}`;
      const copy = await vault.writeTextAtomic(`${root}/files/Notes/a.md`, id);
      await seedSnapshot(vault, root, {
        version: 1,
        id,
        reason: 'migration',
        createdAt,
        state: 'complete',
        files: [{
          originalPath: 'Notes/a.md',
          snapshotPath: `${root}/files/Notes/a.md`,
          hash: copy.hash,
        }],
      }, {});
    }
    const list = vault.list.bind(vault);
    vault.list = async (prefix) => (await list(prefix)).reverse();

    await createRevisionStore(vault, {
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
    }).prune();

    const manifests = (await vault.list('.studio/backups'))
      .filter((entry) => entry.kind === 'file' && entry.path.endsWith('/manifest.json'));
    expect(manifests.map((entry) => entry.path)).toEqual([
      '.studio/backups/2026-07-13/2026-07-13T12-00-00-000Z--a-first/manifest.json',
    ]);
  });

  it('keeps the manifest until interrupted cleanup can be retried', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'note');
    await vault.writeTextAtomic('Notes/b.md', 'note');
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T12:00:00.000Z'),
      generateId: () => 'old',
      retentionDays: 1,
    });
    const snapshot = await store.create('migration', ['Notes/a.md', 'Notes/b.md']);
    const remove = vault.remove.bind(vault);
    let copiedFileRemovals = 0;
    vault.remove = async (path, condition) => {
      if (path.includes('/files/') && ++copiedFileRemovals === 2) {
        throw new Error('cleanup interrupted');
      }
      return remove(path, condition);
    };
    const expiredStore = createRevisionStore(vault, {
      clock: () => new Date('2026-07-15T12:00:00.000Z'),
      retentionDays: 1,
    });

    await expect(expiredStore.prune()).rejects.toThrow('cleanup interrupted');
    await expect(vault.exists(snapshot.manifestPath)).resolves.toBe(true);
    expect(JSON.parse((await vault.readText(snapshot.manifestPath)).text)).toMatchObject({
      state: 'pruning',
    });
    await expect(vault.exists(snapshot.manifest.files[0]!.snapshotPath)).resolves.toBe(false);

    vault.remove = remove;
    await expiredStore.prune();
    await expect(vault.exists(snapshot.manifestPath)).resolves.toBe(false);
  });

  it.each([
    {
      name: 'file count',
      paths: ['Notes/a.md', 'Notes/b.md'],
      contents: ['a', 'b'],
      limits: { maxFiles: 1 },
    },
    {
      name: 'individual file size',
      paths: ['Notes/a.md'],
      contents: ['ab'],
      limits: { maxFileBytes: 1 },
    },
    {
      name: 'total size',
      paths: ['Notes/a.md', 'Notes/b.md'],
      contents: ['a', 'b'],
      limits: { maxTotalBytes: 1 },
    },
    {
      name: 'manifest size',
      paths: ['Notes/a.md'],
      contents: ['a'],
      limits: { maxManifestBytes: 1 },
    },
  ])('rejects the $name limit before writing snapshot data', async ({ paths, contents, limits }) => {
    const vault = createInMemoryVault();
    await Promise.all(paths.map((path, index) => vault.writeTextAtomic(path, contents[index]!)));
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T02:03:04.000Z'),
      generateId: () => 'bounded',
      limits,
    });

    await expect(store.create('migration', paths)).rejects.toBeInstanceOf(RevisionLimitError);
    expect((await vault.list()).some((entry) => entry.path.startsWith('.studio/backups/'))).toBe(false);
  });

  it('leaves an honest incomplete manifest if a source grows beyond the total bound mid-copy', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'a');
    await vault.writeTextAtomic('Notes/b.md', 'b');
    const read = vault.readBinary.bind(vault);
    vault.readBinary = async (path) => {
      if (path === 'Notes/b.md') return encoder.encode('grew');
      return read(path);
    };
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T02:03:04.000Z'),
      generateId: () => 'grew',
      limits: { maxFileBytes: 4, maxTotalBytes: 2 },
    });

    await expect(store.create('migration', ['Notes/a.md', 'Notes/b.md']))
      .rejects.toBeInstanceOf(RevisionLimitError);
    const manifest = await vault.readText(
      '.studio/backups/2026-07-13/2026-07-13T02-03-04-000Z--grew/manifest.json',
    );
    expect(JSON.parse(manifest.text)).toMatchObject({
      state: 'incomplete',
      files: [{ originalPath: 'Notes/a.md' }],
    });
  });

  it('leaves an honest incomplete manifest when storage rejects a later copy', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', 'a');
    await vault.writeTextAtomic('Notes/b.md', 'b');
    const write = vault.writeBinaryAtomic.bind(vault);
    vault.writeBinaryAtomic = async (path, bytes, condition) => {
      if (path.endsWith('/files/Notes/b.md')) throw new VaultUnavailableError('quota exceeded');
      return write(path, bytes, condition);
    };
    const store = createRevisionStore(vault, {
      clock: () => new Date('2026-07-13T02:03:04.000Z'),
      generateId: () => 'quota',
    });

    await expect(store.create('migration', ['Notes/a.md', 'Notes/b.md']))
      .rejects.toThrow('quota exceeded');
    const manifest = await vault.readText(
      '.studio/backups/2026-07-13/2026-07-13T02-03-04-000Z--quota/manifest.json',
    );
    expect(JSON.parse(manifest.text)).toMatchObject({
      state: 'incomplete',
      files: [{ originalPath: 'Notes/a.md' }],
    });
  });
});
