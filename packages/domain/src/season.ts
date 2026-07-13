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

export interface ClosedSeasonState extends SeasonState {
  status: 'archived';
  carryForward: [];
}

export class PriorityLimitError extends Error {
  constructor() {
    super('A season holds three priorities. Choose one to replace, or explicitly keep a fourth.');
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

type SeasonStepAnswers = Partial<Omit<SeasonState, 'id' | 'created' | 'completedSteps'>>;

function validDate(value: string | undefined): boolean {
  return value === undefined || /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

export function updateSeasonDraft(
  season: SeasonState,
  step: SeasonWizardStep,
  answers: SeasonStepAnswers,
  now = season.updated,
): SeasonState {
  const next = { ...season, ...answers };
  if (!validDate(next.startsOn) || !validDate(next.endsOn)) {
    throw new Error('Season dates must use YYYY-MM-DD.');
  }
  if (next.startsOn && next.endsOn && next.endsOn < next.startsOn) {
    throw new Error('End date must be on or after the start date.');
  }
  if (step === 'name-dates' && next.title.trim() === '') {
    throw new Error('Give this season a name.');
  }
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

export function addSeasonPriority(
  season: SeasonState,
  noteId: string,
  options: { override?: boolean } = {},
): SeasonState {
  const priorities = [...new Set([...season.priorities, noteId.trim()])].filter(Boolean);
  if (priorities.length > 3 && options.override !== true) throw new PriorityLimitError();
  return { ...season, priorities };
}

export function activateSeasonState(season: SeasonState, now = season.updated): SeasonState {
  if (season.title.trim() === '') throw new Error('Give this season a name.');
  if (!season.completedSteps.includes('confirm')) {
    throw new Error('Review and confirm this season before beginning.');
  }
  return { ...season, status: 'active', updated: now };
}

export function closeSeasonState(season: SeasonState, now = season.updated): ClosedSeasonState {
  return { ...season, status: 'archived', carryForward: [], updated: now };
}

export function seasonProgress(season: SeasonState): number {
  const firstIncomplete = seasonWizardSteps.findIndex(
    (step) => !season.completedSteps.includes(step),
  );
  return firstIncomplete === -1 ? seasonWizardSteps.length - 1 : firstIncomplete;
}
