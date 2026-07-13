import type {
  SavedNote,
  SeasonCloseReflection,
  SeasonDisposition,
  SeasonRecord,
} from '@studio/application';
import {
  seasonWizardSteps,
  type SeasonState,
  type SeasonWizardStep,
} from '@studio/domain';
import { Dialog } from '@studio/ui';
import { useEffect, useId, useState, type FormEvent } from 'react';

import './SeasonPage.css';

export interface SeasonPageProps {
  conflicts?: SavedNote[];
  error?: string;
  onActivate?: () => Promise<void> | void;
  onBegin?: () => void;
  onCloseSeason?: (reflection: SeasonCloseReflection) => Promise<void> | void;
  onCreate?: (input: {
    title: string;
    startsOn?: string;
    endsOn?: string;
  }) => Promise<void> | void;
  onEdit?: () => void;
  onRepairActive?: (keepNoteId: string) => Promise<void> | void;
  onSaveStep?: (
    step: SeasonWizardStep,
    answers: Partial<SeasonState>,
    options?: { priorityOverride?: boolean },
  ) => Promise<void> | void;
  record: SeasonRecord | null;
  state: 'ready' | 'loading' | 'saving' | 'error';
  wizardStep?: SeasonWizardStep;
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
  onSave,
  record,
  step,
}: {
  busy: boolean;
  onActivate?: SeasonPageProps['onActivate'];
  onCreate?: SeasonPageProps['onCreate'];
  onSave?: SeasonPageProps['onSaveStep'];
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
  const priorityChoices = [
    ...new Set([
      ...(current?.priorities ?? []),
      'Home',
      'Studio',
      'Family',
      'Rest',
    ]),
  ];

  useEffect(() => setError(''), [step]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (step === 'name-dates') {
        if (!title.trim()) throw new Error('Give this season a name.');
        const dates = {
          title: title.trim(),
          ...(startsOn ? { startsOn } : {}),
          ...(endsOn ? { endsOn } : {}),
        };
        if (record) await onSave?.('name-dates', dates);
        else await onCreate?.(dates);
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
      const answers: Partial<SeasonState> =
        step === 'prior-reflection'
          ? {
              priorReflection: reflection,
              skippedPriorReflection: skipReflection,
            }
          : step === 'feelings'
            ? { feelings: lines(feelings), statement }
            : step === 'priorities'
              ? { priorities }
              : step === 'decisions-practices'
                ? {
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
                  }
                : step === 'supports-constraints'
                  ? {
                      supports: lines(supports),
                      constraints: lines(constraints),
                    }
                  : step === 'enough'
                    ? { enough }
                    : step === 'not-now'
                      ? { notNow: lines(notNow) }
                      : {};
      await onSave?.(
        step,
        answers,
        step === 'priorities'
          ? { priorityOverride: overridePriority }
          : undefined,
      );
      if (step === 'confirm') await onActivate?.();
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
            <label>
              Season name
              <input
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
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
            <label>
              What do you want to carry as learning?
              <textarea
                onChange={(event) => setReflection(event.target.value)}
                rows={6}
                value={reflection}
              />
            </label>
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
            <label>
              This is a season of…
              <textarea
                onChange={(event) => setStatement(event.target.value)}
                rows={3}
                value={statement}
              />
            </label>
            <label>
              How should it feel? <span>One per line</span>
              <textarea
                onChange={(event) => setFeelings(event.target.value)}
                rows={5}
                value={feelings}
              />
            </label>
          </>
        )}
        {step === 'priorities' && (
          <fieldset>
            <legend>What deserves the clearest attention?</legend>
            {priorityChoices.map((choice) => (
              <label className="season-wizard__check" key={choice}>
                <input
                  checked={priorities.includes(choice)}
                  onChange={(event) =>
                    setPriorities((items) =>
                      event.target.checked
                        ? [...items, choice]
                        : items.filter((item) => item !== choice),
                    )
                  }
                  type="checkbox"
                />{' '}
                {choice}
              </label>
            ))}
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
              <label>
                Decisions and experiments — 30 days
                <textarea
                  onChange={(event) => setDecisions30(event.target.value)}
                  rows={4}
                  value={decisions30}
                />
              </label>
              <label>
                Decisions and experiments — 60 days
                <textarea
                  onChange={(event) => setDecisions60(event.target.value)}
                  rows={4}
                  value={decisions60}
                />
              </label>
              <label>
                Decisions and experiments — 90 days
                <textarea
                  onChange={(event) => setDecisions90(event.target.value)}
                  rows={4}
                  value={decisions90}
                />
              </label>
            </div>
            <label>
              Practices <span>One per line</span>
              <textarea
                onChange={(event) => setPractices(event.target.value)}
                rows={5}
                value={practices}
              />
            </label>
          </>
        )}
        {step === 'supports-constraints' && (
          <div className="season-wizard__columns">
            <label>
              Support available
              <textarea
                onChange={(event) => setSupports(event.target.value)}
                rows={5}
                value={supports}
              />
            </label>
            <label>
              Real constraints
              <textarea
                onChange={(event) => setConstraints(event.target.value)}
                rows={5}
                value={constraints}
              />
            </label>
          </div>
        )}
        {step === 'enough' && (
          <label>
            What will be enough?
            <textarea
              onChange={(event) => setEnough(event.target.value)}
              rows={7}
              value={enough}
            />
          </label>
        )}
        {step === 'not-now' && (
          <label>
            What are you intentionally setting down? <span>One per line</span>
            <textarea
              onChange={(event) => setNotNow(event.target.value)}
              rows={7}
              value={notNow}
            />
          </label>
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
  onEdit,
  onRepairActive,
  onSaveStep,
  record,
  state,
  wizardStep,
}: SeasonPageProps) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [learning, setLearning] = useState('');
  const [identity, setIdentity] = useState('');
  const [dispositions, setDispositions] = useState<
    Record<string, SeasonDisposition | ''>
  >({});
  const [closeError, setCloseError] = useState('');

  if (wizardStep !== undefined) {
    return (
      <SeasonWizard
        busy={state === 'saving'}
        onActivate={onActivate}
        onCreate={onCreate}
        onSave={onSaveStep}
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
      <section className="season-empty">
        <p className="season-page__eyebrow">A humane present focus</p>
        <h1>Current Season</h1>
        <p>A season is a named chapter—not a deadline, streak, or test.</p>
        <button className="season-button" onClick={onBegin} type="button">
          Begin a season
        </button>
      </section>
    );
  const season = record.state;
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
          <p className="season-page__eyebrow">Current Season</p>
          <h1>{season.title}</h1>
          <p className="season-page__range">
            {formatRange(season.startsOn, season.endsOn)}
          </p>
          <p className="season-page__statement">
            This is a season of{' '}
            {season.statement || 'listening for what matters now'}
          </p>
        </header>
        <section
          aria-labelledby="season-priorities-title"
          className="season-page__section"
        >
          <p className="season-page__label">A limited focus</p>
          <h2 id="season-priorities-title">Priorities</h2>
          <div className="season-page__priorities">
            {season.priorities.slice(0, 3).map((priority, index) => (
              <article
                aria-label={`Priority ${index + 1}: ${priority}`}
                className="season-priority"
                key={priority}
              >
                <span aria-hidden="true">♡</span>
                <h3>{priority}</h3>
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
        <div className="season-page__support-grid">
          <section>
            <p className="season-page__label">30 / 60 / 90</p>
            <h2>Decisions & experiments</h2>
            {season.decisions.map((decision) => (
              <p className="season-page__decision" key={decision.id}>
                <span>{decision.horizon} days</span>
                {decision.text}
              </p>
            ))}
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
      <Dialog
        isOpen={closeOpen}
        label="Close this season"
        onClose={() => setCloseOpen(false)}
      >
        <form
          className="season-close"
          onSubmit={(event) => {
            event.preventDefault();
            const unresolved = season.priorities.filter(
              (noteId) => !dispositions[noteId],
            );
            if (unresolved.length > 0) {
              setCloseError(
                'Choose where each priority should rest before closing.',
              );
              return;
            }
            const settled = season.priorities.map((noteId) => ({
              noteId,
              title: noteId,
              disposition: dispositions[noteId] as SeasonDisposition,
            }));
            void Promise.resolve(
              onCloseSeason?.({
                celebration,
                learning,
                identity,
                dispositions: settled,
              }),
            ).then(() => setCloseOpen(false));
          }}
        >
          <p className="season-page__eyebrow">A letter from this season</p>
          <h2>Close gently</h2>
          <label>
            What do you celebrate?
            <textarea
              onChange={(event) => setCelebration(event.target.value)}
              rows={4}
              value={celebration}
            />
          </label>
          <label>
            What did you learn?
            <textarea
              onChange={(event) => setLearning(event.target.value)}
              rows={4}
              value={learning}
            />
          </label>
          <label>
            Who did you become?
            <textarea
              onChange={(event) => setIdentity(event.target.value)}
              rows={4}
              value={identity}
            />
          </label>
          {season.priorities.length > 0 && (
            <fieldset className="season-close__threads">
              <legend>Where should each thread rest?</legend>
              {season.priorities.map((noteId) => (
                <label key={noteId}>
                  {noteId}
                  <select
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
            <p className="season-wizard__error" role="alert">
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
              onClick={() => setCloseOpen(false)}
              type="button"
            >
              Keep it open
            </button>
            <button className="season-button" type="submit">
              Archive season and letter
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
