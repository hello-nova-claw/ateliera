import { parseNote, serializeNote } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import {
  createInMemoryVault,
  createRevisionStore,
  createStudioControlVault,
  type RevisionStore,
  type StudioControlVault,
  type VaultPort,
  VaultConflictError,
} from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  createSeasonCloseTransactionService,
  SeasonClosePreflightError,
  type SeasonCloseRequest,
} from './season-close-transaction';
import { createStudioService } from './studio-service';
import { note, RecordingIndex } from './test-helpers';

const now = '2026-07-14T00:00:00.000Z';

function seasonNote(priorityIds: string[]): StudioNote {
  return note({
    id: 'season-winter',
    title: 'A spacious winter',
    cardType: 'season',
    semanticType: 'growth',
    status: 'active',
    rooms: ['current-season'],
    created: now,
    updated: now,
    extraFrontmatter: {
      season_id: 'season-winter',
      priorities: priorityIds,
    },
  });
}

async function seed(
  vault: VaultPort,
  path: string,
  value: StudioNote,
): Promise<{ note: StudioNote; path: string; hash: string }> {
  const written = await vault.writeTextAtomic(path, serializeNote(value), {
    expectedMissing: true,
  });
  return { note: value, path, hash: written.hash };
}

function request(season: Awaited<ReturnType<typeof seed>>): SeasonCloseRequest {
  return {
    transactionId: 'close-winter',
    season,
    closedSeasonNote: { ...season.note, status: 'archived', updated: now },
    priorityIds: ['home', 'book', 'rest', 'future', 'idea'],
    reflection: {
      celebration: '  We made room.  ',
      learning: ' Small was enough. ',
      identity: ' More trusting. ',
    },
    dispositions: [
      { noteId: 'home', disposition: 'celebrate', expectedHash: '' },
      { noteId: 'book', disposition: 'archive', expectedHash: '' },
      { noteId: 'rest', disposition: 'return-landscape', expectedHash: '' },
      { noteId: 'future', disposition: 'invite-forward', expectedHash: '' },
      { noteId: 'idea', disposition: 'release', expectedHash: '' },
    ],
    letter: note({
      id: 'letter-winter',
      title: 'A letter from A spacious winter',
      body: 'We made room.\n',
      cardType: 'season-letter',
      semanticType: 'reflection',
      status: 'active',
      rooms: ['reflection-garden'],
      seasons: ['season-winter'],
      created: now,
      updated: now,
      extraFrontmatter: { season_id: 'season-winter' },
    }),
  };
}

async function setup() {
  const vault = createInMemoryVault();
  const priorities = [
    ['Home/home.md', note({ id: 'home', title: 'A calm home' })],
    ['Projects/book.md', note({ id: 'book', title: 'Write the book' })],
    ['Inbox/rest.md', note({ id: 'rest', title: 'Rest more', rooms: [] })],
    ['Wisdom/future.md', note({ id: 'future', title: 'A future thread' })],
    ['Ideas/idea.md', note({ id: 'idea', title: 'An idea' })],
  ] as const;
  const savedPriorities = new Map<string, Awaited<ReturnType<typeof seed>>>();
  for (const [path, value] of priorities) {
    savedPriorities.set(value.id, await seed(vault, path, value));
  }
  const season = await seed(
    vault,
    'Current Season/winter.md',
    seasonNote(priorities.map(([, value]) => value.id)),
  );
  let snapshot = 0;
  const revisions = createRevisionStore(vault, {
    clock: () => new Date(now),
    generateId: () => `snapshot-winter-${(snapshot += 1)}`,
  });
  const closeRequest = request(season);
  closeRequest.dispositions = closeRequest.dispositions.map((item) => ({
    ...item,
    expectedHash: savedPriorities.get(item.noteId)!.hash,
  }));
  return { vault, season, revisions, closeRequest };
}

function replaceAtPath(
  value: object,
  path: ReadonlyArray<string | number>,
  replacement: unknown,
): void {
  let cursor = value;
  for (const segment of path.slice(0, -1)) {
    cursor = Reflect.get(cursor, segment) as object;
  }
  Reflect.set(cursor, path.at(-1)!, replacement);
}

async function expectUnreadableJournal(value: unknown): Promise<void> {
  const vault = createInMemoryVault();
  const control = createStudioControlVault(vault);
  await control.writeTextAtomic(
    '.studio/season/close-journal.json',
    typeof value === 'string' ? value : JSON.stringify(value),
    { expectedMissing: true },
  );
  const service = createSeasonCloseTransactionService({
    vault,
    control,
    revisions: createRevisionStore(vault),
    clock: () => new Date(now),
  });
  await expect(service.resume()).rejects.toThrow('checkpoint is unreadable');
}

describe('season close transaction', () => {
  it('prepares a durable journal without snapshots or user-note mutations and reports it', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const create = vi.spyOn(revisions, 'create');
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });

    await expect(service.pending()).resolves.toBeNull();
    await expect(service.resume()).resolves.toBeNull();
    await service.prepare(closeRequest);
    await service.prepare(closeRequest);

    await expect(service.pending()).resolves.toEqual({
      transactionId: 'close-winter',
      seasonNoteId: 'season-winter',
      seasonPath: 'Current Season/winter.md',
      stage: 'prepared',
    });
    expect(create).not.toHaveBeenCalled();
    expect((await load(vault, closeRequest.season.path)).status).toBe('active');
    expect(
      (await createStudioControlVault(vault).list('.studio/backups')).filter(
        (entry) => entry.kind === 'file',
      ),
    ).toEqual([]);
  });

  it('snapshots every canonical target and applies five distinct durable outcomes before archiving the season last', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const writes: string[] = [];
    const recordingVault = new Proxy(vault, {
      get(target, property, receiver) {
        if (property !== 'writeTextAtomic') {
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (
          path: string,
          text: string,
          condition?: Parameters<VaultPort['writeTextAtomic']>[2],
        ) => {
          const result = await vault.writeTextAtomic(path, text, condition);
          writes.push(path);
          return result;
        };
      },
    });
    const service = createSeasonCloseTransactionService({
      vault: recordingVault,
      control: createStudioControlVault(recordingVault),
      revisions,
      clock: () => new Date(now),
    });

    const result = await service.close(closeRequest);

    expect(result.season.note.status).toBe('archived');
    expect(writes.filter((path) => !path.startsWith('.studio/')).at(-1)).toBe(
      'Current Season/winter.md',
    );
    expect(writes.at(-1)).toBe('.studio/season/close-journal.json');
    const snapshot = await vault.readText(
      '.studio/backups/2026-07-14/2026-07-14T00-00-00-000Z--snapshot-winter-1/manifest.json',
    );
    expect(
      JSON.parse(snapshot.text).files.map(
        (file: { originalPath: string }) => file.originalPath,
      ),
    ).toEqual([
      'Current Season/winter.md',
      'Home/home.md',
      'Projects/book.md',
      'Inbox/rest.md',
      'Wisdom/future.md',
      'Ideas/idea.md',
    ]);
    expect((await load(vault, 'Projects/book.md')).status).toBe('archived');
    expect(await load(vault, 'Inbox/rest.md')).toMatchObject({
      status: 'active',
      rooms: expect.arrayContaining(['life-landscape']),
    });
    expect(await load(vault, 'Ideas/idea.md')).toMatchObject({
      status: 'resting',
    });
    const reflection = await notesIn(
      vault,
      'Reflection Garden/Season Outcomes',
    );
    expect(reflection).toEqual([
      expect.objectContaining({
        semanticType: 'celebration',
        seasons: ['season-winter'],
      }),
    ]);
    const invitations = await notesIn(vault, 'Current Season/Invitations');
    expect(invitations).toEqual([
      expect.objectContaining({
        cardType: 'season-invitation',
        status: 'resting',
      }),
    ]);
    expect(
      (await notesIn(vault, 'Reflection Garden')).filter(
        (item) => item.cardType === 'season-letter',
      ),
    ).toHaveLength(1);
  });

  it('closes a season with no priorities after preserving its letter and snapshot', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const emptySeason = await seed(
      vault,
      'Current Season/empty.md',
      {
        ...seasonNote([]),
        id: 'season-empty',
        extraFrontmatter: { season_id: 'season-empty', priorities: [] },
      },
    );
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });

    const result = await service.close({
      ...closeRequest,
      transactionId: 'close-empty',
      season: emptySeason,
      closedSeasonNote: { ...emptySeason.note, status: 'archived' },
      priorityIds: [],
      dispositions: [],
      letter: {
        ...closeRequest.letter,
        id: 'letter-empty',
        seasons: ['season-empty'],
      },
    });

    expect(result.season.note.status).toBe('archived');
    expect(result.snapshot.manifest.files).toHaveLength(1);
    expect(
      (await notesIn(vault, 'Reflection Garden')).filter(
        (item) => item.cardType === 'season-letter',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ['omits canonical priorities', []],
    ['adds a noncanonical priority', ['home', 'book', 'rest', 'future', 'idea', 'outside']],
  ])('rejects a request that %s', async (_, priorityIds) => {
    const { vault, revisions, closeRequest } = await setup();
    const dispositions = closeRequest.dispositions.filter((item) =>
      priorityIds.includes(item.noteId),
    );
    if (priorityIds.includes('outside')) {
      dispositions.push({
        noteId: 'outside',
        disposition: 'archive',
        expectedHash: '0'.repeat(64),
      });
    }
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });

    await expect(
      service.close({ ...closeRequest, priorityIds, dispositions }),
    ).rejects.toThrow('canonical season priorities');
    await expect(
      vault.exists('.studio/season/close-journal.json'),
    ).resolves.toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['malformed', ['home', 1]],
    ['duplicated', ['home', 'home']],
  ])('rejects %s durable season priority metadata', async (_, priorities) => {
    const { vault, revisions, closeRequest } = await setup();
    const durable = await vault.readText(closeRequest.season.path);
    const parsed = parseNote(durable.text);
    if (!parsed.ok) throw new Error('fixture');
    const extraFrontmatter = { ...parsed.note.extraFrontmatter };
    if (priorities === undefined) delete extraFrontmatter.priorities;
    else extraFrontmatter.priorities = priorities;
    const changed = { ...parsed.note, extraFrontmatter };
    const written = await vault.writeTextAtomic(
      closeRequest.season.path,
      serializeNote(changed),
      { expectedHash: durable.hash },
    );
    closeRequest.season = {
      note: changed,
      path: closeRequest.season.path,
      hash: written.hash,
    };
    closeRequest.closedSeasonNote = { ...changed, status: 'archived' };
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });

    await expect(service.close(closeRequest)).rejects.toThrow(
      'canonical season priorities',
    );
  });

  it.each([
    ['missing', async (vault: VaultPort) => vault.remove('Ideas/idea.md')],
    [
      'duplicate',
      async (vault: VaultPort) =>
        seed(vault, 'Elsewhere/duplicate.md', note({ id: 'idea' })),
    ],
    [
      'corrupt',
      async (vault: VaultPort) =>
        vault.writeTextAtomic('Broken/corrupt.md', '---\nid: [\n---\n', {
          expectedMissing: true,
        }),
    ],
    [
      'corrupt extensionless',
      async (vault: VaultPort) =>
        vault.writeTextAtomic('Broken/corrupt', '---\nid: [\n---\n', {
          expectedMissing: true,
        }),
    ],
  ])(
    'rejects an explicit %s canonical preflight without any snapshot or journal',
    async (_, arrange) => {
      const { vault, revisions, closeRequest } = await setup();
      await arrange(vault);
      const create = vi.spyOn(revisions, 'create');
      const service = createSeasonCloseTransactionService({
        vault,
        control: createStudioControlVault(vault),
        revisions,
        clock: () => new Date(now),
      });
      await expect(service.close(closeRequest)).rejects.toBeInstanceOf(
        SeasonClosePreflightError,
      );
      expect(create).not.toHaveBeenCalled();
      await expect(
        vault.exists('.studio/season/close-journal.json'),
      ).resolves.toBe(false);
    },
  );

  it('requires trimmed reflection fields and exactly one disposition for every priority', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    await expect(
      service.close({
        ...closeRequest,
        reflection: { ...closeRequest.reflection, learning: '   ' },
      }),
    ).rejects.toThrow('learning');
    await expect(
      service.close({
        ...closeRequest,
        dispositions: closeRequest.dispositions.slice(1),
      }),
    ).rejects.toThrow('every priority');
    await expect(
      service.close({
        ...closeRequest,
        priorityIds: [...closeRequest.priorityIds, 'home'],
        dispositions: [
          ...closeRequest.dispositions,
          closeRequest.dispositions[0]!,
        ],
      }),
    ).rejects.toThrow('every priority');
    await expect(
      service.close({
        ...closeRequest,
        dispositions: closeRequest.dispositions.map((item, index) =>
          index === 1 ? { ...item, noteId: 'home' } : item,
        ),
      }),
    ).rejects.toThrow('every priority');
    await expect(
      service.close({
        ...closeRequest,
        dispositions: closeRequest.dispositions.map((item, index) =>
          index === 1 ? { ...item, noteId: 'outside' } : item,
        ),
      }),
    ).rejects.toThrow('every priority');
    await expect(
      service.close({
        ...closeRequest,
        season: {
          ...closeRequest.season,
          note: { ...closeRequest.season.note, status: 'archived' },
        },
      }),
    ).rejects.toThrow('active season');
    await expect(
      service.close({
        ...closeRequest,
        closedSeasonNote: { ...closeRequest.closedSeasonNote, id: 'other' },
      }),
    ).rejects.toThrow('does not match');
    await expect(
      service.close({
        ...closeRequest,
        closedSeasonNote: {
          ...closeRequest.closedSeasonNote,
          status: 'active',
        },
      }),
    ).rejects.toThrow('does not match');
    await expect(
      vault.exists('.studio/season/close-journal.json'),
    ).resolves.toBe(false);
  });

  it('rejects a forged cold-start journal without touching user notes', async () => {
    const { vault, revisions } = await setup();
    await createStudioControlVault(vault).writeTextAtomic(
      '.studio/season/close-journal.json',
      JSON.stringify({
        version: 1,
        transactionId: 'forged',
        stage: 'applying-targets',
        targets: [
          {
            noteId: 'idea',
            path: '../Ideas/idea.md',
            disposition: 'archive',
            state: 'pending',
          },
        ],
      }),
      { expectedMissing: true },
    );
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    await expect(service.resume()).rejects.toThrow('checkpoint is unreadable');
    expect((await load(vault, 'Ideas/idea.md')).status).toBe('active');
  });

  it('rejects malformed durable journal fields before following any stored path', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    await service.close(closeRequest);
    const valid = JSON.parse(
      (await createStudioControlVault(vault).readText(
        '.studio/season/close-journal.json',
      )).text,
    ) as object;
    const invalidRoots: unknown[] = ['{', null, [], 'journal'];
    for (const invalid of invalidRoots) await expectUnreadableJournal(invalid);

    const mutations: Array<
      readonly [
        string,
        ReadonlyArray<string | number>,
        unknown,
      ]
    > = [
      ['version', ['version'], 2],
      ['transaction id type', ['transactionId'], 1],
      ['transaction id empty', ['transactionId'], ''],
      ['stage', ['stage'], 'unknown'],
      ['timestamp type', ['preparedAt'], 1],
      ['timestamp invalid', ['preparedAt'], 'not-a-date'],
      ['timestamp noncanonical', ['preparedAt'], '2026-07-14T00:00:00Z'],
      ['season record', ['season'], null],
      ['season note primitive', ['season', 'note'], null],
      ['season note malformed', ['season', 'note'], {}],
      ['season path type', ['season', 'path'], 1],
      ['season path empty', ['season', 'path'], ''],
      ['season path absolute', ['season', 'path'], '/season.md'],
      ['season path trailing slash', ['season', 'path'], 'Season/'],
      ['season path backslash', ['season', 'path'], 'Season\\winter.md'],
      ['season path nul', ['season', 'path'], 'Season/\0winter.md'],
      ['season path drive', ['season', 'path'], 'C:season.md'],
      ['season path empty segment', ['season', 'path'], 'Season//winter.md'],
      ['season path dot segment', ['season', 'path'], 'Season/./winter.md'],
      ['season path parent segment', ['season', 'path'], 'Season/../winter.md'],
      ['season path control segment', ['season', 'path'], 'Season/.studio/x.md'],
      ['season path reserved segment', ['season', 'path'], 'Season/.Studio-lock/x.md'],
      ['season hash', ['season', 'hash'], 'bad'],
      ['closed note primitive', ['closedSeasonNote'], null],
      ['closed note malformed', ['closedSeasonNote'], {}],
      ['closed note id', ['closedSeasonNote', 'id'], 'other'],
      ['closed note status', ['closedSeasonNote', 'status'], 'active'],
      ['reflection record', ['reflection'], null],
      ['celebration reflection', ['reflection', 'celebration'], 1],
      ['learning reflection', ['reflection', 'learning'], 1],
      ['identity reflection', ['reflection', 'identity'], 1],
      ['priority ids array', ['priorityIds'], null],
      ['priority id type', ['priorityIds', 0], 1],
      ['priority id empty', ['priorityIds', 0], ''],
      ['priority id duplicate', ['priorityIds', 1], 'home'],
      ['snapshot baseline array', ['snapshotBaseline'], null],
      ['snapshot baseline type', ['snapshotBaseline'], [1]],
      ['snapshot baseline root', ['snapshotBaseline'], ['Elsewhere/manifest.json']],
      ['snapshot baseline filename', ['snapshotBaseline'], ['.studio/backups/x/other.json']],
      ['targets array', ['targets'], null],
      ['letter record', ['letter'], null],
      ['letter note primitive', ['letter', 'note'], null],
      ['letter note malformed', ['letter', 'note'], {}],
      ['letter path', ['letter', 'path'], '../letter.md'],
      ['target count', ['targets'], []],
      ['target record', ['targets', 0], null],
      ['target note id type', ['targets', 0, 'noteId'], 1],
      ['target note id empty', ['targets', 0, 'noteId'], ''],
      ['target path', ['targets', 0, 'path'], '../target.md'],
      ['target hash', ['targets', 0, 'hash'], 'bad'],
      ['target note primitive', ['targets', 0, 'note'], null],
      ['target note malformed', ['targets', 0, 'note'], {}],
      ['target note mismatch', ['targets', 0, 'note', 'id'], 'other'],
      ['target disposition', ['targets', 0, 'disposition'], 'defer'],
      ['target state', ['targets', 0, 'state'], 'unknown'],
      ['target output path', ['targets', 0, 'outputPath'], '../out.md'],
      ['target output hash', ['targets', 0, 'outputHash'], 'bad'],
      ['snapshot record', ['snapshot'], null],
      ['snapshot manifest record', ['snapshot', 'manifest'], null],
      ['snapshot path type', ['snapshot', 'manifestPath'], 1],
      ['snapshot path location', ['snapshot', 'manifestPath'], '.studio/elsewhere/x'],
      ['letter hash', ['letter', 'hash'], 'bad'],
      ['archived hash', ['archivedSeasonHash'], 'bad'],
    ];

    for (const [label, path, replacement] of mutations) {
      const mutated = structuredClone(valid);
      replaceAtPath(mutated, path, replacement);
      await expectUnreadableJournal(mutated).catch((error: unknown) => {
        throw new Error(`Expected malformed journal case "${label}" to fail`, {
          cause: error,
        });
      });
    }

    const duplicateTarget = structuredClone(valid);
    replaceAtPath(duplicateTarget, ['targets', 1, 'noteId'], 'home');
    replaceAtPath(duplicateTarget, ['targets', 1, 'note', 'id'], 'home');
    await expectUnreadableJournal(duplicateTarget);

    const unknownTarget = structuredClone(valid);
    replaceAtPath(unknownTarget, ['targets', 1, 'noteId'], 'outside');
    replaceAtPath(unknownTarget, ['targets', 1, 'note', 'id'], 'outside');
    await expectUnreadableJournal(unknownTarget);

    const pendingArchivedTarget = structuredClone(valid);
    replaceAtPath(pendingArchivedTarget, ['stage'], 'season-archived');
    replaceAtPath(pendingArchivedTarget, ['targets', 0, 'state'], 'pending');
    await expectUnreadableJournal(pendingArchivedTarget);

    const duplicateBaseline = structuredClone(valid);
    const baseline = Reflect.get(duplicateBaseline, 'snapshotBaseline') as string[];
    if (baseline.length === 0) baseline.push('.studio/backups/x/manifest.json');
    baseline.push(baseline[0]!);
    await expectUnreadableJournal(duplicateBaseline);
  });

  it.each([
    'snapshot',
    'letter',
    'target:1',
    'target:2',
    'target:3',
    'target:4',
    'target:5',
    'season',
    'completed',
  ] as const)(
    'resumes idempotently after a restart immediately after the %s durable boundary',
    async (boundary) => {
      const { vault, revisions, closeRequest } = await setup();
      let failed = false;
      const base = createStudioControlVault(vault);
      const control: StudioControlVault = {
        ...base,
        async writeTextAtomic(path, text, condition) {
          const parsed = JSON.parse(text) as {
            stage?: string;
            targets?: Array<{ state?: string }>;
          };
          const completedTargets =
            parsed.targets?.filter((item) => item.state === 'complete')
              .length ?? 0;
          const matches =
            (boundary === 'snapshot' && parsed.stage === 'snapshotted') ||
            (boundary === 'letter' && parsed.stage === 'letter-written') ||
            (boundary.startsWith('target:') &&
              completedTargets === Number(boundary.split(':')[1])) ||
            (boundary === 'season' && parsed.stage === 'season-archived') ||
            (boundary === 'completed' && parsed.stage === 'completed');
          if (!failed && matches) {
            failed = true;
            throw new Error(`injected after ${boundary}`);
          }
          return base.writeTextAtomic(path, text, condition);
        },
      };
      const interrupted = createSeasonCloseTransactionService({
        vault,
        control,
        revisions,
        clock: () => new Date(now),
      });
      await expect(interrupted.close(closeRequest)).rejects.toThrow('injected');

      const restarted = createSeasonCloseTransactionService({
        vault,
        control: base,
        revisions,
        clock: () => new Date(now),
      });
      await expect(restarted.resume()).resolves.toMatchObject({
        season: { note: { status: 'archived' } },
      });
      expect(
        (await notesIn(vault, 'Reflection Garden')).filter(
          (item) => item.cardType === 'season-letter',
        ),
      ).toHaveLength(1);
      expect(
        await notesIn(vault, 'Reflection Garden/Season Outcomes'),
      ).toHaveLength(1);
      expect(await notesIn(vault, 'Current Season/Invitations')).toHaveLength(
        1,
      );
    },
  );

  it('stops on a changed pinned target and leaves the season active for explicit repair', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const changed = await vault.readText('Projects/book.md');
    const parsed = parseNote(changed.text);
    if (!parsed.ok) throw new Error('fixture');
    await vault.writeTextAtomic(
      'Projects/book.md',
      serializeNote({ ...parsed.note, body: 'Changed elsewhere.' }),
      { expectedHash: changed.hash },
    );
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    await expect(service.close(closeRequest)).rejects.toBeInstanceOf(
      SeasonClosePreflightError,
    );
    expect((await load(vault, 'Current Season/winter.md')).status).toBe(
      'active',
    );
  });

  it.each(['content', 'path'] as const)(
    'stops when the pinned season %s changed before preflight',
    async (change) => {
      const { vault, revisions, closeRequest } = await setup();
      if (change === 'content') {
        await vault.writeTextAtomic(
          closeRequest.season.path,
          serializeNote({ ...closeRequest.season.note, body: 'Changed.' }),
          { expectedHash: closeRequest.season.hash },
        );
      } else {
        await vault.move(
          closeRequest.season.path,
          'Current Season/moved-winter.md',
          { expectedHash: closeRequest.season.hash },
        );
      }
      const service = createSeasonCloseTransactionService({
        vault,
        control: createStudioControlVault(vault),
        revisions,
        clock: () => new Date(now),
      });

      await expect(service.close(closeRequest)).rejects.toThrow(
        'active season changed',
      );
    },
  );

  it('names a changed untitled priority by id and uses calm fallback artifact titles', async () => {
    const { vault, revisions, closeRequest } = await setup();
    for (const [path, id] of [
      ['Home/home.md', 'home'],
      ['Wisdom/future.md', 'future'],
    ] as const) {
      const current = await vault.readText(path);
      const parsed = parseNote(current.text);
      if (!parsed.ok) throw new Error('fixture');
      const untitled = { ...parsed.note };
      delete untitled.title;
      const written = await vault.writeTextAtomic(
        path,
        serializeNote(untitled),
        { expectedHash: current.hash },
      );
      closeRequest.dispositions = closeRequest.dispositions.map((item) =>
        item.noteId === id ? { ...item, expectedHash: written.hash } : item,
      );
    }
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    const stale = structuredClone(closeRequest);
    stale.dispositions[0]!.expectedHash = '0'.repeat(64);
    await expect(service.close(stale)).rejects.toThrow('priority home changed');

    await service.close(closeRequest);
    expect(
      (await notesIn(vault, 'Reflection Garden/Season Outcomes'))[0]?.title,
    ).toBe('Celebrating this season thread');
    expect(
      (await notesIn(vault, 'Current Season/Invitations'))[0]?.title,
    ).toBe('Invitation: season thread');
  });

  it('accepts a pinned note write that won durably before its conflict was reported', async () => {
    const { vault, revisions, closeRequest } = await setup();
    let injected = false;
    const ambiguousVault = new Proxy(vault, {
      get(target, property, receiver) {
        if (property !== 'writeTextAtomic') {
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (
          path: string,
          text: string,
          condition?: Parameters<VaultPort['writeTextAtomic']>[2],
        ) => {
          const written = await vault.writeTextAtomic(path, text, condition);
          if (!injected && path.startsWith('Reflection Garden/')) {
            injected = true;
            throw new VaultConflictError('ambiguous publish');
          }
          return written;
        };
      },
    });
    const service = createSeasonCloseTransactionService({
      vault: ambiguousVault,
      control: createStudioControlVault(ambiguousVault),
      revisions,
      clock: () => new Date(now),
    });

    await expect(service.close(closeRequest)).resolves.toMatchObject({
      season: { note: { status: 'archived' } },
    });
  });

  it.each(['ordinary', 'missing-after-conflict', 'different-after-conflict'] as const)(
    'preserves the journal when a pinned write ends in an %s failure',
    async (failure) => {
      const { vault, revisions, closeRequest } = await setup();
      let injected = false;
      const failingVault = new Proxy(vault, {
        get(target, property, receiver) {
          if (property !== 'writeTextAtomic') {
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (
            path: string,
            text: string,
            condition?: Parameters<VaultPort['writeTextAtomic']>[2],
          ) => {
            if (!injected && path.startsWith('Reflection Garden/')) {
              injected = true;
              if (failure === 'ordinary') throw new Error('storage offline');
              if (failure === 'different-after-conflict') {
                await vault.writeTextAtomic(path, 'changed elsewhere', condition);
              }
              throw new VaultConflictError('pinned write conflict');
            }
            return vault.writeTextAtomic(path, text, condition);
          };
        },
      });
      const service = createSeasonCloseTransactionService({
        vault: failingVault,
        control: createStudioControlVault(failingVault),
        revisions,
        clock: () => new Date(now),
      });

      if (failure === 'ordinary') {
        await expect(service.close(closeRequest)).rejects.toThrow(
          'storage offline',
        );
      } else {
        await expect(service.close(closeRequest)).rejects.toThrow(
          'changed during season close',
        );
      }
      expect((await load(vault, closeRequest.season.path)).status).toBe(
        'active',
      );
    },
  );

  it('blocks a different transaction while a prepared journal remains in progress', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const interruptedRevisions: RevisionStore = {
      ...revisions,
      async create() {
        throw new Error('snapshot offline');
      },
    };
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions: interruptedRevisions,
      clock: () => new Date(now),
    });
    await expect(service.close(closeRequest)).rejects.toThrow(
      'snapshot offline',
    );

    await expect(
      service.close({ ...closeRequest, transactionId: 'close-another' }),
    ).rejects.toThrow('Another season close is already in progress');
  });

  it('reuses its completed journal and replaces it only for a new valid season', async () => {
    const { vault, closeRequest } = await setup();
    let snapshot = 0;
    const revisions = createRevisionStore(vault, {
      clock: () =>
        new Date(snapshot === 0 ? now : '2026-07-15T00:00:00.000Z'),
      generateId: () => `replacement-${(snapshot += 1)}`,
    });
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
    });
    const winter = await service.close(closeRequest);
    await expect(service.close(closeRequest)).resolves.toEqual(winter);

    const spring = await seed(
      vault,
      'Current Season/spring.md',
      {
        ...seasonNote([]),
        id: 'season-spring',
        title: 'A gentle spring',
        extraFrontmatter: { season_id: 'season-spring', priorities: [] },
      },
    );
    const springRequest = request(spring);
    springRequest.transactionId = 'close-spring';
    springRequest.priorityIds = [];
    springRequest.dispositions = [];
    springRequest.letter = {
      ...springRequest.letter,
      id: 'letter-spring',
      seasons: ['season-spring'],
    };

    await expect(service.close(springRequest)).resolves.toMatchObject({
      season: { note: { id: 'season-spring', status: 'archived' } },
    });
    const journal = JSON.parse(
      (await createStudioControlVault(vault).readText(
        '.studio/season/close-journal.json',
      )).text,
    ) as { transactionId: string; preparedAt: string };
    expect(journal.transactionId).toBe('close-spring');
    expect(new Date(journal.preparedAt).toISOString()).toBe(journal.preparedAt);
  });

  it('fails closed when snapshot creation violates its required contract', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const invalidRevisions: RevisionStore = {
      ...revisions,
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as RevisionStore;
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions: invalidRevisions,
      clock: () => new Date(now),
    });

    await expect(service.close(closeRequest)).rejects.toThrow(
      'revision snapshot could not be verified',
    );
  });

  it.each(['wrong-path-set', 'incomplete', 'missing-copy', 'changed-copy'] as const)(
    'verifies the durable revision snapshot before the first user-note mutation: %s',
    async (failure) => {
      const { vault, revisions, closeRequest } = await setup();
      const base = createStudioControlVault(vault);
      const adversarial: RevisionStore = {
        ...revisions,
        async create(reason, paths) {
          const snapshot = await revisions.create(
            reason,
            failure === 'wrong-path-set' ? paths.slice(0, 1) : paths,
          );
          if (failure === 'incomplete') {
            const manifest = await base.readText(snapshot.manifestPath);
            const value = JSON.parse(manifest.text) as { state: string };
            value.state = 'incomplete';
            await base.writeTextAtomic(
              snapshot.manifestPath,
              `${JSON.stringify(value, null, 2)}\n`,
              { expectedHash: manifest.hash },
            );
          } else if (failure === 'missing-copy') {
            await base.remove(snapshot.manifest.files[0]!.snapshotPath);
          } else if (failure === 'changed-copy') {
            const copy = await base.readBinary(
              snapshot.manifest.files[0]!.snapshotPath,
            );
            await base.writeBinaryAtomic(
              snapshot.manifest.files[0]!.snapshotPath,
              new Uint8Array([...copy, 1]),
            );
          }
          return snapshot;
        },
      };
      const writes: string[] = [];
      const recordingVault = new Proxy(vault, {
        get(target, property, receiver) {
          if (property !== 'writeTextAtomic') {
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
          }
          return async (
            path: string,
            text: string,
            condition?: Parameters<VaultPort['writeTextAtomic']>[2],
          ) => {
            const written = await vault.writeTextAtomic(path, text, condition);
            if (!path.startsWith('.studio/')) writes.push(path);
            return written;
          };
        },
      });
      const service = createSeasonCloseTransactionService({
        vault: recordingVault,
        control: createStudioControlVault(recordingVault),
        revisions: adversarial,
        clock: () => new Date(now),
      });

      await expect(service.close(closeRequest)).rejects.toThrow(
        'revision snapshot could not be verified',
      );
      expect(writes).toEqual([]);
      expect((await load(vault, closeRequest.season.path)).status).toBe(
        'active',
      );
    },
  );

  it.each([
    'snapshot-extra',
    'manifest-extra',
    'version',
    'id-type',
    'id-empty',
    'reason',
    'created-at',
    'state',
    'files-type',
    'manifest-path-type',
    'manifest-path-binding',
    'file-record',
    'file-extra',
    'original-path',
    'snapshot-path',
    'hash',
    'duplicate-original',
    'duplicate-snapshot',
    'returned-manifest-mismatch',
  ] as const)(
    'rejects a malformed typed RevisionStore result: %s',
    async (failure) => {
      const { vault, revisions, closeRequest } = await setup();
      const adversarial: RevisionStore = {
        ...revisions,
        async create(reason, paths) {
          const snapshot = structuredClone(await revisions.create(reason, paths));
          const manifest = snapshot.manifest as unknown as Record<string, unknown>;
          const files = snapshot.manifest.files as unknown as Array<Record<string, unknown>>;
          if (failure === 'snapshot-extra')
            Reflect.set(snapshot, 'unexpected', true);
          if (failure === 'manifest-extra') manifest.unexpected = true;
          if (failure === 'version') manifest.version = 2;
          if (failure === 'id-type') manifest.id = 1;
          if (failure === 'id-empty') manifest.id = '';
          if (failure === 'reason') manifest.reason = 'migration';
          if (failure === 'created-at') manifest.createdAt = 'today';
          if (failure === 'state') manifest.state = 'writing';
          if (failure === 'files-type') manifest.files = null;
          if (failure === 'manifest-path-type')
            Reflect.set(snapshot, 'manifestPath', 1);
          if (failure === 'manifest-path-binding')
            snapshot.manifestPath = `${snapshot.manifestPath}.other`;
          if (failure === 'file-record')
            (snapshot.manifest.files as unknown[])[0] = null;
          if (failure === 'file-extra') files[0]!.unexpected = true;
          if (failure === 'original-path') files[0]!.originalPath = '../x.md';
          if (failure === 'snapshot-path') files[0]!.snapshotPath = '.studio/backups/x';
          if (failure === 'hash') files[0]!.hash = 'bad';
          if (failure === 'duplicate-original')
            files[1]!.originalPath = files[0]!.originalPath;
          if (failure === 'duplicate-snapshot')
            files[1]!.snapshotPath = files[0]!.snapshotPath;
          if (failure === 'returned-manifest-mismatch')
            snapshot.manifest.files.reverse();
          return snapshot;
        },
      };
      const service = createSeasonCloseTransactionService({
        vault,
        control: createStudioControlVault(vault),
        revisions: adversarial,
        clock: () => new Date(now),
      });

      await expect(service.close(closeRequest)).rejects.toThrow(
        'revision snapshot could not be verified',
      );
    },
  );

  it.each(['manifest-read', 'manifest-json', 'snapshot-list', 'copy-read'] as const)(
    'fails closed when snapshot verification cannot complete: %s',
    async (failure) => {
      const { vault, revisions, closeRequest } = await setup();
      const base = createStudioControlVault(vault);
      let snapshotPath = '';
      const adversarial: RevisionStore = {
        ...revisions,
        async create(reason, paths) {
          const snapshot = await revisions.create(reason, paths);
          snapshotPath = snapshot.manifestPath;
          if (failure === 'manifest-json') {
            const file = await base.readText(snapshot.manifestPath);
            await base.writeTextAtomic(snapshot.manifestPath, '{', {
              expectedHash: file.hash,
            });
          }
          return snapshot;
        },
      };
      const control: StudioControlVault = {
        ...base,
        async readText(path) {
          if (failure === 'manifest-read' && path === snapshotPath)
            throw new Error('offline');
          return base.readText(path);
        },
        async list(path) {
          if (
            failure === 'snapshot-list' &&
            snapshotPath !== '' &&
            path === snapshotPath.slice(0, -'/manifest.json'.length)
          )
            throw new Error('offline');
          return base.list(path);
        },
        async readBinary(path) {
          if (failure === 'copy-read' && path.includes('/files/'))
            throw new Error('offline');
          return base.readBinary(path);
        },
      };
      const service = createSeasonCloseTransactionService({
        vault,
        control,
        revisions: adversarial,
        clock: () => new Date(now),
      });

      await expect(service.close(closeRequest)).rejects.toThrow(
        'revision snapshot could not be verified',
      );
    },
  );

  it('rejects ambiguous matching recovery snapshots and ignores malformed candidates', async () => {
    const { vault, closeRequest } = await setup();
    const control = createStudioControlVault(vault);
    const service = createSeasonCloseTransactionService({
      vault,
      control,
      revisions: createRevisionStore(vault),
      clock: () => new Date(now),
    });
    await service.prepare(closeRequest);
    await control.writeTextAtomic(
      '.studio/backups/malformed/manifest.json',
      '{',
      { expectedMissing: true },
    );
    const targetPaths: Record<string, string> = {
      home: 'Home/home.md',
      book: 'Projects/book.md',
      rest: 'Inbox/rest.md',
      future: 'Wisdom/future.md',
      idea: 'Ideas/idea.md',
    };
    for (const [date, id] of [
      [now, 'candidate-a'],
      ['2026-07-15T00:00:00.000Z', 'candidate-b'],
    ] as const) {
      await createRevisionStore(vault, {
        clock: () => new Date(date),
        generateId: () => id,
      }).create('season-close', [
        closeRequest.season.path,
        ...closeRequest.dispositions.map((item) => targetPaths[item.noteId]!),
      ]);
    }

    await expect(service.resume()).rejects.toThrow(
      'More than one matching season-close snapshot',
    );
  });

  it('revalidates a journaled snapshot on every completed resume', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });
    const result = await service.close(closeRequest);
    await createStudioControlVault(vault).remove(
      result.snapshot.manifest.files[0]!.snapshotPath,
    );

    await expect(service.resume()).rejects.toThrow(
      'revision snapshot could not be verified',
    );
  });

  it('reuses one verified snapshot when its success checkpoint initially fails', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const create = vi.spyOn(revisions, 'create');
    const base = createStudioControlVault(vault);
    let failed = false;
    const control: StudioControlVault = {
      ...base,
      async writeTextAtomic(path, text, condition) {
        const value = JSON.parse(text) as { stage?: string };
        if (!failed && value.stage === 'snapshotted') {
          failed = true;
          throw new Error('checkpoint unavailable');
        }
        return base.writeTextAtomic(path, text, condition);
      },
    };
    const interrupted = createSeasonCloseTransactionService({
      vault,
      control,
      revisions,
      clock: () => new Date(now),
    });
    await expect(interrupted.close(closeRequest)).rejects.toThrow(
      'checkpoint unavailable',
    );

    const restarted = createSeasonCloseTransactionService({
      vault,
      control: base,
      revisions,
      clock: () => new Date(now),
    });
    await expect(restarted.resume()).resolves.toMatchObject({
      season: { note: { status: 'archived' } },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const manifests = (await base.list('.studio/backups')).filter(
      (entry) => entry.kind === 'file' && entry.path.endsWith('/manifest.json'),
    );
    expect(manifests).toHaveLength(1);
  });

  it.each(['target-output', 'season-bytes', 'season-status'] as const)(
    'fails closed when completed durable %s no longer matches its journal',
    async (failure) => {
      const { vault, revisions, closeRequest } = await setup();
      const service = createSeasonCloseTransactionService({
        vault,
        control: createStudioControlVault(vault),
        revisions,
        clock: () => new Date(now),
      });
      await service.close(closeRequest);
      const control = createStudioControlVault(vault);
      const journal = JSON.parse(
        (await control.readText('.studio/season/close-journal.json')).text,
      ) as {
        season: { path: string };
        targets: Array<{ outputPath: string }>;
      };
      const path =
        failure === 'target-output'
          ? journal.targets[0]!.outputPath
          : journal.season.path;
      const current = await vault.readText(path);
      const parsed = parseNote(current.text);
      if (!parsed.ok) throw new Error('fixture');
      const changed =
        failure === 'season-status'
          ? { ...parsed.note, status: 'active' as const }
          : { ...parsed.note, body: `${parsed.note.body}\nchanged elsewhere` };
      await vault.writeTextAtomic(path, serializeNote(changed), {
        expectedHash: current.hash,
      });

      await expect(service.resume()).rejects.toThrow('no longer matches');
    },
  );

  it('reports an archived season corrupted before the final result read', async () => {
    const { vault, revisions, closeRequest } = await setup();
    const base = createStudioControlVault(vault);
    const control: StudioControlVault = {
      ...base,
      async writeTextAtomic(path, text, condition) {
        const written = await base.writeTextAtomic(path, text, condition);
        const journal = JSON.parse(text) as { stage?: string };
        if (journal.stage === 'completed') {
          const season = await vault.readText(closeRequest.season.path);
          await vault.writeTextAtomic(closeRequest.season.path, 'corrupt', {
            expectedHash: season.hash,
          });
        }
        return written;
      },
    };
    const service = createSeasonCloseTransactionService({
      vault,
      control,
      revisions,
      clock: () => new Date(now),
    });

    await expect(service.close(closeRequest)).rejects.toThrow(
      'archived season no longer matches',
    );
  });

  it('serializes the complete close transaction with ordinary Studio mutations', async () => {
    const { vault, revisions, closeRequest } = await setup();
    let releaseJournal!: () => void;
    let sawJournal!: () => void;
    const journalEntered = new Promise<void>((resolve) => {
      sawJournal = resolve;
    });
    const journalReleased = new Promise<void>((resolve) => {
      releaseJournal = resolve;
    });
    let paused = false;
    const coordinatedVault = new Proxy(vault, {
      get(target, property, receiver) {
        if (property !== 'writeTextAtomic') {
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (
          path: string,
          text: string,
          condition?: Parameters<VaultPort['writeTextAtomic']>[2],
        ) => {
          if (!paused && path === '.studio/season/close-journal.json') {
            paused = true;
            sawJournal();
            await journalReleased;
          }
          return vault.writeTextAtomic(path, text, condition);
        };
      },
    });
    const studio = createStudioService({
      vault: coordinatedVault,
      index: new RecordingIndex(),
      revisions,
      clock: () => new Date(now),
    });
    const closing = studio.closeSeasonTransaction(closeRequest);
    await journalEntered;
    const sibling = note({ id: 'after-close', title: 'After close' });
    const saving = studio.save({
      note: sibling,
      path: 'Inbox/after-close.md',
      expectedMissing: true,
    });
    await expect(vault.exists('Inbox/after-close.md')).resolves.toBe(false);
    releaseJournal();
    await expect(closing).resolves.toMatchObject({
      season: { note: { status: 'archived' } },
    });
    await expect(saving).resolves.toMatchObject({
      note: { id: 'after-close' },
    });
  });
});

async function load(vault: VaultPort, path: string): Promise<StudioNote> {
  const parsed = parseNote((await vault.readText(path)).text);
  if (!parsed.ok) throw new Error(`invalid fixture at ${path}`);
  return parsed.note;
}

async function notesIn(
  vault: VaultPort,
  prefix: string,
): Promise<StudioNote[]> {
  const entries = await vault.list(prefix);
  const values: StudioNote[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.path.endsWith('.md')) continue;
    values.push(await load(vault, entry.path));
  }
  return values;
}
