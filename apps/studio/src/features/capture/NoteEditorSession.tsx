import {
  StudioSaveConflictError,
  type DraftRecoveryRecord,
  type SavedNote,
  type StudioService,
} from '@studio/application';
import { createNoteId, parseNote, suggestFilename } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import { CardEditor, type RecoveryDraftView } from '@studio/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserDraftRecovery } from './browser-draft-recovery';
import { useAutosave } from './use-autosave';

export interface NoteEditorSessionProps {
  initial: SavedNote;
  onClose: () => void;
  requestClose: number;
  service: StudioService;
  studioId: string;
}

export function NoteEditorSession({
  initial,
  onClose,
  requestClose,
  service,
  studioId,
}: NoteEditorSessionProps) {
  const recovery = useMemo(browserDraftRecovery, []);
  const [version, setVersion] = useState(initial);
  const [restored, setRestored] = useState<SavedNote>();

  async function beginManualMerge(local: StudioNote): Promise<void> {
    const remote = await service.load(version.path);
    const merged = {
      ...remote,
      note: { ...remote.note, body: `${local.body}\n\n---\n\n${remote.note.body}` },
    };
    recovery.write(recoveryRecord(studioId, remote.path, merged.note, remote.hash));
    setVersion(remote);
    setRestored(merged);
  }

  return (
    <AutosaveEditor
      initial={version}
      key={`${version.hash}:${restored?.note.body ?? ''}`}
      onClose={onClose}
      onManualMerge={beginManualMerge}
      recovery={recovery}
      requestClose={requestClose}
      {...(restored === undefined ? {} : { restored })}
      service={service}
      studioId={studioId}
    />
  );
}

function AutosaveEditor({
  initial,
  onClose,
  onManualMerge,
  recovery,
  requestClose,
  restored,
  service,
  studioId,
}: {
  initial: SavedNote;
  onClose: () => void;
  onManualMerge: (local: StudioNote) => Promise<void>;
  recovery: ReturnType<typeof browserDraftRecovery>;
  requestClose: number;
  restored?: SavedNote;
  service: StudioService;
  studioId: string;
}) {
  const pending = recovery.readForDurable(studioId, initial.path, initial.hash);
  const staleLocal = pending.kind === 'stale'
    ? noteFromDraft(initial.note, pending.draft)
    : undefined;
  const [recoveryConflict, setRecoveryConflict] = useState<StudioNote | undefined>(
    staleLocal,
  );
  const [recoveryView, setRecoveryView] = useState<RecoveryDraftView | undefined>(
    pending.kind === 'recoverable'
      ? {
          body: pending.draft.body,
          ...(pending.draft.title === undefined ? {} : { title: pending.draft.title }),
        }
      : undefined,
  );
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(!recovery.available);
  const [actionState, setActionState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [actionError, setActionError] = useState<string>();
  const [closeError, setCloseError] = useState<string>();
  const autosave = useAutosave({
    initial: restored ?? initial,
    save: (note, expectedHash) => service.save({ note, path: initial.path, expectedHash }),
    writeRecovery: (note, expectedHash) => {
      if (!recovery.write(recoveryRecord(studioId, initial.path, note, expectedHash))) {
        setRecoveryUnavailable(true);
      }
    },
    removeRecovery: () => {
      if (!recovery.remove(studioId, initial.path)) setRecoveryUnavailable(true);
    },
  });
  const flush = autosave.flush;

  const close = useCallback(async (): Promise<void> => {
    setCloseError(undefined);
    if (await flush()) onClose();
    else setCloseError('The note could not be saved. Retry before closing the editor.');
  }, [flush, onClose]);

  useEffect(() => {
    if (requestClose > 0) void close();
  }, [close, requestClose]);

  const liveConflict = autosave.conflict;
  const conflictLocal = liveConflict?.attemptedNote ?? recoveryConflict;
  const conflictRemote = liveConflict === undefined
    ? initial.note
    : readableNote(liveConflict.durableText, initial.note);
  const saveError = closeError ?? autosave.error?.message;

  async function keepMine(): Promise<void> {
    if (conflictLocal === undefined || actionState === 'busy') return;
    setActionState('busy');
    setActionError(undefined);
    try {
      await saveUniqueSibling(service, initial.path, conflictLocal);
      recovery.remove(studioId, initial.path);
      onClose();
    } catch (reason) {
      setActionState('error');
      setActionError(
        reason instanceof Error
          ? `${reason.message} Your version is still preserved; try again.`
          : 'The sibling could not be saved. Your version is still preserved; try again.',
      );
    }
  }

  function keepOther(): void {
    if (actionState === 'busy') return;
    recovery.remove(studioId, initial.path);
    onClose();
  }

  async function mergeManually(): Promise<void> {
    if (conflictLocal === undefined || actionState === 'busy') return;
    setActionState('busy');
    setActionError(undefined);
    try {
      if (recoveryConflict !== undefined) {
        setRecoveryConflict(undefined);
        autosave.update({
          ...conflictRemote,
          body: `${recoveryConflict.body}\n\n---\n\n${conflictRemote.body}`,
        });
        setActionState('idle');
      } else {
        await onManualMerge(conflictLocal);
      }
    } catch (reason) {
      setActionState('error');
      setActionError(
        reason instanceof Error
          ? `${reason.message} Both versions are still preserved; try again.`
          : 'The merge could not begin. Both versions are still preserved; try again.',
      );
    }
  }

  return (
    <div className="note-editor-session">
      <button className="note-editor-session__close" onClick={() => void close()} type="button">
        Close editor
      </button>
      <CardEditor
        {...(conflictLocal === undefined
          ? {}
          : { conflict: { local: conflictLocal, remote: conflictRemote } })}
        {...(actionError === undefined ? {} : { conflictActionError: actionError })}
        conflictActionState={actionState}
        note={conflictLocal ?? autosave.note}
        onChange={autosave.update}
        onDiscardDraft={() => {
          recovery.remove(studioId, initial.path);
          setRecoveryView(undefined);
        }}
        onFlush={autosave.flush}
        onKeepMine={() => void keepMine()}
        onKeepOther={keepOther}
        onManualMerge={() => void mergeManually()}
        onRestoreDraft={() => {
          if (pending.kind !== 'recoverable') return;
          autosave.update(noteFromDraft(autosave.note, pending.draft));
          setRecoveryView(undefined);
        }}
        onRetrySave={() => void autosave.retry()}
        {...(recoveryView === undefined ? {} : { recoveryDraft: recoveryView })}
        recoveryUnavailable={recoveryUnavailable}
        {...(saveError === undefined ? {} : { saveError })}
        saveState={conflictLocal === undefined ? autosave.state : 'conflict'}
      />
    </div>
  );
}

function recoveryRecord(
  studioId: string,
  path: string,
  note: StudioNote,
  expectedHash: string,
): DraftRecoveryRecord {
  return {
    studioId,
    path,
    body: note.body,
    ...(note.title === undefined ? {} : { title: note.title }),
    expectedHash,
    updatedAt: new Date().toISOString(),
  };
}

function noteFromDraft(note: StudioNote, draft: DraftRecoveryRecord): StudioNote {
  const next = { ...note, body: draft.body };
  if (draft.title !== undefined) return { ...next, title: draft.title };
  delete next.title;
  return next;
}

function readableNote(markdown: string, fallback: StudioNote): StudioNote {
  const parsed = parseNote(markdown);
  return parsed.ok ? parsed.note : { ...fallback, body: markdown };
}

async function saveUniqueSibling(
  service: StudioService,
  originalPath: string,
  local: StudioNote,
): Promise<SavedNote> {
  const folder = originalPath.includes('/')
    ? originalPath.slice(0, originalPath.lastIndexOf('/') + 1)
    : '';
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sibling: StudioNote = { ...local, id: createNoteId() };
    const path = `${folder}${suggestFilename(sibling)}`;
    try {
      return await service.save({ note: sibling, path, expectedMissing: true });
    } catch (error) {
      lastError = error;
      if (!(error instanceof StudioSaveConflictError)) throw error;
    }
  }
  throw new Error('A unique sibling filename could not be created.', { cause: lastError });
}
