import { createNoteId, suggestFilename } from '@studio/content';
import {
  activateSeasonState,
  closeSeasonState,
  createSeasonDraft,
  PriorityLimitError,
  seasonProgress,
  seasonWizardSteps,
  updateSeasonDraft,
  type SeasonState,
  type SeasonWizardStep,
} from '@studio/domain';
import type { StudioNote } from '@studio/domain';

import type { SavedNote, StudioService } from './studio-service';

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
    disposition: SeasonDisposition;
  }>;
}

export interface SeasonServiceOptions {
  clock?: () => Date;
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
  saveStep(
    record: SeasonRecord,
    step: SeasonWizardStep,
    answers: Partial<SeasonState>,
    options?: { priorityOverride?: boolean },
  ): Promise<SeasonRecord>;
  activateSeason(record: SeasonRecord): Promise<SeasonRecord>;
  updateSeason(
    record: SeasonRecord,
    answers: Partial<SeasonState>,
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
  return {
    ...note,
    title: state.title,
    body: markdownForSeason(state),
    status: state.status === 'draft' ? 'draft' : state.status,
    rooms: [...new Set([...note.rooms, 'current-season', 'foyer'])],
    extraFrontmatter: {
      ...existing,
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

export function createSeasonService(
  studio: StudioService,
  options: SeasonServiceOptions = {},
): SeasonService {
  const clock = options.clock ?? (() => new Date());
  const generateId =
    options.generateId ?? (() => createNoteId(clock().valueOf()));
  const now = () => clock().toISOString();

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

  return {
    async beginSeason(input) {
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
      await studio.snapshot(
        'conflict-resolution',
        candidates.map((candidate) => candidate.path),
      );
      for (const candidate of candidates) {
        if (candidate.note.id !== keepNoteId)
          await studio.archive(candidate.note.id);
      }
      return toRecord(await studio.load(keep.path));
    },

    async saveStep(record, step, answers, options = {}) {
      if (
        step === 'priorities' &&
        (answers.priorities?.length ?? record.state.priorities.length) > 3 &&
        options.priorityOverride !== true
      )
        throw new PriorityLimitError();
      return saveState(
        record,
        updateSeasonDraft(record.state, step, answers, now()),
      );
    },

    async activateSeason(record) {
      const active = await studio.projectCurrentSeason();
      if (active.current !== null && active.current.noteId !== record.note.id) {
        throw new Error('Another active season needs attention first.');
      }
      return saveState(record, activateSeasonState(record.state, now()));
    },

    async updateSeason(record, answers) {
      return saveState(record, { ...record.state, ...answers, updated: now() });
    },

    async closeSeason(record, reflection) {
      if (record.state.status !== 'active')
        throw new Error('Only the active season can be closed.');
      const linkedPaths = (await studio.projectRoom('life-landscape'))
        .filter((candidate) =>
          record.state.priorities.includes(candidate.noteId),
        )
        .map((candidate) => candidate.path);
      await studio.snapshot('season-close', [record.path, ...linkedPaths]);
      const letterId = generateId();
      const created = now();
      const letter: StudioNote = {
        schemaVersion: 1,
        id: letterId,
        title: `A letter from ${record.state.title}`,
        body: seasonLetterBody(record.state, reflection),
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
          dispositions: reflection.dispositions,
        },
        lineEnding: '\n',
      };
      await studio.save({
        note: letter,
        path: `Reflection Garden/${suggestFilename(letter)}`,
        expectedMissing: true,
      });
      for (const item of reflection.dispositions) {
        if (item.disposition === 'archive' || item.disposition === 'release') {
          await studio.archive(item.noteId);
        }
      }
      return saveState(record, closeSeasonState(record.state, now()));
    },
  };
}

export { seasonStateFromNote };
