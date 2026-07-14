import { describe, expect, it, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';

import { createInMemoryVault } from './in-memory-vault';
import { exportVault } from './export';
import { applyVaultImport, prepareVaultImport } from './import';
import { createZip32, sha256 } from './zip32';
import type { VaultPort } from './vault-port';

const note = (id: string, body: string) => `---\nschema_version: 1\nid: ${id}\n---\n${body}\n`;

function zipNumber(value: number, width: 2 | 4): Uint8Array {
  const bytes = new Uint8Array(width);
  const view = new DataView(bytes.buffer);
  if (width === 2) view.setUint16(0, value, true);
  else view.setUint32(0, value, true);
  return bytes;
}

function zipJoin(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function createDeflatedZip(files: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const compressed = new Uint8Array(deflateRawSync(content));
    const checksum = crc32(content);
    const local = zipJoin([
      zipNumber(0x0403_4b50, 4), zipNumber(20, 2), zipNumber(0x0800, 2),
      zipNumber(8, 2), zipNumber(0, 2), zipNumber(0, 2), zipNumber(checksum, 4),
      zipNumber(compressed.byteLength, 4), zipNumber(content.byteLength, 4),
      zipNumber(name.byteLength, 2), zipNumber(0, 2), name, compressed,
    ]);
    locals.push(local);
    centrals.push(zipJoin([
      zipNumber(0x0201_4b50, 4), zipNumber(20, 2), zipNumber(20, 2),
      zipNumber(0x0800, 2), zipNumber(8, 2), zipNumber(0, 2), zipNumber(0, 2),
      zipNumber(checksum, 4), zipNumber(compressed.byteLength, 4),
      zipNumber(content.byteLength, 4), zipNumber(name.byteLength, 2), zipNumber(0, 2),
      zipNumber(0, 2), zipNumber(0, 2), zipNumber(0, 2), zipNumber(0, 4),
      zipNumber(localOffset, 4), name,
    ]));
    localOffset += local.byteLength;
  }
  const central = zipJoin(centrals);
  return zipJoin([
    ...locals, central, zipNumber(0x0605_4b50, 4), zipNumber(0, 2), zipNumber(0, 2),
    zipNumber(files.length, 2), zipNumber(files.length, 2), zipNumber(central.byteLength, 4),
    zipNumber(localOffset, 4), zipNumber(0, 2),
  ]);
}

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

  it('rejects distinct path and stable-ID owners before preview can overwrite either', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/note.md', note('stable-id', 'incoming'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/note.md', note('path-owner', 'keep path owner'));
    await target.writeTextAtomic('Archive/original.md', note('stable-id', 'keep ID owner'));

    await expect(prepareVaultImport(target, await exportVault(source))).rejects.toMatchObject({
      code: 'path-collision',
    });
    await expect(target.readText('Inbox/note.md')).resolves.toMatchObject({
      text: note('path-owner', 'keep path owner'),
    });
    await expect(target.readText('Archive/original.md')).resolves.toMatchObject({
      text: note('stable-id', 'keep ID owner'),
    });
  });

  it('rejects two incoming notes that would claim the same existing target', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/path.md', note('incoming-a', 'incoming A'));
    await source.writeTextAtomic('Inbox/renamed.md', note('existing-id', 'incoming B'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/path.md', note('existing-id', 'keep existing'));

    await expect(prepareVaultImport(target, await exportVault(source))).rejects.toMatchObject({
      code: 'path-collision',
    });
    await expect(target.readText('Inbox/path.md')).resolves.toMatchObject({
      text: note('existing-id', 'keep existing'),
    });
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

    await expect(applyVaultImport(target, plan, {
      confirm: true,
      conflicts: { 'Inbox/conflict.md': 'overwrite' },
    })).resolves.toEqual({ created: 0, overwritten: 1, skipped: 0 });
    await expect(target.readText('Inbox/conflict.md')).resolves.toMatchObject({
      text: note('incoming', 'incoming'),
    });
  });

  it('accepts only exact own-property conflict resolutions', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/conflict.md', note('incoming', 'incoming'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Inbox/conflict.md', note('local', 'local'));
    const plan = await prepareVaultImport(target, await exportVault(source));
    const inherited = Object.create({ 'Inbox/conflict.md': 'overwrite' }) as Record<
      string,
      'overwrite' | 'skip'
    >;

    await expect(applyVaultImport(target, plan, {
      confirm: true,
      conflicts: inherited,
    })).rejects.toMatchObject({ code: 'unresolved-conflict' });
    await expect(applyVaultImport(target, plan, {
      confirm: true,
      conflicts: { 'Inbox/conflict.md': 'invalid' } as unknown as Record<
        string,
        'overwrite' | 'skip'
      >,
    })).rejects.toMatchObject({ code: 'unresolved-conflict' });
    await expect(target.readText('Inbox/conflict.md')).resolves.toMatchObject({
      text: note('local', 'local'),
    });
  });

  it.each(['constructor', 'toString'])('does not resolve the inherited %s property', async (path) => {
    const source = createInMemoryVault();
    await source.writeTextAtomic(path, 'incoming');
    const target = createInMemoryVault();
    const existingPath = `${path[0]?.toLocaleUpperCase('en')}${path.slice(1)}`;
    await target.writeTextAtomic(existingPath, 'local');
    const plan = await prepareVaultImport(target, await exportVault(source));

    await expect(applyVaultImport(target, plan, {
      confirm: true,
      conflicts: {},
    })).rejects.toMatchObject({ code: 'unresolved-conflict' });
    await expect(target.readText(existingPath)).resolves.toMatchObject({ text: 'local' });
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

  it('revalidates final note-ID ownership before publishing a prepared plan', async () => {
    const source = createInMemoryVault();
    await source.writeTextAtomic('Inbox/new.md', note('new-id', 'incoming'));
    const target = createInMemoryVault();
    await target.writeTextAtomic('Archive/existing.md', note('stable-id', 'keep existing'));
    const plan = await prepareVaultImport(target, await exportVault(source));
    const duplicate = new TextEncoder().encode(note('stable-id', 'tampered incoming'));
    const duplicateHash = await sha256(duplicate);
    (plan.files as Map<string, Uint8Array>).set('Inbox/new.md', duplicate);
    Object.assign(plan.items[0] as object, { sha256: duplicateHash });

    await expect(applyVaultImport(target, plan, { confirm: true })).rejects.toMatchObject({
      code: 'path-collision',
    });
    await expect(target.exists('Inbox/new.md')).resolves.toBe(false);
    await expect(target.readText('Archive/existing.md')).resolves.toMatchObject({
      text: note('stable-id', 'keep existing'),
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

  it('accepts a canonical manifest and content compressed with standard deflate', async () => {
    const content = new TextEncoder().encode(note('compressed-id', 'Compressed hill'));
    const descriptor = {
      path: 'Inbox/hill.md',
      sha256: await sha256(content),
      size: content.byteLength,
    };
    const manifest = new TextEncoder().encode(`${JSON.stringify({
      format: 'the-studio-vault',
      exportVersion: 1,
      schemaVersions: { note: 1, settings: 1 },
      generatedAt: '2026-07-14T00:00:00.000Z',
      files: [descriptor],
      excludedCaches: [],
    }, null, 2)}\n`);
    const archive = createDeflatedZip([
      [descriptor.path, content],
      ['.studio/export-manifest.json', manifest],
    ]);
    const target = createInMemoryVault();

    const plan = await prepareVaultImport(target, archive);
    await applyVaultImport(target, plan, { confirm: true });

    await expect(target.readText(descriptor.path)).resolves.toMatchObject({
      text: note('compressed-id', 'Compressed hill'),
    });
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
