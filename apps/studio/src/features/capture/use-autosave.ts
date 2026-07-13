import {
  StudioSaveConflictError,
  type SavedNote,
} from '@studio/application';
import type { StudioNote } from '@studio/domain';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error';

export interface UseAutosaveOptions {
  initial: SavedNote;
  save: (note: StudioNote, expectedHash: string) => Promise<SavedNote>;
  writeRecovery: (note: StudioNote, expectedHash: string) => void;
  removeRecovery: () => void;
  delayMs?: number;
}

export interface AutosaveModel {
  conflict?: StudioSaveConflictError;
  error?: Error;
  flush(): Promise<void>;
  note: StudioNote;
  state: SaveState;
  update(note: StudioNote): void;
}

export function useAutosave({
  initial,
  save,
  writeRecovery,
  removeRecovery,
  delayMs = 750,
}: UseAutosaveOptions): AutosaveModel {
  const [note, setNote] = useState(initial.note);
  const [state, setState] = useState<SaveState>('idle');
  const [conflict, setConflict] = useState<StudioSaveConflictError>();
  const [error, setError] = useState<Error>();
  const latest = useRef(initial.note);
  const durableHash = useRef(initial.hash);
  const editRevision = useRef(0);
  const savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const stopped = useRef(false);

  const persist = useCallback(async (): Promise<void> => {
    if (stopped.current || savedRevision.current === editRevision.current) {
      return;
    }
    if (inFlight.current !== undefined) {
      await inFlight.current;
      if (!stopped.current && savedRevision.current !== editRevision.current) {
        await persist();
      }
      return;
    }

    const revision = editRevision.current;
    const value = latest.current;
    setState('saving');
    const operation = (async () => {
      try {
        const result = await save(value, durableHash.current);
        durableHash.current = result.hash;
        savedRevision.current = revision;
        if (savedRevision.current === editRevision.current) {
          removeRecovery();
          setState('saved');
        } else {
          writeRecovery(latest.current, durableHash.current);
          setState('dirty');
        }
      } catch (reason) {
        stopped.current = reason instanceof StudioSaveConflictError;
        if (reason instanceof StudioSaveConflictError) {
          setConflict(reason);
          setState('conflict');
        } else {
          setError(reason instanceof Error ? reason : new Error('The note could not be saved.'));
          setState('error');
        }
      }
    })();
    inFlight.current = operation;
    await operation;
    if (inFlight.current === operation) inFlight.current = undefined;
    if (!stopped.current && savedRevision.current !== editRevision.current) {
      await persist();
    }
  }, [removeRecovery, save, writeRecovery]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    await persist();
  }, [persist]);

  const update = useCallback(
    (next: StudioNote): void => {
      if (stopped.current) return;
      latest.current = next;
      setNote(next);
      editRevision.current += 1;
      writeRecovery(next, durableHash.current);
      setError(undefined);
      setState('dirty');
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void persist();
      }, delayMs);
    },
    [delayMs, persist, writeRecovery],
  );

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  return {
    ...(conflict === undefined ? {} : { conflict }),
    ...(error === undefined ? {} : { error }),
    flush,
    note,
    state,
    update,
  };
}
