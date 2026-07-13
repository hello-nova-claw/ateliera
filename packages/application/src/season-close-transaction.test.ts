import { parseNote, serializeNote } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import {
  createInMemoryVault,
  createRevisionStore,
  createStudioControlVault,
  type StudioControlVault,
  type VaultPort,
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

describe('season close transaction', () => {
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
    const service = createSeasonCloseTransactionService({
      vault,
      control: createStudioControlVault(vault),
      revisions,
      clock: () => new Date(now),
    });

    const result = await service.close({
      ...closeRequest,
      priorityIds: [],
      dispositions: [],
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
