import { parseNote, serializeNote, suggestFilename } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import {
  VaultConflictError,
  type RevisionSnapshot,
  type RevisionStore,
  type StudioControlVault,
  type VaultPort,
} from '@studio/storage';

import type { SavedNote } from './studio-service';

const JOURNAL_PATH = '.studio/season/close-journal.json';

export type SeasonDisposition =
  | 'celebrate'
  | 'archive'
  | 'return-landscape'
  | 'invite-forward'
  | 'release';

export interface SeasonCloseRequest {
  transactionId: string;
  season: SavedNote;
  closedSeasonNote: StudioNote;
  priorityIds: string[];
  reflection: {
    celebration: string;
    learning: string;
    identity: string;
  };
  dispositions: Array<{
    noteId: string;
    disposition: SeasonDisposition;
    expectedHash: string;
  }>;
  letter: StudioNote;
}

export interface SeasonCloseResult {
  season: SavedNote;
  snapshot: RevisionSnapshot;
}

export interface SeasonCloseTransactionService {
  close(request: SeasonCloseRequest): Promise<SeasonCloseResult>;
}

export interface SeasonCloseTransactionDependencies {
  vault: VaultPort;
  control: StudioControlVault;
  revisions: RevisionStore;
  clock?: () => Date;
}

export class SeasonClosePreflightError extends Error {
  override readonly name = 'SeasonClosePreflightError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class SeasonCloseTransactionConflictError extends Error {
  override readonly name = 'SeasonCloseTransactionConflictError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

interface CloseTarget {
  noteId: string;
  path: string;
  hash: string;
  note: StudioNote;
  disposition: SeasonDisposition;
  state: 'pending' | 'complete';
  outputPath?: string;
  outputHash?: string;
}

interface CloseJournal {
  version: 1;
  transactionId: string;
  stage:
    | 'prepared'
    | 'snapshotted'
    | 'letter-written'
    | 'applying-targets'
    | 'season-archived'
    | 'completed';
  preparedAt: string;
  season: SavedNote;
  closedSeasonNote: StudioNote;
  reflection: SeasonCloseRequest['reflection'];
  priorityIds: string[];
  targets: CloseTarget[];
  letter: { note: StudioNote; path: string; hash?: string };
  snapshot?: RevisionSnapshot;
  archivedSeasonHash?: string;
}

interface LoadedJournal {
  journal: CloseJournal;
  hash: string;
}

function normalizedReflection(
  reflection: SeasonCloseRequest['reflection'],
): SeasonCloseRequest['reflection'] {
  const normalized = {
    celebration: reflection.celebration.trim(),
    learning: reflection.learning.trim(),
    identity: reflection.identity.trim(),
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (value === '')
      throw new SeasonClosePreflightError(
        `The ${field} reflection is required before closing this season.`,
      );
  }
  return normalized;
}

function isPotentialNotePath(path: string): boolean {
  const name = path.split('/').at(-1) ?? '';
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

function assertRequestShape(request: SeasonCloseRequest): void {
  const priorities = new Set(request.priorityIds);
  const dispositionIds = request.dispositions.map((item) => item.noteId);
  if (
    priorities.size !== request.priorityIds.length ||
    dispositionIds.length !== request.priorityIds.length ||
    new Set(dispositionIds).size !== dispositionIds.length ||
    dispositionIds.some((id) => !priorities.has(id))
  ) {
    throw new SeasonClosePreflightError(
      'Choose exactly one disposition for every priority before closing the season.',
    );
  }
  if (request.season.note.status !== 'active')
    throw new SeasonClosePreflightError(
      'Only the active season can be closed.',
    );
  if (
    request.closedSeasonNote.id !== request.season.note.id ||
    request.closedSeasonNote.status !== 'archived'
  ) {
    throw new SeasonClosePreflightError(
      'The archived season result does not match the active season.',
    );
  }
  normalizedReflection(request.reflection);
}

async function canonicalNotes(vault: VaultPort): Promise<{
  byId: Map<string, SavedNote[]>;
  corrupt: string[];
}> {
  const byId = new Map<string, SavedNote[]>();
  const corrupt: string[] = [];
  const entries = (await vault.list()).filter(
    (entry) =>
      entry.kind === 'file' &&
      !entry.path.toLocaleLowerCase('en').startsWith('.studio/') &&
      isPotentialNotePath(entry.path),
  );
  for (const entry of entries) {
    const file = await vault.readText(entry.path);
    const parsed = parseNote(file.text);
    if (!parsed.ok) {
      corrupt.push(entry.path);
      continue;
    }
    const matches = byId.get(parsed.note.id) ?? [];
    matches.push({ note: parsed.note, path: entry.path, hash: file.hash });
    byId.set(parsed.note.id, matches);
  }
  return { byId, corrupt };
}

function exactCanonical(
  canonical: Awaited<ReturnType<typeof canonicalNotes>>,
  id: string,
): SavedNote {
  const matches = canonical.byId.get(id) ?? [];
  if (matches.length === 0)
    throw new SeasonClosePreflightError(
      `The priority ${id} is missing. Repair it before closing the season.`,
    );
  if (matches.length > 1)
    throw new SeasonClosePreflightError(
      `Multiple canonical notes use priority id ${id}. Repair the duplicate before closing.`,
    );
  return matches[0]!;
}

function journalText(journal: CloseJournal): string {
  return `${JSON.stringify(journal, null, 2)}\n`;
}

function parseJournal(text: string): CloseJournal {
  try {
    const value = JSON.parse(text) as Partial<CloseJournal>;
    if (
      value.version !== 1 ||
      typeof value.transactionId !== 'string' ||
      typeof value.stage !== 'string' ||
      value.season === undefined ||
      value.closedSeasonNote === undefined ||
      !Array.isArray(value.targets) ||
      value.letter === undefined
    ) {
      throw new Error('invalid shape');
    }
    return value as CloseJournal;
  } catch (error) {
    throw new SeasonCloseTransactionConflictError(
      'The season-close checkpoint is unreadable. Preserve it for explicit repair.',
      { cause: error },
    );
  }
}

async function loadJournal(
  control: StudioControlVault,
): Promise<LoadedJournal | null> {
  if (!(await control.exists(JOURNAL_PATH))) return null;
  const file = await control.readText(JOURNAL_PATH);
  return { journal: parseJournal(file.text), hash: file.hash };
}

function outcomeMetadata(
  note: StudioNote,
  journal: CloseJournal,
  disposition: SeasonDisposition,
): Record<string, unknown> {
  return {
    ...note.extraFrontmatter,
    season_outcome: {
      season_id: journal.season.note.id,
      transaction_id: journal.transactionId,
      disposition,
      closed_at: journal.preparedAt,
    },
  };
}

function outcomeNote(journal: CloseJournal, target: CloseTarget): StudioNote {
  const common = {
    ...target.note,
    updated: journal.preparedAt,
    extraFrontmatter: outcomeMetadata(
      target.note,
      journal,
      target.disposition,
    ),
  };
  if (target.disposition === 'archive')
    return { ...common, status: 'archived' };
  if (target.disposition === 'release') {
    return {
      ...common,
      status: 'resting',
      rooms: common.rooms.filter(
        (room) => room !== 'current-season' && room !== 'foyer',
      ),
      seasons: common.seasons.filter(
        (season) => season !== journal.season.note.id,
      ),
    };
  }
  return {
    ...common,
    status: 'active',
    rooms: [...new Set([...common.rooms, 'life-landscape'])],
  };
}

function artifactNote(
  journal: CloseJournal,
  target: CloseTarget,
): StudioNote {
  const celebration = target.disposition === 'celebrate';
  const id = `${journal.transactionId}-${target.noteId}-${celebration ? 'celebration' : 'invitation'}`;
  return {
    schemaVersion: 1,
    id,
    title: celebration
      ? `Celebrating ${target.note.title ?? 'this season thread'}`
      : `Invitation: ${target.note.title ?? 'season thread'}`,
    body: celebration
      ? `[[${target.noteId}]]\n\n${journal.reflection.celebration}\n`
      : `[[${target.noteId}]]\n\nThis thread is invited to be considered for a future season. It has not been carried forward automatically.\n`,
    cardType: celebration ? 'season-celebration' : 'season-invitation',
    semanticType: celebration ? 'celebration' : 'growth',
    status: celebration ? 'active' : 'resting',
    rooms: celebration ? ['reflection-garden'] : ['current-season'],
    lifeAreas: [],
    seasons: [journal.season.note.id],
    tags: [celebration ? 'season-celebration' : 'season-invitation'],
    created: journal.preparedAt,
    updated: journal.preparedAt,
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: {
      season_id: journal.season.note.id,
      target_note_id: target.noteId,
      transaction_id: journal.transactionId,
      disposition: target.disposition,
    },
    lineEnding: '\n',
  };
}

async function writeNoteIdempotently(
  vault: VaultPort,
  path: string,
  note: StudioNote,
  condition: { expectedHash?: string; expectedMissing?: true },
): Promise<string> {
  const text = serializeNote(note);
  try {
    return (await vault.writeTextAtomic(path, text, condition)).hash;
  } catch (error) {
    if (!(error instanceof VaultConflictError)) throw error;
    const current = await vault.readText(path).catch(() => null);
    if (current?.text === text) return current.hash;
    throw new SeasonCloseTransactionConflictError(
      `The pinned note at ${path} changed during season close. The journal remains available for repair.`,
      { cause: error },
    );
  }
}

export function createSeasonCloseTransactionService({
  vault,
  control,
  revisions,
  clock = () => new Date(),
}: SeasonCloseTransactionDependencies): SeasonCloseTransactionService {
  async function checkpoint(
    loaded: LoadedJournal,
    journal: CloseJournal,
  ): Promise<LoadedJournal> {
    const written = await control.writeTextAtomic(
      JOURNAL_PATH,
      journalText(journal),
      { expectedHash: loaded.hash },
    );
    return { journal, hash: written.hash };
  }

  async function prepare(
    request: SeasonCloseRequest,
    existing: LoadedJournal | null,
  ): Promise<LoadedJournal> {
    assertRequestShape(request);
    const canonical = await canonicalNotes(vault);
    if (canonical.corrupt.length > 0) {
      throw new SeasonClosePreflightError(
        `Unreadable canonical note metadata at: ${canonical.corrupt.join(', ')}. Repair it before closing.`,
      );
    }
    const durableSeason = exactCanonical(canonical, request.season.note.id);
    if (
      durableSeason.path !== request.season.path ||
      durableSeason.hash !== request.season.hash
    ) {
      throw new SeasonClosePreflightError(
        'The active season changed before close began. Refresh and review it again.',
      );
    }
    const targets = request.dispositions.map((item): CloseTarget => {
      const target = exactCanonical(canonical, item.noteId);
      if (target.hash !== item.expectedHash) {
        throw new SeasonClosePreflightError(
          `The priority ${target.note.title ?? item.noteId} changed before close began. Refresh and review it again.`,
        );
      }
      return {
        noteId: item.noteId,
        path: target.path,
        hash: target.hash,
        note: target.note,
        disposition: item.disposition,
        state: 'pending',
      };
    });
    const preparedAt = clock().toISOString();
    const journal: CloseJournal = {
      version: 1,
      transactionId: request.transactionId,
      stage: 'prepared',
      preparedAt,
      season: request.season,
      closedSeasonNote: {
        ...request.closedSeasonNote,
        updated: preparedAt,
      },
      reflection: normalizedReflection(request.reflection),
      priorityIds: [...request.priorityIds],
      targets,
      letter: {
        note: {
          ...request.letter,
          body: request.letter.body.trim() + '\n',
          created: preparedAt,
          updated: preparedAt,
        },
        path: `Reflection Garden/${suggestFilename({ ...request.letter, created: preparedAt })}`,
      },
    };
    const condition =
      existing === null
        ? { expectedMissing: true as const }
        : { expectedHash: existing.hash };
    const written = await control.writeTextAtomic(
      JOURNAL_PATH,
      journalText(journal),
      condition,
    );
    return { journal, hash: written.hash };
  }

  return {
    async close(request) {
      assertRequestShape(request);
      let loaded = await loadJournal(control);
      if (
        loaded !== null &&
        loaded.journal.transactionId !== request.transactionId &&
        loaded.journal.stage !== 'completed'
      ) {
        throw new SeasonCloseTransactionConflictError(
          'Another season close is already in progress. Resume or repair it before starting another.',
        );
      }
      if (
        loaded === null ||
        loaded.journal.transactionId !== request.transactionId
      ) {
        loaded = await prepare(request, loaded);
      }
      let journal = loaded.journal;

      if (journal.stage === 'prepared') {
        const snapshot = await revisions.create('season-close', [
          journal.season.path,
          ...journal.targets.map((target) => target.path),
        ]);
        journal = { ...journal, stage: 'snapshotted', snapshot };
        loaded = await checkpoint(loaded, journal);
      }

      if (journal.stage === 'snapshotted') {
        const hash = await writeNoteIdempotently(
          vault,
          journal.letter.path,
          journal.letter.note,
          { expectedMissing: true },
        );
        journal = {
          ...journal,
          stage: 'letter-written',
          letter: { ...journal.letter, hash },
        };
        loaded = await checkpoint(loaded, journal);
      }

      if (
        journal.stage === 'letter-written' ||
        journal.stage === 'applying-targets'
      ) {
        for (let index = 0; index < journal.targets.length; index += 1) {
          const target = journal.targets[index]!;
          if (target.state === 'complete') continue;
          let path = target.path;
          let hash: string;
          if (
            target.disposition === 'celebrate' ||
            target.disposition === 'invite-forward'
          ) {
            const artifact = artifactNote(journal, target);
            path = `${target.disposition === 'celebrate' ? 'Reflection Garden/Season Outcomes' : 'Current Season/Invitations'}/${suggestFilename(artifact)}`;
            hash = await writeNoteIdempotently(vault, path, artifact, {
              expectedMissing: true,
            });
          } else {
            hash = await writeNoteIdempotently(
              vault,
              path,
              outcomeNote(journal, target),
              { expectedHash: target.hash },
            );
          }
          const targets = journal.targets.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? { ...candidate, state: 'complete' as const, outputPath: path, outputHash: hash }
              : candidate,
          );
          journal = { ...journal, stage: 'applying-targets', targets };
          loaded = await checkpoint(loaded, journal);
        }
      }

      if (journal.stage === 'applying-targets') {
        const archivedSeasonHash = await writeNoteIdempotently(
          vault,
          journal.season.path,
          journal.closedSeasonNote,
          { expectedHash: journal.season.hash },
        );
        journal = {
          ...journal,
          stage: 'season-archived',
          archivedSeasonHash,
        };
        loaded = await checkpoint(loaded, journal);
      }

      if (journal.stage === 'season-archived') {
        journal = { ...journal, stage: 'completed' };
        loaded = await checkpoint(loaded, journal);
      }

      if (journal.stage !== 'completed' || journal.snapshot === undefined)
        throw new SeasonCloseTransactionConflictError(
          'The season close checkpoint stopped in an unknown state.',
        );
      const season = await vault.readText(journal.season.path);
      const parsed = parseNote(season.text);
      if (!parsed.ok)
        throw new SeasonCloseTransactionConflictError(
          'The archived season needs metadata repair.',
        );
      return {
        season: {
          note: parsed.note,
          path: journal.season.path,
          hash: season.hash,
        },
        snapshot: journal.snapshot,
      };
    },
  };
}
