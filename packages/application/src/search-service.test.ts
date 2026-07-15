import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote, serializeNote } from '@studio/content';
import type { SearchFilters } from '@studio/index';
import { VaultConflictError } from '@studio/storage/portable';
import type { RevisionStore } from '@studio/storage/portable';

import {
  MAX_REPAIR_SOURCE_BYTES,
  SearchRepairConflictError,
  createStudioSearchService,
} from './search-service';
import { RecordingIndex, note, seed } from './test-helpers';

function revisions(events: string[] = []): RevisionStore {
  return {
    async create(reason, paths) {
      events.push(`snapshot:${reason}:${paths.join(',')}`);
      return {
        manifestPath: '.studio/backups/test/manifest.json',
        manifest: {
          version: 1,
          id: 'snapshot',
          reason,
          createdAt: '2026-07-14T00:00:00.000Z',
          state: 'complete',
          files: [],
        },
      };
    },
    async prune() {},
  };
}

describe('StudioSearchService retrieval', () => {
  let index: RecordingIndex;

  beforeEach(() => {
    index = new RecordingIndex();
  });

  it('delegates bounded local search and facets with typed filters', async () => {
    const vault = await seed([]);
    const filters: SearchFilters = {
      rooms: ['reflection-garden'],
      semanticTypes: ['reflection'],
      lifeAreas: ['family'],
      seasons: ['winter'],
      statuses: ['active'],
      tags: ['calm'],
      cardTypes: ['reflection'],
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-12-31T23:59:59.999Z',
    };
    const search = vi.spyOn(index, 'search').mockResolvedValue([{ id: 'n1' } as never]);
    const facets = vi.spyOn(index, 'facets');
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.search(' calm ', filters)).resolves.toEqual([{ id: 'n1' }]);
    await service.searchFacets(' calm ', filters);
    expect(search).toHaveBeenCalledWith('calm', filters);
    expect(facets).toHaveBeenCalledWith('calm', filters);
  });

  it('uses the warm index and reads only the inspected Markdown source', async () => {
    const inspected = note({
      id: 'inspected', title: 'Inspected',
      body: '[Forward](studio://note/forward), [[Missing]], and [[Shared]]',
    });
    const backlink = note({
      id: 'backlink', title: 'Backlink', body: '[Inspected](studio://note/inspected)',
    });
    const forward = note({ id: 'forward', title: 'Forward', body: '' });
    const firstShared = note({ id: 'shared-a', title: 'Shared', body: '' });
    const secondShared = note({ id: 'shared-b', title: 'Shared', body: '' });
    const vault = await seed([
      { path: 'Notes/Inspected.md', note: inspected },
      { path: 'Notes/Backlink.md', note: backlink },
      { path: 'Notes/Forward.md', note: forward },
      { path: 'Notes/Shared A.md', note: firstShared },
      { path: 'Notes/Shared B.md', note: secondShared },
    ]);
    for (const [path, indexedNote] of [
      ['Notes/Inspected.md', inspected],
      ['Notes/Backlink.md', backlink],
      ['Notes/Forward.md', forward],
      ['Notes/Shared A.md', firstShared],
      ['Notes/Shared B.md', secondShared],
    ] as const) {
      const file = await vault.readText(path);
      await index.upsert(indexedNote, path, file.hash);
    }
    const list = vi.spyOn(vault, 'list');
    const read = vi.spyOn(vault, 'readText');
    const backlinks = vi.spyOn(index, 'backlinks').mockResolvedValue([
      'backlink', 'inspected', 'backlink',
    ]);
    const forwardLinks = vi.spyOn(index, 'forwardLinks').mockResolvedValue([
      {
        sourceId: 'inspected', kind: 'id', target: 'forward',
        label: 'Forward', targetId: 'forward',
      },
      { sourceId: 'inspected', kind: 'wiki', target: 'Missing', label: 'Missing' },
      {
        sourceId: 'inspected', kind: 'wiki', target: 'Shared', label: 'Shared',
        candidateIds: ['shared-b', 'shared-a', 'shared-b'],
      },
    ]);
    const getManyById = vi.spyOn(index, 'getManyById');
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    const result = await service.inspect('inspected');

    expect(result).toMatchObject({
      note: { id: 'inspected' },
      backlinks: [{ id: 'backlink', path: 'Notes/Backlink.md', title: 'Backlink' }],
      forwardLinks: [
        { occurrence: 0, targetId: 'forward', state: 'resolved' },
        { occurrence: 1, state: 'broken' },
        { occurrence: 2, state: 'ambiguous', candidateIds: ['shared-a', 'shared-b'] },
      ],
    });
    expect(result?.forwardLinks[0]).toMatchObject({
      start: inspected.body.indexOf('[Forward]'),
      end: inspected.body.indexOf('[Forward]') + '[Forward](studio://note/forward)'.length,
    });
    expect(list).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(backlinks).toHaveBeenCalledWith('inspected');
    expect(forwardLinks).toHaveBeenCalledWith('inspected');
    expect(getManyById).toHaveBeenCalledWith([
      'backlink', 'forward', 'shared-b', 'shared-a',
    ]);
  });

  it('falls back to Markdown authority when indexed related references are stale', async () => {
    const target = note({ id: 'target', title: 'Target', body: '' });
    const backlink = note({
      id: 'backlink', title: 'Backlink', body: '[Target](studio://note/target)',
    });
    const vault = await seed([
      { path: 'Target.md', note: target },
      { path: 'Backlink.md', note: backlink },
    ]);
    const targetFile = await vault.readText('Target.md');
    await index.upsert(target, 'Target.md', targetFile.hash);
    vi.spyOn(index, 'backlinks').mockResolvedValue(['backlink', 'missing', 'backlink']);
    vi.spyOn(index, 'getManyById').mockResolvedValue([]);
    const list = vi.spyOn(vault, 'list');
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.inspect('target')).resolves.toMatchObject({
      backlinks: [{ id: 'backlink', path: 'Backlink.md', title: 'Backlink' }],
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('falls back to the canonical current file when the indexed revision changed', async () => {
    const original = note({ id: 'target', title: 'Before', body: '' });
    const current = note({ id: 'target', title: 'After', body: '[[Missing]]' });
    const vault = await seed([{ path: 'Current.md', note: current }]);
    await index.upsert(original, 'Current.md', '0'.repeat(64));
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.inspect('target')).resolves.toMatchObject({
      note: { title: 'After' }, path: 'Current.md',
      forwardLinks: [{ occurrence: 0, state: 'broken' }],
    });
  });

  it('falls back when the disposable index cannot be read', async () => {
    const target = note({ id: 'target', title: 'Canonical', body: '' });
    const vault = await seed([{ path: 'Target.md', note: target }]);
    vi.spyOn(index, 'getById').mockRejectedValue(new Error('index unavailable'));
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.inspect('target')).resolves.toMatchObject({
      note: { title: 'Canonical' }, path: 'Target.md',
    });
  });

  it('falls back when indexed links do not describe the authoritative body', async () => {
    const target = note({ id: 'target', title: 'Target', body: '[[Missing]]' });
    const vault = await seed([{ path: 'Target.md', note: target }]);
    const file = await vault.readText('Target.md');
    await index.upsert(target, 'Target.md', file.hash);
    vi.spyOn(index, 'forwardLinks').mockResolvedValue([
      { sourceId: 'target', kind: 'wiki', target: 'Different', label: 'Missing' },
    ]);
    const list = vi.spyOn(vault, 'list');
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.inspect('target')).resolves.toMatchObject({
      forwardLinks: [{ target: 'Missing', state: 'broken' }],
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized queries, filters, paths, IDs, and occurrences before adapters run', async () => {
    const vault = await seed([]);
    const service = createStudioSearchService({ vault, index, revisions: revisions() });
    const search = vi.spyOn(index, 'search');
    const oversized = { tags: Array.from({ length: 101 }, (_, value) => String(value)) };
    await expect(service.search('x'.repeat(513))).rejects.toThrow('512');
    await expect(service.search('x', oversized)).rejects.toThrow('100');
    await expect(service.search('x', { tags: ['x'.repeat(257)] })).rejects.toThrow('256');
    expect(search).not.toHaveBeenCalled();
    await service.search('x');
    await service.search('x', { dateFrom: '2026-01-01T00:00:00.000Z' });
    await expect(service.inspect('../unsafe')).rejects.toThrow('safe note ID');
    await expect(service.repairMetadata({
      path: '../outside.md', expectedHash: 'hash', sourceText: '', metadata: note(),
    })).rejects.toThrow('safe Studio file location');
    await expect(service.repairLink({
      path: 'Note.md', expectedHash: 'hash', sourceText: '', occurrence: -1, edit: { kind: 'remove' },
    })).rejects.toThrow('occurrence');
    expect(search).toHaveBeenCalledTimes(2);
  });

  it.each(['', 'x'.repeat(129), ' spaced ', 'e\u0301', 'bad?id'])(
    'rejects unsafe inspection ID %j',
    async (id) => {
      const service = createStudioSearchService({
        vault: await seed([]), index, revisions: revisions(),
      });
      await expect(service.inspect(id)).rejects.toThrow('safe note ID');
    },
  );

  it.each([
    '', 'x'.repeat(1_025), ' spaced.md ', 'e\u0301.md', '/absolute.md', 'trailing.md/',
    'back\\slash.md', 'null\0byte.md', 'C:/drive.md', 'double//part.md', './dot.md',
    '../parent.md', '.studio/control.md', '.STUDIO-lock/file.md',
  ])('rejects unsafe repair path %j', async (path) => {
    const service = createStudioSearchService({
      vault: await seed([]), index, revisions: revisions(),
    });
    await expect(service.repairLink({
      path, expectedHash: 'hash', sourceText: '', occurrence: 0, edit: { kind: 'remove' },
    })).rejects.toThrow('safe Studio file location');
  });

  it('inspects canonical typed backlinks and forward links even after the index is cleared', async () => {
    const target = note({ id: 'target', title: 'Target', body: '' });
    const source = note({
      id: 'source', title: 'Source', body: '[[Target]] [[Missing]] [Target](studio://note/target)',
    });
    const vault = await seed([
      { path: 'Notes/Source.md', note: source },
      { path: 'Notes/Target.md', note: target },
    ]);
    await index.clear();
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.inspect('target')).resolves.toMatchObject({
      note: { id: 'target' },
      backlinks: [{ id: 'source', path: 'Notes/Source.md', title: 'Source' }],
    });
    await expect(service.inspect('source')).resolves.toMatchObject({
      forwardLinks: [
        { occurrence: 0, targetId: 'target', state: 'resolved' },
        { occurrence: 1, state: 'broken' },
        { occurrence: 2, targetId: 'target', state: 'resolved' },
      ],
    });
  });

  it('returns null for a missing note and labels an untitled backlink calmly', async () => {
    const untitledTarget = note({ id: 'target' });
    const untitledSource = note({
      id: 'source', body: '[target](studio://note/target)',
    });
    delete untitledTarget.title;
    delete untitledSource.title;
    const vault = await seed([
      { path: 'Target.md', note: untitledTarget },
      { path: 'Source.md', note: untitledSource },
    ]);
    const service = createStudioSearchService({ vault, index, revisions: revisions() });
    await expect(service.inspect('missing')).resolves.toBeNull();
    await expect(service.inspect('target')).resolves.toMatchObject({
      backlinks: [{ title: 'Untitled' }],
    });
  });
});

describe('StudioSearchService repair queue', () => {
  it('derives malformed metadata, duplicate IDs, and every broken occurrence from Markdown authority', async () => {
    const duplicate = note({ id: 'same', title: 'Duplicate', body: '[[Missing]] and [[Missing]]' });
    const vault = await seed([
      { path: 'A.md', note: note({ id: 'same', title: 'Canonical' }) },
      { path: 'B.md', note: duplicate },
    ]);
    await vault.writeTextAtomic('Broken.md', '---\nsemantic_type: [\n---\nRaw body');
    const index = new RecordingIndex();
    index.clear = vi.fn().mockRejectedValue(new Error('disposed'));
    index.forwardLinks = vi.fn().mockRejectedValue(new Error('disposed'));
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    const queue = await service.repairQueue();
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'metadata', path: 'B.md', rawBody: duplicate.body }),
      expect.objectContaining({ kind: 'metadata', path: 'Broken.md', rawBody: 'Raw body' }),
      expect.objectContaining({ kind: 'broken-link', path: 'B.md', occurrence: 0, target: 'Missing' }),
      expect.objectContaining({ kind: 'broken-link', path: 'B.md', occurrence: 1, target: 'Missing' }),
    ]));
  });

  it('marks ambiguous wiki links without inventing a destination', async () => {
    const vault = await seed([
      { path: 'Source.md', note: note({ id: 'source', body: '[[Shared]]' }) },
      { path: 'One.md', note: note({ id: 'one', title: 'Shared' }) },
      { path: 'Two.md', note: note({ id: 'two', title: 'Shared' }) },
    ]);
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    await expect(service.repairQueue()).resolves.toContainEqual(expect.objectContaining({
      kind: 'broken-link', state: 'ambiguous', candidateIds: ['one', 'two'],
    }));
  });

  it('resolves safe relative paths and exposes escaping, absolute, ID, and duplicate-ID links', async () => {
    const vault = await seed([
      { path: 'Target.md', note: note({ id: 'target', title: 'Target' }) },
      { path: 'Folder/Duplicate.md', note: note({ id: 'dup', title: 'Duplicate' }) },
      { path: 'OtherDuplicate.md', note: note({ id: 'dup', title: 'Other duplicate' }) },
      { path: 'Folder/Source.md', note: note({
        id: 'source',
        body: [
          '[relative](./../Target.md)',
          '[escape](../../Outside.md)',
          '[absolute](/Absolute.md)',
          '[missing](studio://note/missing-id)',
          '[duplicate](studio://note/dup)',
        ].join(' '),
      }) },
    ]);
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    const items = (await service.repairQueue()).filter((item) => item.kind === 'broken-link');
    expect(items.map((item) => item.state)).toEqual(['broken', 'broken', 'broken', 'ambiguous']);
    expect(items.at(-1)).toMatchObject({ candidateIds: ['dup'] });
  });
});

describe('StudioSearchService repairs', () => {
  it('rejects malformed hashes, mismatched displayed source, and oversized repair payloads', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const source = await vault.readText('Source.md');
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    await expect(service.repairLink({
      path: 'Source.md', expectedHash: 'not-a-hash', sourceText: source.text,
      occurrence: 0, edit: { kind: 'remove' },
    })).rejects.toThrow('SHA-256');
    await expect(service.repairLink({
      path: 'Source.md', expectedHash: source.hash, sourceText: serializeNote(note({ id: 'other' })),
      occurrence: 0, edit: { kind: 'remove' },
    })).rejects.toThrow('displayed source');
    await expect(service.repairMetadata({
      path: 'Source.md', expectedHash: source.hash,
      sourceText: 'x'.repeat(MAX_REPAIR_SOURCE_BYTES + 1), metadata: note(),
    })).rejects.toThrow('too large');
    await expect(service.repairMetadata({
      path: 'Source.md', expectedHash: source.hash,
      sourceText: 'é'.repeat(Math.floor(MAX_REPAIR_SOURCE_BYTES / 2) + 1), metadata: note(),
    })).rejects.toThrow('too large');
  });

  it('snapshots before metadata repair and preserves body, CRLF, attachments, and safe unknown keys', async () => {
    const events: string[] = [];
    const vault = await seed([]);
    const source = [
      '---',
      'schema_version: 1',
      'id: repaired',
      'title: Before',
      'card_type: note',
      'semantic_type: invalid',
      'status: active',
      'rooms: []',
      'life_areas: []',
      'seasons: []',
      'tags: []',
      'created: 2026-07-13T00:00:00.000Z',
      'updated: 2026-07-13T00:00:00.000Z',
      'attachments: [Media/photo.jpg]',
      'display: { featured: false }',
      'privacy: { sensitivity: private, ai_access: ask }',
      'custom_safe: keep',
      '---',
      'Body **stays** byte-for-byte.',
    ].join('\r\n');
    const created = await vault.writeTextAtomic('Repair.md', source);
    const originalWrite = vault.writeTextAtomic.bind(vault);
    vault.writeTextAtomic = async (...arguments_) => {
      events.push('write');
      return originalWrite(...arguments_);
    };
    const index = new RecordingIndex();
    const service = createStudioSearchService({ vault, index, revisions: revisions(events) });
    const metadata = note({
      id: 'repaired', title: 'After', semanticType: 'reflection', body: 'ignored',
      attachments: ['wrong.jpg'], extraFrontmatter: { form_only: 'drop' }, lineEnding: '\n',
    });

    const result = await service.repairMetadata({
      path: 'Repair.md', expectedHash: created.hash, sourceText: source, metadata,
    });
    expect(events).toEqual(['snapshot:conflict-resolution:Repair.md', 'write']);
    const durable = await vault.readText('Repair.md');
    expect(durable.text).toContain('custom_safe: keep\r\n');
    expect(durable.text).not.toContain('form_only');
    const parsed = parseNote(durable.text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.note).toMatchObject({
        title: 'After', body: 'Body **stays** byte-for-byte.',
        attachments: ['Media/photo.jpg'], lineEnding: '\r\n',
      });
    }
    expect(result.hash).toBe(durable.hash);
    expect(index.entries.get('repaired')?.hash).toBe(durable.hash);
  });

  it('falls back to corrected attachments and rejects a still-invalid metadata form', async () => {
    const source = '---\nattachments: [1]\n---\nBody';
    const vault = await seed([]);
    const created = await vault.writeTextAtomic('Repair.md', source);
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    const metadata = note({ id: 'repaired', attachments: ['corrected.jpg'] });
    const repaired = await service.repairMetadata({
      path: 'Repair.md', expectedHash: created.hash, sourceText: source, metadata,
    });
    expect(repaired.note.attachments).toEqual(['corrected.jpg']);

    await expect(service.repairMetadata({
      path: 'Repair.md', expectedHash: repaired.hash, sourceText: serializeNote(repaired.note),
      metadata: { ...metadata, semanticType: 'invalid' as never },
    })).rejects.toThrow('still invalid');
  });

  it('rejects a stable ID owned by another canonical path before publishing a repair', async () => {
    const events: string[] = [];
    const vault = await seed([
      { path: 'A.md', note: note({ id: 'shared-id', title: 'Canonical owner' }) },
      { path: 'B.md', note: note({ id: 'shared-id', title: 'Duplicate' }) },
    ]);
    const duplicate = await vault.readText('B.md');
    const originalWrite = vault.writeTextAtomic.bind(vault);
    const writes = vi.spyOn(vault, 'writeTextAtomic');
    const index = new RecordingIndex();
    const upsert = vi.spyOn(index, 'upsert');
    const service = createStudioSearchService({ vault, index, revisions: revisions(events) });

    await expect(service.repairMetadata({
      path: 'B.md',
      expectedHash: duplicate.hash,
      sourceText: duplicate.text,
      metadata: note({ id: 'shared-id', title: 'Still duplicate' }),
    })).rejects.toThrow('already belongs to A.md');

    expect(events).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    await expect(vault.readText('B.md')).resolves.toEqual(duplicate);
    writes.mockRestore();
    vault.writeTextAtomic = originalWrite;
  });

  it('allows the canonical owning path and a unique replacement stable ID', async () => {
    const vault = await seed([
      { path: 'A.md', note: note({ id: 'shared-id', title: 'Canonical owner' }) },
      { path: 'B.md', note: note({ id: 'shared-id', title: 'Duplicate' }) },
    ]);
    const owner = await vault.readText('A.md');
    const duplicate = await vault.readText('B.md');
    const index = new RecordingIndex();
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    await expect(service.repairMetadata({
      path: 'A.md',
      expectedHash: owner.hash,
      sourceText: owner.text,
      metadata: note({ id: 'shared-id', title: 'Owner repaired' }),
    })).resolves.toMatchObject({ note: { id: 'shared-id' }, path: 'A.md' });

    await expect(service.repairMetadata({
      path: 'B.md',
      expectedHash: duplicate.hash,
      sourceText: duplicate.text,
      metadata: note({ id: 'unique-id', title: 'Duplicate repaired' }),
    })).resolves.toMatchObject({ note: { id: 'unique-id' }, path: 'B.md' });
    expect(index.entries.get('shared-id')?.path).toBe('A.md');
    expect(index.entries.get('unique-id')?.path).toBe('B.md');
  });

  it('repairs or removes exactly one positioned link and keeps the durable result if indexing fails', async () => {
    const original = note({ id: 'source', body: '[[Missing]] and [[Missing]]' });
    const vault = await seed([{ path: 'Source.md', note: original }]);
    const current = await vault.readText('Source.md');
    const index = new RecordingIndex();
    index.failUpsert = true;
    const service = createStudioSearchService({ vault, index, revisions: revisions() });

    const repaired = await service.repairLink({
      path: 'Source.md', expectedHash: current.hash, occurrence: 1,
      sourceText: current.text,
      edit: { kind: 'id', target: 'target' },
    });
    expect(repaired.note.body).toBe('[[Missing]] and [Missing](studio://note/target)');
    const removed = await service.repairLink({
      path: 'Source.md', expectedHash: repaired.hash, occurrence: 0,
      sourceText: serializeNote(repaired.note),
      edit: { kind: 'remove' },
    });
    expect(removed.note.body).toBe('Missing and [Missing](studio://note/target)');
  });

  it('preserves attempted and canonical text when an exact-CAS repair conflicts', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const stale = await vault.readText('Source.md');
    await vault.writeTextAtomic('Source.md', serializeNote(note({ id: 'source', body: 'Concurrent' })), {
      expectedHash: stale.hash,
    });
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });

    const conflict = await service.repairLink({
      path: 'Source.md', expectedHash: stale.hash, occurrence: 0, edit: { kind: 'remove' },
      sourceText: stale.text,
    }).catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(SearchRepairConflictError);
    expect(conflict).toMatchObject({ durableText: expect.stringContaining('Concurrent') });
    expect((conflict as SearchRepairConflictError).attemptedText).toContain('Missing');
    await expect(vault.readText('Source.md')).resolves.toMatchObject({
      text: expect.stringContaining('Concurrent'),
    });
  });

  it('preserves attempted text when another writer wins after the snapshot', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const source = await vault.readText('Source.md');
    const originalWrite = vault.writeTextAtomic.bind(vault);
    let race = true;
    vault.writeTextAtomic = async (...arguments_) => {
      if (race && arguments_[0] === 'Source.md') {
        race = false;
        await originalWrite('Source.md', serializeNote(note({ id: 'source', body: 'Race winner' })), {
          expectedHash: source.hash,
        });
        throw new VaultConflictError();
      }
      return originalWrite(...arguments_);
    };
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    const conflict = await service.repairLink({
      path: 'Source.md', expectedHash: source.hash, sourceText: source.text,
      occurrence: 0, edit: { kind: 'remove' },
    }).catch((error: unknown) => error);
    expect(conflict).toMatchObject({
      attemptedText: expect.stringContaining('Missing'),
      durableText: expect.stringContaining('Race winner'),
    });
  });

  it('keeps attempted text when the canonical version becomes temporarily unreadable after conflict', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const source = await vault.readText('Source.md');
    const originalRead = vault.readText.bind(vault);
    let reads = 0;
    vault.readText = async (path) => {
      reads += 1;
      if (reads > 1) throw new Error('temporarily unavailable');
      return originalRead(path);
    };
    vault.writeTextAtomic = vi.fn().mockRejectedValue(new VaultConflictError());
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    const conflict = await service.repairLink({
      path: 'Source.md', expectedHash: source.hash, sourceText: source.text,
      occurrence: 0, edit: { kind: 'remove' },
    }).catch((error: unknown) => error);
    expect(conflict).toMatchObject({ attemptedText: expect.stringContaining('Missing'), durableText: '' });
  });

  it('does not hide non-conflict storage failures or malformed link-source metadata', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const source = await vault.readText('Source.md');
    const malformed = await vault.writeTextAtomic('Malformed.md', 'not a note');
    vault.writeTextAtomic = vi.fn().mockRejectedValue(new Error('storage offline'));
    const service = createStudioSearchService({
      vault, index: new RecordingIndex(), revisions: revisions(),
    });
    await expect(service.repairLink({
      path: 'Source.md', expectedHash: source.hash, sourceText: source.text,
      occurrence: 0, edit: { kind: 'remove' },
    })).rejects.toThrow('storage offline');
    await expect(service.repairLink({
      path: 'Source.md', expectedHash: malformed.hash, sourceText: 'not a note',
      occurrence: 0, edit: { kind: 'remove' },
    })).rejects.toThrow('metadata');
  });

  it('uses the production revision store by default', async () => {
    const vault = await seed([{ path: 'Source.md', note: note({ id: 'source', body: '[[Missing]]' }) }]);
    const source = await vault.readText('Source.md');
    const service = createStudioSearchService({ vault, index: new RecordingIndex() });
    await service.repairLink({
      path: 'Source.md', expectedHash: source.hash, sourceText: source.text,
      occurrence: 0, edit: { kind: 'remove' },
    });
    expect((await vault.list('.studio/backups')).some((entry) => entry.path.endsWith('manifest.json')))
      .toBe(true);
  });
});
