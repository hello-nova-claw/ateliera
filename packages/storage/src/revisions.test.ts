import { describe, expect, it } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import { createRevisionStore } from './revisions';

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
});
