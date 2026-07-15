import type { TourStep } from './onboarding-state';

export type TourExampleMeaning =
  | 'foundation'
  | 'vision'
  | 'growth'
  | 'reflection'
  | 'celebration'
  | 'uncharted';

export interface TourExample {
  readonly previewKey: string;
  readonly room: TourStep;
  readonly label: string;
  readonly body: string;
  readonly meaning: TourExampleMeaning;
  readonly startingPoint?:
    | Readonly<{ kind: 'foyer'; placement: 'foyer-becoming'; body: string }>
    | Readonly<{ kind: 'landscape'; anchor: 'vision'; body: string }>
    | Readonly<{ kind: 'uncharted'; horizon: 'near'; body: string }>;
}

function freezeExamples(
  examples: readonly TourExample[],
): readonly TourExample[] {
  return Object.freeze(
    examples.map((example) =>
      Object.freeze({
        ...example,
        ...(example.startingPoint === undefined
          ? {}
          : { startingPoint: Object.freeze({ ...example.startingPoint }) }),
      }),
    ),
  );
}

export const tourExamples = Object.freeze({
  foyer: freezeExamples([
    {
      previewKey: 'foyer-becoming',
      room: 'foyer',
      label: 'Currently becoming',
      body: 'Someone who creates from calm and trusts her own timing.',
      meaning: 'foundation',
      startingPoint: {
        kind: 'foyer',
        placement: 'foyer-becoming',
        body: 'Someone who creates from calm and trusts her own timing.',
      },
    },
    {
      previewKey: 'foyer-feeling',
      room: 'foyer',
      label: 'How I want life to feel',
      body: 'Spacious · playful · well supported.',
      meaning: 'vision',
    },
    {
      previewKey: 'foyer-principle',
      room: 'foyer',
      label: 'Guiding principle',
      body: 'Create enough structure that your imagination has somewhere to surprise you.',
      meaning: 'foundation',
    },
  ] satisfies readonly TourExample[]),
  landscape: freezeExamples([
    {
      previewKey: 'landscape-vision',
      room: 'landscape',
      label: 'Vision',
      body: 'On an ordinary Tuesday, meaningful work fits into a calm family rhythm.',
      meaning: 'vision',
      startingPoint: {
        kind: 'landscape',
        anchor: 'vision',
        body: 'On an ordinary Tuesday, meaningful work fits into a calm family rhythm.',
      },
    },
    {
      previewKey: 'landscape-identity',
      room: 'landscape',
      label: 'Identity, values & feelings',
      body: 'I am a thoughtful creator who values depth, family, and spaciousness.',
      meaning: 'foundation',
    },
    {
      previewKey: 'landscape-decisions',
      room: 'landscape',
      label: 'Decisions',
      body: 'Protect two focused mornings for the work that matters most.',
      meaning: 'growth',
    },
    {
      previewKey: 'landscape-practices',
      room: 'landscape',
      label: 'Practices',
      body: 'Create before I consume.',
      meaning: 'growth',
    },
    {
      previewKey: 'landscape-structure',
      room: 'landscape',
      label: 'Structure & strategy',
      body: 'Agree on protected time, prepare the workspace, and keep the current project small.',
      meaning: 'foundation',
    },
  ] satisfies readonly TourExample[]),
  season: freezeExamples([
    {
      previewKey: 'season-feelings',
      room: 'season',
      label: 'Desired feelings',
      body: 'Grounded · spacious · hopeful.',
      meaning: 'vision',
    },
    {
      previewKey: 'season-priorities',
      room: 'season',
      label: 'Priorities',
      body: 'A calmer family rhythm · Protected creative work · Strength and energy.',
      meaning: 'growth',
    },
    {
      previewKey: 'season-enough',
      room: 'season',
      label: 'Enough',
      body: 'If I protect what matters and leave room to breathe, this season is enough.',
      meaning: 'foundation',
    },
    {
      previewKey: 'season-not-now',
      room: 'season',
      label: 'Not Now',
      body: 'Launching everything at once.',
      meaning: 'reflection',
    },
  ] satisfies readonly TourExample[]),
  uncharted: freezeExamples([
    {
      previewKey: 'uncharted-near',
      room: 'uncharted',
      label: 'Near',
      body: 'What if my work could feel spacious, creative, and financially abundant?',
      meaning: 'uncharted',
      startingPoint: {
        kind: 'uncharted',
        horizon: 'near',
        body: 'What if my work could feel spacious, creative, and financially abundant?',
      },
    },
    {
      previewKey: 'uncharted-beyond',
      room: 'uncharted',
      label: 'Beyond the Gate',
      body: 'What if there is a way of living I cannot fully picture yet?',
      meaning: 'uncharted',
    },
  ] satisfies readonly TourExample[]),
  reflection: freezeExamples([
    {
      previewKey: 'reflection-now',
      room: 'reflection',
      label: 'Reflection',
      body: 'I noticed I feel most like myself when I leave space around the things that matter.',
      meaning: 'reflection',
    },
    {
      previewKey: 'reflection-then',
      room: 'reflection',
      label: 'Celebration',
      body: 'Today I chose calm over urgency, and the important work still moved forward.',
      meaning: 'celebration',
    },
  ] satisfies readonly TourExample[]),
} satisfies Record<TourStep, readonly TourExample[]>);
