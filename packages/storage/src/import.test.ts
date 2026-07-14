import { describe, expect, it, vi } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import { exportVault } from './export';
import { applyVaultImport, prepareVaultImport } from './import';
import { createZip32, sha256 } from './zip32';
import type { VaultPort } from './vault-port';

const note = (id: string, body: string) => `---\nschema_version: 1\nid: ${id}\n---\n${body}\n`;

describe('portable vault import', () => {
  it('previews create, overwrite, conflict, and skip before mutation', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/create.md', note('create', 'new'));
    await source.writeTextAtomic('Inbox/overwrite.md', note('same-id', 'new'));
    await source.writeTextAtomic('Inbox/conflict.md', note('incoming-id', 'incoming'));
    await source.writeTextAtomic('Inbox/skip.md', note('skip-id', 'same'));
    const archive = await exportVault(source, { generatedAt: '2026-07-14T00:00:00.000Z' });

    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/overwrite.md', note('same-id', 'old'));
    await target.writeTextAtomic('Inbox/conflict.md', note('local-id', 'local'));
    await target.writeTextAtomic('Inbox/skip.md', note('skip-id', 'same'));

    const plan = await prepareVaultImport(target, archive);
    expect(plan.items.map(({ action, path }) => ({ action, path }))).toEqual([
      { action: 'conflict', path: 'Inbox/conflict.md' },
      { action: 'create', path: 'Inbox/create.md' },
      { action: 'overwrite', path: 'Inbox/overwrite.md' },
      { action: 'skip', path: 'Inbox/skip.md' },
    ]);
    await expect(target.readText('Inbox/overwrite.md')).resolves.toMatchObject({
      text: note('same-id', 'old'),
    });
  });

  it('previews canonical ID and portable-path collisions at different target paths', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/renamed.md', note('stable-id', 'incoming'));
    await source.writeTextAtomic('Inbox/Hill.md', note('hill-incoming', 'incoming hill'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Archive/original.md', note('stable-id', 'local'));
    await target.writeTextAtomic('inbox/hill.md', note('hill-local', 'local hill'));

    const plan = await prepareVaultImport(target, await exportVault(source));
    expect(plan.items).toEqual([
      expect.objectContaining({
        action: 'conflict',
        path: 'Inbox/Hill.md',
        existingPath: 'inbox/hill.md',
        conflictKind: 'portable-path',
      }),
      expect.objectContaining({
        action: 'conflict',
        path: 'Inbox/renamed.md',
        existingPath: 'Archive/original.md',
        conflictKind: 'note-id',
      }),
    ]);
  });

  it('requires confirmation and explicit conflict resolutions', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/conflict.md', note('incoming', 'incoming'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/conflict.md', note('local', 'local'));
    const plan = await prepareVaultImport(target, await exportVault(source));

    await expect(applyVaultImport(target, plan, { confirm: false })).rejects.toMatchObject({
      code: 'confirmation-required',
    });
    await expect(applyVaultImport(target, plan, { confirm: true })).rejects.toMatchObject({
      code: 'unresolved-conflict',
    });
    await expect(target.readText('Inbox/conflict.md')).resolves.toMatchObject({
      text: note('local', 'local'),
    });
  });

  it('rejects a changed target after preview without overwriting it', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/note.md', note('same', 'incoming'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/note.md', note('same', 'old'));
    const plan = await prepareVaultImport(target, await exportVault(source));
    await target.writeTextAtomic('Inbox/note.md', note('same', 'outside edit'));

    await expect(applyVaultImport(target, plan, { confirm: true })).rejects.toMatchObject({
      code: 'target-changed',
    });
    await expect(target.readText('Inbox/note.md')).resolves.toMatchObject({
      text: note('same', 'outside edit'),
    });
  });

  it('rejects a case-equivalent target added after a create preview', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/Hill.md', note('incoming-hill', 'incoming'));
    const target = createInMemoryVault();
    const plan = await prepareVaultImport(target, await exportVault(source));
    expect(plan.items).toEqual([
      expect.objectContaining({ action: 'create', path: 'Inbox/Hill.md' }),
    ]);

    await target.writeTextAtomic('inbox/hill.md', note('outside-hill', 'outside'));
    await expect(applyVaultImport(target, plan, { confirm: true })).rejects.toMatchObject({
      code: 'target-changed',
    });
    await expect(target.exists('Inbox/Hill.md')).resolves.toBe(false);
    await expect(target.readText('inbox/hill.md')).resolves.toMatchObject({
      text: note('outside-hill', 'outside'),
    });
  });

  it('rejects canonical note-ID ownership added after a create preview', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/new.md', note('stable-id', 'incoming'));
    const target = createInMemoryVault();
    const plan = await prepareVaultImport(target, await exportVault(source));

    await target.writeTextAtomic('Archive/external.md', note('stable-id', 'outside'));
    await expect(applyVaultImport(target, plan, { confirm: true })).rejects.toMatchObject({
      code: 'target-changed',
    });
    await expect(target.exists('Inbox/new.md')).resolves.toBe(false);
    await expect(target.readText('Archive/external.md')).resolves.toMatchObject({
      text: note('stable-id', 'outside'),
    });
  });

  it('validates every checksum before mutating the target', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/note.md', note('safe', 'safe'));
    const archive = await exportVault(source);
    const marker = new TextEncoder().encode('safe');
    const markerIndex = archive.findIndex((value, offset) =>
      marker.every((byte, index) => archive[offset + index] === byte),
    );
    expect(markerIndex).toBeGreaterThan(-1);
    archive[markerIndex] = 'x'.charCodeAt(0);
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/existing.md', 'keep');

    await expect(prepareVaultImport(target, archive)).rejects.toMatchObject({
      code: 'checksum-failed',
    });
    await expect(target.readText('Inbox/existing.md')).resolves.toMatchObject({ text: 'keep' });
    await expect(target.exists('Inbox/note.md')).resolves.toBe(false);
  });

  it('rejects active, reserved, and case-colliding manifest paths', async () => {
    const bytes = new TextEncoder().encode('content');
    const hash = await sha256(bytes);
    const makeArchive = (paths: readonly string[]) => {
      const files = paths.map((path) => ({ path, sha256: hash, size: bytes.byteLength }))
        .sort((left, right) => left.path.localeCompare(right.path, 'en'));
      const manifest = new TextEncoder().encode(`${JSON.stringify({
        format: 'the-studio-vault',
        exportVersion: 1,
        schemaVersions: { note: 1, settings: 1 },
        generatedAt: '2026-07-14T00:00:00.000Z',
        files,
        excludedCaches: [],
      }, null, 2)}\n`);
      return createZip32([
        ...paths.map((path) => [path, bytes] as const),
        ['.studio/export-manifest.json', manifest] as const,
      ]);
    };
    const target = createInMemoryVault();

    await expect(prepareVaultImport(target, makeArchive(['Attachments/run.html'])))
      .rejects.toMatchObject({ code: 'active-content' });
    await expect(prepareVaultImport(target, makeArchive(['Inbox/CON.md'])))
      .rejects.toMatchObject({ code: 'invalid-path' });
    await expect(prepareVaultImport(target, makeArchive(['Inbox/Hill.md', 'inbox/hill.md'])))
      .rejects.toMatchObject({ code: 'path-collision' });
  });

  it('rejects non-canonical timestamps and unbounded cache exclusion lists', async () => {
    const manifestArchive = (generatedAt: string, excludedCaches: string[]) => {
      const manifest = new TextEncoder().encode(`${JSON.stringify({
        format: 'the-studio-vault',
        exportVersion: 1,
        schemaVersions: { note: 1, settings: 1 },
        generatedAt,
        files: [],
        excludedCaches,
      }, null, 2)}\n`);
      return createZip32([['.studio/export-manifest.json', manifest]]);
    };
    const target = createInMemoryVault();

    await expect(prepareVaultImport(target, manifestArchive('2026-07-14', [])))
      .rejects.toMatchObject({ code: 'invalid-manifest' });
    await expect(prepareVaultImport(target, manifestArchive(
      '2026-07-14T00:00:00.000Z',
      Array.from({ length: 10_000 }, (_, index) => `.studio/index/${index}`),
    ))).rejects.toMatchObject({ code: 'invalid-manifest' });
  });

  it('rejects an oversized Blob before allocating its bytes', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const source = new Blob([]);
    Object.defineProperties(source, {
      size: { value: 513 * 1024 * 1024 },
      arrayBuffer: { value: arrayBuffer },
    });

    await expect(prepareVaultImport(createInMemoryVault(), source)).rejects.toMatchObject({
      code: 'archive-too-large',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rolls back already published files after a later write fails', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/a.md', note('a', 'new a'));
    await source.writeTextAtomic('Inbox/b.md', note('b', 'new b'));
    const base = createInMemoryVault();
    await base.writeTextAtomic('Inbox/a.md', note('a', 'old a'));
    await base.writeTextAtomic('Inbox/b.md', note('b', 'old b'));
    let publications = 0;
    const target: VaultPort = {
      list: (prefix) => base.list(prefix),
      readText: (path) => base.readText(path),
      readBinary: (path) => base.readBinary(path),
      writeTextAtomic: (path, text, condition) => base.writeTextAtomic(path, text, condition),
      async writeBinaryAtomic(path, content, condition) {
        if (!path.startsWith('.studio/import-') && ++publications === 2) {
          throw new Error('simulated storage failure');
        }
        return base.writeBinaryAtomic(path, content, condition);
      },
      move: (from, to, condition) => base.move(from, to, condition),
      remove: (path, condition) => base.remove(path, condition),
      exists: (path) => base.exists(path),
      watch: (listener) => base.watch(listener),
    };
    const plan = await prepareVaultImport(target, await exportVault(source));

    await expect(applyVaultImport(target, plan, { confirm: true }))
      .rejects.toThrow('simulated storage failure');
    await expect(target.readText('Inbox/a.md')).resolves.toMatchObject({ text: note('a', 'old a') });
    await expect(target.readText('Inbox/b.md')).resolves.toMatchObject({ text: note('b', 'old b') });
  });
});
