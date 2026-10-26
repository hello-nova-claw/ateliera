import tourExampleCopy from '../../content/tour-examples.json';
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
      body: tourExampleCopy['foyer-becoming'],
      meaning: 'foundation',
      startingPoint: {
        kind: 'foyer',
        placement: 'foyer-becoming',
        body: tourExampleCopy['foyer-becoming'],
      },
    },
    {
      previewKey: 'foyer-feeling',
      room: 'foyer',
      label: 'How I want life to feel',
      body: tourExampleCopy['foyer-feeling'],
      meaning: 'vision',
    },
    {
      previewKey: 'foyer-principle',
      room: 'foyer',
      label: 'Guiding principle',
      body: tourExampleCopy['foyer-principle'],
      meaning: 'foundation',
    },
  ] satisfies readonly TourExample[]),
  landscape: freezeExamples([
    {
      previewKey: 'landscape-vision',
      room: 'landscape',
      label: 'Vision',
      body: tourExampleCopy['landscape-vision'],
      meaning: 'vision',
      startingPoint: {
        kind: 'landscape',
        anchor: 'vision',
        body: tourExampleCopy['landscape-vision'],
      },
    },
    {
      previewKey: 'landscape-identity',
      room: 'landscape',
      label: 'Identity, values & feelings',
      body: tourExampleCopy['landscape-identity'],
      meaning: 'foundation',
    },
    {
      previewKey: 'landscape-decisions',
      room: 'landscape',
      label: 'Decisions',
      body: tourExampleCopy['landscape-decisions'],
      meaning: 'growth',
    },
    {
      previewKey: 'landscape-practices',
      room: 'landscape',
      label: 'Practices',
      body: tourExampleCopy['landscape-practices'],
      meaning: 'growth',
    },
    {
      previewKey: 'landscape-structure',
      room: 'landscape',
      label: 'Structure & strategy',
      body: tourExampleCopy['landscape-structure'],
      meaning: 'foundation',
    },
  ] satisfies readonly TourExample[]),
  season: freezeExamples([
    {
      previewKey: 'season-feelings',
      room: 'season',
      label: 'Desired feelings',
      body: tourExampleCopy['season-feelings'],
      meaning: 'vision',
    },
    {
      previewKey: 'season-priorities',
      room: 'season',
      label: 'Priorities',
      body: tourExampleCopy['season-priorities'],
      meaning: 'growth',
    },
    {
      previewKey: 'season-enough',
      room: 'season',
      label: 'Enough',
      body: tourExampleCopy['season-enough'],
      meaning: 'foundation',
    },
    {
      previewKey: 'season-not-now',
      room: 'season',
      label: 'Not Now',
      body: tourExampleCopy['season-not-now'],
      meaning: 'reflection',
    },
  ] satisfies readonly TourExample[]),
  uncharted: freezeExamples([
    {
      previewKey: 'uncharted-near',
      room: 'uncharted',
      label: 'Near',
      body: tourExampleCopy['uncharted-near'],
      meaning: 'uncharted',
      startingPoint: {
        kind: 'uncharted',
        horizon: 'near',
        body: tourExampleCopy['uncharted-near'],
      },
    },
    {
      previewKey: 'uncharted-beyond',
      room: 'uncharted',
      label: 'Beyond the Gate',
      body: tourExampleCopy['uncharted-beyond'],
      meaning: 'uncharted',
    },
  ] satisfies readonly TourExample[]),
  reflection: freezeExamples([
    {
      previewKey: 'reflection-now',
      room: 'reflection',
      label: 'Reflection',
      body: tourExampleCopy['reflection-now'],
      meaning: 'reflection',
    },
    {
      previewKey: 'reflection-then',
      room: 'reflection',
      label: 'Celebration',
      body: tourExampleCopy['reflection-then'],
      meaning: 'celebration',
    },
  ] satisfies readonly TourExample[]),
} satisfies Record<TourStep, readonly TourExample[]>);
