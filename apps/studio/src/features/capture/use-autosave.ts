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
  flush(): Promise<boolean>;
  note: StudioNote;
  retry(): Promise<boolean>;
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
  const failedRevision = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | undefined>(undefined);
  const stopped = useRef(false);
  const saveRef = useRef(save);
  const writeRecoveryRef = useRef(writeRecovery);
  const removeRecoveryRef = useRef(removeRecovery);
  saveRef.current = save;
  writeRecoveryRef.current = writeRecovery;
  removeRecoveryRef.current = removeRecovery;

  const persist = useCallback(async (): Promise<boolean> => {
    if (
      stopped.current ||
      savedRevision.current === editRevision.current ||
      failedRevision.current === editRevision.current
    ) {
      return !stopped.current && failedRevision.current !== editRevision.current;
    }
    if (inFlight.current !== undefined) {
      await inFlight.current;
      if (!stopped.current && savedRevision.current !== editRevision.current) {
        return persist();
      }
      return !stopped.current;
    }

    const revision = editRevision.current;
    const value = latest.current;
    setState('saving');
    const operation = (async (): Promise<boolean> => {
      try {
        const result = await saveRef.current(value, durableHash.current);
        durableHash.current = result.hash;
        savedRevision.current = revision;
        failedRevision.current = undefined;
        if (savedRevision.current === editRevision.current) {
          removeRecoveryRef.current();
          setState('saved');
        } else {
          writeRecoveryRef.current(latest.current, durableHash.current);
          setState('dirty');
        }
        return true;
      } catch (reason) {
        stopped.current = reason instanceof StudioSaveConflictError;
        if (reason instanceof StudioSaveConflictError) {
          setConflict(reason);
          setState('conflict');
        } else {
          failedRevision.current = revision;
          setError(reason instanceof Error ? reason : new Error('The note could not be saved.'));
          setState('error');
        }
        return false;
      }
    })();
    inFlight.current = operation;
    const succeeded = await operation;
    if (inFlight.current === operation) inFlight.current = undefined;
    if (!stopped.current && savedRevision.current !== editRevision.current) {
      return persist();
    }
    return succeeded;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    return persist();
  }, [persist]);

  const update = useCallback(
    (next: StudioNote): void => {
      if (stopped.current) return;
      latest.current = next;
      setNote(next);
      editRevision.current += 1;
      writeRecoveryRef.current(next, durableHash.current);
      setError(undefined);
      setState('dirty');
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void persist();
      }, delayMs);
    },
    [delayMs, persist],
  );

  const retry = useCallback(async (): Promise<boolean> => {
    failedRevision.current = undefined;
    setError(undefined);
    return persist();
  }, [persist]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return {
    ...(conflict === undefined ? {} : { conflict }),
    ...(error === undefined ? {} : { error }),
    flush,
    note,
    retry,
    state,
    update,
  };
}
