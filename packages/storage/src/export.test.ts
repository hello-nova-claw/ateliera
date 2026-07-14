import { describe, expect, it, vi } from 'vitest';

import { createInMemoryVault } from './in-memory-vault';
import { exportVault } from './export';
import { importVault } from './import';
import type { VaultPort } from './vault-port';

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
  });
});
