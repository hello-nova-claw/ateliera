import { tourExamples, type TourExample } from './tour-examples';
import type { TourStep } from './onboarding-state';

export type UseTourExample = (
  example: TourExample,
  trigger: HTMLButtonElement,
  context?: { lifeArea: string },
) => void;

export function TourExampleCard({
  className = '',
  example,
  headingLevel = 3,
  onUse,
}: {
  className?: string;
  example: TourExample;
  headingLevel?: 2 | 3;
  onUse?: UseTourExample;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      aria-label={`Example ${example.label} card`}
      className={`tour-example-card tour-example-card--${example.meaning}${className ? ` ${className}` : ''}`}
    >
      <div className="tour-example-card__meta">
        <span>Example</span>
        <span aria-hidden="true">♥</span>
      </div>
      <Heading>{example.label}</Heading>
      <p>{example.body}</p>
      {example.startingPoint && onUse && (
        <button
          aria-label={`Use ${example.label} as a starting point`}
          onClick={(event) => onUse(example, event.currentTarget)}
          type="button"
        >
          Use as a starting point
        </button>
      )}
    </article>
  );
}

export function TourGlimpseLabel({ id }: { id?: string }) {
  return (
    <p className="tour-glimpse__label" id={id}>
      A glimpse of what could live here
    </p>
  );
}

export function TourPreview({
  onUse,
  rememberedPreviewKeys = new Set<string>(),
  step,
}: {
  onUse?: (example: TourExample, trigger: HTMLButtonElement) => void;
  rememberedPreviewKeys?: ReadonlySet<string>;
  step: TourStep;
}) {
  const examples: readonly TourExample[] = tourExamples[step].filter(
    (example) => !rememberedPreviewKeys.has(example.previewKey),
  );
  return (
    <section
      aria-labelledby={`tour-preview-${step}`}
      className={`tour-preview tour-preview--${step}`}
    >
      <p className="tour-preview__eyebrow" id={`tour-preview-${step}`}>
        A glimpse of what could live here
      </p>
      {step === 'season' && (
        <h2 className="tour-preview__season-title">
          A season of gentle foundations
        </h2>
      )}
      <div className="tour-preview__composition">
        {examples.map((example) => (
          <TourExampleCard
            className="tour-preview__card"
            example={example}
            key={example.previewKey}
            {...(onUse ? { onUse } : {})}
          />
        ))}
      </div>
    </section>
  );
}
