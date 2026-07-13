export const seasonWizardSteps = [
  'name-dates',
  'prior-reflection',
  'feelings',
  'priorities',
  'decisions-practices',
  'supports-constraints',
  'enough',
  'not-now',
  'confirm',
] as const;

export type SeasonWizardStep = (typeof seasonWizardSteps)[number];
export type SeasonStatus = 'draft' | 'active' | 'archived';
export type SeasonHorizon = '30' | '60' | '90';

export interface SeasonDecision {
  id: string;
  text: string;
  horizon: SeasonHorizon;
  kind: 'decision' | 'experiment';
}

export interface SeasonState {
  id: string;
  title: string;
  startsOn?: string;
  endsOn?: string;
  statement: string;
  status: SeasonStatus;
  priorReflection: string;
  skippedPriorReflection: boolean;
  feelings: string[];
  priorities: string[];
  decisions: SeasonDecision[];
  practices: string[];
  supports: string[];
  constraints: string[];
  enough: string;
  notNow: string[];
  midSeasonNotes: string[];
  completedSteps: SeasonWizardStep[];
  created: string;
  updated: string;
}

export interface SeasonStepAnswersMap {
  'name-dates': {
    title: string;
    startsOn?: string | null;
    endsOn?: string | null;
  };
  'prior-reflection': {
    priorReflection: string;
    skippedPriorReflection: boolean;
  };
  feelings: { feelings: string[]; statement: string };
  priorities: { priorities: string[] };
  'decisions-practices': {
    decisions: SeasonDecision[];
    practices: string[];
  };
  'supports-constraints': { supports: string[]; constraints: string[] };
  enough: { enough: string };
  'not-now': { notNow: string[] };
  confirm: Record<string, never>;
}

export type SeasonStepAnswers<Step extends SeasonWizardStep> = Partial<
  SeasonStepAnswersMap[Step]
>;

export type SeasonUpdateInput = Partial<
  Pick<
    SeasonState,
    | 'title'
    | 'statement'
    | 'feelings'
    | 'priorities'
    | 'decisions'
    | 'practices'
    | 'supports'
    | 'constraints'
    | 'enough'
    | 'notNow'
    | 'midSeasonNotes'
  >
> & {
  startsOn?: string | null;
  endsOn?: string | null;
};

const updateKeys = [
  'title',
  'startsOn',
  'endsOn',
  'statement',
  'feelings',
  'priorities',
  'decisions',
  'practices',
  'supports',
  'constraints',
  'enough',
  'notNow',
  'midSeasonNotes',
] as const satisfies readonly (keyof SeasonUpdateInput)[];

export interface ClosedSeasonState extends SeasonState {
  status: 'archived';
  carryForward: [];
}

export class PriorityLimitError extends Error {
  constructor() {
    super(
      'A season holds three priorities. Choose one to replace, or explicitly keep a fourth.',
    );
    this.name = 'PriorityLimitError';
  }
}

export function createSeasonDraft(id: string, now: string): SeasonState {
  return {
    id,
    title: '',
    statement: '',
    status: 'draft',
    priorReflection: '',
    skippedPriorReflection: false,
    feelings: [],
    priorities: [],
    decisions: [],
    practices: [],
    supports: [],
    constraints: [],
    enough: '',
    notNow: [],
    midSeasonNotes: [],
    completedSteps: [],
    created: now,
    updated: now,
  };
}

const stepKeys = {
  'name-dates': ['title', 'startsOn', 'endsOn'],
  'prior-reflection': ['priorReflection', 'skippedPriorReflection'],
  feelings: ['feelings', 'statement'],
  priorities: ['priorities'],
  'decisions-practices': ['decisions', 'practices'],
  'supports-constraints': ['supports', 'constraints'],
  enough: ['enough'],
  'not-now': ['notNow'],
  confirm: [],
} as const satisfies Record<SeasonWizardStep, readonly string[]>;

function validDate(value: string | undefined): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value ?? '');
  if (value === undefined) return true;
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function assertAcceptedKeys(step: SeasonWizardStep, answers: object): void {
  const accepted = new Set<string>(stepKeys[step]);
  const unexpected = Object.keys(answers).filter((key) => !accepted.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `${unexpected.join(', ')} is not accepted by the ${step} step.`,
    );
  }
}

function normalizeDates<
  Answers extends { startsOn?: string | null; endsOn?: string | null },
>(answers: Answers): Answers & { startsOn?: string; endsOn?: string } {
  return {
    ...answers,
    ...('startsOn' in answers
      ? { startsOn: answers.startsOn || undefined }
      : {}),
    ...('endsOn' in answers ? { endsOn: answers.endsOn || undefined } : {}),
  };
}

function validateSeasonState(
  state: SeasonState,
  options: { priorityOverride?: boolean },
): void {
  if (!validDate(state.startsOn) || !validDate(state.endsOn)) {
    throw new Error('Season dates must use YYYY-MM-DD.');
  }
  if (state.startsOn && state.endsOn && state.endsOn < state.startsOn) {
    throw new Error('End date must be on or after the start date.');
  }
  if (state.title.trim() === '') throw new Error('Give this season a name.');
  if (state.priorities.length > 3 && options.priorityOverride !== true) {
    throw new PriorityLimitError();
  }
}

export function updateSeasonDraft<Step extends SeasonWizardStep>(
  season: SeasonState,
  step: Step,
  answers: SeasonStepAnswers<Step>,
  now = season.updated,
  options: { priorityOverride?: boolean } = {},
): SeasonState {
  if (season.status !== 'draft') {
    throw new Error('Wizard steps can update only a draft season.');
  }
  assertAcceptedKeys(step, answers);
  const normalized = normalizeDates(answers);
  const next = { ...season, ...normalized } as SeasonState;
  validateSeasonState(next, options);
  if (
    step === 'prior-reflection' &&
    next.priorReflection.trim() === '' &&
    !next.skippedPriorReflection
  ) {
    throw new Error('Add a reflection, or choose to skip this step.');
  }
  return {
    ...next,
    completedSteps: seasonWizardSteps.filter(
      (candidate) =>
        candidate === step || season.completedSteps.includes(candidate),
    ),
    updated: now,
  };
}

export function reviseSeasonState(
  season: SeasonState,
  answers: SeasonUpdateInput,
  now = season.updated,
): SeasonState {
  if (season.status === 'archived') {
    throw new Error('An archived season cannot be revised.');
  }
  const accepted = new Set<string>(updateKeys);
  const unexpected = Object.keys(answers).filter((key) => !accepted.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `${unexpected.join(', ')} is not accepted by a season revision.`,
    );
  }
  const next = {
    ...season,
    ...normalizeDates(answers),
    updated: now,
  } as SeasonState;
  validateSeasonState(next, {});
  return next;
}

export function addSeasonPriority(
  season: SeasonState,
  noteId: string,
  options: { override?: boolean } = {},
): SeasonState {
  const priorities = [...new Set([...season.priorities, noteId.trim()])].filter(
    Boolean,
  );
  if (priorities.length > 3 && options.override !== true)
    throw new PriorityLimitError();
  return { ...season, priorities };
}

export function activateSeasonState(
  season: SeasonState,
  now = season.updated,
): SeasonState {
  if (season.status !== 'draft') {
    throw new Error('Only a draft season can be activated.');
  }
  if (season.title.trim() === '') throw new Error('Give this season a name.');
  if (
    !seasonWizardSteps.every((step) => season.completedSteps.includes(step))
  ) {
    throw new Error(
      'Complete all earlier steps and confirm this season before beginning.',
    );
  }
  return { ...season, status: 'active', updated: now };
}

export function closeSeasonState(
  season: SeasonState,
  now = season.updated,
): ClosedSeasonState {
  if (season.status !== 'active') {
    throw new Error('Only the active season can be closed.');
  }
  return { ...season, status: 'archived', carryForward: [], updated: now };
}

export function seasonProgress(season: SeasonState): number {
  const firstIncomplete = seasonWizardSteps.findIndex(
    (step) => !season.completedSteps.includes(step),
  );
  return firstIncomplete === -1
    ? seasonWizardSteps.length - 1
    : firstIncomplete;
}
