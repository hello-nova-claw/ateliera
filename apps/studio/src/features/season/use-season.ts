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

export interface SeasonView {
  close(reflection: SeasonCloseReflection): Promise<void>;
  conflicts: SavedNote[];
  create(input: {
    title: string;
    startsOn?: string;
    endsOn?: string;
  }): Promise<void>;
  edit(): void;
  error?: string;
  record: SeasonRecord | null;
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
  const [wizardStep, setWizardStep] = useState<SeasonWizardStep>();
  const [state, setState] = useState<SeasonView['state']>(
    studio ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!service) {
      setRecord(null);
      setConflicts([]);
      setState('ready');
      return undefined;
    }
    let current = true;
    setState((currentState) =>
      currentState === 'ready' ? 'ready' : 'loading',
    );
    void Promise.all([service.recoverWizard(), service.loadCurrent()]).then(
      ([draft, active]) => {
        if (!current) return;
        if (draft) {
          setRecord(draft.record);
          setWizardStep(draft.step);
        } else {
          setRecord(active.record);
          setWizardStep(undefined);
        }
        setConflicts(active.conflicts);
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
  }, [revision, service]);

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
    edit: () => setWizardStep('name-dates'),
    ...(error ? { error } : {}),
    record,
    repairActive,
    saveStep,
    startWizard: () => setWizardStep('name-dates'),
    state,
    ...(wizardStep ? { wizardStep } : {}),
  };
}
