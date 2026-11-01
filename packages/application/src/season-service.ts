import { createNoteId, suggestFilename } from '@studio/content';
import {
  activateSeasonState,
  closeSeasonState,
  createSeasonDraft,
  localTimestamp,
  reviseSeasonState,
  seasonProgress,
  seasonWizardSteps,
  updateSeasonDraft,
  type SeasonState,
  type SeasonStepAnswers,
  type SeasonUpdateInput,
  type SeasonWizardStep,
} from '@studio/domain';
import type { StudioNote } from '@studio/domain';
import { VaultConflictError } from '@studio/storage/portable';

import {
  StudioSaveConflictError,
  type SavedNote,
  type StudioService,
} from './studio-service';
import {
  SeasonClosePreflightError,
  type SeasonCloseRequest,
} from './season-close-transaction';

export interface SeasonRecord extends SavedNote {
  state: SeasonState;
}

export interface BeginSeasonInput {
  title: string;
  startsOn?: string;
  endsOn?: string;
}

export type SeasonDisposition =
  'celebrate' | 'archive' | 'return-landscape' | 'invite-forward' | 'release';

export interface SeasonCloseReflection {
  celebration: string;
  learning: string;
  identity: string;
  dispositions: Array<{
    noteId: string;
    title: string;
    expectedHash: string;
    disposition: SeasonDisposition;
  }>;
}

export interface SeasonServiceOptions {
  clock?: () => Date;
  /** The writer's IANA time zone for note timestamps; UTC without one. */
  timeZone?: string;
  generateId?: () => string;
}

export interface RecoveredSeasonWizard {
  record: SeasonRecord;
  step: SeasonWizardStep;
}

export interface SeasonService {
  beginSeason(input: BeginSeasonInput): Promise<SeasonRecord>;
  recoverWizard(): Promise<RecoveredSeasonWizard | null>;
  loadCurrent(): Promise<{
    record: SeasonRecord | null;
    conflicts: SavedNote[];
  }>;
  repairActiveSeason(keepNoteId: string): Promise<SeasonRecord>;
  saveStep<Step extends SeasonWizardStep>(
    record: SeasonRecord,
    step: Step,
    answers: SeasonStepAnswers<Step>,
    options?: { priorityOverride?: boolean },
  ): Promise<SeasonRecord>;
  activateSeason(record: SeasonRecord): Promise<SeasonRecord>;
  updateSeason(
    record: SeasonRecord,
    answers: SeasonUpdateInput,
  ): Promise<SeasonRecord>;
  closeSeason(
    record: SeasonRecord,
    reflection: SeasonCloseReflection,
  ): Promise<SeasonRecord>;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function seasonStateFromNote(note: StudioNote): SeasonState {
  const metadata = note.extraFrontmatter;
  const workflow =
    typeof metadata.season_workflow === 'object' &&
    metadata.season_workflow !== null &&
    !Array.isArray(metadata.season_workflow)
      ? (metadata.season_workflow as Record<string, unknown>)
      : {};
  const canonicalId =
    typeof metadata.season_id === 'string' && metadata.season_id.trim() !== ''
      ? metadata.season_id
      : note.id;
  const status =
    note.status === 'archived'
      ? 'archived'
      : note.status === 'active'
        ? 'active'
        : 'draft';
  return {
    ...createSeasonDraft(canonicalId, note.created),
    title: note.title ?? '',
    ...(typeof metadata.date_start === 'string'
      ? { startsOn: metadata.date_start }
      : {}),
    ...(typeof metadata.date_end === 'string'
      ? { endsOn: metadata.date_end }
      : {}),
    statement: typeof workflow.statement === 'string' ? workflow.statement : '',
    status,
    priorReflection:
      typeof workflow.prior_reflection === 'string'
        ? workflow.prior_reflection
        : '',
    skippedPriorReflection: workflow.skipped_prior_reflection === true,
    feelings: strings(workflow.feelings),
    priorities: strings(metadata.priorities),
    decisions: Array.isArray(workflow.decisions)
      ? workflow.decisions.filter(
          (item): item is SeasonState['decisions'][number] => {
            if (typeof item !== 'object' || item === null) return false;
            const entry = item as Record<string, unknown>;
            return (
              typeof entry.id === 'string' &&
              typeof entry.text === 'string' &&
              (entry.horizon === '30' ||
                entry.horizon === '60' ||
                entry.horizon === '90') &&
              (entry.kind === 'decision' || entry.kind === 'experiment')
            );
          },
        )
      : [],
    practices: strings(workflow.practices),
    supports: strings(workflow.supports),
    constraints: strings(workflow.constraints),
    enough: typeof workflow.enough === 'string' ? workflow.enough : '',
    notNow: strings(workflow.not_now),
    midSeasonNotes: strings(workflow.mid_season_notes),
    completedSteps: strings(workflow.completed_steps).filter(
      (item): item is SeasonWizardStep =>
        seasonWizardSteps.includes(item as SeasonWizardStep),
    ),
    created: note.created,
    updated: note.updated,
  };
}

function markdownForSeason(state: SeasonState): string {
  const lines = [
    state.statement.trim() === ''
      ? ''
      : `This is a season of ${state.statement.trim().replace(/^this is a season of\s*/iu, '')}`,
    '',
    '## How I want it to feel',
    '',
    state.feelings.join(' · '),
    '',
    '## Enough',
    '',
    state.enough,
    '',
    '## Practices',
    '',
    ...state.practices.map((practice) => `- ${practice}`),
    '',
    '## Support',
    '',
    ...state.supports.map((support) => `- ${support}`),
    ...state.constraints.map((constraint) => `- Constraint: ${constraint}`),
    '',
    '## Not now',
    '',
    ...state.notNow.map((item) => `- ${item}`),
  ];
  return `${lines.join('\n').trim()}\n`;
}

function noteWithState(note: StudioNote, state: SeasonState): StudioNote {
  const existing = note.extraFrontmatter;
  const preservedMetadata = { ...existing };
  delete preservedMetadata.date_start;
  delete preservedMetadata.date_end;
  return {
    ...note,
    title: state.title,
    body: markdownForSeason(state),
    status: state.status === 'draft' ? 'draft' : state.status,
    rooms: [...new Set([...note.rooms, 'current-season', 'foyer'])],
    extraFrontmatter: {
      ...preservedMetadata,
      season_id: state.id,
      ...(state.startsOn === undefined ? {} : { date_start: state.startsOn }),
      ...(state.endsOn === undefined ? {} : { date_end: state.endsOn }),
      priorities: state.priorities,
      season_workflow: {
        ...(typeof existing.season_workflow === 'object' &&
        existing.season_workflow !== null &&
        !Array.isArray(existing.season_workflow)
          ? existing.season_workflow
          : {}),
        statement: state.statement,
        prior_reflection: state.priorReflection,
        skipped_prior_reflection: state.skippedPriorReflection,
        feelings: state.feelings,
        decisions: state.decisions,
        practices: state.practices,
        supports: state.supports,
        constraints: state.constraints,
        enough: state.enough,
        not_now: state.notNow,
        mid_season_notes: state.midSeasonNotes,
        completed_steps: state.completedSteps,
      },
    },
  };
}

function createSeasonNote(state: SeasonState, noteId: string): StudioNote {
  return noteWithState(
    {
      schemaVersion: 1,
      id: noteId,
      title: state.title,
      body: '',
      cardType: 'season',
      semanticType: 'growth',
      status: 'draft',
      rooms: ['current-season', 'foyer'],
      lifeAreas: [],
      seasons: [],
      tags: ['season'],
      created: state.created,
      updated: state.updated,
      attachments: [],
      display: { featured: false },
      privacy: { sensitivity: 'private', aiAccess: 'ask' },
      extraFrontmatter: {},
      lineEnding: '\n',
    },
    state,
  );
}

function toRecord(saved: SavedNote): SeasonRecord {
  return { ...saved, state: seasonStateFromNote(saved.note) };
}

function seasonLetterBody(
  state: SeasonState,
  reflection: SeasonCloseReflection,
): string {
  const dispositions = reflection.dispositions.map(
    (item) => `- ${item.title}: ${item.disposition.replace('-', ' ')}`,
  );
  return (
    [
      `# A letter from ${state.title}`,
      '',
      '## What I celebrate',
      '',
      reflection.celebration,
      '',
      '## What I learned',
      '',
      reflection.learning,
      '',
      '## Who I became',
      '',
      reflection.identity,
      '',
      '## Where each thread rests',
      '',
      ...dispositions,
    ]
      .join('\n')
      .trim() + '\n'
  );
}

function normalizeCloseReflection(
  state: SeasonState,
  reflection: SeasonCloseReflection,
): SeasonCloseReflection {
  const normalized = {
    ...reflection,
    celebration: reflection.celebration.trim(),
    learning: reflection.learning.trim(),
    identity: reflection.identity.trim(),
  };
  for (const [field, value] of Object.entries({
    celebration: normalized.celebration,
    learning: normalized.learning,
    identity: normalized.identity,
  })) {
    if (value === '') throw new Error(`The ${field} reflection is required.`);
  }
  const priorityIds = new Set(state.priorities);
  if (
    priorityIds.size !== state.priorities.length ||
    normalized.dispositions.length !== state.priorities.length ||
    new Set(normalized.dispositions.map((item) => item.noteId)).size !==
      normalized.dispositions.length ||
    normalized.dispositions.some(
      (item) =>
        !priorityIds.has(item.noteId) || item.expectedHash.trim() === '',
    )
  ) {
    throw new Error(
      'Choose exactly one current disposition for every priority.',
    );
  }
  return normalized;
}

export function createSeasonService(
  studio: StudioService,
  options: SeasonServiceOptions = {},
): SeasonService {
  const clock = options.clock ?? (() => new Date());
  const generateId =
    options.generateId ?? (() => createNoteId(clock().valueOf()));
  // The Studio's zone unless the caller names one.
  const timeZone = options.timeZone ?? studio.timeZone;
  const now = () =>
    timeZone === undefined
      ? clock().toISOString()
      : localTimestamp(clock(), timeZone);

  async function saveState(
    record: SeasonRecord,
    state: SeasonState,
  ): Promise<SeasonRecord> {
    return toRecord(
      await studio.save({
        note: noteWithState(record.note, { ...state, updated: now() }),
        path: record.path,
        expectedHash: record.hash,
      }),
    );
  }

  async function loadProjection(path: string): Promise<SeasonRecord> {
    return toRecord(await studio.load(path));
  }

  async function loadCurrentRecords(): Promise<{
    record: SeasonRecord | null;
    conflicts: SavedNote[];
  }> {
    const projection = await studio.projectCurrentSeason();
    const record =
      projection.current === null
        ? null
        : await loadProjection(projection.current.path);
    const conflicts = await Promise.all(
      projection.conflicts.map((candidate) => studio.load(candidate.path)),
    );
    return { record, conflicts };
  }

  async function completeActiveOperation(
    checkpoint: Awaited<
      ReturnType<StudioService['seasonTransactions']['readActive']>
    >,
    clearActive = false,
  ): Promise<void> {
    const next = {
      ...checkpoint.value,
      revision: checkpoint.value.revision + 1,
      ...(clearActive ? { activeNoteId: null, activePath: null } : {}),
      operation: null,
    };
    try {
      await studio.seasonTransactions.compareAndSetActive(checkpoint, next);
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      const current = await studio.seasonTransactions.readActive();
      const alreadyComplete =
        current.value.operation === null &&
        (clearActive
          ? current.value.activeNoteId === null
          : current.value.activeNoteId === checkpoint.value.activeNoteId);
      if (alreadyComplete) return;
      throw error;
    }
  }

  async function resumeActiveOperation(): Promise<SeasonRecord | null> {
    let checkpoint = await studio.seasonTransactions.readActive();
    const operation = checkpoint.value.operation;
    if (operation === null) {
      const pending = await studio.pendingSeasonCloseTransaction();
      if (pending === null) return null;
      if (
        pending.stage === 'completed' &&
        checkpoint.value.activeNoteId === null
      ) {
        return null;
      }
      const target = await loadProjection(pending.seasonPath);
      if (target.note.id !== pending.seasonNoteId) {
        throw new Error(
          'The prepared season close no longer matches its canonical note.',
        );
      }
      if (pending.stage !== 'completed' && target.state.status !== 'active') {
        throw new Error(
          'The prepared season close no longer targets an active season.',
        );
      }
      checkpoint = await reserveActiveOperation('closing', target, {
        observed: checkpoint,
        operationId: pending.transactionId,
      });
      return resumeActiveOperation();
    }

    if (operation.kind === 'closing') {
      const pending = await studio.pendingSeasonCloseTransaction();
      if (
        pending === null ||
        pending.transactionId !== operation.id ||
        pending.seasonNoteId !== operation.targetNoteId ||
        pending.seasonPath !== operation.targetPath
      ) {
        throw new Error(
          'The season-close checkpoint does not match its durable journal. Preserve both for explicit repair.',
        );
      }
      const result = await studio.resumeSeasonCloseTransaction();
      if (result === null) {
        throw new Error(
          'The season-close checkpoint has no journal. Preserve it for explicit repair.',
        );
      }
      await completeActiveOperation(checkpoint, true);
      return toRecord(result.season);
    }

    if (operation.kind === 'activating') {
      let target = await loadProjection(operation.targetPath);
      if (target.note.id !== operation.targetNoteId) {
        throw new Error(
          'The reserved active season no longer matches its checkpoint.',
        );
      }
      if (target.state.status === 'draft') {
        try {
          target = await saveState(
            target,
            activateSeasonState(target.state, now()),
          );
        } catch (error) {
          if (!(error instanceof StudioSaveConflictError)) throw error;
          target = await loadProjection(operation.targetPath);
          if (target.state.status !== 'active') throw error;
        }
      }
      if (target.state.status !== 'active') {
        throw new Error('The reserved season cannot be activated.');
      }
      await completeActiveOperation(checkpoint);
      return target;
    }

    const projection = await studio.projectCurrentSeason();
    const active = [projection.current, ...projection.conflicts].filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    );
    const target = active.find(
      (candidate) => candidate.noteId === operation.targetNoteId,
    );
    if (target === undefined) {
      throw new Error('The selected active season no longer exists.');
    }
    for (const candidate of active) {
      if (candidate.noteId !== operation.targetNoteId) {
        await studio.archive(candidate.noteId);
      }
    }
    const kept = await loadProjection(target.path);
    await completeActiveOperation(checkpoint);
    return kept;
  }

  async function reserveActiveOperation(
    kind: 'activating' | 'repairing' | 'closing',
    target: SeasonRecord,
    options: {
      observed?: Awaited<
        ReturnType<StudioService['seasonTransactions']['readActive']>
      >;
      operationId?: string;
      allowActiveSwitch?: boolean;
    } = {},
  ) {
    const observed =
      options.observed ?? (await studio.seasonTransactions.readActive());
    if (
      observed.value.activeNoteId !== null &&
      observed.value.activeNoteId !== target.note.id &&
      !options.allowActiveSwitch
    ) {
      throw new Error('Another active season needs attention first.');
    }
    try {
      return await studio.seasonTransactions.compareAndSetActive(observed, {
        version: 1,
        revision: observed.value.revision + 1,
        activeNoteId: target.note.id,
        activePath: target.path,
        operation: {
          id:
            options.operationId ??
            `${kind}-${target.note.id}-${observed.value.revision + 1}`,
          kind,
          targetNoteId: target.note.id,
          targetPath: target.path,
        },
      });
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      throw new Error('Another active season needs attention first.', {
        cause: error,
      });
    }
  }

  return {
    async beginSeason(input) {
      await resumeActiveOperation();
      const checkpoint = await studio.seasonTransactions.readActive();
      if (checkpoint.value.activeNoteId !== null)
        throw new Error('Close the active season before beginning another.');
      const active = await studio.projectCurrentSeason();
      if (active.current !== null)
        throw new Error('Close the active season before beginning another.');
      const created = now();
      const noteId = generateId();
      const state = updateSeasonDraft(
        createSeasonDraft(noteId, created),
        'name-dates',
        input,
        created,
      );
      const note = createSeasonNote(state, noteId);
      return toRecord(
        await studio.save({
          note,
          path: `Current Season/${suggestFilename(note)}`,
          expectedMissing: true,
        }),
      );
    },

    async recoverWizard() {
      const drafts = (await studio.projectRoom('current-season')).filter(
        (card) => card.cardType === 'season' && card.status === 'draft',
      );
      const candidate = drafts[0];
      if (candidate === undefined) return null;
      const record = await loadProjection(candidate.path);
      return { record, step: seasonWizardSteps[seasonProgress(record.state)]! };
    },

    async loadCurrent() {
      await resumeActiveOperation();
      return loadCurrentRecords();
    },

    async repairActiveSeason(keepNoteId) {
      const loaded = await loadCurrentRecords();
      const candidates = [
        loaded.record,
        ...loaded.conflicts.map(toRecord),
      ].filter((candidate): candidate is SeasonRecord => candidate !== null);
      const keep = candidates.find(
        (candidate) => candidate.note.id === keepNoteId,
      );
      if (keep === undefined)
        throw new Error(
          'That season is no longer active. Refresh before repairing.',
        );
      const checkpoint = await studio.seasonTransactions.readActive();
      if (
        checkpoint.value.activeNoteId !== null &&
        !candidates.some(
          (candidate) =>
            candidate.note.id === checkpoint.value.activeNoteId &&
            candidate.path === checkpoint.value.activePath,
        )
      ) {
        throw new Error(
          'The active-season checkpoint no longer identifies an active candidate. Repair it before choosing a season.',
        );
      }
      if (checkpoint.value.operation !== null) {
        throw new Error(
          'The active-season operation must finish before repairing conflicts.',
        );
      }
      await studio.snapshot(
        'conflict-resolution',
        candidates.map((candidate) => candidate.path),
      );
      await reserveActiveOperation('repairing', keep, {
        observed: checkpoint,
        allowActiveSwitch: true,
      });
      return (await resumeActiveOperation())!;
    },

    async saveStep(record, step, answers, options = {}) {
      return saveState(
        record,
        updateSeasonDraft(record.state, step, answers, now(), options),
      );
    },

    async activateSeason(record) {
      const resumed = await resumeActiveOperation();
      if (resumed !== null) {
        if (resumed.note.id === record.note.id) return resumed;
        throw new Error('Another active season needs attention first.');
      }
      const active = await studio.projectCurrentSeason();
      if (active.current !== null && active.current.noteId !== record.note.id) {
        throw new Error('Another active season needs attention first.');
      }
      await reserveActiveOperation('activating', record);
      return (await resumeActiveOperation())!;
    },

    async updateSeason(record, answers) {
      return saveState(record, reviseSeasonState(record.state, answers, now()));
    },

    async closeSeason(record, reflection) {
      if (record.state.status !== 'active')
        throw new Error('Only the active season can be closed.');
      const resumed = await resumeActiveOperation();
      if (resumed !== null) {
        if (
          resumed.note.id === record.note.id &&
          resumed.state.status === 'archived'
        ) {
          return resumed;
        }
        throw new Error('Another active season needs attention first.');
      }
      const normalized = normalizeCloseReflection(record.state, reflection);
      const observed = await studio.seasonTransactions.readActive();
      if (
        observed.value.activeNoteId !== null &&
        (observed.value.activeNoteId !== record.note.id ||
          observed.value.activePath !== record.path)
      ) {
        throw new Error('Another active season needs attention first.');
      }
      const transactionId = `closing-${record.note.id}-${observed.value.revision + 1}`;
      const letterId = generateId();
      const created = now();
      const letter: StudioNote = {
        schemaVersion: 1,
        id: letterId,
        title: `A letter from ${record.state.title}`,
        body: seasonLetterBody(record.state, normalized),
        cardType: 'season-letter',
        semanticType: 'reflection',
        status: 'active',
        rooms: ['reflection-garden'],
        lifeAreas: [],
        seasons: [record.state.id],
        tags: ['season-letter'],
        created,
        updated: created,
        attachments: [],
        display: { featured: false },
        privacy: { sensitivity: 'private', aiAccess: 'ask' },
        extraFrontmatter: {
          season_id: record.state.id,
          dispositions: normalized.dispositions,
        },
        lineEnding: '\n',
      };
      const request: SeasonCloseRequest = {
        transactionId,
        season: record,
        closedSeasonNote: noteWithState(
          record.note,
          closeSeasonState(record.state, created),
        ),
        priorityIds: record.state.priorities,
        reflection: normalized,
        dispositions: normalized.dispositions.map((item) => ({
          noteId: item.noteId,
          expectedHash: item.expectedHash,
          disposition: item.disposition,
        })),
        letter,
      };
      await studio.prepareSeasonCloseTransaction(request);
      const reservation = await reserveActiveOperation('closing', record, {
        observed,
        operationId: transactionId,
      });
      try {
        const closed = await studio.resumeSeasonCloseTransaction();
        if (closed === null) {
          throw new Error(
            'The prepared season-close journal disappeared before it could run.',
          );
        }
        await completeActiveOperation(reservation, true);
        return toRecord(closed.season);
      } catch (error) {
        if (error instanceof SeasonClosePreflightError) {
          await completeActiveOperation(reservation);
        }
        throw error;
      }
    },
  };
}

export { seasonStateFromNote };
