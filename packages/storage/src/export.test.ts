import { describe, expect, it, vi } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import { exportVault } from './export';
import { importVault } from './import';
import type { VaultPort } from './vault-port';
import { parseZip32, sha256 } from './zip32';
import { VaultUnavailableError } from './conflict';

async function snapshot(vault: ReturnType<typeof createInMemoryVault>) {
  const files = (await vault.list()).filter((entry) => entry.kind === 'file');
  return Promise.all(files.map(async (entry) => [entry.path, await vault.readBinary(entry.path)] as const));
}

describe('portable vault export', () => {
  it('restores a complete export into an empty vault with the same semantic files', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Foyer/vision.md', '---\nschema_version: 1\nid: note-1\n---\n# Vision\n');
    await source.writeBinaryAtomic('Attachments/hill.jpg', new Uint8Array([0xff, 0xd8, 0xff]));
    await source.writeTextAtomic('.studio/settings/theme.json', '{"theme":"chamomile"}');
    await source.writeTextAtomic('.studio/config/landscape-areas.json', '{"areas":["home"]}');
    await source.writeTextAtomic(
      '.studio/views/life-landscape.json',
      '{"version":1,"manualOrder":["note-1"]}',
    );
    await source.writeTextAtomic(
      '.studio/seasons/winter-draft.json',
      '{"version":1,"step":"priorities"}',
    );
    await source.writeTextAtomic('.studio/Trash/note-2/old.md', '# Recoverable words\n');
    await source.writeTextAtomic('.studio/index/search.sqlite', 'disposable');
    await source.writeTextAtomic('.studio/import-stage/old/file.md', 'transient');

    const archive = await exportVault(source, { generatedAt: '2026-07-14T00:00:00.000Z' });
    const target = createInMemoryVault();
    await importVault(target, archive, { confirm: true });

    expect(await snapshot(target)).toEqual([
      ['.studio/config/landscape-areas.json', new TextEncoder().encode('{"areas":["home"]}')],
      [
        '.studio/seasons/winter-draft.json',
        new TextEncoder().encode('{"version":1,"step":"priorities"}'),
      ],
      ['.studio/settings/theme.json', new TextEncoder().encode('{"theme":"chamomile"}')],
      ['.studio/Trash/note-2/old.md', new TextEncoder().encode('# Recoverable words\n')],
      [
        '.studio/views/life-landscape.json',
        new TextEncoder().encode('{"version":1,"manualOrder":["note-1"]}'),
      ],
      ['Attachments/hill.jpg', new Uint8Array([0xff, 0xd8, 0xff])],
      ['Foyer/vision.md', new TextEncoder().encode('---\nschema_version: 1\nid: note-1\n---\n# Vision\n')],
    ]);
  });

  it('is byte-deterministic for the same files and generated time', async () => {
    const first = createInMemoryVault();
    const second = createInMemoryVault();
    await first.writeTextAtomic('Zeta.md', 'z');
    await first.writeTextAtomic('Alpha.md', 'a');
    await second.writeTextAtomic('Alpha.md', 'a');
    await second.writeTextAtomic('Zeta.md', 'z');

    const options = { generatedAt: '2026-07-14T00:00:00.000Z' } as const;
    expect(await exportVault(first, options)).toEqual(await exportVault(second, options));
  });

  it('round-trips backup manifests and payloads with exact portable metadata', async () => {
    const source = createInMemoryVault();
    const manifestPath = '.studio/backups/2026-07-14/manifest.json';
    const payloadPath = '.studio/backups/2026-07-14/vault.bin';
    const backupManifest = new TextEncoder().encode('{"version":1,"reason":"manual"}\n');
    const backupPayload = new Uint8Array([0, 1, 2, 3, 255]);
    await source.writeBinaryAtomic(manifestPath, backupManifest);
    await source.writeBinaryAtomic(payloadPath, backupPayload);

    const archive = await exportVault(source, { generatedAt: '2026-07-14T00:00:00.000Z' });
    const files = await parseZip32(archive);
    expect(files.get(manifestPath)).toEqual(backupManifest);
    expect(files.get(payloadPath)).toEqual(backupPayload);
    const portableManifest = JSON.parse(new TextDecoder().decode(
      files.get('.studio/export-manifest.json'),
    )) as { files: Array<{ path: string; sha256: string; size: number }> };
    expect(portableManifest.files).toEqual([
      { path: manifestPath, sha256: await sha256(backupManifest), size: backupManifest.byteLength },
      { path: payloadPath, sha256: await sha256(backupPayload), size: backupPayload.byteLength },
    ]);

    const target = createInMemoryVault();
    await importVault(target, archive, { confirm: true });
    await expect(target.readBinary(manifestPath)).resolves.toEqual(backupManifest);
    await expect(target.readBinary(payloadPath)).resolves.toEqual(backupPayload);
  });

  it('rejects active content and normalized path collisions', async () => {
    const active = createInMemoryVault();
    await active.writeTextAtomic('Attachments/run.html', '<script>alert(1)</script>');
    await expect(exportVault(active)).rejects.toMatchObject({
      code: 'active-content',
    });

    const collision = createInMemoryVault();
    await collision.writeTextAtomic('Inbox/Café.md', 'one');
    await collision.writeTextAtomic('Inbox/Cafe\u0301.md', 'two');
    await expect(exportVault(collision)).rejects.toMatchObject({
      code: 'path-collision',
    });
  });

  it('rejects entry-size and file-count limits before reading content', async () => {
    const readBinary = vi.fn(async () => new Uint8Array());
    const vault = {
      getRevision: vi.fn(async () => '0'),
      list: vi.fn(async () => [{
        kind: 'file' as const,
        path: 'Attachments/large.pdf',
        size: 65 * 1024 * 1024,
      }]),
      readBinary,
    } as unknown as VaultPort;

    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'archive-too-large' });
    expect(readBinary).not.toHaveBeenCalled();

    vault.list = vi.fn(async () => Array.from({ length: 10_000 }, (_, index) => ({
      kind: 'file' as const,
      path: `Inbox/${index}.md`,
      size: 0,
    })));
    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'archive-too-large' });
    expect(readBinary).not.toHaveBeenCalled();

    vault.list = vi.fn(async () => Array.from({ length: 10_000 }, (_, index) => ({
      kind: 'file' as const,
      path: `.studio/cache/${index}.bin`,
      size: 0,
    })));
    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'archive-too-large' });
    expect(readBinary).not.toHaveBeenCalled();
  });

  it('uses the bounded primitive when a listed source grows before capture', async () => {
    const readBinary = vi.fn(async () => new Uint8Array([1]));
    const readBinaryBounded = vi.fn(async () => {
      throw new VaultUnavailableError('The source grew beyond 64 MiB.');
    });
    const vault = {
      getRevision: vi.fn(async () => '0'),
      list: vi.fn(async () => [{
        kind: 'file' as const,
        path: 'Attachments/growing.bin',
        size: 1,
      }]),
      readBinary,
      readBinaryBounded,
    } as unknown as VaultPort;

    await expect(exportVault(vault)).rejects.toMatchObject({
      code: 'source-changed',
      message:
        'The Studio changed while the backup was being created. Nothing was exported; try again.',
    });
    expect(readBinaryBounded).toHaveBeenCalledWith(
      'Attachments/growing.bin',
      64 * 1024 * 1024,
    );
    expect(readBinary).not.toHaveBeenCalled();
  });

  it.each([
    ['edited', async (vault: VaultPort) => {
      await vault.writeTextAtomic('Inbox/note.md', 'edited after capture');
    }],
    ['added', async (vault: VaultPort) => {
      await vault.writeTextAtomic('Inbox/added.md', 'added after capture');
    }],
    ['removed', async (vault: VaultPort) => {
      await vault.remove('Inbox/note.md');
    }],
  ] as const)('rejects when a source file is %s during export', async (_change, mutate) => {
    const base = createInMemoryVault();
    await base.writeTextAtomic('Inbox/note.md', 'captured');
    let firstRead = true;
    const vault: VaultPort = {
      getRevision: () => base.getRevision(),
      list: (prefix) => base.list(prefix),
      readText: (path) => base.readText(path),
      async readBinary(path) {
        const bytes = await base.readBinary(path);
        if (firstRead) {
          firstRead = false;
          await mutate(base);
        }
        return bytes;
      },
      writeTextAtomic: (path, text, condition) => base.writeTextAtomic(path, text, condition),
      writeBinaryAtomic: (path, bytes, condition) => base.writeBinaryAtomic(path, bytes, condition),
      writeBatchAtomic: (input) => base.writeBatchAtomic(input),
      move: (from, to, condition) => base.move(from, to, condition),
      remove: (path, condition) => base.remove(path, condition),
      exists: (path) => base.exists(path),
      watch: (listener) => base.watch(listener),
    };

    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'source-changed' });
  });

  it('rejects a two-file ABA mutation even when every final byte matches the capture', async () => {
    const base = createInMemoryVault();
    await base.writeTextAtomic('Inbox/a.md', 'a');
    await base.writeTextAtomic('Inbox/b.md', 'b');
    let reads = 0;
    const vault: VaultPort = {
      getRevision: () => base.getRevision(),
      list: (prefix) => base.list(prefix),
      readText: (path) => base.readText(path),
      async readBinary(path) {
        const bytes = await base.readBinary(path);
        if (++reads === 2) {
          await base.writeTextAtomic('Inbox/a.md', 'temporary');
          await base.writeTextAtomic('Inbox/a.md', 'a');
        }
        return bytes;
      },
      writeTextAtomic: (path, text, condition) => base.writeTextAtomic(path, text, condition),
      writeBinaryAtomic: (path, bytes, condition) => base.writeBinaryAtomic(path, bytes, condition),
      writeBatchAtomic: (input) => base.writeBatchAtomic(input),
      move: (from, to, condition) => base.move(from, to, condition),
      remove: (path, condition) => base.remove(path, condition),
      exists: (path) => base.exists(path),
      watch: (listener) => base.watch(listener),
    };

    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'source-changed' });
  });

  it('returns a typed source change when a listed file disappears before capture', async () => {
    const base = createInMemoryVault();
    await base.writeTextAtomic('Inbox/note.md', 'captured');
    let firstRead = true;
    const vault = {
      getRevision: () => base.getRevision(),
      list: (prefix?: string) => base.list(prefix),
      async readBinary(path: string) {
        if (firstRead) {
          firstRead = false;
          await base.remove(path);
        }
        return base.readBinary(path);
      },
    } as VaultPort;

    await expect(exportVault(vault)).rejects.toMatchObject({ code: 'source-changed' });
  });
});
