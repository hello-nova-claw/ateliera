import {
  createSeasonService,
  type SavedNote,
  type SeasonCloseReflection,
  type SeasonRecord,
  type StudioService,
} from '@studio/application';
import {
  seasonWizardSteps,
  type SeasonState,
  type SeasonWizardStep,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SeasonPriorityCandidate } from './SeasonPage';

export interface SeasonView {
  close(reflection: SeasonCloseReflection): Promise<void>;
  conflicts: SavedNote[];
  create(input: {
    title: string;
    startsOn?: string;
    endsOn?: string;
  }): Promise<void>;
  createPriority(title: string): Promise<SeasonPriorityCandidate>;
  edit(): void;
  error?: string;
  record: SeasonRecord | null;
  priorityCandidates: SeasonPriorityCandidate[];
  repairActive(keepNoteId: string): Promise<void>;
  saveStep(
    step: SeasonWizardStep,
    answers: Partial<SeasonState>,
    options?: { priorityOverride?: boolean },
  ): Promise<void>;
  startWizard(): void;
  state: 'ready' | 'loading' | 'saving' | 'error';
  wizardStep?: SeasonWizardStep;
}

export function useSeason(
  studio: StudioService | undefined,
  revision: number,
): SeasonView {
  const service = useMemo(
    () => studio && createSeasonService(studio),
    [studio],
  );
  const [record, setRecord] = useState<SeasonRecord | null>(null);
  const [conflicts, setConflicts] = useState<SavedNote[]>([]);
  const [priorityCandidates, setPriorityCandidates] = useState<
    SeasonPriorityCandidate[]
  >([]);
  const [priorityLifeArea, setPriorityLifeArea] = useState('home');
  const [wizardStep, setWizardStep] = useState<SeasonWizardStep>();
  const [state, setState] = useState<SeasonView['state']>(
    studio ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!service || !studio) {
      setRecord(null);
      setConflicts([]);
      setPriorityCandidates([]);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState((currentState) =>
      currentState === 'ready' ? 'ready' : 'loading',
    );
    void Promise.all([
      service.recoverWizard(),
      service.loadCurrent(),
      (async () => {
        const [cards, areas] = await Promise.all([
          studio.projectRoom('life-landscape'),
          studio.lifeAreas.load().catch(() => undefined),
        ]);
        const candidates = await Promise.all(
          cards.map(async (card) => {
            const saved = await studio.load(card.path);
            return {
              noteId: saved.note.id,
              title: saved.note.title?.trim() || card.title,
              hash: saved.hash,
              path: saved.path,
            };
          }),
        );
        return {
          candidates,
          lifeArea:
            areas?.areas.find((area) => !area.hidden)?.id ??
            areas?.areas[0]?.id ??
            'home',
        };
      })(),
    ]).then(
      ([draft, active, priorityContext]) => {
        if (!current) return;
        if (draft) {
          setRecord(draft.record);
          setWizardStep(draft.step);
        } else {
          setRecord(active.record);
          setWizardStep(undefined);
        }
        setConflicts(active.conflicts);
        setPriorityCandidates(priorityContext.candidates);
        setPriorityLifeArea(priorityContext.lifeArea);
        setError(undefined);
        setState('ready');
      },
      (reason: unknown) => {
        if (!current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'This season could not be gathered.',
        );
        setState('error');
      },
    );
    return () => {
      current = false;
    };
  }, [revision, service, studio]);

  const createPriority = useCallback(
    async (title: string): Promise<SeasonPriorityCandidate> => {
      if (!studio) throw new Error('Open a Studio before creating a priority.');
      const normalized = title.trim();
      if (!normalized) throw new Error('Give this priority a name.');
      const saved = await studio.capture({
        body: normalized,
        title: normalized,
        landscape: { lifeArea: priorityLifeArea, anchor: 'vision' },
      });
      const candidate = {
        noteId: saved.note.id,
        title: saved.note.title?.trim() || normalized,
        hash: saved.hash,
        path: saved.path,
      };
      setPriorityCandidates((items) => [
        ...items.filter((item) => item.noteId !== candidate.noteId),
        candidate,
      ]);
      return candidate;
    },
    [priorityLifeArea, studio],
  );

  const create = useCallback(
    async (input: { title: string; startsOn?: string; endsOn?: string }) => {
      if (!service) return;
      setState('saving');
      try {
        const saved = await service.beginSeason(input);
        setRecord(saved);
        setWizardStep('prior-reflection');
        setError(undefined);
        setState('ready');
      } catch (reason) {
        setState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'This season could not be begun.',
        );
        throw reason;
      }
    },
    [service],
  );

  const saveStep = useCallback(
    async (
      step: SeasonWizardStep,
      answers: Partial<SeasonState>,
      options?: { priorityOverride?: boolean },
    ) => {
      if (!service || !record) return;
      setState('saving');
      try {
        let saved = await service.saveStep(record, step, answers, options);
        if (step === 'confirm') {
          saved = await service.activateSeason(saved);
          setWizardStep(undefined);
        } else {
          setWizardStep(seasonWizardSteps[seasonWizardSteps.indexOf(step) + 1]);
        }
        setRecord(saved);
        setError(undefined);
        setState('ready');
      } catch (reason) {
        setState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'This step could not be saved.',
        );
        throw reason;
      }
    },
    [record, service],
  );

  const close = useCallback(
    async (reflection: SeasonCloseReflection) => {
      if (!service || !record) return;
      setState('saving');
      try {
        await service.closeSeason(record, reflection);
        setRecord(null);
        setWizardStep(undefined);
        setState('ready');
      } catch (reason) {
        setState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'This season could not be closed.',
        );
        throw reason;
      }
    },
    [record, service],
  );

  const repairActive = useCallback(
    async (keepNoteId: string) => {
      if (!service) return;
      setState('saving');
      try {
        const repaired = await service.repairActiveSeason(keepNoteId);
        setRecord(repaired);
        setConflicts([]);
        setError(undefined);
        setState('ready');
      } catch (reason) {
        setState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'The active seasons could not be repaired.',
        );
        throw reason;
      }
    },
    [service],
  );

  return {
    close,
    conflicts,
    create,
    createPriority,
    edit: () => setWizardStep('name-dates'),
    ...(error ? { error } : {}),
    record,
    priorityCandidates,
    repairActive,
    saveStep,
    startWizard: () => setWizardStep('name-dates'),
    state,
    ...(wizardStep ? { wizardStep } : {}),
  };
}
