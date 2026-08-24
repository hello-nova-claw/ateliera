import type {
  SavedNote,
  SeasonCloseReflection,
  SeasonDisposition,
  SeasonRecord,
} from '@studio/application';
import {
  seasonWizardSteps,
  type SeasonStepAnswers,
  type SeasonWizardStep,
} from '@studio/domain';
import type { MicroSeason, Season } from '@studio/rhythm';
import { Dialog, GuidedField, RoomHeading } from '@studio/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import './SeasonPage.css';
import {
  seasonFieldGuidance,
  seasonPrioritiesGuidance,
} from './field-guidance';
import type { TourExample } from '../onboarding/tour-examples';
import { TourExampleCard, TourGlimpseLabel } from '../onboarding/TourPreview';
import { YearWheel } from './YearWheel';

export interface SeasonPriorityCandidate {
  noteId: string;
  title: string;
  hash: string;
  path?: string;
}

export interface SeasonPageProps {
  conflicts?: SavedNote[];
  error?: string;
  onActivate?: () => Promise<void> | void;
  onBegin?: () => void;
  onCloseSeason?: (reflection: SeasonCloseReflection) => Promise<void> | void;
  onCreatePriority?: (
    title: string,
  ) => Promise<SeasonPriorityCandidate> | SeasonPriorityCandidate;
  onCreate?: (input: {
    title: string;
    startsOn?: string;
    endsOn?: string;
  }) => Promise<void> | void;
  onEdit?: () => void;
  onRepairActive?: (keepNoteId: string) => Promise<void> | void;
  onSaveStep?: <Step extends SeasonWizardStep>(
    step: Step,
    answers: SeasonStepAnswers<Step>,
    options?: { priorityOverride?: boolean },
  ) => Promise<void> | void;
  record: SeasonRecord | null;
  priorityCandidates?: SeasonPriorityCandidate[];
  state: 'ready' | 'loading' | 'saving' | 'error';
  wizardStep?: SeasonWizardStep;
  tourExamples?: readonly TourExample[];
  yearWheel?: { season: Season; microSeason: MicroSeason };
}

function SeasonTourGlimpse({ examples }: { examples: readonly TourExample[] }) {
  return (
    <article
      className="season-tour-glimpse"
      aria-labelledby="season-tour-title"
    >
      <TourGlimpseLabel />
      <header className="season-tour-glimpse__cover">
        <p className="season-page__eyebrow">Current Season · Example</p>
        <h2 id="season-tour-title">A season of gentle foundations</h2>
      </header>
      <div className="season-tour-glimpse__composition">
        {examples.map((example) => (
          <TourExampleCard example={example} key={example.previewKey} />
        ))}
      </div>
    </article>
  );
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatRange(start?: string, end?: string): string {
  if (!start && !end) return 'An open-ended chapter';
  const format = (value: string) =>
    new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`));
  return [start && format(start), end && format(end)]
    .filter(Boolean)
    .join(' — ');
}

function SeasonWizard({
  busy,
  onActivate,
  onCreate,
  onCreatePriority,
  onSave,
  priorityCandidates,
  record,
  step,
}: {
  busy: boolean;
  onActivate?: SeasonPageProps['onActivate'];
  onCreate?: SeasonPageProps['onCreate'];
  onCreatePriority?: SeasonPageProps['onCreatePriority'];
  onSave?: SeasonPageProps['onSaveStep'];
  priorityCandidates: SeasonPriorityCandidate[];
  record: SeasonRecord | null;
  step: SeasonWizardStep;
}) {
  const current = record?.state;
  const [error, setError] = useState('');
  const [title, setTitle] = useState(current?.title ?? '');
  const [startsOn, setStartsOn] = useState(current?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(current?.endsOn ?? '');
  const [reflection, setReflection] = useState(current?.priorReflection ?? '');
  const [skipReflection, setSkipReflection] = useState(
    current?.skippedPriorReflection ?? false,
  );
  const [feelings, setFeelings] = useState(current?.feelings.join('\n') ?? '');
  const [priorities, setPriorities] = useState(current?.priorities ?? []);
  const [availablePriorities, setAvailablePriorities] =
    useState(priorityCandidates);
  const [newPriority, setNewPriority] = useState('');
  const [creatingPriority, setCreatingPriority] = useState(false);
  const [overridePriority, setOverridePriority] = useState(false);
  const [statement, setStatement] = useState(current?.statement ?? '');
  const [decisions30, setDecisions30] = useState(
    current?.decisions
      .filter((item) => item.horizon === '30')
      .map((item) => item.text)
      .join('\n') ?? '',
  );
  const [decisions60, setDecisions60] = useState(
    current?.decisions
      .filter((item) => item.horizon === '60')
      .map((item) => item.text)
      .join('\n') ?? '',
  );
  const [decisions90, setDecisions90] = useState(
    current?.decisions
      .filter((item) => item.horizon === '90')
      .map((item) => item.text)
      .join('\n') ?? '',
  );
  const [practices, setPractices] = useState(
    current?.practices.join('\n') ?? '',
  );
  const [supports, setSupports] = useState(current?.supports.join('\n') ?? '');
  const [constraints, setConstraints] = useState(
    current?.constraints.join('\n') ?? '',
  );
  const [enough, setEnough] = useState(current?.enough ?? '');
  const [notNow, setNotNow] = useState(current?.notNow.join('\n') ?? '');
  const headingId = useId();
  const fieldId = useId();
  const priorityChoices = [
    ...availablePriorities,
    ...(current?.priorities ?? [])
      .filter(
        (noteId) =>
          !availablePriorities.some((candidate) => candidate.noteId === noteId),
      )
      .map((noteId) => ({ noteId, title: noteId })),
  ];

  useEffect(() => setError(''), [step]);

  async function createPriority(): Promise<void> {
    const title = newPriority.trim();
    if (!title || !onCreatePriority || creatingPriority) return;
    setCreatingPriority(true);
    setError('');
    try {
      const created = await onCreatePriority(title);
      setAvailablePriorities((items) => [
        ...items.filter((item) => item.noteId !== created.noteId),
        created,
      ]);
      setPriorities((items) => [...new Set([...items, created.noteId])]);
      setNewPriority('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This Landscape priority could not be created.',
      );
    } finally {
      setCreatingPriority(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (step === 'name-dates') {
        if (!title.trim()) throw new Error('Give this season a name.');
        if (record) {
          await onSave?.('name-dates', {
            title: title.trim(),
            startsOn: startsOn || null,
            endsOn: endsOn || null,
          });
        } else {
          await onCreate?.({
            title: title.trim(),
            ...(startsOn ? { startsOn } : {}),
            ...(endsOn ? { endsOn } : {}),
          });
        }
        return;
      }
      if (
        step === 'prior-reflection' &&
        !reflection.trim() &&
        !skipReflection
      ) {
        throw new Error('Add a reflection, or skip this reflection for now.');
      }
      if (step === 'priorities' && priorities.length > 3 && !overridePriority) {
        throw new Error(
          'Choose up to three priorities, or explicitly keep all four.',
        );
      }
      switch (step) {
        case 'prior-reflection':
          await onSave?.('prior-reflection', {
            priorReflection: reflection,
            skippedPriorReflection: skipReflection,
          });
          break;
        case 'feelings':
          await onSave?.('feelings', { feelings: lines(feelings), statement });
          break;
        case 'priorities':
          await onSave?.(
            'priorities',
            { priorities },
            { priorityOverride: overridePriority },
          );
          break;
        case 'decisions-practices':
          await onSave?.('decisions-practices', {
            decisions: (
              [
                ['30', decisions30],
                ['60', decisions60],
                ['90', decisions90],
              ] as const
            ).flatMap(([horizon, value]) =>
              lines(value).map((text, index) => ({
                id: `decision-${horizon}-${index + 1}`,
                text,
                horizon,
                kind: 'decision' as const,
              })),
            ),
            practices: lines(practices),
          });
          break;
        case 'supports-constraints':
          await onSave?.('supports-constraints', {
            supports: lines(supports),
            constraints: lines(constraints),
          });
          break;
        case 'enough':
          await onSave?.('enough', { enough });
          break;
        case 'not-now':
          await onSave?.('not-now', { notNow: lines(notNow) });
          break;
        case 'confirm':
          await onSave?.('confirm', {});
          await onActivate?.();
          break;
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This step could not be saved.',
      );
    }
  }

  const stepNumber = seasonWizardSteps.indexOf(step) + 1;
  return (
    <section aria-labelledby={headingId} className="season-wizard">
      <p className="season-wizard__progress">
        Step {stepNumber} of {seasonWizardSteps.length}
      </p>
      <h1 id={headingId}>
        {step === 'name-dates' ? 'Begin a season' : 'Shape this season'}
      </h1>
      <p className="season-wizard__intro">
        Each step is remembered as you go. You can leave and return without
        starting over.
      </p>
      <form
        className="season-wizard__form"
        onSubmit={(event) => void submit(event)}
      >
        {step === 'name-dates' && (
          <>
            <GuidedField
              controlId={`${fieldId}-name`}
              description={seasonFieldGuidance.name.description}
              label="Season name"
            >
              <input
                autoFocus
                id={`${fieldId}-name`}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={seasonFieldGuidance.name.example}
                value={title}
              />
            </GuidedField>
            <div className="season-wizard__dates">
              <label>
                Starts{' '}
                <input
                  onChange={(event) => setStartsOn(event.target.value)}
                  type="date"
                  value={startsOn}
                />
              </label>
              <label>
                Ends{' '}
                <input
                  onChange={(event) => setEndsOn(event.target.value)}
                  type="date"
                  value={endsOn}
                />
              </label>
            </div>
          </>
        )}
        {step === 'prior-reflection' && (
          <>
            <GuidedField
              controlId={`${fieldId}-reflection`}
              description={seasonFieldGuidance.carryAsLearning.description}
              label="What do you want to carry as learning?"
            >
              <textarea
                id={`${fieldId}-reflection`}
                onChange={(event) => setReflection(event.target.value)}
                placeholder={seasonFieldGuidance.carryAsLearning.example}
                rows={6}
                value={reflection}
              />
            </GuidedField>
            <label className="season-wizard__check">
              <input
                checked={skipReflection}
                onChange={(event) => setSkipReflection(event.target.checked)}
                type="checkbox"
              />{' '}
              Skip this reflection for now
            </label>
          </>
        )}
        {step === 'feelings' && (
          <>
            <GuidedField
              controlId={`${fieldId}-statement`}
              description={seasonFieldGuidance.statement.description}
              label="This is a season of…"
            >
              <textarea
                id={`${fieldId}-statement`}
                onChange={(event) => setStatement(event.target.value)}
                placeholder={seasonFieldGuidance.statement.example}
                rows={3}
                value={statement}
              />
            </GuidedField>
            <GuidedField
              controlId={`${fieldId}-feelings`}
              description={seasonFieldGuidance.feelings.description}
              label="How should it feel?"
            >
              <textarea
                id={`${fieldId}-feelings`}
                onChange={(event) => setFeelings(event.target.value)}
                placeholder={seasonFieldGuidance.feelings.example}
                rows={5}
                value={feelings}
              />
            </GuidedField>
          </>
        )}
        {step === 'priorities' && (
          <fieldset aria-describedby={`${fieldId}-priorities-description`}>
            <legend>What deserves the clearest attention?</legend>
            <p
              className="season-wizard__field-description"
              id={`${fieldId}-priorities-description`}
            >
              {seasonPrioritiesGuidance.description}
            </p>
            {priorityChoices.map((choice) => (
              <label className="season-wizard__check" key={choice.noteId}>
                <input
                  checked={priorities.includes(choice.noteId)}
                  onChange={(event) =>
                    setPriorities((items) =>
                      event.target.checked
                        ? [...items, choice.noteId]
                        : items.filter((item) => item !== choice.noteId),
                    )
                  }
                  type="checkbox"
                />{' '}
                {choice.title}
              </label>
            ))}
            {priorityChoices.length === 0 && (
              <p className="season-wizard__quiet">
                Create a Landscape priority here, or return after adding one to
                your Life Landscape.
              </p>
            )}
            {onCreatePriority && (
              <div className="season-wizard__create-priority">
                <GuidedField
                  controlId={`${fieldId}-new-priority`}
                  description={seasonFieldGuidance.newPriority.description}
                  label="New Landscape priority"
                >
                  <input
                    disabled={creatingPriority}
                    id={`${fieldId}-new-priority`}
                    onChange={(event) => setNewPriority(event.target.value)}
                    placeholder={seasonFieldGuidance.newPriority.example}
                    value={newPriority}
                  />
                </GuidedField>
                <button
                  aria-busy={creatingPriority}
                  className="season-text-button"
                  disabled={creatingPriority || newPriority.trim() === ''}
                  onClick={() => void createPriority()}
                  type="button"
                >
                  {creatingPriority
                    ? 'Creating priority…'
                    : 'Create Landscape priority'}
                </button>
              </div>
            )}
            {priorities.length > 3 && (
              <div className="season-wizard__limit">
                <p>A season usually holds three priorities.</p>
                <label className="season-wizard__check">
                  <input
                    checked={overridePriority}
                    onChange={(event) =>
                      setOverridePriority(event.target.checked)
                    }
                    type="checkbox"
                  />{' '}
                  Keep all four for this season
                </label>
              </div>
            )}
          </fieldset>
        )}
        {step === 'decisions-practices' && (
          <>
            <div className="season-wizard__columns">
              <GuidedField
                controlId={`${fieldId}-decisions-30`}
                description={seasonFieldGuidance.decisions30.description}
                label="Decisions and experiments — 30 days"
              >
                <textarea
                  id={`${fieldId}-decisions-30`}
                  onChange={(event) => setDecisions30(event.target.value)}
                  placeholder={seasonFieldGuidance.decisions30.example}
                  rows={4}
                  value={decisions30}
                />
              </GuidedField>
              <GuidedField
                controlId={`${fieldId}-decisions-60`}
                description={seasonFieldGuidance.decisions60.description}
                label="Decisions and experiments — 60 days"
              >
                <textarea
                  id={`${fieldId}-decisions-60`}
                  onChange={(event) => setDecisions60(event.target.value)}
                  placeholder={seasonFieldGuidance.decisions60.example}
                  rows={4}
                  value={decisions60}
                />
              </GuidedField>
              <GuidedField
                controlId={`${fieldId}-decisions-90`}
                description={seasonFieldGuidance.decisions90.description}
                label="Decisions and experiments — 90 days"
              >
                <textarea
                  id={`${fieldId}-decisions-90`}
                  onChange={(event) => setDecisions90(event.target.value)}
                  placeholder={seasonFieldGuidance.decisions90.example}
                  rows={4}
                  value={decisions90}
                />
              </GuidedField>
            </div>
            <GuidedField
              controlId={`${fieldId}-practices`}
              description={seasonFieldGuidance.practices.description}
              label="Practices"
            >
              <textarea
                id={`${fieldId}-practices`}
                onChange={(event) => setPractices(event.target.value)}
                placeholder={seasonFieldGuidance.practices.example}
                rows={5}
                value={practices}
              />
            </GuidedField>
          </>
        )}
        {step === 'supports-constraints' && (
          <div className="season-wizard__columns">
            <GuidedField
              controlId={`${fieldId}-supports`}
              description={seasonFieldGuidance.supports.description}
              label="Support available"
            >
              <textarea
                id={`${fieldId}-supports`}
                onChange={(event) => setSupports(event.target.value)}
                placeholder={seasonFieldGuidance.supports.example}
                rows={5}
                value={supports}
              />
            </GuidedField>
            <GuidedField
              controlId={`${fieldId}-constraints`}
              description={seasonFieldGuidance.constraints.description}
              label="Real constraints"
            >
              <textarea
                id={`${fieldId}-constraints`}
                onChange={(event) => setConstraints(event.target.value)}
                placeholder={seasonFieldGuidance.constraints.example}
                rows={5}
                value={constraints}
              />
            </GuidedField>
          </div>
        )}
        {step === 'enough' && (
          <GuidedField
            controlId={`${fieldId}-enough`}
            description={seasonFieldGuidance.enough.description}
            label="What will be enough?"
          >
            <textarea
              id={`${fieldId}-enough`}
              onChange={(event) => setEnough(event.target.value)}
              placeholder={seasonFieldGuidance.enough.example}
              rows={7}
              value={enough}
            />
          </GuidedField>
        )}
        {step === 'not-now' && (
          <GuidedField
            controlId={`${fieldId}-not-now`}
            description={seasonFieldGuidance.notNow.description}
            label="What are you intentionally setting down?"
          >
            <textarea
              id={`${fieldId}-not-now`}
              onChange={(event) => setNotNow(event.target.value)}
              placeholder={seasonFieldGuidance.notNow.example}
              rows={7}
              value={notNow}
            />
          </GuidedField>
        )}
        {step === 'confirm' && (
          <div className="season-wizard__confirm">
            <p className="season-wizard__script">enough for this season</p>
            <h2>{current?.title}</h2>
            <p>
              {current?.statement ||
                'There is room to discover what this season becomes.'}
            </p>
            <p>
              <strong>Enough:</strong>{' '}
              {current?.enough || 'You can define this as the season unfolds.'}
            </p>
          </div>
        )}
        {error && (
          <p className="season-wizard__error" role="alert">
            {error}
          </p>
        )}
        <button className="season-button" disabled={busy} type="submit">
          {busy
            ? 'Remembering…'
            : step === 'confirm'
              ? 'Begin this season'
              : 'Continue'}
        </button>
      </form>
    </section>
  );
}

export function SeasonPage({
  conflicts = [],
  error,
  onActivate,
  onBegin,
  onCloseSeason,
  onCreate,
  onCreatePriority,
  onEdit,
  onRepairActive,
  onSaveStep,
  priorityCandidates = [],
  record,
  state,
  tourExamples = [],
  wizardStep,
  yearWheel,
}: SeasonPageProps) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [learning, setLearning] = useState('');
  const [identity, setIdentity] = useState('');
  const [dispositions, setDispositions] = useState<
    Record<string, SeasonDisposition | ''>
  >({});
  const [closeError, setCloseError] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const closeFieldId = useId();
  const closeBusyRef = useRef(false);
  const closeErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!closeError) return undefined;
    const frame = requestAnimationFrame(() => closeErrorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [closeError]);

  if (wizardStep !== undefined) {
    return (
      <SeasonWizard
        busy={state === 'saving'}
        onActivate={onActivate}
        onCreate={onCreate}
        onCreatePriority={onCreatePriority}
        onSave={onSaveStep}
        priorityCandidates={priorityCandidates}
        record={record}
        step={wizardStep}
      />
    );
  }
  if (state === 'loading')
    return (
      <p className="season-page__state" role="status">
        Gathering this season…
      </p>
    );
  if (record === null)
    return (
      <div className="season-empty-room">
        <section className="season-empty">
          <RoomHeading
            eyebrow="a humane present focus"
            intro="Name what matters now as a gentle chapter — priorities, experiments, and what you're setting down. Not a deadline."
            title="Current Season"
          />
          <button className="season-button" onClick={onBegin} type="button">
            Begin a season
          </button>
        </section>
        {tourExamples.length > 0 && (
          <SeasonTourGlimpse examples={tourExamples} />
        )}
      </div>
    );
  const season = record.state;
  const priorityTitle = (noteId: string) =>
    priorityCandidates.find((candidate) => candidate.noteId === noteId)
      ?.title ?? noteId;
  return (
    <>
      <article className="season-page">
        {conflicts.length > 0 && (
          <section className="season-page__repair" role="alert">
            <p>
              More than one season is active. Nothing was changed; choose which
              season should remain current.
            </p>
            <div className="season-page__repair-actions">
              {[
                record,
                ...conflicts.map((saved) => ({
                  ...saved,
                  state: record.state,
                })),
              ].map((candidate) => (
                <button
                  className="season-text-button"
                  key={candidate.note.id}
                  onClick={() => void onRepairActive?.(candidate.note.id)}
                  type="button"
                >
                  Keep {candidate.note.title ?? 'this season'}
                </button>
              ))}
            </div>
          </section>
        )}
        {error && (
          <p className="season-page__repair" role="alert">
            {error}
          </p>
        )}
        <header className="season-page__cover">
          <RoomHeading eyebrow="current season" title={season.title} />
          <p className="season-page__range">
            {formatRange(season.startsOn, season.endsOn)}
          </p>
          <p className="season-page__statement">
            This is a season of{' '}
            {season.statement || 'listening for what matters now'}
          </p>
        </header>
        {yearWheel && <YearWheel {...yearWheel} />}
        <section
          aria-labelledby="season-priorities-title"
          className="season-page__section"
        >
          <p className="season-page__label">A limited focus</p>
          <h2 id="season-priorities-title">Priorities</h2>
          <div className="season-page__priorities">
            {season.priorities.slice(0, 3).map((priority, index) => (
              <article
                aria-label={`Priority ${index + 1}: ${priorityTitle(priority)}`}
                className="season-priority"
                key={priority}
              >
                <span aria-hidden="true">♡</span>
                <h3>{priorityTitle(priority)}</h3>
              </article>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="season-feelings-title"
          className="season-page__section"
        >
          <p className="season-page__label">How it feels</p>
          <h2 id="season-feelings-title" className="studio-visually-hidden">
            Desired feelings
          </h2>
          <ul className="season-page__feelings">
            {season.feelings.map((feeling) => (
              <li key={feeling}>{feeling}</li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="season-enough-title"
          className="season-page__enough"
        >
          <p className="season-page__script">this is enough</p>
          <h2 id="season-enough-title">Enough</h2>
          <p>
            {season.enough ||
              'The definition can stay gentle and change as life changes.'}
          </p>
        </section>
        <div className="season-page__support">
          <section>
            <p className="season-page__label">30 / 60 / 90</p>
            <h2>Decisions & experiments</h2>
            <dl className="season-page__ladder">
              {season.decisions.map((decision) => (
                <div className="season-page__decision" key={decision.id}>
                  <dt>
                    {decision.horizon}
                    <span> days</span>
                  </dt>
                  <dd>{decision.text}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <p className="season-page__label">What holds it</p>
            <h2>Practices & support</h2>
            <ul>
              {season.practices.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {season.supports.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {season.constraints.map((item) => (
                <li key={item}>Working with: {item}</li>
              ))}
            </ul>
          </section>
        </div>
        <details className="season-page__not-now">
          <summary>Not now</summary>
          <p>Intentionally resting, without becoming backlog debt.</p>
          <ul>
            {season.notNow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <footer className="season-page__actions">
          <button className="season-text-button" onClick={onEdit} type="button">
            Revise this season
          </button>
          <button
            className="season-text-button"
            onClick={() => setCloseOpen(true)}
            type="button"
          >
            Close season
          </button>
        </footer>
      </article>
      {tourExamples.length > 0 && <SeasonTourGlimpse examples={tourExamples} />}
      <Dialog
        isOpen={closeOpen}
        label="Close this season"
        onClose={() => {
          if (!closeBusyRef.current) setCloseOpen(false);
        }}
      >
        <form
          className="season-close"
          onSubmit={(event) => {
            event.preventDefault();
            if (closeBusyRef.current) return;
            const trimmed = {
              celebration: celebration.trim(),
              learning: learning.trim(),
              identity: identity.trim(),
            };
            const missing = [
              [
                trimmed.celebration,
                'Add what you celebrate before closing this season.',
              ],
              [
                trimmed.learning,
                'Add what you learned before closing this season.',
              ],
              [
                trimmed.identity,
                'Add who you became before closing this season.',
              ],
            ].find(([value]) => !value);
            if (missing) {
              setCloseError(missing[1]!);
              return;
            }
            const unresolved = season.priorities.filter(
              (noteId) => !dispositions[noteId],
            );
            if (unresolved.length > 0) {
              setCloseError(
                'Choose where each priority should rest before closing.',
              );
              return;
            }
            const unavailable = season.priorities.find(
              (noteId) =>
                !priorityCandidates.some(
                  (candidate) =>
                    candidate.noteId === noteId && candidate.hash !== '',
                ),
            );
            if (unavailable) {
              setCloseError(
                `Refresh this season before closing; ${priorityTitle(unavailable)} changed or is unavailable.`,
              );
              return;
            }
            const settled = season.priorities.map((noteId) => {
              const candidate = priorityCandidates.find(
                (item) => item.noteId === noteId,
              )!;
              return {
                noteId,
                title: candidate.title,
                expectedHash: candidate.hash,
                disposition: dispositions[noteId] as SeasonDisposition,
              };
            });
            closeBusyRef.current = true;
            setCloseBusy(true);
            setCloseError('');
            void Promise.resolve(
              onCloseSeason?.({ ...trimmed, dispositions: settled }),
            )
              .then(
                () => setCloseOpen(false),
                (reason: unknown) => {
                  setCloseError(
                    reason instanceof Error
                      ? reason.message
                      : 'This season could not be closed.',
                  );
                },
              )
              .finally(() => {
                closeBusyRef.current = false;
                setCloseBusy(false);
              });
          }}
        >
          <p className="season-page__eyebrow">A letter from this season</p>
          <h2>Close gently</h2>
          <GuidedField
            controlId={`${closeFieldId}-celebration`}
            description={seasonFieldGuidance.celebration.description}
            label="What do you celebrate?"
          >
            <textarea
              disabled={closeBusy}
              id={`${closeFieldId}-celebration`}
              onChange={(event) => setCelebration(event.target.value)}
              placeholder={seasonFieldGuidance.celebration.example}
              rows={4}
              value={celebration}
            />
          </GuidedField>
          <GuidedField
            controlId={`${closeFieldId}-learning`}
            description={seasonFieldGuidance.learning.description}
            label="What did you learn?"
          >
            <textarea
              disabled={closeBusy}
              id={`${closeFieldId}-learning`}
              onChange={(event) => setLearning(event.target.value)}
              placeholder={seasonFieldGuidance.learning.example}
              rows={4}
              value={learning}
            />
          </GuidedField>
          <GuidedField
            controlId={`${closeFieldId}-identity`}
            description={seasonFieldGuidance.identity.description}
            label="Who did you become?"
          >
            <textarea
              disabled={closeBusy}
              id={`${closeFieldId}-identity`}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder={seasonFieldGuidance.identity.example}
              rows={4}
              value={identity}
            />
          </GuidedField>
          {season.priorities.length > 0 && (
            <fieldset className="season-close__threads">
              <legend>Where should each thread rest?</legend>
              {season.priorities.map((noteId) => (
                <label key={noteId}>
                  {priorityTitle(noteId)}
                  <select
                    disabled={closeBusy}
                    onChange={(event) => {
                      setDispositions((current) => ({
                        ...current,
                        [noteId]: event.target.value as SeasonDisposition,
                      }));
                      setCloseError('');
                    }}
                    value={dispositions[noteId] ?? ''}
                  >
                    <option value="">Choose gently…</option>
                    <option value="celebrate">Celebrate</option>
                    <option value="archive">Archive</option>
                    <option value="return-landscape">
                      Return to Landscape
                    </option>
                    <option value="invite-forward">
                      Invite forward explicitly
                    </option>
                    <option value="release">Release</option>
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          {closeError && (
            <p
              className="season-wizard__error"
              ref={closeErrorRef}
              role="alert"
              tabIndex={-1}
            >
              {closeError}
            </p>
          )}
          <p>
            Nothing will move into another season unless you explicitly invite
            it later.
          </p>
          <div className="season-close__actions">
            <button
              className="season-text-button"
              disabled={closeBusy}
              onClick={() => setCloseOpen(false)}
              type="button"
            >
              Keep it open
            </button>
            <button
              aria-busy={closeBusy}
              className="season-button"
              disabled={closeBusy}
              type="submit"
            >
              {closeBusy ? 'Closing season…' : 'Archive season and letter'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
